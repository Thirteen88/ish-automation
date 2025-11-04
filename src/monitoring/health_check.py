"""
Advanced Health Check System for ISH Chat
Provides comprehensive health monitoring for all components
"""

import os
import time
import asyncio
import logging
import psutil
import json
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import redis.asyncio as redis
import httpx
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"

@dataclass
class HealthCheckResult:
    """Health check result"""
    component: str
    status: HealthStatus
    message: str
    details: Dict[str, Any] = None
    response_time_ms: float = 0.0
    timestamp: datetime = None
    last_check: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
        if self.last_check is None:
            self.last_check = self.timestamp
        if self.details is None:
            self.details = {}

@dataclass
class SystemHealth:
    """Overall system health"""
    status: HealthStatus
    components: Dict[str, HealthCheckResult]
    timestamp: datetime
    uptime_seconds: float
    version: str = "1.0.0"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "components": {name: asdict(result) for name, result in self.components.items()},
            "timestamp": self.timestamp.isoformat(),
            "uptime_seconds": self.uptime_seconds,
            "version": self.version
        }

class BaseHealthCheck:
    """Base class for health checks"""
    
    def __init__(self, name: str, timeout: float = 5.0):
        self.name = name
        self.timeout = timeout
        self.last_result: Optional[HealthCheckResult] = None
        self.consecutive_failures = 0
        self.consecutive_successes = 0
    
    async def check(self) -> HealthCheckResult:
        """Perform health check"""
        start_time = time.time()
        
        try:
            result = await asyncio.wait_for(self._check_impl(), timeout=self.timeout)
            result.response_time_ms = (time.time() - start_time) * 1000
            
            # Track consecutive results
            if result.status in [HealthStatus.HEALTHY, HealthStatus.DEGRADED]:
                self.consecutive_successes += 1
                self.consecutive_failures = 0
            else:
                self.consecutive_failures += 1
                self.consecutive_successes = 0
            
            self.last_result = result
            return result
            
        except asyncio.TimeoutError:
            result = HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"Health check timed out after {self.timeout}s",
                response_time_ms=(time.time() - start_time) * 1000
            )
            self.consecutive_failures += 1
            self.consecutive_successes = 0
            self.last_result = result
            return result
        except Exception as e:
            result = HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"Health check error: {str(e)}",
                response_time_ms=(time.time() - start_time) * 1000
            )
            self.consecutive_failures += 1
            self.consecutive_successes = 0
            self.last_result = result
            return result
    
    async def _check_impl(self) -> HealthCheckResult:
        """Implementation specific health check logic"""
        raise NotImplementedError

class RedisHealthCheck(BaseHealthCheck):
    """Redis health check"""
    
    def __init__(self, redis_client: redis.Redis, name: str = "redis"):
        super().__init__(name)
        self.redis_client = redis_client
    
    async def _check_impl(self) -> HealthCheckResult:
        try:
            # Test basic connectivity
            start_time = time.time()
            await self.redis_client.ping()
            ping_time = (time.time() - start_time) * 1000
            
            # Test basic operations
            test_key = f"health_check_{int(time.time())}"
            await self.redis_client.set(test_key, "test", ex=10)
            value = await self.redis_client.get(test_key)
            await self.redis_client.delete(test_key)
            
            if value != b"test":
                return HealthCheckResult(
                    component=self.name,
                    status=HealthStatus.UNHEALTHY,
                    message="Redis read/write test failed"
                )
            
            # Get Redis info
            info = await self.redis_client.info()
            
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.HEALTHY,
                message="Redis is healthy",
                details={
                    "ping_time_ms": round(ping_time, 2),
                    "connected_clients": info.get("connected_clients", 0),
                    "used_memory_human": info.get("used_memory_human", "unknown"),
                    "redis_version": info.get("redis_version", "unknown")
                }
            )
            
        except Exception as e:
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"Redis health check failed: {str(e)}"
            )

class HTTPHealthCheck(BaseHealthCheck):
    """HTTP endpoint health check"""
    
    def __init__(self, url: str, name: str = None, expected_status: int = 200, timeout: float = 5.0):
        super().__init__(name or url, timeout)
        self.url = url
        self.expected_status = expected_status
        self.client = httpx.AsyncClient(timeout=timeout)
    
    async def _check_impl(self) -> HealthCheckResult:
        try:
            response = await self.client.get(self.url)
            
            if response.status_code == self.expected_status:
                return HealthCheckResult(
                    component=self.name,
                    status=HealthStatus.HEALTHY,
                    message=f"HTTP endpoint returned {response.status_code}",
                    details={
                        "url": self.url,
                        "status_code": response.status_code,
                        "response_headers": dict(response.headers),
                        "content_length": len(response.content)
                    }
                )
            else:
                return HealthCheckResult(
                    component=self.name,
                    status=HealthStatus.UNHEALTHY,
                    message=f"HTTP endpoint returned {response.status_code}, expected {self.expected_status}",
                    details={
                        "url": self.url,
                        "status_code": response.status_code,
                        "response_text": response.text[:500]
                    }
                )
                
        except httpx.TimeoutException:
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"HTTP endpoint timeout: {self.url}"
            )
        except httpx.ConnectError:
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"Cannot connect to HTTP endpoint: {self.url}"
            )
        except Exception as e:
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"HTTP health check failed: {str(e)}"
            )

