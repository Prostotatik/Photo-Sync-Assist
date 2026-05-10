from datetime import datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.db_models import Alert, AlertThreshold
from services.sse_manager import sse_manager

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

DEFAULT_THRESHOLDS = [
    {"sensor": "temperature", "direction": "high", "warning_value": 32.0, "critical_value": 35.0},
    {"sensor": "temperature", "direction": "low",  "warning_value": 15.0, "critical_value": None},
    {"sensor": "humidity",    "direction": "high", "warning_value": 85.0, "critical_value": 90.0},
    {"sensor": "soil_moisture", "direction": "low", "warning_value": 25.0, "critical_value": 15.0},
    {"sensor": "ph",          "direction": "high", "warning_value": 7.5,  "critical_value": None},
    {"sensor": "ph",          "direction": "low",  "warning_value": 5.5,  "critical_value": None},
]


class AlertCreate(BaseModel):
    sensor: str
    condition: str
    value: float
    severity: str = "Warning"
    message: str = ""
    farm_id: str = "RACK_ALPHA"
    rule_id: int | None = None


class ThresholdUpdate(BaseModel):
    sensor: str
    direction: str
    warning_value: float | None = None
    critical_value: float | None = None
    warning_enabled: bool = True
    critical_enabled: bool = True
    farm_id: str = "RACK_ALPHA"


@router.get("/")
async def list_alerts(
    farm_id: str = "RACK_ALPHA",
    severity: str | None = None,
    sensor: str | None = None,
    status: str | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert).where(Alert.farm_id == farm_id)
    if severity:
        q = q.where(Alert.severity == severity)
    if sensor:
        q = q.where(Alert.sensor == sensor)
    if status:
        q = q.where(Alert.status == status)
    q = q.order_by(desc(Alert.timestamp)).limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()
    return [_alert_dict(r) for r in rows]


@router.get("/active")
async def active_alerts(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Alert)
        .where(Alert.farm_id == farm_id, Alert.status == "Active")
        .order_by(desc(Alert.timestamp))
        .limit(20)
    )).scalars().all()
    return [_alert_dict(r) for r in rows]


@router.post("/")
async def create_alert(body: AlertCreate, db: AsyncSession = Depends(get_db)):
    alert = Alert(**body.model_dump())
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    await sse_manager.broadcast({"type": "alert", **_alert_dict(alert)})
    return _alert_dict(alert)


@router.put("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    alert = await db.get(Alert, alert_id)
    if alert:
        alert.status = "Acknowledged"
        await db.commit()
    return {"acknowledged": alert_id}


@router.post("/acknowledge-all")
async def acknowledge_all(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Alert)
        .where(Alert.farm_id == farm_id, Alert.status == "Active")
        .values(status="Acknowledged")
    )
    await db.commit()
    return {"acknowledged": "all"}


# --- Thresholds ---

@router.get("/thresholds")
async def get_thresholds(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(AlertThreshold).where(AlertThreshold.farm_id == farm_id)
    )).scalars().all()

    if not rows:
        # Seed defaults
        defaults = []
        for d in DEFAULT_THRESHOLDS:
            t = AlertThreshold(farm_id=farm_id, **d)
            db.add(t)
            defaults.append(t)
        await db.commit()
        return [_thresh_dict(t) for t in defaults]

    return [_thresh_dict(r) for r in rows]


@router.put("/thresholds")
async def update_threshold(body: ThresholdUpdate, db: AsyncSession = Depends(get_db)):
    row = await db.scalar(
        select(AlertThreshold).where(
            AlertThreshold.farm_id == body.farm_id,
            AlertThreshold.sensor == body.sensor,
            AlertThreshold.direction == body.direction,
        )
    )
    if not row:
        row = AlertThreshold(farm_id=body.farm_id, sensor=body.sensor, direction=body.direction)
        db.add(row)

    row.warning_value = body.warning_value
    row.critical_value = body.critical_value
    row.warning_enabled = body.warning_enabled
    row.critical_enabled = body.critical_enabled
    await db.commit()
    return _thresh_dict(row)


def _alert_dict(a: Alert) -> dict:
    return {
        "id": a.id,
        "timestamp": a.timestamp.isoformat(),
        "sensor": a.sensor,
        "condition": a.condition,
        "value": a.value,
        "severity": a.severity,
        "status": a.status,
        "message": a.message,
        "farm_id": a.farm_id,
    }


def _thresh_dict(t: AlertThreshold) -> dict:
    return {
        "id": t.id,
        "sensor": t.sensor,
        "direction": t.direction,
        "warning_value": t.warning_value,
        "critical_value": t.critical_value,
        "warning_enabled": t.warning_enabled,
        "critical_enabled": t.critical_enabled,
    }
