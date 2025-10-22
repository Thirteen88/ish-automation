# Quick Start Guide - Monitoring Dashboard

Get the AI Orchestrator monitoring dashboard up and running in 5 minutes!

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Web browser (Chrome, Firefox, Safari, Edge)

## Installation

### Step 1: Navigate to Directory

```bash
cd /home/gary/ish-automation/monitoring-dashboard
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- express (web server)
- ws (WebSocket support)

### Step 3: Configure (Optional)

```bash
cp .env.example .env
# Edit .env to customize settings
```

## Start the Dashboard

### Quick Start (with mock data)

```bash
./start-monitoring.sh
```

Or manually:

```bash
GENERATE_MOCK_DATA=true node monitoring-server.js
```

### Production Start

```bash
npm start
```

## Access the Dashboard

Once started, open your browser and go to:

**Dashboard:** http://localhost:8000/monitoring

You should see:
- ✅ Real-time metrics cards
- ✅ Platform status indicators
- ✅ Interactive charts
- ✅ System resource monitors
- ✅ Dark/Light theme toggle

## What You'll See

### Overview Section (Default View)
- **Total Queries**: Number of requests processed
- **Avg Response Time**: Average time to respond
- **Error Rate**: Percentage of failed requests
- **Active Platforms**: Online vs total platforms

### Platforms Section
Individual cards for each AI platform:
- Claude
- ChatGPT
- Gemini
- Perplexity

Each shows:
- Health status (healthy/degraded/unhealthy)
- Response time
- Error rate
- Total queries
- Success rate

### Performance Section
Interactive charts showing:
- Response time trends (last 24 hours)
- Error rate over time
- Query volume distribution
- Platform usage distribution

### Active Queries Section
Real-time view of:
- Currently running queries
- Query status and progress
- Platform assignments

### Alerts Section
Alert history showing:
- Critical alerts (red)
- Warning alerts (yellow)
- Info alerts (blue)

### System Resources Section
Real-time monitoring of:
- CPU usage
- Memory usage
- Network I/O
- Disk usage
- System uptime
- Requests per second

## Features to Try

### 1. Toggle Theme
Click the moon/sun icon in the header to switch between dark and light modes.

### 2. Enable Auto-Refresh
Click "Auto-refresh: OFF" to enable automatic data updates every 5 seconds.

### 3. Navigate Sections
Use the sidebar to switch between different monitoring views.

### 4. Check Connection Status
Look for the connection indicator in the header:
- 🟢 Green = Connected
- 🔴 Red = Disconnected

## Testing with Mock Data

The dashboard generates realistic mock data when started with `GENERATE_MOCK_DATA=true`:

```bash
GENERATE_MOCK_DATA=true node monitoring-server.js
```

This simulates:
- ✅ Query traffic across platforms
- ✅ Response time variations
- ✅ Occasional errors
- ✅ System resource usage

## API Endpoints

Test the API directly:

### Get Current Metrics
```bash
curl http://localhost:8000/api/metrics
```

### Check Health
```bash
curl http://localhost:8000/api/health
```

### Get Platform Stats
```bash
curl http://localhost:8000/api/platforms
```

### Send Test Query
```bash
curl -X POST http://localhost:8000/api/metrics/query \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "claude",
    "success": true,
    "responseTime": 2345,
    "timestamp": '$(date +%s)000'
  }'
```

## Integrating with Your Orchestrator

To send real data from your AI orchestrator:

```javascript
const axios = require('axios');

async function recordQuery(platform, success, responseTime) {
    await axios.post('http://localhost:8000/api/metrics/query', {
        platform,
        success,
        responseTime,
        timestamp: Date.now()
    });
}

// Use in your code
await recordQuery('claude', true, 2345);
```

See [INTEGRATION.md](INTEGRATION.md) for complete integration examples.

## Troubleshooting

### Port Already in Use

Change the port:
```bash
MONITORING_PORT=8001 node monitoring-server.js
```

### Dashboard Shows No Data

1. Check the server is running:
   ```bash
   curl http://localhost:8000/api/health
   ```

2. Enable mock data generation:
   ```bash
   GENERATE_MOCK_DATA=true node monitoring-server.js
   ```

3. Check browser console for errors (F12)

### WebSocket Not Connecting

1. Check WebSocket URL matches server port
2. Look for connection status in header (should be green)
3. Check browser console for WebSocket errors

### Charts Not Displaying

1. Ensure Chart.js CDN is accessible
2. Check browser console for JavaScript errors
3. Try refreshing the page (F5)

## Next Steps

### 1. Configure Alerts
Edit alert thresholds in the dashboard or via API:
```javascript
// In alerts.js or via API
alertManager.addRule({
    id: 'custom-alert',
    name: 'My Custom Alert',
    condition: (metrics) => metrics.errorRate > 0.15,
    severity: 'warning',
    message: (metrics) => `Custom alert triggered`
});
```

### 2. Set Up Notifications

**Email:**
```bash
EMAIL_ENABLED=true
EMAIL_ENDPOINT=/api/alerts/email
```

**Slack:**
```bash
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
```

**Webhook:**
```bash
WEBHOOK_ENABLED=true
WEBHOOK_URL=https://your-webhook.com/alerts
```

### 3. Connect Your Orchestrator

See [INTEGRATION.md](INTEGRATION.md) for:
- Direct API integration
- Event-based integration
- Express middleware
- WebSocket integration
- Health monitor integration

### 4. Production Deployment

- Add authentication
- Enable HTTPS
- Configure reverse proxy
- Set up monitoring alerts
- Implement backup strategy

## Support

- 📚 Full Documentation: [README.md](README.md)
- 🔧 Integration Guide: [INTEGRATION.md](INTEGRATION.md)
- 🐛 Issues: Report on GitHub
- 💬 Questions: Contact support

## Summary

You now have a fully functional monitoring dashboard running!

✅ Real-time metrics visualization
✅ Multi-platform monitoring
✅ Performance analytics
✅ Alert system
✅ WebSocket updates
✅ Dark/Light themes

**Dashboard URL:** http://localhost:8000/monitoring

Enjoy monitoring your AI Orchestrator! 🚀
