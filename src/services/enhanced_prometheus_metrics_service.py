"""
Enhanced Prometheus Metrics Service for ISH Chat with Business KPIs
"""
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from prometheus_client import (
    Counter, Histogram, Gauge, Summary, Info, CollectorRegistry,
    generate_latest, CONTENT_TYPE_LATEST
)
from prometheus_client.core import REGISTRY
from aiohttp import web
import asyncio
import json

logger = logging.getLogger(__name__)

@dataclass
class EnhancedMetricConfig:
    """Enhanced configuration for metrics collection"""
    enabled: bool = True
    port: int = 9090
    path: str = "/metrics"
    registry_name: str = "enhanced_instance_manager"
    collection_interval: int = 60  # seconds
    retention_hours: int = 24
    
    # Business KPI settings
    business_kpi_interval: int = 300  # 5 minutes
    slo_tracking_enabled: bool = True
    cost_tracking_enabled: bool = True
    
    # Histogram buckets for response times
    response_time_buckets: List[float] = None
    
    def __post_init__(self):
        if self.response_time_buckets is None:
            self.response_time_buckets = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]

class EnhancedPrometheusMetricsService:
    """Enhanced Prometheus metrics collection service with Business KPIs"""
    
    def __init__(self, config: EnhancedMetricConfig = None):
        self.config = config or EnhancedMetricConfig()
        
        # Create custom registry
        self.registry = CollectorRegistry()
        
        # Initialize metrics
        self._initialize_core_metrics()
        self._initialize_business_kpi_metrics()
        self._initialize_slo_metrics()
        
        # HTTP server for metrics endpoint
        self.app = None
        self.site = None
        self.runner = None
        self._server_running = False
        
        # Business KPI data storage
        self._kpi_data = {}
        self._slo_data = {}
        
    def _initialize_core_metrics(self):
        """Initialize core metrics (inherited from base service)"""
        
        # Request metrics
        self.requests_total = Counter(
            'ish_chat_requests_total',
            'Total number of requests processed',
            ['provider_type', 'model_name', 'instance_id', 'status', 'user_type', 'feature'],
            registry=self.registry
        )
        
        self.request_duration = Histogram(
            'ish_chat_request_duration_seconds',
            'Request processing duration',
            ['provider_type', 'model_name', 'instance_id', 'user_type'],
            buckets=self.config.response_time_buckets,
            registry=self.registry
        )
        
        # Enhanced instance metrics
        self.instances_total = Gauge(
            'ish_chat_instances_total',
            'Total number of registered instances',
            ['provider_type', 'status', 'region'],
            registry=self.registry
        )
        
        self.instances_healthy = Gauge(
            'ish_chat_instances_healthy',
            'Number of healthy instances',
            ['provider_type', 'region'],
            registry=self.registry
        )
        
        # Enhanced load balancer metrics
        self.load_balancer_selections_total = Counter(
            'ish_chat_load_balancer_selections_total',
            'Total number of instance selections by load balancer',
            ['strategy', 'provider_type', 'model_name', 'region'],
            registry=self.registry
        )
        
        # Enhanced routing metrics
        self.routing_decisions_total = Counter(
            'ish_chat_routing_decisions_total',
            'Total routing decisions made',
            ['strategy', 'provider_type', 'decision_type', 'status'],
            registry=self.registry
        )
        
        self.routing_decision_duration = Histogram(
            'ish_chat_routing_decision_duration_seconds',
            'Time taken to make routing decisions',
            ['strategy', 'provider_type'],
            buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
            registry=self.registry
        )
        
        # Enhanced performance metrics
        self.tokens_used_total = Counter(
            'ish_chat_tokens_used_total',
            'Total tokens consumed',
            ['provider_type', 'model_name', 'direction'],  # direction: input, output
            registry=self.registry
        )
        
        self.cost_estimate = Gauge(
            'ish_chat_cost_estimate_dollars',
            'Estimated cost in dollars',
            ['provider_type', 'model_name', 'cost_type'],  # cost_type: request, daily, monthly
            registry=self.registry
        )
        
    def _initialize_business_kpi_metrics(self):
        """Initialize business KPI metrics"""
        
        # User engagement metrics
        self.user_requests_total = Counter(
            'ish_chat_user_requests_total',
            'Total requests from users',
            ['user_type', 'provider_type', 'feature'],
            registry=self.registry
        )
        
        self.user_session_duration = Histogram(
            'ish_chat_user_session_duration_seconds',
            'User session duration',
            ['user_type', 'provider_type'],
            buckets=[60, 300, 600, 1800, 3600, 7200],
            registry=self.registry
        )
        
        self.new_users_total = Counter(
            'ish_chat_new_users_total',
            'Total new users',
            ['user_type', 'acquisition_channel'],
            registry=self.registry
        )
        
        # User satisfaction metrics
        self.user_satisfaction_score = Gauge(
            'ish_chat_user_satisfaction_score',
            'User satisfaction score (0-1)',
            ['provider_type', 'model_name', 'rating_source'],
            registry=self.registry
        )
        
        self.user_feedback_total = Counter(
            'ish_chat_user_feedback_total',
            'Total user feedback',
            ['provider_type', 'sentiment', 'category'],
            registry=self.registry
        )
        
        # Feature usage metrics
        self.feature_usage_total = Counter(
            'ish_chat_feature_usage_total',
            'Total feature usage',
            ['feature_name', 'provider_type', 'user_type'],
            registry=self.registry
        )
        
        # Business growth metrics
        self.user_retention_rate = Gauge(
            'ish_chat_user_retention_rate_7d',
            '7-day user retention rate',
            ['user_type', 'cohort'],
            registry=self.registry
        )
        
        self.user_churn_rate = Gauge(
            'ish_chat_user_churn_rate_7d',
            '7-day user churn rate',
            ['user_type', 'reason'],
            registry=self.registry
        )
        
        # Content quality metrics
        self.response_quality_score = Gauge(
            'ish_chat_response_quality_score',
            'Response quality score (0-1)',
            ['provider_type', 'model_name', 'quality_metric'],
            registry=self.registry
        )
        
        self.content_moderation_alerts_total = Counter(
            'ish_chat_content_moderation_alerts_total',
            'Content moderation alerts',
            ['alert_type', 'provider_type', 'severity'],
            registry=self.registry
        )
        
        # Geographic metrics
        self.regional_user_requests_total = Counter(
            'ish_chat_regional_user_requests_total',
            'Regional user requests',
            ['region', 'provider_type', 'user_type'],
            registry=self.registry
        )
        
        self.regional_response_time = Histogram(
            'ish_chat_regional_response_time_seconds',
            'Regional response times',
            ['region', 'provider_type'],
            buckets=self.config.response_time_buckets,
            registry=self.registry
        )
        
        # Capacity and performance metrics
        self.max_capacity = Gauge(
            'ish_chat_max_capacity',
            'Maximum system capacity',
            ['capacity_type'],  # requests_per_minute, tokens_per_minute
            registry=self.registry
        )
        
        self.storage_usage_bytes = Gauge(
            'ish_chat_storage_usage_bytes',
            'Storage usage in bytes',
            ['storage_type'],  # database, cache, logs
            registry=self.registry
        )
        
        self.storage_capacity_bytes = Gauge(
            'ish_chat_storage_capacity_bytes',
            'Storage capacity in bytes',
            ['storage_type'],
            registry=self.registry
        )
        
        # Cost management metrics
        self.daily_cost_dollars = Gauge(
            'ish_chat_daily_cost_dollars',
            'Daily cost in dollars',
            ['provider_type', 'cost_category'],
            registry=self.registry
        )
        
        self.cost_per_user = Gauge(
            'ish_chat_cost_per_user',
            'Cost per user',
            ['provider_type', 'time_period'],  # daily, weekly, monthly
            registry=self.registry
        )
        
        # API quota metrics
        self.api_quota_used = Gauge(
            'ish_chat_api_quota_used',
            'API quota used',
            ['provider_type', 'quota_type'],
            registry=self.registry
        )
        
        self.api_quota_limit = Gauge(
            'ish_chat_api_quota_limit',
            'API quota limit',
            ['provider_type', 'quota_type'],
            registry=self.registry
        )
        
    def _initialize_slo_metrics(self):
        """Initialize Service Level Objective metrics"""
        
        # SLO compliance metrics
        self.slo_compliance = Gauge(
            'ish_chat_slo_compliance',
            'SLO compliance percentage',
            ['slo_name', 'service', 'time_window'],
            registry=self.registry
        )
        
        self.slo_budget_consumed = Gauge(
            'ish_chat_slo_budget_consumed',
            'SLO budget consumed percentage',
            ['slo_name', 'service', 'time_window'],
            registry=self.registry
        )
        
        # SLO error budget metrics
        self.slo_error_budget_total = Gauge(
            'ish_chat_slo_error_budget_total',
            'Total SLO error budget',
            ['slo_name', 'service', 'time_window'],
            registry=self.registry
        )
        
        self.slo_error_budget_remaining = Gauge(
            'ish_chat_slo_error_budget_remaining',
            'Remaining SLO error budget',
            ['slo_name', 'service', 'time_window'],
            registry=self.registry
        )
        
        # SLI metrics (Service Level Indicators)
        self.sli_availability = Gauge(
            'ish_chat_sli_availability',
            'Service availability percentage',
            ['service', 'endpoint'],
            registry=self.registry
        )
        
        self.sli_latency = Histogram(
            'ish_chat_sli_latency_seconds',
            'Service latency measurements',
            ['service', 'endpoint', 'percentile'],
            buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            registry=self.registry
        )
        
        self.sli_error_rate = Gauge(
            'ish_chat_sli_error_rate',
            'Service error rate percentage',
            ['service', 'endpoint', 'error_type'],
            registry=self.registry
        )
        
        # Business intelligence metrics
        self.revenue_per_user = Gauge(
            'ish_chat_revenue_per_user',
            'Revenue per user',
            ['user_type', 'time_period'],
            registry=self.registry
        )
        
        self.customer_acquisition_cost = Gauge(
            'ish_chat_customer_acquisition_cost',
            'Customer acquisition cost',
            ['acquisition_channel', 'time_period'],
            registry=self.registry
        )
        
        self.customer_lifetime_value = Gauge(
            'ish_chat_customer_lifetime_value',
            'Customer lifetime value',
            ['user_type', 'cohort'],
            registry=self.registry
        )
        
        # Provider performance ranking
        self.provider_performance_rank = Gauge(
            'ish_chat_provider_performance_rank',
            'Provider performance ranking',
            ['provider_type', 'ranking_metric'],
            registry=self.registry
        )
        
        self.provider_health_score = Gauge(
            'ish_chat_provider_health_score',
            'Provider health score (0-1)',
            ['provider_type', 'health_dimension'],
            registry=self.registry
        )
        
        # Model-specific metrics
        self.model_requests_total = Counter(
            'ish_chat_model_requests_total',
            'Total model requests',
            ['provider_type', 'model_name', 'user_type'],
            registry=self.registry
        )
        
        self.model_response_time = Histogram(
            'ish_chat_model_response_time_seconds',
            'Model response times',
            ['provider_type', 'model_name'],
            buckets=self.config.response_time_buckets,
            registry=self.registry
        )
        
        # Queue management metrics
        self.request_queue_size = Gauge(
            'ish_chat_request_queue_size',
            'Request queue size',
            ['provider_type', 'priority_level'],
            registry=self.registry
        )
        
        self.queue_wait_time = Histogram(
            'ish_chat_queue_wait_time_seconds',
            'Time spent in queue',
            ['provider_type', 'priority_level'],
            buckets=[1, 5, 10, 30, 60, 120, 300],
            registry=self.registry
        )
        
        # ML routing metrics
        self.ml_predictions_total = Counter(
            'ish_chat_ml_predictions_total',
            'Total ML routing predictions',
            ['model_name', 'prediction_type', 'status'],
            registry=self.registry
        )
        
        self.routing_model_accuracy = Gauge(
            'ish_chat_routing_model_accuracy',
            'Routing model accuracy',
            ['model_name', 'metric_type'],
            registry=self.registry
        )
        
        # Geographic routing metrics
        self.ai_provider_traffic_share = Gauge(
            'ish_chat_ai_provider_traffic_share',
            'AI provider traffic share percentage',
            ['provider_type', 'region'],
            registry=self.registry
        )
        
        self.region_capacity_utilization = Gauge(
            'ish_chat_region_capacity_utilization',
            'Region capacity utilization percentage',
            ['region', 'capacity_type'],
            registry=self.registry
        )
        
    # Business KPI tracking methods
    def record_user_activity(
        self,
        user_type: str,
        provider_type: str,
        feature: str,
        session_duration: Optional[float] = None
    ):
        """Record user activity metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.user_requests_total.labels(
                user_type=user_type,
                provider_type=provider_type,
                feature=feature
            ).inc()
            
            if session_duration:
                self.user_session_duration.labels(
                    user_type=user_type,
                    provider_type=provider_type
                ).observe(session_duration)
                
        except Exception as e:
            logger.error(f"Error recording user activity: {e}")
    
    def record_user_feedback(
        self,
        provider_type: str,
        sentiment: str,
        category: str,
        rating: Optional[float] = None
    ):
        """Record user feedback metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.user_feedback_total.labels(
                provider_type=provider_type,
                sentiment=sentiment,
                category=category
            ).inc()
            
            if rating:
                self.user_satisfaction_score.labels(
                    provider_type=provider_type,
                    model_name='all',
                    rating_source='user_feedback'
                ).set(rating)
                
        except Exception as e:
            logger.error(f"Error recording user feedback: {e}")
    
    def record_feature_usage(
        self,
        feature_name: str,
        provider_type: str,
        user_type: str
    ):
        """Record feature usage metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.feature_usage_total.labels(
                feature_name=feature_name,
                provider_type=provider_type,
                user_type=user_type
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording feature usage: {e}")
    
    def record_response_quality(
        self,
        provider_type: str,
        model_name: str,
        quality_metric: str,
        score: float
    ):
        """Record response quality metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.response_quality_score.labels(
                provider_type=provider_type,
                model_name=model_name,
                quality_metric=quality_metric
            ).set(score)
            
        except Exception as e:
            logger.error(f"Error recording response quality: {e}")
    
    def record_content_moderation_alert(
        self,
        alert_type: str,
        provider_type: str,
        severity: str
    ):
        """Record content moderation alerts"""
        
        if not self.config.enabled:
            return
        
        try:
            self.content_moderation_alerts_total.labels(
                alert_type=alert_type,
                provider_type=provider_type,
                severity=severity
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording content moderation alert: {e}")
    
    def record_regional_activity(
        self,
        region: str,
        provider_type: str,
        user_type: str,
        response_time: Optional[float] = None
    ):
        """Record regional activity metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            self.regional_user_requests_total.labels(
                region=region,
                provider_type=provider_type,
                user_type=user_type
            ).inc()
            
            if response_time:
                self.regional_response_time.labels(
                    region=region,
                    provider_type=provider_type
                ).observe(response_time)
                
        except Exception as e:
            logger.error(f"Error recording regional activity: {e}")
    
    def update_slo_metrics(
        self,
        slo_name: str,
        service: str,
        time_window: str,
        compliance: float,
        budget_consumed: float
    ):
        """Update SLO metrics"""
        
        if not self.config.enabled or not self.config.slo_tracking_enabled:
            return
        
        try:
            self.slo_compliance.labels(
                slo_name=slo_name,
                service=service,
                time_window=time_window
            ).set(compliance)
            
            self.slo_budget_consumed.labels(
                slo_name=slo_name,
                service=service,
                time_window=time_window
            ).set(budget_consumed)
            
            # Calculate remaining budget
            remaining_budget = max(0, 1.0 - budget_consumed)
            self.slo_error_budget_remaining.labels(
                slo_name=slo_name,
                service=service,
                time_window=time_window
            ).set(remaining_budget)
            
        except Exception as e:
            logger.error(f"Error updating SLO metrics: {e}")
    
    def update_cost_metrics(
        self,
        provider_type: str,
        daily_cost: float,
        cost_per_user: Optional[float] = None
    ):
        """Update cost metrics"""
        
        if not self.config.enabled or not self.config.cost_tracking_enabled:
            return
        
        try:
            self.daily_cost_dollars.labels(
                provider_type=provider_type,
                cost_category='total'
            ).set(daily_cost)
            
            if cost_per_user:
                self.cost_per_user.labels(
                    provider_type=provider_type,
                    time_period='daily'
                ).set(cost_per_user)
                
        except Exception as e:
            logger.error(f"Error updating cost metrics: {e}")
    
    def update_capacity_metrics(
        self,
        storage_used: Dict[str, int],
        storage_capacity: Dict[str, int],
        max_capacity: Dict[str, int]
    ):
        """Update capacity metrics"""
        
        if not self.config.enabled:
            return
        
        try:
            for storage_type, used_bytes in storage_used.items():
                self.storage_usage_bytes.labels(
                    storage_type=storage_type
                ).set(used_bytes)
                
                capacity_bytes = storage_capacity.get(storage_type, 0)
                self.storage_capacity_bytes.labels(
                    storage_type=storage_type
                ).set(capacity_bytes)
            
            for capacity_type, capacity_value in max_capacity.items():
                self.max_capacity.labels(
                    capacity_type=capacity_type
                ).set(capacity_value)
                
        except Exception as e:
            logger.error(f"Error updating capacity metrics: {e}")
    
    # Enhanced request recording
    def record_enhanced_request(
        self,
        provider_type: str,
        model_name: str,
        instance_id: str,
        status: str,
        duration: float,
        user_type: str = 'unknown',
        feature: str = 'general',
        tokens_input: int = 0,
        tokens_output: int = 0,
        cost_estimate: float = 0.0
    ):
        """Record a comprehensive request with all metadata"""
        
        if not self.config.enabled:
            return
        
        try:
            # Core request metrics
            self.requests_total.labels(
                provider_type=provider_type,
                model_name=model_name,
                instance_id=instance_id,
                status=status,
                user_type=user_type,
                feature=feature
            ).inc()
            
            self.request_duration.labels(
                provider_type=provider_type,
                model_name=model_name,
                instance_id=instance_id,
                user_type=user_type
            ).observe(duration)
            
            # Model-specific metrics
            self.model_requests_total.labels(
                provider_type=provider_type,
                model_name=model_name,
                user_type=user_type
            ).inc()
            
            self.model_response_time.labels(
                provider_type=provider_type,
                model_name=model_name
            ).observe(duration)
            
            # Token usage
            if tokens_input > 0:
                self.tokens_used_total.labels(
                    provider_type=provider_type,
                    model_name=model_name,
                    direction='input'
                ).inc(tokens_input)
            
            if tokens_output > 0:
                self.tokens_used_total.labels(
                    provider_type=provider_type,
                    model_name=model_name,
                    direction='output'
                ).inc(tokens_output)
            
            # Cost tracking
            if cost_estimate > 0:
                self.cost_estimate.labels(
                    provider_type=provider_type,
                    model_name=model_name,
                    cost_type='request'
                ).set(cost_estimate)
            
            # User activity
            self.record_user_activity(user_type, provider_type, feature)
            
        except Exception as e:
            logger.error(f"Error recording enhanced request: {e}")
    
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
            
            # Add health check endpoint
            self.app.router.add_get('/health', self._health_handler)
            
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
            
            logger.info(f"Enhanced Prometheus metrics server started on port {self.config.port}")
            
        except Exception as e:
            logger.error(f"Failed to start enhanced metrics server: {e}")
            raise
    
    async def _health_handler(self, request):
        """Handle health check requests"""
        return web.Response(
            text=json.dumps({
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat(),
                "metrics_enabled": self.config.enabled
            }),
            content_type="application/json"
        )
    
    async def _metrics_handler(self, request):
        """Handle metrics HTTP requests"""
        
        try:
            # Update any dynamic metrics before serving
            await self._update_dynamic_metrics()
            
            metrics_data = generate_latest(self.registry)
            return web.Response(
                body=metrics_data,
                content_type=CONTENT_TYPE_LATEST
            )
        except Exception as e:
            logger.error(f"Error generating enhanced metrics: {e}")
            return web.Response(
                text=f"Error generating enhanced metrics: {e}",
                status=500
            )
    
    async def _update_dynamic_metrics(self):
        """Update dynamic metrics that need real-time calculation"""
        
        if not self.config.enabled:
            return
        
        try:
            # Calculate dynamic SLO compliance
            # This would integrate with actual SLO calculation logic
            current_time = datetime.utcnow()
            
            # Update system-wide metrics
            # This could pull from a database or other data sources
            
            # Calculate real-time cost metrics
            # This would aggregate cost data from various sources
            
            logger.debug("Dynamic metrics updated")
            
        except Exception as e:
            logger.error(f"Error updating dynamic metrics: {e}")
    
    async def start_kpi_collection(self):
        """Start periodic KPI collection"""
        
        if not self.config.enabled:
            return
        
        async def kpi_collection_loop():
            while True:
                try:
                    await self._collect_business_kpis()
                    await asyncio.sleep(self.config.business_kpi_interval)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in KPI collection loop: {e}")
                    await asyncio.sleep(300)  # Wait 5 minutes before retrying
        
        # Start KPI collection task
        kpi_task = asyncio.create_task(kpi_collection_loop())
        
        logger.info(f"Started KPI collection with {self.config.business_kpi_interval}s interval")
        
        return kpi_task
    
    async def _collect_business_kpis(self):
        """Collect business KPI data"""
        
        try:
            # This would integrate with various data sources
            # to calculate business metrics
            
            # Example: Calculate user retention rates
            # Example: Calculate customer lifetime value
            # Example: Calculate revenue per user
            
            logger.debug("Business KPIs collected")
            
        except Exception as e:
            logger.error(f"Error collecting business KPIs: {e}")
    
    # Cleanup and management methods
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
            logger.info("Enhanced Prometheus metrics server stopped")
            
        except Exception as e:
            logger.error(f"Error stopping enhanced metrics server: {e}")
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get a summary of current metrics"""
        
        try:
            # This would collect and summarize key metrics
            # for quick overview and status reporting
            
            summary = {
                "timestamp": datetime.utcnow().isoformat(),
                "metrics_enabled": self.config.enabled,
                "server_running": self._server_running,
                "total_requests": 0,  # Would calculate from metrics
                "active_instances": 0,  # Would calculate from metrics
                "error_rate": 0.0,  # Would calculate from metrics
                "average_response_time": 0.0,  # Would calculate from metrics
            }
            
            return summary
            
        except Exception as e:
            logger.error(f"Error generating metrics summary: {e}")
            return {"error": str(e)}