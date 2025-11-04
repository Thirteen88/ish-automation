"""
PostgreSQL configuration for ISH Chat backend
Replaces SQLite configuration with PostgreSQL cluster settings
"""

import os
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class PostgreSQLSettings(BaseSettings):
    """PostgreSQL database configuration for cluster"""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="allow"
    )

    # Primary database connection
    postgres_host: str = Field(default="localhost", env="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, env="POSTGRES_PORT")
    postgres_database: str = Field(default="ish_chat", env="POSTGRES_DATABASE")
    postgres_user: str = Field(default="postgres", env="POSTGRES_USER")
    postgres_password: str = Field(default="", env="POSTGRES_PASSWORD")

    # Read replica configuration
    postgres_read_replicas: List[str] = Field(
        default=["localhost:5433", "localhost:5434"],
        env="POSTGRES_READ_REPLICAS"
    )

    # Connection pooling
    postgres_pool_size: int = Field(default=20, env="POSTGRES_POOL_SIZE")
    postgres_max_overflow: int = Field(default=30, env="POSTGRES_MAX_OVERFLOW")
    postgres_pool_timeout: int = Field(default=30, env="POSTGRES_POOL_TIMEOUT")
    postgres_pool_recycle: int = Field(default=3600, env="POSTGRES_POOL_RECYCLE")

    # PgBouncer configuration
    pgbouncer_host: str = Field(default="localhost", env="PGBOUNCER_HOST")
    pgbouncer_port: int = Field(default=6432, env="PGBOUNCER_PORT")
    pgbouncer_user: str = Field(default="ish_chat_app", env="PGBOUNCER_USER")
    pgbouncer_password: str = Field(default="", env="PGBOUNCER_PASSWORD")

    # HAProxy configuration
    haproxy_write_host: str = Field(default="localhost", env="HAPROXY_WRITE_HOST")
    haproxy_write_port: int = Field(default=5000, env="HAPROXY_WRITE_PORT")
    haproxy_read_host: str = Field(default="localhost", env="HAPROXY_READ_HOST")
    haproxy_read_port: int = Field(default=5001, env="HAPROXY_READ_PORT")

    # SSL configuration
    postgres_sslmode: str = Field(default="prefer", env="POSTGRES_SSLMODE")
    postgres_sslcert: Optional[str] = Field(default=None, env="POSTGRES_SSLCERT")
    postgres_sslkey: Optional[str] = Field(default=None, env="POSTGRES_SSLKEY")
    postgres_sslrootcert: Optional[str] = Field(default=None, env="POSTGRES_SSLROOTCERT")

    # Connection settings
    postgres_connect_timeout: int = Field(default=10, env="POSTGRES_CONNECT_TIMEOUT")
    postgres_command_timeout: int = Field(default=30, env="POSTGRES_COMMAND_TIMEOUT")
    postgres_statement_timeout: int = Field(default=30000, env="POSTGRES_STATEMENT_TIMEOUT")

    # Multi-instance configuration
    instance_id: str = Field(default="default", env="INSTANCE_ID")
    instance_name: str = Field(default="Default Instance", env="INSTANCE_NAME")
    instance_type: str = Field(default="production", env="INSTANCE_TYPE")

    # Failover configuration
    enable_failover: bool = Field(default=True, env="ENABLE_FAILOVER")
    failover_timeout: int = Field(default=5, env="FAILOVER_TIMEOUT")
    max_retry_attempts: int = Field(default=3, env="MAX_RETRY_ATTEMPTS")
    retry_delay: float = Field(default=1.0, env="RETRY_DELAY")

    # Monitoring configuration
    enable_query_logging: bool = Field(default=True, env="ENABLE_QUERY_LOGGING")
    slow_query_threshold: float = Field(default=1.0, env="SLOW_QUERY_THRESHOLD")
    connection_health_check_interval: int = Field(default=30, env="CONNECTION_HEALTH_CHECK_INTERVAL")

    @field_validator('postgres_read_replicas', mode='before')
    def parse_replicas(cls, v):
        if isinstance(v, str):
            return [replica.strip() for replica in v.split(',')]
        return v

    @property
    def postgres_url(self) -> str:
        """Build PostgreSQL connection URL for primary"""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_database}"
        )

    @property
    def postgres_url_with_ssl(self) -> str:
        """Build PostgreSQL connection URL with SSL options"""
        url = self.postgres_url
        ssl_params = []

        if self.postgres_sslmode:
            ssl_params.append(f"sslmode={self.postgres_sslmode}")
        if self.postgres_sslcert:
            ssl_params.append(f"sslcert={self.postgres_sslcert}")
        if self.postgres_sslkey:
            ssl_params.append(f"sslkey={self.postgres_sslkey}")
        if self.postgres_sslrootcert:
            ssl_params.append(f"sslrootcert={self.postgres_sslrootcert}")

        if ssl_params:
            url += "?" + "&".join(ssl_params)

        return url

    @property
    def pgbouncer_url(self) -> str:
        """Build PgBouncer connection URL"""
        return (
            f"postgresql://{self.pgbouncer_user}:{self.pgbouncer_password}"
            f"@{self.pgbouncer_host}:{self.pgbouncer_port}/{self.postgres_database}"
        )

    @property
    def haproxy_write_url(self) -> str:
        """Build HAProxy write connection URL"""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.haproxy_write_host}:{self.haproxy_write_port}/{self.postgres_database}"
        )

    @property
    def haproxy_read_url(self) -> str:
        """Build HAProxy read connection URL"""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.haproxy_read_host}:{self.haproxy_read_port}/{self.postgres_database}"
        )

    def get_replica_urls(self) -> List[str]:
        """Get list of read replica URLs"""
        replica_urls = []
        for replica in self.postgres_read_replicas:
            if ':' in replica:
                host, port = replica.split(':', 1)
                try:
                    port = int(port)
                except ValueError:
                    port = 5432
            else:
                host = replica
                port = 5432

            url = (
                f"postgresql://{self.postgres_user}:{self.postgres_password}"
                f"@{host}:{port}/{self.postgres_database}"
            )
            replica_urls.append(url)

        return replica_urls

