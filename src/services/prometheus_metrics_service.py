"""
Prometheus Metrics Service for Instance Manager
"""
import logging
import time
from datetime import datetime
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from prometheus_client import (
    Counter, Histogram, Gauge, Summary, Info, CollectorRegistry,
    generate_latest, CONTENT_TYPE_LATEST
)
from prometheus_client.core import REGISTRY
from prometheus_client.exposition import MetricsHandler
from aiohttp import web
import asyncio

logger = logging.getLogger(__name__)

@dataclass
class MetricConfig:
    """Configuration for metrics collection"""
    enabled: bool = True
    port: int = 9090
    path: str = "/metrics"
    registry_name: str = "instance_manager"
    collection_interval: int = 60  # seconds
    retention_hours: int = 24
    
    # Histogram buckets for response times
    response_time_buckets: List[float] = None
    
    def __post_init__(self):
        if self.response_time_buckets is None:
            self.response_time_buckets = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]

class PrometheusMetricsService:
    """Prometheus metrics collection service"""
    
    def __init__(self, config: MetricConfig = None):
        self.config = config or MetricConfig()
        
        # Create custom registry
        self.registry = CollectorRegistry()
        
        # Initialize metrics
        self._initialize_metrics()
        
        # HTTP server for metrics endpoint
        self.app = None
        self.site = None
        self.runner = None
        self._server_running = False
        
    def _initialize_metrics(self):
        """Initialize all Prometheus metrics"""
        
        # Request metrics
        self.requests_total = Counter(
            'instance_manager_requests_total',
            'Total number of requests processed',
            ['provider_type', 'model_name', 'instance_id', 'status'],
            registry=self.registry
        )
        
        self.request_duration = Histogram(
            'instance_manager_request_duration_seconds',
            'Request processing duration',
            ['provider_type', 'model_name', 'instance_id'],
            buckets=self.config.response_time_buckets,
            registry=self.registry
        )
        
        # Instance metrics
        self.instances_total = Gauge(
            'instance_manager_instances_total',
            'Total number of registered instances',
            ['provider_type', 'status'],
            registry=self.registry
        )
        
        self.instances_healthy = Gauge(
            'instance_manager_instances_healthy',
            'Number of healthy instances',
            ['provider_type'],
            registry=self.registry
        )
        
        self.instance_load = Gauge(
            'instance_manager_instance_load',
            'Current load on instances',
            ['instance_id', 'provider_type'],
            registry=self.registry
        )
        
        self.instance_success_rate = Gauge(
            'instance_manager_instance_success_rate',
            'Success rate for instances',
            ['instance_id', 'provider_type'],
            registry=self.registry
        )
        
        self.instance_response_time = Gauge(
            'instance_manager_instance_response_time_seconds',
            'Average response time for instances',
            ['instance_id', 'provider_type'],
            registry=self.registry
        )
        
        # Health check metrics
        self.health_checks_total = Counter(
            'instance_manager_health_checks_total',
            'Total number of health checks performed',
            ['instance_id', 'check_type', 'status'],
            registry=self.registry
        )
        
        self.health_check_duration = Histogram(
            'instance_manager_health_check_duration_seconds',
            'Health check duration',
            ['instance_id', 'check_type'],
            buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
            registry=self.registry
        )
        
        self.health_score = Gauge(
            'instance_manager_health_score',
            'Health score for instances',
            ['instance_id', 'provider_type'],
            registry=self.registry
        )
        
        # Load balancer metrics
        self.load_balancer_selections_total = Counter(
            'instance_manager_load_balancer_selections_total',
            'Total number of instance selections by load balancer',
            ['strategy', 'provider_type', 'model_name'],
            registry=self.registry
        )
        
        self.load_balancer_failovers_total = Counter(
            'instance_manager_load_balancer_failovers_total',
            'Total number of failovers',
            ['provider_type', 'model_name', 'reason'],
            registry=self.registry
        )
        
        self.circuit_breaker_state = Gauge(
            'instance_manager_circuit_breaker_state',
            'Circuit breaker state (0=closed, 1=open, 2=half_open)',
            ['instance_id'],
            registry=self.registry
        )
        
        # Auto-scaling metrics
        self.scaling_events_total = Counter(
            'instance_manager_scaling_events_total',
            'Total number of scaling events',
            ['provider_type', 'direction', 'reason'],
            registry=self.registry
        )
        
        self.instances_desired = Gauge(
            'instance_manager_instances_desired',
            'Desired number of instances',
            ['provider_type'],
            registry=self.registry
        )
        
        self.instances_current = Gauge(
            'instance_manager_instances_current',
            'Current number of instances',
            ['provider_type'],
            registry=self.registry
        )
        
        # Performance metrics
        self.tokens_used_total = Counter(
            'instance_manager_tokens_used_total',
            'Total tokens consumed',
            ['provider_type', 'model_name'],
            registry=self.registry
        )
        
        self.cost_estimate = Gauge(
            'instance_manager_cost_estimate_dollars',
            'Estimated cost in dollars',
            ['provider_type', 'model_name'],
            registry=self.registry
        )
        
        # System metrics
        self.cache_hits_total = Counter(
            'instance_manager_cache_hits_total',
            'Total cache hits',
            ['cache_type'],
            registry=self.registry
        )
        
        self.cache_misses_total = Counter(
            'instance_manager_cache_misses_total',
            'Total cache misses',
            ['cache_type'],
            registry=self.registry
        )
        
        self.database_connections_active = Gauge(
            'instance_manager_database_connections_active',
            'Active database connections',
            registry=self.registry
        )
        
        # Info metrics
        self.build_info = Info(
            'instance_manager_build_info',
            'Build information',
            registry=self.registry
        )
        
        self.configuration_info = Info(
            'instance_manager_configuration_info',
            'Configuration information',
            registry=self.registry
        )
        
        # Set initial build info
        self.build_info.info({
            'version': '1.0.0',
            'build_date': datetime.utcnow().isoformat(),
            'git_commit': 'unknown'
        })
    
    async def start_metrics_server(self):
        """Start HTTP server for metrics endpoint"""
        
        if self._server_running:
            logger.warning("Metrics server is already running")
            return
        
        try:
            from aiohttp import web
            
            # Create aiohttp app
            self.app = web.Application()
            
            # Add metrics endpoint
            self.app.router.add_get(self.config.path, self._metrics_handler)
            
            # Create and start server
            self.runner = web.AppRunner(self.app)
            await self.runner.setup()
            
            self.site = web.TCPSite(
                self.runner,
                '0.0.0.0',
                self.config.port
            )
            
            await self.site.start()
            self._server_running = True
            
            logger.info(f"Prometheus metrics server started on port {self.config.port}")
            
        except Exception as e:
            logger.error(f"Failed to start metrics server: {e}")
            raise
    
    async def stop_metrics_server(self):
        """Stop metrics server"""
        
        if not self._server_running:
            return
        
        try:
            if self.site:
                await self.site.stop()
            
            if self.runner:
                await self.runner.cleanup()
            
            self._server_running = False
            logger.info("Prometheus metrics server stopped")
            
        except Exception as e:
            logger.error(f"Error stopping metrics server: {e}")
    
    async def _metrics_handler(self, request):
        """Handle metrics HTTP requests"""
        
        try:
            metrics_data = generate_latest(self.registry)
            return web.Response(
                body=metrics_data,
                content_type=CONTENT_TYPE_LATEST
            )
        except Exception as e:
            logger.error(f"Error generating metrics: {e}")
            return web.Response(
                text=f"Error generating metrics: {e}",
                status=500
            )
    
    # Request metrics
    def record_request(
        self,
        provider_type: str,
        model_name: str,
        instance_id: str,
        status: str,
        duration: float
    ):
        """Record a processed request"""
        
        if not self.config.enabled:
            return
        
        try:
            self.requests_total.labels(
                provider_type=provider_type,
                model_name=model_name,
                instance_id=instance_id,
                status=status
            ).inc()
            
            self.request_duration.labels(
                provider_type=provider_type,
                model_name=model_name,
                instance_id=instance_id
            ).observe(duration)
            
        except Exception as e:
            logger.error(f"Error recording request metrics: {e}")
    
    # Instance metrics
    def update_instance_metrics(
        self,
        instance_id: str,
        provider_type: str,
        load: int,
        success_rate: float,
        response_time: float,
        status: str
    ):
        """Update instance-related metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.instance_load.labels(
                instance_id=instance_id,
                provider_type=provider_type
            ).set(load)
            
            self.instance_success_rate.labels(
                instance_id=instance_id,
                provider_type=provider_type
            ).set(success_rate)
            
            self.instance_response_time.labels(
                instance_id=instance_id,
                provider_type=provider_type
            ).set(response_time)
            
        except Exception as e:
            logger.error(f"Error updating instance metrics: {e}")
    
    def update_instance_counts(self, provider_counts: Dict[str, Dict[str, int]]):
        """Update instance count metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            for provider_type, counts in provider_counts.items():
                # Total instances by status
                for status, count in counts.items():
                    if status != 'healthy':  # Healthy is handled separately
                        self.instances_total.labels(
                            provider_type=provider_type,
                            status=status
                        ).set(count)
                
                # Healthy instances
                healthy_count = counts.get('healthy', 0)
                self.instances_healthy.labels(
                    provider_type=provider_type
                ).set(healthy_count)
                
                # Total instances
                total_count = sum(counts.values())
                self.instances_total.labels(
                    provider_type=provider_type,
                    status='total'
                ).set(total_count)
            
        except Exception as e:
            logger.error(f"Error updating instance count metrics: {e}")
    
    # Health check metrics
    def record_health_check(
        self,
        instance_id: str,
        check_type: str,
        status: str,
        duration: float,
        health_score: float
    ):
        """Record health check metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.health_checks_total.labels(
                instance_id=instance_id,
                check_type=check_type,
                status=status
            ).inc()
            
            self.health_check_duration.labels(
                instance_id=instance_id,
                check_type=check_type
            ).observe(duration)
            
            # Update health score if check was successful
            if status == 'healthy':
                # Determine provider type from instance_id or maintain a mapping
                self.health_score.labels(
                    instance_id=instance_id,
                    provider_type='unknown'  # Would be determined from instance data
                ).set(health_score)
            
        except Exception as e:
            logger.error(f"Error recording health check metrics: {e}")
    
    # Load balancer metrics
    def record_load_balancer_selection(
        self,
        strategy: str,
        provider_type: str,
        model_name: str
    ):
        """Record load balancer instance selection"""
        
        if not self.config.enabled:
            return
        
        try:
            self.load_balancer_selections_total.labels(
                strategy=strategy,
                provider_type=provider_type,
                model_name=model_name
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording load balancer selection metrics: {e}")
    
    def record_failover(
        self,
        provider_type: str,
        model_name: str,
        reason: str
    ):
        """Record failover event"""
        
        if not self.config.enabled:
            return
        
        try:
            self.load_balancer_failovers_total.labels(
                provider_type=provider_type,
                model_name=model_name,
                reason=reason
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording failover metrics: {e}")
    
    def update_circuit_breaker_state(
        self,
        instance_id: str,
        state: str  # 'closed', 'open', 'half_open'
    ):
        """Update circuit breaker state"""
        
        if not self.config.enabled:
            return
        
        try:
            state_map = {'closed': 0, 'open': 1, 'half_open': 2}
            state_value = state_map.get(state, 0)
            
            self.circuit_breaker_state.labels(
                instance_id=instance_id
            ).set(state_value)
            
        except Exception as e:
            logger.error(f"Error updating circuit breaker metrics: {e}")
    
    # Auto-scaling metrics
    def record_scaling_event(
        self,
        provider_type: str,
        direction: str,
        reason: str
    ):
        """Record auto-scaling event"""
        
        if not self.config.enabled:
            return
        
        try:
            self.scaling_events_total.labels(
                provider_type=provider_type,
                direction=direction,
                reason=reason
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording scaling event metrics: {e}")
    
    def update_scaling_metrics(
        self,
        provider_type: str,
        current_instances: int,
        desired_instances: int
    ):
        """Update auto-scaling metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.instances_current.labels(
                provider_type=provider_type
            ).set(current_instances)
            
            self.instances_desired.labels(
                provider_type=provider_type
            ).set(desired_instances)
            
        except Exception as e:
            logger.error(f"Error updating scaling metrics: {e}")
    
    # Performance metrics
    def record_token_usage(
        self,
        provider_type: str,
        model_name: str,
        tokens: int
    ):
        """Record token usage"""
        
        if not self.config.enabled:
            return
        
        try:
            self.tokens_used_total.labels(
                provider_type=provider_type,
                model_name=model_name
            ).inc(tokens)
            
        except Exception as e:
            logger.error(f"Error recording token usage metrics: {e}")
    
    def update_cost_estimate(
        self,
        provider_type: str,
        model_name: str,
        cost_dollars: float
    ):
        """Update cost estimate"""
        
        if not self.config.enabled:
            return
        
        try:
            self.cost_estimate.labels(
                provider_type=provider_type,
                model_name=model_name
            ).set(cost_dollars)
            
        except Exception as e:
            logger.error(f"Error updating cost estimate metrics: {e}")
    
    # System metrics
    def record_cache_hit(self, cache_type: str):
        """Record cache hit"""
        
        if not self.config.enabled:
            return
        
        try:
            self.cache_hits_total.labels(cache_type=cache_type).inc()
            
        except Exception as e:
            logger.error(f"Error recording cache hit metrics: {e}")
    
    def record_cache_miss(self, cache_type: str):
        """Record cache miss"""
        
        if not self.config.enabled:
            return
        
        try:
            self.cache_misses_total.labels(cache_type=cache_type).inc()
            
        except Exception as e:
            logger.error(f"Error recording cache miss metrics: {e}")
    
    def update_database_connections(self, active_connections: int):
        """Update database connection metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.database_connections_active.set(active_connections)
            
        except Exception as e:
            logger.error(f"Error updating database connection metrics: {e}")
    
    # Configuration metrics
    def update_configuration_info(self, config: Dict[str, Any]):
        """Update configuration information"""
        
        if not self.config.enabled:
            return
        
        try:
            # Flatten configuration for display
            flat_config = {}
            for key, value in config.items():
                if isinstance(value, (str, int, float, bool)):
                    flat_config[key] = str(value)
                elif isinstance(value, dict):
                    for sub_key, sub_value in value.items():
                        if isinstance(sub_value, (str, int, float, bool)):
                            flat_config[f"{key}_{sub_key}"] = str(sub_value)
            
            self.configuration_info.info(flat_config)
            
        except Exception as e:
            logger.error(f"Error updating configuration info metrics: {e}")
    
    # Metrics collection and cleanup
    async def collect_system_metrics(self):
        """Collect system-level metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            # This would collect system metrics like CPU, memory, etc.
            # For now, we'll just log that metrics were collected
            logger.debug("System metrics collected")
            
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
    
    async def cleanup_old_metrics(self):
        """Clean up old metric data"""
        
        if not self.config.enabled:
            return
        
        try:
            # Prometheus handles metric retention automatically
            # This could be used for custom metric cleanup if needed
            logger.debug("Old metrics cleanup completed")
            
        except Exception as e:
            logger.error(f"Error cleaning up old metrics: {e}")
    
    # Metrics export
    def get_metrics_text(self) -> str:
        """Get metrics in Prometheus text format"""
        
        try:
            return generate_latest(self.registry).decode('utf-8')
        except Exception as e:
            logger.error(f"Error generating metrics text: {e}")
            return ""
    
    def get_metric_families(self) -> List[Dict[str, Any]]:
        """Get metric families information"""
        
        try:
            metric_families = []
            
            for metric_family in self.registry.describe_collector_names():
                metric_families.append({
                    'name': metric_family,
                    'type': 'unknown'  # Would extract from metric metadata
                })
            
            return metric_families
            
        except Exception as e:
            logger.error(f"Error getting metric families: {e}")
            return []
    
    async def start_metrics_collection(self, interval: int = None):
        """Start periodic metrics collection"""
        
        if not self.config.enabled:
            return
        
        collection_interval = interval or self.config.collection_interval
        
        async def collection_loop():
            while True:
                try:
                    await self.collect_system_metrics()
                    await asyncio.sleep(collection_interval)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in metrics collection loop: {e}")
                    await asyncio.sleep(60)  # Wait before retrying
        
        # Start collection task
        collection_task = asyncio.create_task(collection_loop())
        
        logger.info(f"Started metrics collection with {collection_interval}s interval")
        
        return collection_task