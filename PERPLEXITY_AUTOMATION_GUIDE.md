# Perplexity APK Automation System - Integration Guide

## Overview

The Perplexity APK Automation System provides autonomous interaction with the Perplexity Android application through ADB automation, computer vision, and OCR. This comprehensive system enables the 88 3ee AI platform to leverage Perplexity's capabilities programmatically.

## 🚀 Quick Start

### Prerequisites

1. **Android Device Setup**
   - Android emulator (recommended: API 30+) or physical device
   - ADB debugging enabled
   - Perplexity app installed
   - Device connected and authorized

2. **System Dependencies**
   ```bash
   # Python packages (automatically installed)
   pip install opencv-python pytesseract pillow numpy
   pip install fastapi uvicorn httpx pydantic
   pip install python-dotenv asyncio

   # System dependencies
   sudo apt-get install tesseract-ocr tesseract-ocr-eng
   sudo apt-get install android-tools-adb
   ```

3. **Environment Setup**
   ```bash
   # Ensure Android emulator is running
   ~/start-android-emulator.sh

   # Verify device connection
   adb devices
   ```

### Basic Usage

```python
import asyncio
from src.perplexity_automation import submit_prompt_to_perplexity

async def main():
    # Simple one-shot prompt
    response = await submit_prompt_to_perplexity(
        "What is artificial intelligence?",
        device_id="emulator-5554",
        timeout=120
    )

    if response:
        print(f"Answer: {response.answer}")
        print(f"Sources: {response.sources}")
        print(f"Confidence: {response.confidence_score}")

asyncio.run(main())
```

## 🏗️ Architecture

### Core Components

1. **ADB Command Queue** (`adb_queue.py`)
   - Manages ADB command execution and device communication
   - Handles device health monitoring and reconnection
   - Provides priority-based command queuing

2. **Vision Processor** (`vision_processor.py`)
   - UI element detection using computer vision
   - Screen capture and region analysis
   - Text extraction from UI elements

3. **Response Parser** (`response_parser.py`)
   - OCR text cleaning and processing
   - Source extraction and validation
   - Confidence scoring and quality assessment

4. **Automation Engine** (`perplexity_automation.py`)
   - Orchestrates all components
   - Task management and execution
   - Error handling and retry logic

5. **REST API** (`api.py`)
   - FastAPI-based HTTP endpoints
   - Production-ready integration interface
   - Comprehensive monitoring and control

## 📡 API Integration

### Starting the API Server

```bash
# Production deployment
source venv/bin/activate
python -m uvicorn src.perplexity_automation.api:app \
    --host 0.0.0.0 \
    --port 8002 \
    --workers 1

# Development mode
python -m uvicorn src.perplexity_automation.api:app \
    --host 0.0.0.0 \
    --port 8002 \
    --reload
```

### API Endpoints

#### Core Operations

```bash
# Submit a prompt
curl -X POST "http://localhost:8002/prompt" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing",
    "timeout": 120,
    "device_id": "emulator-5554"
  }'

# Check task status
curl "http://localhost:8002/task/{task_id}"

# Wait for completion (blocking)
curl "http://localhost:8002/task/{task_id}/wait?timeout=120"

# Get engine status
curl "http://localhost:8002/status"

# Get statistics
curl "http://localhost:8002/stats"
```

#### Monitoring and Management

```bash
# Recent tasks
curl "http://localhost:8002/tasks/recent?count=10"

# Available devices
curl "http://localhost:8002/devices"

# Screenshots
curl "http://localhost:8002/screenshots"

# Health check
curl "http://localhost:8002/health"
```

### Integration Examples

#### Python Client

