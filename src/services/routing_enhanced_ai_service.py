"""
Routing Enhanced AI Service - Integrates Intelligent Query Router with AI providers
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, field
from enum import Enum

from .intelligent_query_router import (
    IntelligentQueryRouter, get_intelligent_query_router,
    RoutingDecision, QueryType, RoutingStrategy
)
from .enhanced_ai_service import (
    EnhancedAIService, AIRequest, AIResponse, ResponseFormat,
    ProviderComparator, ConversationContext
)
from .instance_manager_service import InstanceManagerService
from ..models.instance_manager import AIInstance, ProviderType
from ..database.database import get_db

logger = logging.getLogger(__name__)

@dataclass
class RoutingAIRequest:
    """Enhanced AI request with routing capabilities"""
    prompt: str
    system_prompt: Optional[str] = None
    preferred_provider: Optional[str] = None
    routing_strategy: Optional[RoutingStrategy] = None
    conversation_id: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 1000
    response_format: ResponseFormat = ResponseFormat.TEXT
    context: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    enable_routing: bool = True
    enable_fallback: bool = True
    timeout: float = 30.0

@dataclass
class RoutingAIResponse:
    """Enhanced AI response with routing information"""
    success: bool
    response: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    instance_id: Optional[str] = None
    
    # Routing information
    routing_decision: Optional[RoutingDecision] = None
    routing_time_ms: float = 0.0
    was_routed: bool = False
    was_failover: bool = False
    alternative_instances: List[AIInstance] = field(default_factory=list)
    
    # Performance metrics
    execution_time: float = 0.0
    total_time: float = 0.0
    estimated_cost: float = 0.0
    actual_cost: Optional[float] = None
    
    # Response metadata
    usage: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    retry_count: int = 0
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    # Request metadata
    request_metadata: Dict[str, Any] = field(default_factory=dict)

class RoutingEnhancedAIService:
    """Enhanced AI service with intelligent routing capabilities"""
    
    def __init__(
        self,
        instance_manager: InstanceManagerService,
        ai_service: EnhancedAIService,
        redis_client=None
    ):
        self.instance_manager = instance_manager
        self.ai_service = ai_service
        self.router = get_intelligent_query_router(instance_manager, redis_client)
        self.redis_client = redis_client
        
        # Configuration
        self.max_retries = 2
        self.retry_delay = 0.5  # seconds
        self.enable_metrics = True
        self.enable_caching = True
        
        # Performance tracking
        self.request_metrics = {}
        self.conversation_contexts = {}
        
        logger.info("Routing Enhanced AI Service initialized")

    async def generate_response(self, request: RoutingAIRequest) -> RoutingAIResponse:
        """Generate AI response with intelligent routing"""
        start_time = time.time()
        
        try:
            # Determine if routing should be used
            if request.enable_routing:
                return await self._generate_with_routing(request, start_time)
            else:
                return await self._generate_without_routing(request, start_time)
                
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            return RoutingAIResponse(
                success=False,
                error=str(e),
                error_code="GENERATION_ERROR",
                total_time=(time.time() - start_time) * 1000,
                request_metadata=request.metadata
            )

    async def _generate_with_routing(self, request: RoutingAIRequest, start_time: float) -> RoutingAIResponse:
        """Generate response using intelligent routing"""
        
        # Get routing decision
        routing_start = time.time()
        routing_decision = await self.router.route_query(
            query=request.prompt,
            preferred_provider=request.preferred_provider,
            strategy=request.routing_strategy,
            metadata=request.metadata
        )
        routing_time = (time.time() - routing_start) * 1000
        
        # Prepare AI request for the selected instance
        ai_request = self._prepare_ai_request(request, routing_decision)
        
        # Generate response with fallback
        response = await self._generate_with_fallback(
            ai_request, routing_decision, request.enable_fallback
        )
        
        # Update routing metrics
        execution_time = (time.time() - start_time) * 1000
        await self.router.update_routing_metrics(
            instance_id=response.instance_id or routing_decision.selected_instance.instance_id,
            success=response.success,
            response_time=response.execution_time,
            cost=response.actual_cost or routing_decision.estimated_cost
        )
        
        # Build routing enhanced response
        return RoutingAIResponse(
            success=response.success,
            response=response.response,
            provider=response.provider,
            model=response.model,
            instance_id=response.instance_id,
            routing_decision=routing_decision,
            routing_time_ms=routing_time,
            was_routed=True,
            was_failover=(response.provider != routing_decision.selected_instance.provider_type.value),
            alternative_instances=routing_decision.alternative_instances,
            execution_time=response.execution_time,
            total_time=execution_time,
            estimated_cost=routing_decision.estimated_cost,
            actual_cost=response.actual_cost,
            usage=response.usage,
            error=response.error,
            error_code=response.error_code,
            retry_count=response.metadata.get("retry_count", 0) if response.metadata else 0,
            request_metadata=request.metadata
        )

    async def _generate_without_routing(self, request: RoutingAIRequest, start_time: float) -> RoutingAIResponse:
        """Generate response without routing (direct to AI service)"""
        
        # Convert to enhanced AI request
        ai_request = AIRequest(
            prompt=request.prompt,
            system_prompt=request.system_prompt,
            provider=request.preferred_provider,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            response_format=request.response_format,
            context=request.context,
            metadata=request.metadata
        )
        
        # Generate response
        ai_response = await self.ai_service.generate_response(ai_request)
        
        total_time = (time.time() - start_time) * 1000
        
        return RoutingAIResponse(
            success=ai_response.success,
            response=ai_response.response,
            provider=ai_response.provider,
            model=ai_response.model,
            execution_time=ai_response.execution_time,
            total_time=total_time,
            usage=ai_response.usage,
            error=ai_response.error,
            request_metadata=request.metadata
        )

    def _prepare_ai_request(self, request: RoutingAIRequest, routing_decision: RoutingDecision) -> AIRequest:
        """Prepare AI request based on routing decision"""
        
        return AIRequest(
            prompt=request.prompt,
            system_prompt=request.system_prompt,
            provider=routing_decision.selected_instance.provider_type.value,
            model=routing_decision.selected_instance.model_name,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            response_format=request.response_format,
            context=request.context,
            metadata={
                **request.metadata,
                "routing_decision": {
                    "query_id": routing_decision.query_analysis.query_id,
                    "query_type": routing_decision.query_analysis.query_type.value,
                    "complexity": routing_decision.query_analysis.complexity.value,
                    "instance_id": routing_decision.selected_instance.instance_id,
                    "routing_strategy": routing_decision.routing_strategy.value
                }
            }
        )

    async def _generate_with_fallback(
        self,
        ai_request: AIRequest,
        routing_decision: RoutingDecision,
        enable_fallback: bool
    ) -> AIResponse:
        """Generate response with fallback to alternative instances"""
        
        instances_to_try = [routing_decision.selected_instance] + routing_decision.alternative_instances
        
        for i, instance in enumerate(instances_to_try):
            try:
                # Update request to use this instance
                ai_request.provider = instance.provider_type.value
                ai_request.model = instance.model_name
                ai_request.metadata["instance_id"] = instance.instance_id
                ai_request.metadata["retry_count"] = i
                
                # Generate response
                response = await self.ai_service.generate_response(ai_request)
                
                if response.success:
                    # Add instance information to response
                    response.metadata = response.metadata or {}
                    response.metadata["instance_id"] = instance.instance_id
                    response.metadata["was_failover"] = i > 0
                    response.metadata["provider_type"] = instance.provider_type.value
                    
                    return response
                else:
                    logger.warning(f"Instance {instance.instance_id} failed: {response.error}")
                    
            except Exception as e:
                logger.error(f"Error with instance {instance.instance_id}: {str(e)}")
                continue
        
        # All instances failed
        return AIResponse(
            success=False,
            provider="none",
            model="none",
            error="All instances failed to generate response",
            metadata={"retry_count": len(instances_to_try) - 1}
        )

    async def chat_with_routing(
        self,
        conversation_id: str,
        message: str,
        system_prompt: Optional[str] = None,
        preferred_provider: Optional[str] = None,
        routing_strategy: Optional[RoutingStrategy] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> RoutingAIResponse:
        """Continue conversation with intelligent routing"""
        
        # Get or create conversation context
        if conversation_id not in self.conversation_contexts:
            self.conversation_contexts[conversation_id] = {
                "messages": [],
                "provider": preferred_provider,
                "routing_strategy": routing_strategy,
                "created_at": datetime.utcnow()
            }
        
        context = self.conversation_contexts[conversation_id]
        
        # Add user message to context
        context["messages"].append({
            "role": "user",
            "content": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Prepare request
        request = RoutingAIRequest(
            prompt=message,
            system_prompt=system_prompt,
            preferred_provider=context.get("provider") or preferred_provider,
            routing_strategy=context.get("routing_strategy") or routing_strategy,
            conversation_id=conversation_id,
            context={"conversation_history": context["messages"][:-1]},
            metadata=metadata or {}
        )
        
        # Generate response
        response = await self.generate_response(request)
        
        # Add assistant response to context if successful
        if response.success and response.response:
            context["messages"].append({
                "role": "assistant",
                "content": response.response,
                "timestamp": datetime.utcnow().isoformat(),
                "provider": response.provider,
                "model": response.model,
                "instance_id": response.instance_id
            })
            
            # Update context routing preferences if routing was successful
            if response.was_routed and response.routing_decision:
                context["provider"] = response.provider
                context["routing_strategy"] = response.routing_decision.routing_strategy
        
        # Add conversation metadata to response
        response.request_metadata["conversation_id"] = conversation_id
        response.request_metadata["message_count"] = len(context["messages"])
        
        return response

    async def compare_routing_strategies(
        self,
        prompt: str,
        strategies: List[RoutingStrategy] = None,
        system_prompt: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Compare different routing strategies for the same query"""
        
        if strategies is None:
            strategies = [
                RoutingStrategy.PERFORMANCE,
                RoutingStrategy.COST,
                RoutingStrategy.SPECIALIZATION,
                RoutingStrategy.BALANCED
            ]
        
        results = {}
        tasks = []
        
        # Prepare requests for each strategy
        for strategy in strategies:
            request = RoutingAIRequest(
                prompt=prompt,
                system_prompt=system_prompt,
                routing_strategy=strategy,
                metadata={**(metadata or {}), "comparison_test": True}
            )
            tasks.append(self.generate_response(request))
        
        # Execute all requests
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for i, response in enumerate(responses):
            strategy = strategies[i]
            
            if isinstance(response, Exception):
                results[strategy.value] = {
                    "success": False,
                    "error": str(response),
                    "execution_time": 0
                }
            else:
                results[strategy.value] = {
                    "success": response.success,
                    "response_length": len(response.response) if response.response else 0,
                    "provider": response.provider,
                    "model": response.model,
                    "instance_id": response.instance_id,
                    "routing_time_ms": response.routing_time_ms,
                    "execution_time": response.execution_time,
                    "total_time": response.total_time,
                    "estimated_cost": response.estimated_cost,
                    "confidence_score": response.routing_decision.confidence_score if response.routing_decision else 0,
                    "was_failover": response.was_failover,
                    "error": response.error
                }
        
        # Find best strategy based on different criteria
        best_by_speed = min(
            (k for k, v in results.items() if v["success"]),
            key=lambda k: results[k]["total_time"]
        ) if any(v["success"] for v in results.values()) else None
        
        best_by_cost = min(
            (k for k, v in results.items() if v["success"]),
            key=lambda k: results[k]["estimated_cost"]
        ) if any(v["success"] for v in results.values()) else None
        
        best_by_confidence = max(
            (k for k, v in results.items() if v["success"]),
            key=lambda k: results[k]["confidence_score"]
        ) if any(v["success"] for v in results.values()) else None
        
        return {
            "prompt": prompt,
            "strategies_compared": [s.value for s in strategies],
            "results": results,
            "recommendations": {
                "best_for_speed": best_by_speed,
                "best_for_cost": best_by_cost,
                "best_for_confidence": best_by_confidence
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    async def batch_generate_with_routing(
        self,
        requests: List[RoutingAIRequest],
        max_concurrent: int = 5
    ) -> List[RoutingAIResponse]:
        """Generate responses for multiple requests with routing"""
        
        # Process requests in batches to control concurrency
        responses = []
        
        for i in range(0, len(requests), max_concurrent):
            batch = requests[i:i + max_concurrent]
            tasks = [self.generate_response(request) for request in batch]
            batch_responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            for j, response in enumerate(batch_responses):
                if isinstance(response, Exception):
                    # Convert exception to error response
                    error_response = RoutingAIResponse(
                        success=False,
                        error=str(response),
                        error_code="BATCH_ERROR",
                        request_metadata=batch[j].metadata
                    )
                    responses.append(error_response)
                else:
                    responses.append(response)
        
        return responses

    async def analyze_query_routing(
        self,
        query: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyze how a query would be routed without actually generating a response"""
        
        try:
            # Get routing decision
            routing_decision = await self.router.route_query(
                query=query,
                metadata=metadata
            )
            
            # Get query analysis
            query_analysis = routing_decision.query_analysis
            
            # Estimate costs for all available instances
            db = next(get_db())
            try:
                available_instances = await self.instance_manager.list_instances(
                    db, is_healthy=True
                )
                
                cost_estimates = []
                for instance in available_instances:
                    cost = self.router._estimate_cost(instance, query_analysis)
                    response_time = self.router._estimate_response_time(instance, query_analysis)
                    
                    cost_estimates.append({
                        "instance_id": instance.instance_id,
                        "provider_type": instance.provider_type,
                        "model_name": instance.model_name,
                        "estimated_cost": cost,
                        "estimated_response_time": response_time,
                        "success_rate": instance.success_rate,
                        "is_healthy": instance.is_healthy
                    })
                
                # Sort by cost
                cost_estimates.sort(key=lambda x: x["estimated_cost"])
                
            finally:
                db.close()
            
            return {
                "query_analysis": {
                    "query_id": query_analysis.query_id,
                    "query_type": query_analysis.query_type.value,
                    "complexity": query_analysis.complexity.value,
                    "estimated_tokens": query_analysis.estimated_tokens,
                    "language": query_analysis.language,
                    "confidence_score": query_analysis.confidence_score,
                    "requirements": {
                        "requires_code": query_analysis.requires_code,
                        "requires_reasoning": query_analysis.requires_reasoning,
                        "requires_creativity": query_analysis.requires_creativity,
                        "requires_data_analysis": query_analysis.requires_data_analysis,
                        "requires_automation": query_analysis.requires_automation
                    }
                },
                "recommended_routing": {
                    "selected_instance": {
                        "instance_id": routing_decision.selected_instance.instance_id,
                        "provider_type": routing_decision.selected_instance.provider_type,
                        "model_name": routing_decision.selected_instance.model_name
                    },
                    "routing_strategy": routing_decision.routing_strategy.value,
                    "decision_reason": routing_decision.decision_reason,
                    "confidence_score": routing_decision.confidence_score,
                    "estimated_cost": routing_decision.estimated_cost,
                    "estimated_response_time": routing_decision.estimated_response_time
                },
                "alternative_instances": [
                    {
                        "instance_id": alt.instance_id,
                        "provider_type": alt.provider_type,
                        "model_name": alt.model_name,
                        "success_rate": alt.success_rate
                    }
                    for alt in routing_decision.alternative_instances
                ],
                "cost_comparison": cost_estimates[:5],  # Top 5 cheapest options
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error analyzing query routing: {str(e)}")
            return {
                "error": str(e),
                "query": query,
                "timestamp": datetime.utcnow().isoformat()
            }

    async def get_service_statistics(self) -> Dict[str, Any]:
        """Get comprehensive service statistics"""
        
        # Get router statistics
        router_stats = await self.router.get_routing_statistics()
        
        # Get conversation statistics
        conversation_stats = {
            "total_conversations": len(self.conversation_contexts),
            "total_messages": sum(len(ctx["messages"]) for ctx in self.conversation_contexts.values()),
            "active_conversations": len([
                ctx for ctx in self.conversation_contexts.values()
                if ctx["messages"] and ctx["messages"][-1]["timestamp"] > 
                (datetime.utcnow() - timedelta(hours=1)).isoformat()
            ])
        }
        
        # Get provider statistics from AI service
        provider_info = self.ai_service.get_provider_info()
        
        return {
            "router_statistics": router_stats,
            "conversation_statistics": conversation_stats,
            "provider_info": provider_info,
            "service_configuration": {
                "max_retries": self.max_retries,
                "retry_delay": self.retry_delay,
                "enable_metrics": self.enable_metrics,
                "enable_caching": self.enable_caching
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    async def update_routing_feedback(
        self,
        query_id: str,
        instance_id: str,
        success: bool,
        response_time: float,
        user_satisfaction: Optional[int] = None,
        feedback_text: Optional[str] = None
    ):
        """Update routing feedback for learning"""
        
        await self.router.update_routing_metrics(
            instance_id=instance_id,
            success=success,
            response_time=response_time,
            cost=0.0  # Cost would be calculated based on actual usage
        )
        
        # Store detailed feedback
        if self.redis_client:
            feedback_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "query_id": query_id,
                "instance_id": instance_id,
                "success": success,
                "response_time": response_time,
                "user_satisfaction": user_satisfaction,
                "feedback_text": feedback_text
            }
            
            await self.redis_client.lpush(
                "routing_feedback_detailed",
                json.dumps(feedback_data)
            )
            await self.redis_client.ltrim("routing_feedback_detailed", 0, 999)

# Global service instance
routing_enhanced_ai_service = None

def get_routing_enhanced_ai_service(
    instance_manager: InstanceManagerService,
    ai_service: EnhancedAIService,
    redis_client=None
) -> RoutingEnhancedAIService:
    """Get or create global routing enhanced AI service"""
    global routing_enhanced_ai_service
    if routing_enhanced_ai_service is None:
        routing_enhanced_ai_service = RoutingEnhancedAIService(
            instance_manager, ai_service, redis_client
        )
    return routing_enhanced_ai_service