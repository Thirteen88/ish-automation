"""
ISH Chat Integration - Refactored Main Application
FastAPI-based server for Android automation with modular architecture
"""
import asyncio
import uuid
import logging
import time
import json
import os
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List

import aiofiles

from fastapi import FastAPI, HTTPException, Header, Request, BackgroundTasks, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Import our new modular services
from services.android_service import AndroidService
from services.perplexity_service import PerplexityService
from services.ai_service import AIService
from services.enhanced_ai_service import enhanced_ai_service
from services.ocr_service import ocr_service
from services.voice_command_service import voice_command_service, VoiceCommandState, SpeechEngine
from services.analytics_service import analytics_service
from services.websocket_service import connection_manager, websocket_service, WebSocketMessage
from services.external_agent_delegator import external_delegator, ExternalTask, TaskCategory, TaskComplexity
from database.connection import create_tables, get_db, db_manager
from config.settings import settings, CORS_CONFIG

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=settings.log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize services
android_service = AndroidService()
ai_service = AIService()
enhanced_ai = enhanced_ai_service  # Enhanced AI service with multi-provider support
perplexity_service = PerplexityService(android_service)
# OCR service is already initialized as global instance 'ocr_service'

# Data models
class MessagePayload(BaseModel):
    """Incoming message from client"""
    sender: str = Field(..., description="Message sender: 'user' or 'bot'")
    message: str = Field(..., min_length=1, max_length=10000)
    timestamp: str
    metadata: Optional[dict] = None

class RelayResponse(BaseModel):
    """Response to client"""
    status: str
    message_id: Optional[str] = None
    processed_at: str

class ADBCommandRequest(BaseModel):
    """ADB command request"""
    command: str = Field(..., min_length=1)
    timeout: Optional[int] = Field(default=30)

class AITestRequest(BaseModel):
    """AI test endpoint request model"""
    providers: Optional[List[str]] = Field(None, description="Providers to test (empty = all available)")
    test_type: str = Field("simple", description="Test type: simple, complex, reasoning, code, creative")
    include_costs: bool = Field(True, description="Include cost estimation")
    timeout: int = Field(30, description="Timeout per provider in seconds", ge=5, le=120)
    save_results: bool = Field(True, description="Save test results to database")
    parallel: bool = Field(True, description="Run tests in parallel")
    custom_prompt: Optional[str] = Field(None, description="Custom test prompt")

class AITestResult(BaseModel):
    """Individual AI test result"""
    provider: str
    model: str
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    response_length: int = 0
    estimated_cost: Optional[float] = None
    token_usage: Optional[Dict[str, Any]] = None
    quality_score: Optional[float] = None
    test_prompt: str

class AITestResponse(BaseModel):
    """AI test endpoint response model"""
    test_id: str
    test_type: str
    total_providers: int
    successful_providers: int
    failed_providers: int
    results: List[AITestResult]
    comparison: Optional[Dict[str, Any]] = None
    execution_summary: Dict[str, Any]
    timestamp: str

# Background task for broadcasting regular updates
async def broadcast_regular_updates():
    """Background task to broadcast regular system updates"""
    while True:
        try:
            # Broadcast device status
            device_status = await android_service.get_device_status()
            await websocket_service.broadcast_device_status(device_status)

            # Broadcast system metrics
            metrics = {
                "active_sessions": len(await db_manager.get_recent_sessions(100)),
                "websocket_connections": len(connection_manager.active_connections),
                "cpu_usage": 0,  # TODO: Implement CPU monitoring
                "memory_usage": 0,  # TODO: Implement memory monitoring
                "uptime": (datetime.utcnow() - datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds()
            }
            await websocket_service.broadcast_system_metrics(metrics)

        except Exception as e:
            logger.error(f"Error in regular updates: {e}")

        # Wait for 30 seconds before next update
        await asyncio.sleep(30)

# Lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    logger.info("Starting ISH Chat Integration server")

    # Create database tables
    create_tables()
    logger.info("Database tables created successfully")

    # Check Android device connection
    try:
        device_status = await android_service.get_device_status()
        if device_status["connected"]:
            logger.info(f"Android device connected: {device_status['model']}")
        else:
            logger.warning("No Android device connected")
    except Exception as e:
        logger.error(f"Failed to check device status: {e}")

    # Start background task for regular updates
    background_task = asyncio.create_task(broadcast_regular_updates())
    logger.info("Background updates task started")

    yield

    # Clean up
    background_task.cancel()
    try:
        await background_task
    except asyncio.CancelledError:
        pass

    logger.info("Shutting down ISH Chat Integration server")

# Create FastAPI app
app = FastAPI(
    title="ISH Chat Integration API",
    version="2.0.0",
    description="Advanced Android automation with AI integration",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    **CORS_CONFIG
)

# Middleware for session tracking
@app.middleware("http")
async def add_session_id(request: Request, call_next):
    """Add unique session ID to requests"""
    # Store session ID in request state for later use
    session_id = request.headers.get("x-session-id")
    if not session_id:
        session_id = str(uuid.uuid4())

    request.state.session_id = session_id

    response = await call_next(request)
    response.headers["x-session-id"] = session_id
    return response

# Helper functions
def get_session_id(request: Request) -> str:
    """Get or create session ID"""
    return getattr(request.state, "session_id", request.headers.get("x-session-id", str(uuid.uuid4())))

async def verify_api_key(request: Request) -> bool:
    """Verify API key"""
    if not settings.api_key:
        return True  # No authentication required

    api_key = request.headers.get("X-API-Key")
    return api_key == settings.api_key

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Welcome to ISH Chat Integration API",
        "version": "2.0.0",
        "status": "healthy",
        "endpoints": {
            "health": "/health",
            "api_docs": "/docs",
            "openapi_spec": "/openapi.json",
            "android_status": "/api/android/status",
            "voice_commands": "/api/voice/commands",
            "ocr_engines": "/api/ocr/engines",
            "ocr_analyze": "/api/ocr/analyze",
            "ocr_extract_text": "/api/ocr/extract-text",
            "ocr_screenshot_extract": "/api/ocr/screenshot-and-extract",
            "ai_providers": "/api/ai/enhanced/providers",
            "ai_test": "/api/ai/test",
            "ai_test_history": "/api/ai/test/history",
            "ai_test_stats": "/api/ai/test/stats",
            "analytics_dashboard": "/api/analytics/dashboard",
            "external_agent_delegation": "/api/external-agent/delegate",
            "external_agents": "/api/external-agent/agents",
            "delegation_history": "/api/external-agent/history"
        },
        "quick_links": {
            "documentation": "http://localhost:8000/docs",
            "health_check": "http://localhost:8000/health",
            "android_status": "http://localhost:8000/api/android/status",
            "ocr_analyze": "http://localhost:8000/api/ocr/analyze",
            "ai_test": "http://localhost:8000/api/ai/test",
            "ai_providers": "http://localhost:8000/api/ai/enhanced/providers",
            "delegate_task": "http://localhost:8000/api/external-agent/delegate",
            "view_agents": "http://localhost:8000/api/external-agent/agents"
        }
    }

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "services": {
            "android": "connected" if (await android_service.get_device_status())["connected"] else "disconnected",
            "ai_providers": ai_service.get_available_providers(),
            "perplexity": "installed" if await perplexity_service.is_installed() else "not installed"
        }
    }

# Android endpoints
@app.get("/api/android/status")
async def android_status():
    """Get Android device status information"""
    device_status = await android_service.get_device_status()

    # Update device status in database
    if device_status["connected"]:
        await db_manager.update_device_status(
            device_id=device_status.get("serial", "unknown"),
            connected=True,
            battery_level=int(device_status.get("battery", "0").replace("level: ", "")),
            model=device_status.get("model"),
            app_version="unknown"
        )

    # Broadcast device status update via WebSocket
    await websocket_service.broadcast_device_status(device_status)

    return device_status

