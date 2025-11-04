"""
Consul Monitoring and Alerting Service for ISH Chat System
Provides comprehensive monitoring, metrics collection, and alerting for Consul services
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import redis
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, generate_latest

from .consul_integration_service import get_consul_integration_service
from .consul_service_registry import ConsulServiceRegistry
from .consul_service_discovery import ServiceEndpoint
from .consul_health_integration import ConsulHealthIntegration, HealthCheckResult

logger = logging.getLogger(__name__)

class AlertSeverity(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

class AlertType(Enum):
    """Alert types"""
    SERVICE_DOWN = "service_down"
    HIGH_LATENCY = "high_latency"
    ERROR_RATE = "error_rate"
    RESOURCE_USAGE = "resource_usage"
    CONSUL_CLUSTER = "consul_cluster"
    HEALTH_CHECK = "health_check"

@dataclass
class Alert:
    """Alert definition"""
    alert_id: str
    alert_type: AlertType
    severity: AlertSeverity
    service_id: Optional[str]
    title: str
    description: str
    timestamp: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)
    resolved: bool = False
    resolved_at: Optional[datetime] = None

@dataclass
class MonitoringMetric:
    """Monitoring metric definition"""
    name: str
    value: float
    labels: Dict[str, str] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    unit: str = ""
    description: str = ""

class ConsulMonitoringService:
    """Consul monitoring and alerting service"""
    
    def __init__(
        self,
        consul_integration_service,
        redis_client: Optional[redis.Redis] = None,
        alert_webhook_url: Optional[str] = None
    ):
        self.consul_integration = consul_integration_service
        self.redis_client = redis_client
        self.alert_webhook_url = alert_webhook_url
        
        # Prometheus metrics
        self.registry = CollectorRegistry()
        self._setup_prometheus_metrics()
        
        # Monitoring state
        self.active_alerts: Dict[str, Alert] = {}
        self.alert_callbacks: List[Callable[[Alert], None]] = []
        
        # Configuration
        self.monitoring_interval = 30  # seconds
        self.metrics_retention = 86400  # 24 hours
        self.alert_retention = 604800  # 7 days
        
        # Alert thresholds
        self.thresholds = {
            "service_response_time": 5000,  # ms
            "error_rate": 10.0,  # percentage
            "cpu_usage": 80.0,  # percentage
            "memory_usage": 85.0,  # percentage
            "disk_usage": 90.0,  # percentage
            "consul_leader_election_timeout": 60,  # seconds
            "health_check_failure_rate": 20.0  # percentage
        }
        
        # Background tasks
        self.monitoring_task = None
        self.alert_processing_task = None
        self.metrics_cleanup_task = None
        self._shutdown_event = asyncio.Event()
        
    def _setup_prometheus_metrics(self):
        """Setup Prometheus metrics"""
        
        # Service metrics
        self.service_up_total = Counter(
            'consul_service_up_total',
            'Total number of service up events',
            ['service_name', 'service_type', 'provider_type'],
            registry=self.registry
        )
        
        self.service_down_total = Counter(
            'consul_service_down_total',
            'Total number of service down events',
            ['service_name', 'service_type', 'provider_type'],
            registry=self.registry
        )
        
        self.service_response_time = Histogram(
            'consul_service_response_time_seconds',
            'Service response time in seconds',
            ['service_name', 'service_type'],
            registry=self.registry
        )
        
        self.service_health_score = Gauge(
            'consul_service_health_score',
            'Service health score (0-100)',
            ['service_name', 'service_type'],
            registry=self.registry
        )
        
        # Consul cluster metrics
        self.consul_nodes_total = Gauge(
            'consul_nodes_total',
            'Total number of Consul nodes',
            registry=self.registry
        )
        
        self.consul_services_total = Gauge(
            'consul_services_total',
            'Total number of registered services',
            registry=self.registry
        )
        
        self.consul_leader_elections_total = Counter(
            'consul_leader_elections_total',
            'Total number of Consul leader elections',
            registry=self.registry
        )
        
        # Alert metrics
        self.alerts_total = Counter(
            'consul_monitoring_alerts_total',
            'Total number of monitoring alerts',
            ['alert_type', 'severity'],
            registry=self.registry
        )
        
        self.active_alerts_total = Gauge(
            'consul_monitoring_active_alerts_total',
            'Number of active monitoring alerts',
            ['severity'],
            registry=self.registry
        )
        
    async def start(self):
        """Start monitoring service"""
        logger.info("Starting Consul Monitoring Service")
        
        # Start background tasks
        self.monitoring_task = asyncio.create_task(self._monitoring_loop())
        self.alert_processing_task = asyncio.create_task(self._alert_processing_loop())
        self.metrics_cleanup_task = asyncio.create_task(self._metrics_cleanup_loop())
        
        logger.info("Consul Monitoring Service started")
    
    async def stop(self):
        """Stop monitoring service"""
        logger.info("Stopping Consul Monitoring Service")
        
        # Signal shutdown
        self._shutdown_event.set()
        
        # Cancel background tasks
        if self.monitoring_task:
            self.monitoring_task.cancel()
        if self.alert_processing_task:
            self.alert_processing_task.cancel()
        if self.metrics_cleanup_task:
            self.metrics_cleanup_task.cancel()
        
        logger.info("Consul Monitoring Service stopped")
    
    async def add_alert_callback(self, callback: Callable[[Alert], None]):
        """Add alert callback"""
        self.alert_callbacks.append(callback)
    
    async def create_alert(
        self,
        alert_type: AlertType,
        severity: AlertSeverity,
        service_id: Optional[str],
        title: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Alert:
        """Create and process an alert"""
        
        alert = Alert(
            alert_id=f"{alert_type.value}_{service_id}_{int(time.time())}",
            alert_type=alert_type,
            severity=severity,
            service_id=service_id,
            title=title,
            description=description,
            timestamp=datetime.utcnow(),
            metadata=metadata or {}
        )
        
        # Store alert
        self.active_alerts[alert.alert_id] = alert
        
        # Update Prometheus metrics
        self.alerts_total.labels(
            alert_type=alert_type.value,
            severity=severity.value
        ).inc()
        
        self._update_active_alerts_gauge()
        
        # Process alert
        await self._process_alert(alert)
        
        return alert
    
    async def resolve_alert(self, alert_id: str, resolved_by: str = "system") -> bool:
        """Resolve an alert"""
        
        if alert_id not in self.active_alerts:
            return False
        
        alert = self.active_alerts[alert_id]
        alert.resolved = True
        alert.resolved_at = datetime.utcnow()
        alert.metadata["resolved_by"] = resolved_by
        
        # Remove from active alerts
        self.active_alerts.pop(alert_id, None)
        
        # Update Prometheus metrics
        self._update_active_alerts_gauge()
        
        # Log resolution
        logger.info(f"Resolved alert: {alert.title}")
        
        # Send notification if webhook configured
        if self.alert_webhook_url:
            await self._send_alert_notification(alert, "resolved")
        
        return True
    
    async def get_monitoring_dashboard(self) -> Dict[str, Any]:
        """Get comprehensive monitoring dashboard data"""
        
        try:
            # Get service mesh status
            mesh_status = await self.consul_integration.get_service_mesh_status()
            
            # Get active alerts
            active_alerts = [
                {
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type.value,
                    "severity": alert.severity.value,
                    "service_id": alert.service_id,
                    "title": alert.title,
                    "description": alert.description,
                    "timestamp": alert.timestamp.isoformat(),
                    "metadata": alert.metadata
                }
                for alert in self.active_alerts.values()
            ]
            
            # Get service health summary
            service_health = await self._get_service_health_summary()
            
            # Get Consul cluster status
            cluster_status = await self._get_consul_cluster_status()
            
            # Get recent metrics
            recent_metrics = await self._get_recent_metrics()
            
            dashboard = {
                "timestamp": datetime.utcnow().isoformat(),
                "consul_connected": mesh_status.get("consul_connected", False),
                "service_mesh_status": mesh_status,
                "active_alerts": active_alerts,
                "alert_summary": {
                    "total_active": len(active_alerts),
                    "critical": len([a for a in active_alerts if a["severity"] == "critical"]),
                    "warning": len([a for a in active_alerts if a["severity"] == "warning"]),
                    "info": len([a for a in active_alerts if a["severity"] == "info"])
                },
                "service_health": service_health,
                "cluster_status": cluster_status,
                "recent_metrics": recent_metrics,
                "prometheus_metrics": generate_latest(self.registry).decode('utf-8')
            }
            
            return dashboard
            
        except Exception as e:
            logger.error(f"Failed to get monitoring dashboard: {str(e)}")
            return {"error": str(e)}
    
    async def get_service_metrics(self, service_id: str, time_range: int = 3600) -> Dict[str, Any]:
        """Get detailed metrics for a specific service"""
        
        try:
            # Get health metrics from Redis
            health_metrics = await self._get_service_health_metrics(service_id, time_range)
            
            # Get performance metrics
            performance_metrics = await self._get_service_performance_metrics(service_id, time_range)
            
            # Get alert history
            alert_history = await self._get_service_alert_history(service_id, time_range)
            
            return {
                "service_id": service_id,
                "time_range_seconds": time_range,
                "health_metrics": health_metrics,
                "performance_metrics": performance_metrics,
                "alert_history": alert_history,
                "last_updated": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get service metrics for {service_id}: {str(e)}")
            return {"error": str(e)}
    
    async def _monitoring_loop(self):
        """Main monitoring loop"""
        
        while not self._shutdown_event.is_set():
            try:
                await self._perform_monitoring_checks()
                await asyncio.sleep(self.monitoring_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {str(e)}")
                await asyncio.sleep(5)
    
    async def _alert_processing_loop(self):
        """Alert processing loop"""
        
        while not self._shutdown_event.is_set():
            try:
                await self._process_alert_queue()
                await asyncio.sleep(10)  # Process alerts every 10 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in alert processing loop: {str(e)}")
                await asyncio.sleep(5)
    
    async def _metrics_cleanup_loop(self):
        """Metrics cleanup loop"""
        
        while not self._shutdown_event.is_set():
            try:
                await self._cleanup_old_metrics()
                await asyncio.sleep(3600)  # Cleanup every hour
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in metrics cleanup loop: {str(e)}")
                await asyncio.sleep(60)
    
    async def _perform_monitoring_checks(self):
        """Perform all monitoring checks"""
        
        try:
            # Check service health
            await self._check_service_health()
            
            # Check Consul cluster health
            await self._check_consul_cluster_health()
            
            # Check system resources
            await self._check_system_resources()
            
            # Update Prometheus metrics
            await self._update_prometheus_metrics()
            
        except Exception as e:
            logger.error(f"Error performing monitoring checks: {str(e)}")
    
    async def _check_service_health(self):
        """Check health of all services"""
        
        try:
            # Get all services from Consul
            services = await self.consul_integration.discovery.discover_services(
                consul_integration.discovery.ServiceQuery()
            )
            
            for service in services:
                try:
                    # Check service health status
                    if service.health_status != "passing":
                        await self._check_service_health_issues(service)
                    
                    # Update service metrics
                    await self._update_service_metrics(service)
                    
                except Exception as e:
                    logger.error(f"Error checking service {service.service_id}: {str(e)}")
        
        except Exception as e:
            logger.error(f"Failed to check service health: {str(e)}")
    
    async def _check_service_health_issues(self, service: ServiceEndpoint):
        """Check for specific service health issues"""
        
        service_id = service.service_id
        
        # Check if alert already exists
        existing_alert = next(
            (a for a in self.active_alerts.values() 
             if a.service_id == service_id and a.alert_type == AlertType.SERVICE_DOWN),
            None
        )
        
        if service.health_status == "critical" and not existing_alert:
            # Create service down alert
            await self.create_alert(
                alert_type=AlertType.SERVICE_DOWN,
                severity=AlertSeverity.CRITICAL,
                service_id=service_id,
                title=f"Service Down: {service.service_name}",
                description=f"Service {service.service_name} ({service_id}) is critical",
                metadata={
                    "service_name": service.service_name,
                    "service_type": service.service_type.value,
                    "address": service.address,
                    "port": service.port
                }
            )
        
        elif service.health_status == "passing" and existing_alert:
            # Resolve service down alert
            await self.resolve_alert(existing_alert.alert_id, "auto_resolved")
    
    async def _update_service_metrics(self, service: ServiceEndpoint):
        """Update service metrics"""
        
        try:
            # Update health score gauge
            health_score = self._calculate_health_score(service)
            self.service_health_score.labels(
                service_name=service.service_name,
                service_type=service.service_type.value
            ).set(health_score)
            
            # Store metrics in Redis
            if self.redis_client:
                metric_data = {
                    "service_id": service.service_id,
                    "service_name": service.service_name,
                    "service_type": service.service_type.value,
                    "health_status": service.health_status,
                    "health_score": health_score,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                await self.redis_client.lpush(
                    f"service_metrics:{service.service_id}",
                    json.dumps(metric_data)
                )
                await self.redis_client.expire(
                    f"service_metrics:{service.service_id}",
                    self.metrics_retention
                )
        
        except Exception as e:
            logger.error(f"Failed to update service metrics: {str(e)}")
    
    async def _check_consul_cluster_health(self):
        """Check Consul cluster health"""
        
        try:
            # Get Consul operator status
            if hasattr(self.consul_integration.registry.consul_async, 'operator'):
                # Check Raft status
                raft_peers = await self.consul_integration.registry.consul_async.operator.raft.list_peers()
                self.consul_nodes_total.set(len(raft_peers))
                
                # Check leader
                leader = await self.consul_integration.registry.consul_async.operator.raft.get_configuration()
                if not leader:
                    await self.create_alert(
                        alert_type=AlertType.CONSUL_CLUSTER,
                        severity=AlertSeverity.CRITICAL,
                        service_id="consul-cluster",
                        title="Consul Cluster: No Leader",
                        description="Consul cluster has no leader elected",
                        metadata={"node_count": len(raft_peers)}
                    )
            
            # Update service count
            mesh_status = await self.consul_integration.get_service_mesh_status()
            self.consul_services_total.set(mesh_status.get("total_services", 0))
            
        except Exception as e:
            logger.error(f"Failed to check Consul cluster health: {str(e)}")
    
    async def _check_system_resources(self):
        """Check system resources"""
        
        try:
            import psutil
            
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            if cpu_percent > self.thresholds["cpu_usage"]:
                await self.create_alert(
                    alert_type=AlertType.RESOURCE_USAGE,
                    severity=AlertSeverity.WARNING,
                    service_id="system",
                    title=f"High CPU Usage: {cpu_percent:.1f}%",
                    description=f"System CPU usage is {cpu_percent:.1f}%",
                    metadata={"cpu_percent": cpu_percent}
                )
            
            # Memory usage
            memory = psutil.virtual_memory()
            if memory.percent > self.thresholds["memory_usage"]:
                await self.create_alert(
                    alert_type=AlertType.RESOURCE_USAGE,
                    severity=AlertSeverity.WARNING,
                    service_id="system",
                    title=f"High Memory Usage: {memory.percent:.1f}%",
                    description=f"System memory usage is {memory.percent:.1f}%",
                    metadata={"memory_percent": memory.percent}
                )
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            if disk_percent > self.thresholds["disk_usage"]:
                await self.create_alert(
                    alert_type=AlertType.RESOURCE_USAGE,
                    severity=AlertSeverity.CRITICAL,
                    service_id="system",
                    title=f"High Disk Usage: {disk_percent:.1f}%",
                    description=f"System disk usage is {disk_percent:.1f}%",
                    metadata={"disk_percent": disk_percent}
                )
        
        except Exception as e:
            logger.error(f"Failed to check system resources: {str(e)}")
    
    async def _update_prometheus_metrics(self):
        """Update Prometheus metrics"""
        
        try:
            # Update active alerts gauge
            self._update_active_alerts_gauge()
            
        except Exception as e:
            logger.error(f"Failed to update Prometheus metrics: {str(e)}")
    
    def _update_active_alerts_gauge(self):
        """Update active alerts gauge"""
        
        active_alerts = list(self.active_alerts.values())
        critical_count = len([a for a in active_alerts if a.severity == AlertSeverity.CRITICAL])
        warning_count = len([a for a in active_alerts if a.severity == AlertSeverity.WARNING])
        info_count = len([a for a in active_alerts if a.severity == AlertSeverity.INFO])
        
        self.active_alerts_total.labels(severity="critical").set(critical_count)
        self.active_alerts_total.labels(severity="warning").set(warning_count)
        self.active_alerts_total.labels(severity="info").set(info_count)
    
    def _calculate_health_score(self, service: ServiceEndpoint) -> float:
        """Calculate health score for service"""
        
        if service.health_status == "passing":
            return 100.0
        elif service.health_status == "warning":
            return 75.0
        else:
            return 0.0
    
    async def _process_alert(self, alert: Alert):
        """Process an alert"""
        
        try:
            # Log alert
            logger.warning(f"Alert: {alert.title} - {alert.description}")
            
            # Call alert callbacks
            for callback in self.alert_callbacks:
                try:
                    await callback(alert)
                except Exception as e:
                    logger.error(f"Alert callback failed: {str(e)}")
            
            # Send webhook notification if configured
            if self.alert_webhook_url:
                await self._send_alert_notification(alert, "created")
            
            # Store alert in Redis
            if self.redis_client:
                alert_data = {
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type.value,
                    "severity": alert.severity.value,
                    "service_id": alert.service_id,
                    "title": alert.title,
                    "description": alert.description,
                    "timestamp": alert.timestamp.isoformat(),
                    "metadata": alert.metadata,
                    "resolved": alert.resolved
                }
                
                await self.redis_client.lpush("alerts", json.dumps(alert_data))
                await self.redis_client.expire("alerts", self.alert_retention)
        
        except Exception as e:
            logger.error(f"Failed to process alert {alert.alert_id}: {str(e)}")
    
    async def _send_alert_notification(self, alert: Alert, action: str):
        """Send alert notification via webhook"""
        
        if not self.alert_webhook_url:
            return
        
        try:
            import aiohttp
            
            payload = {
                "action": action,
                "alert": {
                    "alert_id": alert.alert_id,
                    "alert_type": alert.alert_type.value,
                    "severity": alert.severity.value,
                    "service_id": alert.service_id,
                    "title": alert.title,
                    "description": alert.description,
                    "timestamp": alert.timestamp.isoformat(),
                    "resolved": alert.resolved,
                    "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
                    "metadata": alert.metadata
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.alert_webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        logger.info(f"Alert notification sent: {alert.alert_id}")
                    else:
                        logger.error(f"Failed to send alert notification: {response.status}")
        
        except Exception as e:
            logger.error(f"Failed to send alert notification: {str(e)}")
    
    async def _process_alert_queue(self):
        """Process queued alerts"""
        
        # This could be extended to handle alert deduplication, rate limiting, etc.
        pass
    
    async def _cleanup_old_metrics(self):
        """Clean up old metrics data"""
        
        if not self.redis_client:
            return
        
        try:
            # Clean up old service metrics
            pattern = "service_metrics:*"
            keys = await self.redis_client.keys(pattern)
            
            for key in keys:
                # Check if key is expired and remove if needed
                ttl = await self.redis_client.ttl(key)
                if ttl == -1:  # No expiration set
                    await self.redis_client.expire(key, self.metrics_retention)
        
        except Exception as e:
            logger.error(f"Failed to cleanup old metrics: {str(e)}")
    
    async def _get_service_health_summary(self) -> Dict[str, Any]:
        """Get service health summary"""
        
        try:
            services = await self.consul_integration.discovery.discover_services(
                consul_integration.discovery.ServiceQuery()
            )
            
            summary = {
                "total_services": len(services),
                "healthy_services": len([s for s in services if s.health_status == "passing"]),
                "warning_services": len([s for s in services if s.health_status == "warning"]),
                "critical_services": len([s for s in services if s.health_status == "critical"]),
                "services_by_type": {}
            }
            
            for service in services:
                service_type = service.service_type.value
                if service_type not in summary["services_by_type"]:
                    summary["services_by_type"][service_type] = {
                        "total": 0,
                        "healthy": 0,
                        "warning": 0,
                        "critical": 0
                    }
                
                summary["services_by_type"][service_type]["total"] += 1
                if service.health_status == "passing":
                    summary["services_by_type"][service_type]["healthy"] += 1
                elif service.health_status == "warning":
                    summary["services_by_type"][service_type]["warning"] += 1
                else:
                    summary["services_by_type"][service_type]["critical"] += 1
            
            return summary
            
        except Exception as e:
            logger.error(f"Failed to get service health summary: {str(e)}")
            return {}
    
    async def _get_consul_cluster_status(self) -> Dict[str, Any]:
        """Get Consul cluster status"""
        
        try:
            status = {
                "connected": False,
                "leader_elected": False,
                "node_count": 0,
                "datacenter": "unknown"
            }
            
            # Check if Consul is connected
            try:
                await self.consul_integration.registry.consul_async.agent.self()
                status["connected"] = True
            except:
                return status
            
            # Get cluster info
            try:
                if hasattr(self.consul_integration.registry.consul_async, 'operator'):
                    # Get Raft configuration
                    raft_config = await self.consul_integration.registry.consul_async.operator.raft.get_configuration()
                    status["node_count"] = len(raft_config.get("Servers", []))
                    status["leader_elected"] = any(s.get("Leader") for s in raft_config.get("Servers", []))
                
                # Get datacenter info
                self_config = await self.consul_integration.registry.consul_async.agent.self()
                status["datacenter"] = self_config.get("Config", {}).get("Datacenter", "unknown")
            
            except Exception as e:
                logger.error(f"Failed to get Consul cluster info: {str(e)}")
            
            return status
            
        except Exception as e:
            logger.error(f"Failed to get Consul cluster status: {str(e)}")
            return {"error": str(e)}
    
    async def _get_recent_metrics(self) -> List[Dict[str, Any]]:
        """Get recent metrics"""
        
        metrics = []
        
        try:
            if self.redis_client:
                # Get recent health metrics
                health_data = await self.redis_client.get("health_metrics")
                if health_data:
                    metrics.append({
                        "name": "health_checks",
                        "data": json.loads(health_data)
                    })
                
                # Get recent service failures
                failures = await self.redis_client.lrange("service_failures", 0, 9)  # Last 10
                if failures:
                    metrics.append({
                        "name": "service_failures",
                        "data": [json.loads(f) for f in failures]
                    })
        
        except Exception as e:
            logger.error(f"Failed to get recent metrics: {str(e)}")
        
        return metrics
    
    async def _get_service_health_metrics(self, service_id: str, time_range: int) -> Dict[str, Any]:
        """Get health metrics for specific service"""
        
        try:
            if not self.redis_client:
                return {}
            
            key = f"service_metrics:{service_id}"
            metrics_data = await self.redis_client.lrange(key, 0, -1)
            
            # Filter by time range
            cutoff_time = datetime.utcnow() - timedelta(seconds=time_range)
            recent_metrics = []
            
            for data in metrics_data:
                metric = json.loads(data)
                metric_time = datetime.fromisoformat(metric["timestamp"])
                
                if metric_time >= cutoff_time:
                    recent_metrics.append(metric)
            
            return {
                "service_id": service_id,
                "time_range_seconds": time_range,
                "metrics": recent_metrics,
                "count": len(recent_metrics)
            }
            
        except Exception as e:
            logger.error(f"Failed to get service health metrics: {str(e)}")
            return {}
    
    async def _get_service_performance_metrics(self, service_id: str, time_range: int) -> Dict[str, Any]:
        """Get performance metrics for specific service"""
        
        # This could be extended to collect detailed performance metrics
        return {
            "service_id": service_id,
            "time_range_seconds": time_range,
            "metrics": []
        }
    
    async def _get_service_alert_history(self, service_id: str, time_range: int) -> List[Dict[str, Any]]:
        """Get alert history for specific service"""
        
        try:
            if not self.redis_client:
                return []
            
            # Get all alerts
            all_alerts = await self.redis_client.lrange("alerts", 0, -1)
            
            # Filter by service and time range
            cutoff_time = datetime.utcnow() - timedelta(seconds=time_range)
            service_alerts = []
            
            for alert_data in all_alerts:
                alert = json.loads(alert_data)
                
                if (alert.get("service_id") == service_id and
                    datetime.fromisoformat(alert["timestamp"]) >= cutoff_time):
                    service_alerts.append(alert)
            
            return service_alerts
            
        except Exception as e:
            logger.error(f"Failed to get service alert history: {str(e)}")
            return []

# Global monitoring service instance
consul_monitoring_service = None

def get_consul_monitoring_service(
    consul_integration_service,
    redis_client: Optional[redis.Redis] = None,
    alert_webhook_url: Optional[str] = None
) -> ConsulMonitoringService:
    """Get or create global Consul monitoring service"""
    global consul_monitoring_service
    if consul_monitoring_service is None:
        consul_monitoring_service = ConsulMonitoringService(
            consul_integration_service=consul_integration_service,
            redis_client=redis_client,
            alert_webhook_url=alert_webhook_url
        )
    return consul_monitoring_service