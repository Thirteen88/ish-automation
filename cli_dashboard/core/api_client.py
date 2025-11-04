"""
API Client for ISH Chat Backend
Handles communication with the Instance Manager API
"""
import asyncio
import aiohttp
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict

from .config import DashboardConfig

logger = logging.getLogger(__name__)

@dataclass
class InstanceInfo:
    """AI Instance information"""
    instance_id: str
    provider_type: str
    model_name: str
    instance_name: str
    status: str
    is_active: bool
    is_healthy: bool
    total_requests: int
    successful_requests: int
    failed_requests: int
    average_response_time: float
    success_rate: float
    current_load: int
    max_concurrent_requests: int
    last_health_check: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    tags: Dict[str, Any]
    metadata: Dict[str, Any]
    priority: int

@dataclass
class HealthInfo:
    """Health check information"""
    instance_id: str
    status: str
    score: float
    response_time: Optional[float]
    issues: List[str]
    last_check: datetime
    next_check: Optional[datetime]

@dataclass
class SystemStatus:
    """Overall system status"""
    instances: Dict[str, int]
    provider_groups: Dict[str, int]
    services: Dict[str, Any]
    timestamp: datetime

@dataclass
class MetricsInfo:
    """Performance metrics for an instance"""
    instance_id: str
    time_window_seconds: int
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    average_response_time_ms: float
    current_load: int
    max_concurrent_requests: int
    health_check_success_rate: float
    is_healthy: bool
    status: str

