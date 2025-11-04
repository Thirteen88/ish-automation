"""
Performance Benchmarking and Testing Service for ISH Chat Backend
Provides comprehensive load testing, stress testing, and performance analysis tools
"""
import asyncio
import logging
import time
import json
import statistics
import aiohttp
import psutil
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List, Callable, Union
from dataclasses import dataclass, field, asdict
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from collections import defaultdict, deque
import weakref
import threading
import uuid
import cProfile
import pstats
import io
import gc
import memory_profiler
import tracemalloc

logger = logging.getLogger(__name__)

@dataclass
class BenchmarkConfig:
    """Benchmark configuration"""
    name: str
    description: str
    target_url: str
    concurrent_users: int = 100
    duration_seconds: int = 60
    ramp_up_seconds: int = 10
    requests_per_second: Optional[int] = None
    timeout_seconds: int = 30
    method: str = "GET"
    headers: Dict[str, str] = field(default_factory=dict)
    payload: Optional[Dict[str, Any]] = None
    auth: Optional[Dict[str, str]] = None
    think_time: float = 0.0  # Time between requests for each user
    follow_redirects: bool = True
    verify_ssl: bool = True

@dataclass
class BenchmarkMetrics:
    """Benchmark metrics"""
    timestamp: float
    request_id: str
    status_code: int
    response_time: float  # milliseconds
    content_length: int = 0
    error: Optional[str] = None
    user_id: Optional[str] = None
    memory_usage: float = 0.0
    cpu_usage: float = 0.0

@dataclass
class BenchmarkResult:
    """Complete benchmark results"""
    config: BenchmarkConfig
    start_time: datetime
    end_time: datetime
    total_requests: int
    successful_requests: int
    failed_requests: int
    metrics: List[BenchmarkMetrics]
    system_metrics: Dict[str, List[float]]
    performance_summary: Dict[str, Any]

class LoadGenerator:
    """Load generator for simulating concurrent users"""

    def __init__(self, config: BenchmarkConfig):
        self.config = config
        self.session = None
        self.metrics = []
        self.user_id = str(uuid.uuid4())
        self.running = False

    async def start(self, session: aiohttp.ClientSession) -> None:
        """Start load generation"""
        self.session = session
        self.running = True

    async def stop(self) -> None:
        """Stop load generation"""
        self.running = False

    async def run_user_simulation(self) -> List[BenchmarkMetrics]:
        """Run simulated user requests"""
        user_metrics = []
        request_count = 0
        start_time = time.time()

        while self.running and (time.time() - start_time) < self.config.duration_seconds:
            try:
                # Generate request
                metric = await self._make_request(request_count)
                user_metrics.append(metric)

                # Think time between requests
                if self.config.think_time > 0:
                    await asyncio.sleep(self.config.think_time)

                # Rate limiting if specified
                if self.config.requests_per_second:
                    expected_time = request_count / self.config.requests_per_second
                    actual_time = time.time() - start_time
                    if actual_time < expected_time:
                        await asyncio.sleep(expected_time - actual_time)

                request_count += 1

            except Exception as e:
                logger.error(f"User simulation error: {e}")
                break

        return user_metrics

    async def _make_request(self, request_count: int) -> BenchmarkMetrics:
        """Make a single HTTP request"""
        start_time = time.time()
        request_id = f"{self.user_id}-{request_count}"

        # Get system metrics before request
        memory_before = psutil.Process().memory_info().rss / 1024 / 1024  # MB
        cpu_before = psutil.cpu_percent()

        try:
            # Prepare request parameters
            request_kwargs = {
                'method': self.config.method,
                'url': self.config.target_url,
                'headers': self.config.headers,
                'allow_redirects': self.config.follow_redirects,
                'ssl': self.config.verify_ssl,
                'timeout': aiohttp.ClientTimeout(total=self.config.timeout_seconds)
            }

            # Add payload for POST/PUT requests
            if self.config.payload and self.config.method.upper() in ['POST', 'PUT', 'PATCH']:
                request_kwargs['json'] = self.config.payload

            # Add authentication
            if self.config.auth:
                if self.config.auth.get('type') == 'basic':
                    request_kwargs['auth'] = aiohttp.BasicAuth(
                        self.config.auth['username'],
                        self.config.auth['password']
                    )
                elif self.config.auth.get('type') == 'bearer':
                    request_kwargs['headers']['Authorization'] = f"Bearer {self.config.auth['token']}"

            # Make request
            async with self.session.request(**request_kwargs) as response:
                content = await response.read()
                end_time = time.time()

                # Get system metrics after request
                memory_after = psutil.Process().memory_info().rss / 1024 / 1024  # MB
                cpu_after = psutil.cpu_percent()

                return BenchmarkMetrics(
                    timestamp=end_time,
                    request_id=request_id,
                    status_code=response.status,
                    response_time=(end_time - start_time) * 1000,  # Convert to ms
                    content_length=len(content),
                    user_id=self.user_id,
                    memory_usage=memory_after - memory_before,
                    cpu_usage=cpu_after - cpu_before
                )

        except Exception as e:
            end_time = time.time()
            return BenchmarkMetrics(
                timestamp=end_time,
                request_id=request_id,
                status_code=0,
                response_time=(end_time - start_time) * 1000,
                error=str(e),
                user_id=self.user_id
            )

