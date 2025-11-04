# 88 3EE AI Platform - Backend System

Production-ready backend system for the 88 3EE AI platform, featuring advanced automation capabilities including Perplexity APK automation, API relay services, and comprehensive integration tools.

## 🚀 Core Features

### Perplexity APK Automation System
Autonomous interaction with the Perplexity Android application through ADB automation, computer vision, and OCR capabilities.

### API Relay Services
- Backend API relay for ish.chat integration
- RESTful endpoints for AI model interactions
- Real-time communication and message handling

### Multi-Provider Support
- Extensible architecture for multiple AI providers
- Dynamic model selection and routing
- Comprehensive monitoring and analytics

## 📁 Project Structure

```
ish-chat-backend/
├── src/
│   ├── perplexity_automation/          # Perplexity APK automation
│   │   ├── __init__.py                 # Package exports
│   │   ├── perplexity_automation.py   # Main automation engine
│   │   ├── api.py                     # REST API endpoints
│   │   ├── adb_queue.py               # ADB command management
│   │   ├── vision_processor.py        # Computer vision processing
│   │   ├── response_parser.py         # OCR and response handling
│   │   └── model_selector.py          # AI model selection
│   └── services/                      # Core services
├── docker-infrastructure/             # Docker configurations
├── screenshots/                       # Debug screenshots
├── tests/                            # Test suites
├── static/                           # Client-side assets
└── docs/                            # Documentation
```

## 🔧 Quick Start

### 1. Prerequisites
```bash
# Python 3.12+
# Android Studio or Android SDK
# Docker (optional, for containerized deployment)
```

### 2. Install Dependencies
```bash
source venv/bin/activate
pip install -r requirements.txt

# System dependencies for Perplexity automation
sudo apt-get install tesseract-ocr tesseract-ocr-eng android-tools-adb
```

### 3. Configure Environment
```bash
# Copy environment template
cp .env.example .env
nano .env
```

### 4. Android Device Setup (Perplexity Automation)
```bash
# Start Android emulator
~/start-android-emulator.sh

# Verify device connection
adb devices

# Install Perplexity app (if not already installed)
```

### 5. Run Services

#### Backend API Server
```bash
cd src
python main.py
```

#### Perplexity Automation API
```bash
source venv/bin/activate
python -m uvicorn src.perplexity_automation.api:app \
    --host 0.0.0.0 \
    --port 8002
```

### 6. Test the Setup
```bash
pytest tests/
```

## 📚 Documentation

### Perplexity Automation Guide
See [PERPLEXITY_AUTOMATION_GUIDE.md](PERPLEXITY_AUTOMATION_GUIDE.md) for comprehensive documentation on:
- Architecture overview
- API integration examples
- Configuration options
- Production deployment
- Troubleshooting and monitoring

### API Documentation

#### Backend API Endpoints
- `GET /health` - Health check
- `POST /api/relay` - Relay messages from client
- `POST /api/send` - Send messages to ish.chat

#### Perplexity Automation API (Port 8002)
- `POST /prompt` - Submit prompts to Perplexity
- `GET /task/{task_id}` - Check task status
- `GET /status` - Get engine status
- `GET /stats` - Get performance statistics

## 🐳 Docker Deployment

### Quick Start
```bash
# Build and run all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Perplexity Automation Container
```bash
# Build Perplexity automation image
docker build -f docker-infrastructure/ai-providers/perplexity-provider.Dockerfile -t perplexity-automation .

# Run with environment variables
docker run -p 8002:8002 \
    -e PERPLEXITY_DEVICE_ID=emulator-5554 \
    -e PERPLEXITY_DEFAULT_TIMEOUT=120 \
    perplexity-automation
```

## 🔌 Integration Examples

### Python Client Integration
```python
import httpx
import asyncio

class PerplexityClient:
    def __init__(self, base_url="http://localhost:8002"):
        self.base_url = base_url
        self.client = httpx.AsyncClient()

    async def submit_prompt(self, prompt: str, timeout: int = 120):
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
        return wait_response.json()

# Usage
async def main():
    client = PerplexityClient()
    result = await client.submit_prompt("What is machine learning?")
    print(f"Response: {result['response']['answer']}")

asyncio.run(main())
```

### JavaScript/Node.js Integration
```javascript
const axios = require('axios');

class PerplexityClient {
    constructor(baseUrl = 'http://localhost:8002') {
        this.baseUrl = baseUrl;
        this.client = axios.create({ baseURL: baseUrl });
    }

    async submitPrompt(prompt, timeout = 120) {
        const submitResponse = await this.client.post('/prompt', {
            prompt,
            timeout,
            device_id: 'emulator-5554'
        });

        const { task_id } = submitResponse.data;
        const waitResponse = await this.client.get(`/task/${task_id}/wait`, {
            params: { timeout }
        });

        return waitResponse.data;
    }
}

// Usage
async function main() {
    const client = new PerplexityClient();
    const result = await client.submitPrompt('Explain blockchain');
    console.log('Answer:', result.response.answer);
}
```

## ⚙️ Configuration

### Environment Variables
```env
# Core Backend
BACKEND_API_KEY=your-secure-key-here
ISHCHAT_API_URL=https://ish.chat/api/chat
ALLOWED_ORIGINS=https://yoursite.com

