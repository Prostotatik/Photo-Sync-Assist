from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.db_models import CropConfig
from ml.crop_params import CROP_PARAMS

router = APIRouter(prefix="/api/crops", tags=["crops"])


class CropUpdate(BaseModel):
    crop_type: str
    sowing_date: str | None = None    # ISO date string
    harvest_date: str | None = None
    sunlight_hours: float = 7.0
    water_mm: float = 150.0
    farm_id: str = "RACK_ALPHA"


@router.get("/active")
async def get_active_crop(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    row = await db.scalar(
        select(CropConfig)
        .where(CropConfig.farm_id == farm_id, CropConfig.is_active == True)
        .limit(1)
    )
    if not row:
        return {"crop_type": "Wheat", "farm_id": farm_id, "sowing_date": None, "harvest_date": None}
    return _crop_dict(row)


@router.put("/active")
async def set_active_crop(body: CropUpdate, db: AsyncSession = Depends(get_db)):
    # deactivate current
    current = await db.scalar(
        select(CropConfig).where(CropConfig.farm_id == body.farm_id, CropConfig.is_active == True)
    )
    if current:
        current.is_active = False

    sowing = datetime.fromisoformat(body.sowing_date) if body.sowing_date else None
    harvest = datetime.fromisoformat(body.harvest_date) if body.harvest_date else None

    new = CropConfig(
        farm_id=body.farm_id,
        crop_type=body.crop_type,
        sowing_date=sowing,
        harvest_date=harvest,
        sunlight_hours=body.sunlight_hours,
        water_mm=body.water_mm,
        is_active=True,
    )
    db.add(new)
    await db.commit()
    await db.refresh(new)
    return _crop_dict(new)


@router.get("/params")
async def all_crop_params():
    """Return optimal ranges for all crops (for UI crop cards)."""
    return {
        crop: {
            "temperature_range": [p["temperature_c"]["min"], p["temperature_c"]["max"]],
            "humidity_range": [p["humidity_pct"]["min"], p["humidity_pct"]["max"]],
            "soil_moisture_range": [p["soil_moisture_pct"]["min"], p["soil_moisture_pct"]["max"]],
            "ph_range": [p["ph_level"]["min"], p["ph_level"]["max"]],
            "sunlight_range": [p["sunlight_hours"]["min"], p["sunlight_hours"]["max"]],
            "ideal": {
                "temperature": [p["temperature_c"]["ideal_min"], p["temperature_c"]["ideal_max"]],
                "humidity": [p["humidity_pct"]["ideal_min"], p["humidity_pct"]["ideal_max"]],
                "soil_moisture": [p["soil_moisture_pct"]["ideal_min"], p["soil_moisture_pct"]["ideal_max"]],
                "ph": [p["ph_level"]["ideal_min"], p["ph_level"]["ideal_max"]],
                "sunlight": [p["sunlight_hours"]["ideal_min"], p["sunlight_hours"]["ideal_max"]],
                "light": [p["light_pct"]["ideal_min"], p["light_pct"]["ideal_max"]],
            },
            "avg_yield": p["avg_yield"],
            "top25_yield": p["top25_yield"],
            "total_days_avg": p["total_days_avg"],
        }
        for crop, p in CROP_PARAMS.items()
    }


def _crop_dict(c: CropConfig) -> dict:
    sowing = c.sowing_date
    harvest = c.harvest_date
    today = datetime.utcnow()
    total_days = (harvest - sowing).days if sowing and harvest else CROP_PARAMS.get(c.crop_type, {}).get("total_days_avg", 120)
    elapsed = (today - sowing).days if sowing else 0
    remaining = max(0, total_days - elapsed)

    return {
        "id": c.id,
        "farm_id": c.farm_id,
        "crop_type": c.crop_type,
        "sowing_date": sowing.isoformat() if sowing else None,
        "harvest_date": harvest.isoformat() if harvest else None,
        "sunlight_hours": c.sunlight_hours,
        "water_mm": c.water_mm,
        "total_days": total_days,
        "elapsed_days": max(0, elapsed),
        "remaining_days": remaining,
        "progress_pct": round(100 * min(elapsed, total_days) / total_days, 1) if total_days else 0,
    }
