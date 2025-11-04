"""
Data management for CLI Dashboard
Handles data collection, storage, and historical tracking
"""
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Deque
from collections import deque, defaultdict
from dataclasses import dataclass, asdict

from .config import DashboardConfig
from .api_client import InstanceInfo, HealthInfo, MetricsInfo

@dataclass
class DashboardData:
    """Complete dashboard data snapshot"""
    instances: List[InstanceInfo]
    health_summary: Dict[str, Any]
    load_balancer_metrics: Dict[str, Any]
    auto_scaling_metrics: Dict[str, Any]
    external_agents: Dict[str, Any]
    system_status: Optional[Dict[str, Any]]
    alerts: List[Dict[str, Any]]
    performance_metrics: Dict[str, Any]
    timestamp: datetime

@dataclass
class HistoricalDataPoint:
    """Single historical data point"""
    timestamp: datetime
    total_instances: int
    healthy_instances: int
    unhealthy_instances: int
    average_response_time: float
    total_requests: int
    success_rate: float
    error_rate: float

class DashboardDataManager:
    """Manages dashboard data collection and historical tracking"""

    def __init__(self, config: DashboardConfig):
        self.config = config
        self._lock = threading.RLock()

        # Current data
        self._instances: List[InstanceInfo] = []
        self._instance_metrics: Dict[str, MetricsInfo] = {}
        self._health_summary: Dict[str, Any] = {}
        self._load_balancer_metrics: Dict[str, Any] = {}
        self._auto_scaling_metrics: Dict[str, Any] = {}
        self._external_agents: Dict[str, Any] = {}
        self._system_status: Optional[Dict[str, Any]] = None

        # Historical data
        self._historical_data: Deque[HistoricalDataPoint] = deque(
            maxlen=config.max_history_points
        )

        # Alerts
        self._alerts: List[Dict[str, Any]] = []
        self._alert_history: Deque[Dict[str, Any]] = deque(
            maxlen=config.max_history_points * 2
        )

        # Performance metrics
        self._performance_metrics: Dict[str, Any] = {}

        # Provider-specific data
        self._provider_stats: Dict[str, Dict[str, Any]] = defaultdict(dict)

        # Last update timestamp
        self._last_update: Optional[datetime] = None

    def update_instances(self, instances: List[InstanceInfo]):
        """Update instances data"""
        with self._lock:
            self._instances = instances
            self._update_provider_stats()
            self._generate_alerts()

    def update_instance_metrics(self, metrics: MetricsInfo):
        """Update metrics for specific instance"""
        with self._lock:
            self._instance_metrics[metrics.instance_id] = metrics

    def update_health_summary(self, health_summary: Dict[str, Any]):
        """Update health summary"""
        with self._lock:
            self._health_summary = health_summary
            self._generate_health_alerts()

    def update_load_balancer_metrics(self, metrics: Dict[str, Any]):
        """Update load balancer metrics"""
        with self._lock:
            self._load_balancer_metrics = metrics

    def update_auto_scaling_metrics(self, metrics: Dict[str, Any]):
        """Update auto-scaling metrics"""
        with self._lock:
            self._auto_scaling_metrics = metrics

    def update_external_agents(self, agents: Dict[str, Any]):
        """Update external agents data"""
        with self._lock:
            self._external_agents = agents

    def update_system_status(self, status: Dict[str, Any]):
        """Update system status"""
        with self._lock:
            self._system_status = status

    def get_data(self) -> DashboardData:
        """Get complete dashboard data snapshot"""
        with self._lock:
            return DashboardData(
                instances=self._instances.copy(),
                health_summary=self._health_summary.copy(),
                load_balancer_metrics=self._load_balancer_metrics.copy(),
                auto_scaling_metrics=self._auto_scaling_metrics.copy(),
                external_agents=self._external_agents.copy(),
                system_status=self._system_status.copy() if self._system_status else None,
                alerts=self._alerts.copy(),
                performance_metrics=self._performance_metrics.copy(),
                timestamp=datetime.utcnow()
            )

    def get_historical_data(self, minutes: int = 60) -> List[HistoricalDataPoint]:
        """Get historical data for specified time period"""
        with self._lock:
            cutoff_time = datetime.utcnow() - timedelta(minutes=minutes)
            return [
                point for point in self._historical_data
                if point.timestamp >= cutoff_time
            ]

    def get_provider_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get provider-specific statistics"""
        with self._lock:
            return dict(self._provider_stats)

    def get_alerts(self, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get alerts, optionally filtered by severity"""
        with self._lock:
            alerts = self._alerts.copy()
            if severity:
                alerts = [a for a in alerts if a.get('severity') == severity]
            return alerts

    def add_alert(self, alert: Dict[str, Any]):
        """Add a new alert"""
        with self._lock:
            alert['timestamp'] = datetime.utcnow()
            alert['id'] = len(self._alert_history) + 1

            self._alerts.append(alert)
            self._alert_history.append(alert.copy())

            # Limit active alerts
            if len(self._alerts) > 20:
                self._alerts = self._alerts[-20:]

    def clear_alerts(self):
        """Clear all active alerts"""
        with self._lock:
            self._alerts.clear()

    def _update_provider_stats(self):
        """Update provider-specific statistics"""
        provider_stats = defaultdict(lambda: {
            'total_instances': 0,
            'healthy_instances': 0,
            'unhealthy_instances': 0,
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'average_response_time': 0.0,
            'average_success_rate': 0.0,
            'current_load': 0,
            'max_concurrent_requests': 0,
            'models': set()
        })

        for instance in self._instances:
            provider = instance.provider_type
            stats = provider_stats[provider]

            stats['total_instances'] += 1
            if instance.is_healthy:
                stats['healthy_instances'] += 1
            else:
                stats['unhealthy_instances'] += 1

            stats['total_requests'] += instance.total_requests
            stats['successful_requests'] += instance.successful_requests
            stats['failed_requests'] += instance.failed_requests
            stats['current_load'] += instance.current_load
            stats['max_concurrent_requests'] += instance.max_concurrent_requests
            stats['models'].add(instance.model_name)

        # Calculate averages
        for provider, stats in provider_stats.items():
            total_instances = stats['total_instances']
            if total_instances > 0:
                stats['average_success_rate'] = (
                    stats['successful_requests'] / stats['total_requests'] * 100
                    if stats['total_requests'] > 0 else 0
                )
                stats['health_rate'] = (
                    stats['healthy_instances'] / total_instances * 100
                )

            # Convert sets to lists for JSON serialization
            stats['models'] = list(stats['models'])

        self._provider_stats = dict(provider_stats)

    def _generate_alerts(self):
        """Generate alerts based on current data"""
        new_alerts = []

        for instance in self._instances:
            # High response time alert
            if instance.average_response_time > self.config.alert_high_response_time:
                new_alerts.append({
                    'type': 'performance',
                    'severity': 'warning',
                    'title': 'High Response Time',
                    'message': f"Instance {instance.instance_name} has high response time: {instance.average_response_time:.2f}s",
                    'instance_id': instance.instance_id,
                    'provider': instance.provider_type,
                    'metric': 'response_time',
                    'value': instance.average_response_time,
                    'threshold': self.config.alert_high_response_time
                })

            # Low success rate alert
            if instance.success_rate < self.config.alert_low_success_rate:
                new_alerts.append({
                    'type': 'reliability',
                    'severity': 'error',
                    'title': 'Low Success Rate',
                    'message': f"Instance {instance.instance_name} has low success rate: {instance.success_rate:.1f}%",
                    'instance_id': instance.instance_id,
                    'provider': instance.provider_type,
                    'metric': 'success_rate',
                    'value': instance.success_rate,
                    'threshold': self.config.alert_low_success_rate
                })

            # High load alert
            load_percentage = (instance.current_load / instance.max_concurrent_requests * 100) if instance.max_concurrent_requests > 0 else 0
            if load_percentage > self.config.alert_high_load_threshold:
                new_alerts.append({
                    'type': 'capacity',
                    'severity': 'warning',
                    'title': 'High Load',
                    'message': f"Instance {instance.instance_name} is at {load_percentage:.1f}% capacity",
                    'instance_id': instance.instance_id,
                    'provider': instance.provider_type,
                    'metric': 'load',
                    'value': load_percentage,
                    'threshold': self.config.alert_high_load_threshold
                })

            # Unhealthy instance alert
            if not instance.is_healthy and instance.is_active:
                new_alerts.append({
                    'type': 'health',
                    'severity': 'error',
                    'title': 'Instance Unhealthy',
                    'message': f"Instance {instance.instance_name} is unhealthy",
                    'instance_id': instance.instance_id,
                    'provider': instance.provider_type,
                    'metric': 'health',
                    'value': False,
                    'threshold': True
                })

        # Add new alerts that don't already exist
        existing_alert_keys = {
            (a['instance_id'], a['metric'], a['type']) for a in self._alerts
        }

        for alert in new_alerts:
            alert_key = (alert['instance_id'], alert['metric'], alert['type'])
            if alert_key not in existing_alert_keys:
                self.add_alert(alert)

    def _generate_health_alerts(self):
        """Generate alerts based on health summary"""
        if not self._health_summary:
            return

        # Overall system health alerts
        total_instances = self._health_summary.get('total_instances', 0)
        healthy_instances = self._health_summary.get('healthy_instances', 0)

        if total_instances > 0:
            health_percentage = (healthy_instances / total_instances) * 100
            if health_percentage < 70:
                self.add_alert({
                    'type': 'system',
                    'severity': 'error',
                    'title': 'Low System Health',
                    'message': f"Only {health_percentage:.1f}% of instances are healthy",
                    'metric': 'system_health',
                    'value': health_percentage,
                    'threshold': 70
                })
            elif health_percentage < 90:
                self.add_alert({
                    'type': 'system',
                    'severity': 'warning',
                    'title': 'System Health Degraded',
                    'message': f"Only {health_percentage:.1f}% of instances are healthy",
                    'metric': 'system_health',
                    'value': health_percentage,
                    'threshold': 90
                })

    def update_historical_data(self):
        """Update historical data point"""
        with self._lock:
            if not self._instances:
                return

            # Calculate aggregate metrics
            total_instances = len(self._instances)
            healthy_instances = sum(1 for i in self._instances if i.is_healthy)
            unhealthy_instances = total_instances - healthy_instances

            # Calculate averages
            total_requests = sum(i.total_requests for i in self._instances)
            successful_requests = sum(i.successful_requests for i in self._instances)
            failed_requests = sum(i.failed_requests for i in self._instances)

            average_response_time = (
                sum(i.average_response_time for i in self._instances) / total_instances
                if total_instances > 0 else 0
            )

            success_rate = (
                (successful_requests / total_requests * 100)
                if total_requests > 0 else 0
            )

            error_rate = (
                (failed_requests / total_requests * 100)
                if total_requests > 0 else 0
            )

            # Create historical data point
            data_point = HistoricalDataPoint(
                timestamp=datetime.utcnow(),
                total_instances=total_instances,
                healthy_instances=healthy_instances,
                unhealthy_instances=unhealthy_instances,
                average_response_time=average_response_time,
                total_requests=total_requests,
                success_rate=success_rate,
                error_rate=error_rate
            )

            self._historical_data.append(data_point)
            self._last_update = datetime.utcnow()

    def cleanup_old_data(self):
        """Clean up old data based on retention settings"""
        with self._lock:
            cutoff_time = datetime.utcnow() - timedelta(
                minutes=self.config.history_retention_minutes
            )

            # Clean historical data
            self._historical_data = deque(
                (point for point in self._historical_data if point.timestamp >= cutoff_time),
                maxlen=self.config.max_history_points
            )

            # Clean alert history
            self._alert_history = deque(
                (alert for alert in self._alert_history
                 if alert['timestamp'] >= cutoff_time),
                maxlen=self.config.max_history_points * 2
            )

    def get_instance_by_id(self, instance_id: str) -> Optional[InstanceInfo]:
        """Get instance by ID"""
        with self._lock:
            for instance in self._instances:
                if instance.instance_id == instance_id:
                    return instance
            return None

    def get_instances_by_provider(self, provider: str) -> List[InstanceInfo]:
        """Get instances by provider type"""
        with self._lock:
            return [i for i in self._instances if i.provider_type == provider]

    def get_top_performers(self, metric: str, limit: int = 5) -> List[InstanceInfo]:
        """Get top performing instances by metric"""
        with self._lock:
            if not self._instances:
                return []

            if metric == 'success_rate':
                return sorted(self._instances, key=lambda x: x.success_rate, reverse=True)[:limit]
            elif metric == 'response_time':
                return sorted(self._instances, key=lambda x: x.average_response_time)[:limit]
            elif metric == 'total_requests':
                return sorted(self._instances, key=lambda x: x.total_requests, reverse=True)[:limit]
            else:
                return self._instances[:limit]

    def get_summary_stats(self) -> Dict[str, Any]:
        """Get summary statistics"""
        with self._lock:
            if not self._instances:
                return {}

            total_instances = len(self._instances)
            healthy_instances = sum(1 for i in self._instances if i.is_healthy)
            active_instances = sum(1 for i in self._instances if i.is_active)

            total_requests = sum(i.total_requests for i in self._instances)
            successful_requests = sum(i.successful_requests for i in self._instances)
            failed_requests = sum(i.failed_requests for i in self._instances)

            return {
                'total_instances': total_instances,
                'healthy_instances': healthy_instances,
                'unhealthy_instances': total_instances - healthy_instances,
                'active_instances': active_instances,
                'inactive_instances': total_instances - active_instances,
                'total_requests': total_requests,
                'successful_requests': successful_requests,
                'failed_requests': failed_requests,
                'overall_success_rate': (successful_requests / total_requests * 100) if total_requests > 0 else 0,
                'overall_health_rate': (healthy_instances / total_instances * 100) if total_instances > 0 else 0,
                'provider_count': len(set(i.provider_type for i in self._instances)),
                'model_count': len(set((i.provider_type, i.model_name) for i in self._instances)),
                'active_alerts': len(self._alerts),
                'last_update': self._last_update.isoformat() if self._last_update else None
            }