```python
import httpx
import asyncio

class PerplexityClient:
    def __init__(self, base_url="http://localhost:8002"):
        self.base_url = base_url
        self.client = httpx.AsyncClient()

    async def submit_prompt(self, prompt: str, timeout: int = 120):
        """Submit a prompt and wait for response"""
        response = await self.client.post(
            f"{self.base_url}/prompt",
            json={"prompt": prompt, "timeout": timeout}
        )
        response.raise_for_status()
        task_data = response.json()

        # Wait for completion
        wait_response = await self.client.get(
            f"{self.base_url}/task/{task_data['task_id']}/wait",
            params={"timeout": timeout}
        )
        wait_response.raise_for_status()
        return wait_response.json()

    async def get_status(self):
        """Get engine status"""
        response = await self.client.get(f"{self.base_url}/status")
        response.raise_for_status()
        return response.json()

# Usage
async def main():
    client = PerplexityClient()

    # Check if ready
    status = await client.get_status()
    if status["status"] != "ready":
        print(f"Engine not ready: {status['status']}")
        return

    # Submit prompt
    result = await client.submit_prompt("What is machine learning?")
    print(f"Response: {result['response']['answer']}")

asyncio.run(main())
```

#### JavaScript/Node.js Client

```javascript
const axios = require('axios');

class PerplexityClient {
    constructor(baseUrl = 'http://localhost:8002') {
        this.baseUrl = baseUrl;
        this.client = axios.create({ baseURL: baseUrl });
    }

    async submitPrompt(prompt, timeout = 120) {
        // Submit task
        const submitResponse = await this.client.post('/prompt', {
            prompt,
            timeout,
            device_id: 'emulator-5554'
        });

        const { task_id } = submitResponse.data;

        // Wait for completion
        const waitResponse = await this.client.get(`/task/${task_id}/wait`, {
            params: { timeout }
        });

        return waitResponse.data;
    }

    async getStatus() {
        const response = await this.client.get('/status');
        return response.data;
    }
}

// Usage
async function main() {
    const client = new PerplexityClient();

    const status = await client.getStatus();
    console.log('Engine status:', status.status);

    if (status.status === 'ready') {
        const result = await client.submitPrompt('Explain blockchain');
        console.log('Answer:', result.response.answer);
    }
}

main().catch(console.error);
```

## 🔧 Configuration

### Engine Configuration

```python
from src.perplexity_automation import AutomationConfig, create_automation_engine

config = AutomationConfig(
    device_id="emulator-5554",          # Target device
    screenshot_dir="./screenshots",     # Screenshot storage
    max_concurrent_tasks=1,             # Concurrent task limit
    default_timeout=120,                # Default timeout (seconds)
    response_wait_time=30,              # Response wait time
    confidence_threshold=0.7,           # Minimum confidence
    auto_retry_failed_tasks=True,       # Auto-retry on failure
    enable_screenshot_logging=True      # Enable debug screenshots
)

engine = await create_automation_engine(config)
```

### Environment Variables

```bash
# .env file
PERPLEXITY_DEVICE_ID=emulator-5554
PERPLEXITY_SCREENSHOT_DIR=./screenshots
PERPLEXITY_DEFAULT_TIMEOUT=120
PERPLEXITY_CONFIDENCE_THRESHOLD=0.7
PERPLEXITY_AUTO_RETRY=true
PERPLEXITY_LOG_LEVEL=INFO
```

## 📊 Monitoring and Logging

### Statistics Tracking

The system automatically tracks:
- Task success/failure rates
- Average response times
- Confidence scores
- Screenshot counts
- Error occurrences

### Log Levels

```python
import logging

# Set log level
logging.basicConfig(level=logging.INFO)

# Component-specific loggers
adb_logger = logging.getLogger('perplexity_automation.adb_queue')
vision_logger = logging.getLogger('perplexity_automation.vision_processor')
response_logger = logging.getLogger('perplexity_automation.response_parser')
engine_logger = logging.getLogger('perplexity_automation.perplexity_automation')
```

### Health Monitoring

```python
# Custom health check
async def health_check():
    engine = get_engine()
    stats = engine.get_stats()

    return {
        "status": "healthy" if engine.status == "ready" else "unhealthy",
        "device_connected": engine.adb_queue.get_device_status(engine.config.device_id) == "connected",
        "success_rate": stats["success_rate"],
        "active_tasks": stats["active_tasks"],
        "uptime": stats.get("uptime_seconds", 0)
    }
```