@app.post("/api/android/execute")
async def execute_adb_command(http_request: Request, request: ADBCommandRequest):
    """Execute ADB command on connected Android device"""
    if not await verify_api_key(http_request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(http_request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="adb_command",
        device_id="unknown"
    )

    # Execute command
    start_time = time.time()
    result = await android_service.run_adb_command(request.command, timeout=request.timeout)
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if result["success"] else "failed",
        error_message=result.get("stderr") if not result["success"] else None
    )

    # Broadcast automation log via WebSocket
    automation_log = {
        "session_id": session_id,
        "action": "adb_command",
        "command": request.command,
        "status": "completed" if result["success"] else "failed",
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }
    await websocket_service.broadcast_automation_log(automation_log)

    return {
        "command": request.command,
        "result": result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

# Perplexity endpoints
@app.post("/api/perplexity/open")
async def open_perplexity_app(request: Request):
    """Open Perplexity app on Android device"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="open_perplexity",
        device_id="unknown"
    )

    # Open app
    result = await perplexity_service.open_perplexity()

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if result["success"] else "failed"
    )

    return {
        "action": "open_perplexity",
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/search")
async def search_perplexity(request: Request, query: str):
    """Search in Perplexity app"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="perplexity_search",
        device_id="unknown"
    )

    # Execute search
    start_time = time.time()
    result = await perplexity_service.search_query(query)
    execution_time = time.time() - start_time

    # Take screenshot
    screenshot_result = await perplexity_service.take_screenshot("perplexity_search")

    # Log query
    await db_manager.log_perplexity_query(
        query_text=query,
        session_id=session_id,
        screenshot_path=screenshot_result.get("local_path"),
        response_time=execution_time
    )

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if result["success"] else "failed",
        screenshots_taken=1 if screenshot_result["success"] else 0
    )

    return {
        "action": "perplexity_search",
        "query": query,
        "result": result,
        "screenshot_taken": screenshot_result["success"],
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/screenshot")
async def screenshot_perplexity(request: Request):
    """Take screenshot of Perplexity app"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    result = await perplexity_service.take_screenshot()

    return {
        "action": "perplexity_screenshot",
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/comprehensive-exploration")
async def comprehensive_perplexity_exploration(request: Request):
    """Comprehensive exploration of Perplexity app using all methods"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="comprehensive_exploration",
        device_id="unknown"
    )

    # Execute comprehensive exploration
    result = await perplexity_service.comprehensive_exploration()

    # Log model exploration
    if result["success"]:
        screenshot_paths = []
        for exploration_result in result["exploration_results"]:
            if exploration_result["method"] in ["model_selector_finder", "model_cycling"]:
                # Extract screenshot paths from results
                pass  # TODO: Extract from detailed results

        await db_manager.log_model_exploration(
            app_name="perplexity",
            models_found=[],  # TODO: Extract from results
            exploration_method="comprehensive",
            screenshot_paths=screenshot_paths,
            success=result["success"],
            session_id=session_id
        )

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if result["success"] else "failed"
    )

    return {
        "action": "comprehensive_exploration",
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

# OCR-enhanced Perplexity endpoints
@app.post("/api/perplexity/screenshot-ocr")
async def perplexity_screenshot_with_ocr(request: Request, ocr_engine: str = None):
    """Take Perplexity screenshot and extract text using OCR"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="perplexity_screenshot_ocr",
        device_id="unknown"
    )

    # Take screenshot with OCR
    start_time = time.time()
    result = await perplexity_service.take_screenshot_with_ocr("perplexity_ocr", ocr_engine)
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if result["success"] else "failed",
        screenshots_taken=1 if result["success"] else 0
    )

    # Broadcast result via WebSocket
    perplexity_update = {
        "session_id": session_id,
        "action": "perplexity_screenshot_ocr",
        "success": result["success"],
        "text_extracted": result.get("text_extracted", False),
        "word_count": result.get("word_count", 0),
        "confidence": result.get("confidence", 0),
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }
    await websocket_service.broadcast_perplexity_update(perplexity_update)

    return {
        "action": "perplexity_screenshot_ocr",
        "result": result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/analyze-screen")
async def analyze_perplexity_screen(request: Request, ocr_engine: str = None):
    """Analyze Perplexity app screen content using OCR"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="perplexity_analyze_screen",
        device_id="unknown"
    )

    # Analyze screen content
    start_time = time.time()
    result = await perplexity_service.analyze_screen_content(ocr_engine)
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if result["success"] else "failed"
    )

    # Broadcast analysis result via WebSocket
    screen_analysis = {
        "session_id": session_id,
        "action": "perplexity_screen_analysis",
        "success": result["success"],
        "word_count": result.get("analysis", {}).get("word_count", 0),
        "confidence": result.get("analysis", {}).get("confidence", 0),
        "ui_elements": result.get("analysis", {}).get("ui_elements", {}),
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }
    await websocket_service.broadcast_perplexity_update(screen_analysis)

    return {
        "action": "perplexity_analyze_screen",
        "result": result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/search-with-ocr-verification")
async def search_perplexity_with_ocr_verification(request: Request, query: str, ocr_engine: str = None):
    """Search in Perplexity and verify results using OCR"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="perplexity_search_ocr_verification",
        device_id="unknown"
    )

    # Perform search
    start_time = time.time()
    search_result = await perplexity_service.search_query(query)

    if not search_result["success"]:
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message="Search failed"
        )
        return {
            "action": "perplexity_search_ocr_verification",
            "search_result": search_result,
            "ocr_verification": None,
            "timestamp": datetime.utcnow().isoformat()
        }

    # Wait a moment for content to load
    await asyncio.sleep(3)

    # Take screenshot and analyze
    ocr_result = await perplexity_service.analyze_screen_content(ocr_engine)
    execution_time = time.time() - start_time

    # Verify search was successful by checking OCR results
    verification = {
        "search_successful": False,
        "response_detected": False,
        "confidence_score": 0,
        "extracted_text": "",
        "verification_details": {}
    }

    if ocr_result["success"]:
        analysis = ocr_result.get("analysis", {})
        extracted_text = analysis.get("text", "")
        confidence = analysis.get("confidence", 0)
        ui_elements = analysis.get("ui_elements", {})

        # Check if search was successful
        verification["extracted_text"] = extracted_text
        verification["confidence_score"] = confidence
        verification["response_detected"] = ui_elements.get("has_response", False)
        verification["search_successful"] = (
            len(extracted_text) > 50 and  # Substantial text
            confidence > 30 and          # Reasonable confidence
            ui_elements.get("has_response", False)
        )
        verification["verification_details"] = {
            "text_length": len(extracted_text),
            "confidence_threshold_met": confidence > 30,
            "ui_elements_found": ui_elements
        }

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if verification["search_successful"] else "failed",
        screenshots_taken=1
    )

    # Broadcast comprehensive result
    comprehensive_result = {
        "session_id": session_id,
        "action": "perplexity_search_ocr_verification",
        "query": query,
        "search_successful": verification["search_successful"],
        "confidence_score": verification["confidence_score"],
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }
    await websocket_service.broadcast_perplexity_update(comprehensive_result)

    return {
        "action": "perplexity_search_ocr_verification",
        "query": query,
        "search_result": search_result,
        "ocr_verification": verification,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

# AI Test endpoints

# Test prompts for different complexity levels
TEST_PROMPTS = {
    "simple": "Hello! Please respond with a brief greeting and tell me what you are.",
    "complex": "Explain the concept of artificial intelligence in simple terms, then discuss its potential benefits and risks for society. Include specific examples and considerations for ethical implementation.",
    "reasoning": "A farmer has 17 sheep. All but 9 die. How many sheep are left? Explain your reasoning step by step.",
    "code": "Write a Python function that takes a list of integers and returns the list sorted in ascending order without using the built-in sort() method. Include a brief explanation of your algorithm.",
    "creative": "Write a short poem about the relationship between humans and technology, focusing on both the opportunities and challenges it presents."
}

# Cost estimation per provider (USD per 1K tokens)
COST_ESTIMATES = {
    "openai": {"gpt-4": 0.03, "gpt-4-turbo": 0.01, "gpt-3.5-turbo": 0.0015},
    "anthropic": {"claude-3-sonnet": 0.015, "claude-3-opus": 0.075, "claude-3-haiku": 0.0025},
    "zai": {"glm-4": 0.01, "glm-3-turbo": 0.005},
    "ollama": {"llama2": 0.0, "codellama": 0.0, "mistral": 0.0}  # Local models are free
}

def estimate_cost(provider: str, model: str, token_usage: dict) -> Optional[float]:
    """Estimate cost based on provider, model, and token usage"""
    try:
        if provider not in COST_ESTIMATES or model not in COST_ESTIMATES[provider]:
            return None

        cost_per_1k = COST_ESTIMATES[provider][model]
        total_tokens = token_usage.get("total_tokens", token_usage.get("prompt_tokens", 0) + token_usage.get("completion_tokens", 0))
        estimated_cost = (total_tokens / 1000) * cost_per_1k
        return round(estimated_cost, 6)
    except Exception:
        return None

def calculate_quality_score(response: str, test_type: str) -> float:
    """Calculate a simple quality score for AI responses"""
    if not response:
        return 0.0

    score = 0.0
    response_length = len(response.strip())

    # Base scoring
    if response_length > 10:
        score += 0.3  # Minimum length met
    if response_length > 50:
        score += 0.2  # Good length
    if response_length > 200:
        score += 0.1  # Excellent length

    # Test type specific scoring
    if test_type == "code":
        if "def " in response or "function" in response.lower():
            score += 0.2
        if "```python" in response or "```" in response:
            score += 0.1
    elif test_type == "reasoning":
        reasoning_keywords = ["because", "therefore", "since", "step", "first", "next", "finally"]
        if any(keyword in response.lower() for keyword in reasoning_keywords):
            score += 0.2
    elif test_type == "creative":
        if len(response.split('\n')) > 2:  # Multiple lines
            score += 0.1
        if any(punct in response for punct in ["!", "?", ".", ";", ":"]):
            score += 0.1

    return min(score, 1.0)

async def test_single_provider(provider_name: str, prompt: str, test_type: str, timeout: int) -> dict:
    """Test a single AI provider"""
    start_time = time.time()

    try:
        # Create AI request
        ai_request = EnhancedAIRequest(
            prompt=prompt,
            system_prompt="You are being tested for connectivity and response quality. Please provide your best response.",
            provider=provider_name,
            temperature=0.7,
            max_tokens=1000,
            metadata={"test_type": test_type, "test_timestamp": datetime.utcnow().isoformat()}
        )

        # Generate response with timeout
        response = await asyncio.wait_for(
            enhanced_ai.generate_response(ai_request),
            timeout=timeout
        )

        execution_time = time.time() - start_time

        # Calculate metrics
        response_length = len(response.response) if response.response else 0
        estimated_cost = estimate_cost(
            provider_name,
            response.model,
            response.usage or {}
        ) if response.usage else None
        quality_score = calculate_quality_score(response.response, test_type) if response.response else 0.0

        return {
            "provider": provider_name,
            "model": response.model,
            "success": response.success,
            "response": response.response,
            "error": response.error,
            "execution_time": execution_time,
            "response_length": response_length,
            "estimated_cost": estimated_cost,
            "token_usage": response.usage,
            "quality_score": quality_score,
            "test_prompt": prompt,
            "metadata": ai_request.metadata
        }

    except asyncio.TimeoutError:
        execution_time = time.time() - start_time
        return {
            "provider": provider_name,
            "model": "unknown",
            "success": False,
            "response": None,
            "error": f"Test timed out after {timeout} seconds",
            "execution_time": execution_time,
            "response_length": 0,
            "estimated_cost": None,
            "token_usage": None,
            "quality_score": 0.0,
            "test_prompt": prompt,
            "metadata": {"timeout": True}
        }
    except Exception as e:
        execution_time = time.time() - start_time
        return {
            "provider": provider_name,
            "model": "unknown",
            "success": False,
            "response": None,
            "error": str(e),
            "execution_time": execution_time,
            "response_length": 0,
            "estimated_cost": None,
            "token_usage": None,
            "quality_score": 0.0,
            "test_prompt": prompt,
            "metadata": {"exception": True}
        }

@app.post("/api/ai/test", response_model=AITestResponse)
async def test_ai_providers(request: Request, test_request: AITestRequest):
    """Test AI providers with comprehensive analysis and comparison"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)
    test_id = str(uuid.uuid4())

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="ai_providers_test",
        device_id="ai_test"
    )

    # Get available providers
    available_providers = enhanced_ai.get_available_providers()
    if not available_providers:
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message="No AI providers configured"
        )
        raise HTTPException(status_code=503, detail="No AI providers configured")

    # Determine which providers to test
    providers_to_test = test_request.providers or available_providers
    if not providers_to_test:
        providers_to_test = available_providers

    # Validate providers exist
    valid_providers = [p for p in providers_to_test if p in available_providers]
    if not valid_providers:
        raise HTTPException(status_code=400, detail=f"None of the specified providers are available. Available: {available_providers}")

    # Determine test prompt
    if test_request.custom_prompt:
        test_prompt = test_request.custom_prompt
    else:
        test_prompt = TEST_PROMPTS.get(test_request.test_type, TEST_PROMPTS["simple"])

    # Broadcast test start
    await websocket_service.broadcast_event("ai_test_started", {
        "test_id": test_id,
        "test_type": test_request.test_type,
        "providers_count": len(valid_providers),
        "providers": valid_providers,
        "session_id": session_id
    })

    start_time = time.time()
    results = []

    try:
        if test_request.parallel:
            # Run tests in parallel
            tasks = [
                test_single_provider(provider, test_prompt, test_request.test_type, test_request.timeout)
                for provider in valid_providers
            ]
            provider_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            for result in provider_results:
                if isinstance(result, Exception):
                    logger.error(f"Provider test failed with exception: {result}")
                    continue
                results.append(result)
        else:
            # Run tests sequentially
            for provider in valid_providers:
                result = await test_single_provider(provider, test_prompt, test_request.test_type, test_request.timeout)
                results.append(result)

        total_execution_time = time.time() - start_time

        # Calculate statistics
        successful_results = [r for r in results if r["success"]]
        failed_results = [r for r in results if not r["success"]]

        # Generate comparison data
        comparison = None
        if len(successful_results) > 1:
            comparison = {
                "fastest_provider": min(successful_results, key=lambda r: r["execution_time"])["provider"],
                "slowest_provider": max(successful_results, key=lambda r: r["execution_time"])["provider"],
                "highest_quality": max(successful_results, key=lambda r: r["quality_score"])["provider"],
                "longest_response": max(successful_results, key=lambda r: r["response_length"])["provider"],
                "most_expensive": max(
                    [r for r in successful_results if r["estimated_cost"] is not None],
                    key=lambda r: r["estimated_cost"]
                )["provider"] if any(r["estimated_cost"] for r in successful_results) else None
            }

        # Prepare execution summary
        execution_summary = {
            "total_execution_time": total_execution_time,
            "average_execution_time": sum(r["execution_time"] for r in results) / len(results) if results else 0,
            "average_response_time": sum(r["execution_time"] for r in successful_results) / len(successful_results) if successful_results else 0,
            "total_estimated_cost": sum(r["estimated_cost"] for r in successful_results if r["estimated_cost"] is not None),
            "average_quality_score": sum(r["quality_score"] for r in successful_results) / len(successful_results) if successful_results else 0,
            "parallel_execution": test_request.parallel,
            "timeout_per_provider": test_request.timeout
        }

        # Save results to database if requested
        if test_request.save_results:
            for result in results:
                await db_manager.save_ai_test_result(result, session_id)

        # Update session
        await db_manager.update_session(
            session_id=session_id,
            status="completed",
            screenshots_taken=0
        )

        # Broadcast completion
        await websocket_service.broadcast_event("ai_test_completed", {
            "test_id": test_id,
            "total_providers": len(valid_providers),
            "successful_providers": len(successful_results),
            "failed_providers": len(failed_results),
            "execution_time": total_execution_time,
            "session_id": session_id
        })

        # Create response
        test_response = AITestResponse(
            test_id=test_id,
            test_type=test_request.test_type,
            total_providers=len(valid_providers),
            successful_providers=len(successful_results),
            failed_providers=len(failed_results),
            results=[AITestResult(**result) for result in results],
            comparison=comparison,
            execution_summary=execution_summary,
            timestamp=datetime.utcnow().isoformat()
        )

        return test_response

    except Exception as e:
        logger.error(f"AI test failed: {e}")

        # Update session with error
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message=str(e)
        )

        # Broadcast error
        await websocket_service.broadcast_event("ai_test_failed", {
            "test_id": test_id,
            "error": str(e),
            "session_id": session_id
        })

        raise HTTPException(status_code=500, detail=f"AI test failed: {str(e)}")

