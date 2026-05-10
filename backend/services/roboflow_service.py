import asyncio
import logging
from config import settings

logger = logging.getLogger("roboflow")

_client = None


def _get_client():
    global _client
    if _client is None:
        try:
            from inference_sdk import InferenceHTTPClient
            _client = InferenceHTTPClient(
                api_url="https://detect.roboflow.com",
                api_key=settings.ROBOFLOW_API_KEY,
            )
        except ImportError:
            logger.warning("inference-sdk not installed; Roboflow analysis disabled")
            return None
    return _client


async def analyze_image(base64_image: str) -> dict | None:
    if not settings.ROBOFLOW_API_KEY:
        return None
    client = _get_client()
    if client is None:
        return None
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: client.run_workflow(
                workspace_name="prostotaks-workspace",
                workflow_id="agriculture-disease-spots",
                images={"image": base64_image},
                use_cache=True,
            ),
        )
        return result
    except Exception as e:
        logger.warning(f"Roboflow analysis failed: {e}")
        return None
