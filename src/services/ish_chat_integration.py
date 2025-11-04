"""
ISH Chat Integration Service - Connects Instance Manager with existing ISH Chat backend
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from sqlalchemy.orm import Session

from .instance_manager_service import InstanceManagerService, InstanceSelectionCriteria
from .load_balancer_service import LoadBalancerService
from .enhanced_ai_service import EnhancedAIService  # Existing service
from .ai_service import AIService  # Existing service

logger = logging.getLogger(__name__)

@dataclass
class AIRequest:
    """AI request from ISH Chat"""
    prompt: str
    provider_preference: Optional[str] = None
    model_preference: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None

@dataclass
class AIResponse:
    """AI response for ISH Chat"""
    content: str
    provider: str
    model: str
    instance_id: str
    response_time: float
    tokens_used: int
    success: bool
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = None

class ISHChatIntegrationService:
    """Service for integrating Instance Manager with ISH Chat backend"""
    
    def __init__(
        self,
        instance_manager: InstanceManagerService,
        load_balancer: LoadBalancerService,
        enhanced_ai_service: EnhancedAIService,
        legacy_ai_service: AIService
    ):
        self.instance_manager = instance_manager
        self.load_balancer = load_balancer
        self.enhanced_ai_service = enhanced_ai_service
        self.legacy_ai_service = legacy_ai_service
        
        # Configuration
        self.enable_instance_manager = True
        self.fallback_to_legacy = True
        self.default_provider = "zai"
        self.default_model = "glm-4"
        
        # Request routing
        self.request_timeout = 60
        self.max_retries = 2
        
    async def process_ai_request(
        self,
        request: AIRequest,
        db: Session
    ) -> AIResponse:
        """Process AI request using Instance Manager if available"""
        
        start_time = datetime.utcnow()
        
        try:
            # Try Instance Manager first if enabled
            if self.enable_instance_manager:
                try:
                    response = await self._process_with_instance_manager(request, db)
                    
                    # Log successful request
                    await self._log_request(request, response, start_time, db)
                    
                    return response
                    
                except Exception as e:
                    logger.warning(f"Instance Manager request failed: {e}")
                    
                    # Fallback to legacy service if enabled
                    if self.fallback_to_legacy:
                        logger.info("Falling back to legacy AI service")
                        return await self._process_with_legacy_service(request, start_time, db)
                    else:
                        raise e
            
            # Use legacy service if Instance Manager is disabled
            else:
                return await self._process_with_legacy_service(request, start_time, db)
                
        except Exception as e:
            logger.error(f"AI request processing failed: {e}")
            
            # Return error response
            return AIResponse(
                content="",
                provider="error",
                model="error",
                instance_id="error",
                response_time=0,
                tokens_used=0,
                success=False,
                error_message=str(e)
            )
    
    async def _process_with_instance_manager(
        self,
        request: AIRequest,
        db: Session
    ) -> AIResponse:
        """Process request using Instance Manager"""
        
        # Determine provider and model
        provider_type = request.provider_preference or self.default_provider
        model_name = request.model_preference or self.default_model
        
        # Route request to best instance
        routing = await self.load_balancer.route_request(
            db=db,
            provider_type=provider_type,
            model_name=model_name,
            request_data={
                "provider_type": provider_type,
                "model_name": model_name,
                "prompt": request.prompt,
                "user_id": request.user_id,
                "session_id": request.session_id
            },
            user_id=request.user_id,
            session_id=request.session_id
        )
        
        # Get selected instance
        instance = await self.instance_manager.get_instance(db, routing.instance_id)
        if not instance:
            raise ValueError(f"Instance not found: {routing.instance_id}")
        
        # Prepare request data
        request_data = {
            "prompt": request.prompt,
            "system_prompt": request.system_prompt,
            "temperature": request.temperature or instance.temperature,
            "max_tokens": request.max_tokens or instance.max_tokens,
            "provider": instance.provider_type,
            "model": instance.model_name,
            "api_key": instance.api_key,
            "endpoint_url": instance.endpoint_url
        }
        
        # Execute request with failover
        async def execute_request(instance, request_data):
            # Update instance load
            await self.instance_manager.update_instance_load(
                db, instance.instance_id, instance.current_load + 1
            )
            
            try:
                # Make actual AI request
                response = await self._make_ai_request(instance, request_data)
                return response
            finally:
                # Update instance load
                await self.instance_manager.update_instance_load(
                    db, instance.instance_id, max(0, instance.current_load - 1)
                )
        
        # Execute with load balancing and failover
        result, final_routing = await self.load_balancer.execute_request_with_failover(
            db=db,
            routing=routing,
            request_func=execute_request,
            request_data=request_data
        )
        
        # Create response
        response = AIResponse(
            content=result.get("content", ""),
            provider=final_routing.instance.provider_type,
            model=final_routing.instance.model_name,
            instance_id=final_routing.instance.instance_id,
            response_time=result.get("response_time", 0),
            tokens_used=result.get("tokens_used", 0),
            success=True,
            metadata={
                "routing_time": final_routing.routing_time,
                "was_failover": final_routing.was_failover,
                "routing_path": final_routing.routing_path
            }
        )
        
        return response
    
    async def _process_with_legacy_service(
        self,
        request: AIRequest,
        start_time: datetime,
        db: Session
    ) -> AIResponse:
        """Process request using legacy AI service"""
        
        try:
            # Determine which legacy service to use
            if hasattr(self.enhanced_ai_service, 'generate_response'):
                # Use enhanced AI service
                ai_result = await self.enhanced_ai_service.generate_response(
                    prompt=request.prompt,
                    provider_name=request.provider_preference,
                    system_prompt=request.system_prompt
                )
            else:
                # Use basic AI service
                ai_result = await self.legacy_ai_service.generate_response(
                    prompt=request.prompt,
                    provider_name=request.provider_preference,
                    system_prompt=request.system_prompt
                )
            
            # Calculate response time
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Create response
            response = AIResponse(
                content=ai_result.get("response", ""),
                provider=ai_result.get("provider", "legacy"),
                model=ai_result.get("model", "legacy"),
                instance_id="legacy",
                response_time=response_time,
                tokens_used=0,  # Legacy services might not track tokens
                success=ai_result.get("success", True),
                error_message=ai_result.get("error"),
                metadata={"legacy_service": True}
            )
            
            return response
            
        except Exception as e:
            # Calculate response time
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return AIResponse(
                content="",
                provider="legacy",
                model="legacy",
                instance_id="legacy",
                response_time=response_time,
                tokens_used=0,
                success=False,
                error_message=str(e),
                metadata={"legacy_service": True}
            )
    
    async def _make_ai_request(
        self,
        instance,
        request_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Make AI request to specific instance"""
        
        start_time = datetime.utcnow()
        
        try:
            # Use instance manager's test request method as base
            # This would typically make the actual API call
            
            if instance.provider_type == "anthropic":
                response_data = await self._make_anthropic_request(instance, request_data)
            elif instance.provider_type == "openai":
                response_data = await self._make_openai_request(instance, request_data)
            elif instance.provider_type == "zai":
                response_data = await self._make_zai_request(instance, request_data)
            elif instance.provider_type == "perplexity":
                response_data = await self._make_perplexity_request(instance, request_data)
            else:
                raise ValueError(f"Unsupported provider type: {instance.provider_type}")
            
            # Calculate response time
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return {
                "content": response_data.get("content", ""),
                "response_time": response_time,
                "tokens_used": response_data.get("tokens_used", 0),
                "success": True
            }
            
        except Exception as e:
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return {
                "content": "",
                "response_time": response_time,
                "tokens_used": 0,
                "success": False,
                "error": str(e)
            }
    
    async def _make_anthropic_request(self, instance, request_data):
        """Make Anthropic API request"""
        
        # This would implement the actual Anthropic API call
        # For now, return a mock response
        return {
            "content": f"Mock Anthropic response for: {request_data['prompt'][:50]}...",
            "tokens_used": 100
        }
    
    async def _make_openai_request(self, instance, request_data):
        """Make OpenAI API request"""
        
        # This would implement the actual OpenAI API call
        # For now, return a mock response
        return {
            "content": f"Mock OpenAI response for: {request_data['prompt'][:50]}...",
            "tokens_used": 120
        }
    
    async def _make_zai_request(self, instance, request_data):
        """Make ZAI API request"""
        
        # This would implement the actual ZAI API call
        # For now, return a mock response
        return {
            "content": f"Mock ZAI response for: {request_data['prompt'][:50]}...",
            "tokens_used": 150
        }
    
    async def _make_perplexity_request(self, instance, request_data):
        """Make Perplexity API request"""
        
        # This would implement the actual Perplexity API call
        # For now, return a mock response
        return {
            "content": f"Mock Perplexity response for: {request_data['prompt'][:50]}...",
            "tokens_used": 80
        }
    
    async def _log_request(
        self,
        request: AIRequest,
        response: AIResponse,
        start_time: datetime,
        db: Session
    ):
        """Log AI request and response"""
        
        try:
            # Create request log entry
            from ..models.instance_manager import RequestLog
            
            log_entry = RequestLog(
                request_id=f"ish_chat_{int(start_time.timestamp() * 1000)}",
                instance_id=response.instance_id,
                provider_type=response.provider,
                model_name=response.model,
                prompt_length=len(request.prompt),
                response_length=len(response.content),
                tokens_used=response.tokens_used,
                status="success" if response.success else "error",
                response_time=response.response_time,
                was_failover=response.metadata.get("was_failover", False) if response.metadata else False,
                user_id=request.user_id,
                session_id=request.session_id,
                metadata={
                    "ish_chat_request": True,
                    "provider_preference": request.provider_preference,
                    "model_preference": request.model_preference,
                    "routing_time": response.metadata.get("routing_time") if response.metadata else None
                },
                created_at=start_time,
                completed_at=datetime.utcnow()
            )
            
            db.add(log_entry)
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to log AI request: {e}")
    
    async def get_available_providers(self, db: Session) -> List[Dict[str, Any]]:
        """Get list of available AI providers"""
        
        providers = []
        
        # Get providers from Instance Manager
        if self.enable_instance_manager:
            instances = await self.instance_manager.list_instances(db, limit=100)
            
            provider_map = {}
            for instance in instances:
                if instance.provider_type not in provider_map:
                    provider_map[instance.provider_type] = {
                        "provider_type": instance.provider_type,
                        "available_instances": 0,
                        "healthy_instances": 0,
                        "models": [],
                        "enabled": True
                    }
                
                provider_map[instance.provider_type]["available_instances"] += 1
                
                if instance.is_healthy:
                    provider_map[instance.provider_type]["healthy_instances"] += 1
                
                if instance.model_name not in provider_map[instance.provider_type]["models"]:
                    provider_map[instance.provider_type]["models"].append(instance.model_name)
            
            providers.extend(provider_map.values())
        
        # Add legacy providers if fallback is enabled
        if self.fallback_to_legacy:
            legacy_providers = self.legacy_ai_service.get_available_providers()
            for provider in legacy_providers:
                providers.append({
                    "provider_type": provider,
                    "available_instances": 1,
                    "healthy_instances": 1,
                    "models": ["legacy"],
                    "enabled": True,
                    "legacy": True
                })
        
        return providers
    
    async def get_provider_status(self, db: Session) -> Dict[str, Any]:
        """Get status of all providers"""
        
        providers = await self.get_available_providers(db)
        
        total_providers = len(providers)
        healthy_providers = len([p for p in providers if p["healthy_instances"] > 0])
        
        return {
            "total_providers": total_providers,
            "healthy_providers": healthy_providers,
            "instance_manager_enabled": self.enable_instance_manager,
            "fallback_enabled": self.fallback_to_legacy,
            "providers": providers,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def update_configuration(
        self,
        enable_instance_manager: Optional[bool] = None,
        fallback_to_legacy: Optional[bool] = None,
        default_provider: Optional[str] = None,
        default_model: Optional[str] = None
    ):
        """Update integration configuration"""
        
        if enable_instance_manager is not None:
            self.enable_instance_manager = enable_instance_manager
        
        if fallback_to_legacy is not None:
            self.fallback_to_legacy = fallback_to_legacy
        
        if default_provider is not None:
            self.default_provider = default_provider
        
        if default_model is not None:
            self.default_model = default_model
        
        logger.info("ISH Chat integration configuration updated")
    
    async def get_integration_metrics(self, db: Session) -> Dict[str, Any]:
        """Get integration performance metrics"""
        
        # Get recent request logs
        from ..models.instance_manager import RequestLog
        from datetime import timedelta
        
        since_time = datetime.utcnow() - timedelta(hours=24)
        
        ish_chat_requests = db.query(RequestLog).filter(
            RequestLog.created_at >= since_time,
            RequestLog.metadata.isnot(None)
        ).all()
        
        # Calculate metrics
        total_requests = len(ish_chat_requests)
        successful_requests = len([r for r in ish_chat_requests if r.status == "success"])
        failover_requests = len([r for r in ish_chat_requests if r.was_failover])
        
        # Calculate average response time
        response_times = [r.response_time for r in ish_chat_requests if r.response_time is not None]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # Provider usage
        provider_usage = {}
        for request in ish_chat_requests:
            provider = request.provider_type
            if provider not in provider_usage:
                provider_usage[provider] = 0
            provider_usage[provider] += 1
        
        return {
            "total_requests_24h": total_requests,
            "successful_requests_24h": successful_requests,
            "success_rate_24h": (successful_requests / total_requests * 100) if total_requests > 0 else 0,
            "failover_requests_24h": failover_requests,
            "failover_rate_24h": (failover_requests / total_requests * 100) if total_requests > 0 else 0,
            "average_response_time_24h": avg_response_time,
            "provider_usage_24h": provider_usage,
            "instance_manager_enabled": self.enable_instance_manager,
            "fallback_enabled": self.fallback_to_legacy
        }