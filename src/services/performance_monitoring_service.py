"""
Performance Monitoring Service for collecting and analyzing AI instance metrics
"""
import asyncio
import logging
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import statistics

from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from ..models.instance_manager import (
    AIInstance, InstanceMetrics, HealthCheck, RequestLog,
    ScalingEvent, ProviderType
)
from ..database.database import get_db

logger = logging.getLogger(__name__)

class MetricType(Enum):
    """Types of metrics"""
    PERFORMANCE = "performance"
    HEALTH = "health"
    USAGE = "usage"
    COST = "cost"
    ERROR = "error"
    SCALING = "scaling"

class AggregationType(Enum):
    """Metric aggregation types"""
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    SUM = "sum"
    COUNT = "count"
    P50 = "p50"
    P95 = "p95"
    P99 = "p99"

@dataclass
class MetricDefinition:
    """Definition of a metric to be collected"""
    name: str
    metric_type: MetricType
    aggregation: AggregationType
    unit: str
    description: str
    source_table: str
    source_column: str
    filters: Dict[str, Any] = field(default_factory=dict)

@dataclass
class PerformanceReport:
    """Performance report for an instance or group"""
    instance_id: Optional[str]
    time_range: Dict[str, datetime]
    metrics: Dict[str, Any]
    trends: Dict[str, float]  # trend values (positive = improving)
    alerts: List[Dict[str, Any]]
    summary: str
    recommendations: List[str]

@dataclass
class MetricAlert:
    """Metric alert configuration"""
    metric_name: str
    threshold: float
    comparison: str  # gt, lt, eq, gte, lte
    severity: str  # info, warning, critical
    enabled: bool = True
    cooldown_minutes: int = 15

class PerformanceMonitoringService:
    """Service for monitoring and analyzing AI instance performance"""
    
    def __init__(self):
        self.metric_definitions = self._initialize_metric_definitions()
        self.alert_rules = {}
        self.monitoring_active = False
        self.monitoring_task = None
        
    def _initialize_metric_definitions(self) -> Dict[str, MetricDefinition]:
        """Initialize metric definitions"""
        
        return {
            # Performance metrics
            "response_time_avg": MetricDefinition(
                name="response_time_avg",
                metric_type=MetricType.PERFORMANCE,
                aggregation=AggregationType.AVG,
                unit="ms",
                description="Average response time",
                source_table="request_logs",
                source_column="response_time"
            ),
            "response_time_p95": MetricDefinition(
                name="response_time_p95",
                metric_type=MetricType.PERFORMANCE,
                aggregation=AggregationType.P95,
                unit="ms",
                description="95th percentile response time",
                source_table="request_logs",
                source_column="response_time"
            ),
            "success_rate": MetricDefinition(
                name="success_rate",
                metric_type=MetricType.PERFORMANCE,
                aggregation=AggregationType.AVG,
                unit="%",
                description="Request success rate",
                source_table="request_logs",
                source_column="status",
                filters={"status": "success"}
            ),
            
            # Usage metrics
            "requests_per_minute": MetricDefinition(
                name="requests_per_minute",
                metric_type=MetricType.USAGE,
                aggregation=AggregationType.COUNT,
                unit="req/min",
                description="Requests per minute",
                source_table="request_logs",
                source_column="id"
            ),
            "tokens_used": MetricDefinition(
                name="tokens_used",
                metric_type=MetricType.USAGE,
                aggregation=AggregationType.SUM,
                unit="tokens",
                description="Total tokens consumed",
                source_table="request_logs",
                source_column="tokens_used"
            ),
            
            # Health metrics
            "health_score": MetricDefinition(
                name="health_score",
                metric_type=MetricType.HEALTH,
                aggregation=AggregationType.AVG,
                unit="score",
                description="Instance health score",
                source_table="health_checks",
                source_column="check_score"
            ),
            "uptime_percentage": MetricDefinition(
                name="uptime_percentage",
                metric_type=MetricType.HEALTH,
                aggregation=AggregationType.AVG,
                unit="%",
                description="Instance uptime percentage",
                source_table="health_checks",
                source_column="status",
                filters={"status": "healthy"}
            ),
            
            # Error metrics
            "error_rate": MetricDefinition(
                name="error_rate",
                metric_type=MetricType.ERROR,
                aggregation=AggregationType.AVG,
                unit="%",
                description="Error rate",
                source_table="request_logs",
                source_column="status",
                filters={"status": "error"}
            ),
            
            # Cost metrics
            "cost_per_request": MetricDefinition(
                name="cost_per_request",
                metric_type=MetricType.COST,
                aggregation=AggregationType.AVG,
                unit="USD",
                description="Cost per request",
                source_table="request_logs",
                source_column="estimated_cost"
            ),
            "hourly_cost": MetricDefinition(
                name="hourly_cost",
                metric_type=MetricType.COST,
                aggregation=AggregationType.SUM,
                unit="USD/hour",
                description="Hourly cost",
                source_table="request_logs",
                source_column="estimated_cost"
            )
        }
    
    async def start_monitoring(self, db: Session, interval_seconds: int = 60):
        """Start continuous performance monitoring"""
        
        if self.monitoring_active:
            logger.warning("Performance monitoring is already active")
            return
        
        self.monitoring_active = True
        self.monitoring_task = asyncio.create_task(
            self._monitoring_loop(db, interval_seconds)
        )
        
        logger.info("Started performance monitoring")
    
    async def stop_monitoring(self):
        """Stop performance monitoring"""
        
        self.monitoring_active = False
        
        if self.monitoring_task and not self.monitoring_task.done():
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Stopped performance monitoring")
    
    async def _monitoring_loop(self, db: Session, interval_seconds: int):
        """Main monitoring loop"""
        
        while self.monitoring_active:
            try:
                # Collect metrics for all active instances
                await self._collect_all_metrics(db)
                
                # Check for alerts
                await self._check_metric_alerts(db)
                
                # Wait for next interval
                await asyncio.sleep(interval_seconds)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(10)  # Brief pause before retrying
    
    async def _collect_all_metrics(self, db: Session):
        """Collect metrics for all active instances"""
        
        # Get all active instances
        instances = db.query(AIInstance).filter(
            AIInstance.is_active == True
        ).all()
        
        for instance in instances:
            try:
                await self._collect_instance_metrics(db, instance)
            except Exception as e:
                logger.error(f"Failed to collect metrics for {instance.instance_id}: {e}")
    
    async def _collect_instance_metrics(self, db: Session, instance: AIInstance):
        """Collect metrics for a specific instance"""
        
        # Get time window for metrics collection (last 5 minutes)
        since_time = datetime.utcnow() - timedelta(minutes=5)
        
        # Collect all defined metrics
        collected_metrics = {}
        
        for metric_name, metric_def in self.metric_definitions.items():
            try:
                value = await self._calculate_metric(
                    db, instance.instance_id, metric_def, since_time
                )
                collected_metrics[metric_name] = value
            except Exception as e:
                logger.debug(f"Failed to calculate metric {metric_name} for {instance.instance_id}: {e}")
                collected_metrics[metric_name] = None
        
        # Store aggregated metrics
        if collected_metrics:
            await self._store_instance_metrics(db, instance.instance_id, collected_metrics)
    
    async def _calculate_metric(
        self,
        db: Session,
        instance_id: str,
        metric_def: MetricDefinition,
        since_time: datetime
    ) -> Optional[float]:
        """Calculate a specific metric value"""
        
        if metric_def.source_table == "request_logs":
            return await self._calculate_request_log_metric(
                db, instance_id, metric_def, since_time
            )
        elif metric_def.source_table == "health_checks":
            return await self._calculate_health_check_metric(
                db, instance_id, metric_def, since_time
            )
        else:
            logger.warning(f"Unknown source table: {metric_def.source_table}")
            return None
    
    async def _calculate_request_log_metric(
        self,
        db: Session,
        instance_id: str,
        metric_def: MetricDefinition,
        since_time: datetime
    ) -> Optional[float]:
        """Calculate metric from request logs"""
        
        # Get request logs for the instance
        query = db.query(RequestLog).filter(
            RequestLog.instance_id == instance_id,
            RequestLog.created_at >= since_time
        )
        
        # Apply additional filters
        for key, value in metric_def.filters.items():
            if hasattr(RequestLog, key):
                query = query.filter(getattr(RequestLog, key) == value)
        
        requests = query.all()
        
        if not requests:
            return 0.0 if metric_def.aggregation in [AggregationType.SUM, AggregationType.COUNT] else None
        
        # Extract values
        if metric_def.source_column == "response_time":
            values = [r.response_time for r in requests if r.response_time is not None]
        elif metric_def.source_column == "tokens_used":
            values = [r.tokens_used for r in requests if r.tokens_used is not None]
        elif metric_def.source_column == "estimated_cost":
            values = [float(r.metadata.get("estimated_cost", 0)) if r.metadata and r.metadata.get("estimated_cost") else 0.0 for r in requests]
        elif metric_def.source_column == "status":
            # Special handling for status-based metrics
            if metric_def.metric_type == MetricType.PERFORMANCE and "success" in metric_def.filters.get("status", ""):
                # Success rate
                total_requests = len(requests)
                successful_requests = len([r for r in requests if r.status == "success"])
                return (successful_requests / total_requests * 100) if total_requests > 0 else 0.0
            elif metric_def.metric_type == MetricType.ERROR and "error" in metric_def.filters.get("status", ""):
                # Error rate
                total_requests = len(requests)
                error_requests = len([r for r in requests if r.status == "error"])
                return (error_requests / total_requests * 100) if total_requests > 0 else 0.0
            else:
                return 0.0
        else:
            # Count or other simple aggregation
            values = [1] * len(requests)
        
        if not values:
            return 0.0 if metric_def.aggregation in [AggregationType.SUM, AggregationType.COUNT] else None
        
        # Apply aggregation
        if metric_def.aggregation == AggregationType.AVG:
            return statistics.mean(values)
        elif metric_def.aggregation == AggregationType.MIN:
            return min(values)
        elif metric_def.aggregation == AggregationType.MAX:
            return max(values)
        elif metric_def.aggregation == AggregationType.SUM:
            return sum(values)
        elif metric_def.aggregation == AggregationType.COUNT:
            return len(values)
        elif metric_def.aggregation in [AggregationType.P50, AggregationType.P95, AggregationType.P99]:
            if len(values) >= 2:
                sorted_values = sorted(values)
                n = len(sorted_values)
                
                if metric_def.aggregation == AggregationType.P50:
                    return sorted_values[n // 2]
                elif metric_def.aggregation == AggregationType.P95:
                    return sorted_values[int(n * 0.95)]
                elif metric_def.aggregation == AggregationType.P99:
                    return sorted_values[int(n * 0.99)]
            else:
                return values[0] if values else None
        
        return None
    
    async def _calculate_health_check_metric(
        self,
        db: Session,
        instance_id: str,
        metric_def: MetricDefinition,
        since_time: datetime
    ) -> Optional[float]:
        """Calculate metric from health checks"""
        
        # Get health checks for the instance
        query = db.query(HealthCheck).filter(
            HealthCheck.instance_id == instance_id,
            HealthCheck.created_at >= since_time
        )
        
        # Apply additional filters
        for key, value in metric_def.filters.items():
            if hasattr(HealthCheck, key):
                query = query.filter(getattr(HealthCheck, key) == value)
        
        health_checks = query.all()
        
        if not health_checks:
            return 0.0 if metric_def.aggregation == AggregationType.COUNT else None
        
        # Extract values
        if metric_def.source_column == "check_score":
            values = [hc.check_score for hc in health_checks if hc.check_score is not None]
        elif metric_def.source_column == "response_time":
            values = [hc.response_time for hc in health_checks if hc.response_time is not None]
        elif metric_def.source_column == "status":
            # Special handling for status-based metrics
            if metric_def.metric_type == MetricType.HEALTH and "healthy" in metric_def.filters.get("status", ""):
                # Uptime percentage
                total_checks = len(health_checks)
                healthy_checks = len([hc for hc in health_checks if hc.status == "healthy"])
                return (healthy_checks / total_checks * 100) if total_checks > 0 else 0.0
            else:
                return 0.0
        else:
            values = [1] * len(health_checks)
        
        if not values:
            return 0.0 if metric_def.aggregation == AggregationType.COUNT else None
        
        # Apply aggregation
        if metric_def.aggregation == AggregationType.AVG:
            return statistics.mean(values)
        elif metric_def.aggregation == AggregationType.SUM:
            return sum(values)
        elif metric_def.aggregation == AggregationType.COUNT:
            return len(values)
        
        return None
    
    async def _store_instance_metrics(
        self,
        db: Session,
        instance_id: str,
        metrics: Dict[str, float]
    ):
        """Store collected metrics in database"""
        
        # Create instance metrics record
        instance_metrics = InstanceMetrics(
            instance_id=instance_id,
            total_requests=metrics.get("requests_per_minute", 0) * 5,  # Convert to 5-minute window
            successful_requests=metrics.get("success_rate", 0) * metrics.get("requests_per_minute", 0) * 5 / 100,
            failed_requests=metrics.get("error_rate", 0) * metrics.get("requests_per_minute", 0) * 5 / 100,
            average_response_time=metrics.get("response_time_avg", 0.0),
            min_response_time=metrics.get("response_time_min"),
            max_response_time=metrics.get("response_time_max"),
            p95_response_time=metrics.get("response_time_p95", 0.0),
            tokens_used=metrics.get("tokens_used", 0),
            error_rate=metrics.get("error_rate", 0.0),
            time_window=300,  # 5 minutes
            timestamp=datetime.utcnow()
        )
        
        db.add(instance_metrics)
        db.commit()
    
    async def _check_metric_alerts(self, db: Session):
        """Check for metric alerts"""
        
        # Get all active instances
        instances = db.query(AIInstance).filter(
            AIInstance.is_active == True
        ).all()
        
        for instance in instances:
            alerts = await self._check_instance_alerts(db, instance)
            if alerts:
                await self._handle_alerts(instance, alerts)
    
    async def _check_instance_alerts(
        self,
        db: Session,
        instance: AIInstance
    ) -> List[Dict[str, Any]]:
        """Check alerts for a specific instance"""
        
        alerts = []
        
        # Get recent metrics (last hour)
        since_time = datetime.utcnow() - timedelta(hours=1)
        recent_metrics = db.query(InstanceMetrics).filter(
            InstanceMetrics.instance_id == instance.instance_id,
            InstanceMetrics.timestamp >= since_time
        ).all()
        
        if not recent_metrics:
            return alerts
        
        # Check common alert conditions
        latest_metrics = recent_metrics[-1]
        
        # High response time alert
        if latest_metrics.average_response_time and latest_metrics.average_response_time > 5000:
            alerts.append({
                "type": "high_response_time",
                "severity": "warning",
                "value": latest_metrics.average_response_time,
                "threshold": 5000,
                "message": f"High average response time: {latest_metrics.average_response_time:.0f}ms"
            })
        
        # High error rate alert
        if latest_metrics.error_rate and latest_metrics.error_rate > 10:
            alerts.append({
                "type": "high_error_rate",
                "severity": "critical",
                "value": latest_metrics.error_rate,
                "threshold": 10,
                "message": f"High error rate: {latest_metrics.error_rate:.1f}%"
            })
        
        # Low success rate alert
        if latest_metrics.successful_requests and latest_metrics.total_requests:
            success_rate = (latest_metrics.successful_requests / latest_metrics.total_requests) * 100
            if success_rate < 90:
                alerts.append({
                    "type": "low_success_rate",
                    "severity": "warning",
                    "value": success_rate,
                    "threshold": 90,
                    "message": f"Low success rate: {success_rate:.1f}%"
                })
        
        return alerts
    
    async def _handle_alerts(self, instance: AIInstance, alerts: List[Dict[str, Any]]):
        """Handle generated alerts"""
        
        for alert in alerts:
            logger.warning(f"Alert for {instance.instance_id}: {alert['message']}")
            
            # In a real implementation, you would:
            # - Send notifications (email, Slack, etc.)
            # - Create alert records in database
            # - Trigger automated responses
            # - Update monitoring dashboards
            
            # For now, we'll just log the alert
            pass
    
    async def generate_performance_report(
        self,
        db: Session,
        instance_id: Optional[str] = None,
        provider_type: Optional[str] = None,
        time_range_hours: int = 24
    ) -> PerformanceReport:
        """Generate comprehensive performance report"""
        
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=time_range_hours)
        
        # Get instances to include in report
        if instance_id:
            instances = [await self._get_instance_by_id(db, instance_id)]
        else:
            query = db.query(AIInstance).filter(AIInstance.is_active == True)
            if provider_type:
                query = query.filter(AIInstance.provider_type == provider_type)
            instances = query.all()
        
        # Collect metrics for all instances
        all_metrics = {}
        for instance in instances:
            if instance:
                metrics = await self._collect_instance_metrics_range(
                    db, instance.instance_id, start_time, end_time
                )
                all_metrics[instance.instance_id] = metrics
        
        # Calculate trends (comparing to previous period)
        trends = await self._calculate_trends(
            db, instances, start_time, end_time, time_range_hours
        )
        
        # Generate alerts
        alerts = []
        for instance in instances:
            if instance:
                instance_alerts = await self._check_instance_alerts(db, instance)
                for alert in instance_alerts:
                    alert["instance_id"] = instance.instance_id
                alerts.extend(instance_alerts)
        
        # Generate summary and recommendations
        summary, recommendations = self._generate_summary_and_recommendations(
            all_metrics, trends, alerts
        )
        
        return PerformanceReport(
            instance_id=instance_id,
            time_range={"start": start_time, "end": end_time},
            metrics=all_metrics,
            trends=trends,
            alerts=alerts,
            summary=summary,
            recommendations=recommendations
        )
    
    async def _get_instance_by_id(self, db: Session, instance_id: str) -> Optional[AIInstance]:
        """Get instance by ID"""
        return db.query(AIInstance).filter(
            AIInstance.instance_id == instance_id
        ).first()
    
    async def _collect_instance_metrics_range(
        self,
        db: Session,
        instance_id: str,
        start_time: datetime,
        end_time: datetime
    ) -> Dict[str, float]:
        """Collect metrics for an instance over a time range"""
        
        metrics = {}
        
        for metric_name, metric_def in self.metric_definitions.items():
            try:
                value = await self._calculate_metric(
                    db, instance_id, metric_def, start_time
                )
                metrics[metric_name] = value
            except Exception as e:
                logger.debug(f"Failed to calculate metric {metric_name} for {instance_id}: {e}")
                metrics[metric_name] = None
        
        return metrics
    
    async def _calculate_trends(
        self,
        db: Session,
        instances: List[AIInstance],
        current_start: datetime,
        current_end: datetime,
        time_range_hours: int
    ) -> Dict[str, float]:
        """Calculate metric trends compared to previous period"""
        
        # Calculate previous period
        previous_start = current_start - timedelta(hours=time_range_hours)
        previous_end = current_start
        
        trends = {}
        
        for instance in instances:
            if not instance:
                continue
            
            # Get current and previous metrics
            current_metrics = await self._collect_instance_metrics_range(
                db, instance.instance_id, current_start, current_end
            )
            previous_metrics = await self._collect_instance_metrics_range(
                db, instance.instance_id, previous_start, previous_end
            )
            
            # Calculate trend for each metric
            for metric_name in self.metric_definitions.keys():
                current_value = current_metrics.get(metric_name)
                previous_value = previous_metrics.get(metric_name)
                
                if current_value is not None and previous_value is not None and previous_value != 0:
                    trend = ((current_value - previous_value) / previous_value) * 100
                    trends[f"{instance.instance_id}_{metric_name}"] = trend
        
        return trends
    
    def _generate_summary_and_recommendations(
        self,
        metrics: Dict[str, Dict[str, float]],
        trends: Dict[str, float],
        alerts: List[Dict[str, Any]]
    ) -> Tuple[str, List[str]]:
        """Generate summary and recommendations from metrics"""
        
        # Calculate overall health score
        total_instances = len(metrics)
        if total_instances == 0:
            return "No instances found", []
        
        # Calculate averages across all instances
        avg_response_time = 0
        avg_success_rate = 0
        avg_error_rate = 0
        instance_count = 0
        
        for instance_metrics in metrics.values():
            if instance_metrics.get("response_time_avg"):
                avg_response_time += instance_metrics["response_time_avg"]
            if instance_metrics.get("success_rate"):
                avg_success_rate += instance_metrics["success_rate"]
            if instance_metrics.get("error_rate"):
                avg_error_rate += instance_metrics["error_rate"]
            instance_count += 1
        
        if instance_count > 0:
            avg_response_time /= instance_count
            avg_success_rate /= instance_count
            avg_error_rate /= instance_count
        
        # Generate summary
        if avg_success_rate >= 95 and avg_response_time < 1000:
            summary = f"Excellent performance across {total_instances} instances. " \
                     f"Average success rate: {avg_success_rate:.1f}%, " \
                     f"Average response time: {avg_response_time:.0f}ms"
        elif avg_success_rate >= 90 and avg_response_time < 3000:
            summary = f"Good performance across {total_instances} instances. " \
                     f"Average success rate: {avg_success_rate:.1f}%, " \
                     f"Average response time: {avg_response_time:.0f}ms"
        else:
            summary = f"Performance issues detected across {total_instances} instances. " \
                     f"Average success rate: {avg_success_rate:.1f}%, " \
                     f"Average response time: {avg_response_time:.0f}ms"
        
        # Generate recommendations
        recommendations = []
        
        if avg_response_time > 5000:
            recommendations.append("Consider scaling up instances or optimizing models to reduce response time")
        
        if avg_success_rate < 90:
            recommendations.append("Investigate causes of failures and improve error handling")
        
        if avg_error_rate > 5:
            recommendations.append("Review error logs and address common failure patterns")
        
        # Check for specific trends
        declining_metrics = [k for k, v in trends.items() if v < -10]
        if declining_metrics:
            recommendations.append("Some metrics are declining - investigate performance degradation")
        
        # Alert-based recommendations
        critical_alerts = [a for a in alerts if a.get("severity") == "critical"]
        if critical_alerts:
            recommendations.append("Address critical alerts immediately to ensure service stability")
        
        return summary, recommendations
    
    async def get_real_time_metrics(
        self,
        db: Session,
        instance_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get real-time metrics for instances"""
        
        # Get recent metrics (last 5 minutes)
        since_time = datetime.utcnow() - timedelta(minutes=5)
        
        if instance_id:
            # Get metrics for specific instance
            instance = await self._get_instance_by_id(db, instance_id)
            if not instance:
                return {}
            
            metrics = await self._collect_instance_metrics_range(
                db, instance_id, since_time, datetime.utcnow()
            )
            
            return {
                "instance_id": instance_id,
                "timestamp": datetime.utcnow().isoformat(),
                "metrics": metrics,
                "status": "healthy" if instance.is_healthy else "unhealthy"
            }
        else:
            # Get metrics for all instances
            instances = db.query(AIInstance).filter(
                AIInstance.is_active == True
            ).all()
            
            all_metrics = {}
            for instance in instances:
                instance_metrics = await self._collect_instance_metrics_range(
                    db, instance.instance_id, since_time, datetime.utcnow()
                )
                all_metrics[instance.instance_id] = {
                    "metrics": instance_metrics,
                    "status": "healthy" if instance.is_healthy else "unhealthy",
                    "provider_type": instance.provider_type,
                    "model_name": instance.model_name
                }
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "instances": all_metrics,
                "total_instances": len(instances),
                "healthy_instances": len([i for i in instances if i.is_healthy])
            }