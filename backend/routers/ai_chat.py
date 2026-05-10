import json
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.db_models import SensorReading, CropConfig, Alert, AutomationEvent, RackImage
from ml.health_score import compute_health_score
from ml.crop_params import CROP_PARAMS
from services.gemini_service import chat_stream

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    farm_id: str = "RACK_ALPHA"


@router.post("/chat")
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    reading = await db.scalar(
        select(SensorReading)
        .where(SensorReading.farm_id == req.farm_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    crop_row = await db.scalar(
        select(CropConfig)
        .where(CropConfig.farm_id == req.farm_id, CropConfig.is_active == True)
        .limit(1)
    )
    active_alerts = (await db.execute(
        select(Alert.message)
        .where(Alert.farm_id == req.farm_id, Alert.status == "Active")
        .order_by(desc(Alert.timestamp))
        .limit(5)
    )).scalars().all()

    recent_events = (await db.execute(
        select(AutomationEvent.event_type, AutomationEvent.reason, AutomationEvent.timestamp)
        .where(AutomationEvent.farm_id == req.farm_id)
        .order_by(desc(AutomationEvent.timestamp))
        .limit(8)
    )).all()

    rack_image_row = await db.scalar(
        select(RackImage).where(RackImage.farm_id == req.farm_id)
    )

    sensor_data = {}
    health_score = 75.0
    crop_type = crop_row.crop_type if crop_row else "Wheat"

    if reading:
        sensor_data = {
            "temperature_c": reading.temperature_c,
            "humidity_pct": reading.humidity_pct,
            "soil_moisture_pct": reading.soil_moisture_pct,
            "ph_level": reading.ph_level,
            "light_pct": reading.light_pct,
        }
        hs = compute_health_score(
            crop_type=crop_type,
            temperature_c=reading.temperature_c,
            humidity_pct=reading.humidity_pct,
            soil_moisture_pct=reading.soil_moisture_pct,
            ph_level=reading.ph_level,
            light_pct=reading.light_pct,
        )
        health_score = hs["score"]

    # ML predictions
    yield_prediction = None
    disease_risk = None
    ml_total_days = CROP_PARAMS.get(crop_type, {}).get("total_days_avg", 120)
    if reading:
        try:
            from ml.predict import predict_yield, predict_disease, predict_harvest_days
            sunlight = (reading.light_pct / 100.0 * 12.0) if reading.light_pct is not None else 7.0
            harvest_result = predict_harvest_days(
                crop_type=crop_type,
                soil_moisture=reading.soil_moisture_pct,
                soil_ph=reading.ph_level,
                temperature=reading.temperature_c,
                water_mm=crop_row.water_mm if crop_row else 150.0,
                humidity=reading.humidity_pct,
                sunlight_hours=sunlight,
            )
            ml_total_days = harvest_result["predicted_days"]
            kwargs = dict(
                crop_type=crop_type,
                soil_moisture=reading.soil_moisture_pct,
                soil_ph=reading.ph_level,
                temperature=reading.temperature_c,
                water_mm=crop_row.water_mm if crop_row else 150.0,
                humidity=reading.humidity_pct,
                sunlight_hours=sunlight,
                total_days=ml_total_days,
            )
            yield_prediction = predict_yield(**kwargs)
            disease_risk = predict_disease(**kwargs)
        except Exception:
            pass

    # Grow cycle info using ML-predicted harvest days
    grow_info = {}
    if crop_row and crop_row.sowing_date:
        from datetime import timedelta
        today = datetime.utcnow()
        sowing = crop_row.sowing_date
        elapsed = (today - sowing).days
        total = ml_total_days
        progress = round(100 * min(max(0, elapsed), total) / total, 1) if total else 0
        predicted_harvest_dt = sowing + timedelta(days=total)
        grow_info = {
            "sowing_date": sowing.strftime("%Y-%m-%d"),
            "predicted_harvest": predicted_harvest_dt.strftime("%Y-%m-%d"),
            "elapsed_days": max(0, elapsed),
            "total_days": total,
            "progress_pct": progress,
        }

    # Camera disease detections
    camera_detections = []
    if rack_image_row and rack_image_row.analysis_json:
        try:
            analysis = json.loads(rack_image_row.analysis_json)
            if isinstance(analysis, list):
                for item in analysis:
                    preds = item.get("predictions", [item] if item.get("class") else [])
                    for p in preds[:6]:
                        camera_detections.append({
                            "class": p.get("class") or p.get("label", "Unknown"),
                            "confidence": round((p.get("confidence", 0)) * 100, 1),
                        })
        except Exception:
            pass

    history = [{"role": m.role, "content": m.content} for m in req.history]

    async def generator():
        async for chunk in chat_stream(
            message=req.message,
            history=history,
            sensor_data=sensor_data,
            crop=crop_type,
            alerts=list(active_alerts),
            health_score=health_score,
            recent_events=[(e.event_type, e.reason, e.timestamp.strftime("%H:%M")) for e in recent_events],
            yield_prediction=yield_prediction,
            disease_risk=disease_risk,
            grow_info=grow_info,
            camera_detections=camera_detections,
        ):
            yield chunk

    return StreamingResponse(generator(), media_type="text/plain")
