from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.db_models import AutomationRule, IrrigationEvent, SensorReading, AutomationEvent
from services.sse_manager import sse_manager

router = APIRouter(prefix="/api/automation", tags=["automation"])

# In-memory irrigation state
_irrigation_state: dict = {"running": False, "started_at": None, "duration_minutes": 0, "trigger": "Manual"}


class RuleCreate(BaseModel):
    name: str
    sensor: str
    operator: str
    threshold: float
    action: str = "Alert"
    action_value: float = 10.0
    cooldown_minutes: int = 30
    farm_id: str = "RACK_ALPHA"


class RuleUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    threshold: float | None = None
    action_value: float | None = None
    cooldown_minutes: int | None = None


class IrrigateRequest(BaseModel):
    duration_minutes: float = 10.0
    trigger: str = "Manual"
    farm_id: str = "RACK_ALPHA"


class IrrigationSchedule(BaseModel):
    times: list[str]         # ["07:00", "19:00"]
    duration_minutes: float
    days: list[str]          # ["Mon", "Tue", ...]
    farm_id: str = "RACK_ALPHA"


@router.get("/rules")
async def list_rules(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(AutomationRule).where(AutomationRule.farm_id == farm_id).order_by(AutomationRule.id)
    )).scalars().all()
    return [_rule_dict(r) for r in rows]


@router.post("/rules")
async def create_rule(body: RuleCreate, db: AsyncSession = Depends(get_db)):
    rule = AutomationRule(**body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_dict(rule)


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: int, body: RuleUpdate, db: AsyncSession = Depends(get_db)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(rule, k, v)
    await db.commit()
    return _rule_dict(rule)


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"deleted": rule_id}


@router.post("/irrigate")
async def start_irrigation(req: IrrigateRequest, db: AsyncSession = Depends(get_db)):
    reading = await db.scalar(
        select(SensorReading)
        .where(SensorReading.farm_id == req.farm_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    sm_before = reading.soil_moisture_pct if reading else None

    event = IrrigationEvent(
        duration_minutes=req.duration_minutes,
        trigger=req.trigger,
        sm_before=sm_before,
        farm_id=req.farm_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    _irrigation_state.update({
        "running": True,
        "started_at": event.started_at.isoformat(),
        "duration_minutes": req.duration_minutes,
        "trigger": req.trigger,
    })

    await sse_manager.broadcast({"type": "irrigation_start", "duration_minutes": req.duration_minutes})

    return {"status": "started", "event_id": event.id, "duration_minutes": req.duration_minutes}


@router.post("/irrigate/stop")
async def stop_irrigation():
    _irrigation_state["running"] = False
    await sse_manager.broadcast({"type": "irrigation_stop"})
    return {"status": "stopped"}


@router.get("/irrigate/status")
async def irrigation_status():
    return _irrigation_state


@router.get("/irrigation-history")
async def irrigation_history(farm_id: str = "RACK_ALPHA", limit: int = 30, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(IrrigationEvent)
        .where(IrrigationEvent.farm_id == farm_id)
        .order_by(desc(IrrigationEvent.started_at))
        .limit(limit)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "started_at": r.started_at.isoformat(),
            "duration_minutes": r.duration_minutes,
            "trigger": r.trigger,
            "sm_before": r.sm_before,
            "sm_after": r.sm_after,
        }
        for r in rows
    ]


@router.get("/events")
async def list_events(farm_id: str = "RACK_ALPHA", limit: int = 50, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(AutomationEvent)
        .where(AutomationEvent.farm_id == farm_id)
        .order_by(desc(AutomationEvent.timestamp))
        .limit(limit)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "farm_id": r.farm_id,
            "event_type": r.event_type,
            "timestamp": r.timestamp.isoformat(),
            "trigger_values": __import__("json").loads(r.trigger_values) if r.trigger_values else {},
            "reason": r.reason,
        }
        for r in rows
    ]


@router.get("/environmental-impact")
async def environmental_impact(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(AutomationEvent).where(AutomationEvent.farm_id == farm_id)
    )).scalars().all()

    triggered  = [r for r in rows if r.event_type == "irrigation_triggered"]
    skipped    = [r for r in rows if r.event_type == "irrigation_skipped"]
    light_evs  = [r for r in rows if r.event_type in ("light_increased", "light_decreased")]
    ph_evs     = [r for r in rows if r.event_type in ("ph_adjusted_up", "ph_adjusted_down")]
    temp_evs   = [r for r in rows if r.event_type in ("temperature_increased", "temperature_decreased")]

    avg_duration = 10.0
    water_used   = len(triggered) * avg_duration * 0.5
    water_saved  = len(skipped)   * avg_duration * 0.5
    energy_saved = len(light_evs) * 0.3 + len(temp_evs) * 0.5
    co2_saved    = water_saved * 0.001 + energy_saved * 0.4

    return {
        "irrigation_events_count":  len(triggered),
        "total_water_liters":       round(water_used, 2),
        "irrigation_skipped_count": len(skipped),
        "water_saved_liters":       round(water_saved, 2),
        "light_events_count":       len(light_evs),
        "ph_events_count":          len(ph_evs),
        "temp_events_count":        len(temp_evs),
        "energy_saved_kwh":         round(energy_saved, 2),
        "co2_saved_kg":             round(co2_saved, 3),
    }


def _rule_dict(r: AutomationRule) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "sensor": r.sensor,
        "operator": r.operator,
        "threshold": r.threshold,
        "action": r.action,
        "action_value": r.action_value,
        "enabled": r.enabled,
        "cooldown_minutes": r.cooldown_minutes,
        "last_triggered": r.last_triggered.isoformat() if r.last_triggered else None,
        "farm_id": r.farm_id,
    }
