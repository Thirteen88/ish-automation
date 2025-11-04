"""
88 3ee AI Backend Proxy
FastAPI-based multi-instance AI server for intelligent query routing
"""
import os
import logging
import subprocess
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv
import httpx

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class Config:
    """Application configuration"""
    BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "")
    ISHCHAT_API_URL = os.getenv("ISHCHAT_API_URL", "")
    ISHCHAT_TIMEOUT = int(os.getenv("ISHCHAT_TIMEOUT", "30"))
    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

    # ZAI Configuration
    ZAI_API_KEY = os.getenv("ZAI_API_KEY", "")
    ZAI_API_URL = os.getenv("ZAI_API_URL", "")
    ZAI_MODEL = os.getenv("ZAI_MODEL", "glm-4-coding-max")

config = Config()

# Android Automation Functions
async def run_adb_command(command: str) -> Dict[str, Any]:
    """Execute ADB command and return result"""
    try:
        result = subprocess.run(
            f"adb {command}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=30
        )
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "stdout": "",
            "stderr": "Command timed out",
            "returncode": -1
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "returncode": -1
        }

async def call_zai_api(prompt: str) -> str:
    """Call ZAI GLM API for AI processing"""
    if not config.ZAI_API_KEY or not config.ZAI_API_URL:
        return "ZAI API not configured"

    headers = {
        "Authorization": f"Bearer {config.ZAI_API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": config.ZAI_MODEL,
        "messages": [
            {"role": "system", "content": "You are an Android automation assistant. Convert user requests into ADB commands or provide helpful Android device control suggestions."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 1000
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(config.ZAI_API_URL, headers=headers, json=data)
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"ZAI API error: {e}")
        return f"Error calling ZAI API: {str(e)}"

# Perplexity App Automation Functions
async def open_perplexity() -> Dict[str, Any]:
    """Open Perplexity app"""
    return await run_adb_command("shell monkey -p ai.perplexity.app.android -c android.intent.category.LAUNCHER 1")

async def perplexity_search(query: str) -> Dict[str, Any]:
    """Search in Perplexity app"""
    # First open the app
    open_result = await open_perplexity()
    if not open_result["success"]:
        return open_result

    # Wait for app to load
    await asyncio.sleep(2)

    # Tap on search bar (coordinates may need adjustment)
    search_tap = await run_adb_command("shell input tap 540 200")

    if search_tap["success"]:
        # Type the query
        await asyncio.sleep(1)
        type_result = await run_adb_command(f"shell input text '{query}'")

        if type_result["success"]:
            # Press Enter
            await asyncio.sleep(1)
            enter_result = await run_adb_command("shell input keyevent KEYCODE_ENTER")
            return enter_result

    return search_tap

async def perplexity_screenshot() -> Dict[str, Any]:
    """Take screenshot of Perplexity app"""
    # Take screenshot
    screenshot = await run_adb_command("shell screencap -p /sdcard/perplexity_screenshot.png")

    if screenshot["success"]:
        # Pull screenshot to computer
        pull_result = await run_adb_command("pull /sdcard/perplexity_screenshot.png /tmp/perplexity_screenshot.png")
        return pull_result

    return screenshot

async def get_perplexity_text() -> str:
    """Get text content from Perplexity app (basic implementation)"""
    # This is a simplified implementation - in a real scenario, you'd use
    # UIAutomator or other accessibility services to extract text
    screenshot = await perplexity_screenshot()

    if screenshot["success"]:
        # You could use OCR here to extract text from screenshot
        return "Screenshot saved to /tmp/perplexity_screenshot.png"

    return "Failed to capture screenshot"

# Advanced Perplexity Automation Functions
async def find_model_selector() -> Dict[str, Any]:
    """Find model selector by trying multiple common locations"""
    # Common model selector locations (x, y coordinates)
    potential_locations = [
        (1000, 150),  # Top right
        (900, 200),   # Upper right
        (540, 100),   # Top center
        (1080, 300),  # Far right
        (100, 150),   # Top left
        (200, 200),   # Upper left
    ]

    results = []

    for i, (x, y) in enumerate(potential_locations):
        # Tap on location
        tap_result = await run_adb_command(f"shell input tap {x} {y}")

        # Wait for UI response
        await asyncio.sleep(1)

        # Take screenshot
        screenshot = await perplexity_screenshot()

        results.append({
            "location": f"({x}, {y})",
            "tap_result": tap_result,
            "screenshot_result": screenshot,
            "screenshot_file": f"/tmp/perplexity_model_selector_{i}.png" if screenshot["success"] else None
        })

        # If screenshot was successful, copy it with unique name
        if screenshot["success"]:
            await run_adb_command(f"shell cp /sdcard/perplexity_screenshot.png /sdcard/perplexity_model_selector_{i}.png")
            await run_adb_command(f"pull /sdcard/perplexity_model_selector_{i}.png /tmp/perplexity_model_selector_{i}.png")

    return {
        "success": True,
        "locations_tested": len(potential_locations),
        "results": results
    }

async def map_perplexity_interface() -> Dict[str, Any]:
    """Map out the Perplexity interface by systematic tapping"""
    # Create a grid of tap points
    screen_width, screen_height = 1080, 2400  # Typical phone resolution
    grid_points = []

    # Create grid with 100px spacing
    for x in range(100, screen_width, 100):
        for y in range(100, screen_height, 200):  # Vertical spacing larger
            grid_points.append((x, y))

    interface_map = []
    screenshot_count = 0

    for i, (x, y) in enumerate(grid_points[:30]):  # Limit to 30 points for practicality
        # Tap on location
        tap_result = await run_adb_command(f"shell input tap {x} {y}")

        # Wait for UI response
        await asyncio.sleep(0.5)

        # Take screenshot
        screenshot = await perplexity_screenshot()

        if screenshot["success"]:
            screenshot_count += 1
            # Save screenshot with unique name
            await run_adb_command(f"shell cp /sdcard/perplexity_screenshot.png /sdcard/interface_map_{i}.png")
            await run_adb_command(f"pull /sdcard/interface_map_{i}.png /tmp/interface_map_{i}.png")

        interface_map.append({
            "point": i,
            "coordinates": (x, y),
            "tap_result": tap_result["success"],
            "screenshot_taken": screenshot["success"],
            "screenshot_file": f"/tmp/interface_map_{i}.png" if screenshot["success"] else None
        })

    return {
        "success": True,
        "total_points_tested": len(grid_points[:30]),
        "screenshots_captured": screenshot_count,
        "interface_map": interface_map
    }

async def cycle_through_models() -> Dict[str, Any]:
    """Cycle through available models by finding and using model selector"""
    cycle_results = []

    # First try to find model selector
    model_finder = await find_model_selector()
    cycle_results.append({"action": "find_model_selector", "result": model_finder})

    # Try common model selector interactions
    model_actions = [
        "shell input tap 900 200",   # Tap model selector
        "shell input keyevent KEYCODE_DPAD_DOWN",  # Navigate down
        "shell input keyevent KEYCODE_DPAD_DOWN",  # Navigate down
        "shell input keyevent KEYCODE_ENTER",      # Select model
        "shell input tap 540 400",   # Tap on first model option
        "shell input tap 540 500",   # Tap on second model option
        "shell input tap 540 600",   # Tap on third model option
    ]

    for i, action in enumerate(model_actions):
        # Execute action
        action_result = await run_adb_command(action)

        # Wait for UI response
        await asyncio.sleep(2)

        # Take screenshot to see result
        screenshot = await perplexity_screenshot()

        if screenshot["success"]:
            await run_adb_command(f"shell cp /sdcard/perplexity_screenshot.png /sdcard/model_cycle_{i}.png")
            await run_adb_command(f"pull /sdcard/model_cycle_{i}.png /tmp/model_cycle_{i}.png")

        cycle_results.append({
            "step": i,
            "action": action,
            "action_result": action_result,
            "screenshot_taken": screenshot["success"],
            "screenshot_file": f"/tmp/model_cycle_{i}.png" if screenshot["success"] else None
        })

    return {
        "success": True,
        "total_actions": len(model_actions),
        "cycle_results": cycle_results
    }

async def smart_model_selector() -> Dict[str, Any]:
    """Smart model selector that tries multiple approaches"""
    approaches = []

    # Approach 1: Try direct tap on common model selector locations
    await run_adb_command("shell input tap 900 200")
    await asyncio.sleep(1)
    screenshot1 = await perplexity_screenshot()
    approaches.append({"method": "direct_tap_top_right", "success": screenshot1["success"]})

    # Approach 2: Try accessing menu
    await run_adb_command("shell input tap 1000 200")
    await asyncio.sleep(1)
    screenshot2 = await perplexity_screenshot()
    approaches.append({"method": "menu_tap", "success": screenshot2["success"]})

    # Approach 3: Try three-finger swipe down (common for model selector)
    await run_adb_command("shell input touchscreen swipe 540 100 540 800 300")
    await asyncio.sleep(1)
    screenshot3 = await perplexity_screenshot()
    approaches.append({"method": "swipe_down", "success": screenshot3["success"]})

    # Approach 4: Try long press on search area
    await run_adb_command("shell input touchscreen swipe 540 200 540 200 1000")
    await asyncio.sleep(1)
    screenshot4 = await perplexity_screenshot()
    approaches.append({"method": "long_press_search", "success": screenshot4["success"]})

    return {
        "success": any(approach["success"] for approach in approaches),
        "approaches_tried": len(approaches),
        "approach_results": approaches,
        "screenshots_saved": sum(1 for app in approaches if app["success"])
    }

# Data models
class MessagePayload(BaseModel):
    """Incoming message from client"""
    sender: str = Field(..., description="Message sender: 'user' or 'bot'")
    message: str = Field(..., min_length=1, max_length=10000)
    timestamp: str
    metadata: Optional[dict] = None

    @validator('sender')
    def validate_sender(cls, v):
        if v not in ['user', 'bot']:
            raise ValueError('Sender must be "user" or "bot"')
        return v

class RelayResponse(BaseModel):
    """Response to client"""
    status: str
    message_id: Optional[str] = None
    processed_at: str

# Lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    logger.info("Starting 88 3ee AI multi-instance platform")
    app.state.http_client = httpx.AsyncClient(timeout=config.ISHCHAT_TIMEOUT)
    yield
    logger.info("Shutting down 88 3ee AI platform")
    await app.state.http_client.aclose()

# Create FastAPI app
app = FastAPI(
    title="88 3ee AI - Multi-Instance AI Platform",
    version="1.0.0",
    description="Enterprise-grade multi-instance AI system powered by Thirteen 88",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/relay", response_model=RelayResponse)
async def relay_message(
    payload: MessagePayload,
    request: Request
):
    """
    Relay chat message to backend processing with Android automation
    """
    try:
        # Verify authentication if configured
        if config.BACKEND_API_KEY:
            api_key = request.headers.get("X-API-Key")
            if api_key != config.BACKEND_API_KEY:
                raise HTTPException(status_code=401, detail="Invalid API key")

        # Log the message
        logger.info(f"Received message from {payload.sender}: {payload.message[:50]}...")

        # Check if this is an Android automation request
        if payload.sender == "user" and any(keyword in payload.message.lower() for keyword in ["android", "phone", "device", "battery", "screenshot", "open", "camera"]):
            # Get AI response from ZAI
            ai_response = await call_zai_api(payload.message)
            logger.info(f"ZAI Response: {ai_response[:100]}...")

            # Try to execute ADB commands based on AI response
            adb_result = None
            if "adb shell" in ai_response.lower():
                # Extract ADB command from AI response
                lines = ai_response.split('\n')
                for line in lines:
                    if line.strip().startswith('adb shell'):
                        cmd = line.strip().replace('adb shell ', '')
                        adb_result = await run_adb_command(f"shell {cmd}")
                        break

            return RelayResponse(
                status="success",
                message_id=f"msg_{int(datetime.utcnow().timestamp() * 1000)}",
                processed_at=datetime.utcnow().isoformat()
            )

        # Forward to ish.chat API if available and sender is user
        if config.ISHCHAT_API_URL and payload.sender == "user":
            try:
                response = await request.app.state.http_client.post(
                    config.ISHCHAT_API_URL,
                    json={"prompt": payload.message}
                )
                response.raise_for_status()
                logger.info("Successfully forwarded to ish.chat API")
            except httpx.HTTPError as e:
                logger.error(f"Failed to forward to ish.chat: {e}")

        # Add your business logic here
        # Store message, trigger workflows, etc.

        return RelayResponse(
            status="success",
            message_id=f"msg_{int(datetime.utcnow().timestamp() * 1000)}",
            processed_at=datetime.utcnow().isoformat()
        )

    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/send")
async def send_to_ishchat(
    prompt: str,
    request: Request
):
    """
    Send message directly to ish.chat API (if available)
    """
    if not config.ISHCHAT_API_URL:
        raise HTTPException(
            status_code=501,
            detail="ish.chat API URL not configured"
        )

    # Verify authentication if configured
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        response = await request.app.state.http_client.post(
            config.ISHCHAT_API_URL,
            json={"prompt": prompt}
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        logger.error(f"ish.chat API error: {e}")
        raise HTTPException(status_code=502, detail="Failed to reach ish.chat API")

@app.post("/api/android/execute")
async def execute_adb_command(
    command: str,
    request: Request
):
    """
    Execute ADB command on connected Android device
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Execute the command
    result = await run_adb_command(command)
    return {
        "command": command,
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/android/ai-automate")
async def ai_automate(
    request_text: str,
    request: Request
):
    """
    Use AI to convert natural language to ADB commands and execute them
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Get AI response from ZAI
    ai_response = await call_zai_api(f"Convert this request to an ADB command: {request_text}")

    # Execute ADB commands if found in AI response
    executed_commands = []
    if "adb shell" in ai_response.lower():
        lines = ai_response.split('\n')
        for line in lines:
            if line.strip().startswith('adb shell'):
                cmd = line.strip().replace('adb shell ', '')
                result = await run_adb_command(f"shell {cmd}")
                executed_commands.append({
                    "command": cmd,
                    "result": result
                })

    return {
        "request": request_text,
        "ai_response": ai_response,
        "executed_commands": executed_commands,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/android/status")
async def android_status():
    """
    Get Android device status information
    """
    # Check device connection
    devices = await run_adb_command("devices")
    if not devices["success"]:
        return {"connected": False, "error": "Failed to check devices"}

    # Get battery level
    battery = await run_adb_command("shell dumpsys battery | grep level")

    # Get device model
    model = await run_adb_command("shell getprop ro.product.model")

    return {
        "connected": True,
        "battery": battery["stdout"] if battery["success"] else "Unknown",
        "model": model["stdout"] if model["success"] else "Unknown",
        "devices": devices["stdout"],
        "timestamp": datetime.utcnow().isoformat()
    }

# Perplexity App Automation Endpoints
@app.post("/api/perplexity/open")
async def open_perplexity_app(request: Request):
    """
    Open Perplexity app on Android device
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    result = await open_perplexity()
    return {
        "action": "open_perplexity",
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/search")
async def search_perplexity(
    query: str,
    request: Request
):
    """
    Search in Perplexity app
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    result = await perplexity_search(query)
    return {
        "action": "perplexity_search",
        "query": query,
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/screenshot")
async def screenshot_perplexity(request: Request):
    """
    Take screenshot of Perplexity app
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    result = await perplexity_screenshot()
    return {
        "action": "perplexity_screenshot",
        "result": result,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/perplexity/text")
async def get_perplexity_content():
    """
    Get text content from Perplexity app
    """
    content = await get_perplexity_text()
    return {
        "action": "get_perplexity_text",
        "content": content,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/explore-models")
async def explore_perplexity_models(request: Request):
    """
    Automate exploring available models in Perplexity
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    actions_taken = []

    # Open Perplexity
    open_result = await open_perplexity()
    actions_taken.append({"action": "open_perplexity", "result": open_result})
    await asyncio.sleep(3)

    # Try to tap on model selector (top right area)
    model_tap = await run_adb_command("shell input tap 1000 150")
    actions_taken.append({"action": "tap_model_selector", "result": model_tap})
    await asyncio.sleep(2)

    # Take screenshot to see model options
    screenshot = await perplexity_screenshot()
    actions_taken.append({"action": "model_selector_screenshot", "result": screenshot})

    # Search for model information
    search_result = await perplexity_search("Perplexity available models 2024")
    actions_taken.append({"action": "search_models_info", "result": search_result})

    return {
        "action": "explore_perplexity_models",
        "actions_taken": actions_taken,
        "note": "Check /tmp/perplexity_screenshot.png for model selector UI",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/find-model-selector")
async def find_perplexity_model_selector(request: Request):
    """
    Find model selector by trying multiple common locations
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Open Perplexity first
    await open_perplexity()
    await asyncio.sleep(3)

    # Find model selector
    result = await find_model_selector()

    return {
        "action": "find_model_selector",
        "result": result,
        "message": f"Tested {result['locations_tested']} potential locations. Screenshots saved to /tmp/perplexity_model_selector_*.png",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/map-interface")
async def map_perplexity_interface_endpoint(request: Request):
    """
    Map out the Perplexity interface by systematic tapping
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Open Perplexity first
    await open_perplexity()
    await asyncio.sleep(3)

    # Map interface
    result = await map_perplexity_interface()

    return {
        "action": "map_interface",
        "result": result,
        "message": f"Interface mapping complete. {result['screenshots_captured']} screenshots saved to /tmp/interface_map_*.png",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/cycle-models")
async def cycle_perplexity_models(request: Request):
    """
    Cycle through available models automatically
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Open Perplexity first
    await open_perplexity()
    await asyncio.sleep(3)

    # Cycle through models
    result = await cycle_through_models()

    return {
        "action": "cycle_models",
        "result": result,
        "message": f"Model cycling complete. Screenshots saved to /tmp/model_cycle_*.png",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/smart-selector")
async def smart_perplexity_selector(request: Request):
    """
    Smart model selector that tries multiple approaches
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Open Perplexity first
    await open_perplexity()
    await asyncio.sleep(3)

    # Try smart selector approaches
    result = await smart_model_selector()

    return {
        "action": "smart_selector",
        "result": result,
        "message": f"Smart selector tried {result['approaches_tried']} approaches with {result['screenshots_saved']} successful screenshots",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/comprehensive-exploration")
async def comprehensive_perplexity_exploration(request: Request):
    """
    Comprehensive exploration of Perplexity app using all methods
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    exploration_results = []

    # 1. Basic exploration
    basic = await explore_perplexity_models()
    exploration_results.append({"method": "basic_exploration", "result": basic})

    # 2. Find model selector
    await open_perplexity()
    await asyncio.sleep(3)
    selector_finder = await find_model_selector()
    exploration_results.append({"method": "model_selector_finder", "result": selector_finder})

    # 3. Smart selector
    await open_perplexity()
    await asyncio.sleep(3)
    smart_selector_result = await smart_model_selector()
    exploration_results.append({"method": "smart_selector", "result": smart_selector_result})

    # 4. Model cycling
    await open_perplexity()
    await asyncio.sleep(3)
    cycle_result = await cycle_through_models()
    exploration_results.append({"method": "model_cycling", "result": cycle_result})

    return {
        "action": "comprehensive_exploration",
        "exploration_results": exploration_results,
        "summary": {
            "methods_completed": len(exploration_results),
            "screenshots_generated": "Check /tmp/ for all screenshots",
            "files_created": [
                "/tmp/perplexity_screenshot.png",
                "/tmp/perplexity_model_selector_*.png",
                "/tmp/model_cycle_*.png"
            ]
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/perplexity/ai-assist")
async def perplexity_ai_assist(
    query: str,
    request: Request
):
    """
    Use AI to automate Perplexity operations
    """
    # Verify authentication
    if config.BACKEND_API_KEY:
        api_key = request.headers.get("X-API-Key")
        if api_key != config.BACKEND_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Use ZAI to understand the query and convert to actions
    ai_response = await call_zai_api(f"Convert this Perplexity app request to specific steps: {query}")

    # Execute the actions based on AI response
    actions_taken = []

    # Open Perplexity if mentioned
    if "open" in ai_response.lower() or "launch" in ai_response.lower():
        open_result = await open_perplexity()
        actions_taken.append({"action": "open_perplexity", "result": open_result})
        await asyncio.sleep(2)

    # Search if query is mentioned
    if "search" in ai_response.lower() and query:
        search_result = await perplexity_search(query)
        actions_taken.append({"action": "search", "query": query, "result": search_result})

    # Take screenshot if needed
    if "screenshot" in ai_response.lower() or "capture" in ai_response.lower():
        screenshot_result = await perplexity_screenshot()
        actions_taken.append({"action": "screenshot", "result": screenshot_result})

    return {
        "original_query": query,
        "ai_response": ai_response,
        "actions_taken": actions_taken,
        "timestamp": datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("BACKEND_PORT", "8000")),
        reload=True
    )
