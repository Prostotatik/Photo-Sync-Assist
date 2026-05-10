import asyncio
import base64
import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AsyncSessionLocal
from models.db_models import SensorReading, CropConfig, Rack, RackImage
from ml.health_score import compute_health_score
from services.sse_manager import sse_manager

router = APIRouter(prefix="/api/sensors", tags=["sensors"])

MOCK_IMAGES_DIR = Path(__file__).parent.parent / "mock_images"


class SensorIn(BaseModel):
    temperature_c: float
    humidity_pct: float
    soil_moisture_pct: float
    ph_level: float
    farm_id: str = "RACK_ALPHA"
    light_pct: Optional[float] = None


class ImageIn(BaseModel):
    farm_id: str = "RACK_ALPHA"
    image: str  # base64 data URI


@router.post("/readings")
async def post_reading(payload: SensorIn, db: AsyncSession = Depends(get_db)):
    """ESP-32 posts sensor data here."""
    crop_row = await db.scalar(
        select(CropConfig).where(CropConfig.farm_id == payload.farm_id, CropConfig.is_active == True).limit(1)
    )
    crop_type = crop_row.crop_type if crop_row else "Wheat"

    sunlight_hours = (payload.light_pct / 100.0 * 12.0) if payload.light_pct is not None else 7.0

    hs = compute_health_score(
        crop_type=crop_type,
        temperature_c=payload.temperature_c,
        humidity_pct=payload.humidity_pct,
        soil_moisture_pct=payload.soil_moisture_pct,
        ph_level=payload.ph_level,
        sunlight_hours=sunlight_hours,
        light_pct=payload.light_pct,
    )

    reading = SensorReading(
        temperature_c=payload.temperature_c,
        humidity_pct=payload.humidity_pct,
        soil_moisture_pct=payload.soil_moisture_pct,
        ph_level=payload.ph_level,
        farm_id=payload.farm_id,
        health_score=hs["score"],
        light_pct=payload.light_pct,
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)

    event = {
        "type": "reading",
        "id": reading.id,
        "timestamp": reading.timestamp.isoformat(),
        "temperature_c": reading.temperature_c,
        "humidity_pct": reading.humidity_pct,
        "soil_moisture_pct": reading.soil_moisture_pct,
        "ph_level": reading.ph_level,
        "health_score": reading.health_score,
        "light_pct": reading.light_pct,
        "farm_id": reading.farm_id,
    }
    await sse_manager.broadcast(event)
    return event


@router.post("/image")
async def post_image(payload: ImageIn, db: AsyncSession = Depends(get_db)):
    """ESP32-CAM posts base64-encoded image here every 120s."""
    existing = await db.scalar(
        select(RackImage).where(RackImage.farm_id == payload.farm_id)
    )
    if existing:
        existing.timestamp = datetime.utcnow()
        existing.image_data = payload.image
        existing.analysis_json = None
        row = existing
    else:
        row = RackImage(farm_id=payload.farm_id, image_data=payload.image)
        db.add(row)
    await db.commit()
    await db.refresh(row)

    row_id = row.id
    image_data = payload.image

    async def _run_analysis(rid: int, b64: str):
        from services.roboflow_service import analyze_image
        result = await analyze_image(b64)
        if result is not None:
            async with AsyncSessionLocal() as db2:
                r = await db2.get(RackImage, rid)
                if r:
                    r.analysis_json = json.dumps(result)
                    await db2.commit()

    asyncio.create_task(_run_analysis(row_id, image_data))
    return {"status": "ok", "farm_id": payload.farm_id}


