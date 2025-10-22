# AI Orchestrator Web Interface

Production-ready web interface for querying multiple AI platforms simultaneously through browser automation.

## 🚀 Features

### Core Functionality
- **Multi-Platform Querying**: Send prompts to LMArena, Claude.ai, ChatGPT, Google Gemini, and Poe simultaneously
- **Real-Time Streaming**: WebSocket-based live response streaming as AI platforms generate responses
- **Platform Status Monitoring**: Real-time health indicators for all platforms
- **Response Comparison**: Side-by-side comparison of responses from different platforms
- **Query History**: Complete history with search and export capabilities
- **Voting System**: Rate and rank responses to identify the best answers

### User Interface
- **Modern Design**: Clean, responsive interface built with Tailwind CSS
- **Dark Mode**: Full dark mode support with automatic detection
- **Auto-Detection**: Smart platform recommendations based on prompt type
- **Real-Time Updates**: Live UI updates as responses stream in
- **Toast Notifications**: User-friendly notifications for all actions
- **Keyboard Shortcuts**: Full keyboard navigation support

### Technical Features
- **WebSocket Support**: Real-time bidirectional communication
- **REST API**: Complete RESTful API for all operations
- **Request Queuing**: Intelligent request queue management
- **Rate Limiting**: Automatic rate limiting per platform
- **Session Management**: Browser session and cookie management
- **Error Recovery**: Automatic retry and fallback mechanisms
- **Export Options**: JSON, Markdown, and CSV export formats

## 📋 Prerequisites

```bash
# Node.js 18+ required
node --version

# Install dependencies (if not already installed)
npm install
```

## 🎯 Quick Start

### 1. Start the Web Server

```bash
# Start the web server on default port 3000
node web-server.js

# Or specify a custom port
PORT=8080 node web-server.js
```

### 2. Open in Browser

Navigate to: `http://localhost:3000`

The interface will automatically:
- Connect via WebSocket for real-time updates
- Load platform status indicators
- Display query history (if any)
- Show system metrics

### 3. Submit Your First Query

1. **Select Platforms**: Click platform badges to select/deselect
2. **Enter Prompt**: Type your question or request
3. **Submit**: Click "Submit Query" or press `Ctrl+Enter`
4. **Watch Results**: Responses stream in real-time from each platform

## 🎨 User Interface Guide

### Header
- **Platform Status Indicators**: Live colored dots showing platform health
  - 🟢 Green: Healthy and ready
  - 🔵 Blue (pulsing): Currently processing
  - 🔴 Red: Error or unavailable
  - ⚫ Gray: Unknown/idle

- **Metrics Display**: Total queries and average response time
- **Dark Mode Toggle**: Switch between light and dark themes
- **Settings Button**: Access configuration options

### Main Query Interface

#### Platform Selection
- Click badges to toggle platform selection
- Auto-detection badges appear based on prompt content
- Recommended platforms highlighted for your prompt type

#### Prompt Input
- Large text area with character count
- Auto-resizing as you type
- Keyboard shortcut: `Ctrl+Enter` to submit

#### Auto-Detection
The system analyzes your prompt and suggests optimal platforms:
- **Code/Programming**: Claude, ChatGPT
- **Creative Writing**: Claude, Poe
- **Analysis/Research**: Gemini, Claude
- **General**: All platforms

### Response Display

Each response shows:
- **Platform Badge**: Colored indicator with platform name
- **Response Time**: Milliseconds to complete
- **Response Content**: Formatted text with markdown support
- **Action Buttons**:
  - 👍 Upvote
  - 👎 Downvote
  - ⭐ Mark as best
  - 📋 Copy to clipboard

### History Sidebar
- Click any query to reload it
- Shows prompt preview
- Displays response count
- Timestamp for each query

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Submit current query |
| `Ctrl+K` | Clear prompt input |
| `Ctrl+D` | Toggle dark mode |
| `/` | Focus prompt input |
| `Escape` | Close modals |

## 🔌 API Endpoints

### Query Operations

#### Submit Query
```bash
POST /api/query
Content-Type: application/json

{
  "prompt": "Explain quantum computing",
  "platforms": ["lmarena", "claude", "chatgpt", "gemini"]
}
```

Response:
```json
{
  "success": true,
  "queryId": "query_1234567890_abc123",
  "message": "Query submitted successfully",
  "platforms": ["lmarena", "claude", "chatgpt", "gemini"],
  "estimatedTime": 60000
}
```