## 🚨 Error Handling

### Common Issues and Solutions

1. **Device Connection Issues**
   ```python
   # Check device status
   device_status = engine.adb_queue.get_device_status("emulator-5554")
   if device_status != "connected":
       await engine._restart_device_connection()
   ```

2. **Perplexity App Not Found**
   ```python
   # Ensure app is installed
   result = await engine.adb_queue.enqueue_command(
       ADBCommand("shell pm list packages | grep perplexity", "emulator-5554")
   )
   ```

3. **UI Element Detection Failures**
   ```python
   # Adjust vision processor confidence
   config.vision_confidence_threshold = 0.7  # Lower for difficult screens
   ```

4. **OCR Quality Issues**
   ```python
   # Enable screenshot logging for debugging
   config.enable_screenshot_logging = True
   # Check screenshots in ./screenshots directory
   ```

### Retry Logic

```python
# Automatic retry configuration
task = AutomationTask(
    task_id="unique-id",
    prompt="Your prompt here",
    max_retries=3,           # Maximum retry attempts
    timeout_seconds=120      # Timeout per attempt
)
```

## 🧪 Testing

### Unit Tests

```python
import pytest
from src.perplexity_automation import ResponseParser

@pytest.mark.asyncio
async def test_response_parsing():
    parser = ResponseParser()

    sample_text = """
    Artificial intelligence is the simulation of human intelligence in machines.

    Sources:
    1. https://example.com/ai-article
    2. https://example.com/machine-learning
    """

    response = await parser.parse_response(sample_text, "test.png", "What is AI?")

    assert response.confidence_score > 0.8
    assert len(response.sources) == 2
    assert "artificial intelligence" in response.answer.lower()
```

### Integration Tests

```python
import pytest
from src.perplexity_automation import create_automation_engine

@pytest.mark.asyncio
async def test_full_workflow():
    engine = await create_automation_engine()

    # Submit test prompt
    task_id = await engine.submit_prompt("What is 2+2?", timeout=30)

    # Wait for completion
    response = await engine.wait_for_task(task_id, timeout=45)

    assert response is not None
    assert response.confidence_score > 0.5
    assert "4" in response.answer

    await engine.stop()
```

## 🚀 Production Deployment

### Docker Integration

```dockerfile
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    android-tools-adb \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application
COPY src/ ./src/

# Expose API port
EXPOSE 8002

# Start API server
CMD ["python", "-m", "uvicorn", "src.perplexity_automation.api:app", "--host", "0.0.0.0", "--port", "8002"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: perplexity-automation
spec:
  replicas: 1
  selector:
    matchLabels:
      app: perplexity-automation
  template:
    metadata:
      labels:
        app: perplexity-automation
    spec:
      containers:
      - name: perplexity-automation
        image: your-registry/perplexity-automation:latest
        ports:
        - containerPort: 8002
        env:
        - name: PERPLEXITY_DEVICE_ID
          value: "emulator-5554"
        - name: PERPLEXITY_DEFAULT_TIMEOUT
          value: "120"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

### Monitoring Setup

```yaml
# Prometheus metrics example
apiVersion: v1
kind: Service
metadata:
  name: perplexity-automation
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8002"
spec:
  selector:
    app: perplexity-automation
  ports:
  - port: 8002
    targetPort: 8002
```

## 📈 Performance Optimization

### Batch Processing

```python
async def batch_prompts(prompts: List[str]):
    """Process multiple prompts efficiently"""
    engine = await create_automation_engine()

    # Submit all tasks
    task_ids = []
    for prompt in prompts:
        task_id = await engine.submit_prompt(prompt)
        task_ids.append(task_id)

    # Wait for all completions
    responses = []
    for task_id in task_ids:
        response = await engine.wait_for_task(task_id)
        responses.append(response)

    await engine.stop()
    return responses
