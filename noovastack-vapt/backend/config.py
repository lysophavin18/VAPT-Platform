"""
NoovaStack VAPT Platform - Configuration Settings
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    APP_NAME: str = "NoovaStack VAPT Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://noovastack:noovastack_secure_2024!@localhost:5432/noovastack_vapt",
    )
    DATABASE_URL_SYNC: str = os.getenv(
        "DATABASE_URL_SYNC",
        "postgresql://noovastack:noovastack_secure_2024!@localhost:5432/noovastack_vapt",
    )

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production-please!!")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION: int = 3600
    REFRESH_TOKEN_EXPIRATION: int = 604800

    MAX_CONCURRENT_SCANS: int = 5
    SCAN_TIMEOUT: int = 3600
    RESULTS_DIR: str = "/app/results"

    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "ollama")
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "http://192.168.220.204:11434/v1")
    AI_API_KEY: str = os.getenv("AI_API_KEY", "ollama")
    AI_MODEL: str = os.getenv("AI_MODEL", "qwen3-coder:30b-64k")
    AI_TIMEOUT_SECONDS: int = int(os.getenv("AI_TIMEOUT_SECONDS", "240"))
    AI_MAX_OUTPUT_TOKENS: int = int(os.getenv("AI_MAX_OUTPUT_TOKENS", "4096"))
    AI_TEMPERATURE: float = float(os.getenv("AI_TEMPERATURE", "0.2"))

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