#### Get Query
```bash
GET /api/query/:id
```

Response:
```json
{
  "success": true,
  "query": {
    "id": "query_1234567890_abc123",
    "prompt": "Explain quantum computing",
    "platforms": ["claude", "chatgpt"],
    "status": "completed",
    "responses": {
      "claude": {
        "success": true,
        "response": "Quantum computing is...",
        "duration": 15234,
        "timestamp": "2025-10-21T12:00:00.000Z"
      },
      "chatgpt": {
        "success": true,
        "response": "Quantum computers...",
        "duration": 12456,
        "timestamp": "2025-10-21T12:00:00.000Z"
      }
    }
  }
}
```

### Platform Operations

#### Get Platform Status
```bash
GET /api/status
```

#### List Available Platforms
```bash
GET /api/platforms
```

#### Check Platform Health
```bash
GET /api/platform/:name/health
```

### History & Search

#### Get History
```bash
GET /api/history?limit=50&offset=0&filter=completed
```

#### Search History
```bash
GET /api/history/search?q=quantum&platforms=claude,chatgpt
```

### Voting & Rankings

#### Submit Vote
```bash
POST /api/vote
Content-Type: application/json

{
  "queryId": "query_1234567890_abc123",
  "platform": "claude",
  "vote": "best"
}
```

#### Get Rankings
```bash
GET /api/rankings?range=7d
```

### Metrics

#### System Metrics
```bash
GET /api/metrics
```

Response:
```json
{
  "success": true,
  "metrics": {
    "totalRequests": 150,
    "successfulRequests": 142,
    "failedRequests": 8,
    "successRate": "94.67%",
    "averageResponseTime": "15234.56ms",
    "queueSize": 0,
    "activeRequests": 2,
    "connectedClients": 5
  }
}
```

### Export

#### Export Query (JSON)
```bash
GET /api/export/:id
```

#### Export as Markdown
```bash
GET /api/export/:id/markdown
```

#### Export as CSV
```bash
GET /api/export/:id/csv
```

## 🔌 WebSocket Protocol

Connect to: `ws://localhost:3000`

### Client → Server Messages

#### Subscribe to Query Updates
```json
{
  "type": "subscribe",
  "queryId": "query_1234567890_abc123"
}
```

#### Unsubscribe
```json
{
  "type": "unsubscribe",
  "queryId": "query_1234567890_abc123"
}
```

#### Heartbeat
```json
{
  "type": "ping"
}
```

### Server → Client Messages

#### Connected
```json
{
  "type": "connected",
  "data": {
    "platformStatus": [...],
    "recentQueries": [...]
  }
}
```

#### Query Started
```json
{
  "type": "query-start",
  "data": {
    "id": "query_1234567890_abc123",
    "prompt": "...",
    "platforms": [...],
    "status": "processing"
  }
}
```

#### Platform Started
```json
{
  "type": "platform-start",
  "data": {
    "queryId": "query_1234567890_abc123",
    "platform": "claude"
  }
}
```

#### Response Chunk (Streaming)
```json
{
  "type": "response-chunk",
  "data": {
    "queryId": "query_1234567890_abc123",
    "platform": "claude",
    "chunk": "Quantum computing is"
  }
}
```

#### Platform Complete
```json
{
  "type": "platform-complete",
  "data": {
    "queryId": "query_1234567890_abc123",
    "platform": "claude",
    "response": {
      "success": true,
      "response": "Full response text...",
      "duration": 15234,
      "timestamp": "2025-10-21T12:00:00.000Z"
    }
  }
}
```

#### Query Complete
```json
{
  "type": "query-complete",
  "data": {
    "id": "query_1234567890_abc123",
    "status": "completed",
    "endTime": 1698765432000
  }
}
```

## ⚙️ Configuration

### Environment Variables

```bash
# Server configuration
PORT=3000                    # HTTP server port
HOST=0.0.0.0                # Bind address

# CORS
CORS_ORIGINS=*              # Allowed origins (comma-separated)

# Limits
MAX_QUEUE_SIZE=100          # Maximum queued requests
REQUEST_TIMEOUT=120000      # Request timeout (ms)

# Features
ENABLE_METRICS=true         # Enable metrics collection
```

### Settings UI

Access via the Settings button (⚙️) in the header:

#### Display Options
- Auto-scroll to new responses
- Show streaming responses
- Enable notification sounds

#### Default Platforms
- Select which platforms to use by default
- Saves preferences to browser localStorage

