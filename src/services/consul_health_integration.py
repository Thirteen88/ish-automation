"""
Consul Health Check Integration for ISH Chat System
Integrates with existing health monitoring and provides Consul-specific health checks
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import aiohttp
import psutil
import redis
from sqlalchemy.orm import Session
from sqlalchemy import text

from .consul_service_registry import ConsulServiceRegistry, HealthCheck, ServiceDefinition
from .consul_service_discovery import ConsulServiceDiscovery, ServiceEndpoint
from ..monitoring.health_check import HealthChecker, HealthStatus
from ..database.database import get_db

logger = logging.getLogger(__name__)

class HealthCheckType(Enum):
    """Health check types"""
    HTTP = "http"
    TCP = "tcp"
    GRPC = "grpc"
    SCRIPT = "script"
    DATABASE = "database"
    REDIS = "redis"
    CUSTOM = "custom"

@dataclass
class ConsulHealthCheck:
    """Consul health check definition"""
    check_id: str
    name: str
    service_id: Optional[str] = None
    check_type: HealthCheckType = HealthCheckType.HTTP
    target: str = ""
    interval: str = "10s"
    timeout: str = "5s"
    deregister_critical_service_after: str = "30s"
    success_before_passing: int = 1
    failures_before_critical: int = 3
    args: List[str] = field(default_factory=list)
    headers: Dict[str, str] = field(default_factory=dict)
    method: str = "GET"
    body: str = ""
    tls_skip_verify: bool = False
    grpc_use_tls: bool = False
    
    def to_consul_format(self) -> Dict[str, Any]:
        """Convert to Consul health check format"""
        check = {
            "ID": self.check_id,
            "Name": self.name,
            "Interval": self.interval,
            "Timeout": self.timeout,
            "DeregisterCriticalServiceAfter": self.deregister_critical_service_after,
            "SuccessBeforePassing": self.success_before_passing,
            "FailuresBeforeCritical": self.failures_before_critical,
        }
        
        if self.service_id:
            check["ServiceID"] = self.service_id
        
        # Add check type specific fields
        if self.check_type == HealthCheckType.HTTP:
            check["HTTP"] = self.target
            if self.headers:
                check["Header"] = self.headers
            if self.method != "GET":
                check["Method"] = self.method
            if self.body:
                check["Body"] = self.body
            if self.tls_skip_verify:
                check["TLSSkipVerify"] = self.tls_skip_verify
                
        elif self.check_type == HealthCheckType.TCP:
            check["TCP"] = self.target
            
        elif self.check_type == HealthCheckType.GRPC:
            check["GRPC"] = self.target
            if self.grpc_use_tls:
                check["GRPCUseTLS"] = self.grpc_use_tls
                
        elif self.check_type == HealthCheckType.SCRIPT:
            check["Args"] = self.args
        
        return check

@dataclass
class HealthCheckResult:
    """Health check execution result"""
    check_id: str
    status: str  # "passing", "warning", "critical"
    output: str
    timestamp: datetime
    execution_time: float
    service_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

class ConsulHealthIntegration:
    """Consul health check integration service"""
    
    def __init__(
        self,
        consul_registry: ConsulServiceRegistry,
        health_checker: Optional[HealthChecker] = None,
        redis_client: Optional[redis.Redis] = None
    ):
        self.registry = consul_registry
        self.health_checker = health_checker
        self.redis_client = redis_client
        
        # Health check definitions
        self.health_checks: Dict[str, ConsulHealthCheck] = {}
        
        # Background tasks
        self.health_monitor_task = None
        self.metrics_collection_task = None
        self._shutdown_event = asyncio.Event()
        
        # Configuration
        self.health_check_interval = 30
        self.metrics_interval = 60
        self.health_history_ttl = 3600  # 1 hour
        
    async def start(self):
        """Start health integration service"""
        logger.info("Starting Consul Health Integration")
        
        # Register built-in health checks
        await self._register_builtin_health_checks()
        
        # Start background tasks
        self.health_monitor_task = asyncio.create_task(self._health_monitor_loop())
        self.metrics_collection_task = asyncio.create_task(self._metrics_collection_loop())
        
        logger.info("Consul Health Integration started")
    
    async def stop(self):
        """Stop health integration service"""
        logger.info("Stopping Consul Health Integration")
        
        # Signal shutdown
        self._shutdown_event.set()
        
        # Cancel background tasks
        if self.health_monitor_task:
            self.health_monitor_task.cancel()
        if self.metrics_collection_task:
            self.metrics_collection_task.cancel()
        
        logger.info("Consul Health Integration stopped")
    
    async def register_health_check(self, health_check: ConsulHealthCheck) -> bool:
        """Register a health check with Consul"""
        
        try:
            self.health_checks[health_check.check_id] = health_check
            
            # Register with Consul
            consul_check = health_check.to_consul_format()
            
            success = await self.registry.consul_async.agent.check.register(consul_check)
            
            if success:
                logger.info(f"Registered health check: {health_check.check_id}")
                return True
            else:
                logger.error(f"Failed to register health check: {health_check.check_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error registering health check {health_check.check_id}: {str(e)}")
            return False
    
    async def deregister_health_check(self, check_id: str) -> bool:
        """Deregister a health check"""
        
        try:
            if check_id in self.health_checks:
                del self.health_checks[check_id]
            
            success = await self.registry.consul_async.agent.check.deregister(check_id)
            
            if success:
                logger.info(f"Deregistered health check: {check_id}")
                return True
            else:
                logger.error(f"Failed to deregister health check: {check_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error deregistering health check {check_id}: {str(e)}")
            return False
    
    async def execute_health_check(self, check_id: str) -> HealthCheckResult:
        """Execute a health check and return result"""
        
        if check_id not in self.health_checks:
            return HealthCheckResult(
                check_id=check_id,
                status="critical",
                output=f"Health check {check_id} not found",
                timestamp=datetime.utcnow(),
                execution_time=0.0
            )
        
        health_check = self.health_checks[check_id]
        start_time = time.time()
        
        try:
            if health_check.check_type == HealthCheckType.HTTP:
                result = await self._execute_http_check(health_check)
            elif health_check.check_type == HealthCheckType.TCP:
                result = await self._execute_tcp_check(health_check)
            elif health_check.check_type == HealthCheckType.DATABASE:
                result = await self._execute_database_check(health_check)
            elif health_check.check_type == HealthCheckType.REDIS:
                result = await self._execute_redis_check(health_check)
            elif health_check.check_type == HealthCheckType.CUSTOM:
                result = await self._execute_custom_check(health_check)
            else:
                result = HealthCheckResult(
                    check_id=check_id,
                    status="critical",
                    output=f"Unsupported health check type: {health_check.check_type}",
                    timestamp=datetime.utcnow(),
                    execution_time=time.time() - start_time
                )
            
            # Update Consul with result
            await self._update_consul_check_status(check_id, result)
            
            # Store result in Redis for analytics
            if self.redis_client:
                await self._store_health_result(result)
            
            return result
            
        except Exception as e:
            error_result = HealthCheckResult(
                check_id=check_id,
                status="critical",
                output=f"Health check execution failed: {str(e)}",
                timestamp=datetime.utcnow(),
                execution_time=time.time() - start_time
            )
            
            await self._update_consul_check_status(check_id, error_result)
            return error_result
    
    async def get_service_health_summary(self, service_id: str) -> Dict[str, Any]:
        """Get health summary for a service"""
        
        try:
            # Get health checks from Consul
            checks, index = await self.registry.consul_async.health.checks(service_id)
            
            summary = {
                "service_id": service_id,
                "overall_status": "passing",
                "total_checks": len(checks),
                "passing_checks": 0,
                "warning_checks": 0,
                "critical_checks": 0,
                "checks": [],
                "last_updated": datetime.utcnow().isoformat()
            }
            
            for check in checks:
                check_info = {
                    "check_id": check["CheckID"],
                    "name": check["Name"],
                    "status": check["Status"],
                    "output": check.get("Output", ""),
                    "timestamp": check.get("Timestamp", ""),
                }
                summary["checks"].append(check_info)
                
                # Count by status
                if check["Status"] == "passing":
                    summary["passing_checks"] += 1
                elif check["Status"] == "warning":
                    summary["warning_checks"] += 1
                elif check["Status"] == "critical":
                    summary["critical_checks"] += 1
            
            # Determine overall status
            if summary["critical_checks"] > 0:
                summary["overall_status"] = "critical"
            elif summary["warning_checks"] > 0:
                summary["overall_status"] = "warning"
            
            return summary
            
        except Exception as e:
            logger.error(f"Failed to get health summary for {service_id}: {str(e)}")
            return {
                "service_id": service_id,
                "overall_status": "unknown",
                "error": str(e)
            }
    
    async def _register_builtin_health_checks(self):
        """Register built-in health checks for core services"""
        
        # API Gateway health check
        await self.register_health_check(ConsulHealthCheck(
            check_id="api-gateway-health",
            name="API Gateway Health Check",
            service_id="api-gateway-1",
            check_type=HealthCheckType.HTTP,
            target="http://localhost:8000/health",
            interval="30s",
            timeout="10s"
        ))
        
        # Database health check
        await self.register_health_check(ConsulHealthCheck(
            check_id="database-health",
            name="Database Health Check",
            service_id="database-1",
            check_type=HealthCheckType.DATABASE,
            interval="30s",
            timeout="10s"
        ))
        
        # Redis health check
        if self.redis_client:
            await self.register_health_check(ConsulHealthCheck(
                check_id="redis-health",
                name="Redis Health Check",
                service_id="redis-1",
                check_type=HealthCheckType.REDIS,
                interval="30s",
                timeout="5s"
            ))
        
        # System resources health check
        await self.register_health_check(ConsulHealthCheck(
            check_id="system-resources",
            name="System Resources Health Check",
            check_type=HealthCheckType.CUSTOM,
            interval="60s",
            timeout="10s"
        ))
    
    async def _execute_http_check(self, health_check: ConsulHealthCheck) -> HealthCheckResult:
        """Execute HTTP health check"""
        
        start_time = time.time()
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.request(
                    health_check.method,
                    health_check.target,
                    headers=health_check.headers,
                    data=health_check.body if health_check.body else None
                ) as response:
                    
                    response_time = (time.time() - start_time) * 1000
                    
                    if response.status < 400:
                        return HealthCheckResult(
                            check_id=health_check.check_id,
                            status="passing",
                            output=f"HTTP {response.status} - Response time: {response_time:.0f}ms",
                            timestamp=datetime.utcnow(),
                            execution_time=response_time,
                            metadata={
                                "http_status": response.status,
                                "response_time_ms": response_time
                            }
                        )
                    else:
                        return HealthCheckResult(
                            check_id=health_check.check_id,
                            status="critical",
                            output=f"HTTP {response.status} - Response time: {response_time:.0f}ms",
                            timestamp=datetime.utcnow(),
                            execution_time=response_time,
                            metadata={
                                "http_status": response.status,
                                "response_time_ms": response_time
                            }
                        )
        
        except asyncio.TimeoutError:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output="HTTP health check timeout",
                timestamp=datetime.utcnow(),
                execution_time=(time.time() - start_time) * 1000
            )
        except Exception as e:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output=f"HTTP health check failed: {str(e)}",
                timestamp=datetime.utcnow(),
                execution_time=(time.time() - start_time) * 1000
            )
    
    async def _execute_tcp_check(self, health_check: ConsulHealthCheck) -> HealthCheckResult:
        """Execute TCP health check"""
        
        start_time = time.time()
        
        try:
            # Parse host and port from target
            if ":" in health_check.target:
                host, port = health_check.target.split(":")
                port = int(port)
            else:
                return HealthCheckResult(
                    check_id=health_check.check_id,
                    status="critical",
                    output="Invalid TCP target format",
                    timestamp=datetime.utcnow(),
                    execution_time=0.0
                )
            
            # Attempt TCP connection
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=5
            )
            
            response_time = (time.time() - start_time) * 1000
            
            writer.close()
            await writer.wait_closed()
            
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="passing",
                output=f"TCP connection successful - Response time: {response_time:.0f}ms",
                timestamp=datetime.utcnow(),
                execution_time=response_time,
                metadata={"response_time_ms": response_time}
            )
        
        except asyncio.TimeoutError:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output="TCP connection timeout",
                timestamp=datetime.utcnow(),
                execution_time=(time.time() - start_time) * 1000
            )
        except Exception as e:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output=f"TCP connection failed: {str(e)}",
                timestamp=datetime.utcnow(),
                execution_time=(time.time() - start_time) * 1000
            )
    
    async def _execute_database_check(self, health_check: ConsulHealthCheck) -> HealthCheckResult:
        """Execute database health check"""
        
        start_time = time.time()
        
        try:
            db = next(get_db())
            
            # Execute simple query
            result = db.execute(text("SELECT 1")).fetchone()
            
            response_time = (time.time() - start_time) * 1000
            
            if result and result[0] == 1:
                return HealthCheckResult(
                    check_id=health_check.check_id,
                    status="passing",
                    output=f"Database connection successful - Response time: {response_time:.0f}ms",
                    timestamp=datetime.utcnow(),
                    execution_time=response_time,
                    metadata={"response_time_ms": response_time}
                )
            else:
                return HealthCheckResult(
                    check_id=health_check.check_id,
                    status="critical",
                    output="Database query returned unexpected result",
                    timestamp=datetime.utcnow(),
                    execution_time=response_time
                )
        
        except Exception as e:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output=f"Database health check failed: {str(e)}",
                timestamp=datetime.utcnow(),
                execution_time=(time.time() - start_time) * 1000
            )
        finally:
            if 'db' in locals():
                db.close()
    
    async def _execute_redis_check(self, health_check: ConsulHealthCheck) -> HealthCheckResult:
        """Execute Redis health check"""
        
        start_time = time.time()
        
        try:
            if not self.redis_client:
                return HealthCheckResult(
                    check_id=health_check.check_id,
                    status="critical",
                    output="Redis client not available",
                    timestamp=datetime.utcnow(),
                    execution_time=0.0
                )
            
            # Execute Redis PING command
            result = await self.redis_client.ping()
            
            response_time = (time.time() - start_time) * 1000
            
            if result:
                return HealthCheckResult(
                    check_id=health_check.check_id,
                    status="passing",
                    output=f"Redis PING successful - Response time: {response_time:.0f}ms",
                    timestamp=datetime.utcnow(),
                    execution_time=response_time,
                    metadata={"response_time_ms": response_time}
                )
            else:
                return HealthCheckResult(
                    check_id=health_check.check_id,
                    status="critical",
                    output="Redis PING failed",
                    timestamp=datetime.utcnow(),
                    execution_time=response_time
                )
        
        except Exception as e:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output=f"Redis health check failed: {str(e)}",
                timestamp=datetime.utcnow(),
                execution_time=(time.time() - start_time) * 1000
            )
    
    async def _execute_custom_check(self, health_check: ConsulHealthCheck) -> HealthCheckResult:
        """Execute custom health check"""
        
        start_time = time.time()
        
        try:
            # System resources check
            if health_check.check_id == "system-resources":
                return await self._check_system_resources(health_check)
            else:
                return HealthCheckResult(
                    check_id=health_check.check_id,
                    status="critical",
                    output=f"Unknown custom health check: {health_check.check_id}",
                    timestamp=datetime.utcnow(),
                    execution_time=0.0
                )
        
        except Exception as e:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output=f"Custom health check failed: {str(e)}",
                timestamp=datetime.utcnow(),
                execution_time=(time.time() - start_time) * 1000
            )
    
    async def _check_system_resources(self, health_check: ConsulHealthCheck) -> HealthCheckResult:
        """Check system resources (CPU, memory, disk)"""
        
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            
            # Determine status based on thresholds
            status = "passing"
            warnings = []
            criticals = []
            
            if cpu_percent > 90:
                status = "critical"
                criticals.append(f"CPU usage: {cpu_percent:.1f}%")
            elif cpu_percent > 80:
                status = "warning"
                warnings.append(f"CPU usage: {cpu_percent:.1f}%")
            
            if memory_percent > 90:
                status = "critical"
                criticals.append(f"Memory usage: {memory_percent:.1f}%")
            elif memory_percent > 80:
                if status != "critical":
                    status = "warning"
                warnings.append(f"Memory usage: {memory_percent:.1f}%")
            
            if disk_percent > 90:
                status = "critical"
                criticals.append(f"Disk usage: {disk_percent:.1f}%")
            elif disk_percent > 80:
                if status != "critical":
                    status = "warning"
                warnings.append(f"Disk usage: {disk_percent:.1f}%")
            
            # Build output message
            output_parts = [
                f"CPU: {cpu_percent:.1f}%",
                f"Memory: {memory_percent:.1f}%",
                f"Disk: {disk_percent:.1f}%"
            ]
            
            if warnings:
                output_parts.append(f"Warnings: {', '.join(warnings)}")
            if criticals:
                output_parts.append(f"Critical: {', '.join(criticals)}")
            
            output = " | ".join(output_parts)
            
            return HealthCheckResult(
                check_id=health_check.check_id,
                status=status,
                output=output,
                timestamp=datetime.utcnow(),
                execution_time=0.0,
                metadata={
                    "cpu_percent": cpu_percent,
                    "memory_percent": memory_percent,
                    "disk_percent": disk_percent,
                    "warnings": warnings,
                    "criticals": criticals
                }
            )
        
        except Exception as e:
            return HealthCheckResult(
                check_id=health_check.check_id,
                status="critical",
                output=f"System resources check failed: {str(e)}",
                timestamp=datetime.utcnow(),
                execution_time=0.0
            )
    
    async def _update_consul_check_status(self, check_id: str, result: HealthCheckResult):
        """Update Consul with health check result"""
        
        try:
            # Update check status in Consul
            if result.status == "passing":
                await self.registry.consul_async.agent.check.pass(
                    check_id,
                    note=result.output
                )
            elif result.status == "warning":
                await self.registry.consul_async.agent.check.warn(
                    check_id,
                    note=result.output
                )
            else:  # critical
                await self.registry.consul_async.agent.check.fail(
                    check_id,
                    note=result.output
                )
        
        except Exception as e:
            logger.error(f"Failed to update Consul check status for {check_id}: {str(e)}")
    
    async def _store_health_result(self, result: HealthCheckResult):
        """Store health check result in Redis for analytics"""
        
        try:
            # Store recent results
            key = f"health_check:{result.check_id}:results"
            data = {
                "status": result.status,
                "output": result.output,
                "timestamp": result.timestamp.isoformat(),
                "execution_time": result.execution_time,
                "metadata": result.metadata
            }
            
            await self.redis_client.lpush(key, json.dumps(data))
            await self.redis_client.expire(key, self.health_history_ttl)
            
            # Store latest result
            latest_key = f"health_check:{result.check_id}:latest"
            await self.redis_client.setex(
                latest_key,
                self.health_history_ttl,
                json.dumps(data)
            )
        
        except Exception as e:
            logger.error(f"Failed to store health result: {str(e)}")
    
    async def _health_monitor_loop(self):
        """Background health monitoring loop"""
        
        while not self._shutdown_event.is_set():
            try:
                # Execute all registered health checks
                for check_id in list(self.health_checks.keys()):
                    await self.execute_health_check(check_id)
                    await asyncio.sleep(1)  # Small delay between checks
                
                await asyncio.sleep(self.health_check_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in health monitor loop: {str(e)}")
                await asyncio.sleep(5)
    
    async def _metrics_collection_loop(self):
        """Background metrics collection loop"""
        
        while not self._shutdown_event.is_set():
            try:
                await self._collect_health_metrics()
                await asyncio.sleep(self.metrics_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in metrics collection loop: {str(e)}")
                await asyncio.sleep(5)
    
    async def _collect_health_metrics(self):
        """Collect health check metrics"""
        
        if not self.redis_client:
            return
        
        try:
            # Count health checks by status
            passing = 0
            warning = 0
            critical = 0
            
            for check_id in self.health_checks.keys():
                latest_key = f"health_check:{check_id}:latest"
                latest_data = await self.redis_client.get(latest_key)
                
                if latest_data:
                    data = json.loads(latest_data)
                    if data["status"] == "passing":
                        passing += 1
                    elif data["status"] == "warning":
                        warning += 1
                    else:
                        critical += 1
            
            # Store metrics
            metrics = {
                "timestamp": datetime.utcnow().isoformat(),
                "total_checks": len(self.health_checks),
                "passing_checks": passing,
                "warning_checks": warning,
                "critical_checks": critical
            }
            
            await self.redis_client.setex(
                "health_metrics",
                self.health_history_ttl,
                json.dumps(metrics)
            )
        
        except Exception as e:
            logger.error(f"Failed to collect health metrics: {str(e)}")

# Global health integration instance
consul_health_integration = None

def get_consul_health_integration(
    consul_registry: ConsulServiceRegistry,
    health_checker: Optional[HealthChecker] = None,
    redis_client: Optional[redis.Redis] = None
) -> ConsulHealthIntegration:
    """Get or create global Consul health integration instance"""
    global consul_health_integration
    if consul_health_integration is None:
        consul_health_integration = ConsulHealthIntegration(
            consul_registry=consul_registry,
            health_checker=health_checker,
            redis_client=redis_client
        )
    return consul_health_integration