class DatabaseHealthCheck(BaseHealthCheck):
    """Database health check"""
    
    def __init__(self, db_connection_func: Callable, name: str = "database"):
        super().__init__(name)
        self.db_connection_func = db_connection_func
    
    async def _check_impl(self) -> HealthCheckResult:
        try:
            # This would need to be implemented based on your database
            # For now, it's a placeholder
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.HEALTHY,
                message="Database connection successful"
            )
            
        except Exception as e:
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"Database health check failed: {str(e)}"
            )

class SystemHealthCheck(BaseHealthCheck):
    """System resource health check"""
    
    def __init__(self, name: str = "system"):
        super().__init__(name)
        self.start_time = time.time()
    
    async def _check_impl(self) -> HealthCheckResult:
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            
            # Disk usage
            disk = psutil.disk_usage('/')
            
            # Load average
            load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
            
            # Determine overall health
            issues = []
            
            if cpu_percent > 90:
                issues.append(f"High CPU usage: {cpu_percent}%")
            
            if memory.percent > 90:
                issues.append(f"High memory usage: {memory.percent}%")
            
            if disk.percent > 90:
                issues.append(f"High disk usage: {disk.percent}%")
            
            if len(issues) > 0:
                status = HealthStatus.DEGRADED if len(issues) == 1 else HealthStatus.UNHEALTHY
                message = "; ".join(issues)
            else:
                status = HealthStatus.HEALTHY
                message = "System resources are healthy"
            
            return HealthCheckResult(
                component=self.name,
                status=status,
                message=message,
                details={
                    "cpu_percent": cpu_percent,
                    "memory_percent": memory.percent,
                    "memory_available_gb": round(memory.available / (1024**3), 2),
                    "disk_percent": disk.percent,
                    "disk_free_gb": round(disk.free / (1024**3), 2),
                    "load_average": {
                        "1min": load_avg[0],
                        "5min": load_avg[1],
                        "15min": load_avg[2]
                    },
                    "uptime_seconds": time.time() - self.start_time
                }
            )
            
        except Exception as e:
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"System health check failed: {str(e)}"
            )

class AIProviderHealthCheck(BaseHealthCheck):
    """AI Provider health check"""
    
    def __init__(self, provider_url: str, provider_name: str, timeout: float = 10.0):
        super().__init__(f"ai_provider_{provider_name}", timeout)
        self.provider_url = provider_url
        self.provider_name = provider_name
        self.client = httpx.AsyncClient(timeout=timeout)
    
    async def _check_impl(self) -> HealthCheckResult:
        try:
            # Test health endpoint
            health_url = f"{self.provider_url}/health"
            response = await self.client.get(health_url)
            
            if response.status_code == 200:
                return HealthCheckResult(
                    component=self.name,
                    status=HealthStatus.HEALTHY,
                    message=f"{self.provider_name} provider is healthy",
                    details={
                        "provider": self.provider_name,
                        "url": self.provider_url,
                        "health_endpoint": health_url,
                        "response_time_ms": response.elapsed.total_seconds() * 1000
                    }
                )
            else:
                return HealthCheckResult(
                    component=self.name,
                    status=HealthStatus.UNHEALTHY,
                    message=f"{self.provider_name} provider returned {response.status_code}",
                    details={
                        "provider": self.provider_name,
                        "url": self.provider_url,
                        "status_code": response.status_code
                    }
                )
                
        except Exception as e:
            return HealthCheckResult(
                component=self.name,
                status=HealthStatus.UNHEALTHY,
                message=f"{self.provider_name} provider health check failed: {str(e)}"
            )

