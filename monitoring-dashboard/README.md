# AI Orchestrator - Real-Time Monitoring Dashboard

A comprehensive, production-ready monitoring dashboard for the AI Orchestrator system with real-time metrics, alerts, and visualizations.

## Features

### Real-Time Monitoring
- **Live Metrics Display**: Total queries, response times, error rates, and platform status
- **WebSocket Integration**: Real-time updates without page refresh
- **Auto-Refresh**: Configurable automatic data refresh intervals
- **Connection Status**: Visual indicator for WebSocket connection health

### Platform Monitoring
- **Multi-Platform Status**: Monitor Claude, ChatGPT, Gemini, Perplexity, and more
- **Health Indicators**: Visual status cards (healthy, degraded, unhealthy, disabled)
- **Platform Metrics**: Response time, error rate, success rate, and uptime per platform
- **Consecutive Failure Tracking**: Detect and alert on platform issues

### Performance Analytics
- **Response Time Graphs**: 24-hour historical trend visualization
- **Error Rate Monitoring**: Track error patterns over time
- **Query Volume Charts**: Bar charts showing request distribution
- **Platform Distribution**: Doughnut chart showing usage across platforms
- **Performance Baselines**: Compare current metrics against established baselines

### System Resources
- **CPU Usage**: Real-time CPU utilization with warning thresholds
- **Memory Monitoring**: Memory usage tracking with visual bars
- **Network I/O**: Network bandwidth usage monitoring
- **Disk Usage**: Storage utilization tracking
- **Uptime Tracking**: System uptime with start time display
- **Requests/Second**: Current request rate with peak detection

### Alert System
- **Rule Engine**: Configurable alert rules with conditions
- **Multiple Severity Levels**: Critical, Warning, and Info alerts
- **Alert Cooldowns**: Prevent notification spam
- **Alert History**: Track all historical alerts
- **Real-Time Notifications**: Instant alerts for critical issues

### Notification Channels
- **Email Notifications**: Send alerts via email
- **Slack Integration**: Post alerts to Slack channels
- **Webhook Support**: Custom webhook integrations
- **Test Notifications**: Verify notification setup

### User Interface
- **Dark/Light Mode**: Toggle between dark and light themes
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Section Navigation**: Easy navigation between dashboard sections
- **Visual Indicators**: Color-coded status and trends
- **Chart.js Visualizations**: Professional, interactive charts

## Installation

### Prerequisites
- Node.js >= 18.0.0
- Express server (for WebSocket support)
- Modern web browser with WebSocket support

### Setup

1. **Install Dependencies**
   ```bash
   npm install express ws chart.js
   ```

2. **Start the Dashboard Server**
   ```bash
   node monitoring-server.js
   ```

3. **Open Dashboard**
   Navigate to `http://localhost:8000/monitoring` in your browser

## File Structure

```
monitoring-dashboard/
├── index.html              # Main dashboard HTML
├── dashboard.js            # Dashboard controller and UI logic
├── metrics-collector.js    # Metrics collection and aggregation
├── alerts.js               # Alert management and notifications
├── monitoring-server.js    # Backend server with WebSocket (to be created)
└── README.md              # This file
```

## Configuration

### Metrics Collector Options

```javascript
const metricsCollector = new MetricsCollector({
    storageKey: 'orchestrator_metrics',
    maxDataPoints: 1440,           // 24 hours at 1-minute intervals
    aggregationInterval: 60000,    // 1 minute
    retentionPeriod: 86400000      // 24 hours
});
```

### Alert Manager Options

```javascript
const alertManager = new AlertManager({
    emailEnabled: true,
    slackEnabled: true,
    webhookEnabled: true,
    slackWebhook: process.env.SLACK_WEBHOOK_URL,
    emailEndpoint: '/api/alerts/email',
    webhookUrl: 'https://your-webhook.com/alerts'
});
```

### Dashboard Options

```javascript
const dashboard = new MonitoringDashboard({
    wsUrl: 'ws://localhost:8000/ws',
    refreshInterval: 5000,         // 5 seconds
    reconnectDelay: 3000,
    maxReconnectAttempts: 10
});
```

## Alert Rules

### Default Alert Rules

1. **High Error Rate** (Critical)
   - Triggers when error rate > 10%
   - Cooldown: 5 minutes

2. **Slow Response Time** (Warning)
   - Triggers when avg response time > 5s
   - Cooldown: 5 minutes

3. **Platform Unhealthy** (Critical)
   - Triggers when platform status is unhealthy
   - Cooldown: 10 minutes

4. **Platform Degraded** (Warning)
   - Triggers when platform status is degraded
   - Cooldown: 10 minutes

5. **High CPU Usage** (Warning)
   - Triggers when CPU > 80%
   - Cooldown: 5 minutes

6. **Critical CPU Usage** (Critical)
   - Triggers when CPU > 90%
   - Cooldown: 5 minutes

7. **High Memory Usage** (Warning)
   - Triggers when memory > 85%
   - Cooldown: 5 minutes

8. **Critical Memory Usage** (Critical)
   - Triggers when memory > 95%
   - Cooldown: 5 minutes

9. **Consecutive Failures** (Critical)
   - Triggers after 5 consecutive failures
   - Cooldown: 10 minutes

10. **Low Success Rate** (Warning)
    - Triggers when success rate < 90%
    - Cooldown: 10 minutes

### Custom Alert Rules

Add custom alert rules programmatically:

```javascript
alertManager.addRule({
    id: 'custom-rule',
    name: 'Custom Alert',
    description: 'Custom alert condition',
    severity: 'warning',
    condition: (metrics) => metrics.totalQueries > 1000,
    cooldown: 300000,
    message: (metrics) => `Query volume high: ${metrics.totalQueries}`
});
```

