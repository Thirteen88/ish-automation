"""
API endpoints for Instance Manager service
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from ..database.database import get_db
from ..services.instance_manager_service import (
    InstanceManagerService, InstanceSelectionCriteria, LoadBalancingStrategy
)
from ..services.health_monitoring_service import (
    HealthMonitoringService, HealthCheckConfig, HealthStatus
)
from ..services.load_balancer_service import (
    LoadBalancerService, FailoverConfig, FailoverStrategy
)
from ..services.auto_scaling_service import (
    AutoScalingService, ScalingPolicy, ScalingDirection
)
from ..models.instance_manager import (
    AIInstance, ProviderGroup, LoadBalancerConfig, InstanceStatus
)

# Create router
router = APIRouter(prefix="/api/instances", tags=["instance-manager"])

# Pydantic models for API requests/responses
class InstanceRegistrationRequest(BaseModel):
    """Request model for registering a new AI instance"""
    provider_type: str = Field(..., description="Provider type (zai, openai, anthropic, perplexity)")
    model_name: str = Field(..., description="Model name")
    instance_name: str = Field(..., description="Human-readable instance name")
    endpoint_url: str = Field(..., description="API endpoint URL")
    api_key: Optional[str] = Field(None, description="API key (encrypted)")
    region: Optional[str] = Field(None, description="Region/zone")
    version: Optional[str] = Field(None, description="Model version")
    max_concurrent_requests: int = Field(10, description="Maximum concurrent requests")
    max_tokens_per_minute: int = Field(10000, description="Token rate limit")
    temperature: float = Field(0.7, description="Default temperature")
    max_tokens: int = Field(1000, description="Default max tokens")
    timeout: int = Field(30, description="Request timeout in seconds")
    tags: Dict[str, Any] = Field(default_factory=dict, description="Instance tags")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    priority: int = Field(1, description="Priority for load balancing")

    @validator('provider_type')
    def validate_provider_type(cls, v):
        allowed = ['zai', 'openai', 'anthropic', 'perplexity']
        if v.lower() not in allowed:
            raise ValueError(f'Provider type must be one of: {allowed}')
        return v.lower()

class InstanceResponse(BaseModel):
    """Response model for AI instance"""
    instance_id: str
    provider_type: str
    model_name: str
    instance_name: str
    endpoint_url: str
    region: Optional[str]
    version: Optional[str]
    status: str
    is_active: bool
    is_healthy: bool
    total_requests: int
    successful_requests: int
    failed_requests: int
    average_response_time: float
    success_rate: float
    current_load: int
    max_concurrent_requests: int
    last_health_check: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    tags: Dict[str, Any]
    metadata: Dict[str, Any]
    priority: int

class HealthCheckResponse(BaseModel):
    """Response model for health check"""
    instance_id: str
    status: str
    score: float
    response_time: Optional[float]
    issues: List[str]
    last_check: datetime
    next_check: Optional[datetime]

class LoadBalancingRequest(BaseModel):
    """Request model for load balancing"""
    provider_type: str = Field(..., description="Provider type")
    model_name: str = Field(..., description="Model name")
    strategy: str = Field("health_based", description="Load balancing strategy")
    min_health_score: float = Field(0.7, description="Minimum health score")
    max_response_time: Optional[float] = Field(None, description="Maximum response time")

class LoadBalancingResponse(BaseModel):
    """Response model for load balancing"""
    selected_instance: InstanceResponse
    selection_reason: str
    alternative_instances: List[InstanceResponse]
    total_healthy_instances: int
    load_balancing_time: float

class ProviderGroupRequest(BaseModel):
    """Request model for creating provider group"""
    group_name: str = Field(..., description="Group name")
    provider_type: str = Field(..., description="Provider type")
    description: Optional[str] = Field(None, description="Group description")
    min_instances: int = Field(1, description="Minimum instances")
    max_instances: int = Field(10, description="Maximum instances")
    desired_instances: int = Field(2, description="Desired instances")
    auto_scaling_enabled: bool = Field(True, description="Enable auto-scaling")
    scale_up_threshold: float = Field(0.8, description="Scale up threshold")
    scale_down_threshold: float = Field(0.2, description="Scale down threshold")
    scale_up_cooldown: int = Field(300, description="Scale up cooldown (seconds)")
    scale_down_cooldown: int = Field(600, description="Scale down cooldown (seconds)")

class AutoScalingRequest(BaseModel):
    """Request model for configuring auto-scaling"""
    group_id: int = Field(..., description="Provider group ID")
    enabled: bool = Field(True, description="Enable/disable auto-scaling")
    min_instances: Optional[int] = Field(None, description="Minimum instances")
    max_instances: Optional[int] = Field(None, description="Maximum instances")
    scale_up_threshold: Optional[float] = Field(None, description="Scale up threshold")
    scale_down_threshold: Optional[float] = Field(None, description="Scale down threshold")

class MetricsResponse(BaseModel):
    """Response model for instance metrics"""
    instance_id: str
    time_window_seconds: int
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    average_response_time_ms: float
    current_load: int
    max_concurrent_requests: int
    health_check_success_rate: float
    is_healthy: bool
    status: str

# Global service instances (would be injected in real application)
instance_manager = InstanceManagerService()
health_monitor = HealthMonitoringService(instance_manager)
load_balancer = LoadBalancerService(instance_manager)
auto_scaler = AutoScalingService(instance_manager, health_monitor)

@router.post("/register", response_model=InstanceResponse)
async def register_instance(
    request: InstanceRegistrationRequest,
    db: Session = Depends(get_db)
):
    """Register a new AI instance"""
    try:
        instance = await instance_manager.register_instance(db, request.dict())
        return InstanceResponse.from_orm(instance)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{instance_id}")
async def deregister_instance(
    instance_id: str,
    db: Session = Depends(get_db)
):
    """Deregister an AI instance"""
    try:
        success = await instance_manager.deregister_instance(db, instance_id)
        if not success:
            raise HTTPException(status_code=404, detail="Instance not found")
        return {"message": "Instance deregistered successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{instance_id}", response_model=InstanceResponse)
async def get_instance(
    instance_id: str,
    db: Session = Depends(get_db)
):
    """Get details of a specific AI instance"""
    instance = await instance_manager.get_instance(db, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    return InstanceResponse.from_orm(instance)

@router.get("/", response_model=List[InstanceResponse])
async def list_instances(
    provider_type: Optional[str] = Query(None, description="Filter by provider type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    is_healthy: Optional[bool] = Query(None, description="Filter by health status"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db)
):
    """List AI instances with optional filtering"""
    try:
        instances = await instance_manager.list_instances(
            db, provider_type, status, is_healthy, limit, offset
        )
        return [InstanceResponse.from_orm(instance) for instance in instances]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{instance_id}/health-check", response_model=HealthCheckResponse)
async def trigger_health_check(
    instance_id: str,
    check_type: str = Query("basic", description="Type of health check"),
    db: Session = Depends(get_db)
):
    """Trigger a health check for a specific instance"""
    try:
        health_check = await instance_manager.perform_health_check(db, instance_id, check_type)
        
        # Get updated health status
        health_report = await health_monitor.get_health_status(db, instance_id)
        
        return HealthCheckResponse(
            instance_id=instance_id,
            status=health_report.status.value if health_report else "unknown",
            score=health_report.score if health_report else 0.0,
            response_time=health_check.response_time,
            issues=health_report.issues if health_report else [],
            last_check=health_check.created_at,
            next_check=health_report.next_check if health_report else None
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{instance_id}/metrics", response_model=MetricsResponse)
async def get_instance_metrics(
    instance_id: str,
    time_window: int = Query(300, ge=60, le=3600, description="Time window in seconds"),
    db: Session = Depends(get_db)
):
    """Get performance metrics for a specific instance"""
    try:
        metrics = await instance_manager.get_instance_metrics(db, instance_id, time_window)
        return MetricsResponse(**metrics)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/select-instance", response_model=LoadBalancingResponse)
async def select_instance_for_request(
    request: LoadBalancingRequest,
    db: Session = Depends(get_db)
):
    """Select the best instance for a request using load balancing"""
    try:
        # Parse strategy
        try:
            strategy = LoadBalancingStrategy(request.strategy)
        except ValueError:
            strategy = LoadBalancingStrategy.HEALTH_BASED
        
        # Create selection criteria
        criteria = InstanceSelectionCriteria(
            provider_type=request.provider_type,
            model_name=request.model_name,
            min_health_score=request.min_health_score,
            max_response_time=request.max_response_time,
            exclude_maintenance=True,
            require_active=True
        )
        
        # Select instance
        result = await instance_manager.select_instance_for_request(db, criteria, strategy)
        
        # Convert to response format
        selected_response = InstanceResponse.from_orm(result.selected_instance)
        alternative_responses = [
            InstanceResponse.from_orm(instance) 
            for instance in result.alternative_instances
        ]
        
        return LoadBalancingResponse(
            selected_instance=selected_response,
            selection_reason=result.selection_reason,
            alternative_instances=alternative_responses,
            total_healthy_instances=result.total_healthy_instances,
            load_balancing_time=result.load_balancing_time
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{instance_id}/load")
async def update_instance_load(
    instance_id: str,
    current_load: int = Query(..., ge=0, description="Current load"),
    db: Session = Depends(get_db)
):
    """Update current load for an instance"""
    try:
        success = await instance_manager.update_instance_load(db, instance_id, current_load)
        if not success:
            raise HTTPException(status_code=404, detail="Instance not found")
        return {"message": "Load updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Provider Group endpoints
@router.post("/groups", response_model=Dict[str, Any])
async def create_provider_group(
    request: ProviderGroupRequest,
    db: Session = Depends(get_db)
):
    """Create a new provider group"""
    try:
        # Check if group name already exists
        existing = db.query(ProviderGroup).filter(
            ProviderGroup.group_name == request.group_name
        ).first()
        
        if existing:
            raise HTTPException(status_code=409, detail="Group name already exists")
        
        # Create new group
        group = ProviderGroup(
            group_name=request.group_name,
            provider_type=request.provider_type,
            description=request.description,
            min_instances=request.min_instances,
            max_instances=request.max_instances,
            desired_instances=request.desired_instances,
            auto_scaling_enabled=request.auto_scaling_enabled,
            scale_up_threshold=request.scale_up_threshold,
            scale_down_threshold=request.scale_down_threshold,
            scale_up_cooldown=request.scale_up_cooldown,
            scale_down_cooldown=request.scale_down_cooldown
        )
        
        db.add(group)
        db.commit()
        db.refresh(group)
        
        return {
            "id": group.id,
            "group_name": group.group_name,
            "provider_type": group.provider_type,
            "message": "Provider group created successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/groups", response_model=List[Dict[str, Any]])
async def list_provider_groups(db: Session = Depends(get_db)):
    """List all provider groups"""
    try:
        groups = db.query(ProviderGroup).filter(
            ProviderGroup.is_active == True
        ).all()
        
        return [
            {
                "id": group.id,
                "group_name": group.group_name,
                "provider_type": group.provider_type,
                "description": group.description,
                "min_instances": group.min_instances,
                "max_instances": group.max_instances,
                "desired_instances": group.desired_instances,
                "auto_scaling_enabled": group.auto_scaling_enabled,
                "is_active": group.is_active,
                "status": group.status,
                "created_at": group.created_at,
                "updated_at": group.updated_at
            }
            for group in groups
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/groups/{group_id}/auto-scaling")
async def configure_auto_scaling(
    group_id: int,
    request: AutoScalingRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Configure auto-scaling for a provider group"""
    try:
        group = db.query(ProviderGroup).filter(
            ProviderGroup.id == group_id
        ).first()
        
        if not group:
            raise HTTPException(status_code=404, detail="Provider group not found")
        
        # Update group configuration
        group.auto_scaling_enabled = request.enabled
        
        if request.min_instances is not None:
            group.min_instances = request.min_instances
        if request.max_instances is not None:
            group.max_instances = request.max_instances
        if request.scale_up_threshold is not None:
            group.scale_up_threshold = request.scale_up_threshold
        if request.scale_down_threshold is not None:
            group.scale_down_threshold = request.scale_down_threshold
        
        group.updated_at = datetime.utcnow()
        db.commit()
        
        # Start or stop auto-scaling in background
        if request.enabled:
            background_tasks.add_task(auto_scaler.start_group_scaling, db, group_id)
        else:
            background_tasks.add_task(auto_scaler.stop_group_scaling, group_id)
        
        return {
            "message": f"Auto-scaling {'enabled' if request.enabled else 'disabled'} for group {group_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Health Monitoring endpoints
@router.post("/health-monitoring/start")
async def start_health_monitoring(db: Session = Depends(get_db)):
    """Start health monitoring for all active instances"""
    try:
        await health_monitor.start_monitoring(db)
        return {"message": "Health monitoring started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/health-monitoring/stop")
async def stop_health_monitoring():
    """Stop health monitoring"""
    try:
        await health_monitor.stop_monitoring()
        return {"message": "Health monitoring stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health-summary")
async def get_health_summary(db: Session = Depends(get_db)):
    """Get overall health summary for all instances"""
    try:
        summary = await health_monitor.get_overall_health_summary(db)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{instance_id}/health", response_model=HealthCheckResponse)
async def get_instance_health(
    instance_id: str,
    db: Session = Depends(get_db)
):
    """Get health status for a specific instance"""
    try:
        health_report = await health_monitor.get_health_status(db, instance_id)
        
        if not health_report:
            raise HTTPException(status_code=404, detail="Instance not found")
        
        return HealthCheckResponse(
            instance_id=instance_id,
            status=health_report.status.value,
            score=health_report.score,
            response_time=None,
            issues=health_report.issues,
            last_check=health_report.last_check,
            next_check=health_report.next_check
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Load Balancer endpoints
@router.get("/load-balancer/metrics")
async def get_load_balancer_metrics():
    """Get load balancer performance metrics"""
    try:
        metrics = await load_balancer.get_load_balancer_metrics()
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/load-balancer/utilization")
async def get_instance_utilization(
    time_window_minutes: int = Query(60, ge=5, le=1440, description="Time window in minutes"),
    db: Session = Depends(get_db)
):
    """Get detailed utilization report for instances"""
    try:
        report = await load_balancer.get_instance_utilization_report(db, time_window_minutes)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/load-balancer/reset-metrics")
async def reset_load_balancer_metrics():
    """Reset load balancer metrics"""
    try:
        await load_balancer.reset_metrics()
        return {"message": "Load balancer metrics reset"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Auto-scaling endpoints
@router.post("/auto-scaling/start")
async def start_auto_scaling(db: Session = Depends(get_db)):
    """Start auto-scaling for all provider groups"""
    try:
        await auto_scaler.start_auto_scaling(db)
        return {"message": "Auto-scaling started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/auto-scaling/stop")
async def stop_auto_scaling():
    """Stop auto-scaling"""
    try:
        await auto_scaler.stop_auto_scaling()
        return {"message": "Auto-scaling stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auto-scaling/metrics")
async def get_auto_scaling_metrics(
    group_id: Optional[int] = Query(None, description="Filter by provider group ID"),
    db: Session = Depends(get_db)
):
    """Get auto-scaling metrics and history"""
    try:
        metrics = await auto_scaler.get_scaling_metrics(db, group_id)
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# System endpoints
@router.post("/cleanup")
async def cleanup_old_data(
    days_to_keep: int = Query(30, ge=1, le=365, description="Days of data to keep"),
    db: Session = Depends(get_db)
):
    """Clean up old data to prevent database bloat"""
    try:
        result = await instance_manager.cleanup_old_data(db, days_to_keep)
        return {
            "message": "Cleanup completed",
            "deleted_records": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def get_system_status(db: Session = Depends(get_db)):
    """Get overall system status"""
    try:
        # Get instance counts
        total_instances = db.query(AIInstance).filter(
            AIInstance.is_active == True
        ).count()
        
        healthy_instances = db.query(AIInstance).filter(
            AIInstance.is_active == True,
            AIInstance.is_healthy == True
        ).count()
        
        # Get provider group counts
        total_groups = db.query(ProviderGroup).filter(
            ProviderGroup.is_active == True
        ).count()
        
        auto_scaling_groups = db.query(ProviderGroup).filter(
            ProviderGroup.is_active == True,
            ProviderGroup.auto_scaling_enabled == True
        ).count()
        
        return {
            "instances": {
                "total": total_instances,
                "healthy": healthy_instances,
                "unhealthy": total_instances - healthy_instances
            },
            "provider_groups": {
                "total": total_groups,
                "auto_scaling_enabled": auto_scaling_groups
            },
            "services": {
                "health_monitoring_active": health_monitor._running,
                "auto_scaling_active": auto_scaler._running,
                "monitored_instances": len(health_monitor._monitoring_tasks),
                "managed_groups": len(auto_scaler._scaling_tasks)
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))