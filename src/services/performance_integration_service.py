"""
Performance Integration Service for ISH Chat Backend
Integrates all performance optimization components into a unified system
"""
import asyncio
import logging
import time
import json
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List, Callable, Union
from dataclasses import dataclass, field
from contextlib import asynccontextmanager
from functools import wraps
import psutil
import redis.asyncio as redis_async

from .advanced_cache_service import AdvancedCacheService, AdvancedCacheConfig
from .connection_pool_service import ConnectionPoolService, PoolConfig
from .advanced_performance_service import AdvancedPerformanceService, PerformanceThresholds
from .async_task_service import AsyncProcessingService, AsyncTaskScheduler
from .performance_benchmark_service import PerformanceBenchmarkService, BenchmarkConfig
from .redis_cache_service import RedisCacheService, CacheConfig

logger = logging.getLogger(__name__)

@dataclass
class PerformanceIntegrationConfig:
    """Configuration for performance integration"""
    # Cache Configuration
    enable_advanced_caching: bool = True
    enable_redis_caching: bool = True
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # Connection Pool Configuration
    enable_connection_pooling: bool = True
    db_max_connections: int = 50
    http_max_connections: int = 200
    redis_max_connections: int = 100

    # Performance Monitoring Configuration
    enable_monitoring: bool = True
    monitoring_interval: int = 60
    enable_prometheus: bool = True

    # Async Processing Configuration
    enable_async_processing: bool = True
    max_async_workers: int = 100
    enable_task_scheduler: bool = True

    # Benchmarking Configuration
    enable_benchmarking: bool = True
    auto_benchmark_interval: int = 3600  # 1 hour

    # Performance Thresholds
    response_time_threshold: float = 500.0  # ms
    error_rate_threshold: float = 1.0  # %
    memory_threshold: float = 80.0  # %
    cpu_threshold: float = 70.0  # %