class ISHChatAPIClient:
    """API client for ISH Chat backend"""

    def __init__(self, config: DashboardConfig):
        self.config = config
        self.base_url = config.api_base_url.rstrip('/')
        self.session: Optional[aiohttp.ClientSession] = None
        self._last_request_time: Dict[str, datetime] = {}

    async def __aenter__(self):
        """Async context manager entry"""
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.stop()

    async def start(self):
        """Start the API client"""
        # Skip starting session if in simulation mode
        if self.config.simulate_data:
            logger.debug("API client skipped - simulation mode enabled")
            return

        if self.session is None:
            timeout = aiohttp.ClientTimeout(total=self.config.api_timeout)
            self.session = aiohttp.ClientSession(
                timeout=timeout,
                connector=aiohttp.TCPConnector(
                    limit=10,
                    limit_per_host=5,
                    ttl_dns_cache=300,
                    use_dns_cache=True,
                )
            )
            logger.debug("API client session started")

    async def stop(self):
        """Stop the API client"""
        if self.session:
            await self.session.close()
            self.session = None
            logger.debug("API client session stopped")

    def _get_url(self, endpoint: str) -> str:
        """Get full URL for API endpoint"""
        return f"{self.base_url}{endpoint}"

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Make HTTP request with retry logic"""
        if not self.session:
            await self.start()

        url = self._get_url(endpoint)
        last_error = None

        for attempt in range(self.config.api_retries):
            try:
                async with self.session.request(method, url, **kwargs) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data, None
                    else:
                        error_msg = f"HTTP {response.status}: {response.text}"
                        logger.warning(f"API request failed: {error_msg}")
                        last_error = error_msg

            except asyncio.TimeoutError:
                error_msg = f"Request timeout after {self.config.api_timeout}s"
                logger.warning(f"API request timeout: {error_msg}")
                last_error = error_msg

            except aiohttp.ClientError as e:
                error_msg = f"Client error: {e}"
                logger.warning(f"API client error: {error_msg}")
                last_error = error_msg

            except Exception as e:
                error_msg = f"Unexpected error: {e}"
                logger.error(f"API request error: {error_msg}")
                last_error = error_msg

            # Wait before retry (exponential backoff)
            if attempt < self.config.api_retries - 1:
                wait_time = min(2 ** attempt, 5)
                await asyncio.sleep(wait_time)

        return None, last_error

    async def get_instances(
        self,
        provider_type: Optional[str] = None,
        status: Optional[str] = None,
        is_healthy: Optional[bool] = None
    ) -> Tuple[List[InstanceInfo], Optional[str]]:
        """Get list of AI instances"""
        params = {}
        if provider_type:
            params['provider_type'] = provider_type
        if status:
            params['status'] = status
        if is_healthy is not None:
            params['is_healthy'] = str(is_healthy).lower()

        data, error = await self._make_request(
            'GET',
            '/api/instances/',
            params=params
        )

        if error or not data:
            return [], error

        try:
            instances = []
            for item in data:
                # Convert datetime strings to datetime objects
                if item.get('last_health_check'):
                    item['last_health_check'] = datetime.fromisoformat(
                        item['last_health_check'].replace('Z', '+00:00')
                    )
                if item.get('created_at'):
                    item['created_at'] = datetime.fromisoformat(
                        item['created_at'].replace('Z', '+00:00')
                    )
                if item.get('updated_at'):
                    item['updated_at'] = datetime.fromisoformat(
                        item['updated_at'].replace('Z', '+00:00')
                    )

                instances.append(InstanceInfo(**item))

            return instances, None

        except Exception as e:
            logger.error(f"Failed to parse instances data: {e}")
            return [], f"Failed to parse instances data: {e}"

    async def get_instance(self, instance_id: str) -> Tuple[Optional[InstanceInfo], Optional[str]]:
        """Get specific instance details"""
        data, error = await self._make_request(
            'GET',
            f'/api/instances/{instance_id}'
        )

        if error or not data:
            return None, error

        try:
            # Convert datetime strings
            if data.get('last_health_check'):
                data['last_health_check'] = datetime.fromisoformat(
                    data['last_health_check'].replace('Z', '+00:00')
                )
            if data.get('created_at'):
                data['created_at'] = datetime.fromisoformat(
                    data['created_at'].replace('Z', '+00:00')
                )
            if data.get('updated_at'):
                data['updated_at'] = datetime.fromisoformat(
                    data['updated_at'].replace('Z', '+00:00')
                )

            return InstanceInfo(**data), None

        except Exception as e:
            logger.error(f"Failed to parse instance data: {e}")
            return None, f"Failed to parse instance data: {e}"

    async def get_instance_health(
        self,
        instance_id: str
    ) -> Tuple[Optional[HealthInfo], Optional[str]]:
        """Get health status for specific instance"""
        data, error = await self._make_request(
            'GET',
            f'/api/instances/{instance_id}/health'
        )

        if error or not data:
            return None, error

        try:
            # Convert datetime strings
            if data.get('last_check'):
                data['last_check'] = datetime.fromisoformat(
                    data['last_check'].replace('Z', '+00:00')
                )
            if data.get('next_check'):
                data['next_check'] = datetime.fromisoformat(
                    data['next_check'].replace('Z', '+00:00')
                )

            return HealthInfo(**data), None

        except Exception as e:
            logger.error(f"Failed to parse health data: {e}")
            return None, f"Failed to parse health data: {e}"

    async def get_instance_metrics(
        self,
        instance_id: str,
        time_window: int = 300
    ) -> Tuple[Optional[MetricsInfo], Optional[str]]:
        """Get performance metrics for specific instance"""
        data, error = await self._make_request(
            'GET',
            f'/api/instances/{instance_id}/metrics',
            params={'time_window': time_window}
        )

        if error or not data:
            return None, error

        try:
            return MetricsInfo(**data), None

        except Exception as e:
            logger.error(f"Failed to parse metrics data: {e}")
            return None, f"Failed to parse metrics data: {e}"

    async def trigger_health_check(
        self,
        instance_id: str,
        check_type: str = "basic"
    ) -> Tuple[Optional[HealthInfo], Optional[str]]:
        """Trigger health check for specific instance"""
        data, error = await self._make_request(
            'POST',
            f'/api/instances/{instance_id}/health-check',
            params={'check_type': check_type}
        )

        if error or not data:
            return None, error

        try:
            # Convert datetime strings
            if data.get('last_check'):
                data['last_check'] = datetime.fromisoformat(
                    data['last_check'].replace('Z', '+00:00')
                )
            if data.get('next_check'):
                data['next_check'] = datetime.fromisoformat(
                    data['next_check'].replace('Z', '+00:00')
                )

            return HealthInfo(**data), None

        except Exception as e:
            logger.error(f"Failed to parse health check data: {e}")
            return None, f"Failed to parse health check data: {e}"

    async def get_system_status(self) -> Tuple[Optional[SystemStatus], Optional[str]]:
        """Get overall system status"""
        data, error = await self._make_request(
            'GET',
            '/api/instances/status'
        )

        if error or not data:
            return None, error

        try:
            # Convert timestamp
            if data.get('timestamp'):
                data['timestamp'] = datetime.fromisoformat(
                    data['timestamp'].replace('Z', '+00:00')
                )

            return SystemStatus(**data), None

        except Exception as e:
            logger.error(f"Failed to parse system status data: {e}")
            return None, f"Failed to parse system status data: {e}"

    async def get_health_summary(self) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Get overall health summary"""
        return await self._make_request(
            'GET',
            '/api/instances/health-summary'
        )

    async def get_load_balancer_metrics(self) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Get load balancer metrics"""
        return await self._make_request(
            'GET',
            '/api/instances/load-balancer/metrics'
        )

    async def get_instance_utilization(
        self,
        time_window_minutes: int = 60
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Get instance utilization report"""
        return await self._make_request(
            'GET',
            '/api/instances/load-balancer/utilization',
            params={'time_window_minutes': time_window_minutes}
        )

    async def get_auto_scaling_metrics(
        self,
        group_id: Optional[int] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Get auto-scaling metrics"""
        params = {}
        if group_id is not None:
            params['group_id'] = group_id

        return await self._make_request(
            'GET',
            '/api/instances/auto-scaling/metrics',
            params=params
        )

    async def update_instance_load(
        self,
        instance_id: str,
        current_load: int
    ) -> Tuple[bool, Optional[str]]:
        """Update current load for an instance"""
        data, error = await self._make_request(
            'PUT',
            f'/api/instances/{instance_id}/load',
            params={'current_load': current_load}
        )

        if error:
            return False, error

        return True, None

    # Instance management actions
    async def start_health_monitoring(self) -> Tuple[bool, Optional[str]]:
        """Start health monitoring"""
        data, error = await self._make_request(
            'POST',
            '/api/instances/health-monitoring/start'
        )

        if error:
            return False, error

        return True, None

    async def stop_health_monitoring(self) -> Tuple[bool, Optional[str]]:
        """Stop health monitoring"""
        data, error = await self._make_request(
            'POST',
            '/api/instances/health-monitoring/stop'
        )

        if error:
            return False, error

        return True, None

    async def start_auto_scaling(self) -> Tuple[bool, Optional[str]]:
        """Start auto-scaling"""
        data, error = await self._make_request(
            'POST',
            '/api/instances/auto-scaling/start'
        )

        if error:
            return False, error

        return True, None

    async def stop_auto_scaling(self) -> Tuple[bool, Optional[str]]:
        """Stop auto-scaling"""
        data, error = await self._make_request(
            'POST',
            '/api/instances/auto-scaling/stop'
        )

        if error:
            return False, error

        return True, None

    async def test_connection(self) -> bool:
        """Test API connection"""
        # Return True if in simulation mode
        if self.config.simulate_data:
            logger.debug("API connection test skipped - simulation mode enabled")
            return True

        try:
            # Try to get system status as a simple connection test
            _, error = await self.get_system_status()
            return error is None
        except Exception:
            return False