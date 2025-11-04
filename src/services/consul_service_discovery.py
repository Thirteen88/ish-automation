"""
Consul Service Discovery Client for ISH Chat System
Integrates service discovery with existing services
"""
import asyncio
import json
import logging
import random
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, field
from enum import Enum
import aiohttp
import consul.aio

from .consul_service_registry import (
    ConsulServiceRegistry, ServiceType, get_consul_service_registry
)
from ..models.instance_manager import AIInstance, ProviderType

logger = logging.getLogger(__name__)

class DiscoveryStrategy(Enum):
    """Service discovery strategies"""
    RANDOM = "random"
    ROUND_ROBIN = "round_robin"
    LEAST_CONNECTIONS = "least_connections"
    HEALTH_BASED = "health_based"
    REGION_BASED = "region_based"

@dataclass
class ServiceEndpoint:
    """Service endpoint information"""
    service_id: str
    service_name: str
    service_type: ServiceType
    address: str
    port: int
    url: str
    tags: List[str] = field(default_factory=list)
    meta: Dict[str, str] = field(default_factory=dict)
    health_status: str = "unknown"
    last_updated: datetime = field(default_factory=datetime.utcnow)
    
    @property
    def endpoint_url(self) -> str:
        """Get the full endpoint URL"""
        protocol = "https" if self.port == 443 else "http"
        return f"{protocol}://{self.address}:{self.port}"
    
    @property
    def is_healthy(self) -> bool:
        """Check if service is healthy"""
        return self.health_status == "passing"

@dataclass
class ServiceQuery:
    """Service discovery query"""
    service_name: Optional[str] = None
    service_type: Optional[ServiceType] = None
    tags: Optional[List[str]] = None
    meta_filters: Optional[Dict[str, str]] = None
    only_healthy: bool = True
    region: Optional[str] = None

class ServiceDiscoveryCache:
    """Cache for service discovery results"""
    
    def __init__(self, ttl: int = 30):
        self.ttl = ttl
        self._cache: Dict[str, Tuple[List[ServiceEndpoint], datetime]] = {}
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[List[ServiceEndpoint]]:
        """Get cached services"""
        async with self._lock:
            if key in self._cache:
                services, timestamp = self._cache[key]
                if datetime.utcnow() - timestamp < timedelta(seconds=self.ttl):
                    return services
                else:
                    del self._cache[key]
            return None
    
    async def set(self, key: str, services: List[ServiceEndpoint]):
        """Cache services"""
        async with self._lock:
            self._cache[key] = (services, datetime.utcnow())
    
    async def clear(self):
        """Clear cache"""
        async with self._lock:
            self._cache.clear()

