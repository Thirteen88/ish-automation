"""
Advanced Connection Pooling Service for ISH Chat Backend
Optimizes database, HTTP, Redis, and external service connections for high concurrency
"""
import asyncio
import logging
import time
from typing import Any, Optional, Dict, List, Union, Callable
from dataclasses import dataclass, field
from contextlib import asynccontextmanager
from contextvars import ContextVar
import asyncpg
import httpx
import redis.asyncio as redis_async
import aioredis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool, QueuePool
import threading
import weakref
from collections import defaultdict, deque
import psutil
import gc

logger = logging.getLogger(__name__)

# Context variable for connection tracking
connection_context: ContextVar[Dict[str, Any]] = ContextVar('connection_context', default={})

@dataclass
class PoolConfig:
    """Configuration for connection pools"""
    # Database Pool Configuration
    db_min_connections: int = 5
    db_max_connections: int = 50
    db_connection_timeout: float = 30.0
    db_command_timeout: float = 30.0
    db_max_inactive_connection_lifetime: float = 300.0
    db_health_check_interval: float = 30.0
    db_enable_pool_pre_ping: bool = True

    # HTTP Pool Configuration
    http_pool_size: int = 100
    http_max_keepalive_connections: int = 20
    http_keepalive_expiry: float = 5.0
    http_max_connections: int = 200
    http_timeout: float = 30.0
    http_max_redirects: int = 3
    http_retries: int = 3
    http_backoff_factor: float = 0.3

    # Redis Pool Configuration
    redis_pool_size: int = 50
    redis_max_connections: int = 100
    redis_socket_timeout: float = 5.0
    redis_socket_connect_timeout: float = 5.0
    redis_retry_on_timeout: bool = True
    redis_health_check_interval: float = 30.0

    # Pool Monitoring
    enable_metrics: bool = True
    metrics_collection_interval: float = 60.0
    enable_health_checks: bool = True
    health_check_interval: float = 30.0

    # Performance Optimization
    enable_connection_warming: bool = True
    warmup_connection_count: int = 3
    enable_dynamic_scaling: bool = True
    scaling_threshold_cpu: float = 70.0
    scaling_threshold_memory: float = 80.0

@dataclass
class PoolMetrics:
    """Connection pool metrics"""
    total_connections: int = 0
    active_connections: int = 0
    idle_connections: int = 0
    failed_connections: int = 0
    connection_errors: int = 0
    average_response_time: float = 0.0
    peak_connections: int = 0
    total_requests: int = 0
    connection_timeout_errors: int = 0

