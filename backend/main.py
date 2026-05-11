import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from ml.train import train_and_save, models_exist

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("agrosync")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Init DB
    await init_db()
    logger.info("Database initialized")

    # Train ML models if not cached
    if not models_exist():
        logger.info("Training ML models (first run)...")
        metrics = train_and_save(settings.DATASET_PATH)
        logger.info(f"Models trained — Yield R²: {metrics['yield_r2']}, Disease Acc: {metrics['disease_accuracy']}, Harvest R²: {metrics['harvest_r2']}")
    else:
        logger.info("ML models loaded from cache")

    # Seed default automation rules if DB is empty
    await _seed_defaults()

    # Start automation background loop
    from services.automation_engine import run_automation_loop
    task = asyncio.create_task(run_automation_loop())
    cleanup_task = asyncio.create_task(_cleanup_old_readings())

    yield

    task.cancel()
    cleanup_task.cancel()
    for t in (task, cleanup_task):
        try:
            await t
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Photo-Sync-Assist API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
from routers.sensors import router as sensors_router
from routers.ml_router import router as ml_router
from routers.ai_chat import router as ai_router
from routers.automation import router as automation_router
from routers.alerts import router as alerts_router
from routers.reports import router as reports_router
from routers.crops import router as crops_router
from routers.racks import router as racks_router

app.include_router(sensors_router)
app.include_router(ml_router)
app.include_router(ai_router)
app.include_router(automation_router)
app.include_router(alerts_router)
app.include_router(reports_router)
app.include_router(crops_router)
app.include_router(racks_router)


@app.get("/")
async def root():
    return {"status": "Photo-Sync-Assist API online", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _cleanup_old_readings():
    """Delete SensorReading rows older than 7 days. Runs hourly."""
    while True:
        await asyncio.sleep(3600)
        try:
            from database import AsyncSessionLocal
            from sqlalchemy import delete
            from models.db_models import SensorReading
            cutoff = datetime.utcnow() - timedelta(days=7)
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    delete(SensorReading).where(SensorReading.timestamp < cutoff)
                )
                await db.commit()
                if result.rowcount:
                    logger.info(f"Cleanup: deleted {result.rowcount} sensor readings older than 7 days")
        except Exception as e:
            logger.warning(f"Cleanup task error: {e}")


async def _seed_defaults():
    from database import AsyncSessionLocal
    from sqlalchemy import select, func
    from models.db_models import AutomationRule, CropConfig, AlertThreshold, Rack

    async with AsyncSessionLocal() as db:
        # Seed default rack
        rack_count = await db.scalar(select(func.count()).select_from(Rack))
        if rack_count == 0:
            db.add(Rack(
                farm_id="RACK_ALPHA",
                name="Rack Alpha",
                rack_size=3,
                location="Campus Greenhouse",
                description="Main production rack",
            ))

        # Seed default crop config
        count = await db.scalar(select(func.count()).select_from(CropConfig))
        if count == 0:
            from datetime import datetime, timedelta
            crop = CropConfig(
                farm_id="RACK_ALPHA",
                crop_type="Wheat",
                sowing_date=datetime(2024, 1, 8),
                harvest_date=datetime(2024, 5, 9),
                sunlight_hours=7.0,
                water_mm=150.0,
                is_active=True,
            )
            db.add(crop)

        # Seed default automation rules
        rule_count = await db.scalar(select(func.count()).select_from(AutomationRule))
        if rule_count == 0:
            defaults = [
                AutomationRule(name="Low Moisture Auto-Water", sensor="soil_moisture", operator="<", threshold=25.0, action="Irrigate", action_value=10.0, cooldown_minutes=60, enabled=True),
                AutomationRule(name="High pH Alert", sensor="ph", operator=">", threshold=7.5, action="Alert", action_value=0, cooldown_minutes=120, enabled=True),
                AutomationRule(name="High Temperature Alert", sensor="temperature", operator=">", threshold=34.0, action="Alert", action_value=0, cooldown_minutes=30, enabled=True),
                AutomationRule(name="High Humidity Warning", sensor="humidity", operator=">", threshold=88.0, action="Alert", action_value=0, cooldown_minutes=60, enabled=True),
            ]
            for r in defaults:
                db.add(r)

        # Seed default alert thresholds
        thresh_count = await db.scalar(select(func.count()).select_from(AlertThreshold))
        if thresh_count == 0:
            from routers.alerts import DEFAULT_THRESHOLDS
            for d in DEFAULT_THRESHOLDS:
                db.add(AlertThreshold(farm_id="RACK_ALPHA", **d))

        await db.commit()