## 🔧 Architecture

### Components

1. **web-server.js**: Express + WebSocket server
   - HTTP REST API
   - WebSocket server for real-time updates
   - Request queue management
   - Platform status monitoring

2. **api-routes.js**: API route handlers
   - Query management
   - History and search
   - Voting and rankings
   - Export functionality

3. **public/index.html**: Frontend UI
   - Responsive design
   - Dark mode support
   - Real-time updates
   - Toast notifications

4. **public/app.js**: Frontend application
   - WebSocket client
   - State management
   - UI rendering
   - Event handling

### Data Flow

```
User Input → Frontend (app.js)
           → REST API (POST /api/query)
           → Web Server (web-server.js)
           → Browser Automation (production-browser-automation.js)
           → AI Platforms (LMArena, Claude, ChatGPT, etc.)

Responses ← WebSocket (streaming)
          ← Frontend (real-time UI updates)
          ← User sees results
```

## 🐛 Troubleshooting

### WebSocket Connection Issues

**Problem**: "Disconnected from server" toast appears repeatedly

**Solution**:
1. Check server is running: `node web-server.js`
2. Verify port is not blocked by firewall
3. Check browser console for errors
4. Try refreshing the page

### Platform Errors

**Problem**: "Authentication required" or "Login required"

**Solution**:
1. You need to log in to platforms manually first
2. Use the browser automation with cookies saved
3. Check `cookies/` directory for saved sessions

**Problem**: "CAPTCHA detected"

**Solution**:
1. CAPTCHAs must be solved manually
2. Run browser automation in non-headless mode
3. Solve CAPTCHA once, cookies will be saved

### Rate Limiting

**Problem**: "Rate limit reached" warnings

**Solution**:
- Wait for cooldown period (varies by platform)
- Select fewer platforms for faster queries
- Platform limits are in `selectors-config.json`

## 📊 Performance

### Benchmarks

- **WebSocket Latency**: < 10ms
- **API Response Time**: < 100ms (excluding AI platform time)
- **Concurrent Queries**: Up to 50 (configurable)
- **Memory Usage**: ~200MB base + ~50MB per active browser context

### Optimization Tips

1. **Reduce Active Platforms**: Select only needed platforms
2. **Close Old Queries**: Clear history periodically
3. **Limit History**: Use `?limit=` parameter
4. **Use Streaming**: Disable if not needed for better performance

## 🔒 Security Considerations

### Browser Automation
- Sessions stored locally in `cookies/` directory
- No API keys needed (uses direct browser access)
- Cookies encrypted at rest

### Network
- CORS configured for browser access
- WebSocket connections authenticated
- Rate limiting prevents abuse

### Data Privacy
- Queries stored locally only
- No external data transmission (except to AI platforms)
- Clear history to remove sensitive data

## 📝 Examples

### Example 1: Simple Query
```javascript
// Frontend code
const prompt = "What is the capital of France?";
const platforms = ["claude", "chatgpt"];

// Submit via API
fetch('/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt, platforms })
});
```

### Example 2: Code Review Query
```javascript
const prompt = `Review this code:
\`\`\`python
def fibonacci(n):
    return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)
\`\`\``;

const platforms = ["claude", "chatgpt", "gemini"];
// Auto-detection will recommend code-capable platforms
```

### Example 3: Comparison
```javascript
// Get query results
const response = await fetch('/api/query/query_123');
const query = await response.json();

// Compare responses
const comparison = await fetch('/api/compare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    queryId: 'query_123',
    platforms: ['claude', 'chatgpt']
  })
});
```

## 🚀 Deployment

### Local Deployment
```bash
node web-server.js
```

### Production Deployment
```bash
# Set production environment
export NODE_ENV=production
export PORT=80

# Run with PM2
pm2 start web-server.js --name "ai-orchestrator"
pm2 save
pm2 startup
```

### Docker Deployment
```bash
# Build image
docker build -t ai-orchestrator .

# Run container
docker run -p 3000:3000 \
  -v $(pwd)/cookies:/app/cookies \
  -v $(pwd)/sessions:/app/sessions \
  ai-orchestrator
```

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.

## 📧 Support

For issues and questions:
- Check existing GitHub issues
- Create new issue with detailed description
- Include error messages and logs

---

**Built with**: Node.js, Express, WebSocket, Playwright, Tailwind CSS
**Version**: 1.0.0
**Last Updated**: 2025-10-21
