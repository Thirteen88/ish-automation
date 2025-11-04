"""
Advanced Performance Monitoring and Metrics Service for ISH Chat Backend
Provides real-time monitoring, alerting, and performance optimization recommendations
"""
import asyncio
import logging
import time
import json
import psutil
import threading
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List, Callable, Union
from dataclasses import dataclass, field, asdict
from collections import defaultdict, deque
from functools import wraps
from contextlib import asynccontextmanager
import statistics
import numpy as np
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, generate_latest
import structlog
from concurrent.futures import ThreadPoolExecutor
import aiofiles
import gzip

logger = logging.getLogger(__name__)

@dataclass
class PerformanceMetrics:
    """Performance metrics data structure"""
    timestamp: float
    response_time: float
    status_code: int
    endpoint: str
    method: str
    user_id: Optional[str] = None
    error: Optional[str] = None
    memory_usage: float = 0.0
    cpu_usage: float = 0.0

@dataclass
class AlertConfig:
    """Alert configuration"""
    metric_name: str
    threshold: float
    comparison: str  # 'gt', 'lt', 'eq', 'gte', 'lte'
    severity: str  # 'low', 'medium', 'high', 'critical'
    cooldown_period: int = 300  # seconds
    enabled: bool = True

@dataclass
class PerformanceThresholds:
    """Performance threshold configurations"""
    response_time_p50_threshold: float = 100.0   # ms
    response_time_p95_threshold: float = 500.0   # ms
    response_time_p99_threshold: float = 1000.0  # ms
    error_rate_threshold: float = 1.0            # percentage
    memory_usage_threshold: float = 80.0         # percentage
    cpu_usage_threshold: float = 70.0            # percentage
    disk_usage_threshold: float = 85.0           # percentage
    connection_pool_threshold: float = 90.0      # percentage

