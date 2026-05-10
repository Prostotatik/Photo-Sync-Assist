from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).parent


class Settings(BaseSettings):
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/data/agrosync.db"
    GEMINI_API_KEY: str = ""
    ROBOFLOW_API_KEY: str = ""
    DATASET_PATH: str = str(BASE_DIR / "data" / "Smart_Farming_dataset.csv")
    ML_MODELS_DIR: str = str(BASE_DIR / "ml" / "saved_models")
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = BASE_DIR / ".env"
        env_file_encoding = "utf-8"


settings = Settings()
