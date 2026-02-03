"""
VAPT Platform - Configuration Settings
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "VAPT Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://vapt_admin:VaptSecure2024!@localhost:5432/vapt_db"
    )
    
    # Redis
    REDIS_URL: str = os.getenv(
        "REDIS_URL",
        "redis://:VaptRedis2024!@localhost:6379/0"
    )
    
    # Celery
    CELERY_BROKER_URL: str = os.getenv(
        "CELERY_BROKER_URL",
        "redis://:VaptRedis2024!@localhost:6379/1"
    )
    CELERY_RESULT_BACKEND: str = os.getenv(
        "CELERY_RESULT_BACKEND",
        "redis://:VaptRedis2024!@localhost:6379/2"
    )
    
    # JWT Authentication
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION: int = 3600  # 1 hour
    REFRESH_TOKEN_EXPIRATION: int = 604800  # 7 days
    
    # Security Tools
    ZAP_API_URL: str = "http://zap:8080"
    ZAP_API_KEY: str = os.getenv("ZAP_API_KEY", "zap-api-key-2024")
    WPSCAN_API_TOKEN: Optional[str] = os.getenv("WPSCAN_API_TOKEN")
    
    # Scan Settings
    MAX_CONCURRENT_SCANS: int = 5
    SCAN_TIMEOUT: int = 3600
    RESULTS_DIR: str = "/app/results"
    
    # Docker
    DOCKER_NETWORK: str = "vapt-platform_vapt-network"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
