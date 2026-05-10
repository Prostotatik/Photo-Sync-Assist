"""
Training pipeline for YieldPredictor, DiseaseClassifier, and HarvestDaysPredictor.
Runs on startup if saved models not found.
"""
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, accuracy_score

# Features shared by yield/disease models (total_days = elapsed days grown so far)
YIELD_FEATURES = [
    "soil_moisture_%", "soil_pH", "temperature_C",
    "water_mm", "humidity_%", "sunlight_hours", "total_days", "crop_encoded",
]

# Harvest days model predicts total growing duration from current conditions
# (no total_days as input — that's what we're predicting)
HARVEST_FEATURES = [
    "soil_moisture_%", "soil_pH", "temperature_C",
    "water_mm", "humidity_%", "sunlight_hours", "crop_encoded",
]

MODELS_DIR = Path(__file__).parent / "saved_models"


def train_and_save(dataset_path: str) -> dict:
    df = pd.read_csv(dataset_path)

    le = LabelEncoder()
    df["crop_encoded"] = le.fit_transform(df["crop_type"])

    # ── Yield & Disease models ────────────────────────────────────────────────
    yield_cols = YIELD_FEATURES + ["yield_kg_per_hectare", "crop_disease_status"]
    df_yd = df.dropna(subset=yield_cols).reset_index(drop=True)
    X_yd = df_yd[YIELD_FEATURES]

    X_tr, X_te, yy_tr, yy_te = train_test_split(
        X_yd, df_yd["yield_kg_per_hectare"], test_size=0.2, random_state=42
    )
    X_tr_d, X_te_d, yd_tr, yd_te = train_test_split(
        X_yd, df_yd["crop_disease_status"], test_size=0.2, random_state=42
    )

    yield_model = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)
    yield_model.fit(X_tr, yy_tr)
    yield_r2 = r2_score(yy_te, yield_model.predict(X_te))

    disease_model = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    disease_model.fit(X_tr_d, yd_tr)
    disease_acc = accuracy_score(yd_te, disease_model.predict(X_te_d))

    # ── Harvest days model ────────────────────────────────────────────────────
    harvest_cols = HARVEST_FEATURES + ["total_days"]
    df_h = df.dropna(subset=harvest_cols).reset_index(drop=True)
    # Re-encode crop for this subset (same LabelEncoder)
    df_h["crop_encoded"] = le.transform(df_h["crop_type"])
    X_h = df_h[HARVEST_FEATURES]
    y_h = df_h["total_days"]

    X_htr, X_hte, yh_tr, yh_te = train_test_split(X_h, y_h, test_size=0.2, random_state=42)
    harvest_model = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)
    harvest_model.fit(X_htr, yh_tr)
    harvest_r2 = r2_score(yh_te, harvest_model.predict(X_hte))

    # ── Persist ───────────────────────────────────────────────────────────────
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(yield_model,   MODELS_DIR / "yield_model.pkl")
    joblib.dump(disease_model, MODELS_DIR / "disease_model.pkl")
    joblib.dump(harvest_model, MODELS_DIR / "harvest_model.pkl")
    joblib.dump(le,            MODELS_DIR / "label_encoder.pkl")

    importances = dict(zip(YIELD_FEATURES, yield_model.feature_importances_))
    joblib.dump(importances, MODELS_DIR / "feature_importances.pkl")

    # Per-crop stats for benchmarking
    stats = {}
    for crop in df["crop_type"].unique():
        sub_y = df[df["crop_type"] == crop]["yield_kg_per_hectare"]
        sub_d = df[df["crop_type"] == crop]["total_days"]
        disease_dist = (
            df[df["crop_type"] == crop]["crop_disease_status"]
            .value_counts(normalize=True)
            .to_dict()
        )
        stats[crop] = {
            "yield_mean":   float(sub_y.mean()),
            "yield_p25":    float(sub_y.quantile(0.25)),
            "yield_p75":    float(sub_y.quantile(0.75)),
            "yield_max":    float(sub_y.max()),
            "days_mean":    int(round(sub_d.mean())),
            "days_min":     int(sub_d.min()),
            "days_max":     int(sub_d.max()),
            "disease_dist": disease_dist,
        }
    joblib.dump(stats, MODELS_DIR / "dataset_stats.pkl")

    return {
        "yield_r2":        round(yield_r2, 4),
        "disease_accuracy": round(disease_acc, 4),
        "harvest_r2":      round(harvest_r2, 4),
    }


def models_exist() -> bool:
    return all(
        (MODELS_DIR / f).exists()
        for f in ("yield_model.pkl", "disease_model.pkl", "harvest_model.pkl")
    )
