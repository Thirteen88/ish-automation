"""
Load Balancer Service for distributing requests across AI instances with failover
"""
import asyncio
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import json

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func

from .instance_manager_service import (
    InstanceManagerService, InstanceSelectionCriteria, LoadBalancingResult
)
from ..models.instance_manager import (
    AIInstance, RequestLog, LoadBalancerConfig, InstanceGroup,
    InstanceStatus, ProviderType
)
from ..database.database import get_db

logger = logging.getLogger(__name__)

class FailoverStrategy(Enum):
    """Failover strategies"""
    SEQUENTIAL = "sequential"  # Try instances in order
    PARALLEL = "parallel"  # Try multiple instances simultaneously
    HEALTH_BASED = "health_based"  # Prioritize healthiest instances
    REGION_BASED = "region_based"  # Prefer same region instances

class CircuitBreakerState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service has recovered

@dataclass
class RequestRouting:
    """Request routing information"""
    request_id: str
    instance_id: str
    routing_time: float
    strategy: str
    was_failover: bool = False
    original_instance_id: Optional[str] = None
    routing_path: List[str] = field(default_factory=list)

@dataclass
class FailoverConfig:
    """Failover configuration"""
    max_attempts: int = 3
    timeout_per_attempt: int = 30
    strategy: FailoverStrategy = FailoverStrategy.HEALTH_BASED
    enable_circuit_breaker: bool = True
    circuit_breaker_threshold: int = 5
    circuit_breaker_timeout: int = 60

@dataclass
class LoadBalancerMetrics:
    """Load balancer performance metrics"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    failover_requests: int = 0
    average_routing_time: float = 0.0
    instance_utilization: Dict[str, float] = field(default_factory=dict)
    circuit_breaker_activations: int = 0

class CircuitBreaker:
    """Circuit breaker for preventing cascading failures"""
    
    def __init__(self, threshold: int = 5, timeout: int = 60):
        self.threshold = threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitBreakerState.CLOSED
        self.lock = asyncio.Lock()
    
    async def call(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection"""
        
        async with self.lock:
            if self.state == CircuitBreakerState.OPEN:
                if self._should_attempt_reset():
                    self.state = CircuitBreakerState.HALF_OPEN
                    logger.info("Circuit breaker transitioning to HALF_OPEN")
                else:
                    raise Exception("Circuit breaker is OPEN")
        
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as e:
            await self._on_failure()
            raise e
    
    def _should_attempt_reset(self) -> bool:
        """Check if circuit breaker should attempt reset"""
        return (self.last_failure_time and 
                time.time() - self.last_failure_time >= self.timeout)
    
    async def _on_success(self):
        """Handle successful call"""
        async with self.lock:
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.state = CircuitBreakerState.CLOSED
                self.failure_count = 0
                logger.info("Circuit breaker reset to CLOSED")
    
    async def _on_failure(self):
        """Handle failed call"""
        async with self.lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.state = CircuitBreakerState.OPEN
                logger.warning("Circuit breaker OPEN from HALF_OPEN state")
            elif (self.state == CircuitBreakerState.CLOSED and 
                  self.failure_count >= self.threshold):
                self.state = CircuitBreakerState.OPEN
                logger.warning(f"Circuit breaker OPEN after {self.failure_count} failures")