class MetricsCollector:
    """High-performance metrics collector"""

    def __init__(self, max_samples: int = 10000):
        self.max_samples = max_samples
        self.metrics = defaultdict(lambda: deque(maxlen=max_samples))
        self.counters = defaultdict(int)
        self.gauges = defaultdict(float)
        self.histograms = defaultdict(lambda: deque(maxlen=1000))
        self.lock = threading.RLock()

    def record_metric(self, name: str, value: float, tags: Dict[str, str] = None) -> None:
        """Record a metric value"""
        with self.lock:
            key = f"{name}:{json.dumps(tags or {}, sort_keys=True)}"
            self.metrics[key].append({
                'timestamp': time.time(),
                'value': value,
                'tags': tags or {}
            })

    def increment_counter(self, name: str, value: int = 1, tags: Dict[str, str] = None) -> None:
        """Increment a counter"""
        with self.lock:
            key = f"{name}:{json.dumps(tags or {}, sort_keys=True)}"
            self.counters[key] += value

    def set_gauge(self, name: str, value: float, tags: Dict[str, str] = None) -> None:
        """Set a gauge value"""
        with self.lock:
            key = f"{name}:{json.dumps(tags or {}, sort_keys=True)}"
            self.gauges[key] = value

    def record_histogram(self, name: str, value: float, tags: Dict[str, str] = None) -> None:
        """Record a histogram value"""
        with self.lock:
            key = f"{name}:{json.dumps(tags or {}, sort_keys=True)}"
            self.histograms[key].append({
                'timestamp': time.time(),
                'value': value,
                'tags': tags or {}
            })

    def get_metrics_summary(self, name: str, tags: Dict[str, str] = None, duration: int = 3600) -> Dict[str, Any]:
        """Get metrics summary for the specified duration"""
        with self.lock:
            key = f"{name}:{json.dumps(tags or {}, sort_keys=True)}"
            values = self.metrics.get(key, deque())

            # Filter by duration
            cutoff_time = time.time() - duration
            recent_values = [m['value'] for m in values if m['timestamp'] >= cutoff_time]

            if not recent_values:
                return {}

            return {
                'count': len(recent_values),
                'min': min(recent_values),
                'max': max(recent_values),
                'avg': statistics.mean(recent_values),
                'median': statistics.median(recent_values),
                'p50': np.percentile(recent_values, 50),
                'p95': np.percentile(recent_values, 95),
                'p99': np.percentile(recent_values, 99),
                'std': statistics.stdev(recent_values) if len(recent_values) > 1 else 0
            }

    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all current metrics"""
        with self.lock:
            return {
                'counters': dict(self.counters),
                'gauges': dict(self.gauges),
                'metrics_count': {k: len(v) for k, v in self.metrics.items()},
                'histograms_count': {k: len(v) for k, v in self.histograms.items()}
            }

class AlertManager:
    """Alert management system"""

    def __init__(self):
        self.alert_configs = {}
        self.active_alerts = {}
        self.alert_history = deque(maxlen=1000)
        self.alert_callbacks = []
        self.lock = threading.RLock()

    def add_alert_config(self, config: AlertConfig) -> None:
        """Add alert configuration"""
        with self.lock:
            self.alert_configs[config.metric_name] = config

    def remove_alert_config(self, metric_name: str) -> None:
        """Remove alert configuration"""
        with self.lock:
            self.alert_configs.pop(metric_name, None)

    def check_alerts(self, current_metrics: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Check all alert conditions"""
        triggered_alerts = []

        with self.lock:
            for metric_name, config in self.alert_configs.items():
                if not config.enabled:
                    continue

                # Check cooldown
                if metric_name in self.active_alerts:
                    last_triggered = self.active_alerts[metric_name]['timestamp']
                    if time.time() - last_triggered < config.cooldown_period:
                        continue

                # Get current value
                current_value = current_metrics.get(metric_name)
                if current_value is None:
                    continue

                # Check threshold
                triggered = False
                if config.comparison == 'gt' and current_value > config.threshold:
                    triggered = True
                elif config.comparison == 'lt' and current_value < config.threshold:
                    triggered = True
                elif config.comparison == 'gte' and current_value >= config.threshold:
                    triggered = True
                elif config.comparison == 'lte' and current_value <= config.threshold:
                    triggered = True
                elif config.comparison == 'eq' and current_value == config.threshold:
                    triggered = True

                if triggered:
                    alert = {
                        'metric_name': metric_name,
                        'current_value': current_value,
                        'threshold': config.threshold,
                        'severity': config.severity,
                        'timestamp': time.time(),
                        'message': f"{metric_name} is {current_value} (threshold: {config.threshold})"
                    }

                    triggered_alerts.append(alert)
                    self.active_alerts[metric_name] = alert
                    self.alert_history.append(alert)

        # Trigger callbacks
        for alert in triggered_alerts:
            await self._trigger_alert_callbacks(alert)

        return triggered_alerts

    async def _trigger_alert_callbacks(self, alert: Dict[str, Any]) -> None:
        """Trigger alert callbacks"""
        for callback in self.alert_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(alert)
                else:
                    callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")

    def add_alert_callback(self, callback: Callable) -> None:
        """Add alert callback"""
        self.alert_callbacks.append(callback)

    def get_active_alerts(self) -> List[Dict[str, Any]]:
        """Get active alerts"""
        with self.lock:
            return list(self.active_alerts.values())

    def clear_alert(self, metric_name: str) -> None:
        """Clear active alert"""
        with self.lock:
            self.active_alerts.pop(metric_name, None)

class PerformanceProfiler:
    """Performance profiler for detailed analysis"""

    def __init__(self):
        self.profiles = defaultdict(list)
        self.active_profiling = {}
        self.lock = threading.RLock()

    @asynccontextmanager
    async def profile(self, name: str):
        """Context manager for profiling"""
        start_time = time.time()
        start_memory = psutil.Process().memory_info().rss

        try:
            yield
        finally:
            end_time = time.time()
            end_memory = psutil.Process().memory_info().rss

            profile_data = {
                'name': name,
                'duration': end_time - start_time,
                'memory_delta': end_memory - start_memory,
                'timestamp': end_time
            }

            with self.lock:
                self.profiles[name].append(profile_data)

    def get_profile_summary(self, name: str, limit: int = 100) -> Dict[str, Any]:
        """Get profile summary"""
        with self.lock:
            profiles = self.profiles.get(name, [])[-limit:]

            if not profiles:
                return {}

            durations = [p['duration'] for p in profiles]
            memory_deltas = [p['memory_delta'] for p in profiles]

            return {
                'name': name,
                'count': len(profiles),
                'avg_duration': statistics.mean(durations),
                'min_duration': min(durations),
                'max_duration': max(durations),
                'p95_duration': np.percentile(durations, 95),
                'avg_memory_delta': statistics.mean(memory_deltas),
                'total_duration': sum(durations),
                'recent_samples': profiles[-10:]  # Last 10 samples
            }