class PerformanceIntegrationService:
    """Main performance integration service"""

    def __init__(self, config: PerformanceIntegrationConfig = None):
        self.config = config or PerformanceIntegrationConfig()
        self.initialized = False

        # Service instances
        self.advanced_cache_service = None
        self.redis_cache_service = None
        self.connection_pool_service = None
        self.performance_service = None
        self.async_processing_service = None
        self.task_scheduler = None
        self.benchmark_service = None

        # Redis client
        self.redis_client = None

        # Background tasks
        self.background_tasks = set()
        self.running = False

        # Metrics and status
        self.startup_time = None
        self.last_health_check = None
        self.optimization_stats = {
            'cache_hits': 0,
            'cache_misses': 0,
            'connection_pool_hits': 0,
            'async_tasks_processed': 0,
            'total_requests': 0,
            'optimization_savings': 0.0
        }

    async def initialize(self, database_url: str = None) -> None:
        """Initialize all performance optimization services"""
        if self.initialized:
            return

        logger.info("Initializing performance integration service")
        self.startup_time = datetime.utcnow()

        try:
            # Initialize Redis client
            if self.config.enable_redis_caching or self.config.enable_advanced_caching:
                await self._initialize_redis()

            # Initialize caching services
            if self.config.enable_advanced_caching:
                await self._initialize_advanced_cache()

            if self.config.enable_redis_caching:
                await self._initialize_redis_cache()

            # Initialize connection pooling
            if self.config.enable_connection_pooling:
                await self._initialize_connection_pooling(database_url)

            # Initialize performance monitoring
            if self.config.enable_monitoring:
                await self._initialize_performance_monitoring()

            # Initialize async processing
            if self.config.enable_async_processing:
                await self._initialize_async_processing()

            # Initialize task scheduler
            if self.config.enable_task_scheduler:
                await self._initialize_task_scheduler()

            # Initialize benchmarking
            if self.config.enable_benchmarking:
                await self._initialize_benchmarking()

            # Start background tasks
            await self._start_background_tasks()

            self.initialized = True
            logger.info("Performance integration service initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize performance integration service: {e}")
            raise

    async def _initialize_redis(self) -> None:
        """Initialize Redis client"""
        try:
            self.redis_client = redis_async.Redis(
                host=self.config.redis_host,
                port=self.config.redis_port,
                db=self.config.redis_db,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5,
                retry_on_timeout=True
            )

            # Test connection
            await self.redis_client.ping()
            logger.info("Redis client initialized")

        except Exception as e:
            logger.error(f"Failed to initialize Redis client: {e}")
            raise

    async def _initialize_advanced_cache(self) -> None:
        """Initialize advanced cache service"""
        cache_config = AdvancedCacheConfig(
            redis_host=self.config.redis_host,
            redis_port=self.config.redis_port,
            redis_db=self.config.redis_db,
            enable_semantic_caching=True,
            enable_metrics=self.config.enable_monitoring
        )

        self.advanced_cache_service = AdvancedCacheService(cache_config)
        await self.advanced_cache_service.connect()
        logger.info("Advanced cache service initialized")

    async def _initialize_redis_cache(self) -> None:
        """Initialize Redis cache service"""
        cache_config = CacheConfig(
            host=self.config.redis_host,
            port=self.config.redis_port,
            db=self.config.redis_db,
            enable_metrics=self.config.enable_monitoring
        )

        self.redis_cache_service = RedisCacheService(cache_config)
        await self.redis_cache_service.connect()
        logger.info("Redis cache service initialized")

    async def _initialize_connection_pooling(self, database_url: str) -> None:
        """Initialize connection pooling service"""
        pool_config = PoolConfig(
            db_max_connections=self.config.db_max_connections,
            http_max_connections=self.config.http_max_connections,
            redis_max_connections=self.config.redis_max_connections,
            enable_metrics=self.config.enable_monitoring,
            enable_health_checks=True
        )

        self.connection_pool_service = ConnectionPoolService(pool_config)
        await self.connection_pool_service.initialize(database_url)
        logger.info("Connection pool service initialized")

    async def _initialize_performance_monitoring(self) -> None:
        """Initialize performance monitoring service"""
        thresholds = PerformanceThresholds(
            response_time_p95_threshold=self.config.response_time_threshold,
            error_rate_threshold=self.config.error_rate_threshold,
            memory_usage_threshold=self.config.memory_threshold,
            cpu_usage_threshold=self.config.cpu_threshold
        )

        self.performance_service = AdvancedPerformanceService(thresholds)
        await self.performance_service.start()
        logger.info("Performance monitoring service initialized")

    async def _initialize_async_processing(self) -> None:
        """Initialize async processing service"""
        self.async_processing_service = AsyncProcessingService({
            'max_workers': self.config.max_async_workers,
            'enable_metrics': self.config.enable_monitoring
        })

        await self.async_processing_service.start(self.redis_client)
        logger.info("Async processing service initialized")

    async def _initialize_task_scheduler(self) -> None:
        """Initialize task scheduler"""
        self.task_scheduler = AsyncTaskScheduler()
        await self.task_scheduler.start()

        # Schedule periodic optimization tasks
        self.task_scheduler.schedule_task(
            'cache_cleanup',
            self._perform_cache_cleanup,
            300  # Every 5 minutes
        )

        self.task_scheduler.schedule_task(
            'performance_optimization',
            self._perform_performance_optimization,
            600  # Every 10 minutes
        )

        logger.info("Task scheduler initialized")

    async def _initialize_benchmarking(self) -> None:
        """Initialize benchmarking service"""
        self.benchmark_service = PerformanceBenchmarkService()
        logger.info("Benchmarking service initialized")

    async def _start_background_tasks(self) -> None:
        """Start background maintenance tasks"""
        self.running = True

        # Health check task
        health_task = asyncio.create_task(self._health_check_loop())
        self.background_tasks.add(health_task)
        health_task.add_done_callback(self.background_tasks.discard)

        # Metrics collection task
        metrics_task = asyncio.create_task(self._metrics_collection_loop())
        self.background_tasks.add(metrics_task)
        metrics_task.add_done_callback(self.background_tasks.discard)

        # Auto-benchmarking task
        if self.config.auto_benchmark_interval > 0:
            benchmark_task = asyncio.create_task(self._auto_benchmark_loop())
            self.background_tasks.add(benchmark_task)
            benchmark_task.add_done_callback(self.background_tasks.discard)

        logger.info("Background tasks started")

    async def shutdown(self) -> None:
        """Shutdown all services"""
        logger.info("Shutting down performance integration service")

        self.running = False

        # Cancel background tasks
        for task in self.background_tasks:
            task.cancel()

        if self.background_tasks:
            await asyncio.gather(*self.background_tasks, return_exceptions=True)

        # Shutdown services
        if self.task_scheduler:
            await self.task_scheduler.stop()

        if self.async_processing_service:
            await self.async_processing_service.stop()

        if self.performance_service:
            await self.performance_service.stop()

        if self.connection_pool_service:
            await self.connection_pool_service.close()

        if self.advanced_cache_service:
            await self.advanced_cache_service.disconnect()

        if self.redis_cache_service:
            await self.redis_cache_service.disconnect()

        if self.redis_client:
            await self.redis_client.close()

        self.initialized = False
        logger.info("Performance integration service shutdown complete")

    @asynccontextmanager
    async def monitored_request(self, operation: str, **tags):
        """Context manager for monitored operations"""
        if not self.performance_service:
            yield
            return

        start_time = time.time()
        try:
            yield
            duration = time.time() - start_time

            # Record success metrics
            self.performance_service.record_request(
                method="API",
                endpoint=operation,
                status_code=200,
                response_time=duration,
                **tags
            )

            self.optimization_stats['total_requests'] += 1

        except Exception as e:
            duration = time.time() - start_time

            # Record error metrics
            self.performance_service.record_request(
                method="API",
                endpoint=operation,
                status_code=500,
                response_time=duration,
                error=str(e),
                **tags
            )

            self.optimization_stats['total_requests'] += 1
            raise

    async def cached_request(
        self,
        cache_key: str,
        operation: Callable,
        ttl: int = 3600,
        use_advanced_cache: bool = True
    ) -> Any:
        """Execute operation with caching"""
        cache_service = None

        # Choose cache service
        if use_advanced_cache and self.advanced_cache_service:
            cache_service = self.advanced_cache_service
        elif self.redis_cache_service:
            cache_service = self.redis_cache_service

        if not cache_service:
            # No caching available, execute directly
            return await operation() if asyncio.iscoroutinefunction(operation) else operation()

        async with self.monitored_request("cached_request", cache_key=cache_key):
            # Try to get from cache
            cached_result = await cache_service.get(cache_key)
            if cached_result is not None:
                self.optimization_stats['cache_hits'] += 1
                logger.debug(f"Cache hit for key: {cache_key}")
                return cached_result

            # Cache miss, execute operation
            self.optimization_stats['cache_misses'] += 1
            logger.debug(f"Cache miss for key: {cache_key}")

            result = await operation() if asyncio.iscoroutinefunction(operation) else operation()

            # Cache the result
            await cache_service.set(cache_key, result, ttl)

            return result

    async def execute_with_connection_pool(
        self,
        operation: Callable,
        pool_type: str = "database",
        **kwargs
    ) -> Any:
        """Execute operation with connection pooling"""
        if not self.connection_pool_service:
            return await operation() if asyncio.iscoroutinefunction(operation) else operation()

        async with self.monitored_request("pooled_operation", pool_type=pool_type):
            if pool_type == "database":
                async with await self.connection_pool_service.get_database_session() as session:
                    return await operation(session, **kwargs)
            elif pool_type == "http":
                client = await self.connection_pool_service.get_http_client()
                return await operation(client, **kwargs)
            elif pool_type == "redis":
                client = await self.connection_pool_service.get_redis_client()
                return await operation(client, **kwargs)
            else:
                # Execute directly for unknown pool types
                return await operation() if asyncio.iscoroutinefunction(operation) else operation()

            self.optimization_stats['connection_pool_hits'] += 1

    async def submit_async_task(
        self,
        func: Callable,
        args: tuple = (),
        kwargs: dict = None,
        priority = None,
        **task_kwargs
    ) -> str:
        """Submit async task for background processing"""
        if not self.async_processing_service:
            # Execute immediately if no async processing available
            result = await func(*args, **(kwargs or {}))
            return f"immediate-{time.time()}"

        task_id = await self.async_processing_service.submit_task(
            func=func,
            args=args,
            kwargs=kwargs or {},
            priority=priority,
            **task_kwargs
        )

        self.optimization_stats['async_tasks_processed'] += 1
        return task_id

    async def get_comprehensive_status(self) -> Dict[str, Any]:
        """Get comprehensive status of all performance services"""
        status = {
            'integration_service': {
                'initialized': self.initialized,
                'running': self.running,
                'startup_time': self.startup_time.isoformat() if self.startup_time else None,
                'uptime_seconds': (datetime.utcnow() - self.startup_time).total_seconds() if self.startup_time else 0
            },
            'optimization_stats': self.optimization_stats.copy(),
            'services': {}
        }

        # Cache services status
        if self.advanced_cache_service:
            status['services']['advanced_cache'] = await self.advanced_cache_service.health_check()

        if self.redis_cache_service:
            status['services']['redis_cache'] = await self.redis_cache_service.health_check()

        # Connection pool status
        if self.connection_pool_service:
            status['services']['connection_pool'] = await self.connection_pool_service.health_check()

        # Performance monitoring status
        if self.performance_service:
            metrics = await self.performance_service.get_performance_report(duration=300)
            status['services']['performance_monitoring'] = {
                'status': 'active',
                'recent_metrics': metrics['metrics'],
                'system_metrics': metrics['system'],
                'alerts': metrics['alerts']
            }

        # Async processing status
        if self.async_processing_service:
            status['services']['async_processing'] = await self.async_processing_service.get_service_status()

        # Benchmarking status
        if self.benchmark_service:
            status['services']['benchmarking'] = {
                'status': 'active',
                'recent_benchmarks': self.benchmark_service.get_benchmark_history(limit=5)
            }

        return status

    async def _health_check_loop(self) -> None:
        """Background health check loop"""
        while self.running:
            try:
                # Perform comprehensive health check
                status = await self.get_comprehensive_status()
                self.last_health_check = datetime.utcnow()

                # Log any issues
                for service_name, service_status in status.get('services', {}).items():
                    if isinstance(service_status, dict) and service_status.get('status') in ['unhealthy', 'degraded']:
                        logger.warning(f"Service {service_name} is {service_status['status']}")

                await asyncio.sleep(60)  # Check every minute

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check error: {e}")
                await asyncio.sleep(60)

    async def _metrics_collection_loop(self) -> None:
        """Background metrics collection loop"""
        while self.running:
            try:
                if self.performance_service:
                    # Record system metrics
                    cpu_percent = psutil.cpu_percent()
                    memory = psutil.virtual_memory()

                    self.performance_service.metrics_collector.set_gauge("system_cpu", cpu_percent)
                    self.performance_service.metrics_collector.set_gauge("system_memory", memory.percent)

                await asyncio.sleep(self.config.monitoring_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Metrics collection error: {e}")
                await asyncio.sleep(60)

    async def _auto_benchmark_loop(self) -> None:
        """Background auto-benchmarking loop"""
        while self.running:
            try:
                # Run basic performance benchmark
                if self.benchmark_service and hasattr(self, '_get_benchmark_config'):
                    config = await self._get_benchmark_config()
                    if config:
                        await self.benchmark_service.run_benchmark(config)

                await asyncio.sleep(self.config.auto_benchmark_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Auto-benchmark error: {e}")
                await asyncio.sleep(300)  # Wait 5 minutes on error

    async def _perform_cache_cleanup(self) -> None:
        """Perform cache cleanup"""
        try:
            if self.redis_cache_service:
                await self.redis_cache_service.cleanup_expired_keys()

            if self.advanced_cache_service:
                await self.advanced_cache_service._cleanup_expired_keys()

            logger.info("Cache cleanup completed")

        except Exception as e:
            logger.error(f"Cache cleanup error: {e}")

    async def _perform_performance_optimization(self) -> None:
        """Perform automatic performance optimizations"""
        try:
            # Get current performance metrics
            if self.performance_service:
                report = await self.performance_service.get_performance_report()

                # Check for optimization opportunities
                recommendations = report.get('recommendations', [])

                if recommendations:
                    logger.info(f"Performance recommendations: {recommendations}")

                # Update optimization stats
                self.optimization_stats['optimization_savings'] += len(recommendations)

        except Exception as e:
            logger.error(f"Performance optimization error: {e}")

    async def _get_benchmark_config(self) -> Optional[BenchmarkConfig]:
        """Get benchmark configuration for auto-benchmarking"""
        # This should be customized based on your application
        return BenchmarkConfig(
            name="auto-health-check",
            description="Automated health check benchmark",
            target_url="http://localhost:8000/health",
            concurrent_users=10,
            duration_seconds=30,
            method="GET"
        )

# Global instance
performance_integration = PerformanceIntegrationService()

# Decorators for easy integration
def optimized_request(
    cache_key: str = None,
    cache_ttl: int = 3600,
    use_connection_pool: bool = True,
    pool_type: str = "database",
    use_async: bool = False
):
    """Decorator for optimized request processing"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key if not provided
            key = cache_key or f"{func.__module__}.{func.__name__}:{hash(str(args) + str(sorted(kwargs.items())))}"

            # Use async processing if requested
            if use_async:
                return await performance_integration.submit_async_task(
                    func=func,
                    args=args,
                    kwargs=kwargs
                )

            # Use caching
            async def operation():
                if use_connection_pool:
                    return await performance_integration.execute_with_connection_pool(
                        operation=func,
                        pool_type=pool_type,
                        *args,
                        **kwargs
                    )
                else:
                    return await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)

            return await performance_integration.cached_request(
                cache_key=key,
                operation=operation,
                ttl=cache_ttl
            )

        return wrapper
    return decorator

def cached_ai_response(provider: str, model: str, ttl: int = 3600):
    """Decorator for caching AI responses"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key based on query
            query = args[0] if args else kwargs.get('query', '')
            cache_key = f"ai_response:{provider}:{model}:{hash(query)}"

            async def operation():
                return await func(*args, **kwargs)

            return await performance_integration.cached_request(
                cache_key=cache_key,
                operation=operation,
                ttl=ttl,
                use_advanced_cache=True
            )

        return wrapper
    return decorator

def background_task(priority=None):
    """Decorator for background task execution"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await performance_integration.submit_async_task(
                func=func,
                args=args,
                kwargs=kwargs,
                priority=priority
            )
        return wrapper
    return decorator