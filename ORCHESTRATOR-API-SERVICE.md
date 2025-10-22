# Orchestrator API Service - Installation & Usage Guide

## Overview

The Orchestrator API Service provides an HTTP API wrapper around the AI orchestrator, making it easy to integrate with any application. It runs as a persistent systemd service.

## Architecture

```
┌─────────────────────────────────────────┐
│   Your Application                      │
│   (Any language/framework)              │
└────────────────┬────────────────────────┘
                 │ HTTP REST API
                 ↓
┌─────────────────────────────────────────┐
│   Orchestrator API Service              │
│   (Node.js + Express-like HTTP)         │
│   Port: 8765                            │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│   Streamlined Orchestrator              │
│   - Browser Automation (Playwright)     │
│   - 7 Curated Text Models               │
│   - 2 Platforms (LMArena, ISH)          │
└─────────────────────────────────────────┘
```

## Installation

### 1. Install as Systemd Service

Run the installation script with sudo:

```bash
sudo bash install-orchestrator-service.sh
```

This will:
- Create logs directory
- Install systemd service file
- Enable service to start on boot
- Start the service immediately

### 2. Verify Installation

Check service status:
```bash
sudo systemctl status orchestrator-api
```

Check logs:
```bash
sudo journalctl -u orchestrator-api -f
```

Or view log files directly:
```bash
tail -f /home/gary/ish-automation/logs/orchestrator-api.log
tail -f /home/gary/ish-automation/logs/orchestrator-api-error.log
```

---

## API Reference

Base URL: `http://localhost:8765`

### 1. Health Check

**GET** `/health`

Check if the service is running.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-22T18:50:00.000Z",
  "uptime": 3600
}
```

### 2. Get Status

**GET** `/status`

Get detailed orchestrator status.

**Response:**
```json
{
  "success": true,
  "data": {
    "initialized": true,
    "startTime": "2025-10-22T18:00:00.000Z",
    "requestCount": 42,
    "platforms": 2,
    "models": {
      "text": 7,
      "image": 3,
      "video": 3
    }
  }
}
```

### 3. List Models

**GET** `/models`

Get all available models.

**Response:**
```json
{
  "success": true,
  "data": {
    "text": [
      "claude-3.5-sonnet",
      "claude-3-opus",
      "gpt-4-turbo",
      "gpt-4",
      "deepseek-coder-v2",
      "kimi-chat",
      "glm-4"
    ],
    "image": [
      "dall-e-3",
      "midjourney-v6",
      "stable-diffusion-xl"
    ],
    "video": [
      "runway-gen-2",
      "pika-1.0",
      "stable-video"
    ]
  }
}
```

### 4. Submit Query

**POST** `/query`

Submit a query to an AI model.

**Request Body:**
```json
{
  "prompt": "What is the capital of France?",
  "model": "claude-3.5-sonnet",
  "type": "text"
}
```

**Parameters:**
- `prompt` (required): The question or prompt
- `model` (optional): Model to use (default: `claude-3.5-sonnet`)
- `type` (optional): Query type - `text`, `image`, or `video` (default: `text`)

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "duration": 5234,
    "result": {
      "platform": "LMArena",
      "model": "claude-3.5-sonnet",
      "response": "The capital of France is Paris.",
      "timestamp": "2025-10-22T18:50:00.000Z"
    },
    "model": "claude-3.5-sonnet",
    "modelInfo": {
      "provider": "Anthropic",
      "platform": "lmarena",
      "speed": "fast",
      "quality": "excellent",
      "useCase": "general-purpose"
    },
    "timestamp": "2025-10-22T18:50:00.000Z"
  }
}
```

---

## Usage Examples

### cURL

```bash
# Health check
curl http://localhost:8765/health

# Get status
curl http://localhost:8765/status

# List models
curl http://localhost:8765/models

# Submit query
curl -X POST http://localhost:8765/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is 2+2?",
    "model": "claude-3.5-sonnet"
  }'
```

### Python

```python
import requests

# Health check
response = requests.get('http://localhost:8765/health')
print(response.json())

# Submit query
response = requests.post('http://localhost:8765/query', json={
    'prompt': 'Explain quantum computing in simple terms',
    'model': 'claude-3.5-sonnet'
})

result = response.json()
if result['success']:
    print(result['data']['result']['response'])
```

### JavaScript/Node.js

```javascript
const axios = require('axios');

// Health check
const health = await axios.get('http://localhost:8765/health');
console.log(health.data);

// Submit query
const response = await axios.post('http://localhost:8765/query', {
  prompt: 'Write a haiku about programming',
  model: 'claude-3.5-sonnet'
});

if (response.data.success) {
  console.log(response.data.data.result.response);
}
```

