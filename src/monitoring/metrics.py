"""
Metrics Collection System for ISH Chat
Provides comprehensive metrics collection and monitoring
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
from collections import defaultdict, deque
from enum import Enum
import redis.asyncio as redis
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

class MetricType(Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"

@dataclass
class MetricValue:
    """Metric value with timestamp"""
    value: float
    timestamp: datetime
    labels: Dict[str, str] = None
    
    def __post_init__(self):
        if self.labels is None:
            self.labels = {}
        if isinstance(self.timestamp, (int, float)):
            self.timestamp = datetime.fromtimestamp(self.timestamp)

@dataclass
class Metric:
    """Metric definition"""
    name: str
    metric_type: MetricType
    description: str
    labels: List[str] = None
    
    def __post_init__(self):
        if self.labels is None:
            self.labels = []

class BaseMetric:
    """Base class for metrics"""
    
    def __init__(self, name: str, description: str, labels: List[str] = None):
        self.name = name
        self.description = description
        self.labels = labels or []
        self.values: Dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
    
    def _make_key(self, label_values: Dict[str, str]) -> str:
        """Create a key for label values"""
        if not self.labels:
            return "default"
        
        key_parts = []
        for label in self.labels:
            value = label_values.get(label, "")
            key_parts.append(f"{label}={value}")
        
        return "|".join(key_parts)
    
    def add_value(self, value: float, label_values: Dict[str, str] = None):
        """Add a metric value"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        self.values[key].append(MetricValue(value, datetime.utcnow(), label_values))
    
    def get_values(self, label_values: Dict[str, str] = None, since: datetime = None) -> List[MetricValue]:
        """Get metric values"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        values = list(self.values[key])
        
        if since:
            values = [v for v in values if v.timestamp >= since]
        
        return values
    
    def get_latest(self, label_values: Dict[str, str] = None) -> Optional[MetricValue]:
        """Get latest metric value"""
        values = self.get_values(label_values)
        return values[-1] if values else None
    
    def clear(self):
        """Clear all values"""
        self.values.clear()

class Counter(BaseMetric):
    """Counter metric"""
    
    def __init__(self, name: str, description: str, labels: List[str] = None):
        super().__init__(name, description, labels)
        self.counters: Dict[str, float] = defaultdict(float)
    
    def inc(self, value: float = 1.0, label_values: Dict[str, str] = None):
        """Increment counter"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        self.counters[key] += value
        self.add_value(self.counters[key], label_values)
    
    def get_count(self, label_values: Dict[str, str] = None) -> float:
        """Get current count"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        return self.counters[key]

class Gauge(BaseMetric):
    """Gauge metric"""
    
    def set(self, value: float, label_values: Dict[str, str] = None):
        """Set gauge value"""
        self.add_value(value, label_values)
    
    def inc(self, value: float = 1.0, label_values: Dict[str, str] = None):
        """Increment gauge"""
        latest = self.get_latest(label_values)
        current = latest.value if latest else 0.0
        self.set(current + value, label_values)
    
    def dec(self, value: float = 1.0, label_values: Dict[str, str] = None):
        """Decrement gauge"""
        latest = self.get_latest(label_values)
        current = latest.value if latest else 0.0
        self.set(max(0, current - value), label_values)

class Histogram(BaseMetric):
    """Histogram metric"""
    
    def __init__(self, name: str, description: str, buckets: List[float] = None, labels: List[str] = None):
        super().__init__(name, description, labels)
        self.buckets = buckets or [0.1, 0.5, 1.0, 2.5, 5.0, 10.0, float('inf')]
        self.bucket_counts: Dict[str, Dict[float, int]] = defaultdict(lambda: defaultdict(int))
        self.counts: Dict[str, int] = defaultdict(int)
        self.sums: Dict[str, float] = defaultdict(float)
    
    def observe(self, value: float, label_values: Dict[str, str] = None):
        """Observe a value"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        
        # Update bucket counts
        for bucket in self.buckets:
            if value <= bucket:
                self.bucket_counts[key][bucket] += 1
        
        # Update count and sum
        self.counts[key] += 1
        self.sums[key] += value
        
        # Store raw value
        self.add_value(value, label_values)
    
    def get_bucket_counts(self, label_values: Dict[str, str] = None) -> Dict[float, int]:
        """Get bucket counts"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        return dict(self.bucket_counts[key])
    
    def get_count(self, label_values: Dict[str, str] = None) -> int:
        """Get total count"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        return self.counts[key]
    
    def get_sum(self, label_values: Dict[str, str] = None) -> float:
        """Get sum of values"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        return self.sums[key]

class Summary(BaseMetric):
    """Summary metric"""
    
    def __init__(self, name: str, description: str, quantiles: List[float] = None, labels: List[str] = None):
        super().__init__(name, description, labels)
        self.quantiles = quantiles or [0.5, 0.9, 0.95, 0.99]
        self.counts: Dict[str, int] = defaultdict(int)
        self.sums: Dict[str, float] = defaultdict(float)
    
    def observe(self, value: float, label_values: Dict[str, str] = None):
        """Observe a value"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        
        # Update count and sum
        self.counts[key] += 1
        self.sums[key] += value
        
        # Store raw value
        self.add_value(value, label_values)
    
    def get_count(self, label_values: Dict[str, str] = None) -> int:
        """Get total count"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        return self.counts[key]
    
    def get_sum(self, label_values: Dict[str, str] = None) -> float:
        """Get sum of values"""
        if label_values is None:
            label_values = {}
        
        key = self._make_key(label_values)
        return self.sums[key]
    
    def get_quantile(self, quantile: float, label_values: Dict[str, str] = None) -> Optional[float]:
        """Get quantile value"""
        values = self.get_values(label_values)
        if not values:
            return None
        
        sorted_values = sorted(v.value for v in values)
        index = int(quantile * len(sorted_values))
        return sorted_values[min(index, len(sorted_values) - 1)]

class MetricsCollector:
    """Metrics collection system"""
    
    def __init__(self, redis_client: redis.Redis = None):
        self.redis_client = redis_client
        self.metrics: Dict[str, BaseMetric] = {}
        self.start_time = time.time()
        self.collection_interval = 10  # seconds
        self.background_task: Optional[asyncio.Task] = None
        self.is_running = False
        
        # Initialize default metrics
        self._initialize_default_metrics()
    
    def _initialize_default_metrics(self):
        """Initialize default metrics"""
        # HTTP metrics
        self.create_counter(
            "http_requests_total",
            "Total number of HTTP requests",
            ["method", "status", "endpoint"]
        )
        
        self.create_histogram(
            "http_request_duration_seconds",
            "HTTP request duration in seconds",
            buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            labels=["method", "endpoint"]
        )
        
        # Application metrics
        self.create_counter(
            "api_calls_total",
            "Total number of API calls",
            ["provider", "method", "status"]
        )
        
        self.create_histogram(
            "api_call_duration_seconds",
            "API call duration in seconds",
            buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0],
            labels=["provider", "method"]
        )
        
        # System metrics
        self.create_gauge(
            "system_cpu_usage_percent",
            "System CPU usage percentage"
        )
        
        self.create_gauge(
            "system_memory_usage_percent",
            "System memory usage percentage"
        )
        
        self.create_gauge(
            "system_disk_usage_percent",
            "System disk usage percentage"
        )
        
        # Application metrics
        self.create_gauge(
            "active_connections",
            "Number of active connections"
        )
        
        self.create_counter(
            "errors_total",
            "Total number of errors",
            ["type", "component"]
        )
    
    def create_counter(self, name: str, description: str, labels: List[str] = None) -> Counter:
        """Create a counter metric"""
        counter = Counter(name, description, labels)
        self.metrics[name] = counter
        return counter
    
    def create_gauge(self, name: str, description: str, labels: List[str] = None) -> Gauge:
        """Create a gauge metric"""
        gauge = Gauge(name, description, labels)
        self.metrics[name] = gauge
        return gauge
    
    def create_histogram(self, name: str, description: str, buckets: List[float] = None, labels: List[str] = None) -> Histogram:
        """Create a histogram metric"""
        histogram = Histogram(name, description, buckets, labels)
        self.metrics[name] = histogram
        return histogram
    
    def create_summary(self, name: str, description: str, quantiles: List[float] = None, labels: List[str] = None) -> Summary:
        """Create a summary metric"""
        summary = Summary(name, description, quantiles, labels)
        self.metrics[name] = summary
        return summary
    
    def get_metric(self, name: str) -> Optional[BaseMetric]:
        """Get a metric by name"""
        return self.metrics.get(name)
    
    def record_http_request(self, method: str, status: int, endpoint: str, duration: float):
        """Record HTTP request metrics"""
        request_counter = self.get_metric("http_requests_total")
        if request_counter:
            request_counter.inc(label_values={
                "method": method,
                "status": str(status),
                "endpoint": endpoint
            })
        
        request_duration = self.get_metric("http_request_duration_seconds")
        if request_duration:
            request_duration.observe(duration, label_values={
                "method": method,
                "endpoint": endpoint
            })
    
    def record_api_call(self, provider: str, method: str, status: str, duration: float):
        """Record API call metrics"""
        api_calls = self.get_metric("api_calls_total")
        if api_calls:
            api_calls.inc(label_values={
                "provider": provider,
                "method": method,
                "status": status
            })
        
        api_duration = self.get_metric("api_call_duration_seconds")
        if api_duration:
            api_duration.observe(duration, label_values={
                "provider": provider,
                "method": method
            })
    
    def record_error(self, error_type: str, component: str):
        """Record error metrics"""
        errors = self.get_metric("errors_total")
        if errors:
            errors.inc(label_values={
                "type": error_type,
                "component": component
            })
    
    def update_system_metrics(self):
        """Update system metrics"""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent()
            cpu_gauge = self.get_metric("system_cpu_usage_percent")
            if cpu_gauge:
                cpu_gauge.set(cpu_percent)
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_gauge = self.get_metric("system_memory_usage_percent")
            if memory_gauge:
                memory_gauge.set(memory.percent)
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_gauge = self.get_metric("system_disk_usage_percent")
            if disk_gauge:
                disk_gauge.set(disk.percent)
            
        except Exception as e:
            logger.error(f"Error updating system metrics: {e}")
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get metrics summary"""
        summary = {
            "timestamp": datetime.utcnow().isoformat(),
            "uptime_seconds": time.time() - self.start_time,
            "metrics": {}
        }
        
        for name, metric in self.metrics.items():
            metric_summary = {
                "type": metric.metric_type.value,
                "description": metric.description,
                "labels": metric.labels
            }
            
            if isinstance(metric, Counter):
                metric_summary["total_count"] = sum(metric.counts.values())
            elif isinstance(metric, Gauge):
                latest_values = [v.value for values in metric.values.values() for v in values if values]
                if latest_values:
                    metric_summary["current_value"] = latest_values[-1]
                    metric_summary["min_value"] = min(latest_values)
                    metric_summary["max_value"] = max(latest_values)
            elif isinstance(metric, Histogram):
                metric_summary["total_count"] = sum(metric.counts.values())
                metric_summary["total_sum"] = sum(metric.sums.values())
            elif isinstance(metric, Summary):
                metric_summary["total_count"] = sum(metric.counts.values())
                metric_summary["total_sum"] = sum(metric.sums.values())
            
            summary["metrics"][name] = metric_summary
        
        return summary
    
    def get_prometheus_metrics(self) -> str:
        """Get metrics in Prometheus format"""
        lines = []
        
        for name, metric in self.metrics.items():
            # Add metric metadata
            lines.append(f"# HELP {name} {metric.description}")
            lines.append(f"# TYPE {name} {metric.metric_type.value}")
            
            if isinstance(metric, Counter):
                for key, count in metric.counts.items():
                    if key == "default":
                        lines.append(f"{name} {count}")
                    else:
                        labels = key.replace("|", '="').replace("=", '="', 1) + '"'
                        lines.append(f"{name}{{{labels}}} {count}")
            
            elif isinstance(metric, Gauge):
                for key, values in metric.values.items():
                    if values:
                        latest = values[-1].value
                        if key == "default":
                            lines.append(f"{name} {latest}")
                        else:
                            labels = key.replace("|", '="').replace("=", '="', 1) + '"'
                            lines.append(f"{name}{{{labels}}} {latest}")
            
            elif isinstance(metric, Histogram):
                # Add bucket counts
                for key, bucket_counts in metric.bucket_counts.items():
                    for bucket, count in bucket_counts.items():
                        if key == "default":
                            if bucket == float('inf'):
                                lines.append(f"{name}_bucket{{le=\"+Inf\"}} {count}")
                            else:
                                lines.append(f"{name}_bucket{{le=\"{bucket}\"}} {count}")
                        else:
                            labels = key.replace("|", '="').replace("=", '="', 1) + '"'
                            if bucket == float('inf'):
                                lines.append(f"{name}_bucket{{{labels},le=\"+Inf\"}} {count}")
                            else:
                                lines.append(f"{name}_bucket{{{labels},le=\"{bucket}\"}} {count}")
                
                # Add count and sum
                for key, count in metric.counts.items():
                    if key == "default":
                        lines.append(f"{name}_count {count}")
                        lines.append(f"{name}_sum {metric.sums[key]}")
                    else:
                        labels = key.replace("|", '="').replace("=", '="', 1) + '"'
                        lines.append(f"{name}_count{{{labels}}} {count}")
                        lines.append(f"{name}_sum{{{labels}}} {metric.sums[key]}")
            
            elif isinstance(metric, Summary):
                # Add quantiles
                for key, values in metric.values.items():
                    if values:
                        sorted_values = sorted(v.value for v in values)
                        for quantile in metric.quantiles:
                            index = int(quantile * len(sorted_values))
                            value = sorted_values[min(index, len(sorted_values) - 1)]
                            
                            if key == "default":
                                lines.append(f"{name}{{quantile=\"{quantile}\"}} {value}")
                            else:
                                labels = key.replace("|", '="').replace("=", '="', 1) + '"'
                                lines.append(f"{name}{{{labels},quantile=\"{quantile}\"}} {value}")
                
                # Add count and sum
                for key, count in metric.counts.items():
                    if key == "default":
                        lines.append(f"{name}_count {count}")
                        lines.append(f"{name}_sum {metric.sums[key]}")
                    else:
                        labels = key.replace("|", '="').replace("=", '="', 1) + '"'
                        lines.append(f"{name}_count{{{labels}}} {count}")
                        lines.append(f"{name}_sum{{{labels}}} {metric.sums[key]}")
        
        return "\n".join(lines)
    
    async def start_background_collection(self):
        """Start background metrics collection"""
        if self.is_running:
            return
        
        self.is_running = True
        self.background_task = asyncio.create_task(self._background_collection_loop())
        logger.info("Started background metrics collection")
    
    async def stop_background_collection(self):
        """Stop background metrics collection"""
        if not self.is_running:
            return
        
        self.is_running = False
        if self.background_task:
            self.background_task.cancel()
            try:
                await self.background_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Stopped background metrics collection")
    
    async def _background_collection_loop(self):
        """Background metrics collection loop"""
        while self.is_running:
            try:
                self.update_system_metrics()
                
                # Store metrics in Redis if available
                if self.redis_client:
                    await self._store_metrics_in_redis()
                
                await asyncio.sleep(self.collection_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Background metrics collection error: {e}")
                await asyncio.sleep(5)
    
    async def _store_metrics_in_redis(self):
        """Store metrics in Redis"""
        try:
            metrics_data = self.get_metrics_summary()
            await self.redis_client.lpush(
                "metrics_history",
                json.dumps(metrics_data)
            )
            
            # Keep only last 1000 entries
            await self.redis_client.ltrim("metrics_history", 0, 999)
            
        except Exception as e:
            logger.error(f"Error storing metrics in Redis: {e}")
    
    def clear_all_metrics(self):
        """Clear all metrics"""
        for metric in self.metrics.values():
            metric.clear()
        logger.info("Cleared all metrics")

# Global metrics collector
metrics_collector = MetricsCollector()

# Decorator for metrics collection
def track_http_metrics():
    """Decorator to track HTTP metrics"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            method = "GET"
            endpoint = "/"
            status = 200
            
            try:
                # Try to extract request info
                for arg in args:
                    if hasattr(arg, 'method') and hasattr(arg, 'url'):
                        method = arg.method
                        endpoint = arg.url.path
                        break
                
                result = await func(*args, **kwargs)
                
                # Try to extract status from result
                if hasattr(result, 'status_code'):
                    status = result.status_code
                
                return result
                
            except Exception as e:
                status = 500
                metrics_collector.record_error("http_exception", "api")
                raise
            finally:
                duration = time.time() - start_time
                metrics_collector.record_http_request(method, status, endpoint, duration)
        
        return wrapper
    return decorator

# Factory function
def create_metrics_collector(redis_client: redis.Redis = None) -> MetricsCollector:
    """Create and configure metrics collector"""
    return MetricsCollector(redis_client)