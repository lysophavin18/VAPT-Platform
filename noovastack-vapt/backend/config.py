"""
NoovaStack VAPT Platform - Configuration Settings
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import Optional
import os
from urllib.parse import urlsplit


INSECURE_SECRET_KEYS = {
    "change-me-in-production-please!!",
    "change-this-to-a-secure-random-string-in-production-min-32-chars!!",
}

INSECURE_ADMIN_PASSWORDS = {
    "adminsecure2024!",
}


class Settings(BaseSettings):
    APP_NAME: str = "NoovaStack VAPT Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str
    DATABASE_URL_SYNC: str

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

    SECRET_KEY: str
    INITIAL_ADMIN_PASSWORD: Optional[str] = None
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION: int = 3600
    REFRESH_TOKEN_EXPIRATION: int = 604800
    CORS_ORIGINS: str = "http://localhost:3000"

    MAX_CONCURRENT_SCANS: int = 5
    SCAN_TIMEOUT: int = 3600
    RESULTS_DIR: str = "/app/results"

    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "deepseek")
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "https://api.deepseek.com")
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")
    AI_MODEL: str = os.getenv("AI_MODEL", "deepseek-chat")
    AI_TIMEOUT_SECONDS: int = int(os.getenv("AI_TIMEOUT_SECONDS", "240"))
    AI_MAX_OUTPUT_TOKENS: int = int(os.getenv("AI_MAX_OUTPUT_TOKENS", "4096"))
    AI_TEMPERATURE: float = float(os.getenv("AI_TEMPERATURE", "0.2"))

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        if len(value) < 32 or value.lower() in INSECURE_SECRET_KEYS:
            raise ValueError("SECRET_KEY must be at least 32 characters and not a known default")
        return value

    @field_validator("INITIAL_ADMIN_PASSWORD", mode="before")
    @classmethod
    def validate_initial_admin_password(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if len(value) < 12:
            raise ValueError("INITIAL_ADMIN_PASSWORD must be at least 12 characters")
        if value.lower() in INSECURE_ADMIN_PASSWORDS:
            raise ValueError("INITIAL_ADMIN_PASSWORD must not be a known default")
        return value

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        if not origins:
            raise ValueError("CORS_ORIGINS must contain at least one origin")

        for origin in origins:
            try:
                parsed = urlsplit(origin)
                parsed.port
            except ValueError as exc:
                raise ValueError(f"Invalid CORS origin: {origin}") from exc
            if (
                origin == "*"
                or parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(f"Invalid CORS origin: {origin}")
        return ",".join(dict.fromkeys(origin.rstrip("/") for origin in origins))

    @property
    def cors_origins(self) -> list[str]:
        return self.CORS_ORIGINS.split(",")

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