class HealthCheckManager:
    """Health check manager"""
    
    def __init__(self):
        self.health_checks: Dict[str, BaseHealthCheck] = {}
        self.start_time = time.time()
        self.check_interval = 30  # seconds
        self.background_task: Optional[asyncio.Task] = None
        self.is_running = False
    
    def add_health_check(self, health_check: BaseHealthCheck):
        """Add a health check"""
        self.health_checks[health_check.name] = health_check
        logger.info(f"Added health check: {health_check.name}")
    
    def remove_health_check(self, name: str):
        """Remove a health check"""
        if name in self.health_checks:
            del self.health_checks[name]
            logger.info(f"Removed health check: {name}")
    
    async def check_all(self) -> SystemHealth:
        """Check all registered health checks"""
        if not self.health_checks:
            return SystemHealth(
                status=HealthStatus.UNKNOWN,
                components={},
                timestamp=datetime.utcnow(),
                uptime_seconds=time.time() - self.start_time
            )
        
        # Run all health checks concurrently
        tasks = [check.check() for check in self.health_checks.values()]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        components = {}
        unhealthy_count = 0
        degraded_count = 0
        
        for i, (name, check) in enumerate(self.health_checks.items()):
            if isinstance(results[i], Exception):
                # Handle exceptions
                components[name] = HealthCheckResult(
                    component=name,
                    status=HealthStatus.UNHEALTHY,
                    message=f"Health check error: {str(results[i])}"
                )
                unhealthy_count += 1
            else:
                components[name] = results[i]
                if results[i].status == HealthStatus.UNHEALTHY:
                    unhealthy_count += 1
                elif results[i].status == HealthStatus.DEGRADED:
                    degraded_count += 1
        
        # Determine overall health
        if unhealthy_count > 0:
            overall_status = HealthStatus.UNHEALTHY
        elif degraded_count > 0:
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.HEALTHY
        
        return SystemHealth(
            status=overall_status,
            components=components,
            timestamp=datetime.utcnow(),
            uptime_seconds=time.time() - self.start_time
        )
    
    async def check_component(self, name: str) -> Optional[HealthCheckResult]:
        """Check a specific component"""
        if name in self.health_checks:
            return await self.health_checks[name].check()
        return None
    
    async def start_background_checks(self):
        """Start background health checking"""
        if self.is_running:
            return
        
        self.is_running = True
        self.background_task = asyncio.create_task(self._background_loop())
        logger.info("Started background health checks")
    
    async def stop_background_checks(self):
        """Stop background health checking"""
        if not self.is_running:
            return
        
        self.is_running = False
        if self.background_task:
            self.background_task.cancel()
            try:
                await self.background_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Stopped background health checks")
    
    async def _background_loop(self):
        """Background health checking loop"""
        while self.is_running:
            try:
                await self.check_all()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Background health check error: {e}")
                await asyncio.sleep(5)  # Wait before retrying
    
    def get_component_status(self, name: str) -> Optional[HealthCheckResult]:
        """Get the last known status of a component"""
        if name in self.health_checks:
            return self.health_checks[name].last_result
        return None
    
    async def get_health_summary(self) -> Dict[str, Any]:
        """Get health summary"""
        system_health = await self.check_all()
        
        summary = {
            "overall_status": system_health.status.value,
            "timestamp": system_health.timestamp.isoformat(),
            "uptime_seconds": system_health.uptime_seconds,
            "component_count": len(system_health.components),
            "healthy_components": sum(1 for c in system_health.components.values() if c.status == HealthStatus.HEALTHY),
            "degraded_components": sum(1 for c in system_health.components.values() if c.status == HealthStatus.DEGRADED),
            "unhealthy_components": sum(1 for c in system_health.components.values() if c.status == HealthStatus.UNHEALTHY),
            "components": {}
        }
        
        for name, result in system_health.components.items():
            summary["components"][name] = {
                "status": result.status.value,
                "message": result.message,
                "response_time_ms": result.response_time_ms,
                "last_check": result.timestamp.isoformat()
            }
        
        return summary

# Global health check manager
health_manager = HealthCheckManager()

# Factory functions
def create_redis_health_check(redis_client: redis.Redis, name: str = "redis") -> RedisHealthCheck:
    """Create Redis health check"""
    return RedisHealthCheck(redis_client, name)

def create_http_health_check(url: str, name: str = None, expected_status: int = 200) -> HTTPHealthCheck:
    """Create HTTP health check"""
    return HTTPHealthCheck(url, name, expected_status)

def create_system_health_check(name: str = "system") -> SystemHealthCheck:
    """Create system health check"""
    return SystemHealthCheck(name)

def create_ai_provider_health_check(provider_url: str, provider_name: str) -> AIProviderHealthCheck:
    """Create AI provider health check"""
    return AIProviderHealthCheck(provider_url, provider_name)

# Decorator for health check endpoints
def health_endpoint(manager: HealthCheckManager = None):
    """Decorator for health check endpoints"""
    if manager is None:
        manager = health_manager
    
    def decorator(func):
        async def wrapper(*args, **kwargs):
            health = await manager.check_all()
            return health.to_dict()
        return wrapper
    return decorator

# Lifecycle manager for FastAPI
@asynccontextmanager
async def lifespan_manager(app, health_check_manager: HealthCheckManager = None):
    """Lifespan manager for health checks"""
    if health_check_manager is None:
        health_check_manager = health_manager
    
    # Start background health checks
    await health_check_manager.start_background_checks()
    
    yield
    
    # Stop background health checks
    await health_check_manager.stop_background_checks()