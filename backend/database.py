import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from config import settings

os.makedirs(os.path.dirname(settings.DATABASE_URL.split("///")[1]), exist_ok=True)

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        from models.db_models import (  # noqa: F401
            SensorReading, AutomationRule, Alert, CropConfig,
            IrrigationEvent, AlertThreshold, ScheduledReport, Rack,
            RackImage, AutomationEvent,
        )
        await conn.run_sync(Base.metadata.create_all)
