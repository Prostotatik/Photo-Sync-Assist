import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.db_models import Rack, SensorReading, CropConfig, Alert
from ml.health_score import compute_health_score
from ml.crop_params import CROP_PARAMS

router = APIRouter(prefix="/api/racks", tags=["racks"])

CROP_ICONS = {
    "Wheat": "🌾", "Soybean": "🌿", "Maize": "🌽",
    "Cotton": "🪴", "Rice": "🌾",
}


class RackIn(BaseModel):
    name: str
    rack_size: int = 3
    location: str = ""
    description: str = ""
    crop_type: str = "Wheat"

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()

    @field_validator("rack_size")
    @classmethod
    def size_range(cls, v: int) -> int:
        if not (1 <= v <= 50):
            raise ValueError("rack_size must be 1-50")
        return v


class RackUpdate(BaseModel):
    name: str | None = None
    rack_size: int | None = None
    location: str | None = None
    description: str | None = None
    is_active: bool | None = None


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name).upper().strip("_")
    return slug[:40]


def _rack_dict(r: Rack) -> dict:
    return {
        "id": r.id,
        "farm_id": r.farm_id,
        "name": r.name,
        "rack_size": r.rack_size,
        "location": r.location,
        "description": r.description,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat(),
    }


@router.get("")
async def list_racks(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Rack).order_by(Rack.created_at))).scalars().all()
    return [_rack_dict(r) for r in rows]


@router.post("")
async def create_rack(body: RackIn, db: AsyncSession = Depends(get_db)):
    base_slug = _slug(body.name)
    slug = base_slug
    # ensure uniqueness
    existing = await db.scalar(select(Rack).where(Rack.farm_id == slug))
    counter = 1
    while existing:
        slug = f"{base_slug}_{counter}"
        existing = await db.scalar(select(Rack).where(Rack.farm_id == slug))
        counter += 1

    rack = Rack(
        farm_id=slug,
        name=body.name,
        rack_size=body.rack_size,
        location=body.location,
        description=body.description,
    )
    db.add(rack)

    # Create default crop config for the new rack
    from models.db_models import CropConfig, AlertThreshold
    from routers.alerts import DEFAULT_THRESHOLDS

    crop = CropConfig(
        farm_id=slug,
        crop_type=body.crop_type,
        sowing_date=datetime.utcnow(),
        sunlight_hours=7.0,
        water_mm=150.0,
        is_active=True,
    )
    db.add(crop)

    for t in DEFAULT_THRESHOLDS:
        db.add(AlertThreshold(farm_id=slug, **t))

    await db.commit()
    await db.refresh(rack)
    return _rack_dict(rack)


@router.get("/overview")
async def rack_overview(db: AsyncSession = Depends(get_db)):
    """Return compact status for every rack — used by Dashboard grid."""
    racks = (await db.execute(select(Rack).order_by(Rack.created_at))).scalars().all()
    if not racks:
        return []

    farm_ids = [r.farm_id for r in racks]

    # Latest reading per rack (single query via subquery join)
    latest_ts_subq = (
        select(SensorReading.farm_id, func.max(SensorReading.timestamp).label("max_ts"))
        .where(SensorReading.farm_id.in_(farm_ids))
        .group_by(SensorReading.farm_id)
        .subquery()
    )
    readings_rows = (await db.execute(
        select(SensorReading).join(
            latest_ts_subq,
            (SensorReading.farm_id == latest_ts_subq.c.farm_id) &
            (SensorReading.timestamp == latest_ts_subq.c.max_ts),
        )
    )).scalars().all()
    readings_by_fid = {r.farm_id: r for r in readings_rows}

    # Active crops for all racks
    crops_rows = (await db.execute(
        select(CropConfig)
        .where(CropConfig.farm_id.in_(farm_ids), CropConfig.is_active == True)
    )).scalars().all()
    crops_by_fid = {c.farm_id: c for c in crops_rows}

    # Alert counts for all racks
    alert_counts_rows = (await db.execute(
        select(Alert.farm_id, func.count().label("cnt"))
        .where(Alert.farm_id.in_(farm_ids), Alert.status == "Active")
        .group_by(Alert.farm_id)
    )).all()
    alert_counts = {row.farm_id: row.cnt for row in alert_counts_rows}

    result = []
    for rack in racks:
        fid = rack.farm_id
        reading = readings_by_fid.get(fid)
        crop_row = crops_by_fid.get(fid)
        crop_type = crop_row.crop_type if crop_row else "Wheat"

        if reading:
            hs = compute_health_score(
                crop_type=crop_type,
                temperature_c=reading.temperature_c,
                humidity_pct=reading.humidity_pct,
                soil_moisture_pct=reading.soil_moisture_pct,
                ph_level=reading.ph_level,
            )
            health = hs["score"]
        else:
            health = None

        result.append({
            "farm_id": fid,
            "name": rack.name,
            "rack_size": rack.rack_size,
            "location": rack.location,
            "is_active": rack.is_active,
            "crop_type": crop_type,
            "crop_icon": CROP_ICONS.get(crop_type, "🌱"),
            "health_score": health,
            "alert_count": alert_counts.get(fid, 0),
            "last_reading": {
                "timestamp": reading.timestamp.isoformat(),
                "temperature_c": reading.temperature_c,
                "humidity_pct": reading.humidity_pct,
                "soil_moisture_pct": reading.soil_moisture_pct,
                "ph_level": reading.ph_level,
            } if reading else None,
        })

    return result


@router.put("/{farm_id}")
async def update_rack(farm_id: str, body: RackUpdate, db: AsyncSession = Depends(get_db)):
    rack = await db.scalar(select(Rack).where(Rack.farm_id == farm_id))
    if not rack:
        raise HTTPException(status_code=404, detail="Rack not found")

    if body.name is not None:
        rack.name = body.name.strip()
    if body.rack_size is not None:
        rack.rack_size = body.rack_size
    if body.location is not None:
        rack.location = body.location
    if body.description is not None:
        rack.description = body.description
    if body.is_active is not None:
        rack.is_active = body.is_active

    await db.commit()
    await db.refresh(rack)
    return _rack_dict(rack)


@router.delete("/{farm_id}")
async def delete_rack(farm_id: str, db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count()).select_from(Rack))
    if total <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last rack")

    rack = await db.scalar(select(Rack).where(Rack.farm_id == farm_id))
    if not rack:
        raise HTTPException(status_code=404, detail="Rack not found")

    await db.delete(rack)
    await db.commit()
    return {"deleted": farm_id}