@router.get("/image/{farm_id}")
async def get_image(farm_id: str, db: AsyncSession = Depends(get_db)):
    """Returns the latest rack camera image and Roboflow analysis."""
    if _mock_enabled:
        images = list(MOCK_IMAGES_DIR.glob("*.jpg")) + list(MOCK_IMAGES_DIR.glob("*.jpeg"))
        if not images:
            return {"farm_id": farm_id, "image": None, "analysis_json": None, "timestamp": None}

        img_bytes = random.choice(images).read_bytes()
        b64 = "data:image/jpeg;base64," + base64.b64encode(img_bytes).decode()

        row = await db.scalar(select(RackImage).where(RackImage.farm_id == farm_id))
        if row and row.analysis_json:
            return {
                "farm_id": farm_id,
                "image": b64,
                "analysis_json": json.loads(row.analysis_json),
                "timestamp": row.timestamp.isoformat(),
            }

        # Store image and kick off analysis if not yet done
        if row:
            row.image_data = b64
            row.timestamp = datetime.utcnow()
            row.analysis_json = None
        else:
            row = RackImage(farm_id=farm_id, image_data=b64)
            db.add(row)
        await db.commit()
        await db.refresh(row)
        row_id = row.id

        async def _run_mock_analysis(rid: int, img: str):
            from services.roboflow_service import analyze_image
            result = await analyze_image(img)
            if result is not None:
                async with AsyncSessionLocal() as db2:
                    r = await db2.get(RackImage, rid)
                    if r:
                        r.analysis_json = json.dumps(result)
                        await db2.commit()

        asyncio.create_task(_run_mock_analysis(row_id, b64))
        return {
            "farm_id": farm_id,
            "image": b64,
            "analysis_json": None,
            "timestamp": datetime.utcnow().isoformat(),
        }

    row = await db.scalar(select(RackImage).where(RackImage.farm_id == farm_id))
    if not row:
        return {"farm_id": farm_id, "image": None, "analysis_json": None, "timestamp": None}
    return {
        "farm_id": row.farm_id,
        "image": row.image_data,
        "analysis_json": json.loads(row.analysis_json) if row.analysis_json else None,
        "timestamp": row.timestamp.isoformat(),
    }


@router.get("/latest")
async def get_latest(farm_id: str = "RACK_ALPHA", db: AsyncSession = Depends(get_db)):
    row = await db.scalar(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    if not row:
        return {"message": "No readings yet"}
    return {
        "id": row.id,
        "timestamp": row.timestamp.isoformat(),
        "temperature_c": row.temperature_c,
        "humidity_pct": row.humidity_pct,
        "soil_moisture_pct": row.soil_moisture_pct,
        "ph_level": row.ph_level,
        "health_score": row.health_score,
        "light_pct": row.light_pct,
        "farm_id": row.farm_id,
    }


@router.get("/history")
async def get_history(
    farm_id: str = "RACK_ALPHA",
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = (await db.execute(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id, SensorReading.timestamp >= since)
        .order_by(SensorReading.timestamp)
        .limit(limit)
    )).scalars().all()

    return [
        {
            "timestamp": r.timestamp.isoformat(),
            "temperature_c": r.temperature_c,
            "humidity_pct": r.humidity_pct,
            "soil_moisture_pct": r.soil_moisture_pct,
            "ph_level": r.ph_level,
            "health_score": r.health_score,
            "light_pct": r.light_pct,
        }
        for r in rows
    ]


@router.get("/stats")
async def get_stats(
    farm_id: str = "RACK_ALPHA",
    hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    since = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(
            func.min(SensorReading.temperature_c),
            func.max(SensorReading.temperature_c),
            func.avg(SensorReading.temperature_c),
            func.min(SensorReading.humidity_pct),
            func.max(SensorReading.humidity_pct),
            func.avg(SensorReading.humidity_pct),
            func.min(SensorReading.soil_moisture_pct),
            func.max(SensorReading.soil_moisture_pct),
            func.avg(SensorReading.soil_moisture_pct),
            func.min(SensorReading.ph_level),
            func.max(SensorReading.ph_level),
            func.avg(SensorReading.ph_level),
            func.count(SensorReading.id),
            func.min(SensorReading.light_pct),
            func.max(SensorReading.light_pct),
            func.avg(SensorReading.light_pct),
        ).where(SensorReading.farm_id == farm_id, SensorReading.timestamp >= since)
    )
    row = result.first()
    if not row or row[12] == 0:
        return {"message": "No data in range"}

    def _r(v): return round(v, 2) if v is not None else None

    return {
        "temperature":   {"min": _r(row[0]),  "max": _r(row[1]),  "avg": _r(row[2])},
        "humidity":      {"min": _r(row[3]),  "max": _r(row[4]),  "avg": _r(row[5])},
        "soil_moisture": {"min": _r(row[6]),  "max": _r(row[7]),  "avg": _r(row[8])},
        "ph":            {"min": _r(row[9]),  "max": _r(row[10]), "avg": _r(row[11])},
        "light":         {"min": _r(row[13]), "max": _r(row[14]), "avg": _r(row[15])},
        "readings_count": row[12],
    }


@router.get("/stream")
async def stream_events(farm_id: str = "RACK_ALPHA"):
    """SSE endpoint — subscribe to live sensor events."""
    q = sse_manager.add_client()

    async def generator():
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25)
                    yield msg
                except asyncio.TimeoutError:
                    yield 'data: {"type":"ping"}\n\n'
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.remove_client(q)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ─── Mock Sensors ────────────────────────────────────────────────────────────