class LoadBalancerService:
    """Service for load balancing requests across AI instances"""
    
    def __init__(
        self,
        instance_manager: InstanceManagerService,
        failover_config: FailoverConfig = None
    ):
        self.instance_manager = instance_manager
        self.failover_config = failover_config or FailoverConfig()
        self.metrics = LoadBalancerMetrics()
        self.circuit_breakers = {}  # instance_id -> CircuitBreaker
        self.routing_cache = {}
        self._cache_lock = asyncio.Lock()
        
    async def route_request(
        self,
        db: Session,
        provider_type: str,
        model_name: str,
        request_data: Dict[str, Any],
        user_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> RequestRouting:
        """Route a request to the best available instance"""
        
        start_time = time.time()
        request_id = str(uuid.uuid4())
        
        try:
            # Get routing strategy from config
            config = self._get_load_balancer_config(db, provider_type, model_name)
            strategy = self._parse_strategy(config.strategy) if config else LoadBalancingStrategy.HEALTH_BASED
            
            # Selection criteria
            criteria = InstanceSelectionCriteria(
                provider_type=provider_type,
                model_name=model_name,
                min_health_score=0.7,
                exclude_maintenance=True,
                require_active=True
            )
            
            # Select primary instance
            routing_result = await self.instance_manager.select_instance_for_request(
                db, criteria, strategy
            )
            
            selected_instance = routing_result.selected_instance
            routing_time = (time.time() - start_time) * 1000
            
            routing = RequestRouting(
                request_id=request_id,
                instance_id=selected_instance.instance_id,
                routing_time=routing_time,
                strategy=strategy.value,
                routing_path=[selected_instance.instance_id]
            )
            
            # Update metrics
            await self._update_routing_metrics(routing)
            
            # Log the routing decision
            await self._log_request_routing(db, routing, request_data, user_id, session_id)
            
            logger.info(f"Routed request {request_id} to {selected_instance.instance_id} "
                       f"({routing_result.selection_reason})")
            
            return routing
            
        except Exception as e:
            # Log failed routing
            routing_time = (time.time() - start_time) * 1000
            
            await self._log_failed_routing(
                db, request_id, provider_type, model_name, 
                str(e), routing_time, user_id, session_id
            )
            
            logger.error(f"Failed to route request {request_id}: {e}")
            raise
    
    async def execute_request_with_failover(
        self,
        db: Session,
        routing: RequestRouting,
        request_func: callable,
        request_data: Dict[str, Any]
    ) -> Tuple[Any, RequestRouting]:
        """Execute request with automatic failover"""
        
        start_time = time.time()
        attempt = 0
        last_error = None
        
        while attempt < self.failover_config.max_attempts:
            attempt += 1
            
            try:
                # Get current instance
                instance = await self.instance_manager.get_instance(db, routing.instance_id)
                if not instance:
                    raise ValueError(f"Instance not found: {routing.instance_id}")
                
                # Check circuit breaker
                circuit_breaker = self._get_circuit_breaker(instance.instance_id)
                
                # Execute request with circuit breaker protection
                result = await circuit_breaker.call(
                    self._execute_single_request,
                    instance, request_func, request_data
                )
                
                # Success - log and return
                await self._log_request_success(
                    db, routing.request_id, instance.instance_id,
                    (time.time() - start_time) * 1000
                )
                
                self.metrics.successful_requests += 1
                
                return result, routing
                
            except Exception as e:
                last_error = e
                logger.warning(f"Request {routing.request_id} failed on "
                             f"{routing.instance_id} (attempt {attempt}): {e}")
                
                # Try failover to alternative instance
                if attempt < self.failover_config.max_attempts:
                    failover_routing = await self._attempt_failover(
                        db, routing, request_data
                    )
                    
                    if failover_routing:
                        routing = failover_routing
                        routing.was_failover = True
                        routing.routing_path.append(routing.instance_id)
                        self.metrics.failover_requests += 1
                        continue
                
                # No more alternatives or max attempts reached
                break
        
        # All attempts failed
        await self._log_request_failure(
            db, routing.request_id, routing.instance_id,
            str(last_error), (time.time() - start_time) * 1000
        )
        
        self.metrics.failed_requests += 1
        raise last_error
    
    async def _execute_single_request(
        self,
        instance: AIInstance,
        request_func: callable,
        request_data: Dict[str, Any]
    ) -> Any:
        """Execute request on a single instance"""
        
        # Update instance load
        # This would typically be done via the instance manager
        # For now, we'll just call the request function
        
        return await request_func(instance, request_data)
    
    async def _attempt_failover(
        self,
        db: Session,
        current_routing: RequestRouting,
        request_data: Dict[str, Any]
    ) -> Optional[RequestRouting]:
        """Attempt to failover to an alternative instance"""
        
        try:
            # Get current instance to determine alternatives
            current_instance = await self.instance_manager.get_instance(
                db, current_routing.instance_id
            )
            
            if not current_instance:
                return None
            
            # Selection criteria for failover
            criteria = InstanceSelectionCriteria(
                provider_type=current_instance.provider_type,
                model_name=current_instance.model_name,
                min_health_score=0.6,  # Lower threshold for failover
                exclude_maintenance=True,
                require_active=True
            )
            
            # Exclude current instance from selection
            # This would require modifying the instance manager to support exclusion
            # For now, we'll select a new instance and check if it's different
            
            strategy = self._get_failover_strategy()
            
            routing_result = await self.instance_manager.select_instance_for_request(
                db, criteria, strategy
            )
            
            # Don't failover to the same instance
            if routing_result.selected_instance.instance_id == current_routing.instance_id:
                return None
            
            # Create new routing
            new_routing = RequestRouting(
                request_id=current_routing.request_id,
                instance_id=routing_result.selected_instance.instance_id,
                routing_time=routing_result.load_balancing_time,
                strategy=f"failover_{strategy.value}",
                was_failover=True,
                original_instance_id=current_routing.original_instance_id or current_routing.instance_id,
                routing_path=current_routing.routing_path + [routing_result.selected_instance.instance_id]
            )
            
            logger.info(f"Failing over request {current_routing.request_id} from "
                       f"{current_routing.instance_id} to {new_routing.instance_id}")
            
            return new_routing
            
        except Exception as e:
            logger.error(f"Failover attempt failed: {e}")
            return None
    
    def _get_failover_strategy(self) -> any:
        """Get load balancing strategy for failover"""
        from .instance_manager_service import LoadBalancingStrategy
        
        if self.failover_config.strategy == FailoverStrategy.SEQUENTIAL:
            return LoadBalancingStrategy.ROUND_ROBIN
        elif self.failover_config.strategy == FailoverStrategy.HEALTH_BASED:
            return LoadBalancingStrategy.HEALTH_BASED
        else:
            return LoadBalancingStrategy.LEAST_RESPONSE_TIME
    
    def _get_circuit_breaker(self, instance_id: str) -> CircuitBreaker:
        """Get or create circuit breaker for instance"""
        
        if instance_id not in self.circuit_breakers:
            self.circuit_breakers[instance_id] = CircuitBreaker(
                threshold=self.failover_config.circuit_breaker_threshold,
                timeout=self.failover_config.circuit_breaker_timeout
            )
        
        return self.circuit_breakers[instance_id]
    
    def _get_load_balancer_config(
        self,
        db: Session,
        provider_type: str,
        model_name: str
    ) -> Optional[LoadBalancerConfig]:
        """Get load balancer configuration for provider/model"""
        
        return db.query(LoadBalancerConfig).filter(
            LoadBalancerConfig.provider_type == provider_type,
            LoadBalancerConfig.model_name == model_name,
            LoadBalancerConfig.is_active == True
        ).first()
    
    def _parse_strategy(self, strategy_str: str) -> any:
        """Parse strategy string to enum"""
        from .instance_manager_service import LoadBalancingStrategy
        
        try:
            return LoadBalancingStrategy(strategy_str)
        except ValueError:
            return LoadBalancingStrategy.HEALTH_BASED
    
    async def _update_routing_metrics(self, routing: RequestRouting):
        """Update load balancer metrics"""
        
        self.metrics.total_requests += 1
        
        # Update average routing time
        if self.metrics.total_requests == 1:
            self.metrics.average_routing_time = routing.routing_time
        else:
            self.metrics.average_routing_time = (
                (self.metrics.average_routing_time * (self.metrics.total_requests - 1) + 
                 routing.routing_time) / self.metrics.total_requests
            )
        
        # Update instance utilization
        instance_id = routing.instance_id
        if instance_id not in self.metrics.instance_utilization:
            self.metrics.instance_utilization[instance_id] = 0
        
        self.metrics.instance_utilization[instance_id] += 1
    
    async def _log_request_routing(
        self,
        db: Session,
        routing: RequestRouting,
        request_data: Dict[str, Any],
        user_id: Optional[str],
        session_id: Optional[str]
    ):
        """Log request routing decision"""
        
        try:
            log_entry = RequestLog(
                request_id=routing.request_id,
                instance_id=routing.instance_id,
                provider_type=request_data.get("provider_type"),
                model_name=request_data.get("model_name"),
                prompt_length=len(str(request_data.get("prompt", ""))),
                status="routed",
                user_id=user_id,
                session_id=session_id,
                metadata={
                    "routing_time": routing.routing_time,
                    "strategy": routing.strategy,
                    "routing_path": routing.routing_path
                },
                created_at=datetime.utcnow()
            )
            
            db.add(log_entry)
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to log request routing: {e}")
    
    async def _log_request_success(
        self,
        db: Session,
        request_id: str,
        instance_id: str,
        response_time: float
    ):
        """Log successful request completion"""
        
        try:
            log_entry = db.query(RequestLog).filter(
                RequestLog.request_id == request_id
            ).first()
            
            if log_entry:
                log_entry.status = "success"
                log_entry.response_time = response_time
                log_entry.completed_at = datetime.utcnow()
                db.commit()
            
        except Exception as e:
            logger.error(f"Failed to log request success: {e}")
    
    async def _log_request_failure(
        self,
        db: Session,
        request_id: str,
        instance_id: str,
        error_message: str,
        response_time: float
    ):
        """Log failed request"""
        
        try:
            log_entry = db.query(RequestLog).filter(
                RequestLog.request_id == request_id
            ).first()
            
            if log_entry:
                log_entry.status = "error"
                log_entry.error_message = error_message
                log_entry.response_time = response_time
                log_entry.completed_at = datetime.utcnow()
                db.commit()
            
        except Exception as e:
            logger.error(f"Failed to log request failure: {e}")
    
    async def _log_failed_routing(
        self,
        db: Session,
        request_id: str,
        provider_type: str,
        model_name: str,
        error_message: str,
        routing_time: float,
        user_id: Optional[str],
        session_id: Optional[str]
    ):
        """Log failed routing attempt"""
        
        try:
            log_entry = RequestLog(
                request_id=request_id,
                instance_id="none",
                provider_type=provider_type,
                model_name=model_name,
                status="routing_failed",
                error_message=error_message,
                response_time=routing_time,
                user_id=user_id,
                session_id=session_id,
                metadata={"routing_failed": True},
                created_at=datetime.utcnow()
            )
            
            db.add(log_entry)
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to log failed routing: {e}")
    
    async def get_load_balancer_metrics(self) -> Dict[str, Any]:
        """Get current load balancer metrics"""
        
        # Calculate success rate
        success_rate = 0.0
        if self.metrics.total_requests > 0:
            success_rate = (self.metrics.successful_requests / self.metrics.total_requests) * 100
        
        # Calculate failover rate
        failover_rate = 0.0
        if self.metrics.total_requests > 0:
            failover_rate = (self.metrics.failover_requests / self.metrics.total_requests) * 100
        
        # Get circuit breaker status
        circuit_breaker_status = {}
        for instance_id, breaker in self.circuit_breakers.items():
            circuit_breaker_status[instance_id] = {
                "state": breaker.state.value,
                "failure_count": breaker.failure_count,
                "last_failure": breaker.last_failure_time
            }
        
        return {
            "total_requests": self.metrics.total_requests,
            "successful_requests": self.metrics.successful_requests,
            "failed_requests": self.metrics.failed_requests,
            "failover_requests": self.metrics.failover_requests,
            "success_rate": success_rate,
            "failover_rate": failover_rate,
            "average_routing_time": self.metrics.average_routing_time,
            "instance_utilization": self.metrics.instance_utilization,
            "circuit_breaker_status": circuit_breaker_status,
            "circuit_breaker_activations": self.metrics.circuit_breaker_activations,
            "active_circuit_breakers": len(self.circuit_breakers)
        }
    
    async def reset_metrics(self):
        """Reset load balancer metrics"""
        
        self.metrics = LoadBalancerMetrics()
        
        # Reset circuit breakers
        for breaker in self.circuit_breakers.values():
            async with breaker.lock:
                breaker.state = CircuitBreakerState.CLOSED
                breaker.failure_count = 0
                breaker.last_failure_time = None
        
        logger.info("Load balancer metrics reset")
    
    async def get_instance_utilization_report(
        self,
        db: Session,
        time_window_minutes: int = 60
    ) -> Dict[str, Any]:
        """Get detailed utilization report for instances"""
        
        since_time = datetime.utcnow() - timedelta(minutes=time_window_minutes)
        
        # Get request logs for the time window
        requests = db.query(RequestLog).filter(
            RequestLog.created_at >= since_time,
            RequestLog.status != "routing_failed"
        ).all()
        
        # Group by instance
        instance_stats = {}
        
        for request in requests:
            instance_id = request.instance_id
            
            if instance_id not in instance_stats:
                instance_stats[instance_id] = {
                    "total_requests": 0,
                    "successful_requests": 0,
                    "failed_requests": 0,
                    "total_response_time": 0.0,
                    "response_times": []
                }
            
            stats = instance_stats[instance_id]
            stats["total_requests"] += 1
            
            if request.status == "success":
                stats["successful_requests"] += 1
            else:
                stats["failed_requests"] += 1
            
            if request.response_time:
                stats["total_response_time"] += request.response_time
                stats["response_times"].append(request.response_time)
        
        # Calculate derived metrics
        for instance_id, stats in instance_stats.items():
            if stats["total_requests"] > 0:
                stats["success_rate"] = (stats["successful_requests"] / stats["total_requests"]) * 100
                stats["average_response_time"] = stats["total_response_time"] / stats["total_requests"]
                
                # Calculate percentiles
                if stats["response_times"]:
                    sorted_times = sorted(stats["response_times"])
                    n = len(sorted_times)
                    stats["p50_response_time"] = sorted_times[int(n * 0.5)]
                    stats["p95_response_time"] = sorted_times[int(n * 0.95)]
                    stats["p99_response_time"] = sorted_times[int(n * 0.99)]
            else:
                stats["success_rate"] = 0.0
                stats["average_response_time"] = 0.0
        
        return {
            "time_window_minutes": time_window_minutes,
            "total_instances": len(instance_stats),
            "instance_stats": instance_stats,
            "total_requests": sum(s["total_requests"] for s in instance_stats.values())
        }