"""
Enhanced Instance Manager Service with Consul integration
Extends the original instance manager with service discovery capabilities
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from .instance_manager_service import (
    InstanceManagerService, InstanceSelectionCriteria, LoadBalancingStrategy
)
from .consul_integration_service import get_consul_integration_service, DiscoveryStrategy
from .consul_service_discovery import ServiceEndpoint
from ..models.instance_manager import AIInstance, ProviderType
from ..database.database import get_db

logger = logging.getLogger(__name__)

class EnhancedInstanceManagerService:
    """Enhanced instance manager with Consul service discovery"""
    
    def __init__(
        self,
        base_instance_manager: InstanceManagerService,
        consul_integration_service = None
    ):
        self.base_manager = base_instance_manager
        self.consul_integration = consul_integration_service or get_consul_integration_service()
        
    async def select_instance_for_request(
        self,
        db,
        criteria: InstanceSelectionCriteria,
        strategy: LoadBalancingStrategy = LoadBalancingStrategy.HEALTH_BASED,
        use_consul_discovery: bool = True
    ):
        """Select instance for request with Consul discovery fallback"""
        
        if use_consul_discovery:
            try:
                # Try Consul discovery first
                consul_instance = await self._select_instance_via_consul(criteria, strategy)
                if consul_instance:
                    return self._convert_consul_to_load_balancing_result(consul_instance, criteria)
            except Exception as e:
                logger.warning(f"Consul discovery failed, falling back to database: {str(e)}")
        
        # Fall back to original database-based selection
        return await self.base_manager.select_instance_for_request(db, criteria, strategy)
    
    async def register_instance_with_consul(self, instance: AIInstance) -> bool:
        """Register instance with Consul service registry"""
        
        try:
            success = await self.consul_integration.registry.register_ai_instance(instance)
            
            if success:
                logger.info(f"Registered instance {instance.instance_id} with Consul")
            else:
                logger.warning(f"Failed to register instance {instance.instance_id} with Consul")
            
            return success
            
        except Exception as e:
            logger.error(f"Error registering instance {instance.instance_id} with Consul: {str(e)}")
            return False
    
    async def deregister_instance_from_consul(self, instance_id: str) -> bool:
        """Deregister instance from Consul"""
        
        try:
            service_id = f"ai-{instance_id}"
            success = await self.consul_integration.registry.deregister_service(service_id)
            
            if success:
                logger.info(f"Deregistered instance {instance_id} from Consul")
            else:
                logger.warning(f"Failed to deregister instance {instance_id} from Consul")
            
            return success
            
        except Exception as e:
            logger.error(f"Error deregistering instance {instance_id} from Consul: {str(e)}")
            return False
    
    async def update_instance_health_in_consul(
        self,
        instance_id: str,
        success_rate: Optional[float] = None,
        average_response_time: Optional[float] = None,
        current_load: Optional[int] = None
    ):
        """Update instance health metrics in Consul"""
        
        try:
            await self.consul_integration.update_ai_instance_health(
                instance_id=instance_id,
                success_rate=success_rate,
                average_response_time=average_response_time,
                current_load=current_load
            )
            
        except Exception as e:
            logger.error(f"Failed to update instance health in Consul: {str(e)}")
    
    async def get_instances_from_consul(
        self,
        provider_type: Optional[ProviderType] = None,
        model_name: Optional[str] = None,
        only_healthy: bool = True
    ) -> List[Dict[str, Any]]:
        """Get instances from Consul service discovery"""
        
        try:
            instances = await self.consul_integration.discover_ai_instance_for_request(
                provider_type=provider_type,
                model_name=model_name
            )
            
            if instances:
                return [instances]  # Return as list for compatibility
            else:
                return []
                
        except Exception as e:
            logger.error(f"Failed to get instances from Consul: {str(e)}")
            return []
    
    async def sync_instances_with_consul(self):
        """Synchronize database instances with Consul registry"""
        
        logger.info("Syncing instances with Consul")
        
        try:
            db = next(get_db())
            
            try:
                # Get all active instances from database
                db_instances = db.query(AIInstance).filter(
                    AIInstance.is_active == True
                ).all()
                
                # Get instances from Consul
                consul_instances = await self.consul_integration.discovery.discover_ai_instances()
                
                # Register missing instances
                for db_instance in db_instances:
                    service_id = f"ai-{db_instance.provider_type.value}-{db_instance.instance_id}"
                    
                    # Check if instance is registered in Consul
                    consul_instance = next(
                        (ci for ci in consul_instances if ci.service_id == service_id),
                        None
                    )
                    
                    if not consul_instance:
                        logger.info(f"Registering missing instance in Consul: {db_instance.instance_id}")
                        await self.register_instance_with_consul(db_instance)
                
                # Deregister orphaned Consul instances
                for consul_instance in consul_instances:
                    instance_id = consul_instance.meta.get("instance_id")
                    
                    if instance_id:
                        db_instance = db.query(AIInstance).filter(
                            AIInstance.instance_id == instance_id,
                            AIInstance.is_active == True
                        ).first()
                        
                        if not db_instance:
                            logger.info(f"Deregistering orphaned Consul instance: {instance_id}")
                            await self.deregister_instance_from_consul(instance_id)
                
                logger.info("Instance sync with Consul completed")
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Failed to sync instances with Consul: {str(e)}")
    
    async def _select_instance_via_consul(
        self,
        criteria: InstanceSelectionCriteria,
        strategy: LoadBalancingStrategy
    ) -> Optional[ServiceEndpoint]:
        """Select instance via Consul discovery"""
        
        # Convert strategy
        discovery_strategy = self._convert_load_balancing_to_discovery_strategy(strategy)
        
        # Discover instance
        instance_info = await self.consul_integration.discover_ai_instance_for_request(
            provider_type=criteria.provider_type,
            model_name=criteria.model_name,
            strategy=discovery_strategy
        )
        
        if instance_info:
            # Convert to ServiceEndpoint
            return ServiceEndpoint(
                service_id=instance_info["service_id"],
                service_name=f"ai-provider-{instance_info['provider_type']}",
                service_type=ServiceType.AI_PROVIDER,
                address=instance_info["discovery_metadata"]["address"],
                port=instance_info["discovery_metadata"]["port"],
                url=instance_info["endpoint_url"],
                tags=[instance_info["provider_type"], instance_info["model_name"]],
                meta=instance_info,
                health_status=instance_info["health_status"]
            )
        
        return None
    
    def _convert_load_balancing_to_discovery_strategy(
        self,
        load_balancing_strategy: LoadBalancingStrategy
    ) -> DiscoveryStrategy:
        """Convert load balancing strategy to discovery strategy"""
        
        strategy_map = {
            LoadBalancingStrategy.ROUND_ROBIN: DiscoveryStrategy.ROUND_ROBIN,
            LoadBalancingStrategy.RANDOM: DiscoveryStrategy.RANDOM,
            LoadBalancingStrategy.LEAST_CONNECTIONS: DiscoveryStrategy.LEAST_CONNECTIONS,
            LoadBalancingStrategy.LEAST_RESPONSE_TIME: DiscoveryStrategy.HEALTH_BASED,
            LoadBalancingStrategy.HEALTH_BASED: DiscoveryStrategy.HEALTH_BASED,
            LoadBalancingStrategy.WEIGHTED: DiscoveryStrategy.HEALTH_BASED
        }
        
        return strategy_map.get(load_balancing_strategy, DiscoveryStrategy.HEALTH_BASED)
    
    def _convert_consul_to_load_balancing_result(
        self,
        consul_endpoint: ServiceEndpoint,
        criteria: InstanceSelectionCriteria
    ):
        """Convert Consul endpoint to load balancing result"""
        
        from .instance_manager_service import LoadBalancingResult
        
        # Create a mock AIInstance from Consul data
        mock_instance = AIInstance(
            instance_id=consul_endpoint.meta.get("instance_id"),
            provider_type=ProviderType(consul_endpoint.meta.get("provider_type")),
            model_name=consul_endpoint.meta.get("model_name"),
            instance_name=consul_endpoint.meta.get("instance_name"),
            endpoint_url=consul_endpoint.url,
            region=consul_endpoint.meta.get("region"),
            version=consul_endpoint.meta.get("version"),
            max_concurrent_requests=int(consul_endpoint.meta.get("max_concurrent_requests", 10)),
            max_tokens_per_minute=int(consul_endpoint.meta.get("max_tokens_per_minute", 10000)),
            priority=int(consul_endpoint.meta.get("priority", 1))
        )
        
        # Add performance metrics if available
        if "success_rate" in consul_endpoint.meta:
            mock_instance.success_rate = float(consul_endpoint.meta["success_rate"])
        if "average_response_time" in consul_endpoint.meta:
            mock_instance.average_response_time = float(consul_endpoint.meta["average_response_time"])
        
        return LoadBalancingResult(
            selected_instance=mock_instance,
            selection_reason=f"Consul discovery: {consul_endpoint.service_id}",
            alternative_instances=[],  # Could fetch alternatives if needed
            total_healthy_instances=1,  # Could get total count from Consul
            load_balancing_time=0.0
        )
    
    # Delegate methods to base instance manager
    async def register_instance(self, db, instance_data: Dict[str, Any]) -> AIInstance:
        """Register instance (delegated to base manager)"""
        instance = await self.base_manager.register_instance(db, instance_data)
        
        # Also register with Consul
        await self.register_instance_with_consul(instance)
        
        return instance
    
    async def deregister_instance(self, db, instance_id: str) -> bool:
        """Deregister instance (delegated to base manager)"""
        # Deregister from Consul first
        await self.deregister_instance_from_consul(instance_id)
        
        # Then deregister from database
        return await self.base_manager.deregister_instance(db, instance_id)
    
    async def get_instance(self, db, instance_id: str) -> Optional[AIInstance]:
        """Get instance (delegated to base manager)"""
        return await self.base_manager.get_instance(db, instance_id)
    
    async def list_instances(
        self,
        db,
        provider_type: Optional[str] = None,
        status: Optional[str] = None,
        is_healthy: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[AIInstance]:
        """List instances (delegated to base manager)"""
        return await self.base_manager.list_instances(
            db, provider_type, status, is_healthy, limit, offset
        )
    
    async def perform_health_check(self, db, instance_id: str, check_type: str = "basic"):
        """Perform health check (delegated to base manager)"""
        result = await self.base_manager.perform_health_check(db, instance_id, check_type)
        
        # Update health in Consul
        instance = await self.get_instance(db, instance_id)
        if instance:
            await self.update_instance_health_in_consul(
                instance_id=instance_id,
                success_rate=instance.success_rate,
                average_response_time=instance.average_response_time
            )
        
        return result
    
    async def update_instance_load(self, db, instance_id: str, current_load: int) -> bool:
        """Update instance load (delegated to base manager)"""
        result = await self.base_manager.update_instance_load(db, instance_id, current_load)
        
        # Update load in Consul
        await self.update_instance_health_in_consul(
            instance_id=instance_id,
            current_load=current_load
        )
        
        return result
    
    async def get_instance_metrics(self, db, instance_id: str, time_window: int = 300) -> Dict[str, Any]:
        """Get instance metrics (delegated to base manager)"""
        return await self.base_manager.get_instance_metrics(db, instance_id, time_window)
    
    async def cleanup_old_data(self, db, days_to_keep: int = 30):
        """Clean up old data (delegated to base manager)"""
        return await self.base_manager.cleanup_old_data(db, days_to_keep)