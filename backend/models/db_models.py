from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base
import enum


class DiseaseStatus(str, enum.Enum):
    none = "None"
    mild = "Mild"
    moderate = "Moderate"
    severe = "Severe"


class AlertSeverity(str, enum.Enum):
    info = "Info"
    warning = "Warning"
    critical = "Critical"


class AlertStatus(str, enum.Enum):
    active = "Active"
    acknowledged = "Acknowledged"


class AutomationAction(str, enum.Enum):
    alert = "Alert"
    irrigate = "Irrigate"
    log = "Log"


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    temperature_c: Mapped[float] = mapped_column(Float)
    humidity_pct: Mapped[float] = mapped_column(Float)
    soil_moisture_pct: Mapped[float] = mapped_column(Float)
    ph_level: Mapped[float] = mapped_column(Float)
    farm_id: Mapped[str] = mapped_column(String(50), default="RACK_ALPHA")
    health_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    light_pct: Mapped[float | None] = mapped_column(Float, nullable=True)


class CropConfig(Base):
    __tablename__ = "crop_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farm_id: Mapped[str] = mapped_column(String(50), default="RACK_ALPHA")
    crop_type: Mapped[str] = mapped_column(String(50))
    sowing_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    harvest_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sunlight_hours: Mapped[float] = mapped_column(Float, default=7.0)
    water_mm: Mapped[float] = mapped_column(Float, default=150.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    sensor: Mapped[str] = mapped_column(String(50))   # temperature|humidity|soil_moisture|ph
    operator: Mapped[str] = mapped_column(String(5))   # < > <= >= ==
    threshold: Mapped[float] = mapped_column(Float)
    action: Mapped[str] = mapped_column(String(20), default="Alert")
    action_value: Mapped[float] = mapped_column(Float, default=10.0)  # minutes for irrigate
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=30)
    last_triggered: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    farm_id: Mapped[str] = mapped_column(String(50), default="RACK_ALPHA")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    sensor: Mapped[str] = mapped_column(String(50))
    condition: Mapped[str] = mapped_column(String(100))
    value: Mapped[float] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String(20), default="Warning")
    status: Mapped[str] = mapped_column(String(20), default="Active")
    message: Mapped[str] = mapped_column(Text, default="")
    farm_id: Mapped[str] = mapped_column(String(50), default="RACK_ALPHA")
    rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("automation_rules.id"), nullable=True)


class IrrigationEvent(Base):
    __tablename__ = "irrigation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    duration_minutes: Mapped[float] = mapped_column(Float)
    trigger: Mapped[str] = mapped_column(String(50), default="Manual")  # Manual|Scheduled|AutoRule
    sm_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    sm_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    farm_id: Mapped[str] = mapped_column(String(50), default="RACK_ALPHA")


class AlertThreshold(Base):
    __tablename__ = "alert_thresholds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farm_id: Mapped[str] = mapped_column(String(50), default="RACK_ALPHA")
    sensor: Mapped[str] = mapped_column(String(50))
    direction: Mapped[str] = mapped_column(String(5))  # high | low
    warning_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    critical_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    warning_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    critical_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class ScheduledReport(Base):
    __tablename__ = "scheduled_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farm_id: Mapped[str] = mapped_column(String(50), default="RACK_ALPHA")
    frequency: Mapped[str] = mapped_column(String(20))  # daily|weekly|monthly
    send_time: Mapped[str] = mapped_column(String(10), default="07:00")
    day_of_week: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recipients: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Rack(Base):
    __tablename__ = "racks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farm_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    rack_size: Mapped[int] = mapped_column(Integer, default=3)   # number of tiers/levels
    location: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class RackImage(Base):
    __tablename__ = "rack_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farm_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    image_data: Mapped[str] = mapped_column(Text)
    analysis_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class AutomationEvent(Base):
    __tablename__ = "automation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farm_id: Mapped[str] = mapped_column(String(50), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    # values: irrigation_triggered | irrigation_skipped | light_increased | light_decreased
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    trigger_values: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