class ConsulServiceDiscovery:
    """Main service discovery client"""
    
    def __init__(
        self,
        consul_registry: Optional[ConsulServiceRegistry] = None,
        cache_ttl: int = 30,
        default_strategy: DiscoveryStrategy = DiscoveryStrategy.HEALTH_BASED
    ):
        self.registry = consul_registry or get_consul_service_registry()
        self.cache = ServiceDiscoveryCache(ttl=cache_ttl)
        self.default_strategy = default_strategy
        
        # Load balancing state
        self._round_robin_counters = {}
        self._connection_counts = {}
        
        # Service change callbacks
        self._service_callbacks: Dict[str, List[callable]] = {}
        
    async def discover_ai_instances(
        self,
        provider_type: Optional[ProviderType] = None,
        model_name: Optional[str] = None,
        region: Optional[str] = None,
        only_healthy: bool = True
    ) -> List[ServiceEndpoint]:
        """Discover AI provider instances"""
        
        # Build query
        tags = []
        meta_filters = {}
        
        if provider_type:
            tags.append(provider_type.value)
        
        if model_name:
            meta_filters["model_name"] = model_name
        
        if region:
            meta_filters["region"] = region
        
        query = ServiceQuery(
            service_type=ServiceType.AI_PROVIDER,
            tags=tags if tags else None,
            meta_filters=meta_filters if meta_filters else None,
            only_healthy=only_healthy,
            region=region
        )
        
        return await self.discover_services(query)
    
    async def discover_core_services(
        self,
        service_type: ServiceType,
        only_healthy: bool = True
    ) -> List[ServiceEndpoint]:
        """Discover core services (instance manager, router, load balancer)"""
        
        query = ServiceQuery(
            service_type=service_type,
            only_healthy=only_healthy
        )
        
        return await self.discover_services(query)
    
    async def discover_services(self, query: ServiceQuery) -> List[ServiceEndpoint]:
        """Discover services based on query"""
        
        # Generate cache key
        cache_key = self._generate_cache_key(query)
        
        # Try cache first
        cached_services = await self.cache.get(cache_key)
        if cached_services:
            logger.debug(f"Using cached services for query: {cache_key}")
            return cached_services
        
        try:
            # Discover from Consul
            services_data = await self.registry.discover_services(
                service_name=query.service_name,
                service_type=query.service_type.value if query.service_type else None,
                tags=query.tags,
                only_passing=query.only_healthy
            )
            
            # Convert to ServiceEndpoint objects
            endpoints = []
            for service_data in services_data:
                endpoint = self._convert_to_endpoint(service_data)
                
                # Apply additional filters
                if self._matches_query(endpoint, query):
                    endpoints.append(endpoint)
            
            # Cache results
            await self.cache.set(cache_key, endpoints)
            
            logger.debug(f"Discovered {len(endpoints)} services for query: {cache_key}")
            return endpoints
            
        except Exception as e:
            logger.error(f"Failed to discover services: {str(e)}")
            return []
    
    async def select_ai_instance(
        self,
        provider_type: Optional[ProviderType] = None,
        model_name: Optional[str] = None,
        strategy: Optional[DiscoveryStrategy] = None,
        region: Optional[str] = None
    ) -> Optional[ServiceEndpoint]:
        """Select best AI instance for request"""
        
        # Discover available instances
        instances = await self.discover_ai_instances(
            provider_type=provider_type,
            model_name=model_name,
            region=region,
            only_healthy=True
        )
        
        if not instances:
            logger.warning("No healthy AI instances found")
            return None
        
        # Apply selection strategy
        strategy = strategy or self.default_strategy
        selected_instance = await self._apply_selection_strategy(instances, strategy)
        
        logger.info(f"Selected AI instance: {selected_instance.service_id} "
                   f"({selected_instance.meta.get('provider_type', 'unknown')} "
                   f"{selected_instance.meta.get('model_name', 'unknown')})")
        
        return selected_instance
    
    async def select_core_service(
        self,
        service_type: ServiceType,
        strategy: Optional[DiscoveryStrategy] = None
    ) -> Optional[ServiceEndpoint]:
        """Select core service instance"""
        
        services = await self.discover_core_services(service_type, only_healthy=True)
        
        if not services:
            logger.warning(f"No healthy {service_type.value} services found")
            return None
        
        strategy = strategy or self.default_strategy
        selected_service = await self._apply_selection_strategy(services, strategy)
        
        logger.info(f"Selected {service_type.value} service: {selected_service.service_id}")
        
        return selected_service
    
    async def get_service_url(
        self,
        service_name: str,
        path: str = "/",
        strategy: Optional[DiscoveryStrategy] = None
    ) -> Optional[str]:
        """Get service URL with specific path"""
        
        # Try to determine service type from name
        service_type = self._infer_service_type(service_name)
        
        if service_type == ServiceType.AI_PROVIDER:
            # Parse AI provider info from service name
            parts = service_name.split("-")
            if len(parts) >= 3:
                provider_type = ProviderType(parts[2]) if parts[2] in [p.value for p in ProviderType] else None
                endpoint = await self.select_ai_instance(provider_type=provider_type, strategy=strategy)
            else:
                endpoint = await self.select_ai_instance(strategy=strategy)
        else:
            endpoint = await self.select_core_service(service_type, strategy=strategy)
        
        if endpoint:
            return urljoin(endpoint.endpoint_url, path)
        
        return None
    
    async def watch_service_changes(
        self,
        service_name: str,
        callback: callable,
        interval: int = 30
    ):
        """Watch for changes in a service"""
        
        if service_name not in self._service_callbacks:
            self._service_callbacks[service_name] = []
        
        self._service_callbacks[service_name].append(callback)
        
        # Start watching if not already running
        if len(self._service_callbacks[service_name]) == 1:
            asyncio.create_task(self._service_watch_loop(service_name, interval))
    
    async def invalidate_cache(self, service_name: Optional[str] = None):
        """Invalidate cache for specific service or all services"""
        if service_name:
            # Invalidate specific service cache
            keys_to_remove = [key for key in self.cache._cache.keys() if service_name in key]
            for key in keys_to_remove:
                self.cache._cache.pop(key, None)
        else:
            # Clear all cache
            await self.cache.clear()
    
    def _generate_cache_key(self, query: ServiceQuery) -> str:
        """Generate cache key for query"""
        parts = [
            query.service_name or "any",
            query.service_type.value if query.service_type else "any",
            ",".join(query.tags) if query.tags else "none",
            str(query.only_healthy),
            query.region or "any"
        ]
        
        # Add meta filters
        if query.meta_filters:
            meta_parts = [f"{k}={v}" for k, v in sorted(query.meta_filters.items())]
            parts.append(",".join(meta_parts))
        
        return "|".join(parts)
    
    def _convert_to_endpoint(self, service_data: Dict[str, Any]) -> ServiceEndpoint:
        """Convert Consul service data to ServiceEndpoint"""
        
        service = service_data["service"]
        health = service_data.get("health", {})
        
        # Extract endpoint URL from meta if available
        endpoint_url = service.get("meta", {}).get("endpoint_url")
        if not endpoint_url:
            # Build from address and port
            protocol = "https" if service.get("port", 80) == 443 else "http"
            endpoint_url = f"{protocol}://{service['address']}:{service['port']}"
        
        return ServiceEndpoint(
            service_id=service["id"],
            service_name=service["service"],
            service_type=ServiceType(service.get("meta", {}).get("service_type", "unknown")),
            address=service["address"],
            port=service["port"],
            url=endpoint_url,
            tags=service.get("tags", []),
            meta=service.get("meta", {}),
            health_status=health.get("status", "unknown"),
            last_updated=datetime.utcnow()
        )
    
    def _matches_query(self, endpoint: ServiceEndpoint, query: ServiceQuery) -> bool:
        """Check if endpoint matches query criteria"""
        
        # Check service name
        if query.service_name and endpoint.service_name != query.service_name:
            return False
        
        # Check service type
        if query.service_type and endpoint.service_type != query.service_type:
            return False
        
        # Check tags
        if query.tags:
            if not any(tag in endpoint.tags for tag in query.tags):
                return False
        
        # Check meta filters
        if query.meta_filters:
            for key, value in query.meta_filters.items():
                if endpoint.meta.get(key) != value:
                    return False
        
        # Check region
        if query.region:
            if endpoint.meta.get("region") != query.region:
                return False
        
        return True
    
    async def _apply_selection_strategy(
        self,
        endpoints: List[ServiceEndpoint],
        strategy: DiscoveryStrategy
    ) -> ServiceEndpoint:
        """Apply selection strategy to choose endpoint"""
        
        if not endpoints:
            raise ValueError("No endpoints available")
        
        if strategy == DiscoveryStrategy.RANDOM:
            return random.choice(endpoints)
        
        elif strategy == DiscoveryStrategy.ROUND_ROBIN:
            return self._round_robin_selection(endpoints)
        
        elif strategy == DiscoveryStrategy.LEAST_CONNECTIONS:
            return self._least_connections_selection(endpoints)
        
        elif strategy == DiscoveryStrategy.HEALTH_BASED:
            return self._health_based_selection(endpoints)
        
        elif strategy == DiscoveryStrategy.REGION_BASED:
            return self._region_based_selection(endpoints)
        
        else:
            # Default to first endpoint
            return endpoints[0]
    
    def _round_robin_selection(self, endpoints: List[ServiceEndpoint]) -> ServiceEndpoint:
        """Round-robin selection"""
        key = endpoints[0].service_name
        
        if key not in self._round_robin_counters:
            self._round_robin_counters[key] = 0
        
        index = self._round_robin_counters[key] % len(endpoints)
        self._round_robin_counters[key] += 1
        
        return endpoints[index]
    
    def _least_connections_selection(self, endpoints: List[ServiceEndpoint]) -> ServiceEndpoint:
        """Select endpoint with least connections"""
        return min(endpoints, key=lambda x: self._connection_counts.get(x.service_id, 0))
    
    def _health_based_selection(self, endpoints: List[ServiceEndpoint]) -> ServiceEndpoint:
        """Select endpoint based on health score"""
        
        def health_score(endpoint):
            score = 0.0
            
            # Health status (50% weight)
            if endpoint.health_status == "passing":
                score += 0.5
            elif endpoint.health_status == "warning":
                score += 0.25
            
            # Success rate from metadata (30% weight)
            success_rate_str = endpoint.meta.get("success_rate", "100")
            try:
                success_rate = float(success_rate_str) / 100
                score += success_rate * 0.3
            except:
                score += 0.3  # Default to good
            
            # Response time from metadata (20% weight)
            response_time_str = endpoint.meta.get("average_response_time", "1000")
            try:
                response_time = float(response_time_str)
                # Lower response time is better (normalize to 0-1)
                rt_score = max(0, 1 - (response_time / 5000))
                score += rt_score * 0.2
            except:
                score += 0.1  # Default score
            
            return score
        
        return max(endpoints, key=health_score)
    
    def _region_based_selection(self, endpoints: List[ServiceEndpoint]) -> ServiceEndpoint:
        """Select endpoint from same region if possible"""
        
        # Get current region (could be from environment or config)
        current_region = "default"  # This could be configurable
        
        # Prefer endpoints from same region
        same_region_endpoints = [
            ep for ep in endpoints
            if ep.meta.get("region") == current_region
        ]
        
        if same_region_endpoints:
            return self._health_based_selection(same_region_endpoints)
        
        # Fall back to health-based selection
        return self._health_based_selection(endpoints)
    
    def _infer_service_type(self, service_name: str) -> ServiceType:
        """Infer service type from service name"""
        
        if "ai-provider" in service_name:
            return ServiceType.AI_PROVIDER
        elif "instance-manager" in service_name:
            return ServiceType.INSTANCE_MANAGER
        elif "intelligent-router" in service_name:
            return ServiceType.INTELLIGENT_ROUTER
        elif "load-balancer" in service_name:
            return ServiceType.LOAD_BALANCER
        elif "database" in service_name:
            return ServiceType.DATABASE
        elif "cache" in service_name or "redis" in service_name:
            return ServiceType.CACHE
        elif "monitoring" in service_name:
            return ServiceType.MONITORING
        elif "api-gateway" in service_name:
            return ServiceType.API_GATEWAY
        else:
            return ServiceType.WEB_UI
    
    async def _service_watch_loop(self, service_name: str, interval: int):
        """Background loop to watch service changes"""
        
        last_services = None
        
        while service_name in self._service_callbacks:
            try:
                # Get current services
                query = ServiceQuery(service_name=service_name)
                current_services = await self.discover_services(query)
                
                # Check for changes
                if last_services is not None:
                    if len(current_services) != len(last_services):
                        await self._notify_service_change(service_name, current_services)
                    else:
                        # Check if any service details changed
                        current_ids = {s.service_id for s in current_services}
                        last_ids = {s.service_id for s in last_services}
                        
                        if current_ids != last_ids:
                            await self._notify_service_change(service_name, current_services)
                
                last_services = current_services
                await asyncio.sleep(interval)
                
            except Exception as e:
                logger.error(f"Error in service watch loop for {service_name}: {str(e)}")
                await asyncio.sleep(5)
    
    async def _notify_service_change(self, service_name: str, services: List[ServiceEndpoint]):
        """Notify callbacks of service changes"""
        
        callbacks = self._service_callbacks.get(service_name, [])
        
        for callback in callbacks:
            try:
                await callback(service_name, services)
            except Exception as e:
                logger.error(f"Error in service change callback: {str(e)}")
    
    async def get_discovery_stats(self) -> Dict[str, Any]:
        """Get discovery statistics"""
        
        stats = {
            "cache_size": len(self.cache._cache),
            "round_robin_counters": len(self._round_robin_counters),
            "connection_counts": self._connection_counts.copy(),
            "active_watches": len(self._service_callbacks),
            "watched_services": list(self._service_callbacks.keys())
        }
        
        return stats

# Global discovery client
consul_service_discovery = None

def get_consul_service_discovery(
    consul_registry: Optional[ConsulServiceRegistry] = None
) -> ConsulServiceDiscovery:
    """Get or create global Consul service discovery client"""
    global consul_service_discovery
    if consul_service_discovery is None:
        consul_service_discovery = ConsulServiceDiscovery(consul_registry)
    return consul_service_discovery