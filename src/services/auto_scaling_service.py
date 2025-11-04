"""
Auto-Scaling Service for dynamic management of AI instance capacity
"""
import asyncio
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import statistics

from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from .instance_manager_service import InstanceManagerService
from .health_monitoring_service import HealthMonitoringService
from ..models.instance_manager import (
    AIInstance, ProviderGroup, ScalingEvent, InstanceMetrics,
    InstanceStatus, ProviderType
)
from ..database.database import get_db

logger = logging.getLogger(__name__)

class ScalingDirection(Enum):
    """Scaling direction"""
    SCALE_UP = "scale_up"
    SCALE_DOWN = "scale_down"
    MAINTAIN = "maintain"

class ScalingTriggerReason(Enum):
    """Reasons for triggering scaling"""
    HIGH_LOAD = "high_load"
    LOW_LOAD = "low_load"
    HIGH_ERROR_RATE = "high_error_rate"
    HIGH_RESPONSE_TIME = "high_response_time"
    QUEUE_BACKLOG = "queue_backlog"
    SCHEDULED = "scheduled"
    MANUAL = "manual"
    HEALTH_ISSUES = "health_issues"

@dataclass
class ScalingPolicy:
    """Auto-scaling policy configuration"""
    min_instances: int = 1
    max_instances: int = 10
    desired_instances: int = 2
    
    # Load thresholds
    scale_up_threshold: float = 0.8  # 80% load
    scale_down_threshold: float = 0.2  # 20% load
    
    # Performance thresholds
    max_response_time: float = 5000.0  # 5 seconds
    max_error_rate: float = 0.1  # 10%
    min_success_rate: float = 0.95  # 95%
    
    # Cooldown periods
    scale_up_cooldown: int = 300  # 5 minutes
    scale_down_cooldown: int = 600  # 10 minutes
    
    # Evaluation settings
    evaluation_interval: int = 60  # 1 minute
    metrics_window: int = 300  # 5 minutes
    
    # Advanced settings
    enable_predictive_scaling: bool = False
    enable_queue_based_scaling: bool = True
    enable_health_based_scaling: bool = True

@dataclass
class ScalingDecision:
    """Auto-scaling decision"""
    direction: ScalingDirection
    reason: ScalingTriggerReason
    current_instances: int
    target_instances: int
    confidence: float  # 0.0 to 1.0
    metrics: Dict[str, float]
    recommendation: str
    estimated_cost_impact: float

@dataclass
class ScalingMetrics:
    """Metrics used for scaling decisions"""
    avg_load: float
    max_load: float
    avg_response_time: float
    p95_response_time: float
    error_rate: float
    success_rate: float
    queue_length: int
    requests_per_minute: float
    cost_per_request: float
    health_score: float