class PerformanceBenchmarkService:
    """Main performance benchmarking service"""

    def __init__(self):
        self.results_history = deque(maxlen=100)
        self.active_benchmarks = {}
        self.running = False
        self.profiler = None

    async def run_benchmark(self, config: BenchmarkConfig) -> BenchmarkResult:
        """Run a performance benchmark"""
        logger.info(f"Starting benchmark: {config.name}")

        # Start system monitoring
        system_metrics_task = asyncio.create_task(self._monitor_system_metrics())

        try:
            # Create result object
            result = BenchmarkResult(
                config=config,
                start_time=datetime.utcnow(),
                end_time=None,
                total_requests=0,
                successful_requests=0,
                failed_requests=0,
                metrics=[],
                system_metrics={'cpu': [], 'memory': [], 'disk': [], 'network': []},
                performance_summary={}
            )

            # Store active benchmark
            benchmark_id = str(uuid.uuid4())
            self.active_benchmarks[benchmark_id] = result

            # Create HTTP session
            connector = aiohttp.TCPConnector(
                limit=config.concurrent_users * 2,
                limit_per_host=config.concurrent_users,
                keepalive_timeout=30,
                enable_cleanup_closed=True
            )

            timeout = aiohttp.ClientTimeout(total=config.timeout_seconds)
            async with aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers={'User-Agent': f'ISH-Chat-Benchmark/1.0'}
            ) as session:

                # Create load generators
                generators = []
                for i in range(config.concurrent_users):
                    generator = LoadGenerator(config)
                    await generator.start(session)
                    generators.append(generator)

                # Ramp up users gradually
                if config.ramp_up_seconds > 0:
                    ramp_interval = config.ramp_up_seconds / config.concurrent_users
                    for i, generator in enumerate(generators):
                        user_task = asyncio.create_task(generator.run_user_simulation())
                        # Stagger user starts
                        if i < len(generators) - 1:
                            await asyncio.sleep(ramp_interval)
                else:
                    # Start all users at once
                    user_tasks = [
                        asyncio.create_task(gen.run_user_simulation())
                        for gen in generators
                    ]

                # Wait for all users to complete
                try:
                    if config.ramp_up_seconds > 0:
                        # Users are already started in the loop above
                        pass
                    else:
                        user_metrics = await asyncio.gather(*user_tasks, return_exceptions=True)

                    # Collect metrics from generators
                    for generator in generators:
                        generator_metrics = await generator.run_user_simulation()
                        result.metrics.extend(generator_metrics)
                        await generator.stop()

                except Exception as e:
                    logger.error(f"Benchmark execution error: {e}")

            # Stop system monitoring
            system_metrics_task.cancel()
            try:
                await system_metrics_task
            except asyncio.CancelledError:
                pass

            # Calculate results
            result.end_time = datetime.utcnow()
            result.total_requests = len(result.metrics)
            result.successful_requests = len([m for m in result.metrics if 200 <= m.status_code < 400])
            result.failed_requests = len([m for m in result.metrics if m.status_code == 0 or m.status_code >= 400])

            # Generate performance summary
            result.performance_summary = self._calculate_performance_summary(result)

            # Store result
            self.results_history.append(result)
            del self.active_benchmarks[benchmark_id]

            logger.info(f"Benchmark completed: {config.name}")
            return result

        except Exception as e:
            logger.error(f"Benchmark failed: {e}")
            raise

    async def run_stress_test(
        self,
        base_config: BenchmarkConfig,
        max_users: int = 1000,
        step_size: int = 50,
        step_duration: int = 60
    ) -> List[BenchmarkResult]:
        """Run stress test with gradually increasing load"""
        results = []
        current_users = base_config.concurrent_users

        logger.info(f"Starting stress test from {current_users} to {max_users} users")

        while current_users <= max_users:
            logger.info(f"Testing with {current_users} concurrent users")

            # Create config for this step
            step_config = BenchmarkConfig(
                name=f"{base_config.name}-stress-{current_users}u",
                description=f"Stress test step with {current_users} users",
                target_url=base_config.target_url,
                concurrent_users=current_users,
                duration_seconds=step_duration,
                ramp_up_seconds=min(30, step_duration // 4),
                method=base_config.method,
                headers=base_config.headers,
                payload=base_config.payload,
                auth=base_config.auth
            )

            try:
                # Run benchmark step
                result = await self.run_benchmark(step_config)
                results.append(result)

                # Check if system is failing
                error_rate = result.failed_requests / result.total_requests * 100
                avg_response_time = result.performance_summary.get('avg_response_time', 0)

                if error_rate > 50 or avg_response_time > 10000:  # 50% error rate or 10s response time
                    logger.warning(f"System degradation detected at {current_users} users")
                    break

                # Increase users for next step
                current_users += step_size

            except Exception as e:
                logger.error(f"Stress test step failed at {current_users} users: {e}")
                break

        return results

    async def run_endurance_test(
        self,
        config: BenchmarkConfig,
        duration_hours: int = 1
    ) -> BenchmarkResult:
        """Run endurance test for extended duration"""
        logger.info(f"Starting endurance test for {duration_hours} hours")

        # Update config for long duration
        endurance_config = BenchmarkConfig(
            name=f"{config.name}-endurance-{duration_hours}h",
            description=f"Endurance test for {duration_hours} hours",
            target_url=config.target_url,
            concurrent_users=config.concurrent_users,
            duration_seconds=duration_hours * 3600,
            ramp_up_seconds=config.ramp_up_seconds,
            method=config.method,
            headers=config.headers,
            payload=config.payload,
            auth=config.auth
        )

        return await self.run_benchmark(endurance_config)

    async def _monitor_system_metrics(self) -> None:
        """Monitor system metrics during benchmark"""
        while True:
            try:
                # Collect system metrics
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
                network = psutil.net_io_counters()

                # Store metrics (in a real implementation, you'd store these in the result)
                # For now, we'll just log them
                logger.debug(f"System metrics - CPU: {cpu_percent}%, Memory: {memory.percent}%")

                await asyncio.sleep(5)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"System monitoring error: {e}")
                await asyncio.sleep(5)

    def _calculate_performance_summary(self, result: BenchmarkResult) -> Dict[str, Any]:
        """Calculate performance summary from metrics"""
        if not result.metrics:
            return {}

        # Extract response times
        response_times = [m.response_time for m in result.metrics if m.response_time > 0]
        status_codes = [m.status_code for m in result.metrics]

        if not response_times:
            return {}

        # Calculate statistics
        return {
            'duration_seconds': (result.end_time - result.start_time).total_seconds(),
            'total_requests': result.total_requests,
            'successful_requests': result.successful_requests,
            'failed_requests': result.failed_requests,
            'success_rate': (result.successful_requests / result.total_requests * 100) if result.total_requests > 0 else 0,
            'error_rate': (result.failed_requests / result.total_requests * 100) if result.total_requests > 0 else 0,
            'requests_per_second': result.total_requests / (result.end_time - result.start_time).total_seconds(),
            'response_time': {
                'min': min(response_times),
                'max': max(response_times),
                'mean': statistics.mean(response_times),
                'median': statistics.median(response_times),
                'p90': np.percentile(response_times, 90),
                'p95': np.percentile(response_times, 95),
                'p99': np.percentile(response_times, 99),
                'std': statistics.stdev(response_times) if len(response_times) > 1 else 0
            },
            'throughput': {
                'bytes_per_second': sum(m.content_length for m in result.metrics) / (result.end_time - result.start_time).total_seconds(),
                'requests_per_second': result.total_requests / (result.end_time - result.start_time).total_seconds()
            },
            'status_codes': {
                str(code): status_codes.count(code) for code in set(status_codes)
            },
            'errors': [m.error for m in result.metrics if m.error][:10]  # First 10 errors
        }

    async def profile_function(
        self,
        func: Callable,
        args: tuple = (),
        kwargs: dict = None,
        duration_seconds: int = 10
    ) -> Dict[str, Any]:
        """Profile a function's performance"""
        kwargs = kwargs or {}

        # Start memory tracing
        tracemalloc.start()

        # Profile function
        profiler = cProfile.Profile()
        profiler.enable()

        try:
            # Run function for specified duration
            start_time = time.time()
            call_count = 0

            while time.time() - start_time < duration_seconds:
                if asyncio.iscoroutinefunction(func):
                    await func(*args, **kwargs)
                else:
                    func(*args, **kwargs)
                call_count += 1

        except Exception as e:
            logger.error(f"Function profiling error: {e}")

        finally:
            profiler.disable()

        # Get memory statistics
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Get profiling statistics
        stats_stream = io.StringIO()
        ps = pstats.Stats(profiler, stream=stats_stream)
        ps.sort_stats('cumulative')
        ps.print_stats(20)  # Top 20 functions

        return {
            'function_name': func.__name__,
            'duration_seconds': duration_seconds,
            'call_count': call_count,
            'calls_per_second': call_count / duration_seconds,
            'memory_usage': {
                'current_mb': current / 1024 / 1024,
                'peak_mb': peak / 1024 / 1024
            },
            'profiling_stats': stats_stream.getvalue()
        }

    def generate_performance_report(
        self,
        result: BenchmarkResult,
        format: str = "json",
        include_charts: bool = False
    ) -> Union[str, Dict[str, Any]]:
        """Generate performance report"""
        report_data = {
            'benchmark_info': {
                'name': result.config.name,
                'description': result.config.description,
                'target_url': result.config.target_url,
                'concurrent_users': result.config.concurrent_users,
                'duration_seconds': result.config.duration_seconds
            },
            'execution_info': {
                'start_time': result.start_time.isoformat(),
                'end_time': result.end_time.isoformat(),
                'total_duration_seconds': (result.end_time - result.start_time).total_seconds()
            },
            'performance_summary': result.performance_summary,
            'recommendations': self._generate_recommendations(result)
        }

        if format == "json":
            return json.dumps(report_data, indent=2, default=str)
        elif format == "dict":
            return report_data
        else:
            raise ValueError(f"Unsupported format: {format}")

    def _generate_recommendations(self, result: BenchmarkResult) -> List[str]:
        """Generate performance optimization recommendations"""
        recommendations = []
        summary = result.performance_summary

        # Response time recommendations
        avg_response_time = summary.get('response_time', {}).get('mean', 0)
        p95_response_time = summary.get('response_time', {}).get('p95', 0)

        if avg_response_time > 1000:  # 1 second
            recommendations.append(
                f"Average response time ({avg_response_time:.0f}ms) is high. "
                "Consider optimizing slow operations, implementing caching, or scaling resources."
            )

        if p95_response_time > 2000:  # 2 seconds
            recommendations.append(
                f"P95 response time ({p95_response_time:.0f}ms) is high. "
                "Some requests are experiencing significant delays."
            )

        # Error rate recommendations
        error_rate = summary.get('error_rate', 0)
        if error_rate > 5:
            recommendations.append(
                f"Error rate ({error_rate:.1f}%) is elevated. "
                "Review error logs and fix failing components."
            )

        # Throughput recommendations
        requests_per_second = summary.get('requests_per_second', 0)
        if requests_per_second < 10 and result.config.concurrent_users > 10:
            recommendations.append(
                f"Low throughput ({requests_per_second:.1f} req/s) for {result.config.concurrent_users} users. "
                "System may be experiencing performance bottlenecks."
            )

        # Success rate recommendations
        success_rate = summary.get('success_rate', 0)
        if success_rate < 95:
            recommendations.append(
                f"Success rate ({success_rate:.1f}%) is below optimal. "
                "Investigate failed requests and improve reliability."
            )

        # Status code analysis
        status_codes = summary.get('status_codes', {})
        if '500' in status_codes and status_codes['500'] > 0:
            recommendations.append(
                f"Internal server errors detected ({status_codes['500']} occurrences). "
                "Check application logs for server-side issues."
            )

        if '429' in status_codes and status_codes['429'] > 0:
            recommendations.append(
                f"Rate limiting detected ({status_codes['429']} occurrences). "
                "Consider implementing client-side rate limiting or reducing concurrent users."
            )

        return recommendations

    async def compare_benchmarks(
        self,
        benchmark_ids: List[str]
    ) -> Dict[str, Any]:
        """Compare multiple benchmark results"""
        comparisons = {}

        # Find benchmarks in history
        benchmarks = [
            result for result in self.results_history
            if any(bid in result.config.name for bid in benchmark_ids)
        ]

        if len(benchmarks) < 2:
            return {"error": "Need at least 2 benchmarks to compare"}

        # Create comparison matrix
        metrics_to_compare = [
            'avg_response_time',
            'p95_response_time',
            'requests_per_second',
            'success_rate',
            'error_rate'
        ]

        comparison_data = {}
        for benchmark in benchmarks:
            comparison_data[benchmark.config.name] = {
                'concurrent_users': benchmark.config.concurrent_users,
                'response_time_mean': benchmark.performance_summary.get('response_time', {}).get('mean', 0),
                'response_time_p95': benchmark.performance_summary.get('response_time', {}).get('p95', 0),
                'requests_per_second': benchmark.performance_summary.get('requests_per_second', 0),
                'success_rate': benchmark.performance_summary.get('success_rate', 0),
                'error_rate': benchmark.performance_summary.get('error_rate', 0)
            }

        return {
            'benchmarks': comparison_data,
            'improvements': self._calculate_improvements(comparison_data),
            'regressions': self._calculate_regressions(comparison_data)
        }

    def _calculate_improvements(self, data: Dict[str, Dict[str, float]]) -> Dict[str, float]:
        """Calculate performance improvements"""
        if len(data) < 2:
            return {}

        # Compare latest to earliest
        names = list(data.keys())
        earliest = data[names[0]]
        latest = data[names[-1]]

        improvements = {}

        # Response time improvement (lower is better)
        if earliest['response_time_mean'] > 0:
            improvement = ((earliest['response_time_mean'] - latest['response_time_mean']) / earliest['response_time_mean']) * 100
            if improvement > 0:
                improvements['avg_response_time_improvement_percent'] = improvement

        # Throughput improvement (higher is better)
        if earliest['requests_per_second'] > 0:
            improvement = ((latest['requests_per_second'] - earliest['requests_per_second']) / earliest['requests_per_second']) * 100
            if improvement > 0:
                improvements['throughput_improvement_percent'] = improvement

        # Success rate improvement (higher is better)
        if earliest['success_rate'] > 0:
            improvement = ((latest['success_rate'] - earliest['success_rate']) / earliest['success_rate']) * 100
            if improvement > 0:
                improvements['success_rate_improvement_percent'] = improvement

        return improvements

    def _calculate_regressions(self, data: Dict[str, Dict[str, float]]) -> Dict[str, float]:
        """Calculate performance regressions"""
        if len(data) < 2:
            return {}

        # Compare latest to earliest
        names = list(data.keys())
        earliest = data[names[0]]
        latest = data[names[-1]]

        regressions = {}

        # Response time regression (higher is worse)
        if earliest['response_time_mean'] > 0:
            regression = ((latest['response_time_mean'] - earliest['response_time_mean']) / earliest['response_time_mean']) * 100
            if regression > 0:
                regressions['avg_response_time_regression_percent'] = regression

        # Throughput regression (lower is worse)
        if earliest['requests_per_second'] > 0:
            regression = ((earliest['requests_per_second'] - latest['requests_per_second']) / earliest['requests_per_second']) * 100
            if regression > 0:
                regressions['throughput_regression_percent'] = regression

        # Success rate regression (lower is worse)
        if earliest['success_rate'] > 0:
            regression = ((earliest['success_rate'] - latest['success_rate']) / earliest['success_rate']) * 100
            if regression > 0:
                regressions['success_rate_regression_percent'] = regression

        return regressions

    def get_benchmark_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get benchmark execution history"""
        history = []
        for result in list(self.results_history)[-limit:]:
            history.append({
                'name': result.config.name,
                'description': result.config.description,
                'start_time': result.start_time.isoformat(),
                'duration_seconds': (result.end_time - result.start_time).total_seconds(),
                'total_requests': result.total_requests,
                'success_rate': result.performance_summary.get('success_rate', 0),
                'avg_response_time': result.performance_summary.get('response_time', {}).get('mean', 0)
            })

        return history

# Global instance
performance_benchmark = PerformanceBenchmarkService()

# Decorators for benchmarking functions
def benchmark_function(
    name: str = None,
    duration_seconds: int = 10,
    include_memory: bool = True,
    include_cpu: bool = True
):
    """Decorator to benchmark function performance"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await performance_benchmark.profile_function(
                func=func,
                args=args,
                kwargs=kwargs,
                duration_seconds=duration_seconds
            )
        return wrapper
    return decorator

def compare_performance(*benchmark_names: str):
    """Decorator to compare performance of multiple functions"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # This would need to be implemented based on specific comparison needs
            result = await func(*args, **kwargs)
            return result
        return wrapper
    return decorator