## WebSocket Protocol

### Message Types

#### Metrics Update
```json
{
    "type": "metrics",
    "data": {
        "totalQueries": 1234,
        "errorRate": 0.05,
        "avgResponseTime": 2500,
        "timestamp": 1234567890
    }
}
```

#### Query Update
```json
{
    "type": "query",
    "data": {
        "platform": "claude",
        "success": true,
        "responseTime": 2345,
        "timestamp": 1234567890
    }
}
```

#### Platform Update
```json
{
    "type": "platform",
    "data": {
        "platform": "claude",
        "status": "healthy",
        "avgResponseTime": 2000,
        "errorRate": 0.02,
        "consecutiveFailures": 0
    }
}
```

#### Alert Update
```json
{
    "type": "alert",
    "data": {
        "title": "High Error Rate",
        "message": "Error rate at 12.5%",
        "severity": "critical",
        "timestamp": 1234567890
    }
}
```

#### Resources Update
```json
{
    "type": "resources",
    "data": {
        "cpu": 65.5,
        "memory": 72.3,
        "network": 1024,
        "disk": 55.0,
        "uptime": 86400000,
        "requestsPerSecond": 15.5
    }
}
```

## API Endpoints

### GET /api/metrics
Retrieve current metrics snapshot

**Response:**
```json
{
    "timeSeries": {...},
    "currentMetrics": {...},
    "baselines": {...},
    "thresholds": {...}
}
```

### POST /api/alerts/email
Send email alert notification

**Request:**
```json
{
    "subject": "Alert Subject",
    "message": "Alert message",
    "alert": {...}
}
```

### GET /api/alerts
Retrieve active alerts

**Response:**
```json
{
    "alerts": [...],
    "count": 5
}
```

### POST /api/alerts/acknowledge/:id
Acknowledge an alert

### DELETE /api/alerts/:id
Clear an alert

## Integration Examples

### Express Server Integration

```javascript
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve dashboard
app.use('/monitoring', express.static('monitoring-dashboard'));

// WebSocket connection
wss.on('connection', (ws) => {
    console.log('Dashboard connected');

    // Send metrics updates
    setInterval(() => {
        ws.send(JSON.stringify({
            type: 'metrics',
            data: getMetrics()
        }));
    }, 5000);
});

server.listen(8000, () => {
    console.log('Monitoring dashboard available at http://localhost:8000/monitoring');
});
```

### Slack Integration

```javascript
// Configure Slack webhook
alertManager.updateNotificationConfig({
    slack: {
        enabled: true,
        webhook: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
    }
});

// Test Slack notification
await alertManager.testNotification('slack');
```

### Email Integration

```javascript
// Configure email endpoint
alertManager.updateNotificationConfig({
    email: {
        enabled: true,
        endpoint: '/api/alerts/email'
    }
});

// Implement email endpoint
app.post('/api/alerts/email', async (req, res) => {
    const { subject, message, alert } = req.body;

    // Send email using your email service
    await emailService.send({
        to: 'admin@example.com',
        subject,
        html: formatAlertEmail(alert)
    });

    res.json({ success: true });
});
```

## Performance Considerations

### Data Retention
- Default: 1440 data points (24 hours at 1-minute intervals)
- Automatic cleanup of old data
- Configurable retention period

### Storage
- Uses localStorage for persistence
- Automatic data trimming
- Max 100 alerts stored
- Max 200 alert history items

### Update Frequency
- Metrics aggregation: Every 1 minute
- WebSocket updates: Real-time
- Display refresh: Every 1 second
- Auto-refresh: Every 5 seconds (when enabled)

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

## Troubleshooting

### WebSocket Connection Issues

1. Check server is running on correct port
2. Verify WebSocket URL in dashboard.js
3. Check for CORS issues
4. Ensure firewall allows WebSocket connections

### Charts Not Displaying

1. Verify Chart.js is loaded
2. Check browser console for errors
3. Ensure canvas elements exist in DOM
4. Try refreshing the page

### No Data Showing

1. Check WebSocket connection status
2. Verify metrics are being sent from backend
3. Check localStorage for stored data
4. Enable auto-refresh

### Alerts Not Sending

1. Verify notification configuration
2. Check webhook URLs and API keys
3. Test notifications individually
4. Check browser console for errors

## Development

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access dashboard
open http://localhost:8000/monitoring
```

### Building for Production

```bash
# Minify JavaScript
npm run build

# Deploy to production
npm run deploy
```

## Security Considerations

1. **Authentication**: Add authentication for dashboard access
2. **HTTPS**: Use HTTPS in production
3. **API Keys**: Secure all API keys and webhooks
4. **CORS**: Configure proper CORS policies
5. **Rate Limiting**: Implement rate limiting on API endpoints

## Future Enhancements

- [ ] User authentication and authorization
- [ ] Custom dashboard layouts
- [ ] Export metrics to CSV/JSON
- [ ] Historical data comparison
- [ ] Advanced filtering and search
- [ ] Mobile app
- [ ] Multi-user support
- [ ] Custom chart types
- [ ] Anomaly detection
- [ ] Predictive alerts

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [Create an issue](#)
- Documentation: [View docs](#)
- Email: support@example.com

## Credits

Built with:
- [Chart.js](https://www.chartjs.org/) - Beautiful charts
- [Font Awesome](https://fontawesome.com/) - Icons
- [Express](https://expressjs.com/) - Web framework
- [WebSocket](https://github.com/websockets/ws) - Real-time communication
