"""
Instance Manager Service for managing multiple AI model instances
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import httpx
import redis
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func

from ..models.instance_manager import (
    AIInstance, HealthCheck, InstanceMetrics, ScalingEvent,
    LoadBalancerConfig, ProviderGroup, InstanceGroup, RequestLog,
    InstanceStatus, ProviderType
)
from ..database.database import get_db

logger = logging.getLogger(__name__)

@dataclass
class InstanceSelectionCriteria:
    """Criteria for selecting AI instances"""
    provider_type: Optional[str] = None
    model_name: Optional[str] = None
    min_health_score: float = 0.7
    max_response_time: Optional[float] = None
    preferred_region: Optional[str] = None
    exclude_maintenance: bool = True
    require_active: bool = True

@dataclass
class LoadBalancingResult:
    """Result of load balancing operation"""
    selected_instance: AIInstance
    selection_reason: str
    alternative_instances: List[AIInstance]
    total_healthy_instances: int
    load_balancing_time: float

class LoadBalancingStrategy(Enum):
    """Load balancing strategies"""
    ROUND_ROBIN = "round_robin"
    WEIGHTED = "weighted"
    LEAST_CONNECTIONS = "least_connections"
    LEAST_RESPONSE_TIME = "least_response_time"
    RANDOM = "random"
    HEALTH_BASED = "health_based"

class InstanceManagerService:
    """Main service for managing AI model instances"""
    
    def __init__(self, redis_client: redis.Redis = None):
        self.redis_client = redis_client
        self.http_client = httpx.AsyncClient(timeout=30)
        self._round_robin_counters = {}
        self._instance_locks = {}
        
    async def register_instance(
        self,
        db: Session,
        instance_data: Dict[str, Any]
    ) -> AIInstance:
        """Register a new AI instance"""
        
        # Generate unique instance ID if not provided
        instance_id = instance_data.get("instance_id") or f"{instance_data['provider_type']}_{uuid.uuid4().hex[:8]}"
        
        # Check if instance already exists
        existing = db.query(AIInstance).filter(
            AIInstance.instance_id == instance_id
        ).first()
        
        if existing:
            # Update existing instance
            for key, value in instance_data.items():
                if hasattr(existing, key) and key not in ["id", "instance_id", "created_at"]:
                    setattr(existing, key, value)
            existing.updated_at = datetime.utcnow()
            existing.status = InstanceStatus.STARTING
            db.commit()
            logger.info(f"Updated existing instance: {instance_id}")
            return existing
        
        # Create new instance
        instance = AIInstance(
            instance_id=instance_id,
            provider_type=instance_data["provider_type"],
            model_name=instance_data["model_name"],
            instance_name=instance_data.get("instance_name", f"{instance_data['provider_type']}-{instance_data['model_name']}"),
            endpoint_url=instance_data["endpoint_url"],
            api_key=instance_data.get("api_key"),
            region=instance_data.get("region"),
            version=instance_data.get("version"),
            max_concurrent_requests=instance_data.get("max_concurrent_requests", 10),
            max_tokens_per_minute=instance_data.get("max_tokens_per_minute", 10000),
            temperature=instance_data.get("temperature", 0.7),
            max_tokens=instance_data.get("max_tokens", 1000),
            timeout=instance_data.get("timeout", 30),
            tags=instance_data.get("tags", {}),
            metadata=instance_data.get("metadata", {}),
            priority=instance_data.get("priority", 1),
            status=InstanceStatus.STARTING
        )
        
        db.add(instance)
        db.commit()
        db.refresh(instance)
        
        logger.info(f"Registered new AI instance: {instance_id}")
        
        # Perform initial health check
        asyncio.create_task(self.perform_health_check(db, instance.instance_id))
        
        return instance
    
    async def deregister_instance(self, db: Session, instance_id: str) -> bool:
        """Deregister an AI instance"""
        instance = db.query(AIInstance).filter(
            AIInstance.instance_id == instance_id
        ).first()
        
        if not instance:
            logger.warning(f"Instance not found for deregistration: {instance_id}")
            return False
        
        # Mark as stopped
        instance.status = InstanceStatus.STOPPED
        instance.is_active = False
        instance.updated_at = datetime.utcnow()
        
        db.commit()
        
        logger.info(f"Deregistered AI instance: {instance_id}")
        return True
    
    async def get_instance(
        self,
        db: Session,
        instance_id: str
    ) -> Optional[AIInstance]:
        """Get AI instance by ID"""
        return db.query(AIInstance).filter(
            AIInstance.instance_id == instance_id
        ).first()
    
    async def list_instances(
        self,
        db: Session,
        provider_type: Optional[str] = None,
        status: Optional[str] = None,
        is_healthy: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[AIInstance]:
        """List AI instances with filtering"""
        query = db.query(AIInstance)
        
        if provider_type:
            query = query.filter(AIInstance.provider_type == provider_type)
        
        if status:
            query = query.filter(AIInstance.status == status)
        
        if is_healthy is not None:
            query = query.filter(AIInstance.is_healthy == is_healthy)
        
        return query.order_by(desc(AIInstance.priority), desc(AIInstance.updated_at)).offset(offset).limit(limit).all()
    
    async def select_instance_for_request(
        self,
        db: Session,
        criteria: InstanceSelectionCriteria,
        strategy: LoadBalancingStrategy = LoadBalancingStrategy.HEALTH_BASED
    ) -> LoadBalancingResult:
        """Select best instance for a request based on criteria and strategy"""
        
        start_time = datetime.utcnow()
        
        # Build base query
        query = db.query(AIInstance).filter(AIInstance.is_active == True)
        
        if criteria.provider_type:
            query = query.filter(AIInstance.provider_type == criteria.provider_type)
        
        if criteria.model_name:
            query = query.filter(AIInstance.model_name == criteria.model_name)
        
        if criteria.exclude_maintenance:
            query = query.filter(AIInstance.status != InstanceStatus.MAINTENANCE)
        
        if criteria.require_active:
            query = query.filter(AIInstance.status.in_([InstanceStatus.HEALTHY, InstanceStatus.STARTING]))
        
        # Get candidate instances
        candidates = query.all()
        
        # Filter by health and performance criteria
        filtered_candidates = []
        for instance in candidates:
            if criteria.max_response_time and instance.average_response_time > criteria.max_response_time:
                continue
            
            if instance.success_rate < criteria.min_health_score * 100:
                continue
            
            filtered_candidates.append(instance)
        
        if not filtered_candidates:
            logger.warning("No instances found matching criteria")
            raise ValueError("No available instances matching criteria")
        
        # Apply load balancing strategy
        selected_instance, reason = await self._apply_load_balancing_strategy(
            filtered_candidates, strategy, criteria
        )
        
        # Alternative instances for failover
        alternatives = [inst for inst in filtered_candidates if inst.instance_id != selected_instance.instance_id][:3]
        
        load_balancing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        return LoadBalancingResult(
            selected_instance=selected_instance,
            selection_reason=reason,
            alternative_instances=alternatives,
            total_healthy_instances=len(filtered_candidates),
            load_balancing_time=load_balancing_time
        )
    
    async def _apply_load_balancing_strategy(
        self,
        instances: List[AIInstance],
        strategy: LoadBalancingStrategy,
        criteria: InstanceSelectionCriteria
    ) -> Tuple[AIInstance, str]:
        """Apply specific load balancing strategy"""
        
        if strategy == LoadBalancingStrategy.ROUND_ROBIN:
            return self._round_robin_selection(instances)
        
        elif strategy == LoadBalancingStrategy.WEIGHTED:
            return self._weighted_selection(instances)
        
        elif strategy == LoadBalancingStrategy.LEAST_CONNECTIONS:
            return self._least_connections_selection(instances)
        
        elif strategy == LoadBalancingStrategy.LEAST_RESPONSE_TIME:
            return self._least_response_time_selection(instances)
        
        elif strategy == LoadBalancingStrategy.HEALTH_BASED:
            return self._health_based_selection(instances)
        
        else:  # RANDOM
            return self._random_selection(instances)
    
    def _round_robin_selection(self, instances: List[AIInstance]) -> Tuple[AIInstance, str]:
        """Round-robin selection"""
        key = f"rr_{instances[0].provider_type}_{instances[0].model_name}"
        
        if key not in self._round_robin_counters:
            self._round_robin_counters[key] = 0
        
        index = self._round_robin_counters[key] % len(instances)
        self._round_robin_counters[key] += 1
        
        selected = instances[index]
        return selected, f"Round-robin selection (index {index})"
    
    def _weighted_selection(self, instances: List[AIInstance]) -> Tuple[AIInstance, str]:
        """Weighted selection based on priority and success rate"""
        total_weight = sum(inst.priority * (inst.success_rate / 100) for inst in instances)
        
        if total_weight == 0:
            # Fallback to priority only
            total_weight = sum(inst.priority for inst in instances)
        
        import random
        r = random.uniform(0, total_weight)
        
        current_weight = 0
        for instance in instances:
            weight = instance.priority * (instance.success_rate / 100)
            current_weight += weight
            if r <= current_weight:
                return instance, f"Weighted selection (weight: {weight:.2f})"
        
        # Fallback to first instance
        return instances[0], "Weighted selection (fallback)"
    
    def _least_connections_selection(self, instances: List[AIInstance]) -> Tuple[AIInstance, str]:
        """Select instance with least current load"""
        selected = min(instances, key=lambda x: x.current_load)
        return selected, f"Least connections (load: {selected.current_load})"
    
    def _least_response_time_selection(self, instances: List[AIInstance]) -> Tuple[AIInstance, str]:
        """Select instance with lowest average response time"""
        # Filter out instances with no response time data
        valid_instances = [inst for inst in instances if inst.average_response_time > 0]
        
        if not valid_instances:
            # Fallback to first instance
            return instances[0], "Least response time (no data, fallback)"
        
        selected = min(valid_instances, key=lambda x: x.average_response_time)
        return selected, f"Least response time ({selected.average_response_time:.0f}ms)"
    
    def _health_based_selection(self, instances: List[AIInstance]) -> Tuple[AIInstance, str]:
        """Select instance based on combined health score"""
        def health_score(instance):
            score = 0.0
            
            # Success rate (40% weight)
            score += (instance.success_rate / 100) * 0.4
            
            # Health status (30% weight)
            if instance.is_healthy:
                score += 0.3
            
            # Response time (20% weight) - lower is better
            if instance.average_response_time > 0:
                # Normalize response time (assuming 5000ms as max acceptable)
                rt_score = max(0, 1 - (instance.average_response_time / 5000))
                score += rt_score * 0.2
            
            # Current load (10% weight) - lower is better
            if instance.max_concurrent_requests > 0:
                load_score = max(0, 1 - (instance.current_load / instance.max_concurrent_requests))
                score += load_score * 0.1
            
            return score
        
        selected = max(instances, key=health_score)
        score = health_score(selected)
        return selected, f"Health-based selection (score: {score:.3f})"
    
    def _random_selection(self, instances: List[AIInstance]) -> Tuple[AIInstance, str]:
        """Random selection"""
        import random
        selected = random.choice(instances)
        return selected, "Random selection"
    
    async def perform_health_check(
        self,
        db: Session,
        instance_id: str,
        check_type: str = "basic"
    ) -> HealthCheck:
        """Perform health check on an AI instance"""
        
        instance = await self.get_instance(db, instance_id)
        if not instance:
            raise ValueError(f"Instance not found: {instance_id}")
        
        start_time = datetime.utcnow()
        
        # Prepare test prompt
        test_prompt = "Respond with 'OK' if you are functioning properly."
        
        try:
            # Make health check request
            response_data = await self._make_test_request(instance, test_prompt)
            
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Update instance status
            instance.is_healthy = True
            instance.status = InstanceStatus.HEALTHY
            instance.last_health_check = datetime.utcnow()
            instance.last_success_response = datetime.utcnow()
            
            # Create health check record
            health_check = HealthCheck(
                instance_id=instance_id,
                status="healthy",
                response_time=response_time,
                test_prompt=test_prompt,
                test_response=response_data.get("response", ""),
                tokens_used=response_data.get("tokens_used", 0),
                check_type=check_type,
                check_score=100.0
            )
            
            logger.info(f"Health check passed for {instance_id} in {response_time:.0f}ms")
            
        except Exception as e:
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Update instance status
            instance.is_healthy = False
            instance.status = InstanceStatus.UNHEALTHY
            instance.last_health_check = datetime.utcnow()
            
            # Create health check record
            health_check = HealthCheck(
                instance_id=instance_id,
                status="unhealthy",
                response_time=response_time,
                error_message=str(e),
                test_prompt=test_prompt,
                check_type=check_type,
                check_score=0.0
            )
            
            logger.error(f"Health check failed for {instance_id}: {str(e)}")
        
        # Save health check
        db.add(health_check)
        db.commit()
        
        # Update instance metrics
        await self._update_instance_metrics(db, instance)
        
        # Cache health status in Redis
        if self.redis_client:
            cache_key = f"instance_health:{instance_id}"
            cache_data = {
                "is_healthy": instance.is_healthy,
                "last_check": instance.last_health_check.isoformat(),
                "response_time": response_time
            }
            self.redis_client.setex(
                cache_key,
                timedelta(minutes=5),
                json.dumps(cache_data)
            )
        
        return health_check
    
    async def _make_test_request(self, instance: AIInstance, test_prompt: str) -> Dict[str, Any]:
        """Make a test request to the AI instance"""
        
        headers = {
            "Content-Type": "application/json"
        }
        
        # Add authorization header
        if instance.api_key:
            if instance.provider_type == ProviderType.ANTHROPIC:
                headers["x-api-key"] = instance.api_key
                headers["anthropic-version"] = "2023-06-01"
            else:
                headers["Authorization"] = f"Bearer {instance.api_key}"
        
        # Prepare request data based on provider
        if instance.provider_type == ProviderType.ANTHROPIC:
            data = {
                "model": instance.model_name,
                "messages": [{"role": "user", "content": test_prompt}],
                "max_tokens": 10
            }
            endpoint = f"{instance.endpoint_url}/messages"
        else:
            # OpenAI/ZAI compatible format
            data = {
                "model": instance.model_name,
                "messages": [
                    {"role": "system", "content": "Health check - respond briefly."},
                    {"role": "user", "content": test_prompt}
                ],
                "temperature": 0.1,
                "max_tokens": 10
            }
            endpoint = f"{instance.endpoint_url}/chat/completions"
        
        # Make request
        response = await self.http_client.post(
            endpoint,
            headers=headers,
            json=data,
            timeout=instance.timeout
        )
        response.raise_for_status()
        
        result = response.json()
        
        # Extract response based on provider
        if instance.provider_type == ProviderType.ANTHROPIC:
            response_text = result.get("content", [{}])[0].get("text", "")
            tokens_used = result.get("usage", {}).get("input_tokens", 0) + result.get("usage", {}).get("output_tokens", 0)
        else:
            response_text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            tokens_used = result.get("usage", {}).get("total_tokens", 0)
        
        return {
            "response": response_text,
            "tokens_used": tokens_used,
            "raw_response": result
        }
    
    async def _update_instance_metrics(self, db: Session, instance: AIInstance):
        """Update instance metrics based on recent data"""
        
        # Get recent health checks
        recent_checks = db.query(HealthCheck).filter(
            HealthCheck.instance_id == instance.instance_id,
            HealthCheck.created_at >= datetime.utcnow() - timedelta(hours=1)
        ).all()
        
        if recent_checks:
            # Calculate success rate
            successful_checks = len([c for c in recent_checks if c.status == "healthy"])
            instance.success_rate = (successful_checks / len(recent_checks)) * 100
            
            # Calculate average response time
            response_times = [c.response_time for c in recent_checks if c.response_time is not None]
            if response_times:
                instance.average_response_time = sum(response_times) / len(response_times)
        
        db.commit()
    
    async def update_instance_load(
        self,
        db: Session,
        instance_id: str,
        current_load: int
    ) -> bool:
        """Update current load for an instance"""
        
        instance = await self.get_instance(db, instance_id)
        if not instance:
            return False
        
        instance.current_load = current_load
        instance.updated_at = datetime.utcnow()
        
        db.commit()
        
        # Check if scaling is needed
        if instance.current_load >= instance.max_concurrent_requests * 0.8:
            await self._trigger_scale_up_check(db, instance)
        
        return True
    
    async def _trigger_scale_up_check(self, db: Session, instance: AIInstance):
        """Check if instance should scale up"""
        
        # Check if we're in cooldown period
        if instance.last_scaled_at:
            cooldown_period = timedelta(minutes=5)
            if datetime.utcnow() - instance.last_scaled_at < cooldown_period:
                return
        
        # Create scaling event
        scaling_event = ScalingEvent(
            instance_id=instance.instance_id,
            event_type="scale_up_check",
            trigger_reason="load_threshold",
            trigger_metric="current_load",
            trigger_value=instance.current_load,
            threshold_value=instance.max_concurrent_requests * 0.8,
            status="pending"
        )
        
        db.add(scaling_event)
        db.commit()
        
        # In a real implementation, this would trigger actual scaling
        logger.info(f"Scale up check triggered for {instance.instance_id}")
    
    async def get_instance_metrics(
        self,
        db: Session,
        instance_id: str,
        time_window: int = 300  # 5 minutes
    ) -> Dict[str, Any]:
        """Get performance metrics for an instance"""
        
        instance = await self.get_instance(db, instance_id)
        if not instance:
            raise ValueError(f"Instance not found: {instance_id}")
        
        # Get recent metrics
        since_time = datetime.utcnow() - timedelta(seconds=time_window)
        
        recent_health_checks = db.query(HealthCheck).filter(
            HealthCheck.instance_id == instance_id,
            HealthCheck.created_at >= since_time
        ).all()
        
        recent_requests = db.query(RequestLog).filter(
            RequestLog.instance_id == instance_id,
            RequestLog.created_at >= since_time
        ).all()
        
        # Calculate metrics
        total_requests = len(recent_requests)
        successful_requests = len([r for r in recent_requests if r.status == "success"])
        failed_requests = len([r for r in recent_requests if r.status == "error"])
        
        success_rate = (successful_requests / total_requests * 100) if total_requests > 0 else 0
        
        response_times = [r.response_time for r in recent_requests if r.response_time is not None]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # Health check metrics
        health_checks_passed = len([c for c in recent_health_checks if c.status == "healthy"])
        health_check_success_rate = (health_checks_passed / len(recent_health_checks) * 100) if recent_health_checks else 0
        
        return {
            "instance_id": instance_id,
            "time_window_seconds": time_window,
            "total_requests": total_requests,
            "successful_requests": successful_requests,
            "failed_requests": failed_requests,
            "success_rate": success_rate,
            "average_response_time_ms": avg_response_time,
            "current_load": instance.current_load,
            "max_concurrent_requests": instance.max_concurrent_requests,
            "health_check_success_rate": health_check_success_rate,
            "is_healthy": instance.is_healthy,
            "status": instance.status,
            "last_health_check": instance.last_health_check.isoformat() if instance.last_health_check else None
        }
    
    async def cleanup_old_data(self, db: Session, days_to_keep: int = 30):
        """Clean up old data to prevent database bloat"""
        
        cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)
        
        # Clean up old health checks
        deleted_health_checks = db.query(HealthCheck).filter(
            HealthCheck.created_at < cutoff_date
        ).delete()
        
        # Clean up old request logs
        deleted_request_logs = db.query(RequestLog).filter(
            RequestLog.created_at < cutoff_date
        ).delete()
        
        # Clean up old instance metrics
        deleted_metrics = db.query(InstanceMetrics).filter(
            InstanceMetrics.timestamp < cutoff_date
        ).delete()
        
        db.commit()
        
        logger.info(f"Cleaned up old data: {deleted_health_checks} health checks, "
                   f"{deleted_request_logs} request logs, {deleted_metrics} metrics")
        
        return {
            "health_checks_deleted": deleted_health_checks,
            "request_logs_deleted": deleted_request_logs,
            "metrics_deleted": deleted_metrics
        }