# Perplexity Automation
PERPLEXITY_DEVICE_ID=emulator-5554
PERPLEXITY_SCREENSHOT_DIR=./screenshots
PERPLEXITY_DEFAULT_TIMEOUT=120
PERPLEXITY_CONFIDENCE_THRESHOLD=0.7
PERPLEXITY_AUTO_RETRY=true
PERPLEXITY_LOG_LEVEL=INFO

# Performance
MAX_CONCURRENT_TASKS=1
ENABLE_SCREENSHOT_LOGGING=false
```

## 📊 Monitoring & Analytics

### Health Checks
```bash
# Backend API health
curl http://localhost:8000/health

# Perplexity automation health
curl http://localhost:8002/health
```

### Statistics and Metrics
```bash
# Perplexity automation stats
curl http://localhost:8002/stats

# Recent tasks
curl http://localhost:8002/tasks/recent?count=10
```

### Logging
```bash
# Monitor logs in real-time
tail -f logs/perplexity_automation.log
tail -f logs/backend.log

# Filter by component
grep "perplexity_automation.vision_processor" logs/app.log
```

## 🧪 Testing

### Run All Tests
```bash
pytest

# With coverage
pytest --cov=src --cov-report=html

# View coverage report
open htmlcov/index.html
```

### Perplexity Automation Tests
```bash
# Test Perplexity components
pytest tests/test_perplexity_automation.py

# Integration tests (requires Android device)
pytest tests/test_integration.py -v
```

## 🚀 Production Deployment

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
```

### Monitoring Setup
```yaml
# Prometheus metrics
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

## 🆘 Troubleshooting

### Common Issues

**Device Connection Issues:**
```bash
# Check device status
adb devices

# Restart ADB server
adb kill-server && adb start-server
```

**Perplexity App Not Found:**
```bash
# Check if app is installed
adb shell pm list packages | grep perplexity

# Install app manually if needed
adb install path/to/perplexity.apk
```

**API Connection Issues:**
- Check if services are running on correct ports
- Verify firewall settings
- Review error logs for specific issues

**OCR Quality Issues:**
- Enable screenshot logging for debugging
- Check image quality in screenshots directory
- Adjust confidence thresholds in configuration

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

### Client-Side Integration

Include the interceptor in your HTML:
```html
<script src="static/ishchat-interceptor.js"></script>
```

Or load from your backend:
```html
<script src="http://localhost:8000/static/ishchat-interceptor.js"></script>
```

## 📈 Performance Optimization

### Batch Processing
```python
async def batch_prompts(prompts: List[str]):
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
# High-throughput configuration
config = AutomationConfig(
    max_concurrent_tasks=3,
    default_timeout=60,
    response_wait_time=20,
    confidence_threshold=0.6,
    enable_screenshot_logging=False  # Disable debug in production
)
```

## 🔒 Security Considerations

1. **API Security**: Use authentication in production
2. **Device Access**: Secure ADB access properly
3. **Data Privacy**: Handle sensitive prompts appropriately
4. **Network Security**: Use HTTPS for API endpoints

```python
# API security example
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def verify_token(token: str = Depends(security)):
    if not validate_token(token.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    return token
```

## 📞 Support & Development

For issues and support:
1. Check logs for error details
2. Verify device connection and app installation
3. Review configuration settings
4. Test with simple prompts first

**System Status**: ✅ Production Ready
**Version**: 1.0.0
**Last Updated**: 2025-11-04
**GitHub Repository**: https://github.com/Thirteen88/ish-automation

---

**This comprehensive system is now fully integrated and ready for production use with the 88 3EE AI platform!**

## Quick Start

1. Install dependencies:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

2. Configure environment:
```bash
# Edit .env file
nano .env
```

3. Update JavaScript selectors:
```bash
# Edit static/ishchat-interceptor.js
# Update chatContainer, userMessageSelector, botMessageSelector
nano static/ishchat-interceptor.js
```

4. Run the server:
```bash
cd src
python main.py
```

5. Test the setup:
```bash
pytest tests/
```

## Usage

### Backend API

The backend runs on `http://localhost:8000`

**Endpoints:**
- `GET /health` - Health check
- `POST /api/relay` - Relay messages from client
- `POST /api/send` - Send messages to ish.chat

### Client-Side Integration

Include the interceptor in your HTML:
```html
<script src="static/ishchat-interceptor.js"></script>
```

Or load from your backend:
```html
<script src="http://localhost:8000/static/ishchat-interceptor.js"></script>
```

## Docker Deployment
```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Configuration

Edit `.env` file:
```env
BACKEND_API_KEY=your-secure-key-here
ISHCHAT_API_URL=https://ish.chat/api/chat
ALLOWED_ORIGINS=https://yoursite.com
```

## Testing
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# View coverage report
open htmlcov/index.html
```

## Troubleshooting

**Container not found:**
- Check browser console for available containers
- Update `chatContainer` in `ishchat-interceptor.js`

**Messages not captured:**
- Inspect ish.chat's DOM structure
- Update message selectors

**CORS errors:**
- Add your domain to `ALLOWED_ORIGINS`

## Debug Mode

Open browser console and access debug tools:
```javascript
// View current config
console.log(window.ishChatConfig);

// Manually trigger message processing
window.ishChatDebug.processMessage(element, 'user');
```
