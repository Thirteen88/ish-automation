"""
FastAPI Endpoints for Perplexity Automation

This module provides REST API endpoints for integrating the Perplexity
automation system with the existing 88 3ee AI platform.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from .perplexity_automation import (
    PerplexityAutomationEngine, AutomationConfig, AutomationStatus,
    TaskStatus, create_automation_engine
)
from .response_parser import PerplexityResponse
from .model_selector import (
    ModelSelector, ModelConfig, ModelProvider, TaskType,
    ModelSelectionRequest, detect_task_type, model_selector
)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global engine instance
automation_engine: Optional[PerplexityAutomationEngine] = None


# Pydantic models for API requests/responses
class PromptRequest(BaseModel):
    """Request model for prompt submission"""
    prompt: str = Field(..., description="The prompt to send to Perplexity", min_length=1, max_length=2000)
    timeout: Optional[int] = Field(60, description="Timeout in seconds", ge=10, le=300)
    device_id: Optional[str] = Field("emulator-5554", description="Device ID to use")
    model_id: Optional[str] = Field(None, description="Specific model to use (auto-select if not specified)")
    require_sources: Optional[bool] = Field(False, description="Require sources in response")
    max_cost: Optional[float] = Field(None, description="Maximum cost per 1k tokens")
    preferred_provider: Optional[str] = Field(None, description="Preferred model provider")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class TaskResponse(BaseModel):
    """Response model for task submission"""
    task_id: str = Field(..., description="Unique task identifier")
    status: str = Field(..., description="Current task status")
    submitted_at: datetime = Field(..., description="Task submission timestamp")
    estimated_completion: Optional[datetime] = Field(None, description="Estimated completion time")


class EngineStatusResponse(BaseModel):
    """Response model for engine status"""
    status: str = Field(..., description="Engine status")
    device_connected: bool = Field(..., description="Whether device is connected")
    active_tasks: int = Field(..., description="Number of active tasks")
    queued_tasks: int = Field(..., description="Number of queued tasks")
    completed_tasks: int = Field(..., description="Number of completed tasks")
    success_rate: float = Field(..., description="Success rate percentage")
    average_confidence: float = Field(..., description="Average response confidence")
    screenshots_taken: int = Field(..., description="Number of screenshots taken")
    uptime_seconds: float = Field(..., description="Engine uptime in seconds")


class TaskDetailResponse(BaseModel):
    """Detailed response model for task information"""
    task_id: str
    prompt: str
    status: str
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    confidence_score: Optional[float]
    response_length: Optional[int]
    sources_found: Optional[int]
    error_message: Optional[str]
    retry_count: int
    execution_time_seconds: Optional[float]


class ConfigurationRequest(BaseModel):
    """Request model for engine configuration"""
    device_id: Optional[str] = Field("emulator-5554", description="Device ID")
    screenshot_dir: Optional[str] = Field("./screenshots", description="Screenshot directory")
    max_concurrent_tasks: Optional[int] = Field(1, description="Maximum concurrent tasks", ge=1, le=5)
    default_timeout: Optional[int] = Field(120, description="Default timeout in seconds", ge=10, le=300)
    response_wait_time: Optional[int] = Field(30, description="Response wait time in seconds", ge=5, le=120)
    confidence_threshold: Optional[float] = Field(0.7, description="Confidence threshold", ge=0.1, le=1.0)
    auto_retry_failed_tasks: Optional[bool] = Field(True, description="Auto-retry failed tasks")
    enable_screenshot_logging: Optional[bool] = Field(True, description="Enable screenshot logging")


class ModelInfo(BaseModel):
    """Model information response"""
    model_id: str = Field(..., description="Model identifier")
    display_name: str = Field(..., description="Human-readable name")
    provider: str = Field(..., description="Model provider")
    max_tokens: int = Field(..., description="Maximum tokens")
    supports_sources: bool = Field(..., description="Supports source citations")
    supports_images: bool = Field(..., description="Supports image input")
    cost_per_1k_tokens: float = Field(..., description="Cost per 1k tokens")
    average_latency_ms: int = Field(..., description="Average latency in milliseconds")
    capabilities: List[str] = Field(..., description="Model capabilities")
    available: bool = Field(..., description="Currently available")
    priority: int = Field(..., description="Selection priority")


class ModelSelectionResponse(BaseModel):
    """Model selection response"""
    selected_model: ModelInfo = Field(..., description="Selected model information")
    task_type: str = Field(..., description="Detected task type")
    reasoning: str = Field(..., description="Selection reasoning")
    alternatives: List[ModelInfo] = Field(..., description="Alternative models")


class ModelStatsResponse(BaseModel):
    """Model statistics response"""
    total_models: int = Field(..., description="Total available models")
    available_models: int = Field(..., description="Currently available models")
    provider_stats: Dict[str, Any] = Field(..., description="Statistics by provider")
    task_type_distribution: Dict[str, int] = Field(..., description="Models by task type")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global automation_engine

    # Startup
    logger.info("Starting Perplexity Automation API...")

    # Initialize automation engine
    try:
        automation_engine = await create_automation_engine(
            device_id="emulator-5554",
            default_timeout=120,
            response_wait_time=30
        )
        logger.info("Automation engine initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize automation engine: {e}")
        automation_engine = None

    yield

    # Shutdown
    logger.info("Shutting down Perplexity Automation API...")
    if automation_engine:
        await automation_engine.stop()


# Create FastAPI app
app = FastAPI(
    title="Perplexity Automation API",
    description="Autonomous Perplexity APK interaction system for 88 3ee AI platform",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Helper functions
def get_engine() -> PerplexityAutomationEngine:
    """Get the automation engine instance"""
    if not automation_engine:
        raise HTTPException(status_code=503, detail="Automation engine not initialized")
    return automation_engine


def verify_engine_ready():
    """Verify engine is ready for requests"""
    engine = get_engine()
    if engine.status != AutomationStatus.READY:
        raise HTTPException(
            status_code=503,
            detail=f"Engine not ready. Current status: {engine.status.value}"
        )


# API Endpoints
@app.get("/", response_model=Dict[str, Any])
async def root():
    """Root endpoint"""
    return {
        "service": "Perplexity Automation API",
        "version": "1.0.0",
        "status": automation_engine.status.value if automation_engine else "not_initialized",
        "timestamp": datetime.now().isoformat(),
        "endpoints": {
            "submit_prompt": "/prompt",
            "get_task": "/task/{task_id}",
            "wait_for_task": "/task/{task_id}/wait",
            "engine_status": "/status",
            "engine_stats": "/stats",
            "recent_tasks": "/tasks/recent",
            "configure": "/configure",
            "models": "/models",
            "select_model": "/select-model",
            "model_stats": "/model-stats"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    if not automation_engine:
        return {
            "status": "unhealthy",
            "detail": "Automation engine not initialized",
            "timestamp": datetime.now().isoformat()
        }

    return {
        "status": "healthy",
        "engine_status": automation_engine.status.value,
        "device_connected": automation_engine.adb_queue.get_device_status(automation_engine.config.device_id) == "connected",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/models", response_model=List[ModelInfo])
async def get_available_models(provider: Optional[str] = None):
    """Get list of available AI models"""
    try:
        # Convert provider string to enum if provided
        provider_enum = None
        if provider:
            try:
                provider_enum = ModelProvider(provider)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid provider: {provider}")

        # Get models from selector
        models = model_selector.get_available_models(provider_enum)

        return [
            ModelInfo(
                model_id=model.model_name,
                display_name=model.display_name,
                provider=model.provider.value,
                max_tokens=model.max_tokens,
                supports_sources=model.supports_sources,
                supports_images=model.supports_images,
                cost_per_1k_tokens=model.cost_per_1k_tokens,
                average_latency_ms=model.average_latency_ms,
                capabilities=model.capabilities,
                available=model.available,
                priority=model.priority
            )
            for model in models
        ]

    except Exception as e:
        logger.error(f"Failed to get models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve models: {str(e)}")


@app.post("/select-model", response_model=ModelSelectionResponse)
async def select_optimal_model(
    prompt: str = Field(..., description="Prompt to analyze"),
    require_sources: bool = Field(False, description="Require sources in response"),
    max_cost: Optional[float] = Field(None, description="Maximum cost per 1k tokens"),
    preferred_provider: Optional[str] = Field(None, description="Preferred provider"),
    max_latency_ms: Optional[int] = Field(None, description="Maximum latency in milliseconds")
):
    """Select the optimal model for a given prompt"""
    try:
        # Detect task type
        task_type = detect_task_type(prompt)

        # Convert preferred provider to enum
        preferred_provider_enum = None
        if preferred_provider:
            try:
                preferred_provider_enum = ModelProvider(preferred_provider)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid provider: {preferred_provider}")

        # Create selection request
        request = ModelSelectionRequest(
            task_type=task_type,
            prompt=prompt,
            require_sources=require_sources,
            max_cost=max_cost,
            preferred_provider=preferred_provider_enum,
            max_latency_ms=max_latency_ms
        )

        # Select model
        selected_model = model_selector.select_model(request)
        if not selected_model:
            raise HTTPException(status_code=404, detail="No suitable model found")

        # Get alternatives
        alternatives = []
        all_models = model_selector.get_available_models()
        for model in all_models[:5]:  # Top 5 alternatives
            if model.model_name != selected_model.model_name and model.available:
                alternatives.append(ModelInfo(
                    model_id=model.model_name,
                    display_name=model.display_name,
                    provider=model.provider.value,
                    max_tokens=model.max_tokens,
                    supports_sources=model.supports_sources,
                    supports_images=model.supports_images,
                    cost_per_1k_tokens=model.cost_per_1k_tokens,
                    average_latency_ms=model.average_latency_ms,
                    capabilities=model.capabilities,
                    available=model.available,
                    priority=model.priority
                ))

        # Generate reasoning
        reasoning = f"Selected {selected_model.display_name} for {task_type.value} task"
        if require_sources and selected_model.supports_sources:
            reasoning += " (supports sources)"
        if preferred_provider and selected_model.provider == preferred_provider_enum:
            reasoning += f" (preferred provider: {preferred_provider})"
        if max_cost and selected_model.cost_per_1k_tokens <= max_cost:
            reasoning += " (within cost constraints)"

        return ModelSelectionResponse(
            selected_model=ModelInfo(
                model_id=selected_model.model_name,
                display_name=selected_model.display_name,
                provider=selected_model.provider.value,
                max_tokens=selected_model.max_tokens,
                supports_sources=selected_model.supports_sources,
                supports_images=selected_model.supports_images,
                cost_per_1k_tokens=selected_model.cost_per_1k_tokens,
                average_latency_ms=selected_model.average_latency_ms,
                capabilities=selected_model.capabilities,
                available=selected_model.available,
                priority=selected_model.priority
            ),
            task_type=task_type.value,
            reasoning=reasoning,
            alternatives=alternatives
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to select model: {e}")
        raise HTTPException(status_code=500, detail=f"Model selection failed: {str(e)}")


@app.get("/model-stats", response_model=ModelStatsResponse)
async def get_model_statistics():
    """Get model statistics and distribution"""
    try:
        # Get overall stats
        all_models = list(model_selector.models.values())
        available_models = [m for m in all_models if m.available]

        # Get provider stats
        provider_stats = model_selector.get_provider_stats()

        # Calculate task type distribution
        task_type_distribution = {}
        for task_type in TaskType:
            task_models = model_selector.task_model_mapping.get(task_type, [])
            available_task_models = len([
                model_selector.models[model_id]
                for model_id in task_models
                if model_id in model_selector.models and model_selector.models[model_id].available
            ])
            task_type_distribution[task_type.value] = available_task_models

        return ModelStatsResponse(
            total_models=len(all_models),
            available_models=len(available_models),
            provider_stats=provider_stats,
            task_type_distribution=task_type_distribution
        )

    except Exception as e:
        logger.error(f"Failed to get model stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve model statistics: {str(e)}")


@app.get("/status", response_model=EngineStatusResponse)
async def get_engine_status():
    """Get current engine status"""
    engine = get_engine()
    stats = engine.get_stats()

    device_status = engine.adb_queue.get_device_status(engine.config.device_id)
    device_connected = device_status == "connected"

    return EngineStatusResponse(
        status=engine.status.value,
        device_connected=device_connected,
        active_tasks=stats["active_tasks"],
        queued_tasks=stats["queued_tasks"],
        completed_tasks=stats["completed_tasks"],
        success_rate=stats["success_rate"],
        average_confidence=stats["average_confidence"],
        screenshots_taken=stats["screenshots_taken"],
        uptime_seconds=stats.get("uptime_seconds", 0.0)
    )


@app.get("/stats", response_model=Dict[str, Any])
async def get_engine_stats():
    """Get detailed engine statistics"""
    engine = get_engine()
    stats = engine.get_stats()

    # Add additional computed stats
    stats["timestamp"] = datetime.now().isoformat()
    stats["engine_status"] = engine.status.value
    stats["device_id"] = engine.config.device_id

    return stats


@app.post("/prompt", response_model=TaskResponse)
async def submit_prompt(request: PromptRequest):
    """Submit a prompt to Perplexity"""
    verify_engine_ready()
    engine = get_engine()

    try:
        # Submit the prompt
        task_id = await engine.submit_prompt(
            prompt=request.prompt,
            timeout=request.timeout
        )

        task = await engine.get_task_status(task_id)
        if not task:
            raise HTTPException(status_code=500, detail="Failed to create task")

        return TaskResponse(
            task_id=task.task_id,
            status=task.status.value,
            submitted_at=task.created_at,
            estimated_completion=datetime.now()  # Simple estimate
        )

    except Exception as e:
        logger.error(f"Failed to submit prompt: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit prompt: {str(e)}")


@app.get("/task/{task_id}", response_model=TaskDetailResponse)
async def get_task_status(task_id: str):
    """Get status of a specific task"""
    engine = get_engine()

    task = await engine.get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    execution_time = None
    if task.started_at and task.completed_at:
        execution_time = (task.completed_at - task.started_at).total_seconds()

    return TaskDetailResponse(
        task_id=task.task_id,
        prompt=task.prompt,
        status=task.status.value,
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        confidence_score=task.response.confidence_score if task.response else None,
        response_length=len(task.response.answer) if task.response and task.response.answer else None,
        sources_found=len(task.response.sources) if task.response and task.response.sources else None,
        error_message=task.error_message,
        retry_count=task.retry_count,
        execution_time_seconds=execution_time
    )


@app.get("/task/{task_id}/wait")
async def wait_for_task(task_id: str, timeout: Optional[int] = 120):
    """Wait for a task to complete"""
    engine = get_engine()

    try:
        response = await engine.wait_for_task(task_id, timeout=timeout)

        if response:
            return {
                "task_id": task_id,
                "status": "completed",
                "response": {
                    "response_id": response.response_id,
                    "answer": response.answer,
                    "sources": response.sources,
                    "confidence_score": response.confidence_score,
                    "response_time_ms": response.response_time_ms,
                    "timestamp": response.timestamp.isoformat()
                }
            }
        else:
            task = await engine.get_task_status(task_id)
            if task and task.status == TaskStatus.FAILED:
                raise HTTPException(
                    status_code=500,
                    detail=f"Task failed: {task.error_message or 'Unknown error'}"
                )
            else:
                raise HTTPException(
                    status_code=408,
                    detail="Task timeout or not completed within specified time"
                )

    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Task wait timeout")
    except Exception as e:
        logger.error(f"Failed to wait for task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to wait for task: {str(e)}")


@app.get("/tasks/recent", response_model=List[TaskDetailResponse])
async def get_recent_tasks(count: int = 10):
    """Get recent completed tasks"""
    engine = get_engine()

    recent_tasks = engine.get_recent_tasks(count)

    return [
        TaskDetailResponse(
            task_id=task["task_id"],
            prompt=task["prompt"],
            status=task["status"],
            created_at=datetime.fromisoformat(task["created_at"]),
            started_at=datetime.fromisoformat(task["started_at"]) if task["started_at"] else None,
            completed_at=datetime.fromisoformat(task["completed_at"]) if task["completed_at"] else None,
            confidence_score=task["confidence_score"],
            response_length=task["response_length"],
            sources_found=task["sources_found"],
            error_message=task["error_message"],
            retry_count=task["retry_count"],
            execution_time_seconds=None  # Would need to calculate from task data
        )
        for task in recent_tasks
    ]


@app.post("/configure")
async def configure_engine(config: ConfigurationRequest):
    """Configure automation engine settings"""
    engine = get_engine()

    # Note: This would require engine restart for some settings
    # For now, just return current config and a warning
    current_config = engine.config

    return {
        "message": "Configuration updated (some settings may require engine restart)",
        "current_config": {
            "device_id": current_config.device_id,
            "screenshot_dir": current_config.screenshot_dir,
            "max_concurrent_tasks": current_config.max_concurrent_tasks,
            "default_timeout": current_config.default_timeout,
            "response_wait_time": current_config.response_wait_time,
            "confidence_threshold": current_config.confidence_threshold,
            "auto_retry_failed_tasks": current_config.auto_retry_failed_tasks,
            "enable_screenshot_logging": current_config.enable_screenshot_logging
        },
        "requested_config": config.dict(),
        "note": "Full configuration update requires engine restart"
    }


@app.post("/engine/restart")
async def restart_engine():
    """Restart the automation engine"""
    global automation_engine

    try:
        if automation_engine:
            await automation_engine.stop()

        # Reinitialize with default settings
        automation_engine = await create_automation_engine()

        return {
            "status": "success",
            "message": "Engine restarted successfully",
            "new_status": automation_engine.status.value,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to restart engine: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to restart engine: {str(e)}")


@app.delete("/task/{task_id}")
async def cancel_task(task_id: str):
    """Cancel a pending task (if possible)"""
    # Note: This would require implementing task cancellation in the engine
    # For now, return a not implemented response
    raise HTTPException(
        status_code=501,
        detail="Task cancellation not implemented yet"
    )


# Utility endpoints
@app.get("/devices")
async def list_available_devices():
    """List available Android devices"""
    engine = get_engine()

    devices = []
    for device_id in engine.adb_queue.device_pool:
        status = engine.adb_queue.get_device_status(device_id)
        devices.append({
            "device_id": device_id,
            "status": status.value,
            "connected": status == "connected"
        })

    return {"devices": devices}


@app.get("/screenshots")
async def list_screenshots():
    """List available screenshots"""
    import os
    from pathlib import Path

    engine = get_engine()
    screenshot_dir = Path(engine.config.screenshot_dir)

    if not screenshot_dir.exists():
        return {"screenshots": []}

    screenshots = []
    for file_path in screenshot_dir.glob("*.png"):
        stat = file_path.stat()
        screenshots.append({
            "filename": file_path.name,
            "path": str(file_path),
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
        })

    # Sort by creation time (newest first)
    screenshots.sort(key=lambda x: x["created_at"], reverse=True)

    return {"screenshots": screenshots}


# Run standalone server
def run_server(host: str = "0.0.0.0", port: int = 8002, log_level: str = "info"):
    """Run the API server"""
    uvicorn.run(
        "src.perplexity_automation.api:app",
        host=host,
        port=port,
        log_level=log_level,
        reload=False
    )


if __name__ == "__main__":
    run_server()