class DynamicConnectionPool:
    """Dynamic connection pool with auto-scaling"""

    def __init__(
        self,
        pool_factory: Callable,
        min_size: int,
        max_size: int,
        health_check_interval: float = 30.0,
        enable_dynamic_scaling: bool = True
    ):
        self.pool_factory = pool_factory
        self.min_size = min_size
        self.max_size = max_size
        self.health_check_interval = health_check_interval
        self.enable_dynamic_scaling = enable_dynamic_scaling

        self.pool = None
        self.current_size = min_size
        self.metrics = PoolMetrics()
        self.health_check_task = None
        self.scaling_task = None
        self.lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Initialize the connection pool"""
        async with self.lock:
            if self.pool is None:
                self.pool = await self.pool_factory(self.min_size)

                # Start background tasks
                if self.health_check_interval > 0:
                    self.health_check_task = asyncio.create_task(self._health_check_loop())

                if self.enable_dynamic_scaling:
                    self.scaling_task = asyncio.create_task(self._scaling_loop())

                logger.info(f"Dynamic pool initialized with {self.min_size} connections")

    async def acquire(self) -> Any:
        """Acquire a connection from the pool"""
        if not self.pool:
            await self.initialize()

        try:
            connection = await self.pool.acquire()
            self.metrics.active_connections += 1
            self.metrics.total_requests += 1
            self.metrics.peak_connections = max(
                self.metrics.peak_connections,
                self.metrics.active_connections
            )
            return connection
        except Exception as e:
            self.metrics.connection_errors += 1
            logger.error(f"Failed to acquire connection: {e}")
            raise

    async def release(self, connection: Any) -> None:
        """Release a connection back to the pool"""
        if self.pool and connection:
            try:
                await self.pool.release(connection)
                self.metrics.active_connections -= 1
            except Exception as e:
                self.metrics.connection_errors += 1
                logger.error(f"Failed to release connection: {e}")

    @asynccontextmanager
    async def connection(self):
        """Context manager for acquiring/releasing connections"""
        conn = None
        try:
            conn = await self.acquire()
            yield conn
        finally:
            if conn:
                await self.release(conn)

    async def scale_up(self, increment: int = 1) -> None:
        """Scale up the pool size"""
        async with self.lock:
            new_size = min(self.current_size + increment, self.max_size)
            if new_size > self.current_size:
                # Implementation depends on pool type
                logger.info(f"Scaling pool up from {self.current_size} to {new_size}")
                self.current_size = new_size

    async def scale_down(self, decrement: int = 1) -> None:
        """Scale down the pool size"""
        async with self.lock:
            new_size = max(self.current_size - decrement, self.min_size)
            if new_size < self.current_size:
                logger.info(f"Scaling pool down from {self.current_size} to {new_size}")
                self.current_size = new_size

    async def _health_check_loop(self) -> None:
        """Background health check loop"""
        while True:
            try:
                await asyncio.sleep(self.health_check_interval)
                await self._perform_health_check()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check error: {e}")

    async def _scaling_loop(self) -> None:
        """Background scaling loop"""
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute
                await self._check_scaling_needs()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scaling check error: {e}")

    async def _perform_health_check(self) -> None:
        """Perform health check on pool connections"""
        # Implementation depends on pool type
        pass

    async def _check_scaling_needs(self) -> None:
        """Check if pool needs scaling based on system metrics"""
        try:
            cpu_percent = psutil.cpu_percent()
            memory_percent = psutil.virtual_memory().percent

            # Scale up if under high load
            if cpu_percent > 70 or memory_percent > 80:
                await self.scale_up()

            # Scale down if under low load
            elif cpu_percent < 30 and memory_percent < 50:
                if self.metrics.active_connections < self.current_size * 0.5:
                    await self.scale_down()

        except Exception as e:
            logger.error(f"Scaling check error: {e}")

    async def close(self) -> None:
        """Close the pool and cleanup"""
        if self.health_check_task:
            self.health_check_task.cancel()

        if self.scaling_task:
            self.scaling_task.cancel()

        if self.pool:
            await self.pool.close()
            self.pool = None

        logger.info("Dynamic pool closed")

    def get_metrics(self) -> PoolMetrics:
        """Get pool metrics"""
        return self.metrics

class DatabasePoolManager:
    """Manages database connection pools with advanced features"""

    def __init__(self, config: PoolConfig):
        self.config = config
        self.pools = {}
        self.metrics = defaultdict(PoolMetrics)
        self.engine = None
        self.session_factory = None

    async def initialize(self, database_url: str) -> None:
        """Initialize database connection pool"""
        try:
            # Create async engine with optimized settings
            self.engine = create_async_engine(
                database_url,
                pool_size=self.config.db_min_connections,
                max_overflow=self.config.db_max_connections - self.config.db_min_connections,
                pool_pre_ping=self.config.db_enable_pool_pre_ping,
                pool_recycle=self.config.db_max_inactive_connection_lifetime,
                echo=False,
                # Disable SQLAlchemy's own connection pooling if using external pool
                poolclass=QueuePool,
                pool_timeout=self.config.db_connection_timeout,
            )

            # Create session factory
            self.session_factory = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False
            )

            # Warm up connections
            if self.config.enable_connection_warming:
                await self._warmup_connections()

            logger.info("Database pool manager initialized")

        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            raise

    async def _warmup_connections(self) -> None:
        """Warm up database connections"""
        try:
            connections = []
            for _ in range(self.config.warmup_connection_count):
                async with self.session_factory() as session:
                    await session.execute("SELECT 1")
                    connections.append(session)

            logger.info(f"Warmed up {len(connections)} database connections")

        except Exception as e:
            logger.error(f"Connection warmup error: {e}")

    @asynccontextmanager
    async def get_session(self):
        """Get database session with automatic cleanup"""
        if not self.session_factory:
            raise RuntimeError("Database pool not initialized")

        session = self.session_factory()
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def execute_query(self, query: str, params: Dict = None) -> Any:
        """Execute database query with connection from pool"""
        start_time = time.time()

        try:
            async with self.get_session() as session:
                result = await session.execute(query, params or {})
                response_time = time.time() - start_time

                # Update metrics
                self.metrics["default"].total_requests += 1
                self.metrics["default"].average_response_time = (
                    (self.metrics["default"].average_response_time * (self.metrics["default"].total_requests - 1) + response_time) /
                    self.metrics["default"].total_requests
                )

                return result

        except Exception as e:
            self.metrics["default"].connection_errors += 1
            logger.error(f"Database query error: {e}")
            raise

    async def get_pool_status(self) -> Dict[str, Any]:
        """Get database pool status"""
        if not self.engine:
            return {"status": "not_initialized"}

        pool = self.engine.pool
        return {
            "status": "initialized",
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
            "invalid": pool.invalid()
        }

    async def close(self) -> None:
        """Close database connections"""
        if self.engine:
            await self.engine.dispose()
            self.engine = None
            self.session_factory = None

class HTTPPoolManager:
    """Manages HTTP connection pools for external services"""

    def __init__(self, config: PoolConfig):
        self.config = config
        self.pools = {}
        self.metrics = defaultdict(PoolMetrics)

    def get_client(self, base_url: str = None, **kwargs) -> httpx.AsyncClient:
        """Get HTTP client with connection pooling"""
        client_key = base_url or "default"

        if client_key not in self.pools:
            # Create optimized client configuration
            client_config = {
                "limits": httpx.Limits(
                    max_keepalive_connections=self.config.http_max_keepalive_connections,
                    max_connections=self.config.http_max_connections,
                    keepalive_expiry=self.config.http_keepalive_expiry
                ),
                "timeout": httpx.Timeout(
                    connect=self.config.http_timeout,
                    read=self.config.http_timeout,
                    write=self.config.http_timeout,
                    pool=self.config.http_timeout
                ),
                "follow_redirects": True,
                "max_redirects": self.config.http_max_redirects,
                **kwargs
            }

            if base_url:
                client_config["base_url"] = base_url

            self.pools[client_key] = httpx.AsyncClient(**client_config)

        return self.pools[client_key]

    async def request(
        self,
        method: str,
        url: str,
        base_url: str = None,
        **kwargs
    ) -> httpx.Response:
        """Make HTTP request with connection pooling and retries"""
        client = self.get_client(base_url)
        client_key = base_url or "default"

        start_time = time.time()

        for attempt in range(self.config.http_retries + 1):
            try:
                response = await client.request(method, url, **kwargs)
                response_time = time.time() - start_time

                # Update metrics
                self.metrics[client_key].total_requests += 1
                self.metrics[client_key].average_response_time = (
                    (self.metrics[client_key].average_response_time * (self.metrics[client_key].total_requests - 1) + response_time) /
                    self.metrics[client_key].total_requests
                )

                return response

            except (httpx.TimeoutException, httpx.ConnectError) as e:
                if attempt == self.config.http_retries:
                    self.metrics[client_key].connection_timeout_errors += 1
                    raise

                # Exponential backoff
                backoff_time = self.config.http_backoff_factor * (2 ** attempt)
                await asyncio.sleep(backoff_time)

            except Exception as e:
                self.metrics[client_key].connection_errors += 1
                logger.error(f"HTTP request error: {e}")
                raise

    async def close(self) -> None:
        """Close all HTTP clients"""
        for client in self.pools.values():
            await client.aclose()
        self.pools.clear()

class RedisPoolManager:
    """Manages Redis connection pools"""

    def __init__(self, config: PoolConfig):
        self.config = config
        self.pools = {}
        self.metrics = defaultdict(PoolMetrics)

    async def get_pool(self, host: str = "localhost", port: int = 6379, db: int = 0, **kwargs) -> redis_async.Redis:
        """Get Redis connection pool"""
        pool_key = f"{host}:{port}:{db}"

        if pool_key not in self.pools:
            pool = redis_async.ConnectionPool(
                host=host,
                port=port,
                db=db,
                max_connections=self.config.redis_max_connections,
                socket_timeout=self.config.redis_socket_timeout,
                socket_connect_timeout=self.config.redis_socket_connect_timeout,
                retry_on_timeout=self.config.redis_retry_on_timeout,
                **kwargs
            )

            self.pools[pool_key] = redis_async.Redis(connection_pool=pool)

        return self.pools[pool_key]

    async def get_redis(self, **kwargs) -> redis_async.Redis:
        """Get Redis client with connection pooling"""
        return await self.get_pool(**kwargs)

    async def close(self) -> None:
        """Close all Redis connections"""
        for redis_client in self.pools.values():
            await redis_client.close()
        self.pools.clear()

class ConnectionPoolService:
    """Main connection pool service managing all connection types"""

    def __init__(self, config: PoolConfig = None):
        self.config = config or PoolConfig()
        self.db_manager = DatabasePoolManager(self.config)
        self.http_manager = HTTPPoolManager(self.config)
        self.redis_manager = RedisPoolManager(self.config)
        self._initialized = False
        self._metrics_task = None

    async def initialize(self, database_url: str = None) -> None:
        """Initialize all connection pool managers"""
        try:
            if database_url:
                await self.db_manager.initialize(database_url)

            self._initialized = True

            # Start metrics collection
            if self.config.enable_metrics:
                self._metrics_task = asyncio.create_task(self._collect_metrics())

            logger.info("Connection pool service initialized")

        except Exception as e:
            logger.error(f"Failed to initialize connection pool service: {e}")
            raise

    async def get_database_session(self):
        """Get database session"""
        if not self._initialized:
            raise RuntimeError("Connection pool service not initialized")
        return self.db_manager.get_session()

    async def get_http_client(self, base_url: str = None, **kwargs) -> httpx.AsyncClient:
        """Get HTTP client"""
        if not self._initialized:
            raise RuntimeError("Connection pool service not initialized")
        return self.http_manager.get_client(base_url, **kwargs)

    async def get_redis_client(self, **kwargs) -> redis_async.Redis:
        """Get Redis client"""
        if not self._initialized:
            raise RuntimeError("Connection pool service not initialized")
        return await self.redis_manager.get_redis(**kwargs)

    async def execute_database_query(self, query: str, params: Dict = None) -> Any:
        """Execute database query"""
        return await self.db_manager.execute_query(query, params)

    async def make_http_request(
        self,
        method: str,
        url: str,
        base_url: str = None,
        **kwargs
    ) -> httpx.Response:
        """Make HTTP request"""
        return await self.http_manager.request(method, url, base_url, **kwargs)

    async def _collect_metrics(self) -> None:
        """Collect metrics from all pool managers"""
        while True:
            try:
                await asyncio.sleep(self.config.metrics_collection_interval)

                # Collect metrics from all managers
                metrics = await self.get_all_metrics()

                # Log metrics if needed
                if self.config.enable_metrics:
                    logger.debug(f"Connection pool metrics: {metrics}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Metrics collection error: {e}")

    async def get_all_metrics(self) -> Dict[str, Any]:
        """Get comprehensive metrics from all pool managers"""
        metrics = {
            "timestamp": time.time(),
            "database": {},
            "http": {},
            "redis": {},
            "system": {
                "cpu_percent": psutil.cpu_percent(),
                "memory_percent": psutil.virtual_memory().percent,
                "active_connections": len(asyncio.all_tasks())
            }
        }

        # Database metrics
        try:
            db_status = await self.db_manager.get_pool_status()
            metrics["database"] = {
                "pool_status": db_status,
                "metrics": self.db_manager.metrics["default"].__dict__
            }
        except Exception as e:
            metrics["database"]["error"] = str(e)

        # HTTP metrics
        try:
            http_metrics = {}
            for client_key, client_metrics in self.http_manager.metrics.items():
                http_metrics[client_key] = client_metrics.__dict__
            metrics["http"] = {
                "active_clients": len(self.http_manager.pools),
                "metrics": http_metrics
            }
        except Exception as e:
            metrics["http"]["error"] = str(e)

        # Redis metrics
        try:
            redis_metrics = {}
            for pool_key, pool_metrics in self.redis_manager.metrics.items():
                redis_metrics[pool_key] = pool_metrics.__dict__
            metrics["redis"] = {
                "active_pools": len(self.redis_manager.pools),
                "metrics": redis_metrics
            }
        except Exception as e:
            metrics["redis"]["error"] = str(e)

        return metrics

    async def health_check(self) -> Dict[str, Any]:
        """Perform comprehensive health check"""
        health = {
            "status": "healthy",
            "timestamp": time.time(),
            "checks": {}
        }

        # Database health check
        try:
            if self.db_manager.engine:
                async with self.db_manager.get_session() as session:
                    await session.execute("SELECT 1")
                health["checks"]["database"] = {"status": "healthy"}
            else:
                health["checks"]["database"] = {"status": "not_initialized"}
        except Exception as e:
            health["checks"]["database"] = {"status": "unhealthy", "error": str(e)}
            health["status"] = "degraded"

        # HTTP client health check
        try:
            client = self.http_manager.get_client()
            response = await client.get("https://httpbin.org/status/200", timeout=5.0)
            if response.status_code == 200:
                health["checks"]["http"] = {"status": "healthy"}
            else:
                health["checks"]["http"] = {"status": "degraded", "status_code": response.status_code}
                health["status"] = "degraded"
        except Exception as e:
            health["checks"]["http"] = {"status": "unhealthy", "error": str(e)}
            health["status"] = "degraded"

        # Redis health check
        try:
            redis_client = await self.redis_manager.get_redis()
            await redis_client.ping()
            health["checks"]["redis"] = {"status": "healthy"}
        except Exception as e:
            health["checks"]["redis"] = {"status": "unhealthy", "error": str(e)}
            health["status"] = "degraded"

        return health

    async def close(self) -> None:
        """Close all connection pools"""
        try:
            # Cancel metrics task
            if self._metrics_task:
                self._metrics_task.cancel()

            # Close all managers
            await self.db_manager.close()
            await self.http_manager.close()
            await self.redis_manager.close()

            self._initialized = False
            logger.info("Connection pool service closed")

        except Exception as e:
            logger.error(f"Error closing connection pool service: {e}")

# Global instance
connection_pool_service = ConnectionPoolService()

# Decorators for automatic connection management
def with_database_session(pool_service: ConnectionPoolService = None):
    """Decorator to provide database session"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            service = pool_service or connection_pool_service
            async with await service.get_database_session() as session:
                return await func(session, *args, **kwargs)
        return wrapper
    return decorator

def with_http_client(base_url: str = None, pool_service: ConnectionPoolService = None):
    """Decorator to provide HTTP client"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            service = pool_service or connection_pool_service
            client = await service.get_http_client(base_url)
            return await func(client, *args, **kwargs)
        return wrapper
    return decorator