### JavaScript/Browser (fetch)

```javascript
// Health check
fetch('http://localhost:8765/health')
  .then(res => res.json())
  .then(data => console.log(data));

// Submit query
fetch('http://localhost:8765/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'What is machine learning?',
    model: 'gpt-4-turbo'
  })
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      console.log(data.data.result.response);
    }
  });
```

---

## Service Management

### Start Service
```bash
sudo systemctl start orchestrator-api
```

### Stop Service
```bash
sudo systemctl stop orchestrator-api
```

### Restart Service
```bash
sudo systemctl restart orchestrator-api
```

### Check Status
```bash
sudo systemctl status orchestrator-api
```

### Enable on Boot
```bash
sudo systemctl enable orchestrator-api
```

### Disable on Boot
```bash
sudo systemctl disable orchestrator-api
```

### View Logs (Live)
```bash
sudo journalctl -u orchestrator-api -f
```

### View Logs (Last 100 lines)
```bash
sudo journalctl -u orchestrator-api -n 100
```

---

## Configuration

The service can be configured via environment variables in the systemd service file (`/etc/systemd/system/orchestrator-api.service`):

```ini
Environment="PORT=8765"           # API server port
Environment="HOST=0.0.0.0"        # Bind address
Environment="NODE_ENV=production" # Environment
Environment="HEADLESS=true"       # Run browser in headless mode
```

After changing configuration:
```bash
sudo systemctl daemon-reload
sudo systemctl restart orchestrator-api
```

---

## Available Models

### Text/Chat Models (7)

1. **claude-3.5-sonnet** - Best overall, fast, excellent coding
2. **claude-3-opus** - Highest quality for complex tasks
3. **gpt-4-turbo** - Latest GPT-4, vision-capable
4. **gpt-4** - Reliable, widely tested
5. **deepseek-coder-v2** - Best coding specialist
6. **kimi-chat** - Long context (200k+ tokens)
7. **glm-4** - Chinese/bilingual leader

### Image Models (3)

1. **dall-e-3** - Best prompt understanding
2. **midjourney-v6** - Best artistic quality
3. **stable-diffusion-xl** - Fast, customizable

### Video Models (3)

1. **runway-gen-2** - Industry standard
2. **pika-1.0** - Fast generation
3. **stable-video** - Open source

---

## Troubleshooting

### Service won't start

Check logs:
```bash
sudo journalctl -u orchestrator-api -n 50
```

Common issues:
- Port 8765 already in use
- Missing dependencies (run `npm install`)
- Playwright browsers not installed (run `npx playwright install`)

### Cloudflare blocking requests

The service includes Cloudflare challenge detection. If still blocked:
1. Try running in headed mode: Set `HEADLESS=false` in service file
2. Check if platforms have changed their protection
3. Consider using alternative platforms

### Browser crashes

Check memory and system resources:
```bash
free -h
df -h
```

Browser automation is resource-intensive. Ensure adequate:
- RAM: At least 2GB available
- Disk space: At least 5GB free

---

## Security Considerations

The service includes security hardening:
- Runs as non-root user (`gary`)
- No new privileges allowed
- Private `/tmp` directory
- Protected system directories
- Read-only home directory

**Important:** The service binds to `0.0.0.0`, making it accessible from network. Consider:
- Running behind a firewall
- Adding authentication
- Using HTTPS reverse proxy
- Restricting to localhost only (`HOST=127.0.0.1`)

---

## Performance

- **Startup time**: 30-60 seconds (browser initialization + platform setup)
- **Query latency**: 5-15 seconds (depends on model and platform)
- **Concurrent requests**: Queued and processed sequentially
- **Memory usage**: ~500MB-1GB (browser + Node.js)

---

## Files

```
/home/gary/ish-automation/
├── orchestrator-api-service.js          # Main API service
├── streamlined-orchestrator.js          # Core orchestrator
├── install-orchestrator-service.sh      # Installation script
├── logs/
│   ├── orchestrator-api.log            # Service logs
│   └── orchestrator-api-error.log      # Error logs
└── /etc/systemd/system/
    └── orchestrator-api.service         # Systemd unit file
```

---

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u orchestrator-api -f`
2. Review error logs: `cat /home/gary/ish-automation/logs/orchestrator-api-error.log`
3. Test manually: `node orchestrator-api-service.js`

---

**The service is production-ready and designed for 24/7 operation!** 🚀
