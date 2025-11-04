"""
Configuration management for ISH chat integration
"""
import os
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings(BaseSettings):
    """Application settings"""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="allow"  # Allow extra fields from environment
    )

    # Basic Configuration
    app_name: str = "ISH Chat Integration"
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")

    # Server Configuration
    host: str = Field(default="0.0.0.0", alias="backend_host")
    port: int = Field(default=8000, alias="backend_port")
    api_key: str = Field(default="ish-chat-secure-key-2024", alias="backend_api_key")

    # CORS Configuration
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:8000"
    ]

    # Android Configuration
    default_timeout: int = Field(default=30, alias="android_timeout")
    screenshot_directory: str = Field(default="/tmp", alias="screenshot_dir")
    device_check_interval: int = Field(default=30, alias="device_check_interval")

    # Database Configuration
    database_url: str = Field(default="sqlite:///./ish_chat.db", env="DATABASE_URL")

    # PostgreSQL Configuration (overrides SQLite if provided)
    postgres_host: str = Field(default="localhost", env="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, env="POSTGRES_PORT")
    postgres_database: str = Field(default="ish_chat", env="POSTGRES_DATABASE")
    postgres_user: str = Field(default="postgres", env="POSTGRES_USER")
    postgres_password: str = Field(default="", env="POSTGRES_PASSWORD")

    # Use PostgreSQL if configured
    use_postgresql: bool = Field(default=False, env="USE_POSTGRESQL")

    # ZAI Configuration
    zai_api_key: Optional[str] = Field(default=None, env="ZAI_API_KEY")
    zai_api_url: str = Field(default="https://open.bigmodel.cn/api/paas/v4", env="ZAI_API_URL")
    zai_model: str = Field(default="glm-4", env="ZAI_MODEL")

    # OpenAI Configuration
    openai_api_key: Optional[str] = Field(default=None, env="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4", env="OPENAI_MODEL")
    openai_api_base: Optional[str] = Field(default=None, env="OPENAI_API_BASE")

    # Anthropic Configuration
    anthropic_api_key: Optional[str] = Field(default=None, env="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-3-sonnet-20240229", env="ANTHROPIC_MODEL")

    # Perplexity Configuration
    perplexity_package: str = "ai.perplexity.app.android"
    perplexity_search_delay: float = Field(default=1.0, env="PERPLEXITY_SEARCH_DELAY")
    perplexity_load_delay: float = Field(default=3.0, env="PERPLEXITY_LOAD_DELAY")

    # AI Configuration
    ai_timeout: int = Field(default=30, env="AI_TIMEOUT")
    ai_temperature: float = Field(default=0.7, env="AI_TEMPERATURE")
    ai_max_tokens: int = Field(default=1000, env="AI_MAX_TOKENS")

    # Rate Limiting
    rate_limit_per_minute: int = Field(default=60, env="RATE_LIMIT_PER_MINUTE")

    # File Upload Configuration
    max_file_size: int = Field(default=10 * 1024 * 1024, env="MAX_FILE_SIZE")  # 10MB
    allowed_file_types: List[str] = ["image/png", "image/jpeg", "image/jpg"]

    # WebSocket Configuration
    websocket_heartbeat_interval: int = Field(default=30, env="WEBSOCKET_HEARTBEAT_INTERVAL")

    # Cache Configuration
    cache_ttl: int = Field(default=3600, env="CACHE_TTL")  # 1 hour
    enable_cache: bool = Field(default=True, env="ENABLE_CACHE")

    # Monitoring Configuration
    enable_metrics: bool = Field(default=True, env="ENABLE_METRICS")
    metrics_port: int = Field(default=9090, env="METRICS_PORT")

    model_config = SettingsConfigDict(
        env_file = ".env",
        env_file_encoding = "utf-8",
        case_sensitive = False
    )

class DevelopmentSettings(Settings):
    """Development environment settings"""
    debug: bool = True
    log_level: str = "DEBUG"
    auto_reload: bool = True

class ProductionSettings(Settings):
    """Production environment settings"""
    debug: bool = False
    log_level: str = "WARNING"

class TestingSettings(Settings):
    """Testing environment settings"""
    database_url: str = "sqlite:///./test_ish_chat.db"
    debug: bool = True

def get_settings() -> Settings:
    """Get settings based on environment"""
    env = os.getenv("ENVIRONMENT", "development").lower()

    if env == "production":
        return ProductionSettings()
    elif env == "testing":
        return TestingSettings()
    else:
        return DevelopmentSettings()

# Global settings instance
settings = get_settings()

# Import PostgreSQL configuration
from .postgresql_settings import (
    DATABASE_CONFIG as POSTGRES_CONFIG,
    READ_REPLICA_CONFIG,
    PGBOUNCER_CONFIG,
    PRIMARY_CONNECTION_STRING,
    READ_CONNECTION_STRING,
    PGBOUNCER_CONNECTION_STRING,
    postgresql_settings
)

# Database configuration - choose between SQLite and PostgreSQL
if settings.use_postgresql and settings.postgres_password:
    # Use PostgreSQL configuration
    DATABASE_CONFIG = POSTGRES_CONFIG
    # Override connection URL if explicitly provided
    if settings.database_url and not settings.database_url.startswith('sqlite'):
        DATABASE_CONFIG["url"] = settings.database_url
else:
    # Use SQLite configuration (original)
    DATABASE_CONFIG = {
        "url": settings.database_url,
        "echo": settings.debug,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

# Logging configuration
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        },
        "detailed": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(module)s - %(funcName)s - %(message)s",
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        },
        "file": {
            "formatter": "detailed",
            "class": "logging.FileHandler",
            "filename": "ish_chat.log",
            "mode": "a",
        },
    },
    "root": {
        "level": settings.log_level,
        "handlers": ["default", "file"] if settings.debug else ["default"],
    },
}

# Rate limiting configuration
RATE_LIMIT_CONFIG = {
    "default": f"{settings.rate_limit_per_minute}/minute",
    "perplexity": "30/minute",
    "ai_generation": "20/minute",
    "screenshot": "60/minute",
}

# CORS configuration
CORS_CONFIG = {
    "allow_origins": settings.allowed_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}