class AdvancedPerformanceService:
    """Main advanced performance monitoring service"""

    def __init__(self, config: PerformanceThresholds = None):
        self.config = config or PerformanceThresholds()
        self.metrics_collector = MetricsCollector()
        self.alert_manager = AlertManager()
        self.profiler = PerformanceProfiler()
        self.prometheus_registry = CollectorRegistry()

        # Prometheus metrics
        self.request_count = Counter(
            'http_requests_total',
            'Total HTTP requests',
            ['method', 'endpoint', 'status'],
            registry=self.prometheus_registry
        )

        self.request_duration = Histogram(
            'http_request_duration_seconds',
            'HTTP request duration',
            ['method', 'endpoint'],
            registry=self.prometheus_registry
        )

        self.active_connections = Gauge(
            'active_connections',
            'Active connections',
            ['type'],
            registry=self.prometheus_registry
        )

        self.memory_usage = Gauge(
            'memory_usage_bytes',
            'Memory usage in bytes',
            registry=self.prometheus_registry
        )

        self.cpu_usage = Gauge(
            'cpu_usage_percent',
            'CPU usage percentage',
            registry=self.prometheus_registry
        )

        self._monitoring_task = None
        self._system_monitor_task = None
        self._alert_check_task = None
        self._running = False

    async def start(self) -> None:
        """Start performance monitoring"""
        if self._running:
            return

        self._running = True

        # Start monitoring tasks
        self._monitoring_task = asyncio.create_task(self._monitoring_loop())
        self._system_monitor_task = asyncio.create_task(self._system_monitoring_loop())
        self._alert_check_task = asyncio.create_task(self._alert_check_loop())

        # Setup default alerts
        self._setup_default_alerts()

        logger.info("Advanced performance monitoring service started")

    async def stop(self) -> None:
        """Stop performance monitoring"""
        self._running = False

        # Cancel monitoring tasks
        if self._monitoring_task:
            self._monitoring_task.cancel()
        if self._system_monitor_task:
            self._system_monitor_task.cancel()
        if self._alert_check_task:
            self._alert_check_task.cancel()

        # Wait for tasks to complete
        tasks = [t for t in [self._monitoring_task, self._system_monitor_task, self._alert_check_task] if t]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        logger.info("Advanced performance monitoring service stopped")

    def _setup_default_alerts(self) -> None:
        """Setup default alert configurations"""
        default_alerts = [
            AlertConfig("response_time_p95", self.config.response_time_p95_threshold, "gt", "high"),
            AlertConfig("error_rate", self.config.error_rate_threshold, "gt", "medium"),
            AlertConfig("memory_usage", self.config.memory_usage_threshold, "gt", "critical"),
            AlertConfig("cpu_usage", self.config.cpu_usage_threshold, "gt", "high"),
            AlertConfig("disk_usage", self.config.disk_usage_threshold, "gt", "critical"),
        ]

        for alert_config in default_alerts:
            self.alert_manager.add_alert_config(alert_config)

    async def _monitoring_loop(self) -> None:
        """Main monitoring loop"""
        while self._running:
            try:
                await asyncio.sleep(60)  # Collect metrics every minute
                await self._collect_performance_metrics()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}")

    async def _system_monitoring_loop(self) -> None:
        """System resource monitoring loop"""
        while self._running:
            try:
                await asyncio.sleep(30)  # System metrics every 30 seconds

                # CPU and Memory
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk = psutil.disk_usage('/')

                # Record metrics
                self.metrics_collector.set_gauge("cpu_usage", cpu_percent)
                self.metrics_collector.set_gauge("memory_usage", memory.percent)
                self.metrics_collector.set_gauge("memory_used_bytes", memory.used)
                self.metrics_collector.set_gauge("disk_usage", disk.percent)

                # Update Prometheus gauges
                self.cpu_usage.set(cpu_percent)
                self.memory_usage.set(memory.used)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"System monitoring error: {e}")

    async def _alert_check_loop(self) -> None:
        """Alert checking loop"""
        while self._running:
            try:
                await asyncio.sleep(60)  # Check alerts every minute

                # Get current metrics
                current_metrics = await self._get_current_metrics()
                triggered_alerts = self.alert_manager.check_alerts(current_metrics)

                # Log triggered alerts
                for alert in triggered_alerts:
                    logger.warning(f"Alert triggered: {alert['message']} (severity: {alert['severity']})")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Alert check error: {e}")

    async def _collect_performance_metrics(self) -> None:
        """Collect performance metrics"""
        try:
            # Get recent metrics summaries
            response_time_summary = self.metrics_collector.get_metrics_summary("response_time", duration=3600)

            if response_time_summary:
                # Record derived metrics
                self.metrics_collector.set_gauge("response_time_p50", response_time_summary.get('p50', 0))
                self.metrics_collector.set_gauge("response_time_p95", response_time_summary.get('p95', 0))
                self.metrics_collector.set_gauge("response_time_p99", response_time_summary.get('p99', 0))

                # Calculate error rate
                total_requests = self.metrics_collector.counters.get("requests_total", 0)
                error_requests = self.metrics_collector.counters.get("error_requests_total", 0)

                if total_requests > 0:
                    error_rate = (error_requests / total_requests) * 100
                    self.metrics_collector.set_gauge("error_rate", error_rate)

        except Exception as e:
            logger.error(f"Performance metrics collection error: {e}")

    async def _get_current_metrics(self) -> Dict[str, Any]:
        """Get current metrics for alert checking"""
        metrics = {}

        # Get recent response time metrics
        response_time_summary = self.metrics_collector.get_metrics_summary("response_time", duration=300)
        if response_time_summary:
            metrics["response_time_p95"] = response_time_summary.get('p95', 0)

        # Get system metrics
        metrics["memory_usage"] = self.metrics_collector.gauges.get("memory_usage", 0)
        metrics["cpu_usage"] = self.metrics_collector.gauges.get("cpu_usage", 0)
        metrics["disk_usage"] = self.metrics_collector.gauges.get("disk_usage", 0)

        # Calculate error rate
        total_requests = self.metrics_collector.counters.get("requests_total", 0)
        error_requests = self.metrics_collector.counters.get("error_requests_total", 0)

        if total_requests > 0:
            metrics["error_rate"] = (error_requests / total_requests) * 100
        else:
            metrics["error_rate"] = 0

        return metrics

    def record_request(
        self,
        method: str,
        endpoint: str,
        status_code: int,
        response_time: float,
        user_id: str = None,
        error: str = None
    ) -> None:
        """Record HTTP request metrics"""
        # Record detailed metrics
        metric = PerformanceMetrics(
            timestamp=time.time(),
            response_time=response_time * 1000,  # Convert to ms
            status_code=status_code,
            endpoint=endpoint,
            method=method,
            user_id=user_id,
            error=error
        )

        self.metrics_collector.record_metric("response_time", metric.response_time, {
            "method": method,
            "endpoint": endpoint,
            "status_code": str(status_code)
        })

        # Update counters
        self.metrics_collector.increment_counter("requests_total", 1, {
            "method": method,
            "endpoint": endpoint,
            "status_code": str(status_code)
        })

        if status_code >= 400:
            self.metrics_collector.increment_counter("error_requests_total", 1, {
                "method": method,
                "endpoint": endpoint,
                "status_code": str(status_code)
            })

        # Update Prometheus metrics
        self.request_count.labels(method=method, endpoint=endpoint, status=str(status_code)).inc()
        self.request_duration.labels(method=method, endpoint=endpoint).observe(response_time)

    def record_database_query(
        self,
        query_type: str,
        table: str,
        duration: float,
        success: bool = True
    ) -> None:
        """Record database query metrics"""
        self.metrics_collector.record_metric("database_query_duration", duration * 1000, {
            "query_type": query_type,
            "table": table,
            "success": str(success)
        })

        self.metrics_collector.increment_counter("database_queries_total", 1, {
            "query_type": query_type,
            "table": table,
            "success": str(success)
        })

    def record_cache_operation(
        self,
        operation: str,  # 'hit', 'miss', 'set', 'delete'
        cache_type: str,
        duration: float = 0
    ) -> None:
        """Record cache operation metrics"""
        self.metrics_collector.increment_counter("cache_operations_total", 1, {
            "operation": operation,
            "cache_type": cache_type
        })

        if duration > 0:
            self.metrics_collector.record_metric("cache_operation_duration", duration * 1000, {
                "operation": operation,
                "cache_type": cache_type
            })

    def record_ai_request(
        self,
        provider: str,
        model: str,
        duration: float,
        success: bool = True,
        tokens_used: int = None
    ) -> None:
        """Record AI request metrics"""
        self.metrics_collector.record_metric("ai_request_duration", duration * 1000, {
            "provider": provider,
            "model": model,
            "success": str(success)
        })

        self.metrics_collector.increment_counter("ai_requests_total", 1, {
            "provider": provider,
            "model": model,
            "success": str(success)
        })

        if tokens_used:
            self.metrics_collector.record_metric("ai_tokens_used", tokens_used, {
                "provider": provider,
                "model": model
            })

    async def get_performance_report(
        self,
        duration: int = 3600,
        include_alerts: bool = True,
        include_profiles: bool = True
    ) -> Dict[str, Any]:
        """Generate comprehensive performance report"""
        report = {
            "timestamp": time.time(),
            "duration": duration,
            "metrics": {},
            "system": {},
            "alerts": [],
            "recommendations": []
        }

        # Get metrics summaries
        metrics_to_include = [
            "response_time",
            "database_query_duration",
            "cache_operation_duration",
            "ai_request_duration"
        ]

        for metric_name in metrics_to_include:
            summary = self.metrics_collector.get_metrics_summary(metric_name, duration=duration)
            if summary:
                report["metrics"][metric_name] = summary

        # Add counters and gauges
        report["metrics"]["counters"] = self.metrics_collector.counters
        report["metrics"]["gauges"] = self.metrics_collector.gauges

        # System metrics
        report["system"] = {
            "cpu_usage": self.metrics_collector.gauges.get("cpu_usage", 0),
            "memory_usage": self.metrics_collector.gauges.get("memory_usage", 0),
            "memory_used_bytes": self.metrics_collector.gauges.get("memory_used_bytes", 0),
            "disk_usage": self.metrics_collector.gauges.get("disk_usage", 0)
        }

        # Add alerts
        if include_alerts:
            report["alerts"] = self.alert_manager.get_active_alerts()

        # Add profiles
        if include_profiles:
            report["profiles"] = {}
            for profile_name in self.profiler.profiles.keys():
                summary = self.profiler.get_profile_summary(profile_name)
                if summary:
                    report["profiles"][profile_name] = summary

        # Generate recommendations
        report["recommendations"] = await self._generate_recommendations(report)

        return report

    async def _generate_recommendations(self, report: Dict[str, Any]) -> List[str]:
        """Generate performance optimization recommendations"""
        recommendations = []

        # Response time recommendations
        response_time_p95 = report["metrics"].get("response_time", {}).get("p95", 0)
        if response_time_p95 > self.config.response_time_p95_threshold:
            recommendations.append(
                f"P95 response time ({response_time_p95:.1f}ms) exceeds threshold ({self.config.response_time_p95_threshold}ms). "
                "Consider optimizing slow endpoints, implementing caching, or scaling resources."
            )

        # Error rate recommendations
        error_rate = report["system"].get("error_rate", 0)
        if error_rate > self.config.error_rate_threshold:
            recommendations.append(
                f"Error rate ({error_rate:.1f}%) exceeds threshold ({self.config.error_rate_threshold}%). "
                "Review error logs and fix failing components."
            )

        # Memory usage recommendations
        memory_usage = report["system"].get("memory_usage", 0)
        if memory_usage > self.config.memory_usage_threshold:
            recommendations.append(
                f"Memory usage ({memory_usage:.1f}%) exceeds threshold ({self.config.memory_usage_threshold}%). "
                "Consider optimizing memory usage, implementing memory caching strategies, or scaling vertically."
            )

        # CPU usage recommendations
        cpu_usage = report["system"].get("cpu_usage", 0)
        if cpu_usage > self.config.cpu_usage_threshold:
            recommendations.append(
                f"CPU usage ({cpu_usage:.1f}%) exceeds threshold ({self.config.cpu_usage_threshold}%). "
                "Consider optimizing CPU-intensive operations, implementing async processing, or scaling horizontally."
            )

        # Database query recommendations
        db_metrics = report["metrics"].get("database_query_duration", {})
        if db_metrics:
            avg_db_duration = db_metrics.get("avg", 0)
            if avg_db_duration > 1000:  # 1 second
                recommendations.append(
                    f"Average database query duration ({avg_db_duration:.1f}ms) is high. "
                    "Consider optimizing queries, adding indexes, or implementing database connection pooling."
                )

        # Cache recommendations
        cache_total = sum(self.metrics_collector.counters.get(k, 0) for k in self.metrics_collector.counters.keys() if "cache" in k and "hit" in k)
        if cache_total > 0:
            cache_hits = sum(self.metrics_collector.counters.get(k, 0) for k in self.metrics_collector.counters.keys() if "cache" in k and "hit" in k)
            cache_misses = sum(self.metrics_collector.counters.get(k, 0) for k in self.metrics_collector.counters.keys() if "cache" in k and "miss" in k)

            if cache_hits + cache_misses > 0:
                hit_rate = (cache_hits / (cache_hits + cache_misses)) * 100
                if hit_rate < 80:
                    recommendations.append(
                        f"Cache hit rate ({hit_rate:.1f}%) is low. "
                        "Consider implementing better caching strategies or cache warming."
                    )

        return recommendations

    async def export_metrics(self, format: str = "prometheus") -> str:
        """Export metrics in specified format"""
        if format == "prometheus":
            return generate_latest(self.prometheus_registry).decode('utf-8')
        elif format == "json":
            return json.dumps({
                "metrics": self.metrics_collector.get_all_metrics(),
                "timestamp": time.time()
            }, indent=2)
        else:
            raise ValueError(f"Unsupported export format: {format}")

    async def save_metrics_to_file(
        self,
        filename: str,
        format: str = "json",
        compress: bool = True
    ) -> None:
        """Save metrics to file"""
        try:
            metrics_data = await self.export_metrics(format)

            if compress:
                compressed_data = gzip.compress(metrics_data.encode('utf-8'))
                async with aiofiles.open(f"{filename}.gz", 'wb') as f:
                    await f.write(compressed_data)
            else:
                async with aiofiles.open(filename, 'w') as f:
                    await f.write(metrics_data)

            logger.info(f"Metrics saved to {filename}")

        except Exception as e:
            logger.error(f"Failed to save metrics to file: {e}")

    def get_prometheus_metrics(self) -> str:
        """Get Prometheus metrics"""
        return generate_latest(self.prometheus_registry).decode('utf-8')

