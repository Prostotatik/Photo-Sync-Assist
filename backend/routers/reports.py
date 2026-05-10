from datetime import datetime, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.db_models import SensorReading, Alert, IrrigationEvent, CropConfig

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/summary")
async def report_summary(
    farm_id: str = "RACK_ALPHA",
    hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(hours=hours)

    readings = (await db.execute(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id, SensorReading.timestamp >= since)
        .order_by(SensorReading.timestamp)
    )).scalars().all()

    alerts = (await db.execute(
        select(Alert)
        .where(Alert.farm_id == farm_id, Alert.timestamp >= since)
        .order_by(desc(Alert.timestamp))
    )).scalars().all()

    irrigations = (await db.execute(
        select(IrrigationEvent)
        .where(IrrigationEvent.farm_id == farm_id, IrrigationEvent.started_at >= since)
    )).scalars().all()

    crop = await db.scalar(
        select(CropConfig).where(CropConfig.farm_id == farm_id, CropConfig.is_active == True)
    )

    def stat(vals):
        if not vals:
            return {}
        return {"min": round(min(vals), 2), "max": round(max(vals), 2), "avg": round(sum(vals) / len(vals), 2)}

    return {
        "period_hours": hours,
        "farm_id": farm_id,
        "generated_at": datetime.utcnow().isoformat(),
        "crop": crop.crop_type if crop else "Unknown",
        "sensor_stats": {
            "temperature": stat([r.temperature_c for r in readings]),
            "humidity": stat([r.humidity_pct for r in readings]),
            "soil_moisture": stat([r.soil_moisture_pct for r in readings]),
            "ph": stat([r.ph_level for r in readings]),
            "health_score": stat([r.health_score for r in readings if r.health_score]),
        },
        "alerts": {
            "total": len(alerts),
            "critical": sum(1 for a in alerts if a.severity == "Critical"),
            "warning": sum(1 for a in alerts if a.severity == "Warning"),
            "list": [{"time": a.timestamp.isoformat(), "sensor": a.sensor, "message": a.message, "severity": a.severity} for a in alerts[:10]],
        },
        "irrigation": {
            "total_events": len(irrigations),
            "total_minutes": sum(i.duration_minutes for i in irrigations),
            "estimated_liters": round(sum(i.duration_minutes for i in irrigations) * 1.2, 1),
        },
        "readings_count": len(readings),
    }


@router.get("/pdf")
async def generate_pdf(
    farm_id: str = "RACK_ALPHA",
    hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    summary = (await report_summary(farm_id=farm_id, hours=hours, db=db))

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    story = []

    # Header
    story.append(Paragraph(f"<b>AgroSync Report — {summary['crop']} Farm</b>", styles["Title"]))
    story.append(Paragraph(f"Generated: {summary['generated_at'][:16].replace('T', ' ')} UTC | Period: last {hours}h", styles["Normal"]))
    story.append(Spacer(1, 0.5*cm))

    # Sensor stats table
    story.append(Paragraph("<b>Sensor Averages</b>", styles["Heading2"]))
    data = [["Parameter", "Min", "Max", "Average"]]
    for name, stat in summary["sensor_stats"].items():
        if stat:
            data.append([name.replace("_", " ").title(), str(stat.get("min","—")), str(stat.get("max","—")), str(stat.get("avg","—"))])
    t = Table(data, colWidths=[5*cm, 3*cm, 3*cm, 3*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#00D68F")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F0FFF8")]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#CCCCCC")),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5*cm))

    # Alerts
    story.append(Paragraph(f"<b>Alerts ({summary['alerts']['total']} total)</b>", styles["Heading2"]))
    for a in summary["alerts"]["list"]:
        story.append(Paragraph(f"• [{a['severity']}] {a['sensor']} — {a['message']} ({a['time'][:16]})", styles["Normal"]))
    if not summary["alerts"]["list"]:
        story.append(Paragraph("No alerts in this period.", styles["Normal"]))
    story.append(Spacer(1, 0.5*cm))

    # Irrigation
    irr = summary["irrigation"]
    story.append(Paragraph("<b>Irrigation Summary</b>", styles["Heading2"]))
    story.append(Paragraph(f"Events: {irr['total_events']} | Total time: {irr['total_minutes']} min | Est. water: {irr['estimated_liters']}L", styles["Normal"]))

    doc.build(story)
    buffer.seek(0)
    filename = f"agrosync_report_{farm_id}_{hours}h.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
