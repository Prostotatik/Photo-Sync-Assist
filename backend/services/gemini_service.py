import json
from typing import AsyncGenerator
from config import settings

_client = None


def _get_client():
    global _client
    if _client is None and settings.GEMINI_API_KEY:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        _client = genai.GenerativeModel("gemini-2.5-flash")
    return _client


def _system_prompt() -> str:
    return """You are AgroSync AI, an expert vertical farming assistant embedded in a real-time farm management dashboard.
You have access to live sensor data from an ESP-32 device monitoring an indoor vertical farm.
Crops you support: Wheat, Soybean, Maize, Cotton, Rice.

Rules:
- Always reference the specific sensor values provided in the user context.
- Give actionable, number-specific advice (e.g. "irrigate for 10 minutes", not "water the plants").
- Keep responses concise but complete. Use bullet points for lists.
- When suggesting an action that can be automated (irrigation, alert threshold change), end with: ACTION: <json>
  where json has keys: type (irrigate|alert|none), value (minutes or threshold).
- Be encouraging but honest about risks.
"""


def _build_context(
    sensor_data: dict,
    crop: str,
    alerts: list[str],
    health_score: float,
    recent_events: list = None,
    yield_prediction: dict = None,
    disease_risk: dict = None,
    grow_info: dict = None,
    camera_detections: list = None,
) -> str:
    lines = ["=== LIVE FARM DATA ==="]
    lines.append(f"Crop: {crop}")
    lines.append(f"Temperature: {sensor_data.get('temperature_c', 'N/A')}°C")
    lines.append(f"Humidity: {sensor_data.get('humidity_pct', 'N/A')}%")
    lines.append(f"Soil Moisture: {sensor_data.get('soil_moisture_pct', 'N/A')}%")
    lines.append(f"pH Level: {sensor_data.get('ph_level', 'N/A')}")
    lines.append(f"Light: {sensor_data.get('light_pct', 'N/A')}%")
    lines.append(f"Farm Health Score: {health_score}/100")

    if grow_info:
        lines.append(f"Sown Date: {grow_info.get('sowing_date', 'N/A')}")
        lines.append(f"Predicted Harvest: {grow_info.get('predicted_harvest', 'N/A')}")
        lines.append(f"Growth Progress: Day {grow_info.get('elapsed_days', '?')} of {grow_info.get('total_days', '?')} ({grow_info.get('progress_pct', 0):.0f}%)")

    if yield_prediction:
        lines.append(f"Predicted Yield: {yield_prediction.get('yield_kg_ha', 'N/A')} kg/ha "
                     f"(range {yield_prediction.get('confidence_low', '?')}–{yield_prediction.get('confidence_high', '?')})")

    if disease_risk:
        lines.append(f"Disease Risk: {disease_risk.get('risk', 'N/A')}")
        probs = disease_risk.get("probabilities", {})
        if probs:
            prob_str = ", ".join(f"{k}: {v*100:.0f}%" for k, v in probs.items())
            lines.append(f"Disease Probabilities: {prob_str}")

    lines.append(f"Active Alerts: {', '.join(alerts) if alerts else 'None'}")

    if recent_events:
        lines.append("Recent Automation Events:")
        for ev_type, reason, ts in recent_events:
            lines.append(f"  [{ts}] {ev_type}: {reason}")

    if camera_detections:
        lines.append("Rack Camera Disease Detections:")
        for det in camera_detections:
            lines.append(f"  {det['class']} ({det['confidence']}% confidence)")
    else:
        lines.append("Rack Camera: No disease detections")

    lines.append("=== END LIVE DATA ===")
    return "\n".join(lines)


async def chat_stream(
    message: str,
    history: list[dict],
    sensor_data: dict,
    crop: str,
    alerts: list[str],
    health_score: float,
    recent_events: list = None,
    yield_prediction: dict = None,
    disease_risk: dict = None,
    grow_info: dict = None,
    camera_detections: list = None,
) -> AsyncGenerator[str, None]:
    client = _get_client()

    context = _build_context(
        sensor_data, crop, alerts, health_score,
        recent_events=recent_events,
        yield_prediction=yield_prediction,
        disease_risk=disease_risk,
        grow_info=grow_info,
        camera_detections=camera_detections,
    )
    # Embed system prompt in the user message (Gemma 3 has no system_instruction support)
    full_message = _system_prompt() + "\n\n" + context + "\nUser question: " + message

    if client is None:
        # Fallback demo response when no API key
        demo = _demo_response(message, sensor_data, crop)
        for chunk in demo.split(" "):
            yield chunk + " "
        return

    gemini_history = []
    for h in history[-10:]:
        role = "user" if h["role"] == "user" else "model"
        gemini_history.append({"role": role, "parts": [h["content"]]})

    chat = client.start_chat(history=gemini_history)
    response = chat.send_message(full_message, stream=True)
    for chunk in response:
        if chunk.text:
            yield chunk.text


def _demo_response(message: str, sensor_data: dict, crop: str) -> str:
    sm = sensor_data.get("soil_moisture_pct", 30)
    temp = sensor_data.get("temperature_c", 24)
    msg_lower = message.lower()

    if "water" in msg_lower or "irrigat" in msg_lower:
        if sm < 25:
            return (
                f"⚠️ Yes — your soil moisture is at {sm}%, below the 25% warning threshold for {crop}.\n\n"
                "**Recommendation:** Start a 10-minute irrigation cycle now.\n"
                "• Expected moisture increase: ~8–10%\n"
                "• Monitor again in 30 minutes\n"
                "• Optimal target: 28–35% for maximum yield\n\n"
                "ACTION: {\"type\": \"irrigate\", \"value\": 10}"
            )
        return (
            f"✅ No immediate irrigation needed. Soil moisture is at {sm}% (optimal range for {crop}: 20–38%).\n\n"
            f"• Last reading stable — no downward trend detected\n"
            f"• Check again in 2–3 hours\n"
            f"• If moisture drops below 25%, run a 10-minute cycle"
        )

    if "disease" in msg_lower or "ndvi" in msg_lower:
        return (
            f"Based on your current conditions for {crop}:\n\n"
            f"• Humidity at {sensor_data.get('humidity_pct', 65)}% — within safe range (keep below 85% to minimize fungal risk)\n"
            f"• Temperature at {temp}°C — optimal\n"
            f"• **Disease risk: Mild** — routine monitoring recommended\n\n"
            "Preventive actions:\n"
            "• Ensure good airflow between rack layers\n"
            "• Inspect leaves every 3 days for early spotting\n"
            "• If humidity rises above 80%, increase ventilation"
        )

    return (
        f"Here's a quick analysis of your {crop} farm:\n\n"
        f"• Temperature: {temp}°C ✓\n"
        f"• Humidity: {sensor_data.get('humidity_pct', 65)}% ✓\n"
        f"• Soil Moisture: {sm}% {'⚠️ low' if sm < 25 else '✓'}\n"
        f"• pH: {sensor_data.get('ph_level', 6.8)} ✓\n\n"
        "Everything looks good overall. Ask me about watering, disease risk, or yield optimization for specific recommendations."
    )
