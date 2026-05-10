import joblib
import numpy as np
import pandas as pd
from pathlib import Path

MODELS_DIR = Path(__file__).parent / "saved_models"

_yield_model = None
_disease_model = None
_harvest_model = None
_label_encoder = None
_feature_importances = None
_dataset_stats = None


def _load():
    global _yield_model, _disease_model, _harvest_model
    global _label_encoder, _feature_importances, _dataset_stats
    if _yield_model is None:
        _yield_model          = joblib.load(MODELS_DIR / "yield_model.pkl")
        _disease_model        = joblib.load(MODELS_DIR / "disease_model.pkl")
        _harvest_model        = joblib.load(MODELS_DIR / "harvest_model.pkl")
        _label_encoder        = joblib.load(MODELS_DIR / "label_encoder.pkl")
        _feature_importances  = joblib.load(MODELS_DIR / "feature_importances.pkl")
        _dataset_stats        = joblib.load(MODELS_DIR / "dataset_stats.pkl")


_DISEASE_COLS  = ["soil_moisture_%", "soil_pH", "temperature_C", "water_mm", "humidity_%", "sunlight_hours", "total_days", "crop_encoded"]
_HARVEST_COLS  = ["soil_moisture_%", "soil_pH", "temperature_C", "water_mm", "humidity_%", "sunlight_hours", "crop_encoded"]


def _yield_row(soil_moisture, soil_ph, temperature, water_mm, humidity, sunlight_hours, total_days, crop_enc):
    return [soil_moisture, soil_ph, temperature, water_mm, humidity, sunlight_hours, total_days, crop_enc]


def predict_yield(
    crop_type: str,
    soil_moisture: float,
    soil_ph: float,
    temperature: float,
    water_mm: float,
    humidity: float,
    sunlight_hours: float,
    total_days: int,
) -> dict:
    _load()
    crop_enc = int(_label_encoder.transform([crop_type])[0])
    X = np.array([_yield_row(soil_moisture, soil_ph, temperature, water_mm, humidity, sunlight_hours, total_days, crop_enc)])
    predictions = [t.predict(X)[0] for t in _yield_model.estimators_]
    mean_pred = float(np.mean(predictions))
    std_pred  = float(np.std(predictions))
    return {
        "yield_kg_ha":      round(mean_pred, 1),
        "confidence_low":   round(mean_pred - 1.96 * std_pred, 1),
        "confidence_high":  round(mean_pred + 1.96 * std_pred, 1),
    }


def predict_disease(
    crop_type: str,
    soil_moisture: float,
    soil_ph: float,
    temperature: float,
    water_mm: float,
    humidity: float,
    sunlight_hours: float,
    total_days: int,
) -> dict:
    _load()
    crop_enc = int(_label_encoder.transform([crop_type])[0])
    X = pd.DataFrame(
        [_yield_row(soil_moisture, soil_ph, temperature, water_mm, humidity, sunlight_hours, total_days, crop_enc)],
        columns=_DISEASE_COLS,
    )
    risk  = _disease_model.predict(X)[0]
    proba = _disease_model.predict_proba(X)[0]
    return {
        "risk": risk,
        "probabilities": {c: round(float(p), 3) for c, p in zip(_disease_model.classes_, proba)},
    }


def predict_harvest_days(
    crop_type: str,
    soil_moisture: float,
    soil_ph: float,
    temperature: float,
    water_mm: float,
    humidity: float,
    sunlight_hours: float,
) -> dict:
    """Predict total growing days from current sensor conditions using ML."""
    _load()
    crop_enc = int(_label_encoder.transform([crop_type])[0])
    X = pd.DataFrame(
        [[soil_moisture, soil_ph, temperature, water_mm, humidity, sunlight_hours, crop_enc]],
        columns=_HARVEST_COLS,
    )
    predicted_days = int(round(float(_harvest_model.predict(X)[0])))
    stats = (_dataset_stats.get(crop_type) or {})
    return {
        "predicted_days": predicted_days,
        "days_mean": stats.get("days_mean"),
        "days_min":  stats.get("days_min"),
        "days_max":  stats.get("days_max"),
    }


def get_feature_importances() -> list[dict]:
    _load()
    label_map = {
        "soil_moisture_%": "Soil Moisture",
        "soil_pH":         "pH Level",
        "temperature_C":   "Temperature",
        "water_mm":        "Water (mm)",
        "humidity_%":      "Humidity",
        "sunlight_hours":  "Sunlight Hours",
        "total_days":      "Growth Days",
        "crop_encoded":    "Crop Type",
    }
    items = sorted(_feature_importances.items(), key=lambda x: x[1], reverse=True)
    return [{"name": label_map.get(k, k), "importance": round(float(v), 4)} for k, v in items]


def get_dataset_stats(crop_type: str) -> dict:
    _load()
    return _dataset_stats.get(crop_type, {})
