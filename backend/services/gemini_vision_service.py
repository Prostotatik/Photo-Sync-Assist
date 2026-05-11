import asyncio
import base64 as b64lib
import json
import logging

from config import settings

logger = logging.getLogger("gemini_vision")

_PROMPT = """You are a plant disease detection system for a vertical farm.
Analyze this image and identify any diseases, pests, or health issues on the plants.

Respond ONLY with a valid JSON object — no markdown, no explanation, just raw JSON:
{
  "status": "healthy" | "diseased" | "uncertain",
  "overall_health": "Excellent" | "Good" | "Fair" | "Poor" | "Critical",
  "summary": "1-2 sentence description of the plant's condition",
  "diseases": [
    {
      "name": "Specific disease or issue name",
      "severity": "Low" | "Medium" | "High",
      "confidence": 0.0,
      "affected_area_pct": 0,
      "recommendation": "Short, specific corrective action"
    }
  ],
  "urgent_action": null
}

Use exact disease names (e.g. "Powdery Mildew", "Leaf Spot", "Aphid Infestation", "Root Rot", "Botrytis").
If the plant looks healthy, return an empty diseases array and urgent_action as null.
Set urgent_action to a string only if immediate intervention is needed."""

_model = None


def _get_model():
    global _model
    if _model is None and settings.GEMINI_API_KEY:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        _model = genai.GenerativeModel("gemini-2.5-flash")
    return _model


async def analyze_image(base64_image: str) -> dict | None:
    if not settings.GEMINI_API_KEY:
        return None
    model = _get_model()
    if model is None:
        return None

    try:
        # Strip data URI prefix if present
        if "," in base64_image:
            _, data = base64_image.split(",", 1)
        else:
            data = base64_image

        image_bytes = b64lib.b64decode(data)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: model.generate_content([
                {"mime_type": "image/jpeg", "data": image_bytes},
                _PROMPT,
            ])
        )

        text = result.text.strip()
        # Strip markdown code fences if model wraps output
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)
    except Exception as e:
        logger.warning(f"Gemini vision analysis failed: {e}")
        return None
