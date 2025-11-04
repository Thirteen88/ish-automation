"""
API endpoints for Intelligent Query Router management
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import logging

from ..database.database import get_db
from ..services.intelligent_query_router import (
    IntelligentQueryRouter, get_intelligent_query_router,
    QueryType, QueryComplexity, RoutingStrategy,
    RoutingDecision, QueryAnalysis
)
from ..services.instance_manager_service import InstanceManagerService
from ..models.instance_manager import AIInstance

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/router", tags=["intelligent-router"])

# Pydantic models for API
class QueryRequest(BaseModel):
    query: str = Field(..., description="The query to route")
    preferred_provider: Optional[str] = Field(None, description="Preferred AI provider")
    strategy: Optional[RoutingStrategy] = Field(None, description="Routing strategy")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")

class RoutingResponse(BaseModel):
    success: bool
    query_id: str
    selected_instance: Dict[str, Any]
    routing_strategy: str
    decision_reason: str
    confidence_score: float
    estimated_cost: float
    estimated_response_time: float
    alternatives: List[Dict[str, Any]]
    query_analysis: Dict[str, Any]
    routing_time_ms: float

class QueryAnalysisRequest(BaseModel):
    query: str = Field(..., description="Query to analyze")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

class RoutingConfigUpdate(BaseModel):
    default_strategy: Optional[RoutingStrategy] = None
    max_alternatives: Optional[int] = Field(None, ge=1, le=10)
    routing_timeout: Optional[int] = Field(None, ge=10, le=1000)
    cache_ttl: Optional[int] = Field(None, ge=60, le=3600)

class FeedbackRequest(BaseModel):
    query_id: str
    instance_id: str
    success: bool
    response_time: float
    actual_cost: Optional[float] = None
    user_satisfaction: Optional[int] = Field(None, ge=1, le=5)
    feedback_text: Optional[str] = None

class CircuitBreakerUpdate(BaseModel):
    instance_id: str
    action: str = Field(..., description="Action: reset, open, close")
    reason: Optional[str] = None

# Dependency to get router instance
async def get_router() -> IntelligentQueryRouter:
    """Get intelligent query router instance"""
    # This would be initialized in the main application
    from ..main_instance_manager import instance_manager_service
    return get_intelligent_query_router(instance_manager_service)

@router.post("/route", response_model=RoutingResponse)
async def route_query(
    request: QueryRequest,
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Route a query to the optimal AI instance"""
    try:
        decision = await router.route_query(
            query=request.query,
            preferred_provider=request.preferred_provider,
            strategy=request.strategy,
            metadata=request.metadata
        )
        
        return RoutingResponse(
            success=True,
            query_id=decision.query_analysis.query_id,
            selected_instance={
                "instance_id": decision.selected_instance.instance_id,
                "provider_type": decision.selected_instance.provider_type,
                "model_name": decision.selected_instance.model_name,
                "instance_name": decision.selected_instance.instance_name,
                "is_healthy": decision.selected_instance.is_healthy,
                "success_rate": decision.selected_instance.success_rate,
                "average_response_time": decision.selected_instance.average_response_time
            },
            routing_strategy=decision.routing_strategy.value,
            decision_reason=decision.decision_reason,
            confidence_score=decision.confidence_score,
            estimated_cost=decision.estimated_cost,
            estimated_response_time=decision.estimated_response_time,
            alternatives=[
                {
                    "instance_id": alt.instance_id,
                    "provider_type": alt.provider_type,
                    "model_name": alt.model_name,
                    "success_rate": alt.success_rate
                }
                for alt in decision.alternative_instances
            ],
            query_analysis={
                "query_type": decision.query_analysis.query_type.value,
                "complexity": decision.query_analysis.complexity.value,
                "estimated_tokens": decision.query_analysis.estimated_tokens,
                "language": decision.query_analysis.language,
                "requires_code": decision.query_analysis.requires_code,
                "requires_reasoning": decision.query_analysis.requires_reasoning,
                "confidence_score": decision.query_analysis.confidence_score,
                "processing_time_ms": decision.query_analysis.processing_time_ms
            },
            routing_time_ms=decision.routing_time_ms
        )
        
    except Exception as e:
        logger.error(f"Error routing query: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze", response_model=Dict[str, Any])
