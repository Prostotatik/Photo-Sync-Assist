"""
Background task: checks latest reading against automation rules every 30s.
Creates alerts, triggers irrigation, and manages light / pH / temperature adjustments.
Smart rules fire every 3 min max (COOLDOWN_SEC) and push deltas to mock_adjustments so
mock sensor values react to automation actions in real time.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models.db_models import AutomationRule, SensorReading, CropConfig, Alert, IrrigationEvent, AutomationEvent
from services.sse_manager import sse_manager

logger = logging.getLogger("automation")

SENSOR_MAP = {
    "temperature": "temperature_c",
    "humidity": "humidity_pct",
    "soil_moisture": "soil_moisture_pct",
    "ph": "ph_level",
}

OPS = {
    "<": lambda a, b: a < b,
    ">": lambda a, b: a > b,
    "<=": lambda a, b: a <= b,
    ">=": lambda a, b: a >= b,
    "==": lambda a, b: abs(a - b) < 0.01,
}

# Cooldown tracking: key = "{farm_id}:{event_type}", value = last triggered datetime
_last_event: dict[str, datetime] = {}
COOLDOWN_SEC = 3 * 60  # 3 minutes cooldown to avoid repeating the same event


async def _log_automation_event(db, farm_id: str, event_type: str, trigger_values: dict, reason: str):
    ev = AutomationEvent(
        farm_id=farm_id,
        event_type=event_type,
        trigger_values=json.dumps(trigger_values),
        reason=reason,
    )
    db.add(ev)


async def _check_rules():
    async with AsyncSessionLocal() as db:
        reading = await db.scalar(
            select(SensorReading).order_by(desc(SensorReading.timestamp)).limit(1)
        )
        if not reading:
            return

        rules = (await db.execute(
            select(AutomationRule).where(AutomationRule.enabled == True)
        )).scalars().all()

        for rule in rules:
            field = SENSOR_MAP.get(rule.sensor)
            if not field:
                continue
            value = getattr(reading, field, None)
            if value is None:
                continue

            op_fn = OPS.get(rule.operator)
            if not op_fn or not op_fn(value, rule.threshold):
                continue

            # Cooldown check
            if rule.last_triggered:
                cooldown_end = rule.last_triggered + timedelta(minutes=rule.cooldown_minutes)
                if datetime.utcnow() < cooldown_end:
                    continue

            rule.last_triggered = datetime.utcnow()

            msg = f"{rule.sensor} is {rule.operator} {rule.threshold} (current: {value:.2f})"
            severity = "Critical" if rule.action == "Irrigate" else "Warning"

            alert = Alert(
                sensor=rule.sensor,
                condition=f"{rule.sensor} {rule.operator} {rule.threshold}",
                value=value,
                severity=severity,
                message=msg,
                farm_id=reading.farm_id,
                rule_id=rule.id,
            )
            db.add(alert)

            if rule.action == "Irrigate":
                irr = IrrigationEvent(
                    duration_minutes=rule.action_value,
                    trigger="AutoRule",
                    sm_before=reading.soil_moisture_pct,
                    farm_id=reading.farm_id,
                )
                db.add(irr)
                await _log_automation_event(
                    db, reading.farm_id, "irrigation_triggered",
                    {"soil_moisture_pct": reading.soil_moisture_pct, "rule": rule.name},
                    f"Auto-rule '{rule.name}' triggered irrigation for {rule.action_value:.0f} min",
                )
                await sse_manager.broadcast({"type": "irrigation_start", "duration_minutes": rule.action_value, "trigger": "AutoRule"})

            await db.commit()
            await sse_manager.broadcast({
                "type": "alert",
                "sensor": rule.sensor,
                "severity": severity,
                "message": msg,
                "value": value,
            })
            logger.info(f"Rule triggered: {rule.name} — {msg}")


async def _check_smart_rules():
    """Per-crop smart rules using CROP_PARAMS ideal ranges with 15% margin."""
    from services.mock_adjustments import apply_adjustment
    from ml.crop_params import CROP_PARAMS

    async with AsyncSessionLocal() as db:
        # Get all distinct farm_ids that have readings
        farm_ids = (await db.execute(
            select(SensorReading.farm_id).distinct()
        )).scalars().all()

        for fid in farm_ids:
            reading = await db.scalar(
                select(SensorReading)
                .where(SensorReading.farm_id == fid)
                .order_by(desc(SensorReading.timestamp))
                .limit(1)
            )
            if not reading:
                continue

            crop_row = await db.scalar(
                select(CropConfig)
                .where(CropConfig.farm_id == fid, CropConfig.is_active == True)
                .limit(1)
            )
            crop_type = crop_row.crop_type if crop_row else "Wheat"
            params = CROP_PARAMS.get(crop_type, CROP_PARAMS["Wheat"])

            now = datetime.utcnow()
            committed = False

            def _ok(key: str) -> bool:
                last = _last_event.get(key)
                return last is None or (now - last).total_seconds() >= COOLDOWN_SEC

            def _margin(p: dict) -> float:
                return (p["ideal_max"] - p["ideal_min"]) * 0.15

            async def _fire(sensor_name: str, value: float, msg: str, event_type: str, severity: str = "Warning"):
                alert = Alert(
                    sensor=sensor_name, condition=msg, value=value,
                    severity=severity, message=msg, farm_id=fid,
                )
                db.add(alert)
                await _log_automation_event(db, fid, event_type, {sensor_name: value}, msg)
                await sse_manager.broadcast({
                    "type": "alert", "sensor": sensor_name,
                    "severity": severity, "message": msg, "value": value,
                })
                logger.info(f"Smart rule [{fid}] {event_type}: {msg}")

            def _mid(p: dict) -> float:
                return (p["ideal_min"] + p["ideal_max"]) / 2

            # ── Temperature ───────────────────────────────────────────────────
            temp = reading.temperature_c
            p = params["temperature_c"]
            m = _margin(p)
            if temp is not None:
                if temp < p["ideal_min"] - m:
                    key = f"{fid}:temperature_increased"
                    if _ok(key):
                        _last_event[key] = now
                        delta = round(_mid(p) - temp, 2)
                        await _fire("temperature", temp,
                            f"Temperature {temp:.1f}°C critically low for {crop_type} — heating activated (+{delta:.1f}°C)",
                            "temperature_increased", "Critical")
                        apply_adjustment(fid, "temperature_c", delta)
                        committed = True
                elif temp > p["ideal_max"] + m:
                    key = f"{fid}:temperature_decreased"
                    if _ok(key):
                        _last_event[key] = now
                        delta = round(_mid(p) - temp, 2)
                        await _fire("temperature", temp,
                            f"Temperature {temp:.1f}°C critically high for {crop_type} — cooling activated ({delta:.1f}°C)",
                            "temperature_decreased", "Critical")
                        apply_adjustment(fid, "temperature_c", delta)
                        committed = True

            # ── Humidity ──────────────────────────────────────────────────────
            hum = reading.humidity_pct
            p = params["humidity_pct"]
            m = _margin(p)
            if hum is not None:
                if hum > p["ideal_max"] + m:
                    key = f"{fid}:humidity_high"
                    if _ok(key):
                        _last_event[key] = now
                        delta = round(_mid(p) - hum, 2)
                        await _fire("humidity", hum,
                            f"Humidity {hum:.1f}% critically high for {crop_type} — ventilation activated ({delta:.1f}%)",
                            "humidity_high", "Warning")
                        apply_adjustment(fid, "humidity_pct", delta)
                        committed = True
                elif hum < p["ideal_min"] - m:
                    key = f"{fid}:humidity_low"
                    if _ok(key):
                        _last_event[key] = now
                        delta = round(_mid(p) - hum, 2)
                        await _fire("humidity", hum,
                            f"Humidity {hum:.1f}% critically low for {crop_type} — humidification activated (+{delta:.1f}%)",
                            "humidity_low", "Warning")
                        apply_adjustment(fid, "humidity_pct", delta)
                        committed = True

            # ── Soil Moisture / Irrigation ────────────────────────────────────
            sm = reading.soil_moisture_pct
            ph = reading.ph_level
            sm_p = params["soil_moisture_pct"]
            sm_m = _margin(sm_p)
            ph_p = params["ph_level"]
            ph_m = _margin(ph_p)
            ph_ok = ph is None or (ph >= ph_p["ideal_min"] - ph_m and ph <= ph_p["ideal_max"] + ph_m)

            if sm is not None and sm < sm_p["ideal_min"]:
                severity = "Critical" if sm < sm_p["ideal_min"] - sm_m else "Warning"
                key = f"{fid}:soil_moisture_low"
                if _ok(key):
                    _last_event[key] = now
                    delta = round(_mid(sm_p) - sm, 2)
                    if not ph_ok:
                        await _fire("soil_moisture", sm,
                            f"Soil moisture {sm:.1f}% below optimal for {crop_type} — irrigation skipped (pH {ph:.2f} out of safe range)",
                            "soil_moisture_low", severity)
                        committed = True
                    else:
                        irr_mins = round(delta * 0.8, 1)
                        await _fire("soil_moisture", sm,
                            f"Soil moisture {sm:.1f}% below optimal for {crop_type} — auto-irrigation triggered (+{delta:.1f}%, {irr_mins:.0f} min)",
                            "soil_moisture_low", severity)
                        irr = IrrigationEvent(duration_minutes=irr_mins, trigger="Smart", sm_before=sm, farm_id=fid)
                        db.add(irr)
                        await _log_automation_event(db, fid, "irrigation_triggered",
                            {"soil_moisture_pct": sm},
                            f"Soil {sm:.1f}% below optimal — auto-irrigation started ({irr_mins:.0f} min)")
                        apply_adjustment(fid, "soil_moisture_pct", delta)
                        await sse_manager.broadcast({"type": "irrigation_start", "duration_minutes": irr_mins, "trigger": "Smart"})
                        committed = True

            # ── pH ────────────────────────────────────────────────────────────
            if ph is not None:
                p = params["ph_level"]
                m = _margin(p)
                if ph < p["ideal_min"] - m:
                    key = f"{fid}:ph_adjusted_up"
                    if _ok(key):
                        _last_event[key] = now
                        delta = round(_mid(p) - ph, 2)
                        await _fire("ph", ph,
                            f"pH {ph:.2f} critically low for {crop_type} — dosing pH+ solution (+{delta:.2f})",
                            "ph_adjusted_up", "Critical")
                        apply_adjustment(fid, "ph_level", delta)
                        committed = True
                elif ph > p["ideal_max"] + m:
                    key = f"{fid}:ph_adjusted_down"
                    if _ok(key):
                        _last_event[key] = now
                        delta = round(_mid(p) - ph, 2)
                        await _fire("ph", ph,
                            f"pH {ph:.2f} critically high for {crop_type} — dosing pH− solution ({delta:.2f})",
                            "ph_adjusted_down", "Critical")
                        apply_adjustment(fid, "ph_level", delta)
                        committed = True

            # ── Light ─────────────────────────────────────────────────────────
            lp = reading.light_pct
            lp_p = params.get("light_pct")
            if lp is not None and lp_p:
                lp_m = _margin(lp_p)
                key = f"{fid}:light_increased"
                if lp < lp_p["ideal_min"] - lp_m and _ok(key):
                    _last_event[key] = now
                    delta = round(_mid(lp_p) - lp, 2)
                    await _fire("light", lp,
                        f"Light {lp:.1f}% critically low for {crop_type} — grow lights boosted (+{delta:.1f}%)",
                        "light_increased", "Warning")
                    apply_adjustment(fid, "light_pct", delta)
                    committed = True

                key = f"{fid}:light_decreased"
                if lp > lp_p["ideal_max"] + lp_m and _ok(key):
                    _last_event[key] = now
                    delta = round(_mid(lp_p) - lp, 2)
                    await _fire("light", lp,
                        f"Light {lp:.1f}% critically high for {crop_type} — grow lights dimmed ({delta:.1f}%)",
                        "light_decreased", "Warning")
                    apply_adjustment(fid, "light_pct", delta)
                    committed = True

            if committed:
                await db.commit()


async def run_automation_loop():
    while True:
        try:
            await _check_rules()
            await _check_smart_rules()
        except Exception as e:
            logger.error(f"Automation error: {e}")
        await asyncio.sleep(30)