class AutoScalingService:
    """Service for automatic scaling of AI instances"""
    
    def __init__(
        self,
        instance_manager: InstanceManagerService,
        health_monitor: HealthMonitoringService,
        default_policy: ScalingPolicy = None
    ):
        self.instance_manager = instance_manager
        self.health_monitor = health_monitor
        self.default_policy = default_policy or ScalingPolicy()
        self._scaling_tasks = {}
        self._running = False
        self._scaling_history = {}
        
    async def start_auto_scaling(self, db: Session):
        """Start auto-scaling for all provider groups"""
        
        if self._running:
            logger.warning("Auto-scaling is already running")
            return
        
        self._running = True
        
        # Get all active provider groups
        groups = db.query(ProviderGroup).filter(
            ProviderGroup.is_active == True,
            ProviderGroup.auto_scaling_enabled == True
        ).all()
        
        # Start scaling task for each group
        for group in groups:
            await self.start_group_scaling(db, group.id)
        
        logger.info(f"Started auto-scaling for {len(groups)} provider groups")
    
    async def stop_auto_scaling(self):
        """Stop auto-scaling"""
        
        self._running = False
        
        # Cancel all scaling tasks
        for group_id, task in self._scaling_tasks.items():
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self._scaling_tasks.clear()
        logger.info("Stopped auto-scaling")
    
    async def start_group_scaling(self, db: Session, group_id: int):
        """Start auto-scaling for a specific provider group"""
        
        if group_id in self._scaling_tasks:
            logger.warning(f"Group {group_id} is already being managed by auto-scaling")
            return
        
        # Create scaling task
        task = asyncio.create_task(self._auto_scaling_loop(db, group_id))
        self._scaling_tasks[group_id] = task
        
        logger.info(f"Started auto-scaling for provider group: {group_id}")
    
    async def stop_group_scaling(self, group_id: int):
        """Stop auto-scaling for a specific provider group"""
        
        if group_id not in self._scaling_tasks:
            logger.warning(f"Group {group_id} is not being managed by auto-scaling")
            return
        
        # Cancel scaling task
        task = self._scaling_tasks[group_id]
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        del self._scaling_tasks[group_id]
        logger.info(f"Stopped auto-scaling for provider group: {group_id}")
    
    async def _auto_scaling_loop(self, db: Session, group_id: int):
        """Main auto-scaling loop for a provider group"""
        
        while self._running:
            try:
                # Get provider group
                group = db.query(ProviderGroup).filter(
                    ProviderGroup.id == group_id
                ).first()
                
                if not group or not group.is_active or not group.auto_scaling_enabled:
                    logger.info(f"Provider group {group_id} is no longer active, stopping auto-scaling")
                    break
                
                # Get scaling policy
                policy = self._get_scaling_policy(db, group)
                
                # Evaluate scaling decision
                decision = await self._evaluate_scaling_decision(db, group, policy)
                
                # Execute scaling if needed
                if decision.direction != ScalingDirection.MAINTAIN:
                    await self._execute_scaling_decision(db, group, decision)
                
                # Wait for next evaluation
                await asyncio.sleep(policy.evaluation_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in auto-scaling loop for group {group_id}: {e}")
                await asyncio.sleep(30)  # Brief pause before retrying
        
        # Clean up when loop ends
        if group_id in self._scaling_tasks:
            del self._scaling_tasks[group_id]
    
    def _get_scaling_policy(self, db: Session, group: ProviderGroup) -> ScalingPolicy:
        """Get scaling policy for a provider group"""
        
        # Start with default policy
        policy = ScalingPolicy(
            min_instances=group.min_instances,
            max_instances=group.max_instances,
            desired_instances=group.desired_instances,
            scale_up_threshold=group.scale_up_threshold,
            scale_down_threshold=group.scale_down_threshold,
            scale_up_cooldown=group.scale_up_cooldown,
            scale_down_cooldown=group.scale_down_cooldown
        )
        
        # In a real implementation, you might load custom policies from database
        # For now, we'll use the group configuration and defaults
        
        return policy
    
    async def _evaluate_scaling_decision(
        self,
        db: Session,
        group: ProviderGroup,
        policy: ScalingPolicy
    ) -> ScalingDecision:
        """Evaluate whether scaling is needed"""
        
        # Get current instances for the group
        current_instances = await self._get_group_instances(db, group)
        current_count = len([i for i in current_instances if i.is_active])
        
        # Collect metrics
        metrics = await self._collect_scaling_metrics(db, current_instances, policy)
        
        # Check cooldown periods
        if await self._is_in_cooldown(db, group, ScalingDirection.SCALE_UP, policy):
            logger.debug(f"Group {group.id} is in scale-up cooldown")
            return self._create_maintain_decision(current_count, metrics, "scale_up_cooldown")
        
        if await self._is_in_cooldown(db, group, ScalingDirection.SCALE_DOWN, policy):
            logger.debug(f"Group {group.id} is in scale-down cooldown")
            return self._create_maintain_decision(current_count, metrics, "scale_down_cooldown")
        
        # Evaluate scaling triggers
        scaling_decisions = []
        
        # 1. Load-based scaling
        load_decision = self._evaluate_load_based_scaling(metrics, current_count, policy)
        scaling_decisions.append(load_decision)
        
        # 2. Performance-based scaling
        perf_decision = self._evaluate_performance_based_scaling(metrics, current_count, policy)
        scaling_decisions.append(perf_decision)
        
        # 3. Health-based scaling
        health_decision = self._evaluate_health_based_scaling(metrics, current_count, policy)
        scaling_decisions.append(health_decision)
        
        # 4. Queue-based scaling (if enabled)
        if policy.enable_queue_based_scaling:
            queue_decision = self._evaluate_queue_based_scaling(metrics, current_count, policy)
            scaling_decisions.append(queue_decision)
        
        # Select the most urgent scaling decision
        selected_decision = self._select_scaling_decision(scaling_decisions, current_count, policy)
        
        logger.info(f"Scaling evaluation for group {group.id}: {selected_decision.direction.value} "
                   f"({selected_decision.reason.value}) - {selected_decision.recommendation}")
        
        return selected_decision
    
    async def _get_group_instances(
        self,
        db: Session,
        group: ProviderGroup
    ) -> List[AIInstance]:
        """Get instances belonging to a provider group"""
        
        # This would typically query through instance_groups junction table
        # For now, we'll get instances by provider type and model
        
        return db.query(AIInstance).filter(
            AIInstance.provider_type == group.provider_type,
            AIInstance.is_active == True
        ).all()
    
    async def _collect_scaling_metrics(
        self,
        db: Session,
        instances: List[AIInstance],
        policy: ScalingPolicy
    ) -> ScalingMetrics:
        """Collect metrics for scaling decisions"""
        
        if not instances:
            return ScalingMetrics(
                avg_load=0.0, max_load=0.0, avg_response_time=0.0,
                p95_response_time=0.0, error_rate=0.0, success_rate=0.0,
                queue_length=0, requests_per_minute=0.0, cost_per_request=0.0,
                health_score=0.0
            )
        
        # Get recent metrics for all instances
        since_time = datetime.utcnow() - timedelta(seconds=policy.metrics_window)
        
        # Collect load metrics
        loads = [i.current_load / max(i.max_concurrent_requests, 1) for i in instances]
        avg_load = statistics.mean(loads)
        max_load = max(loads)
        
        # Collect performance metrics
        response_times = []
        error_count = 0
        total_requests = 0
        
        for instance in instances:
            # Get recent request logs
            recent_requests = db.query(RequestLog).filter(
                RequestLog.instance_id == instance.instance_id,
                RequestLog.created_at >= since_time
            ).all()
            
            for request in recent_requests:
                if request.response_time:
                    response_times.append(request.response_time)
                
                total_requests += 1
                if request.status == "error":
                    error_count += 1
        
        # Calculate performance metrics
        avg_response_time = statistics.mean(response_times) if response_times else 0.0
        p95_response_time = statistics.quantiles(response_times, n=20)[18] if len(response_times) >= 20 else (max(response_times) if response_times else 0.0)
        
        error_rate = (error_count / total_requests) if total_requests > 0 else 0.0
        success_rate = 1.0 - error_rate
        
        # Calculate requests per minute
        requests_per_minute = total_requests / (policy.metrics_window / 60.0)
        
        # Get health scores
        health_scores = []
        for instance in instances:
            health_report = await self.health_monitor.get_health_status(db, instance.instance_id)
            if health_report:
                health_scores.append(health_report.score)
        
        health_score = statistics.mean(health_scores) if health_scores else 0.0
        
        # Estimate queue length (simplified - would use actual queue metrics)
        queue_length = sum(max(0, i.current_load - i.max_concurrent_requests * 0.8) for i in instances)
        
        # Estimate cost per request (simplified)
        cost_per_request = 0.001  # Default estimate
        
        return ScalingMetrics(
            avg_load=avg_load,
            max_load=max_load,
            avg_response_time=avg_response_time,
            p95_response_time=p95_response_time,
            error_rate=error_rate,
            success_rate=success_rate,
            queue_length=int(queue_length),
            requests_per_minute=requests_per_minute,
            cost_per_request=cost_per_request,
            health_score=health_score
        )
    
    def _evaluate_load_based_scaling(
        self,
        metrics: ScalingMetrics,
        current_count: int,
        policy: ScalingPolicy
    ) -> ScalingDecision:
        """Evaluate load-based scaling triggers"""
        
        if metrics.avg_load >= policy.scale_up_threshold:
            # Scale up if load is high
            if current_count >= policy.max_instances:
                return self._create_maintain_decision(
                    current_count, metrics, "max_instances_reached"
                )
            
            # Calculate how many instances to add
            target_instances = min(
                policy.max_instances,
                int(current_count * (metrics.avg_load / policy.scale_up_threshold))
            )
            
            confidence = min(1.0, (metrics.avg_load - policy.scale_up_threshold) / 0.2)
            
            return ScalingDecision(
                direction=ScalingDirection.SCALE_UP,
                reason=ScalingTriggerReason.HIGH_LOAD,
                current_instances=current_count,
                target_instances=target_instances,
                confidence=confidence,
                metrics={
                    "avg_load": metrics.avg_load,
                    "threshold": policy.scale_up_threshold
                },
                recommendation=f"Scale up due to high load: {metrics.avg_load:.1%} >= {policy.scale_up_threshold:.1%}",
                estimated_cost_impact=(target_instances - current_count) * metrics.cost_per_request * 60  # hourly estimate
            )
        
        elif metrics.avg_load <= policy.scale_down_threshold and current_count > policy.min_instances:
            # Scale down if load is low
            target_instances = max(
                policy.min_instances,
                int(current_count * (metrics.avg_load / policy.scale_down_threshold))
            )
            
            confidence = min(1.0, (policy.scale_down_threshold - metrics.avg_load) / 0.1)
            
            return ScalingDecision(
                direction=ScalingDirection.SCALE_DOWN,
                reason=ScalingTriggerReason.LOW_LOAD,
                current_instances=current_count,
                target_instances=target_instances,
                confidence=confidence,
                metrics={
                    "avg_load": metrics.avg_load,
                    "threshold": policy.scale_down_threshold
                },
                recommendation=f"Scale down due to low load: {metrics.avg_load:.1%} <= {policy.scale_down_threshold:.1%}",
                estimated_cost_impact=(target_instances - current_count) * metrics.cost_per_request * 60
            )
        
        return self._create_maintain_decision(current_count, metrics, "load_normal")
    
    def _evaluate_performance_based_scaling(
        self,
        metrics: ScalingMetrics,
        current_count: int,
        policy: ScalingPolicy
    ) -> ScalingDecision:
        """Evaluate performance-based scaling triggers"""
        
        # Check response time
        if metrics.avg_response_time > policy.max_response_time:
            if current_count >= policy.max_instances:
                return self._create_maintain_decision(
                    current_count, metrics, "max_instances_reached"
                )
            
            target_instances = min(policy.max_instances, current_count + 1)
            confidence = min(1.0, metrics.avg_response_time / policy.max_response_time - 1)
            
            return ScalingDecision(
                direction=ScalingDirection.SCALE_UP,
                reason=ScalingTriggerReason.HIGH_RESPONSE_TIME,
                current_instances=current_count,
                target_instances=target_instances,
                confidence=confidence,
                metrics={
                    "avg_response_time": metrics.avg_response_time,
                    "threshold": policy.max_response_time
                },
                recommendation=f"Scale up due to high response time: {metrics.avg_response_time:.0f}ms > {policy.max_response_time:.0f}ms",
                estimated_cost_impact=(target_instances - current_count) * metrics.cost_per_request * 60
            )
        
        # Check error rate
        if metrics.error_rate > policy.max_error_rate:
            if current_count >= policy.max_instances:
                return self._create_maintain_decision(
                    current_count, metrics, "max_instances_reached"
                )
            
            target_instances = min(policy.max_instances, current_count + 1)
            confidence = min(1.0, metrics.error_rate / policy.max_error_rate - 1)
            
            return ScalingDecision(
                direction=ScalingDirection.SCALE_UP,
                reason=ScalingTriggerReason.HIGH_ERROR_RATE,
                current_instances=current_count,
                target_instances=target_instances,
                confidence=confidence,
                metrics={
                    "error_rate": metrics.error_rate,
                    "threshold": policy.max_error_rate
                },
                recommendation=f"Scale up due to high error rate: {metrics.error_rate:.1%} > {policy.max_error_rate:.1%}",
                estimated_cost_impact=(target_instances - current_count) * metrics.cost_per_request * 60
            )
        
        return self._create_maintain_decision(current_count, metrics, "performance_good")
    
    def _evaluate_health_based_scaling(
        self,
        metrics: ScalingMetrics,
        current_count: int,
        policy: ScalingPolicy
    ) -> ScalingDecision:
        """Evaluate health-based scaling triggers"""
        
        if not policy.enable_health_based_scaling:
            return self._create_maintain_decision(current_count, metrics, "health_scaling_disabled")
        
        # Scale up if health score is low
        if metrics.health_score < 70 and current_count < policy.max_instances:
            target_instances = min(policy.max_instances, current_count + 1)
            confidence = (70 - metrics.health_score) / 70
            
            return ScalingDecision(
                direction=ScalingDirection.SCALE_UP,
                reason=ScalingTriggerReason.HEALTH_ISSUES,
                current_instances=current_count,
                target_instances=target_instances,
                confidence=confidence,
                metrics={"health_score": metrics.health_score},
                recommendation=f"Scale up due to low health score: {metrics.health_score:.1f}",
                estimated_cost_impact=(target_instances - current_count) * metrics.cost_per_request * 60
            )
        
        return self._create_maintain_decision(current_count, metrics, "health_good")
    
    def _evaluate_queue_based_scaling(
        self,
        metrics: ScalingMetrics,
        current_count: int,
        policy: ScalingPolicy
    ) -> ScalingDecision:
        """Evaluate queue-based scaling triggers"""
        
        if metrics.queue_length > 10 and current_count < policy.max_instances:
            # Scale up based on queue backlog
            additional_instances = min(
                policy.max_instances - current_count,
                max(1, metrics.queue_length // 10)
            )
            target_instances = current_count + additional_instances
            confidence = min(1.0, metrics.queue_length / 50)
            
            return ScalingDecision(
                direction=ScalingDirection.SCALE_UP,
                reason=ScalingTriggerReason.QUEUE_BACKLOG,
                current_instances=current_count,
                target_instances=target_instances,
                confidence=confidence,
                metrics={"queue_length": metrics.queue_length},
                recommendation=f"Scale up due to queue backlog: {metrics.queue_length} requests",
                estimated_cost_impact=(target_instances - current_count) * metrics.cost_per_request * 60
            )
        
        return self._create_maintain_decision(current_count, metrics, "queue_normal")
    
    def _create_maintain_decision(
        self,
        current_count: int,
        metrics: ScalingMetrics,
        reason: str
    ) -> ScalingDecision:
        """Create a maintain (no scaling) decision"""
        
        return ScalingDecision(
            direction=ScalingDirection.MAINTAIN,
            reason=ScalingTriggerReason.HIGH_LOAD,  # Default reason
            current_instances=current_count,
            target_instances=current_count,
            confidence=1.0,
            metrics={},
            recommendation=f"No scaling needed: {reason}",
            estimated_cost_impact=0.0
        )
    
    def _select_scaling_decision(
        self,
        decisions: List[ScalingDecision],
        current_count: int,
        policy: ScalingPolicy
    ) -> ScalingDecision:
        """Select the most appropriate scaling decision from multiple candidates"""
        
        # Filter out maintain decisions
        active_decisions = [d for d in decisions if d.direction != ScalingDirection.MAINTAIN]
        
        if not active_decisions:
            # All decisions are to maintain
            return decisions[0]
        
        # Prioritize scale-up over scale-down for safety
        scale_up_decisions = [d for d in active_decisions if d.direction == ScalingDirection.SCALE_UP]
        scale_down_decisions = [d for d in active_decisions if d.direction == ScalingDirection.SCALE_DOWN]
        
        if scale_up_decisions:
            # Select scale-up decision with highest confidence
            selected = max(scale_up_decisions, key=lambda d: d.confidence)
            
            # Ensure we don't exceed max instances
            selected.target_instances = min(policy.max_instances, selected.target_instances)
            
            return selected
        elif scale_down_decisions:
            # Select scale-down decision with highest confidence
            selected = max(scale_down_decisions, key=lambda d: d.confidence)
            
            # Ensure we don't go below min instances
            selected.target_instances = max(policy.min_instances, selected.target_instances)
            
            return selected
        
        # Fallback to first decision
        return active_decisions[0]
    
    async def _is_in_cooldown(
        self,
        db: Session,
        group: ProviderGroup,
        direction: ScalingDirection,
        policy: ScalingPolicy
    ) -> bool:
        """Check if group is in cooldown period for scaling"""
        
        cooldown_seconds = (
            policy.scale_up_cooldown if direction == ScalingDirection.SCALE_UP
            else policy.scale_down_cooldown
        )
        
        # Get most recent scaling event for this direction
        last_event = db.query(ScalingEvent).filter(
            ScalingEvent.instance_id.in_(
                db.query(AIInstance.instance_id).filter(
                    AIInstance.provider_type == group.provider_type
                )
            ),
            ScalingEvent.event_type == direction.value,
            ScalingEvent.status == "completed"
        ).order_by(desc(ScalingEvent.completed_at)).first()
        
        if not last_event or not last_event.completed_at:
            return False
        
        cooldown_until = last_event.completed_at + timedelta(seconds=cooldown_seconds)
        return datetime.utcnow() < cooldown_until
    
    async def _execute_scaling_decision(
        self,
        db: Session,
        group: ProviderGroup,
        decision: ScalingDecision
    ):
        """Execute a scaling decision"""
        
        if decision.direction == ScalingDirection.MAINTAIN:
            return
        
        try:
            # Create scaling event record
            scaling_event = ScalingEvent(
                instance_id=f"group_{group.id}",  # Group-level scaling
                event_type=decision.direction.value,
                old_replicas=decision.current_instances,
                new_replicas=decision.target_instances,
                trigger_reason=decision.reason.value,
                trigger_metric="auto_scaling",
                trigger_value=decision.metrics.get(list(decision.metrics.keys())[0], 0),
                threshold_value=decision.metrics.get("threshold", 0),
                status="in_progress",
                started_at=datetime.utcnow()
            )
            
            db.add(scaling_event)
            db.commit()
            
            # Execute the scaling operation
            await self._perform_scaling_operation(db, group, decision)
            
            # Update scaling event
            scaling_event.status = "completed"
            scaling_event.completed_at = datetime.utcnow()
            db.commit()
            
            logger.info(f"Successfully executed scaling: {decision.direction.value} "
                       f"from {decision.current_instances} to {decision.target_instances} instances")
            
        except Exception as e:
            # Update scaling event with error
            if 'scaling_event' in locals():
                scaling_event.status = "failed"
                scaling_event.error_message = str(e)
                db.commit()
            
            logger.error(f"Failed to execute scaling decision: {e}")
            raise
    
    async def _perform_scaling_operation(
        self,
        db: Session,
        group: ProviderGroup,
        decision: ScalingDecision
    ):
        """Perform the actual scaling operation"""
        
        current_count = decision.current_instances
        target_count = decision.target_instances
        
        if decision.direction == ScalingDirection.SCALE_UP:
            # Scale up: create new instances
            instances_to_add = target_count - current_count
            
            for i in range(instances_to_add):
                # In a real implementation, this would provision new AI instances
                # For now, we'll simulate by creating database records
                
                instance_data = {
                    "provider_type": group.provider_type,
                    "model_name": "default-model",  # Would be determined by group configuration
                    "instance_name": f"{group.provider_type}-auto-{int(datetime.utcnow().timestamp())}",
                    "endpoint_url": "https://api.example.com/v1",  # Would be actual endpoint
                    "max_concurrent_requests": 10,
                    "max_tokens_per_minute": 10000
                }
                
                new_instance = await self.instance_manager.register_instance(db, instance_data)
                logger.info(f"Created new instance: {new_instance.instance_id}")
        
        elif decision.direction == ScalingDirection.SCALE_DOWN:
            # Scale down: remove instances (gracefully)
            instances_to_remove = current_count - target_count
            
            # Get instances that can be safely removed (lowest load/usage)
            instances = await self._get_group_instances(db, group)
            
            # Sort by current load (ascending) and health (descending)
            instances.sort(key=lambda i: (i.current_load, -i.success_rate))
            
            for i in range(min(instances_to_remove, len(instances))):
                instance_to_remove = instances[i]
                
                # Mark instance for graceful shutdown
                instance_to_remove.status = InstanceStatus.STOPPED
                instance_to_remove.is_active = False
                instance_to_remove.updated_at = datetime.utcnow()
                
                logger.info(f"Marked instance for removal: {instance_to_remove.instance_id}")
            
            db.commit()
        
        # Update group configuration
        group.desired_instances = target_count
        group.updated_at = datetime.utcnow()
        db.commit()
    
    async def get_scaling_metrics(
        self,
        db: Session,
        group_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Get scaling metrics and history"""
        
        # Get recent scaling events
        since_time = datetime.utcnow() - timedelta(hours=24)
        
        query = db.query(ScalingEvent).filter(
            ScalingEvent.started_at >= since_time
        )
        
        if group_id:
            query = query.filter(ScalingEvent.instance_id == f"group_{group_id}")
        
        scaling_events = query.order_by(desc(ScalingEvent.started_at)).all()
        
        # Calculate metrics
        total_scale_up = len([e for e in scaling_events if e.event_type == "scale_up"])
        total_scale_down = len([e for e in scaling_events if e.event_type == "scale_down"])
        successful_scalings = len([e for e in scaling_events if e.status == "completed"])
        failed_scalings = len([e for e in scaling_events if e.status == "failed"])
        
        # Group by hour
        hourly_scaling = {}
        for event in scaling_events:
            hour_key = event.started_at.strftime("%Y-%m-%d %H:00")
            if hour_key not in hourly_scaling:
                hourly_scaling[hour_key] = {"scale_up": 0, "scale_down": 0}
            
            if event.event_type == "scale_up":
                hourly_scaling[hour_key]["scale_up"] += 1
            else:
                hourly_scaling[hour_key]["scale_down"] += 1
        
        return {
            "total_scaling_events": len(scaling_events),
            "scale_up_events": total_scale_up,
            "scale_down_events": total_scale_down,
            "successful_scalings": successful_scalings,
            "failed_scalings": failed_scalings,
            "success_rate": (successful_scalings / len(scaling_events) * 100) if scaling_events else 0,
            "hourly_scaling": hourly_scaling,
            "auto_scaling_active": self._running,
            "managed_groups": len(self._scaling_tasks)
        }