```

### Resource Management

```python
# Configure for high-throughput
config = AutomationConfig(
    max_concurrent_tasks=3,           # Increase concurrency
    default_timeout=60,                # Reduce timeout for faster failures
    response_wait_time=20,             # Optimize wait time
    confidence_threshold=0.6,          # Lower threshold for more responses
    enable_screenshot_logging=False    # Disable debug screenshots in production
)
```

## 🔒 Security Considerations

1. **Device Access**: Ensure ADB access is properly secured
2. **API Security**: Use authentication in production
3. **Data Privacy**: Handle sensitive prompts appropriately
4. **Network Security**: Secure API endpoints with HTTPS

```python
# API security example
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def verify_token(token: str = Depends(security)):
    # Implement your token verification logic
    if not validate_token(token.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    return token

@app.post("/prompt", dependencies=[Depends(verify_token)])
async def secure_submit_prompt(request: PromptRequest):
    # Your implementation
    pass
```

## 📚 Advanced Usage

### Custom UI Element Detection

```python
from src.perplexity_automation import VisionProcessor

processor = VisionProcessor()

# Custom template matching
custom_templates = {
    "custom_button": "./templates/custom_button.png",
    "special_field": "./templates/special_field.png"
}

# Add to processor
processor.ui_templates.update(custom_templates)
```

### Custom Response Processing

```python
from src.perplexity_automation import ResponseParser

class CustomResponseParser(ResponseParser):
    async def parse_response(self, raw_text, screenshot_path, prompt, task_id):
        # Get base response
        response = await super().parse_response(raw_text, screenshot_path, prompt, task_id)

        # Add custom processing
        response.custom_metadata = self.extract_custom_data(raw_text)

        return response

    def extract_custom_data(self, text):
        # Your custom extraction logic
        return {"custom_field": "extracted_value"}
```

### Integration with 88 3ee AI Platform

```python
# Example integration with existing platform
class PerplexityIntegration:
    def __init__(self, platform_client):
        self.platform_client = platform_client
        self.perplexity_client = PerplexityClient()

    async def handle_platform_request(self, request):
        """Handle requests from 88 3ee platform"""
        try:
            # Route to Perplexity if appropriate
            if request.requires_perplexity:
                result = await self.perplexity_client.submit_prompt(
                    request.prompt,
                    timeout=request.timeout
                )

                # Format for platform response
                return {
                    "answer": result["response"]["answer"],
                    "sources": result["response"]["sources"],
                    "confidence": result["response"]["confidence_score"],
                    "provider": "perplexity"
                }
            else:
                # Handle with other platform providers
                return await self.platform_client.process_request(request)

        except Exception as e:
            logger.error(f"Perplexity integration error: {e}")
            return {"error": str(e), "provider": "perplexity"}
```

## 🆘 Troubleshooting

### Debug Mode

```python
# Enable comprehensive logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Enable screenshot debugging
config = AutomationConfig(
    enable_screenshot_logging=True,
    screenshot_dir="./debug_screenshots"
)
```

### Common Debugging Commands

```bash
# Check device connection
adb devices

# Check Perplexity app
adb shell pm list packages | grep perplexity

# Take manual screenshot
adb shell screencap -p /sdcard/debug.png
adb pull /sdcard/debug.png

# Check UI elements manually
adb shell uiautomator dump
adb pull /sdcard/window_dump.xml
```

### Log Analysis

```bash
# Monitor logs in real-time
tail -f logs/perplexity_automation.log

# Filter by component
grep "perplexity_automation.vision_processor" logs/app.log

# Error analysis
grep "ERROR" logs/app.log | tail -20
```

---

## 📞 Support

For issues and support:
1. Check logs for error details
2. Verify device connection and app installation
3. Review configuration settings
4. Test with simple prompts first

**System Status**: ✅ Production Ready
**Version**: 1.0.0
**Last Updated**: 2025-11-04

This comprehensive system is now fully integrated and ready for production use with the 88 3ee AI platform!