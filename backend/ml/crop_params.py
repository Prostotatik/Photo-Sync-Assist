"""
Optimal sensor ranges per crop type, derived from Smart_Farming_dataset.csv statistics.
Used for Health Score computation and Crop Manager UI.
"""

CROP_PARAMS: dict[str, dict] = {
    "Wheat": {
        "temperature_c":     {"min": 15.0, "max": 27.0, "ideal_min": 18.0, "ideal_max": 25.0},
        "humidity_pct":      {"min": 45.0, "max": 77.0, "ideal_min": 50.0, "ideal_max": 72.0},
        "soil_moisture_pct": {"min": 12.0, "max": 43.0, "ideal_min": 20.0, "ideal_max": 38.0},
        "ph_level":          {"min": 5.5,  "max": 7.4,  "ideal_min": 6.0,  "ideal_max": 7.0},
        "sunlight_hours":    {"min": 4.3,  "max": 10.0, "ideal_min": 6.0,  "ideal_max": 9.0},
        "light_pct":         {"min": 36.0, "max": 83.0, "ideal_min": 50.0, "ideal_max": 75.0},
        "avg_yield":         3912.0,
        "top25_yield":       5200.0,
        "total_days_avg":    120,
    },
    "Soybean": {
        "temperature_c":     {"min": 15.0, "max": 33.0, "ideal_min": 20.0, "ideal_max": 30.0},
        "humidity_pct":      {"min": 42.0, "max": 88.0, "ideal_min": 55.0, "ideal_max": 80.0},
        "soil_moisture_pct": {"min": 11.0, "max": 43.0, "ideal_min": 18.0, "ideal_max": 38.0},
        "ph_level":          {"min": 5.5,  "max": 7.5,  "ideal_min": 6.0,  "ideal_max": 7.2},
        "sunlight_hours":    {"min": 4.0,  "max": 9.7,  "ideal_min": 5.5,  "ideal_max": 8.5},
        "light_pct":         {"min": 33.0, "max": 81.0, "ideal_min": 46.0, "ideal_max": 71.0},
        "avg_yield":         4580.0,
        "top25_yield":       5500.0,
        "total_days_avg":    125,
    },
    "Maize": {
        "temperature_c":     {"min": 15.0, "max": 34.0, "ideal_min": 20.0, "ideal_max": 30.0},
        "humidity_pct":      {"min": 41.0, "max": 90.0, "ideal_min": 55.0, "ideal_max": 78.0},
        "soil_moisture_pct": {"min": 11.0, "max": 43.0, "ideal_min": 20.0, "ideal_max": 38.0},
        "ph_level":          {"min": 5.5,  "max": 7.5,  "ideal_min": 5.8,  "ideal_max": 7.0},
        "sunlight_hours":    {"min": 4.0,  "max": 9.0,  "ideal_min": 5.5,  "ideal_max": 8.5},
        "light_pct":         {"min": 33.0, "max": 75.0, "ideal_min": 46.0, "ideal_max": 71.0},
        "avg_yield":         4100.0,
        "top25_yield":       5700.0,
        "total_days_avg":    120,
    },
    "Cotton": {
        "temperature_c":     {"min": 15.0, "max": 34.0, "ideal_min": 22.0, "ideal_max": 32.0},
        "humidity_pct":      {"min": 42.0, "max": 90.0, "ideal_min": 55.0, "ideal_max": 78.0},
        "soil_moisture_pct": {"min": 11.0, "max": 43.0, "ideal_min": 18.0, "ideal_max": 38.0},
        "ph_level":          {"min": 5.6,  "max": 7.2,  "ideal_min": 6.0,  "ideal_max": 7.0},
        "sunlight_hours":    {"min": 4.6,  "max": 9.8,  "ideal_min": 6.0,  "ideal_max": 9.0},
        "light_pct":         {"min": 38.0, "max": 82.0, "ideal_min": 50.0, "ideal_max": 75.0},
        "avg_yield":         4200.0,
        "top25_yield":       5400.0,
        "total_days_avg":    118,
    },
    "Rice": {
        "temperature_c":     {"min": 15.0, "max": 34.0, "ideal_min": 22.0, "ideal_max": 30.0},
        "humidity_pct":      {"min": 40.0, "max": 84.0, "ideal_min": 55.0, "ideal_max": 80.0},
        "soil_moisture_pct": {"min": 10.0, "max": 44.0, "ideal_min": 25.0, "ideal_max": 42.0},
        "ph_level":          {"min": 5.6,  "max": 7.0,  "ideal_min": 5.8,  "ideal_max": 6.8},
        "sunlight_hours":    {"min": 4.4,  "max": 9.8,  "ideal_min": 5.5,  "ideal_max": 9.0},
        "light_pct":         {"min": 37.0, "max": 82.0, "ideal_min": 46.0, "ideal_max": 75.0},
        "avg_yield":         4200.0,
        "top25_yield":       5700.0,
        "total_days_avg":    112,
    },
}

SENSOR_WEIGHTS = {
    "soil_moisture_pct": 0.30,
    "temperature_c":     0.25,
    "humidity_pct":      0.20,
    "ph_level":          0.15,
    "light_pct":         0.10,
}