@app.get("/api/ai/test/history")
async def get_ai_test_history(limit: int = 50, provider: str = None, test_type: str = None):
    """Get AI test history from database"""
    try:
        history = await db_manager.get_ai_test_history(limit, provider, test_type)

        return {
            "history": [
                {
                    "id": result.id,
                    "test_id": result.test_id,
                    "test_type": result.test_type,
                    "provider": result.provider,
                    "model": result.model,
                    "success": result.success,
                    "execution_time": result.execution_time,
                    "response_length": result.response_length,
                    "quality_score": result.quality_score,
                    "created_at": result.created_at.isoformat()
                }
                for result in history
            ],
            "total_results": len(history),
            "filters": {
                "limit": limit,
                "provider": provider,
                "test_type": test_type
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get AI test history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ai/test/stats")
async def get_ai_test_statistics():
    """Get AI testing statistics"""
    try:
        stats = await db_manager.get_ai_test_stats()

        return {
            "statistics": stats,
            "available_providers": enhanced_ai.get_available_providers(),
            "test_types": list(TEST_PROMPTS.keys()),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get AI test statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# AI endpoints
@app.post("/api/ai/generate")
async def generate_ai_response(request: Request, prompt: str, provider: str = None):
    """Generate AI response using specified or default provider"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    result = await ai_service.generate_response(prompt, provider)

    return {
        "action": "ai_generate",
        "prompt": prompt,
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/analyze-screenshot")
async def analyze_screenshot(request: Request, image_path: str, query: str = None):
    """Analyze screenshot for UI elements or text"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    result = await ai_service.analyze_screenshot(image_path, query)

    return {
        "action": "analyze_screenshot",
        "image_path": image_path,
        "query": query,
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/suggest-automation")
async def suggest_automation_steps(request: Request, goal: str, current_state: str = None):
    """Suggest automation steps to achieve a goal"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    result = await ai_service.suggest_automation_steps(goal, current_state)

    return {
        "action": "suggest_automation",
        "goal": goal,
        "current_state": current_state,
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

# OCR endpoints
class OCRRequest(BaseModel):
    """OCR request model"""
    image_path: str = Field(..., description="Path to image file")
    engine: Optional[str] = Field(None, description="OCR engine to use (tesseract, easyocr)")
    language: Optional[str] = Field("eng", description="Language code for OCR")
    preprocess: Optional[bool] = Field(True, description="Whether to preprocess image")

class OCRAnalysisRequest(BaseModel):
    """OCR analysis request model"""
    image_path: str = Field(..., description="Path to image file")
    engine: Optional[str] = Field(None, description="OCR engine to use")
    analyze_layout: Optional[bool] = Field(True, description="Whether to analyze text layout")

class OCRAnalyzeRequest(BaseModel):
    """OCR analyze request model for Android screenshots"""
    source: str = Field(..., description="Image source: 'upload' or 'android'")
    engine: Optional[str] = Field(None, description="OCR engine to use (tesseract, easyocr)")
    language: Optional[str] = Field("eng", description="Language code for OCR")
    preprocess: Optional[bool] = Field(True, description="Whether to preprocess image")
    analyze_layout: Optional[bool] = Field(True, description="Whether to analyze text layout")
    extract_blocks: Optional[bool] = Field(False, description="Whether to extract text blocks")
    save_result: Optional[bool] = Field(False, description="Whether to save analysis result")

@app.get("/api/ocr/engines")
async def get_ocr_engines():
    """Get available OCR engines"""
    engines = ocr_service.get_available_engines()

    return {
        "available_engines": engines,
        "default_engine": ocr_service.default_engine,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ocr/extract-text")
async def extract_text_from_image(request: Request, ocr_request: OCRRequest):
    """Extract text from image using OCR"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="ocr_extract_text",
        device_id="unknown"
    )

    # Extract text
    start_time = time.time()

    # Prepare kwargs based on request
    kwargs = {"preprocess": ocr_request.preprocess}
    if ocr_request.engine == "tesseract":
        kwargs["language"] = ocr_request.language
    elif ocr_request.engine == "easyocr":
        kwargs["languages"] = [ocr_request.language]

    result = await ocr_service.extract_text(
        ocr_request.image_path,
        engine=ocr_request.engine,
        **kwargs
    )

    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if "error" not in result else "failed",
        error_message=result.get("error") if "error" in result else None
    )

    # Broadcast OCR result via WebSocket
    ocr_log = {
        "session_id": session_id,
        "action": "ocr_extract_text",
        "image_path": ocr_request.image_path,
        "engine": ocr_request.engine or ocr_service.default_engine,
        "status": "completed" if "error" not in result else "failed",
        "word_count": result.get("word_count", 0),
        "confidence": result.get("confidence", 0),
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }
    await websocket_service.broadcast_automation_log(ocr_log)

    return {
        "action": "ocr_extract_text",
        "request": ocr_request.dict(),
        "result": result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ocr/extract-all-engines")
async def extract_text_all_engines(request: Request, image_path: str, language: str = "eng"):
    """Extract text using all available OCR engines"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="ocr_extract_all",
        device_id="unknown"
    )

    # Extract text using all engines
    start_time = time.time()

    kwargs = {}
    # Prepare kwargs for different engines
    kwargs = {"preprocess": True}
    # Note: This would need to be adapted based on engine requirements

    result = await ocr_service.extract_text_all_engines(image_path, **kwargs)
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if result.get("best_result") else "failed"
    )

    return {
        "action": "ocr_extract_all_engines",
        "image_path": image_path,
        "result": result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ocr/analyze-layout")
async def analyze_text_layout(request: Request, ocr_request: OCRAnalysisRequest):
    """Analyze text layout and structure in image"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="ocr_analyze_layout",
        device_id="unknown"
    )

    # Analyze layout
    start_time = time.time()
    result = await ocr_service.analyze_text_layout(
        ocr_request.image_path,
        engine=ocr_request.engine
    )
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if "error" not in result else "failed",
        error_message=result.get("error") if "error" in result else None
    )

    return {
        "action": "ocr_analyze_layout",
        "request": ocr_request.dict(),
        "result": result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ocr/screenshot-and-extract")
async def screenshot_and_extract_text(request: Request, engine: str = None, preprocess: bool = True):
    """Take screenshot and extract text in one operation"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="screenshot_ocr_extract",
        device_id="unknown"
    )

    # Take screenshot
    start_time = time.time()
    screenshot_result = await android_service.take_screenshot("ocr_extract")

    if not screenshot_result["success"]:
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message="Failed to take screenshot"
        )
        return {
            "action": "screenshot_ocr_extract",
            "error": "Failed to take screenshot",
            "screenshot_result": screenshot_result,
            "timestamp": datetime.utcnow().isoformat()
        }

    # Extract text from screenshot
    image_path = screenshot_result.get("local_path")
    if image_path:
        ocr_result = await ocr_service.extract_text(
            image_path,
            engine=engine,
            preprocess=preprocess
        )
    else:
        ocr_result = {"error": "No screenshot path available"}

    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if "error" not in ocr_result else "failed",
        error_message=ocr_result.get("error") if "error" in ocr_result else None,
        screenshots_taken=1
    )

    # Broadcast combined result
    combined_log = {
        "session_id": session_id,
        "action": "screenshot_ocr_extract",
        "screenshot_path": image_path,
        "ocr_result": {
            "word_count": ocr_result.get("word_count", 0),
            "confidence": ocr_result.get("confidence", 0),
            "engine": ocr_result.get("engine", engine or ocr_service.default_engine)
        },
        "status": "completed" if "error" not in ocr_result else "failed",
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }
    await websocket_service.broadcast_automation_log(combined_log)

    return {
        "action": "screenshot_ocr_extract",
        "screenshot_result": screenshot_result,
        "ocr_result": ocr_result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ocr/analyze")
async def analyze_ocr(
    request: Request,
    file: Optional[UploadFile] = File(None),
    source: str = "upload",
    engine: Optional[str] = None,
    language: str = "eng",
    preprocess: bool = True,
    analyze_layout: bool = True,
    extract_blocks: bool = False,
    save_result: bool = False
):
    """
    Comprehensive OCR analysis endpoint supporting both file uploads and Android screenshots

    Supports:
    - File uploads (multipart/form-data)
    - Android screenshot capture
    - Multiple OCR engines (Tesseract, EasyOCR)
    - Text layout analysis
    - Text block extraction
    - Result saving
    """
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Validate source parameter
    if source not in ["upload", "android"]:
        raise HTTPException(status_code=400, detail="Source must be 'upload' or 'android'")

    # Validate file upload requirement
    if source == "upload" and file is None:
        raise HTTPException(status_code=400, detail="File upload required when source is 'upload'")

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="ocr_analyze",
        device_id="android" if source == "android" else "file_upload"
    )

    start_time = time.time()
    image_path = None

    try:
        # Handle image source
        if source == "upload" and file:
            # Validate file type
            if not file.content_type or not file.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="File must be an image")

            # Generate unique filename
            timestamp = int(time.time() * 1000)
            file_extension = file.filename.split('.')[-1] if file.filename else 'png'
            filename = f"ocr_upload_{timestamp}.{file_extension}"
            image_path = os.path.join("/tmp", filename)

            # Save file
            async with aiofiles.open(image_path, 'wb') as f:
                content = await file.read()
                await f.write(content)

        elif source == "android":
            # Take Android screenshot
            screenshot_result = await android_service.take_screenshot("ocr_analyze")

            if not screenshot_result["success"]:
                await db_manager.update_session(
                    session_id=session_id,
                    status="failed",
                    error_message="Failed to take Android screenshot"
                )
                return {
                    "action": "ocr_analyze",
                    "source": source,
                    "error": "Failed to take Android screenshot",
                    "screenshot_result": screenshot_result,
                    "timestamp": datetime.utcnow().isoformat()
                }

            image_path = screenshot_result.get("local_path")

        else:
            raise HTTPException(status_code=400, detail="Invalid source configuration")

        if not image_path or not os.path.exists(image_path):
            raise HTTPException(status_code=500, detail="Failed to obtain image for OCR analysis")

        # Prepare OCR parameters
        ocr_params = {"preprocess": preprocess}
        if engine == "tesseract":
            ocr_params["language"] = language
        elif engine == "easyocr":
            ocr_params["languages"] = [language]

        # Perform OCR extraction
        ocr_result = await ocr_service.extract_text(image_path, engine, **ocr_params)

        if "error" in ocr_result:
            await db_manager.update_session(
                session_id=session_id,
                status="failed",
                error_message=ocr_result["error"]
            )
            return {
                "action": "ocr_analyze",
                "source": source,
                "image_path": image_path,
                "ocr_result": ocr_result,
                "timestamp": datetime.utcnow().isoformat()
            }

        # Perform additional analysis if requested
        analysis_result = {}

        if analyze_layout:
            layout_analysis = await ocr_service.analyze_text_layout(image_path, engine)
            analysis_result["layout"] = layout_analysis

        if extract_blocks:
            # Extract text blocks based on layout analysis
            words = ocr_result.get("words", [])
            if words:
                text_blocks = _extract_text_blocks(words)
                analysis_result["text_blocks"] = text_blocks
            else:
                analysis_result["text_blocks"] = []

        # Prepare comprehensive result
        execution_time = time.time() - start_time
        result = {
            "action": "ocr_analyze",
            "source": source,
            "image_path": image_path,
            "image_info": {
                "file_size": os.path.getsize(image_path) if os.path.exists(image_path) else 0,
                "file_exists": os.path.exists(image_path)
            },
            "ocr_result": ocr_result,
            "analysis": analysis_result if analysis_result else None,
            "parameters": {
                "engine": engine or ocr_service.default_engine,
                "language": language,
                "preprocess": preprocess,
                "analyze_layout": analyze_layout,
                "extract_blocks": extract_blocks
            },
            "execution_time": round(execution_time, 2),
            "timestamp": datetime.utcnow().isoformat()
        }

        # Save result if requested
        if save_result:
            result_save_path = f"/tmp/ocr_analysis_result_{session_id}.json"
            try:
                async with aiofiles.open(result_save_path, 'w') as f:
                    await f.write(json.dumps(result, indent=2))
                result["result_saved_to"] = result_save_path
            except Exception as save_error:
                logger.warning(f"Failed to save analysis result: {save_error}")
                result["save_error"] = str(save_error)

        # Update session
        await db_manager.update_session(
            session_id=session_id,
            status="completed",
            screenshots_taken=1 if source == "android" else 0
        )

        # Broadcast result via WebSocket
        broadcast_data = {
            "session_id": session_id,
            "action": "ocr_analyze",
            "source": source,
            "success": True,
            "word_count": ocr_result.get("word_count", 0),
            "confidence": ocr_result.get("confidence", 0),
            "engine_used": ocr_result.get("engine", engine),
            "execution_time": round(execution_time, 2),
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket_service.broadcast_automation_log(broadcast_data)

        return result

    except HTTPException:
        # Re-raise HTTP exceptions
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message="HTTP validation error"
        )
        raise

    except Exception as e:
        logger.error(f"OCR analysis failed: {e}")

        # Update session with error
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message=str(e)
        )

        # Broadcast error
        error_broadcast = {
            "session_id": session_id,
            "action": "ocr_analyze",
            "source": source,
            "success": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket_service.broadcast_automation_log(error_broadcast)

        return {
            "action": "ocr_analyze",
            "source": source,
            "error": str(e),
            "image_path": image_path,
            "timestamp": datetime.utcnow().isoformat()
        }

def _extract_text_blocks(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extract text blocks from OCR words based on spatial proximity
    """
    if not words:
        return []

    # Sort words by position
    sorted_words = sorted(words, key=lambda w: (w['bbox']['y'], w['bbox']['x']))

    blocks = []
    current_block = []
    last_y = None
    line_threshold = 25  # Pixels threshold for same line
    block_threshold = 50  # Pixels threshold for same block

    for word in sorted_words:
        y = word['bbox']['y']

        # Check if we should start a new block
        if last_y is not None and abs(y - last_y) > block_threshold:
            if current_block:
                blocks.append(_create_text_block(current_block))
                current_block = [word]
            else:
                current_block.append(word)
        else:
            current_block.append(word)

        last_y = y

    # Add the last block
    if current_block:
        blocks.append(_create_text_block(current_block))

    return blocks

def _create_text_block(words: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create a text block from a list of words
    """
    if not words:
        return {}

    # Calculate block boundaries
    x_coords = [w['bbox']['x'] for w in words]
    y_coords = [w['bbox']['y'] for w in words]
    right_coords = [w['bbox']['x'] + w['bbox']['width'] for w in words]
    bottom_coords = [w['bbox']['y'] + w['bbox']['height'] for w in words]

    # Group words by lines
    lines = []
    current_line = []
    last_y = None
    line_threshold = 25

    for word in sorted(words, key=lambda w: (w['bbox']['y'], w['bbox']['x'])):
        y = word['bbox']['y']

        if last_y is not None and abs(y - last_y) > line_threshold:
            if current_line:
                lines.append(current_line)
                current_line = [word]
            else:
                current_line.append(word)
        else:
            current_line.append(word)

        last_y = y

    if current_line:
        lines.append(current_line)

    return {
        "text": " ".join([w['text'] for w in words]),
        "word_count": len(words),
        "confidence": sum([w['confidence'] for w in words]) / len(words) if words else 0,
        "bbox": {
            "left": min(x_coords),
            "top": min(y_coords),
            "right": max(right_coords),
            "bottom": max(bottom_coords),
            "width": max(right_coords) - min(x_coords),
            "height": max(bottom_coords) - min(y_coords)
        },
        "lines": [
            {
                "text": " ".join([w['text'] for w in line]),
                "words": len(line),
                "confidence": sum([w['confidence'] for w in line]) / len(line) if line else 0
            }
            for line in lines
        ]
    }

# Enhanced AI endpoints
class EnhancedAIRequest(BaseModel):
    """Enhanced AI request model"""
    prompt: str = Field(..., description="The prompt to send to the AI")
    system_prompt: Optional[str] = Field(None, description="System prompt for context")
    provider: Optional[str] = Field(None, description="AI provider to use")
    model: Optional[str] = Field(None, description="Model to use")
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(1000, ge=1, le=4000)
    context: Optional[Dict[str, Any]] = Field(None, description="Conversation context")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")

class ConversationRequest(BaseModel):
    """Conversation request model"""
    conversation_id: Optional[str] = Field(None, description="Conversation ID")
    message: str = Field(..., description="Message to send")
    system_prompt: Optional[str] = Field(None, description="System prompt")
    provider: Optional[str] = Field(None, description="AI provider to use")

class ComparisonRequest(BaseModel):
    """AI comparison request model"""
    prompt: str = Field(..., description="Prompt to compare")
    system_prompt: Optional[str] = Field(None, description="System prompt")
    providers: Optional[List[str]] = Field(None, description="Providers to compare")
    criteria: str = Field("quality", description="Comparison criteria: quality, speed, length")

@app.get("/api/ai/enhanced/providers")
async def get_enhanced_ai_providers():
    """Get detailed information about available AI providers"""
    provider_info = enhanced_ai.get_provider_info()
    health_status = await enhanced_ai.health_check_all()

    return {
        "providers": provider_info,
        "health_status": health_status,
        "available_providers": enhanced_ai.get_available_providers(),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/enhanced/generate")
async def generate_enhanced_ai_response(request: Request, ai_request: EnhancedAIRequest):
    """Generate enhanced AI response with multi-provider support"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="enhanced_ai_generate",
        device_id="unknown"
    )

    # Generate enhanced response
    start_time = time.time()
    response = await enhanced_ai.generate_response(ai_request)
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if response.success else "failed",
        error_message=response.error if not response.success else None
    )

    # Broadcast AI response via WebSocket
    ai_broadcast = {
        "session_id": session_id,
        "action": "enhanced_ai_generate",
        "provider": response.provider,
        "model": response.model,
        "success": response.success,
        "execution_time": round(execution_time, 2),
        "response_length": len(response.response) if response.response else 0,
        "timestamp": datetime.utcnow().isoformat()
    }
    await websocket_service.broadcast_ai_response(ai_broadcast)

    return {
        "action": "enhanced_ai_generate",
        "request": ai_request.dict(),
        "response": response.dict(),
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/enhanced/fallback")
async def generate_with_fallback(request: Request, ai_request: EnhancedAIRequest, fallback_providers: List[str] = None):
    """Generate AI response with fallback to multiple providers"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="enhanced_ai_fallback",
        device_id="unknown"
    )

    # Generate response with fallback
    start_time = time.time()
    response = await enhanced_ai.generate_response_with_fallback(ai_request, fallback_providers)
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if response.success else "failed",
        error_message=response.error if not response.success else None
    )

    return {
        "action": "enhanced_ai_fallback",
        "request": ai_request.dict(),
        "fallback_providers": fallback_providers,
        "response": response.dict(),
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/compare")
async def compare_ai_responses(request: Request, comparison_request: ComparisonRequest):
    """Compare responses from multiple AI providers"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="ai_comparison",
        device_id="unknown"
    )

    # Compare responses
    start_time = time.time()
    comparison_result = await enhanced_ai.compare_provider_responses(
        prompt=comparison_request.prompt,
        providers=comparison_request.providers,
        system_prompt=comparison_request.system_prompt,
        criteria=comparison_request.criteria
    )
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed",
        screenshots_taken=0
    )

    return {
        "action": "ai_comparison",
        "request": comparison_request.dict(),
        "result": comparison_result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/chat")
async def chat_with_context(request: Request, conversation_request: ConversationRequest):
    """Continue conversation with context management"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create or get conversation
    conversation_id = enhanced_ai.create_conversation(
        conversation_id=conversation_request.conversation_id,
        provider=conversation_request.provider
    )

    # Chat with context
    start_time = time.time()
    chat_result = await enhanced_ai.chat_with_context(
        conversation_id=conversation_id,
        message=conversation_request.message,
        system_prompt=conversation_request.system_prompt,
        provider=conversation_request.provider
    )
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if chat_result["response"].success else "failed"
    )

    return {
        "action": "ai_chat",
        "conversation_id": conversation_id,
        "request": conversation_request.dict(),
        "result": chat_result,
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/enhanced/analyze-screenshot")
async def enhanced_analyze_screenshot(request: Request, image_path: str, query: str = None, ocr_text: str = None):
    """Enhanced screenshot analysis with OCR integration"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="enhanced_screenshot_analysis",
        device_id="unknown"
    )

    # Analyze with OCR integration
    start_time = time.time()
    response = await enhanced_ai.analyze_screenshot_with_ocr(
        image_path=image_path,
        ocr_text=ocr_text,
        query=query
    )
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if response.success else "failed",
        error_message=response.error if not response.success else None
    )

    return {
        "action": "enhanced_screenshot_analysis",
        "image_path": image_path,
        "query": query,
        "ocr_text_provided": ocr_text is not None,
        "response": response.dict(),
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/ai/enhanced/suggest-automation")
async def enhanced_suggest_automation(
    request: Request,
    goal: str,
    current_state: str = None,
    screenshot_path: str = None,
    available_tools: List[str] = None
):
    """Enhanced automation suggestions with visual analysis"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="enhanced_automation_suggestions",
        device_id="unknown"
    )

    # Generate enhanced suggestions
    start_time = time.time()
    response = await enhanced_ai.suggest_automation_enhanced(
        goal=goal,
        current_state=current_state,
        screenshot_path=screenshot_path,
        available_tools=available_tools
    )
    execution_time = time.time() - start_time

    # Update session
    await db_manager.update_session(
        session_id=session_id,
        status="completed" if response.success else "failed",
        error_message=response.error if not response.success else None
    )

    return {
        "action": "enhanced_automation_suggestions",
        "goal": goal,
        "current_state": current_state,
        "screenshot_path": screenshot_path,
        "available_tools": available_tools,
        "response": response.dict(),
        "execution_time": round(execution_time, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/ai/conversations")
async def get_conversations():
    """Get all active conversations"""
    conversations = {}
    for conv_id, context in enhanced_ai.contexts.items():
        conversations[conv_id] = {
            "provider": context.provider,
            "model": context.model,
            "message_count": len(context.messages),
            "created_at": context.created_at,
            "last_updated": context.last_updated
        }

    return {
        "conversations": conversations,
        "total_conversations": len(conversations),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.delete("/api/ai/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation context"""
    if conversation_id in enhanced_ai.contexts:
        del enhanced_ai.contexts[conversation_id]
        return {
            "success": True,
            "conversation_id": conversation_id,
            "message": "Conversation deleted successfully",
            "timestamp": datetime.utcnow().isoformat()
        }
    else:
        raise HTTPException(status_code=404, detail="Conversation not found")

# Relay endpoint (original functionality)
@app.post("/api/relay", response_model=RelayResponse)
async def relay_message(payload: MessagePayload, request: Request):
    """Relay chat message to backend processing with Android automation"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Log the message
    logger.info(f"Received message from {payload.sender}: {payload.message[:50]}...")

    # Check if this is an Android automation request
    if payload.sender == "user" and any(keyword in payload.message.lower() for keyword in ["android", "phone", "device", "battery", "screenshot", "open", "camera", "perplexity"]):
        # Get AI response from available provider
        ai_result = await ai_service.generate_response(
            prompt=payload.message,
            system_prompt="You are an Android automation assistant. Convert user requests into actionable steps or provide helpful suggestions for controlling Android devices and apps."
        )

        logger.info(f"AI Response: {ai_result.get('response', 'No response')[:100]}...")

        # Try to execute ADB commands based on AI response
        executed_commands = []
        if ai_result["success"] and "adb shell" in ai_result["response"].lower():
            # Extract ADB commands from AI response
            lines = ai_result["response"].split('\n')
            for line in lines:
                if line.strip().startswith('adb shell'):
                    cmd = line.strip().replace('adb shell ', '')
                    adb_result = await android_service.run_adb_command(f"shell {cmd}")
                    executed_commands.append({"command": cmd, "result": adb_result})

        return RelayResponse(
            status="success",
            message_id=f"msg_{int(datetime.utcnow().timestamp() * 1000)}",
            processed_at=datetime.utcnow().isoformat()
        )

    return RelayResponse(
        status="success",
        message_id=f"msg_{int(datetime.utcnow().timestamp() * 1000)}",
        processed_at=datetime.utcnow().isoformat()
    )

# Analytics endpoints
@app.get("/api/analytics/sessions")
async def get_recent_sessions(limit: int = 10):
    """Get recent automation sessions"""
    sessions = await db_manager.get_recent_sessions(limit)

    return {
        "sessions": [
            {
                "session_id": session.session_id,
                "action": session.action,
                "status": session.status,
                "created_at": session.created_at.isoformat(),
                "completed_at": session.completed_at.isoformat() if session.completed_at else None,
                "screenshots_taken": session.screenshots_taken,
                "error_message": session.error_message
            }
            for session in sessions
        ]
    }

@app.get("/api/analytics/perplexity")
async def get_perplexity_stats():
    """Get Perplexity usage statistics"""
    stats = await db_manager.get_perplexity_stats()

    return {
        "perplexity_analytics": stats,
        "timestamp": datetime.utcnow().isoformat()
    }

# WebSocket endpoints
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint for real-time communication"""
    connection_id = await websocket_service.handle_connection(websocket)

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle the message
            await websocket_service.handle_client_message(message, connection_id)

    except WebSocketDisconnect:
        connection_manager.disconnect(connection_id)
        logger.info(f"WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        connection_manager.disconnect(connection_id)

@app.websocket("/ws/{connection_id}")
async def websocket_endpoint_with_id(websocket: WebSocket, connection_id: str):
    """WebSocket endpoint with predefined connection ID"""
    connection_id = await websocket_service.handle_connection(websocket, connection_id)

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle the message
            await websocket_service.handle_client_message(message, connection_id)

    except WebSocketDisconnect:
        connection_manager.disconnect(connection_id)
        logger.info(f"WebSocket disconnected: {connection_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        connection_manager.disconnect(connection_id)

@app.get("/api/websocket/stats")
async def get_websocket_stats():
    """Get WebSocket connection statistics"""
    return {
        "active_connections": len(connection_manager.active_connections),
        "topic_stats": connection_manager.get_topic_stats(),
        "connections": connection_manager.get_all_connections(),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/websocket/broadcast")
async def broadcast_message(request: dict):
    """Broadcast message to all connected clients"""
    if not request.get("message") or not request.get("topic"):
        raise HTTPException(status_code=400, detail="Message and topic are required")

    message = WebSocketMessage(
        type=request["type"],
        data=request["message"],
        timestamp=datetime.utcnow().isoformat(),
        message_id=str(uuid.uuid4())
    )

    await connection_manager.broadcast_to_topic(message.dict(), request["topic"])

    return {
        "status": "message_broadcast",
        "topic": request["topic"],
        "recipients": len(connection_manager.subscriptions.get(request["topic"], set())),
        "timestamp": datetime.utcnow().isoformat()
    }

# Voice Command Endpoints

class VoiceProfileRequest(BaseModel):
    """Voice profile creation request"""
    user_id: str = Field(..., description="Unique user identifier")
    name: str = Field(..., description="Display name for user")
    preferred_engine: str = Field(default="google", description="Preferred speech engine")
    language: str = Field(default="en-US", description="Language code")
    wake_word: Optional[str] = Field(None, description="Custom wake word")
    voice_sensitivity: float = Field(default=0.5, description="Voice sensitivity (0-1)")

class VoiceCommandRequest(BaseModel):
    """Voice command execution request"""
    timeout: float = Field(default=10.0, description="Listening timeout in seconds")
    engine: Optional[str] = Field(None, description="Speech engine to use")
    execute_command: bool = Field(default=True, description="Whether to execute the recognized command")
    auto_broadcast: bool = Field(default=True, description="Whether to broadcast results via WebSocket")

class AudioTranscriptionRequest(BaseModel):
    """Audio file transcription request"""
    audio_path: str = Field(..., description="Path to audio file")
    engine: str = Field(default="google", description="Speech engine to use")

@app.get("/api/voice/status")
async def get_voice_status():
    """Get voice command service status and capabilities"""
    return voice_command_service.get_state()

@app.post("/api/voice/profile")
async def create_voice_profile(request: VoiceProfileRequest):
    """Create a new voice profile"""
    try:
        profile = voice_command_service.create_voice_profile(
            user_id=request.user_id,
            name=request.name,
            preferred_engine=SpeechEngine(request.preferred_engine),
            language=request.language,
            wake_word=request.wake_word,
            voice_sensitivity=request.voice_sensitivity
        )

        # Broadcast profile creation
        await websocket_service.broadcast_event("voice_profile_created", {
            "user_id": profile.user_id,
            "name": profile.name,
            "engine": profile.preferred_engine.value
        })

        return {
            "status": "profile_created",
            "profile": {
                "user_id": profile.user_id,
                "name": profile.name,
                "preferred_engine": profile.preferred_engine.value,
                "language": profile.language,
                "wake_word": profile.wake_word,
                "voice_sensitivity": profile.voice_sensitivity
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Voice profile creation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/voice/profile/switch")
async def switch_voice_profile(user_id: str):
    """Switch to a different voice profile"""
    try:
        voice_command_service.set_voice_profile(user_id)
        current_profile = voice_command_service.current_profile

        if current_profile:
            # Broadcast profile switch
            await websocket_service.broadcast_event("voice_profile_switched", {
                "user_id": current_profile.user_id,
                "name": current_profile.name
            })

            return {
                "status": "profile_switched",
                "current_profile": {
                    "user_id": current_profile.user_id,
                    "name": current_profile.name,
                    "preferred_engine": current_profile.preferred_engine.value
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            raise HTTPException(status_code=404, detail="Voice profile not found")
    except Exception as e:
        logger.error(f"Voice profile switch failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/voice/profiles")
async def list_voice_profiles():
    """List all available voice profiles"""
    profiles = []
    for user_id, profile in voice_command_service.voice_profiles.items():
        profiles.append({
            "user_id": profile.user_id,
            "name": profile.name,
            "preferred_engine": profile.preferred_engine.value,
            "language": profile.language,
            "wake_word": profile.wake_word,
            "voice_sensitivity": profile.voice_sensitivity
        })

    return {
        "profiles": profiles,
        "current_profile": voice_command_service.current_profile.user_id if voice_command_service.current_profile else None,
        "total_profiles": len(profiles),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/voice/listen")
async def listen_for_voice_command(request: VoiceCommandRequest):
    """Listen for and optionally execute a voice command"""
    try:
        # Start listening
        await websocket_service.broadcast_event("voice_listening_started", {
            "timeout": request.timeout,
            "engine": request.engine or "default"
        })

        engine = SpeechEngine(request.engine) if request.engine else None
        command = await voice_command_service.listen_for_command(
            timeout=request.timeout,
            engine=engine
        )

        if command is None:
            await websocket_service.broadcast_event("voice_listening_timeout", {})
            return {
                "status": "timeout",
                "message": "No voice command detected within timeout period",
                "timestamp": datetime.utcnow().isoformat()
            }

        # Prepare response
        response = {
            "status": "command_recognized",
            "command": {
                "command_id": command.command_id,
                "text": command.text,
                "confidence": command.confidence,
                "engine": command.engine,
                "processing_time": command.processing_time,
                "intent": command.intent,
                "entities": command.entities
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        # Execute command if requested
        if request.execute_command and command.intent:
            await websocket_service.broadcast_event("voice_command_executing", {
                "command_id": command.command_id,
                "intent": command.intent
            })

            execution_result = await voice_command_service.execute_voice_command(
                command,
                android_service
            )

            response["execution_result"] = execution_result
            response["status"] = "command_executed" if execution_result["success"] else "command_failed"

            # Store command in database
            try:
                db = next(get_db())
                from database.models import AutomationSession
                from sqlalchemy import text

                # Store voice command as automation session
                session_data = {
                    'session_id': command.command_id,
                    'user_id': voice_command_service.current_profile.user_id if voice_command_service.current_profile else 'anonymous',
                    'device_id': 'voice_command',
                    'intent': command.intent,
                    'parameters': json.dumps({
                        'text': command.text,
                        'confidence': command.confidence,
                        'engine': command.engine,
                        'execution_result': execution_result
                    }),
                    'status': 'completed' if execution_result["success"] else 'failed',
                    'response_text': execution_result.get('response', ''),
                    'timestamp': command.timestamp
                }

                insert_query = text("""
                    INSERT INTO automation_sessions
                    (session_id, user_id, device_id, intent, parameters, status, response_text, timestamp)
                    VALUES (:session_id, :user_id, :device_id, :intent, :parameters, :status, :response_text, :timestamp)
                """)

                db.execute(insert_query, session_data)
                db.commit()

            except Exception as db_error:
                logger.warning(f"Failed to store voice command in database: {db_error}")

        # Broadcast result if requested
        if request.auto_broadcast:
            await websocket_service.broadcast_event("voice_command_processed", response)

        return response

    except Exception as e:
        logger.error(f"Voice command processing failed: {e}")
        error_response = {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

        if request.auto_broadcast:
            await websocket_service.broadcast_event("voice_command_error", error_response)

        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/voice/commands")
async def get_available_commands():
    """Get list of available voice commands and help text"""
    return {
        "commands": voice_command_service.command_handlers,
        "help_text": voice_command_service._get_help_text(),
        "total_commands": len(voice_command_service.command_handlers),
        "categories": {
            "navigation": ["go home", "go back", "scroll up", "scroll down", "swipe left", "swipe right"],
            "applications": ["open chrome", "open messages", "open camera", "close app"],
            "automation": ["take screenshot", "start recording", "stop recording", "refresh page"],
            "system": ["volume up", "volume down", "mute", "unmute"],
            "assistant": ["hey assistant", "help me", "what can i say"]
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/voice/transcribe")
async def transcribe_audio_file(request: AudioTranscriptionRequest):
    """Transcribe an audio file to text"""
    try:
        result = await voice_command_service.transcribe_audio_file(
            request.audio_path,
            SpeechEngine(request.engine)
        )

        # Broadcast transcription if successful
        if "text" in result and result["text"]:
            await websocket_service.broadcast_event("audio_transcribed", {
                "audio_path": request.audio_path,
                "text": result["text"],
                "engine": result["engine"],
                "confidence": result.get("confidence", 0)
            })

        return {
            "status": "transcription_completed",
            "result": result,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Audio transcription failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/voice/state")
async def get_voice_service_state():
    """Get detailed voice service state"""
    state = voice_command_service.get_state()

    # Add additional state information
    state.update({
        "available_commands": list(voice_command_service.command_handlers.keys()),
        "current_time": datetime.utcnow().isoformat(),
        "service_uptime": time.time(),  # This would need to be calculated from start time
        "profiles": list(voice_command_service.voice_profiles.keys())
    })

    return state

# Analytics Endpoints

class AnalyticsEventRequest(BaseModel):
    """Analytics event tracking request"""
    event_type: str = Field(..., description="Type of event")
    user_id: str = Field(..., description="User identifier")
    device_id: str = Field(..., description="Device identifier")
    session_id: str = Field(..., description="Session identifier")
    data: Dict[str, Any] = Field(default_factory=dict, description="Event data")
    duration_ms: Optional[int] = Field(None, description="Event duration in milliseconds")
    success: bool = Field(default=True, description="Whether the event was successful")
    error_message: Optional[str] = Field(None, description="Error message if failed")

class AnalyticsQueryRequest(BaseModel):
    """Analytics query request"""
    start_date: Optional[datetime] = Field(None, description="Start date for query")
    end_date: Optional[datetime] = Field(None, description="End date for query")
    event_type: Optional[str] = Field(None, description="Filter by event type")
    device_id: Optional[str] = Field(None, description="Filter by device ID")

@app.post("/api/analytics/track")
async def track_analytics_event(request: AnalyticsEventRequest):
    """Track an analytics event"""
    try:
        event_id = await analytics_service.track_event(
            event_type=request.event_type,
            user_id=request.user_id,
            device_id=request.device_id,
            session_id=request.session_id,
            data=request.data,
            duration_ms=request.duration_ms,
            success=request.success,
            error_message=request.error_message
        )

        if event_id:
            # Broadcast event to WebSocket clients
            await websocket_service.broadcast_event("analytics_event_tracked", {
                "event_id": event_id,
                "event_type": request.event_type,
                "user_id": request.user_id,
                "device_id": request.device_id,
                "success": request.success
            })

            return {
                "status": "event_tracked",
                "event_id": event_id,
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to track event")

    except Exception as e:
        logger.error(f"Analytics event tracking failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/performance")
async def get_performance_metrics(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    event_type: Optional[str] = None
):
    """Get performance metrics"""
    try:
        metrics = await analytics_service.get_performance_metrics(
            start_date=start_date,
            end_date=end_date,
            event_type=event_type
        )

        return {
            "metrics": {
                "total_requests": metrics.total_requests,
                "successful_requests": metrics.successful_requests,
                "failed_requests": metrics.failed_requests,
                "average_response_time": metrics.average_response_time,
                "median_response_time": metrics.median_response_time,
                "p95_response_time": metrics.p95_response_time,
                "requests_per_minute": metrics.requests_per_minute,
                "error_rate": metrics.error_rate,
                "uptime_percentage": metrics.uptime_percentage
            },
            "period": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "event_type": event_type
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get performance metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/usage")
async def get_usage_metrics(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    """Get usage metrics"""
    try:
        metrics = await analytics_service.get_usage_metrics(
            start_date=start_date,
            end_date=end_date
        )

        return {
            "metrics": {
                "active_users": metrics.active_users,
                "total_sessions": metrics.total_sessions,
                "average_session_duration": metrics.average_session_duration,
                "most_used_features": metrics.most_used_features,
                "voice_command_usage": metrics.voice_command_usage,
                "ocr_usage": metrics.ocr_usage,
                "ai_provider_usage": metrics.ai_provider_usage
            },
            "period": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get usage metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/devices")
async def get_device_metrics(device_id: Optional[str] = None):
    """Get device metrics"""
    try:
        devices = await analytics_service.get_device_metrics(device_id=device_id)

        return {
            "devices": [
                {
                    "device_id": device.device_id,
                    "device_name": device.device_name,
                    "connection_count": device.connection_count,
                    "total_commands": device.total_commands,
                    "successful_commands": device.successful_commands,
                    "average_response_time": device.average_response_time,
                    "battery_usage": device.battery_usage,
                    "app_usage": device.app_usage,
                    "last_seen": device.last_seen.isoformat() if device.last_seen else None
                }
                for device in devices
            ],
            "total_devices": len(devices),
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get device metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/system")
async def get_system_metrics():
    """Get system-wide metrics"""
    try:
        metrics = await analytics_service.get_system_metrics()

        return {
            "metrics": {
                "cpu_usage": metrics.cpu_usage,
                "memory_usage": metrics.memory_usage,
                "disk_usage": metrics.disk_usage,
                "network_throughput": metrics.network_throughput,
                "active_connections": metrics.active_connections,
                "database_size_mb": metrics.database_size_mb,
                "log_size_mb": metrics.log_size_mb
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get system metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/summary")
async def get_analytics_summary(days: int = 7):
    """Get comprehensive analytics summary"""
    try:
        if days < 1 or days > 365:
            raise HTTPException(status_code=400, detail="Days must be between 1 and 365")

        summary = await analytics_service.get_analytics_summary(days=days)

        return summary

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get analytics summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/trends")
async def get_analytics_trends(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    """Get daily analytics trends"""
    try:
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        trends = await analytics_service._get_daily_trends(start_date, end_date)

        return {
            "trends": trends,
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get analytics trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analytics/cleanup")
async def cleanup_analytics_data(days_to_keep: int = 90):
    """Clean up old analytics data"""
    try:
        if days_to_keep < 7 or days_to_keep > 365:
            raise HTTPException(status_code=400, detail="Days to keep must be between 7 and 365")

        await analytics_service.cleanup_old_data(days_to_keep=days_to_keep)

        # Broadcast cleanup event
        await websocket_service.broadcast_event("analytics_data_cleaned", {
            "days_to_keep": days_to_keep,
            "timestamp": datetime.utcnow().isoformat()
        })

        return {
            "status": "cleanup_completed",
            "days_to_keep": days_to_keep,
            "timestamp": datetime.utcnow().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analytics data cleanup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/dashboard")
async def get_analytics_dashboard_data():
    """Get analytics dashboard data (combined metrics)"""
    try:
        # Get various metrics for the dashboard
        now = datetime.utcnow()
        yesterday = now - timedelta(days=1)
        last_week = now - timedelta(days=7)
        last_month = now - timedelta(days=30)

        # Performance metrics for different periods
        performance_today = await analytics_service.get_performance_metrics(yesterday, now)
        performance_week = await analytics_service.get_performance_metrics(last_week, now)
        performance_month = await analytics_service.get_performance_metrics(last_month, now)

        # Usage metrics
        usage_today = await analytics_service.get_usage_metrics(yesterday, now)
        usage_week = await analytics_service.get_usage_metrics(last_week, now)

        # Device metrics
        devices = await analytics_service.get_device_metrics()

        # System metrics
        system = await analytics_service.get_system_metrics()

        # Recent trends
        trends = await analytics_service._get_daily_trends(last_week, now)

        return {
            "dashboard": {
                "performance": {
                    "today": {
                        "total_requests": performance_today.total_requests,
                        "success_rate": 100 - performance_today.error_rate,
                        "avg_response_time": performance_today.average_response_time,
                        "requests_per_minute": performance_today.requests_per_minute
                    },
                    "week": {
                        "total_requests": performance_week.total_requests,
                        "success_rate": 100 - performance_week.error_rate,
                        "avg_response_time": performance_week.average_response_time,
                        "requests_per_minute": performance_week.requests_per_minute
                    },
                    "month": {
                        "total_requests": performance_month.total_requests,
                        "success_rate": 100 - performance_month.error_rate,
                        "avg_response_time": performance_month.average_response_time,
                        "requests_per_minute": performance_month.requests_per_minute
                    }
                },
                "usage": {
                    "today": {
                        "active_users": usage_today.active_users,
                        "total_sessions": usage_today.total_sessions,
                        "avg_session_duration": usage_today.average_session_duration
                    },
                    "week": {
                        "active_users": usage_week.active_users,
                        "total_sessions": usage_week.total_sessions,
                        "avg_session_duration": usage_week.average_session_duration
                    }
                },
                "devices": {
                    "total_devices": len(devices),
                    "active_devices": len([d for d in devices if (datetime.utcnow() - d.last_seen).total_seconds() < 3600]),
                    "top_devices": [
                        {
                            "device_id": device.device_id,
                            "device_name": device.device_name,
                            "connection_count": device.connection_count,
                            "total_commands": device.total_commands
                        }
                        for device in devices[:5]
                    ]
                },
                "system": {
                    "cpu_usage": system.cpu_usage,
                    "memory_usage": system.memory_usage,
                    "disk_usage": system.disk_usage,
                    "database_size_mb": system.database_size_mb,
                    "active_connections": system.active_connections
                },
                "trends": trends[-7:],  # Last 7 days
                "top_features": usage_today.most_used_features[:5],
                "voice_commands": usage_today.voice_command_usage,
                "ocr_usage": usage_today.ocr_usage,
                "ai_usage": usage_today.ai_provider_usage
            },
            "generated_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get analytics dashboard data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# External Agent Delegation Endpoints

class DelegationRequest(BaseModel):
    """External agent delegation request"""
    title: str = Field(..., description="Task title")
    description: str = Field(..., description="Detailed task description")
    category: str = Field(..., description="Task category")
    complexity: str = Field(..., description="Task complexity level")
    requirements: List[str] = Field(default_factory=list, description="Task requirements")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")
    preferred_agent: Optional[str] = Field(None, description="Preferred external agent")
    urgency: str = Field("medium", description="Task urgency: low, medium, high, critical")

class DelegationStatusRequest(BaseModel):
    """Delegation status check request"""
    task_id: str = Field(..., description="Task ID to check")

class AgentCapabilitiesRequest(BaseModel):
    """Agent capabilities request"""
    agent_name: Optional[str] = Field(None, description="Specific agent to query")

@app.post("/api/external-agent/delegate")
async def delegate_task_to_external_agent(request: Request, delegation_request: DelegationRequest):
    """Delegate task to external AI agent"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    session_id = get_session_id(request)

    # Create session log
    await db_manager.create_session(
        session_id=session_id,
        action="external_agent_delegation",
        device_id="external_agent"
    )

    try:
        # Convert string enums to actual enums
        category = TaskCategory(delegation_request.category)
        complexity = TaskComplexity(delegation_request.complexity)

        # Create external task
        external_task = ExternalTask(
            title=delegation_request.title,
            description=delegation_request.description,
            category=category,
            complexity=complexity,
            requirements=delegation_request.requirements,
            context=delegation_request.context or {},
            preferred_agent=delegation_request.preferred_agent,
            urgency=delegation_request.urgency,
            session_id=session_id
        )

        # Start delegation process
        start_time = time.time()

        # Broadcast delegation start
        await websocket_service.broadcast_event("external_agent_delegation_started", {
            "task_id": external_task.task_id,
            "title": external_task.title,
            "category": external_task.category.value,
            "complexity": external_task.complexity.value,
            "preferred_agent": external_task.preferred_agent
        })

        # Delegate task
        result = await external_delegator.delegate_task(
            external_task,
            perplexity_service=perplexity_service,
            ai_service=enhanced_ai,
            android_service=android_service
        )

        execution_time = time.time() - start_time

        # Update session
        await db_manager.update_session(
            session_id=session_id,
            status="completed" if result.success else "failed",
            error_message=result.error if not result.success else None
        )

        # Broadcast delegation result
        await websocket_service.broadcast_event("external_agent_delegation_completed", {
            "task_id": external_task.task_id,
            "success": result.success,
            "agent_used": result.agent_used,
            "execution_time": round(execution_time, 2),
            "quality_score": result.quality_score,
            "error": result.error if not result.success else None
        })

        return {
            "action": "external_agent_delegation",
            "task_id": external_task.task_id,
            "request": delegation_request.dict(),
            "result": result.dict(),
            "execution_time": round(execution_time, 2),
            "timestamp": datetime.utcnow().isoformat()
        }

    except ValueError as e:
        # Invalid enum values
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message=str(e)
        )
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {str(e)}")
    except Exception as e:
        logger.error(f"External agent delegation failed: {e}")
        await db_manager.update_session(
            session_id=session_id,
            status="failed",
            error_message=str(e)
        )
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/external-agent/status/{task_id}")
async def get_delegation_status(task_id: str):
    """Get status of delegated task"""
    try:
        result = await external_delegator.get_delegation_result(task_id)

        if result is None:
            raise HTTPException(status_code=404, detail="Task not found")

        return {
            "task_id": task_id,
            "status": result.status,
            "result": result.dict(),
            "timestamp": datetime.utcnow().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get delegation status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/external-agent/agents")
async def get_available_agents():
    """Get list of available external agents and their capabilities"""
    try:
        agents = external_delegator.get_available_agents()

        return {
            "agents": agents,
            "total_agents": len(agents),
            "categories": list(TaskCategory.__members__.keys()),
            "complexity_levels": list(TaskComplexity.__members__.keys()),
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get available agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/external-agent/agent/{agent_name}")
async def get_agent_capabilities(agent_name: str):
    """Get detailed capabilities of a specific agent"""
    try:
        agents = external_delegator.get_available_agents()
        agent = next((a for a in agents if a["name"] == agent_name), None)

        if agent is None:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

        return {
            "agent": agent,
            "timestamp": datetime.utcnow().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get agent capabilities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/external-agent/history")
async def get_delegation_history(limit: int = 20, status_filter: str = None):
    """Get delegation history"""
    try:
        # Get recent delegation sessions from database
        sessions = await db_manager.get_recent_sessions(limit * 2)  # Get more to filter

        delegation_history = []
        for session in sessions:
            if session.action == "external_agent_delegation":
                if status_filter and session.status != status_filter:
                    continue

                delegation_history.append({
                    "session_id": session.session_id,
                    "status": session.status,
                    "created_at": session.created_at.isoformat(),
                    "completed_at": session.completed_at.isoformat() if session.completed_at else None,
                    "error_message": session.error_message
                })

        return {
            "history": delegation_history[:limit],
            "total_count": len(delegation_history),
            "status_filter": status_filter,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get delegation history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/external-agent/metrics")
async def get_delegation_metrics():
    """Get delegation performance metrics"""
    try:
        # Get delegation sessions from database
        sessions = await db_manager.get_recent_sessions(100)  # Last 100 sessions

        delegation_sessions = [s for s in sessions if s.action == "external_agent_delegation"]

        if not delegation_sessions:
            return {
                "total_delegations": 0,
                "success_rate": 0,
                "average_execution_time": 0,
                "top_agents": [],
                "top_categories": [],
                "timestamp": datetime.utcnow().isoformat()
            }

        # Calculate metrics
        successful = len([s for s in delegation_sessions if s.status == "completed"])
        total = len(delegation_sessions)
        success_rate = (successful / total) * 100 if total > 0 else 0

        # Calculate average execution time
        execution_times = []
        for session in delegation_sessions:
            if session.completed_at and session.created_at:
                duration = (session.completed_at - session.created_at).total_seconds()
                execution_times.append(duration)

        avg_execution_time = sum(execution_times) / len(execution_times) if execution_times else 0

        return {
            "total_delegations": total,
            "successful_delegations": successful,
            "failed_delegations": total - successful,
            "success_rate": round(success_rate, 2),
            "average_execution_time": round(avg_execution_time, 2),
            "recent_activity": [
                {
                    "session_id": s.session_id,
                    "status": s.status,
                    "created_at": s.created_at.isoformat()
                }
                for s in delegation_sessions[:10]
            ],
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to get delegation metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/external-agent/cancel/{task_id}")
async def cancel_delegation(task_id: str):
    """Cancel an ongoing delegation"""
    try:
        # For now, we'll just update the session status
        # In a real implementation, you might want to actually interrupt the delegation process
        session = await db_manager.get_session(task_id)

        if not session or session.action != "external_agent_delegation":
            raise HTTPException(status_code=404, detail="Task not found")

        if session.status not in ["pending", "in_progress"]:
            raise HTTPException(status_code=400, detail="Task cannot be cancelled")

        await db_manager.update_session(
            session_id=task_id,
            status="cancelled",
            error_message="Task cancelled by user"
        )

        # Broadcast cancellation
        await websocket_service.broadcast_event("external_agent_delegation_cancelled", {
            "task_id": task_id,
            "timestamp": datetime.utcnow().isoformat()
        })

        return {
            "status": "cancelled",
            "task_id": task_id,
            "message": "Task successfully cancelled",
            "timestamp": datetime.utcnow().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel delegation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/external-agent/classify-task")
async def classify_task_for_delegation(request: Request, description: str):
    """Classify a task description to determine optimal delegation strategy"""
    if not await verify_api_key(request):
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        # Use the delegator's classification system
        external_task = ExternalTask(
            title="Task Classification",
            description=description,
            category=TaskCategory.OTHER,  # Will be determined by classifier
            complexity=TaskComplexity.MEDIUM,  # Will be determined by classifier
            requirements=[],
            context={}
        )

        # Get agent recommendations
        recommendations = external_delegator.get_agent_recommendations(external_task)

        return {
            "classification": {
                "title": external_task.title,
                "description": description,
                "estimated_category": external_task.category.value,
                "estimated_complexity": external_task.complexity.value
            },
            "recommendations": recommendations,
            "suggested_agents": [rec["agent"] for rec in recommendations[:3]],
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Task classification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_refactored:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )