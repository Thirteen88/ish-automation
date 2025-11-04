"""
Performance Monitoring and Optimization Service for Intelligent Query Router

This service provides comprehensive monitoring, analytics, and optimization
for the intelligent query routing system.
"""

import asyncio
import json
import logging
import time
import statistics
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum
import redis
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func

from ..models.instance_manager import (
    AIInstance, RequestLog, ProviderType, InstanceStatus
)
from ..database.database import get_db
from .intelligent_query_router import (
    IntelligentQueryRouter, QueryType, QueryComplexity, RoutingStrategy
)

logger = logging.getLogger(__name__)

class MetricType(Enum):
    """Types of performance metrics"""
    ROUTING_PERFORMANCE = "routing_performance"
    INSTANCE_PERFORMANCE = "instance_performance"
    COST_METRICS = "cost_metrics"
    USER_SATISFACTION = "user_satisfaction"
    ERROR_ANALYSIS = "error_analysis"
    CAPACITY_UTILIZATION = "capacity_utilization"

class OptimizationType(Enum):
    """Types of optimizations"""
    ROUTING_RULES = "routing_rules"
    CIRCUIT_BREAKER = "circuit_breaker"
    LOAD_BALANCING = "load_balancing"
    COST_OPTIMIZATION = "cost_optimization"
    PERFORMANCE_TUNING = "performance_tuning"

@dataclass
class RoutingMetrics:
    """Metrics for routing performance"""
    timestamp: datetime
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    timeout_requests: int = 0
    
    # Performance metrics
    average_routing_time: float = 0.0
    average_response_time: float = 0.0
    p95_response_time: float = 0.0
    p99_response_time: float = 0.0
    
    # Cost metrics
    total_cost: float = 0.0
    average_cost_per_request: float = 0.0
    
    # Quality metrics
    average_confidence_score: float = 0.0
    user_satisfaction_score: float = 0.0
    
    # Distribution metrics
    strategy_distribution: Dict[str, int] = field(default_factory=dict)
    query_type_distribution: Dict[str, int] = field(default_factory=dict)
    provider_distribution: Dict[str, int] = field(default_factory=dict)

@dataclass
class InstanceMetrics:
    """Metrics for individual AI instances"""
    instance_id: str
    provider_type: str
    model_name: str
    timestamp: datetime
    
    # Performance metrics
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    timeout_requests: int = 0
    
    # Response time metrics
    average_response_time: float = 0.0
    min_response_time: float = 0.0
    max_response_time: float = 0.0
    p95_response_time: float = 0.0
    
    # Capacity metrics
    current_load: int = 0
    max_concurrent_requests: int = 0
    utilization_percentage: float = 0.0
    
    # Quality metrics
    success_rate: float = 0.0
    error_rate: float = 0.0
    average_confidence_score: float = 0.0
    
    # Cost metrics
    total_cost: float = 0.0
    average_cost_per_request: float = 0.0
    cost_efficiency_score: float = 0.0

@dataclass
class OptimizationRecommendation:
    """Optimization recommendation"""
    optimization_type: OptimizationType
    priority: str  # low, medium, high, critical
    title: str
    description: str
    expected_impact: str
    implementation_effort: str  # low, medium, high
    metrics_affected: List[str]
    recommended_actions: List[str]
    potential_savings: Optional[float] = None  # Cost savings in USD/month
    performance_improvement: Optional[float] = None  # Percentage improvement

@dataclass
class PerformanceAlert:
    """Performance alert"""
    alert_id: str
    severity: str  # info, warning, error, critical
    title: str
    description: str
    metric_name: str
    current_value: float
    threshold_value: float
    timestamp: datetime
    instance_id: Optional[str] = None
    recommended_actions: List[str] = field(default_factory=list)

class RouterPerformanceMonitor:
    """Performance monitoring service for intelligent query router"""
    
    def __init__(self, router: IntelligentQueryRouter, redis_client: redis.Redis = None):
        self.router = router
        self.redis_client = redis_client
        
        # Monitoring configuration
        self.metrics_retention_days = 30
        self.alert_thresholds = self._initialize_alert_thresholds()
        self.optimization_enabled = True
        self.monitoring_interval = 60  # seconds
        
        # Metrics storage
        self.routing_metrics_history: List[RoutingMetrics] = []
        self.instance_metrics_cache: Dict[str, InstanceMetrics] = {}
        self.active_alerts: Dict[str, PerformanceAlert] = {}
        
        # Performance optimization
        self.last_optimization_time = datetime.utcnow()
        self.optimization_interval = timedelta(hours=6)
        self.optimization_history: List[Dict[str, Any]] = []
        
        logger.info("Router Performance Monitor initialized")

    def _initialize_alert_thresholds(self) -> Dict[str, Dict[str, float]]:
        """Initialize alert thresholds"""
        return {
            "routing_time": {
                "warning": 50.0,   # ms
                "error": 100.0,    # ms
                "critical": 200.0  # ms
            },
            "response_time": {
                "warning": 2000.0,  # ms
                "error": 5000.0,    # ms
                "critical": 10000.0 # ms
            },
            "success_rate": {
                "warning": 95.0,    # %
                "error": 90.0,      # %
                "critical": 80.0    # %
            },
            "error_rate": {
                "warning": 5.0,     # %
                "error": 10.0,      # %
                "critical": 20.0    # %
            },
            "cost_per_request": {
                "warning": 0.05,    # $
                "error": 0.10,      # $
                "critical": 0.20    # $
            },
            "confidence_score": {
                "warning": 0.7,     # score
                "error": 0.5,       # score
                "critical": 0.3     # score
            }
        }

    async def start_monitoring(self):
        """Start continuous monitoring"""
        logger.info("Starting router performance monitoring")
        
        while True:
            try:
                await self._collect_metrics()
                await self._analyze_performance()
                await self._check_alerts()
                
                if self.optimization_enabled:
                    await self._check_optimization_opportunities()
                
                await asyncio.sleep(self.monitoring_interval)
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {str(e)}")
                await asyncio.sleep(self.monitoring_interval)

    async def _collect_metrics(self):
        """Collect performance metrics from various sources"""
        timestamp = datetime.utcnow()
        
        # Collect routing metrics
        routing_metrics = await self._collect_routing_metrics(timestamp)
        self.routing_metrics_history.append(routing_metrics)
        
        # Keep only recent metrics
        cutoff_date = timestamp - timedelta(days=self.metrics_retention_days)
        self.routing_metrics_history = [
            m for m in self.routing_metrics_history 
            if m.timestamp > cutoff_date
        ]
        
        # Collect instance metrics
        await self._collect_instance_metrics(timestamp)
        
        # Store metrics in Redis for persistence
        if self.redis_client:
            await self._store_metrics_in_redis(routing_metrics)

    async def _collect_routing_metrics(self, timestamp: datetime) -> RoutingMetrics:
        """Collect routing performance metrics"""
        
        # Get recent routing decisions from cache
        recent_decisions = list(self.router.routing_cache.values())
        
        # Get feedback data from Redis
        feedback_data = []
        if self.redis_client:
            try:
                feedback_json = await self.redis_client.lrange("routing_feedback", 0, -1)
                feedback_data = [
                    json.loads(fb) for fb in feedback_json
                    if fb  # Filter out None values
                ]
            except Exception as e:
                logger.error(f"Error reading feedback from Redis: {str(e)}")
        
        # Calculate metrics
        total_requests = len(recent_decisions) + len(feedback_data)
        successful_requests = len([
            d for d in recent_decisions 
            if d.selected_instance.is_healthy
        ]) + len([
            f for f in feedback_data 
            if f.get("success", False)
        ])
        
        failed_requests = total_requests - successful_requests
        
        # Response time metrics
        response_times = [
            d.estimated_response_time for d in recent_decisions
            if d.estimated_response_time > 0
        ] + [
            f.get("response_time", 0) for f in feedback_data
            if f.get("response_time", 0) > 0
        ]
        
        average_response_time = statistics.mean(response_times) if response_times else 0.0
        p95_response_time = statistics.quantiles(response_times, n=20)[18] if len(response_times) >= 20 else (response_times[-1] if response_times else 0.0)
        
        # Cost metrics
        total_cost = sum([
            d.estimated_cost for d in recent_decisions
        ]) + sum([
            f.get("actual_cost", 0) for f in feedback_data
        ])
        
        average_cost_per_request = total_cost / max(total_requests, 1)
        
        # Quality metrics
        confidence_scores = [
            d.confidence_score for d in recent_decisions
            if d.confidence_score > 0
        ]
        average_confidence_score = statistics.mean(confidence_scores) if confidence_scores else 0.0
        
        # User satisfaction
        satisfaction_scores = [
            f.get("user_satisfaction", 3) for f in feedback_data
            if f.get("user_satisfaction") is not None
        ]
        user_satisfaction_score = statistics.mean(satisfaction_scores) if satisfaction_scores else 3.0
        
        # Distribution metrics
        strategy_distribution = {}
        query_type_distribution = {}
        provider_distribution = {}
        
        for decision in recent_decisions:
            # Strategy distribution
            strategy = decision.routing_strategy.value
            strategy_distribution[strategy] = strategy_distribution.get(strategy, 0) + 1
            
            # Query type distribution
            qtype = decision.query_analysis.query_type.value
            query_type_distribution[qtype] = query_type_distribution.get(qtype, 0) + 1
            
            # Provider distribution
            provider = decision.selected_instance.provider_type
            provider_distribution[provider] = provider_distribution.get(provider, 0) + 1
        
        return RoutingMetrics(
            timestamp=timestamp,
            total_requests=total_requests,
            successful_requests=successful_requests,
            failed_requests=failed_requests,
            average_routing_time=statistics.mean([
                d.routing_time_ms for d in recent_decisions
                if d.routing_time_ms > 0
            ]) if recent_decisions else 0.0,
            average_response_time=average_response_time,
            p95_response_time=p95_response_time,
            p99_response_time=statistics.quantiles(response_times, n=100)[98] if len(response_times) >= 100 else (response_times[-1] if response_times else 0.0),
            total_cost=total_cost,
            average_cost_per_request=average_cost_per_request,
            average_confidence_score=average_confidence_score,
            user_satisfaction_score=user_satisfaction_score,
            strategy_distribution=strategy_distribution,
            query_type_distribution=query_type_distribution,
            provider_distribution=provider_distribution
        )

    async def _collect_instance_metrics(self, timestamp: datetime):
        """Collect metrics for individual instances"""
        
        db = next(get_db())
        try:
            # Get all active instances
            instances = await self.router.instance_manager.list_instances(
                db, is_active=True
            )
            
            for instance in instances:
                # Get recent request logs for this instance
                since_time = timestamp - timedelta(hours=1)
                recent_logs = db.query(RequestLog).filter(
                    and_(
                        RequestLog.instance_id == instance.instance_id,
                        RequestLog.created_at >= since_time
                    )
                ).all()
                
                # Calculate metrics
                total_requests = len(recent_logs)
                successful_requests = len([
                    log for log in recent_logs if log.status == "success"
                ])
                failed_requests = len([
                    log for log in recent_logs if log.status == "error"
                ])
                timeout_requests = len([
                    log for log in recent_logs if log.status == "timeout"
                ])
                
                # Response time metrics
                response_times = [
                    log.response_time for log in recent_logs
                    if log.response_time is not None and log.response_time > 0
                ]
                
                average_response_time = statistics.mean(response_times) if response_times else 0.0
                min_response_time = min(response_times) if response_times else 0.0
                max_response_time = max(response_times) if response_times else 0.0
                p95_response_time = statistics.quantiles(response_times, n=20)[18] if len(response_times) >= 20 else (response_times[-1] if response_times else 0.0)
                
                # Capacity metrics
                utilization_percentage = (
                    (instance.current_load / max(instance.max_concurrent_requests, 1)) * 100
                )
                
                # Quality metrics
                success_rate = (successful_requests / max(total_requests, 1)) * 100
                error_rate = (failed_requests / max(total_requests, 1)) * 100
                
                # Cost metrics
                specialization = self.router.specialization_registry.get_specialization(
                    instance.provider_type, instance.model_name
                )
                
                total_cost = sum([
                    log.metadata.get("cost", 0) for log in recent_logs
                    if log.metadata and log.metadata.get("cost")
                ]) if recent_logs else 0.0
                
                average_cost_per_request = total_cost / max(total_requests, 1)
                
                # Cost efficiency score (lower cost is better, normalized)
                if specialization and specialization.cost_per_1k_tokens > 0:
                    cost_efficiency_score = min(1.0, 0.01 / specialization.cost_per_1k_tokens)
                else:
                    cost_efficiency_score = 0.5  # Default score
                
                # Create instance metrics
                instance_metrics = InstanceMetrics(
                    instance_id=instance.instance_id,
                    provider_type=instance.provider_type,
                    model_name=instance.model_name,
                    timestamp=timestamp,
                    total_requests=total_requests,
                    successful_requests=successful_requests,
                    failed_requests=failed_requests,
                    timeout_requests=timeout_requests,
                    average_response_time=average_response_time,
                    min_response_time=min_response_time,
                    max_response_time=max_response_time,
                    p95_response_time=p95_response_time,
                    current_load=instance.current_load,
                    max_concurrent_requests=instance.max_concurrent_requests,
                    utilization_percentage=utilization_percentage,
                    success_rate=success_rate,
                    error_rate=error_rate,
                    average_confidence_score=0.8,  # Would be calculated from actual routing decisions
                    total_cost=total_cost,
                    average_cost_per_request=average_cost_per_request,
                    cost_efficiency_score=cost_efficiency_score
                )
                
                # Store in cache
                self.instance_metrics_cache[instance.instance_id] = instance_metrics
                
        finally:
            db.close()

    async def _store_metrics_in_redis(self, metrics: RoutingMetrics):
        """Store metrics in Redis for persistence and analysis"""
        try:
            # Store latest metrics
            metrics_key = "router_metrics:latest"
            await self.redis_client.setex(
                metrics_key,
                timedelta(hours=24),
                json.dumps(asdict(metrics), default=str)
            )
            
            # Store in time series
            timestamp_key = f"router_metrics:{metrics.timestamp.strftime('%Y%m%d%H%M')}"
            await self.redis_client.setex(
                timestamp_key,
                timedelta(days=self.metrics_retention_days),
                json.dumps(asdict(metrics), default=str)
            )
            
            # Add to recent metrics list
            await self.redis_client.lpush(
                "router_metrics:recent",
                json.dumps(asdict(metrics), default=str)
            )
            await self.redis_client.ltrim("router_metrics:recent", 0, 999)
            
        except Exception as e:
            logger.error(f"Error storing metrics in Redis: {str(e)}")

    async def _analyze_performance(self):
        """Analyze performance trends and identify issues"""
        
        if len(self.routing_metrics_history) < 2:
            return  # Not enough data for analysis
        
        # Get recent metrics for comparison
        current_metrics = self.routing_metrics_history[-1]
        previous_metrics = self.routing_metrics_history[-2]
        
        # Analyze trends
        performance_changes = self._calculate_performance_changes(
            current_metrics, previous_metrics
        )
        
        # Log significant changes
        for metric, change in performance_changes.items():
            if abs(change["percentage_change"]) > 10:  # 10% threshold
                direction = "increased" if change["percentage_change"] > 0 else "decreased"
                logger.info(
                    f"Performance alert: {metric} {direction} by "
                    f"{abs(change['percentage_change']):.1f}% "
                    f"(from {change['previous_value']:.2f} to {change['current_value']:.2f})"
                )

    def _calculate_performance_changes(
        self,
        current: RoutingMetrics,
        previous: RoutingMetrics
    ) -> Dict[str, Dict[str, float]]:
        """Calculate percentage changes in key metrics"""
        
        changes = {}
        
        # Compare key metrics
        metrics_to_compare = [
            ("average_response_time", "average_response_time"),
            ("success_rate", "successful_requests / total_requests * 100"),
            ("average_cost_per_request", "average_cost_per_request"),
            ("average_confidence_score", "average_confidence_score")
        ]
        
        for metric_name, metric_path in metrics_to_compare:
            current_value = getattr(current, metric_name)
            previous_value = getattr(previous, metric_name)
            
            if previous_value != 0:
                percentage_change = ((current_value - previous_value) / previous_value) * 100
            else:
                percentage_change = 0
            
            changes[metric_name] = {
                "current_value": current_value,
                "previous_value": previous_value,
                "percentage_change": percentage_change
            }
        
        return changes

    async def _check_alerts(self):
        """Check for performance alerts based on thresholds"""
        
        current_metrics = self.routing_metrics_history[-1] if self.routing_metrics_history else None
        if not current_metrics:
            return
        
        # Check routing time alert
        await self._check_metric_alert(
            metric_name="routing_time",
            current_value=current_metrics.average_routing_time,
            instance_id=None
        )
        
        # Check response time alert
        await self._check_metric_alert(
            metric_name="response_time",
            current_value=current_metrics.average_response_time,
            instance_id=None
        )
        
        # Check success rate alert
        success_rate = (current_metrics.successful_requests / max(current_metrics.total_requests, 1)) * 100
        await self._check_metric_alert(
            metric_name="success_rate",
            current_value=success_rate,
            instance_id=None
        )
        
        # Check instance-specific alerts
        for instance_id, instance_metrics in self.instance_metrics_cache.items():
            # Response time
            await self._check_metric_alert(
                metric_name="response_time",
                current_value=instance_metrics.average_response_time,
                instance_id=instance_id
            )
            
            # Success rate
            await self._check_metric_alert(
                metric_name="success_rate",
                current_value=instance_metrics.success_rate,
                instance_id=instance_id
            )
            
            # Error rate
            await self._check_metric_alert(
                metric_name="error_rate",
                current_value=instance_metrics.error_rate,
                instance_id=instance_id
            )

    async def _check_metric_alert(
        self,
        metric_name: str,
        current_value: float,
        instance_id: Optional[str] = None
    ):
        """Check if metric exceeds alert thresholds"""
        
        if metric_name not in self.alert_thresholds:
            return
        
        thresholds = self.alert_thresholds[metric_name]
        alert_id = f"{metric_name}_{instance_id or 'global'}"
        
        # Determine alert severity
        severity = None
        if current_value >= thresholds["critical"]:
            severity = "critical"
        elif current_value >= thresholds["error"]:
            severity = "error"
        elif current_value >= thresholds["warning"]:
            severity = "warning"
        
        if severity:
            # Create or update alert
            alert = PerformanceAlert(
                alert_id=alert_id,
                severity=severity,
                title=f"{metric_name.replace('_', ' ').title()} Alert",
                description=f"{metric_name.replace('_', ' ').title()} is {current_value:.2f}, threshold is {thresholds[severity]:.2f}",
                metric_name=metric_name,
                current_value=current_value,
                threshold_value=thresholds[severity],
                timestamp=datetime.utcnow(),
                instance_id=instance_id,
                recommended_actions=self._get_alert_recommendations(metric_name, severity)
            )
            
            self.active_alerts[alert_id] = alert
            
            # Log alert
            logger.warning(
                f"Performance alert [{severity}]: {alert.description} "
                f"(Instance: {instance_id or 'Global'})"
            )
            
            # Store in Redis
            if self.redis_client:
                await self.redis_client.setex(
                    f"alert:{alert_id}",
                    timedelta(hours=24),
                    json.dumps(asdict(alert), default=str)
                )
        else:
            # Clear alert if it exists and condition is resolved
            if alert_id in self.active_alerts:
                logger.info(f"Alert resolved: {alert_id}")
                del self.active_alerts[alert_id]
                
                if self.redis_client:
                    await self.redis_client.delete(f"alert:{alert_id}")

    def _get_alert_recommendations(self, metric_name: str, severity: str) -> List[str]:
        """Get recommended actions for an alert"""
        
        recommendations = {
            "routing_time": {
                "warning": [
                    "Consider optimizing routing algorithms",
                    "Check if caching is working properly",
                    "Monitor system resources"
                ],
                "error": [
                    "Investigate routing bottlenecks",
                    "Consider scaling router service",
                    "Check database performance"
                ],
                "critical": [
                    "Immediate investigation required",
                    "Consider emergency scaling",
                    "Check for system failures"
                ]
            },
            "response_time": {
                "warning": [
                    "Monitor instance performance",
                    "Check if instances are overloaded",
                    "Review routing decisions"
                ],
                "error": [
                    "Investigate slow instances",
                    "Consider load balancing adjustments",
                    "Check network connectivity"
                ],
                "critical": [
                    "Immediate performance investigation",
                    "Consider failover procedures",
                    "Check for service outages"
                ]
            },
            "success_rate": {
                "warning": [
                    "Monitor error patterns",
                    "Check instance health",
                    "Review routing decisions"
                ],
                "error": [
                    "Investigate failure causes",
                    "Check circuit breaker status",
                    "Review fallback mechanisms"
                ],
                "critical": [
                    "Emergency response required",
                    "Check for service outages",
                    "Activate emergency procedures"
                ]
            },
            "error_rate": {
                "warning": [
                    "Monitor error trends",
                    "Check instance logs",
                    "Review API rate limits"
                ],
                "error": [
                    "Investigate error sources",
                    "Check API quotas",
                    "Review error handling"
                ],
                "critical": [
                    "Immediate investigation required",
                    "Check for service disruptions",
                    "Consider service degradation"
                ]
            }
        }
        
        return recommendations.get(metric_name, {}).get(severity, [
            "Monitor the situation",
            "Investigate the root cause",
            "Consider system adjustments"
        ])

    async def _check_optimization_opportunities(self):
        """Check for optimization opportunities"""
        
        # Check if it's time for optimization
        if datetime.utcnow() - self.last_optimization_time < self.optimization_interval:
            return
        
        logger.info("Checking for optimization opportunities")
        
        recommendations = []
        
        # Cost optimization
        cost_recommendations = await self._analyze_cost_optimization()
        recommendations.extend(cost_recommendations)
        
        # Performance optimization
        perf_recommendations = await self._analyze_performance_optimization()
        recommendations.extend(perf_recommendations)
        
        # Load balancing optimization
        load_recommendations = await self._analyze_load_balancing_optimization()
        recommendations.extend(load_recommendations)
        
        # Store recommendations
        if recommendations:
            optimization_record = {
                "timestamp": datetime.utcnow().isoformat(),
                "recommendations": [asdict(rec) for rec in recommendations],
                "total_recommendations": len(recommendations)
            }
            
            self.optimization_history.append(optimization_record)
            
            # Store in Redis
            if self.redis_client:
                await self.redis_client.lpush(
                    "optimization_recommendations",
                    json.dumps(optimization_record)
                )
                await self.redis_client.ltrim("optimization_recommendations", 0, 49)
            
            logger.info(f"Generated {len(recommendations)} optimization recommendations")
        
        self.last_optimization_time = datetime.utcnow()

    async def _analyze_cost_optimization(self) -> List[OptimizationRecommendation]:
        """Analyze cost optimization opportunities"""
        recommendations = []
        
        if not self.routing_metrics_history:
            return recommendations
        
        current_metrics = self.routing_metrics_history[-1]
        
        # Check for high-cost routing
        if current_metrics.average_cost_per_request > 0.05:  # $0.05 per request
            recommendations.append(OptimizationRecommendation(
                optimization_type=OptimizationType.COST_OPTIMIZATION,
                priority="high",
                title="High Average Cost Per Request",
                description=f"Current average cost per request is ${current_metrics.average_cost_per_request:.4f}, which is above optimal range",
                expected_impact="Reduce operational costs by 20-40%",
                implementation_effort="medium",
                metrics_affected=["average_cost_per_request", "total_cost"],
                recommended_actions=[
                    "Review routing strategy preferences",
                    "Increase weight of cost-based routing",
                    "Consider using more cost-effective models for simple queries",
                    "Implement cost-aware query classification"
                ],
                potential_savings=(current_metrics.average_cost_per_request - 0.02) * 10000  # Assuming 10k requests/month
            ))
        
        # Check provider distribution for cost optimization
        if current_metrics.provider_distribution:
            # Find most expensive provider
            expensive_providers = []
            for provider, count in current_metrics.provider_distribution.items():
                specialization = None
                for spec in self.router.specialization_registry.specializations.values():
                    if spec.provider_type.value == provider:
                        specialization = spec
                        break
                
                if specialization and specialization.cost_per_1k_tokens > 0.02:
                    expensive_providers.append((provider, specialization.cost_per_1k_tokens, count))
            
            if expensive_providers:
                most_expensive = max(expensive_providers, key=lambda x: x[1])
                recommendations.append(OptimizationRecommendation(
                    optimization_type=OptimizationType.COST_OPTIMIZATION,
                    priority="medium",
                    title=f"Optimize Usage of {most_expensive[0]} Provider",
                    description=f"Provider {most_expensive[0]} has high cost (${most_expensive[1]:.4f}/1k tokens) and represents {most_expensive[2]} requests",
                    expected_impact="Reduce costs by 15-25%",
                    implementation_effort="low",
                    metrics_affected=["total_cost", "provider_distribution"],
                    recommended_actions=[
                        "Review routing rules for this provider",
                        "Consider alternative providers for similar query types",
                        "Implement cost caps for expensive providers",
                        "Use cost-effective models for non-critical queries"
                    ],
                    potential_savings=most_expensive[1] * 10  # Rough estimate
                ))
        
        return recommendations

    async def _analyze_performance_optimization(self) -> List[OptimizationRecommendation]:
        """Analyze performance optimization opportunities"""
        recommendations = []
        
        if not self.routing_metrics_history:
            return recommendations
        
        current_metrics = self.routing_metrics_history[-1]
        
        # Check for high response times
        if current_metrics.average_response_time > 3000:  # 3 seconds
            recommendations.append(OptimizationRecommendation(
                optimization_type=OptimizationType.PERFORMANCE_TUNING,
                priority="high",
                title="High Average Response Time",
                description=f"Current average response time is {current_metrics.average_response_time:.0f}ms, which is above optimal range",
                expected_impact="Improve user experience by 30-50%",
                implementation_effort="medium",
                metrics_affected=["average_response_time", "p95_response_time"],
                recommended_actions=[
                    "Review instance performance metrics",
                    "Identify and address slow instances",
                    "Optimize routing strategy for performance",
                    "Consider instance scaling or upgrades"
                ],
                performance_improvement=25.0
            ))
        
        # Check for low confidence scores
        if current_metrics.average_confidence_score < 0.7:
            recommendations.append(OptimizationRecommendation(
                optimization_type=OptimizationType.ROUTING_RULES,
                priority="medium",
                title="Low Routing Confidence Scores",
                description=f"Current average confidence score is {current_metrics.average_confidence_score:.2f}, indicating routing uncertainty",
                expected_impact="Improve routing accuracy by 20-30%",
                implementation_effort="medium",
                metrics_affected=["average_confidence_score", "success_rate"],
                recommended_actions=[
                    "Review and improve query classification",
                    "Add more specialized models for specific query types",
                    "Improve model specialization mapping",
                    "Collect more routing feedback data"
                ],
                performance_improvement=20.0
            ))
        
        # Check instance utilization
        underutilized_instances = []
        overloaded_instances = []
        
        for instance_id, metrics in self.instance_metrics_cache.items():
            if metrics.utilization_percentage < 20:
                underutilized_instances.append((instance_id, metrics.utilization_percentage))
            elif metrics.utilization_percentage > 80:
                overloaded_instances.append((instance_id, metrics.utilization_percentage))
        
        if underutilized_instances:
            recommendations.append(OptimizationRecommendation(
                optimization_type=OptimizationType.LOAD_BALANCING,
                priority="low",
                title="Underutilized Instances Detected",
                description=f"Found {len(underutilized_instances)} instances with less than 20% utilization",
                expected_impact="Optimize resource allocation and reduce costs",
                implementation_effort="low",
                metrics_affected=["capacity_utilization", "total_cost"],
                recommended_actions=[
                    "Review routing distribution",
                    "Consider consolidating underutilized instances",
                    "Adjust load balancing weights",
                    "Review instance sizing requirements"
                ]
            ))
        
        if overloaded_instances:
            recommendations.append(OptimizationRecommendation(
                optimization_type=OptimizationType.LOAD_BALANCING,
                priority="high",
                title="Overloaded Instances Detected",
                description=f"Found {len(overloaded_instances)} instances with over 80% utilization",
                expected_impact="Improve performance and reliability by 40-60%",
                implementation_effort="medium",
                metrics_affected=["capacity_utilization", "average_response_time"],
                recommended_actions=[
                    "Scale up overloaded instances",
                    "Improve load distribution",
                    "Add more instances to handle load",
                    "Implement better load balancing strategies"
                ],
                performance_improvement=35.0
            ))
        
        return recommendations

    async def _analyze_load_balancing_optimization(self) -> List[OptimizationRecommendation]:
        """Analyze load balancing optimization opportunities"""
        recommendations = []
        
        # Analyze strategy distribution
        if self.routing_metrics_history:
            current_metrics = self.routing_metrics_history[-1]
            
            if current_metrics.strategy_distribution:
                # Check if one strategy dominates too much
                total_requests = sum(current_metrics.strategy_distribution.values())
                
                for strategy, count in current_metrics.strategy_distribution.items():
                    percentage = (count / total_requests) * 100
                    
                    if percentage > 80:  # One strategy used more than 80% of the time
                        recommendations.append(OptimizationRecommendation(
                            optimization_type=OptimizationType.LOAD_BALANCING,
                            priority="medium",
                            title=f"Over-reliance on {strategy} Strategy",
                            description=f"Strategy {strategy} is used for {percentage:.1f}% of requests, which may indicate lack of optimization",
                            expected_impact="Improve routing diversity and cost efficiency",
                            implementation_effort="low",
                            metrics_affected=["strategy_distribution", "average_cost_per_request"],
                            recommended_actions=[
                                "Review routing strategy effectiveness",
                                "Consider A/B testing different strategies",
                                "Implement hybrid routing approaches",
                                "Adjust strategy weights based on query types"
                            ]
                        ))
        
        return recommendations

    async def get_performance_dashboard(self) -> Dict[str, Any]:
        """Get comprehensive performance dashboard data"""
        
        # Get latest metrics
        latest_metrics = self.routing_metrics_history[-1] if self.routing_metrics_history else None
        latest_instance_metrics = list(self.instance_metrics_cache.values())
        
        # Calculate trends
        trends = {}
        if len(self.routing_metrics_history) >= 2:
            current = self.routing_metrics_history[-1]
            previous = self.routing_metrics_history[-2]
            trends = self._calculate_performance_changes(current, previous)
        
        # Get top performers
        top_instances = sorted(
            latest_instance_metrics,
            key=lambda x: (x.success_rate, -x.average_response_time),
            reverse=True
        )[:5]
        
        # Get cost efficiency leaders
        cost_efficient = sorted(
            latest_instance_metrics,
            key=lambda x: x.cost_efficiency_score,
            reverse=True
        )[:5]
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "summary": {
                "total_requests": latest_metrics.total_requests if latest_metrics else 0,
                "success_rate": (latest_metrics.successful_requests / max(latest_metrics.total_requests, 1)) * 100 if latest_metrics else 0,
                "average_response_time": latest_metrics.average_response_time if latest_metrics else 0,
                "average_cost_per_request": latest_metrics.average_cost_per_request if latest_metrics else 0,
                "active_instances": len(latest_instance_metrics),
                "active_alerts": len(self.active_alerts)
            },
            "trends": trends,
            "top_performing_instances": [
                {
                    "instance_id": inst.instance_id,
                    "provider_type": inst.provider_type,
                    "model_name": inst.model_name,
                    "success_rate": inst.success_rate,
                    "average_response_time": inst.average_response_time,
                    "utilization_percentage": inst.utilization_percentage
                }
                for inst in top_instances
            ],
            "most_cost_efficient": [
                {
                    "instance_id": inst.instance_id,
                    "provider_type": inst.provider_type,
                    "model_name": inst.model_name,
                    "cost_efficiency_score": inst.cost_efficiency_score,
                    "average_cost_per_request": inst.average_cost_per_request,
                    "success_rate": inst.success_rate
                }
                for inst in cost_efficient
            ],
            "active_alerts": [
                {
                    "alert_id": alert.alert_id,
                    "severity": alert.severity,
                    "title": alert.title,
                    "description": alert.description,
                    "current_value": alert.current_value,
                    "threshold_value": alert.threshold_value,
                    "timestamp": alert.timestamp.isoformat(),
                    "instance_id": alert.instance_id
                }
                for alert in self.active_alerts.values()
            ],
            "query_type_distribution": latest_metrics.query_type_distribution if latest_metrics else {},
            "provider_distribution": latest_metrics.provider_distribution if latest_metrics else {},
            "strategy_distribution": latest_metrics.strategy_distribution if latest_metrics else {}
        }

    async def get_optimization_recommendations(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent optimization recommendations"""
        
        all_recommendations = []
        
        # Get recommendations from history
        for record in self.optimization_history[-10:]:  # Last 10 optimization runs
            for rec in record["recommendations"]:
                rec["generated_at"] = record["timestamp"]
                all_recommendations.append(rec)
        
        # Sort by priority and date
        priority_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        
        all_recommendations.sort(
            key=lambda x: (priority_order.get(x["priority"], 0), x["generated_at"]),
            reverse=True
        )
        
        return all_recommendations[:limit]

    async def acknowledge_alert(self, alert_id: str, acknowledged_by: str = "system") -> bool:
        """Acknowledge a performance alert"""
        
        if alert_id in self.active_alerts:
            alert = self.active_alerts[alert_id]
            
            # Add acknowledgment info
            alert.metadata = alert.metadata or {}
            alert.metadata["acknowledged_by"] = acknowledged_by
            alert.metadata["acknowledged_at"] = datetime.utcnow().isoformat()
            
            # Store in Redis
            if self.redis_client:
                await self.redis_client.setex(
                    f"alert_acknowledged:{alert_id}",
                    timedelta(hours=24),
                    json.dumps({
                        "alert_id": alert_id,
                        "acknowledged_by": acknowledged_by,
                        "acknowledged_at": alert.metadata["acknowledged_at"]
                    })
                )
            
            logger.info(f"Alert {alert_id} acknowledged by {acknowledged_by}")
            return True
        
        return False

# Global performance monitor instance
router_performance_monitor = None

def get_router_performance_monitor(
    router: IntelligentQueryRouter,
    redis_client: redis.Redis = None
) -> RouterPerformanceMonitor:
    """Get or create global router performance monitor"""
    global router_performance_monitor
    if router_performance_monitor is None:
        router_performance_monitor = RouterPerformanceMonitor(router, redis_client)
    return router_performance_monitor