_mock_task: asyncio.Task | None = None
_mock_enabled: bool = False

_mock_state: dict[str, dict] = {}

# (initial, min, max, max_step_per_tick)
# Initial values are set to critical ranges to demonstrate automation corrections
_MOCK_FIELDS = {
    "temperature_c":     (13.0, 10.0, 38.0, 0.15),   # critical low (Wheat ideal 18–25)
    "humidity_pct":      (84.0, 35.0, 95.0, 0.3),    # critical high (Wheat ideal 50–72)
    "soil_moisture_pct": (12.0, 8.0,  85.0, 0.4),    # critical low (Wheat ideal 20–38)
    "ph_level":          (7.9,  4.0,  9.0,  0.05),   # critical high (Wheat ideal 6.0–7.0)
    "light_pct":         (16.0, 8.0,  90.0, 0.8),    # critical low (threshold <25)
}


def _walk(current: float, lo: float, hi: float, step: float) -> float:
    return round(max(lo, min(hi, current + random.uniform(-step, step))), 2)


async def _mock_loop():
    from services.mock_adjustments import pop_adjustments
    while True:
        await asyncio.sleep(2)
        try:
            async with AsyncSessionLocal() as db:
                racks = (await db.execute(select(Rack))).scalars().all()
                for rack in racks:
                    fid = rack.farm_id
                    if fid not in _mock_state:
                        _mock_state[fid] = {k: v[0] for k, v in _MOCK_FIELDS.items()}
                    st = _mock_state[fid]
                    # Natural random walk
                    for field, (_, lo, hi, step) in _MOCK_FIELDS.items():
                        st[field] = _walk(st[field], lo, hi, step)
                    # Apply one-shot automation adjustments (e.g. irrigation boosts SM)
                    for field, delta in pop_adjustments(fid).items():
                        if field in st:
                            _, lo, hi, _ = _MOCK_FIELDS[field]
                            st[field] = round(max(lo, min(hi, st[field] + delta)), 2)
                    payload = SensorIn(
                        temperature_c=st["temperature_c"],
                        humidity_pct=st["humidity_pct"],
                        soil_moisture_pct=st["soil_moisture_pct"],
                        ph_level=st["ph_level"],
                        farm_id=fid,
                        light_pct=st["light_pct"],
                    )
                    await post_reading(payload, db)
        except asyncio.CancelledError:
            raise
        except Exception:
            pass


@router.post("/mock/toggle")
async def toggle_mock():
    global _mock_task, _mock_enabled, _mock_state
    if _mock_enabled:
        _mock_enabled = False
        if _mock_task:
            _mock_task.cancel()
            _mock_task = None
    else:
        _mock_state = {}  # reset to critical initial values on every start
        _mock_enabled = True
        _mock_task = asyncio.create_task(_mock_loop())
    return {"mock_enabled": _mock_enabled}


@router.get("/mock/status")
async def mock_status():
    return {"mock_enabled": _mock_enabled}