# Global instance
advanced_performance_monitor = AdvancedPerformanceService()

# Decorators for automatic performance monitoring
def monitor_performance(
    name: str = None,
    include_args: bool = False,
    monitor_success: bool = True
):
    """Decorator to monitor function performance"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            function_name = name or f"{func.__module__}.{func.__name__}"

            try:
                result = await func(*args, **kwargs)
                duration = time.time() - start_time

                if monitor_success:
                    advanced_performance_monitor.record_request(
                        method="FUNCTION",
                        endpoint=function_name,
                        status_code=200,
                        response_time=duration
                    )

                # Record detailed metrics
                tags = {"function": function_name}
                if include_args:
                    tags["args_count"] = str(len(args))
                    tags["kwargs_count"] = str(len(kwargs))

                advanced_performance_monitor.metrics_collector.record_metric(
                    "function_duration",
                    duration * 1000,
                    tags
                )

                return result

            except Exception as e:
                duration = time.time() - start_time
                advanced_performance_monitor.record_request(
                    method="FUNCTION",
                    endpoint=function_name,
                    status_code=500,
                    response_time=duration,
                    error=str(e)
                )
                raise

        return wrapper
    return decorator

def profile_function(name: str = None):
    """Decorator to profile function performance"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            profile_name = name or f"{func.__module__}.{func.__name__}"
            async with advanced_performance_monitor.profiler.profile(profile_name):
                return await func(*args, **kwargs)
        return wrapper
    return decorator