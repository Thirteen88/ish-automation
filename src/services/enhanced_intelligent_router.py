"""
Enhanced Intelligent Query Router with Consul integration
Extends the original router with service discovery capabilities
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from .intelligent_query_router import (
    IntelligentQueryRouter, QueryAnalysis, RoutingDecision, RoutingStrategy
)
from .consul_integration_service import get_consul_integration_service, DiscoveryStrategy
from .consul_service_discovery import ServiceEndpoint
from ..models.instance_manager import AIInstance, ProviderType

logger = logging.getLogger(__name__)

class EnhancedIntelligentQueryRouter:
    """Enhanced intelligent router with Consul service discovery"""
    
    def __init__(
        self,
        base_router: IntelligentQueryRouter,
        consul_integration_service = None
    ):
        self.base_router = base_router
        self.consul_integration = consul_integration_service or get_consul_integration_service()
        
    async def route_query(
        self,
        query: str,
        preferred_provider: Optional[str] = None,
        strategy: Optional[RoutingStrategy] = None,
        metadata: Dict[str, Any] = None,
        use_consul_discovery: bool = True
    ) -> RoutingDecision:
        """Route query with Consul discovery fallback"""
        
        if use_consul_discovery:
            try:
                # Try Consul discovery first
                consul_decision = await self._route_via_consul(
                    query, preferred_provider, strategy, metadata
                )
                if consul_decision:
                    return consul_decision
            except Exception as e:
                logger.warning(f"Consul routing failed, falling back to base router: {str(e)}")
        
        # Fall back to original router
        return await self.base_router.route_query(query, preferred_provider, strategy, metadata)
    
    async def route_query_with_consul_priority(
        self,
        query: str,
        preferred_provider: Optional[str] = None,
        strategy: Optional[RoutingStrategy] = None,
        metadata: Dict[str, Any] = None
    ) -> RoutingDecision:
        """Route query with Consul priority (use Consul when available)"""
        
        try:
            # Analyze query first
            query_analysis = await self.base_router.classifier.analyze_query(query, metadata)
            
            # Try to get instance from Consul
            provider_type = None
            if preferred_provider:
                try:
                    provider_type = ProviderType(preferred_provider)
                except ValueError:
                    pass
            
            consul_instance = await self.consul_integration.discover_ai_instance_for_request(
                provider_type=provider_type,
                model_name=self._get_model_for_query_type(query_analysis.query_type),
                strategy=self._convert_routing_to_discovery_strategy(strategy or self.base_router.default_strategy)
            )
            
            if consul_instance:
                return await self._create_consul_routing_decision(
                    query_analysis, consul_instance, strategy
                )
            else:
                # Fall back to base router
                return await self.base_router.route_query(query, preferred_provider, strategy, metadata)
                
        except Exception as e:
            logger.error(f"Error in Consul priority routing: {str(e)}")
            return await self.base_router.route_query(query, preferred_provider, strategy, metadata)
    
    async def get_available_providers_from_consul(self) -> List[str]:
        """Get list of available AI providers from Consul"""
        
        try:
            providers = set()
            
            # Discover all AI instances
            instances = await self.consul_integration.discovery.discover_ai_instances()
            
            for instance in instances:
                provider_type = instance.meta.get("provider_type")
                if provider_type:
                    providers.add(provider_type)
            
            return sorted(list(providers))
            
        except Exception as e:
            logger.error(f"Failed to get providers from Consul: {str(e)}")
            return []
    
    async def get_service_mesh_routing_stats(self) -> Dict[str, Any]:
        """Get routing statistics from service mesh"""
        
        try:
            # Get service mesh status
            mesh_status = await self.consul_integration.get_service_mesh_status()
            
            # Get base router statistics
            router_stats = await self.base_router.get_routing_statistics()
            
            # Combine statistics
            combined_stats = {
                "service_mesh_status": mesh_status,
                "router_statistics": router_stats,
                "consul_connected": mesh_status.get("consul_connected", False),
                "total_discovered_services": mesh_status.get("total_services", 0),
                "ai_provider_count": mesh_status.get("service_counts", {}).get("ai_provider", 0),
                "routing_strategy_distribution": router_stats.get("strategy_distribution", {}),
                "query_type_distribution": router_stats.get("query_type_distribution", {}),
                "last_updated": datetime.utcnow().isoformat()
            }
            
            return combined_stats
            
        except Exception as e:
            logger.error(f"Failed to get service mesh routing stats: {str(e)}")
            return {"error": str(e)}
    
    async def update_routing_metrics_with_consul(
        self,
        instance_id: str,
        success: bool,
        response_time: float,
        cost: float,
        service_id: Optional[str] = None
    ):
        """Update routing metrics and Consul health"""
        
        try:
            # Update base router metrics
            await self.base_router.update_routing_metrics(instance_id, success, response_time, cost)
            
            # Update Consul health metrics
            await self.consul_integration.update_ai_instance_health(
                instance_id=instance_id,
                # Calculate success rate from router metrics
                success_rate=self._calculate_success_rate(instance_id) if success else None,
                average_response_time=response_time
            )
            
            # Handle service failure if needed
            if not success and service_id:
                await self.consul_integration.handle_service_failure(
                    service_id=service_id,
                    error=f"Routing failure: instance {instance_id} failed"
                )
                
        except Exception as e:
            logger.error(f"Failed to update routing metrics: {str(e)}")
    
    async def _route_via_consul(
        self,
        query: str,
        preferred_provider: Optional[str],
        strategy: Optional[RoutingStrategy],
        metadata: Dict[str, Any]
    ) -> Optional[RoutingDecision]:
        """Route query via Consul discovery"""
        
        # Analyze query
        query_analysis = await self.base_router.classifier.analyze_query(query, metadata)
        
        # Determine provider type
        provider_type = None
        if preferred_provider:
            try:
                provider_type = ProviderType(preferred_provider)
            except ValueError:
                pass
        
        # Get model recommendation based on query type
        model_name = self._get_model_for_query_type(query_analysis.query_type)
        
        # Discover instance via Consul
        consul_instance = await self.consul_integration.discover_ai_instance_for_request(
            provider_type=provider_type,
            model_name=model_name,
            strategy=self._convert_routing_to_discovery_strategy(strategy or self.base_router.default_strategy)
        )
        
        if consul_instance:
            return await self._create_consul_routing_decision(
                query_analysis, consul_instance, strategy
            )
        
        return None
    
    async def _create_consul_routing_decision(
        self,
        query_analysis: QueryAnalysis,
        consul_instance: Dict[str, Any],
        strategy: Optional[RoutingStrategy]
    ) -> RoutingDecision:
        """Create routing decision from Consul instance"""
        
        # Create a mock AIInstance from Consul data
        mock_instance = AIInstance(
            instance_id=consul_instance["instance_id"],
            provider_type=ProviderType(consul_instance["provider_type"]),
            model_name=consul_instance["model_name"],
            instance_name=consul_instance["instance_name"],
            endpoint_url=consul_instance["endpoint_url"],
            region=consul_instance.get("region"),
            version=consul_instance.get("version"),
            max_concurrent_requests=consul_instance["max_concurrent_requests"],
            max_tokens_per_minute=consul_instance["max_tokens_per_minute"],
            priority=consul_instance["priority"]
        )
        
        # Add performance metrics if available
        if "success_rate" in consul_instance:
            mock_instance.success_rate = consul_instance["success_rate"]
        if "average_response_time" in consul_instance:
            mock_instance.average_response_time = consul_instance["average_response_time"]
        
        # Calculate estimated cost and response time
        estimated_cost = self.base_router._estimate_cost(mock_instance, query_analysis)
        estimated_response_time = self.base_router._estimate_response_time(mock_instance, query_analysis)
        
        # Calculate confidence score
        confidence_score = self.base_router._calculate_routing_confidence(
            mock_instance, query_analysis, strategy or self.base_router.default_strategy
        )
        
        return RoutingDecision(
            query_analysis=query_analysis,
            selected_instance=mock_instance,
            routing_strategy=strategy or self.base_router.default_strategy,
            decision_reason=f"Consul discovery: {consul_instance['service_id']}",
            confidence_score=confidence_score,
            alternative_instances=[],  # Could fetch alternatives from Consul if needed
            estimated_cost=estimated_cost,
            estimated_response_time=estimated_response_time,
            routing_time_ms=0.0,
            metadata={
                "consul_discovery": True,
                "service_id": consul_instance["service_id"],
                "health_status": consul_instance["health_status"],
                "discovery_metadata": consul_instance["discovery_metadata"]
            }
        )
    
    def _convert_routing_to_discovery_strategy(
        self,
        routing_strategy: RoutingStrategy
    ) -> DiscoveryStrategy:
        """Convert routing strategy to discovery strategy"""
        
        strategy_map = {
            RoutingStrategy.PERFORMANCE: DiscoveryStrategy.HEALTH_BASED,
            RoutingStrategy.COST: DiscoveryStrategy.HEALTH_BASED,  # Could add cost-based logic
            RoutingStrategy.SPECIALIZATION: DiscoveryStrategy.HEALTH_BASED,
            RoutingStrategy.BALANCED: DiscoveryStrategy.HEALTH_BASED,
            RoutingStrategy.ROUND_ROBIN: DiscoveryStrategy.ROUND_ROBIN,
            RoutingStrategy.PREDICTIVE: DiscoveryStrategy.HEALTH_BASED
        }
        
        return strategy_map.get(routing_strategy, DiscoveryStrategy.HEALTH_BASED)
    
    def _get_model_for_query_type(self, query_type) -> Optional[str]:
        """Get recommended model for query type"""
        
        # Model recommendations based on query type
        model_map = {
            "chinese_content": "glm-4",  # ZAI for Chinese
            "code_generation": "gpt-4",  # OpenAI for code
            "creative_writing": "claude-3-sonnet-20240229",  # Anthropic for creative
            "research": "perplexity-online",  # Perplexity for research
            "simple_qa": "gpt-3.5-turbo",  # Cost-effective for simple queries
        }
        
        return model_map.get(query_type.value)
    
    def _calculate_success_rate(self, instance_id: str) -> Optional[float]:
        """Calculate success rate for instance from router metrics"""
        
        if instance_id in self.base_router.routing_metrics:
            metrics = self.base_router.routing_metrics[instance_id]
            if metrics.total_requests > 0:
                return (metrics.successful_requests / metrics.total_requests) * 100
        
        return None

# Factory function to create enhanced router
def create_enhanced_intelligent_router(
    base_router: IntelligentQueryRouter,
    consul_integration_service = None
) -> EnhancedIntelligentQueryRouter:
    """Create enhanced intelligent router with Consul integration"""
    return EnhancedIntelligentQueryRouter(base_router, consul_integration_service)