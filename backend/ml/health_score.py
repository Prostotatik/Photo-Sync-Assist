"""
Farm Health Score: composite 0–100 index.
Each sensor scored 100 within ideal range, decays linearly outside it.
"""
from typing import Optional
from ml.crop_params import CROP_PARAMS, SENSOR_WEIGHTS


def _score_param(value: float, params: dict) -> float:
    ideal_min = params["ideal_min"]
    ideal_max = params["ideal_max"]
    abs_min = params["min"]
    abs_max = params["max"]

    if ideal_min <= value <= ideal_max:
        return 100.0

    if value < ideal_min:
        if value <= abs_min:
            return 0.0
        return 100.0 * (value - abs_min) / (ideal_min - abs_min)

    # value > ideal_max
    if value >= abs_max:
        return 0.0
    return 100.0 * (abs_max - value) / (abs_max - ideal_max)


def compute_health_score(
    crop_type: str,
    temperature_c: float,
    humidity_pct: float,
    soil_moisture_pct: float,
    ph_level: float,
    light_pct: Optional[float] = None,
    sunlight_hours: float = 7.0,
) -> dict:
    params = CROP_PARAMS.get(crop_type, CROP_PARAMS["Wheat"])

    readings = {
        "temperature_c":     temperature_c,
        "humidity_pct":      humidity_pct,
        "soil_moisture_pct": soil_moisture_pct,
        "ph_level":          ph_level,
        "light_pct":         light_pct,
    }

    sub_scores = {}
    total_weight = 0.0
    total = 0.0

    for sensor, weight in SENSOR_WEIGHTS.items():
        p = params.get(sensor)
        value = readings.get(sensor)
        if p and value is not None:
            s = _score_param(value, p)
            sub_scores[sensor] = round(s, 1)
            total += s * weight
            total_weight += weight
        else:
            sub_scores[sensor] = None

    # Normalise if light_pct was absent (total_weight < 1.0)
    if total_weight > 0:
        overall = round(total / total_weight * 1.0, 1) if total_weight < 1.0 else round(total, 1)
    else:
        overall = 0.0

    status = "GOOD" if overall >= 70 else ("AT RISK" if overall >= 50 else "CRITICAL")

    return {
        "score": overall,
        "status": status,
        "sub_scores": {
            "temperature":    sub_scores.get("temperature_c"),
            "humidity":       sub_scores.get("humidity_pct"),
            "soil_moisture":  sub_scores.get("soil_moisture_pct"),
            "ph":             sub_scores.get("ph_level"),
            "light":          sub_scores.get("light_pct"),
        },
    }
