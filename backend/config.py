from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./daxi.db"
    OPENAI_API_KEY: Optional[str] = None
    SECRET_KEY: str = "changeme-in-production-use-a-long-random-string"
    CHROMA_PATH: str = "./chroma_db"
    UPLOAD_DIR: str = "./uploads"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    RESEND_API_KEY: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:8081"
    EMAIL_FROM: str = "Daxi <noreply@daxi.app>"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