async def analyze_query(
    request: QueryAnalysisRequest,
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Analyze a query without routing"""
    try:
        analysis = await router.classifier.analyze_query(request.query, request.metadata)
        
        return {
            "query_id": analysis.query_id,
            "original_query": analysis.original_query,
            "query_type": analysis.query_type.value,
            "complexity": analysis.complexity.value,
            "estimated_tokens": analysis.estimated_tokens,
            "language": analysis.language,
            "requirements": {
                "requires_code": analysis.requires_code,
                "requires_reasoning": analysis.requires_reasoning,
                "requires_creativity": analysis.requires_creativity,
                "requires_data_analysis": analysis.requires_data_analysis,
                "requires_automation": analysis.requires_automation
            },
            "confidence_score": analysis.confidence_score,
            "processing_time_ms": analysis.processing_time_ms,
            "metadata": analysis.metadata
        }
        
    except Exception as e:
        logger.error(f"Error analyzing query: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics", response_model=Dict[str, Any])
async def get_routing_statistics(
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Get routing statistics and performance metrics"""
    try:
        stats = await router.get_routing_statistics()
        
        # Add additional statistics
        instance_metrics = {}
        for instance_id, metrics in router.routing_metrics.items():
            instance_metrics[instance_id] = {
                "total_requests": metrics.total_requests,
                "successful_requests": metrics.successful_requests,
                "success_rate": (metrics.successful_requests / max(metrics.total_requests, 1)) * 100,
                "average_response_time": metrics.average_response_time,
                "average_cost": metrics.average_cost,
                "error_rate": metrics.error_rate,
                "last_updated": metrics.last_updated.isoformat()
            }
        
        return {
            **stats,
            "instance_metrics": instance_metrics,
            "model_specializations": {
                name: {
                    "provider_type": spec.provider_type.value,
                    "model_name": spec.model_name,
                    "strengths": [s.value for s in spec.strengths],
                    "weaknesses": [w.value for w in spec.weaknesses],
                    "cost_per_1k_tokens": spec.cost_per_1k_tokens,
                    "quality_score": spec.quality_score
                }
                for name, spec in router.specialization_registry.specializations.items()
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting routing statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models/specializations", response_model=Dict[str, Any])
async def get_model_specializations(
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Get model specializations and capabilities"""
    try:
        specializations = {}
        
        for name, spec in router.specialization_registry.specializations.items():
            specializations[name] = {
                "provider_type": spec.provider_type.value,
                "model_name": spec.model_name,
                "strengths": [s.value for s in spec.strengths],
                "weaknesses": [w.value for w in spec.weaknesses],
                "cost_per_1k_tokens": spec.cost_per_1k_tokens,
                "average_response_time": spec.average_response_time,
                "quality_score": spec.quality_score,
                "max_tokens": spec.max_tokens,
                "supports_streaming": spec.supports_streaming,
                "supports_functions": spec.supports_functions
            }
        
        return {
            "specializations": specializations,
            "query_types": [qt.value for qt in QueryType],
            "complexity_levels": [qc.value for qc in QueryComplexity],
            "routing_strategies": [rs.value for rs in RoutingStrategy]
        }
        
    except Exception as e:
        logger.error(f"Error getting model specializations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models/best-for/{query_type}", response_model=List[Dict[str, Any]])
async def get_best_models_for_query_type(
    query_type: str,
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Get best models for a specific query type"""
    try:
        # Validate query type
        try:
            query_type_enum = QueryType(query_type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid query type: {query_type}")
        
        best_models = router.specialization_registry.get_best_models_for_query_type(query_type_enum)
        
        return [
            {
                "provider_type": spec.provider_type.value,
                "model_name": spec.model_name,
                "quality_score": spec.quality_score,
                "cost_per_1k_tokens": spec.cost_per_1k_tokens,
                "average_response_time": spec.average_response_time,
                "supports_streaming": spec.supports_streaming,
                "supports_functions": spec.supports_functions
            }
            for spec in best_models
        ]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting best models for query type: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/circuit-breakers", response_model=Dict[str, Any])
async def get_circuit_breaker_status(
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Get circuit breaker status for all instances"""
    try:
        circuit_status = {}
        
        for instance_id, circuit_breaker in router.circuit_breakers.items():
            circuit_status[instance_id] = {
                "state": circuit_breaker.state.value,
                "failure_count": circuit_breaker.failure_count,
                "success_count": circuit_breaker.success_count,
                "last_failure_time": circuit_breaker.last_failure_time.isoformat(),
                "timeout": circuit_breaker.timeout,
                "failure_threshold": circuit_breaker.failure_threshold,
                "success_threshold": circuit_breaker.success_threshold
            }
        
        return {
            "circuit_breakers": circuit_status,
            "total_instances": len(circuit_status),
            "open_circuits": len([cb for cb in router.circuit_breakers.values() 
                                 if cb.state.value == "open"]),
            "half_open_circuits": len([cb for cb in router.circuit_breakers.values() 
                                     if cb.state.value == "half_open"])
        }
        
    except Exception as e:
        logger.error(f"Error getting circuit breaker status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/circuit-breakers/update")
async def update_circuit_breaker(
    request: CircuitBreakerUpdate,
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Update circuit breaker state for an instance"""
    try:
        if request.instance_id not in router.circuit_breakers:
            router.circuit_breakers[request.instance_id] = router.circuit_breakers.__class__()
        
        circuit_breaker = router.circuit_breakers[request.instance_id]
        
        if request.action == "reset":
            circuit_breaker.state = circuit_breaker.__class__.CLOSED
            circuit_breaker.failure_count = 0
            circuit_breaker.success_count = 0
            message = f"Circuit breaker for {request.instance_id} reset"
            
        elif request.action == "open":
            circuit_breaker.state = circuit_breaker.__class__.OPEN
            circuit_breaker.last_failure_time = datetime.utcnow()
            message = f"Circuit breaker for {request.instance_id} manually opened"
            
        elif request.action == "close":
            circuit_breaker.state = circuit_breaker.__class__.CLOSED
            circuit_breaker.failure_count = 0
            circuit_breaker.success_count = 0
            message = f"Circuit breaker for {request.instance_id} manually closed"
            
        else:
            raise HTTPException(status_code=400, detail=f"Invalid action: {request.action}")
        
        logger.info(f"{message}. Reason: {request.reason or 'Manual intervention'}")
        
        return {
            "success": True,
            "message": message,
            "instance_id": request.instance_id,
            "new_state": circuit_breaker.state.value
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating circuit breaker: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/feedback")
async def submit_routing_feedback(
    request: FeedbackRequest,
    background_tasks: BackgroundTasks,
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Submit feedback for routing decision to improve future routing"""
    try:
        # Update routing metrics
        background_tasks.add_task(
            router.update_routing_metrics,
            instance_id=request.instance_id,
            success=request.success,
            response_time=request.response_time,
            cost=request.actual_cost or 0.0
        )
        
        # Log feedback for analysis
        feedback_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "query_id": request.query_id,
            "instance_id": request.instance_id,
            "success": request.success,
            "response_time": request.response_time,
            "actual_cost": request.actual_cost,
            "user_satisfaction": request.user_satisfaction,
            "feedback_text": request.feedback_text
        }
        
        logger.info(f"Routing feedback received: {feedback_data}")
        
        # Store feedback in Redis if available
        if router.redis_client:
            import json
            await router.redis_client.lpush(
                "routing_feedback",
                json.dumps(feedback_data)
            )
            await router.redis_client.ltrim("routing_feedback", 0, 999)
        
        return {
            "success": True,
            "message": "Feedback submitted successfully",
            "query_id": request.query_id
        }
        
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config", response_model=Dict[str, Any])
async def get_routing_config(
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Get current routing configuration"""
    try:
        return {
            "default_strategy": router.default_strategy.value,
            "max_alternatives": router.max_alternatives,
            "routing_timeout": router.routing_timeout,
            "cache_ttl": router.cache_ttl,
            "cache_size": len(router.routing_cache),
            "active_circuit_breakers": len(router.circuit_breakers)
        }
        
    except Exception as e:
        logger.error(f"Error getting routing config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/config")
async def update_routing_config(
    config_update: RoutingConfigUpdate,
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Update routing configuration"""
    try:
        updates = {}
        
        if config_update.default_strategy is not None:
            router.default_strategy = config_update.default_strategy
            updates["default_strategy"] = config_update.default_strategy.value
        
        if config_update.max_alternatives is not None:
            router.max_alternatives = config_update.max_alternatives
            updates["max_alternatives"] = config_update.max_alternatives
        
        if config_update.routing_timeout is not None:
            router.routing_timeout = config_update.routing_timeout
            updates["routing_timeout"] = config_update.routing_timeout
        
        if config_update.cache_ttl is not None:
            router.cache_ttl = config_update.cache_ttl
            updates["cache_ttl"] = config_update.cache_ttl
        
        logger.info(f"Routing configuration updated: {updates}")
        
        return {
            "success": True,
            "message": "Configuration updated successfully",
            "updates": updates,
            "current_config": {
                "default_strategy": router.default_strategy.value,
                "max_alternatives": router.max_alternatives,
                "routing_timeout": router.routing_timeout,
                "cache_ttl": router.cache_ttl
            }
        }
        
    except Exception as e:
        logger.error(f"Error updating routing config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cache")
async def clear_routing_cache(
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Clear routing cache"""
    try:
        cache_size = len(router.routing_cache)
        router.routing_cache.clear()
        
        logger.info(f"Routing cache cleared. Removed {cache_size} entries.")
        
        return {
            "success": True,
            "message": f"Routing cache cleared. Removed {cache_size} entries.",
            "cache_size_cleared": cache_size
        }
        
    except Exception as e:
        logger.error(f"Error clearing routing cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def router_health_check(
    router: IntelligentQueryRouter = Depends(get_router)
):
    """Health check for the intelligent router"""
    try:
        # Check basic functionality
        test_analysis = await router.classifier.analyze_query(
            "Hello, this is a health check."
        )
        
        # Get basic stats
        stats = await router.get_routing_statistics()
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "test_analysis_success": test_analysis.query_id is not None,
            "cache_size": len(router.routing_cache),
            "active_instances": len(router.routing_metrics),
            "circuit_breakers": len(router.circuit_breakers),
            "total_routing_decisions": stats.get("total_routing_decisions", 0)
        }
        
    except Exception as e:
        logger.error(f"Router health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }