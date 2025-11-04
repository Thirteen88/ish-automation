"""
Performance Optimization Main Module for ISH Chat Backend
This module provides a unified entry point for all performance optimizations
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Optional, Dict, List
from datetime import datetime

from .services.performance_integration_service import (
    PerformanceIntegrationService,
    PerformanceIntegrationConfig,
    performance_integration,
    optimized_request,
    cached_ai_response,
    background_task
)
from .services.advanced_cache_service import AdvancedCacheService, advanced_cache
from .services.connection_pool_service import ConnectionPoolService, connection_pool_service
from .services.advanced_performance_service import AdvancedPerformanceService, advanced_performance_monitor
from .services.async_task_service import AsyncProcessingService, async_processing_service, task_scheduler
from .services.performance_benchmark_service import PerformanceBenchmarkService, performance_benchmark
from .config.settings import settings

logger = logging.getLogger(__name__)

class PerformanceManager:
    """Main performance manager for ISH Chat backend"""

    def __init__(self):
        self.integration_service = None
        self.config = None
        self.initialized = False

    async def initialize(self, database_url: str = None) -> None:
        """Initialize all performance optimization systems"""
        if self.initialized:
            return

        logger.info("Initializing Performance Manager for ISH Chat Backend")

        try:
            # Create configuration
            self.config = PerformanceIntegrationConfig(
                # Redis Configuration
                enable_advanced_caching=True,
                enable_redis_caching=True,
                redis_host=os.getenv("REDIS_HOST", "localhost"),
                redis_port=int(os.getenv("REDIS_PORT", "6379")),
                redis_db=int(os.getenv("REDIS_DB", "0")),

                # Connection Pool Configuration
                enable_connection_pooling=True,
                db_max_connections=int(os.getenv("DB_MAX_CONNECTIONS", "50")),
                http_max_connections=int(os.getenv("HTTP_MAX_CONNECTIONS", "200")),
                redis_max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "100")),

                # Performance Monitoring Configuration
                enable_monitoring=True,
                monitoring_interval=int(os.getenv("MONITORING_INTERVAL", "60")),
                enable_prometheus=os.getenv("ENABLE_PROMETHEUS", "true").lower() == "true",

                # Async Processing Configuration
                enable_async_processing=True,
                max_async_workers=int(os.getenv("MAX_ASYNC_WORKERS", "100")),
                enable_task_scheduler=True,

                # Benchmarking Configuration
                enable_benchmarking=os.getenv("ENABLE_BENCHMARKING", "true").lower() == "true",
                auto_benchmark_interval=int(os.getenv("AUTO_BENCHMARK_INTERVAL", "3600")),

                # Performance Thresholds
                response_time_threshold=float(os.getenv("RESPONSE_TIME_THRESHOLD", "500.0")),
                error_rate_threshold=float(os.getenv("ERROR_RATE_THRESHOLD", "1.0")),
                memory_threshold=float(os.getenv("MEMORY_THRESHOLD", "80.0")),
                cpu_threshold=float(os.getenv("CPU_THRESHOLD", "70.0"))
            )

            # Initialize integration service
            self.integration_service = PerformanceIntegrationService(self.config)
            await self.integration_service.initialize(database_url or settings.database_url)

            # Update global instances
            global performance_integration
            performance_integration = self.integration_service

            self.initialized = True
            logger.info("Performance Manager initialized successfully")

            # Log status
            status = await self.get_status()
            logger.info(f"Performance optimization status: {status['integration_service']['status']}")

        except Exception as e:
            logger.error(f"Failed to initialize Performance Manager: {e}")
            raise

    async def shutdown(self) -> None:
        """Shutdown all performance optimization systems"""
        if not self.initialized:
            return

        logger.info("Shutting down Performance Manager")

        try:
            if self.integration_service:
                await self.integration_service.shutdown()

            self.initialized = False
            logger.info("Performance Manager shutdown complete")

        except Exception as e:
            logger.error(f"Error during Performance Manager shutdown: {e}")

    async def get_status(self) -> Dict[str, Any]:
        """Get comprehensive performance status"""
        if not self.initialized:
            return {"status": "not_initialized"}

        return await self.integration_service.get_comprehensive_status()

    async def get_metrics(self) -> Dict[str, Any]:
        """Get performance metrics"""
        if not self.initialized:
            return {"error": "Performance Manager not initialized"}

        if self.integration_service.performance_service:
            return await self.integration_service.performance_service.get_performance_report()

        return {"error": "Performance monitoring not available"}

    async def run_benchmark(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Run performance benchmark"""
        if not self.initialized:
            return {"error": "Performance Manager not initialized"}

        if not self.integration_service.benchmark_service:
            return {"error": "Benchmarking not available"}

        from .services.performance_benchmark_service import BenchmarkConfig

        benchmark_config = BenchmarkConfig(
            name=config.get("name", "custom-benchmark"),
            description=config.get("description", "Custom performance benchmark"),
            target_url=config.get("target_url"),
            concurrent_users=config.get("concurrent_users", 50),
            duration_seconds=config.get("duration_seconds", 60),
            method=config.get("method", "GET"),
            headers=config.get("headers", {}),
            payload=config.get("payload")
        )

        result = await self.integration_service.benchmark_service.run_benchmark(benchmark_config)
        return self.integration_service.benchmark_service.generate_performance_report(result)

    async def optimize_system(self) -> Dict[str, Any]:
        """Run system optimization"""
        if not self.initialized:
            return {"error": "Performance Manager not initialized"}

        optimizations = []

        try:
            # Cache cleanup
            await self.integration_service._perform_cache_cleanup()
            optimizations.append("cache_cleanup")

            # Performance optimization
            await self.integration_service._perform_performance_optimization()
            optimizations.append("performance_optimization")

            # Get updated metrics
            metrics = await self.get_metrics()

            return {
                "status": "success",
                "optimizations_performed": optimizations,
                "metrics": metrics,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"System optimization error: {e}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }

# Global performance manager instance
performance_manager = PerformanceManager()

@asynccontextmanager
async def performance_context(database_url: str = None):
    """Context manager for performance optimization"""
    try:
        await performance_manager.initialize(database_url)
        yield performance_manager
    finally:
        await performance_manager.shutdown()

# Decorators for easy use
def fast_endpoint(cache_ttl: int = 300, use_cache: bool = True):
    """Decorator for fast endpoints with caching"""
    def decorator(func):
        return optimized_request(
            cache_ttl=cache_ttl,
            use_connection_pool=True,
            use_async=False
        )(func)
    return decorator

def ai_optimized(provider: str, model: str, cache_ttl: int = 3600):
    """Decorator for AI-optimized functions"""
    return cached_ai_response(provider=provider, model=model, ttl=cache_ttl)

def async_job(priority=None):
    """Decorator for async background jobs"""
    return background_task(priority=priority)

# Export main functions and classes
__all__ = [
    'PerformanceManager',
    'performance_manager',
    'performance_context',
    'fast_endpoint',
    'ai_optimized',
    'async_job',
    'performance_integration',
    'advanced_cache',
    'connection_pool_service',
    'advanced_performance_monitor',
    'async_processing_service',
    'task_scheduler',
    'performance_benchmark'
]

# Utility functions
async def quick_health_check() -> Dict[str, Any]:
    """Quick health check of performance systems"""
    try:
        if not performance_manager.initialized:
            return {"status": "not_initialized", "message": "Performance Manager not initialized"}

        status = await performance_manager.get_status()
        integration_status = status.get('integration_service', {})

        # Check if all critical services are healthy
        services_status = status.get('services', {})
        unhealthy_services = [
            name for name, service_status in services_status.items()
            if isinstance(service_status, dict) and service_status.get('status') in ['unhealthy', 'degraded']
        ]

        if unhealthy_services:
            return {
                "status": "degraded",
                "message": f"Services with issues: {', '.join(unhealthy_services)}",
                "uptime": integration_status.get('uptime_seconds', 0),
                "services": services_status
            }
        else:
            return {
                "status": "healthy",
                "message": "All performance systems operational",
                "uptime": integration_status.get('uptime_seconds', 0),
                "optimization_stats": status.get('optimization_stats', {})
            }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

async def get_performance_recommendations() -> List[str]:
    """Get current performance recommendations"""
    try:
        if not performance_manager.initialized:
            return ["Performance Manager not initialized"]

        metrics = await performance_manager.get_metrics()
        return metrics.get('recommendations', [])

    except Exception as e:
        logger.error(f"Error getting performance recommendations: {e}")
        return [f"Error getting recommendations: {e}"]

# CLI-like functions for manual testing
async def test_cache_performance():
    """Test cache performance"""
    logger.info("Testing cache performance...")

    async def sample_operation():
        await asyncio.sleep(0.1)  # Simulate work
        return {"data": "test_result", "timestamp": datetime.utcnow().isoformat()}

    # Test without cache
    start_time = datetime.utcnow()
    for _ in range(10):
        await sample_operation()
    no_cache_time = (datetime.utcnow() - start_time).total_seconds()

    # Test with cache
    start_time = datetime.utcnow()
    for _ in range(10):
        await performance_integration.cached_request(
            cache_key="test_key",
            operation=sample_operation,
            ttl=300
        )
    with_cache_time = (datetime.utcnow() - start_time).total_seconds()

    improvement = ((no_cache_time - with_cache_time) / no_cache_time) * 100

    logger.info(f"Cache performance test completed:")
    logger.info(f"  Without cache: {no_cache_time:.3f}s")
    logger.info(f"  With cache: {with_cache_time:.3f}s")
    logger.info(f"  Improvement: {improvement:.1f}%")

    return {
        "without_cache": no_cache_time,
        "with_cache": with_cache_time,
        "improvement_percent": improvement
    }

async def test_async_processing():
    """Test async processing performance"""
    logger.info("Testing async processing...")

    async def sample_task(task_id: int):
        await asyncio.sleep(0.5)  # Simulate work
        return {"task_id": task_id, "result": f"completed_{task_id}"}

    # Submit multiple tasks
    start_time = datetime.utcnow()
    task_ids = []

    for i in range(10):
        task_id = await performance_integration.submit_async_task(
            func=sample_task,
            args=(i,)
        )
        task_ids.append(task_id)

    # Wait for all tasks to complete
    results = []
    for task_id in task_ids:
        try:
            result = await performance_integration.async_processing_service.task_queue.get_task_result(task_id, timeout=10)
            results.append(result)
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")

    total_time = (datetime.utcnow() - start_time).total_seconds()

    logger.info(f"Async processing test completed:")
    logger.info(f"  Tasks submitted: 10")
    logger.info(f"  Tasks completed: {len(results)}")
    logger.info(f"  Total time: {total_time:.3f}s")
    logger.info(f"  Average time per task: {total_time / 10:.3f}s")

    return {
        "tasks_submitted": 10,
        "tasks_completed": len(results),
        "total_time": total_time,
        "average_time_per_task": total_time / 10
    }

# Main initialization function
async def initialize_performance_systems(database_url: str = None) -> None:
    """Initialize all performance systems (call this in your main application startup)"""
    await performance_manager.initialize(database_url)
    logger.info("Performance systems initialized and ready")

# Main shutdown function
async def shutdown_performance_systems() -> None:
    """Shutdown all performance systems (call this in your application shutdown)"""
    await performance_manager.shutdown()
    logger.info("Performance systems shutdown complete")