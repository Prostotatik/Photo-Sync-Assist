from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models.db_models import SensorReading, CropConfig
from ml.predict import predict_yield, predict_disease, get_feature_importances, get_dataset_stats, predict_harvest_days
from ml.health_score import compute_health_score

router = APIRouter(prefix="/api/ml", tags=["ml"])


class PredictRequest(BaseModel):
    crop_type: str = "Wheat"
    soil_moisture: float = 30.0
    soil_ph: float = 6.5
    temperature: float = 24.0
    water_mm: float = 150.0
    humidity: float = 65.0
    sunlight_hours: float = 7.0
    total_days: int = 90


@router.post("/yield-predict")
async def yield_predict(req: PredictRequest):
    return predict_yield(
        crop_type=req.crop_type,
        soil_moisture=req.soil_moisture,
        soil_ph=req.soil_ph,
        temperature=req.temperature,
        water_mm=req.water_mm,
        humidity=req.humidity,
        sunlight_hours=req.sunlight_hours,
        total_days=req.total_days,
    )


@router.post("/disease-risk")
async def disease_risk(req: PredictRequest):
    return predict_disease(
        crop_type=req.crop_type,
        soil_moisture=req.soil_moisture,
        soil_ph=req.soil_ph,
        temperature=req.temperature,
        water_mm=req.water_mm,
        humidity=req.humidity,
        sunlight_hours=req.sunlight_hours,
        total_days=req.total_days,
    )


@router.get("/health-score")
async def health_score(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    reading = await db.scalar(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    crop_row = await db.scalar(
        select(CropConfig)
        .where(CropConfig.farm_id == farm_id, CropConfig.is_active == True)
        .limit(1)
    )
    crop_type = crop_row.crop_type if crop_row else "Wheat"

    if not reading:
        return compute_health_score(crop_type, 24.0, 65.0, 30.0, 6.8)

    return compute_health_score(
        crop_type=crop_type,
        temperature_c=reading.temperature_c,
        humidity_pct=reading.humidity_pct,
        soil_moisture_pct=reading.soil_moisture_pct,
        ph_level=reading.ph_level,
        light_pct=reading.light_pct,
    )


@router.get("/harvest-days")
async def harvest_days(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    """Predict total growing days from current sensor conditions using ML."""
    reading = await db.scalar(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    crop_row = await db.scalar(
        select(CropConfig)
        .where(CropConfig.farm_id == farm_id, CropConfig.is_active == True)
        .limit(1)
    )
    if not reading or not crop_row:
        from ml.crop_params import CROP_PARAMS
        crop_type = crop_row.crop_type if crop_row else "Wheat"
        days = CROP_PARAMS.get(crop_type, {}).get("total_days_avg", 120)
        return {"predicted_days": days, "days_mean": days, "days_min": None, "days_max": None}

    sunlight = (reading.light_pct / 100.0 * 12.0) if reading.light_pct is not None else crop_row.sunlight_hours

    return predict_harvest_days(
        crop_type=crop_row.crop_type,
        soil_moisture=reading.soil_moisture_pct,
        soil_ph=reading.ph_level,
        temperature=reading.temperature_c,
        water_mm=crop_row.water_mm,
        humidity=reading.humidity_pct,
        sunlight_hours=sunlight,
    )


@router.get("/feature-importance")
async def feature_importance():
    return get_feature_importances()


@router.get("/dataset-stats/{crop_type}")
async def dataset_stats(crop_type: str):
    return get_dataset_stats(crop_type)


@router.get("/recommendations")
async def get_recommendations(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    """Generate rule-based recommendations from current sensor readings + ML."""
    from ml.crop_params import CROP_PARAMS

    reading = await db.scalar(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    crop_row = await db.scalar(
        select(CropConfig)
        .where(CropConfig.farm_id == farm_id, CropConfig.is_active == True)
        .limit(1)
    )
    if not reading or not crop_row:
        return []

    crop = crop_row.crop_type
    params = CROP_PARAMS.get(crop, CROP_PARAMS["Wheat"])
    recs = []

    sm = reading.soil_moisture_pct
    sm_ideal = params["soil_moisture_pct"]
    if sm < sm_ideal["ideal_min"]:
        deficit = sm_ideal["ideal_min"] - sm
        recs.append({
            "priority": "HIGH",
            "title": f"Increase soil moisture to {sm_ideal['ideal_min']}–{sm_ideal['ideal_max']}%",
            "description": f"Current: {sm}% — below optimal peak for {crop}",
            "yield_impact_pct": round(deficit * 0.3, 1),
            "resource": f"~{int(deficit * 1.2)}L water",
            "duration_min": int(deficit * 0.8),
            "action": "irrigate",
            "action_value": int(deficit * 0.8),
        })

    temp = reading.temperature_c
    temp_ideal = params["temperature_c"]
    if temp > temp_ideal["ideal_max"]:
        recs.append({
            "priority": "MEDIUM",
            "title": f"Reduce temperature by {round(temp - temp_ideal['ideal_max'], 1)}°C",
            "description": "Slight upward trend — preemptive cooling improves yield",
            "yield_impact_pct": round((temp - temp_ideal["ideal_max"]) * 1.5, 1),
            "resource": "Energy cost",
            "duration_min": None,
            "action": "none",
            "action_value": None,
        })

    hum = reading.humidity_pct
    hum_ideal = params["humidity_pct"]
    if hum > hum_ideal["ideal_max"]:
        recs.append({
            "priority": "MEDIUM",
            "title": "Reduce humidity for disease prevention",
            "description": f"Humidity at {hum}% increases fungal risk",
            "yield_impact_pct": 2.5,
            "resource": "Ventilation energy",
            "duration_min": None,
            "action": "none",
            "action_value": None,
        })

    return recs
