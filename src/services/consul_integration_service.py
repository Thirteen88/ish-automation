"""
Consul Integration Service for ISH Chat System
Main integration service that coordinates all Consul components
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from .consul_service_registry import (
    ConsulServiceRegistry, get_consul_service_registry, ServiceType
)
from .consul_service_discovery import (
    ConsulServiceDiscovery, get_consul_service_discovery, DiscoveryStrategy
)
from .consul_health_integration import (
    ConsulHealthIntegration, get_consul_health_integration
)
from ..models.instance_manager import AIInstance, ProviderType
from ..database.database import get_db

logger = logging.getLogger(__name__)

class ConsulIntegrationService:
    """Main Consul integration service"""
    
    def __init__(
        self,
        consul_host: str = "localhost",
        consul_port: int = 8500,
        consul_token: Optional[str] = None,
        datacenter: str = "ish-chat-dc1"
    ):
        self.consul_host = consul_host
        self.consul_port = consul_port
        self.consul_token = consul_token
        self.datacenter = datacenter
        
        # Initialize components
        self.registry = get_consul_service_registry(
            consul_host=consul_host,
            consul_port=consul_port,
            consul_token=consul_token
        )
        
        self.discovery = get_consul_service_discovery(self.registry)
        
        # Health integration will be initialized later
        self.health_integration = None
        
        # Service configuration
        self.service_config = {}
        
        # Background tasks
        self._shutdown_event = asyncio.Event()
        
    async def start(self):
        """Start all Consul integration services"""
        logger.info("Starting Consul Integration Service")
        
        try:
            # Start registry
            await self.registry.start()
            
            # Start health integration
            self.health_integration = get_consul_health_integration(self.registry)
            await self.health_integration.start()
            
            # Register core services
            await self._register_core_services()
            
            # Register existing AI instances
            await self._register_existing_ai_instances()
            
            logger.info("Consul Integration Service started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start Consul Integration Service: {str(e)}")
            raise
    
    async def stop(self):
        """Stop all Consul integration services"""
        logger.info("Stopping Consul Integration Service")
        
        # Signal shutdown
        self._shutdown_event.set()
        
        # Stop components
        if self.health_integration:
            await self.health_integration.stop()
        
        await self.registry.stop()
        
        logger.info("Consul Integration Service stopped")
    
    async def register_core_services(
        self,
        api_gateway_host: str = "localhost",
        api_gateway_port: int = 8000,
        instance_manager_host: str = "localhost",
        instance_manager_port: int = 8001,
        router_host: str = "localhost",
        router_port: int = 8002,
        load_balancer_host: str = "localhost",
        load_balancer_port: int = 8003
    ):
        """Register core ISH Chat services"""
        
        logger.info("Registering core services")
        
        # Store configuration
        self.service_config = {
            "api_gateway": {"host": api_gateway_host, "port": api_gateway_port},
            "instance_manager": {"host": instance_manager_host, "port": instance_manager_port},
            "intelligent_router": {"host": router_host, "port": router_port},
            "load_balancer": {"host": load_balancer_host, "port": load_balancer_port}
        }
        
        # Register API Gateway
        await self._register_api_gateway(api_gateway_host, api_gateway_port)
        
        # Register Instance Manager
        await self.registry.register_instance_manager(instance_manager_host, instance_manager_port)
        
        # Register Intelligent Router
        await self.registry.register_intelligent_router(router_host, router_port)
        
        # Register Load Balancer
        await self.registry.register_load_balancer(load_balancer_host, load_balancer_port)
        
        logger.info("Core services registered successfully")
    
    async def discover_ai_instance_for_request(
        self,
        provider_type: Optional[ProviderType] = None,
        model_name: Optional[str] = None,
        strategy: DiscoveryStrategy = DiscoveryStrategy.HEALTH_BASED
    ) -> Optional[Dict[str, Any]]:
        """Discover AI instance for a specific request"""
        
        try:
            endpoint = await self.discovery.select_ai_instance(
                provider_type=provider_type,
                model_name=model_name,
                strategy=strategy
            )
            
            if not endpoint:
                return None
            
            # Convert to instance-like format
            instance_info = {
                "instance_id": endpoint.meta.get("instance_id"),
                "provider_type": endpoint.meta.get("provider_type"),
                "model_name": endpoint.meta.get("model_name"),
                "instance_name": endpoint.meta.get("instance_name"),
                "endpoint_url": endpoint.endpoint_url,
                "region": endpoint.meta.get("region"),
                "version": endpoint.meta.get("version"),
                "max_concurrent_requests": int(endpoint.meta.get("max_concurrent_requests", 10)),
                "max_tokens_per_minute": int(endpoint.meta.get("max_tokens_per_minute", 10000)),
                "priority": int(endpoint.meta.get("priority", 1)),
                "service_id": endpoint.service_id,
                "health_status": endpoint.health_status,
                "discovery_metadata": {
                    "address": endpoint.address,
                    "port": endpoint.port,
                    "tags": endpoint.tags,
                    "last_updated": endpoint.last_updated.isoformat()
                }
            }
            
            # Add performance metadata if available
            if "success_rate" in endpoint.meta:
                instance_info["success_rate"] = float(endpoint.meta["success_rate"])
            if "average_response_time" in endpoint.meta:
                instance_info["average_response_time"] = float(endpoint.meta["average_response_time"])
            
            return instance_info
            
        except Exception as e:
            logger.error(f"Failed to discover AI instance: {str(e)}")
            return None
    
    async def discover_core_service_endpoint(
        self,
        service_type: ServiceType,
        strategy: DiscoveryStrategy = DiscoveryStrategy.HEALTH_BASED
    ) -> Optional[str]:
        """Discover core service endpoint URL"""
        
        try:
            endpoint = await self.discovery.select_core_service(service_type, strategy)
            
            if endpoint:
                return endpoint.endpoint_url
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to discover {service_type.value} endpoint: {str(e)}")
            return None
    
    async def update_ai_instance_health(
        self,
        instance_id: str,
        success_rate: Optional[float] = None,
        average_response_time: Optional[float] = None,
        current_load: Optional[int] = None
    ):
        """Update AI instance health metrics"""
        
        try:
            # Find the service ID for this instance
            service_id = f"ai-instance-{instance_id}"
            
            # Update metadata in Consul
            meta_updates = {}
            if success_rate is not None:
                meta_updates["success_rate"] = str(success_rate)
            if average_response_time is not None:
                meta_updates["average_response_time"] = str(average_response_time)
            if current_load is not None:
                meta_updates["current_load"] = str(current_load)
            meta_updates["last_health_update"] = datetime.utcnow().isoformat()
            
            # Update service metadata
            await self.registry.consul_async.agent.service.register(
                name="",  # Will use existing name
                service_id=service_id,
                meta=meta_updates
            )
            
            logger.debug(f"Updated health metrics for instance {instance_id}")
            
        except Exception as e:
            logger.error(f"Failed to update AI instance health: {str(e)}")
    
    async def get_service_mesh_status(self) -> Dict[str, Any]:
        """Get comprehensive service mesh status"""
        
        try:
            # Get registry status
            registry_status = await self.registry.get_registry_status()
            
            # Get discovery stats
            discovery_stats = await self.discovery.get_discovery_stats()
            
            # Get health metrics
            health_metrics = {}
            if self.health_integration and self.health_integration.redis_client:
                health_data = await self.health_integration.redis_client.get("health_metrics")
                if health_data:
                    health_metrics = json.loads(health_data)
            
            # Get service counts by type
            service_counts = {}
            for service_type in ServiceType:
                services = await self.discovery.discover_core_services(service_type)
                if services:
                    service_counts[service_type.value] = len(services)
            
            return {
                "consul_connected": registry_status["consul_connected"],
                "total_services": registry_status["total_services"],
                "registered_services": registry_status["registered_services"],
                "failed_services": registry_status["failed_services"],
                "service_types": registry_status["service_types"],
                "service_counts": service_counts,
                "health_metrics": health_metrics,
                "discovery_stats": discovery_stats,
                "last_updated": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get service mesh status: {str(e)}")
            return {"error": str(e)}
    
    async def handle_service_failure(self, service_id: str, error: str):
        """Handle service failure and trigger recovery actions"""
        
        logger.warning(f"Handling service failure for {service_id}: {error}")
        
        try:
            # Get service health summary
            health_summary = await self.health_integration.get_service_health_summary(service_id)
            
            # Update service status in database if it's an AI instance
            if service_id.startswith("ai-"):
                await self._update_ai_instance_status(service_id, "unhealthy")
            
            # Invalidate discovery cache for this service
            await self.discovery.invalidate_cache(service_id)
            
            # Log failure event
            failure_event = {
                "service_id": service_id,
                "error": error,
                "health_summary": health_summary,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Store failure event for analysis
            if self.registry.redis_client:
                await self.registry.redis_client.lpush(
                    "service_failures",
                    json.dumps(failure_event)
                )
                await self.registry.redis_client.expire("service_failures", 86400)  # 24 hours
            
            logger.info(f"Service failure handled for {service_id}")
            
        except Exception as e:
            logger.error(f"Failed to handle service failure for {service_id}: {str(e)}")
    
    async def _register_api_gateway(self, host: str, port: int):
        """Register API Gateway service"""
        
        from .consul_service_registry import ServiceDefinition, HealthCheck, ServiceType
        
        health_check = HealthCheck(
            http=f"http://{host}:{port}/health",
            interval="30s",
            timeout="10s"
        )
        
        tags = ["core-service", "api-gateway", "ish-chat"]
        
        meta = {
            "service_type": ServiceType.API_GATEWAY.value,
            "version": "1.0.0",
            "registered_at": datetime.utcnow().isoformat()
        }
        
        service_definition = ServiceDefinition(
            service_id="api-gateway-1",
            service_name="api-gateway",
            service_type=ServiceType.API_GATEWAY,
            address=host,
            port=port,
            tags=tags,
            meta=meta,
            check=health_check.to_dict()
        )
        
        await self.registry.register_service(service_definition)
    
    async def _register_existing_ai_instances(self):
        """Register existing AI instances from database"""
        
        logger.info("Registering existing AI instances")
        
        try:
            db = next(get_db())
            
            try:
                # Get all active AI instances
                active_instances = db.query(AIInstance).filter(
                    AIInstance.is_active == True
                ).all()
                
                registered_count = 0
                for instance in active_instances:
                    success = await self.registry.register_ai_instance(instance)
                    if success:
                        registered_count += 1
                
                logger.info(f"Registered {registered_count} AI instances")
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Failed to register existing AI instances: {str(e)}")
    
    async def _update_ai_instance_status(self, service_id: str, status: str):
        """Update AI instance status in database"""
        
        try:
            # Extract instance ID from service ID
            parts = service_id.split("-", 2)
            if len(parts) < 3:
                return
            
            instance_id = parts[2]
            
            db = next(get_db())
            
            try:
                from ..models.instance_manager import AIInstance, InstanceStatus
                
                instance = db.query(AIInstance).filter(
                    AIInstance.instance_id == instance_id
                ).first()
                
                if instance:
                    if status == "unhealthy":
                        instance.status = InstanceStatus.UNHEALTHY
                    elif status == "healthy":
                        instance.status = InstanceStatus.HEALTHY
                    
                    db.commit()
                    logger.info(f"Updated AI instance {instance_id} status to {status}")
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Failed to update AI instance status: {str(e)}")

# Global integration service instance
consul_integration_service = None

def get_consul_integration_service(
    consul_host: str = "localhost",
    consul_port: int = 8500,
    consul_token: Optional[str] = None
) -> ConsulIntegrationService:
    """Get or create global Consul integration service"""
    global consul_integration_service
    if consul_integration_service is None:
        consul_integration_service = ConsulIntegrationService(
            consul_host=consul_host,
            consul_port=consul_port,
            consul_token=consul_token
        )
    return consul_integration_service