# Global PostgreSQL settings instance
postgresql_settings = PostgreSQLSettings()

# Database configuration dictionary (for backward compatibility)
DATABASE_CONFIG = {
    "url": postgresql_settings.postgres_url_with_ssl,
    "echo": False,  # Set to True for SQL logging in development
    "pool_pre_ping": True,
    "pool_recycle": postgres_settings.postgres_pool_recycle,
    "pool_size": postgres_settings.postgres_pool_size,
    "max_overflow": postgres_settings.postgres_max_overflow,
    "pool_timeout": postgres_settings.postgres_pool_timeout,
    "connect_args": {
        "connect_timeout": postgres_settings.postgres_connect_timeout,
        "command_timeout": postgres_settings.postgres_command_timeout,
        "options": f"-csearch_path=public,app_current_instance_id={postgresql_settings.instance_id}"
    }
}

# Read replica configuration
READ_REPLICA_CONFIG = {
    "echo": False,
    "pool_pre_ping": True,
    "pool_recycle": postgres_settings.postgres_pool_recycle,
    "pool_size": postgres_settings.postgres_pool_size // 2,  # Smaller pool for replicas
    "max_overflow": postgres_settings.postgres_max_overflow // 2,
    "pool_timeout": postgres_settings.postgres_pool_timeout,
    "connect_args": {
        "connect_timeout": postgres_settings.postgres_connect_timeout,
        "command_timeout": postgres_settings.postgres_command_timeout,
        "options": f"-csearch_path=public,app_current_instance_id={postgresql_settings.instance_id}"
    }
}

# PgBouncer configuration (for connection pooling)
PGBOUNCER_CONFIG = {
    "url": postgresql_settings.pgbouncer_url,
    "echo": False,
    "pool_pre_ping": True,
    "pool_recycle": 300,  # PgBouncer handles connection pooling
    "pool_size": 5,  # Small local pool
    "max_overflow": 10,
    "pool_timeout": postgres_settings.postgres_pool_timeout,
    "connect_args": {
        "connect_timeout": postgres_settings.postgres_connect_timeout,
        "command_timeout": postgres_settings.postgres_command_timeout,
        "options": f"-csearch_path=public,app_current_instance_id={postgresql_settings.instance_id}"
    }
}

# Connection strings for different use cases
PRIMARY_CONNECTION_STRING = postgresql_settings.postgres_url_with_ssl
READ_CONNECTION_STRING = postgresql_settings.haproxy_read_url
PGBOUNCER_CONNECTION_STRING = postgresql_settings.pgbouncer_url

# Migration configuration
MIGRATION_CONFIG = {
    "sqlite_path": os.path.join(os.path.dirname(__file__), "../../ish_chat.db"),
    "postgres_host": postgres_settings.postgres_host,
    "postgres_port": postgres_settings.postgres_port,
    "postgres_database": postgres_settings.postgres_database,
    "postgres_user": postgres_settings.postgres_user,
    "postgres_password": postgres_settings.postgres_password,
    "instance_id": postgres_settings.instance_id,
    "batch_size": 1000,
    "dry_run": False
}