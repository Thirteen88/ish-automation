# Monitoring Dashboard Integration Guide

This guide shows how to integrate the monitoring dashboard with your existing AI Orchestrator system.

## Quick Start

### 1. Start the Monitoring Server

```bash
cd monitoring-dashboard
./start-monitoring.sh
```

Or manually:

```bash
cd monitoring-dashboard
npm install
node monitoring-server.js
```

### 2. Access the Dashboard

Open your browser and navigate to:
- Dashboard: http://localhost:8000/monitoring
- API: http://localhost:8000/api
- Health Check: http://localhost:8000/api/health

## Integration with AI Orchestrator

### Method 1: Direct API Integration

Send metrics to the monitoring server from your orchestrator:

```javascript
// In your AI orchestrator code
const axios = require('axios');

const MONITORING_URL = 'http://localhost:8000';

// Record a query
async function recordQuery(platform, success, responseTime) {
    try {
        await axios.post(`${MONITORING_URL}/api/metrics/query`, {
            platform,
            success,
            responseTime,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to record metrics:', error.message);
    }
}

// Usage in orchestrator
async function queryPlatform(platform, prompt) {
    const startTime = Date.now();

    try {
        const result = await platform.query(prompt);
        const responseTime = Date.now() - startTime;

        // Record successful query
        await recordQuery(platform.name, true, responseTime);

        return result;
    } catch (error) {
        const responseTime = Date.now() - startTime;

        // Record failed query
        await recordQuery(platform.name, false, responseTime);

        throw error;
    }
}
```

### Method 2: Event-Based Integration

Use events to track metrics:

```javascript
const EventEmitter = require('events');
const axios = require('axios');

class MonitoredOrchestrator extends EventEmitter {
    constructor() {
        super();

        // Listen to query events
        this.on('query:start', this.handleQueryStart.bind(this));
        this.on('query:success', this.handleQuerySuccess.bind(this));
        this.on('query:error', this.handleQueryError.bind(this));
    }

    handleQueryStart(data) {
        console.log('Query started:', data);
    }

    async handleQuerySuccess(data) {
        await this.sendMetrics({
            platform: data.platform,
            success: true,
            responseTime: data.responseTime,
            timestamp: Date.now()
        });
    }

    async handleQueryError(data) {
        await this.sendMetrics({
            platform: data.platform,
            success: false,
            responseTime: data.responseTime,
            timestamp: Date.now()
        });
    }

    async sendMetrics(data) {
        try {
            await axios.post('http://localhost:8000/api/metrics/query', data);
        } catch (error) {
            console.error('Failed to send metrics:', error.message);
        }
    }

    async query(platform, prompt) {
        const startTime = Date.now();

        this.emit('query:start', { platform, prompt });

        try {
            const result = await platform.query(prompt);
            const responseTime = Date.now() - startTime;

            this.emit('query:success', {
                platform: platform.name,
                responseTime,
                result
            });

            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;

            this.emit('query:error', {
                platform: platform.name,
                responseTime,
                error
            });

            throw error;
        }
    }
}

// Usage
const orchestrator = new MonitoredOrchestrator();
```

### Method 3: Middleware Integration (Express)

Add monitoring middleware to your Express app:

```javascript
const express = require('express');
const axios = require('axios');

const app = express();

// Monitoring middleware
const monitoringMiddleware = (req, res, next) => {
    const startTime = Date.now();

    // Capture response
    const originalSend = res.send;
    res.send = function (data) {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode < 400;

        // Send metrics
        axios.post('http://localhost:8000/api/metrics/query', {
            platform: 'api',
            success,
            responseTime,
            path: req.path,
            method: req.method,
            statusCode: res.statusCode,
            timestamp: Date.now()
        }).catch(err => {
            console.error('Failed to send metrics:', err.message);
        });

        originalSend.call(this, data);
    };

    next();
};

// Use middleware
app.use(monitoringMiddleware);
```

## WebSocket Integration

For real-time updates, connect to the WebSocket server:

```javascript
const WebSocket = require('ws');

// Connect to monitoring server
const ws = new WebSocket('ws://localhost:8000/ws');

ws.on('open', () => {
    console.log('Connected to monitoring server');
});

ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('Received:', message);

    // Handle different message types
    switch (message.type) {
        case 'metrics':
            console.log('Metrics update:', message.data);
            break;
        case 'platform':
            console.log('Platform update:', message.data);
            break;
        case 'alert':
            console.log('Alert:', message.data);
            break;
    }
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

ws.on('close', () => {
    console.log('Disconnected from monitoring server');
});

// Send metrics via WebSocket
function sendMetrics(data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'query',
            data: data
        }));
    }
}
```

## Integration with ai-orchestrator.js

Update your existing AI orchestrator:

```javascript
// At the top of ai-orchestrator.js
const axios = require('axios');

const MONITORING_ENABLED = process.env.MONITORING_ENABLED !== 'false';
const MONITORING_URL = process.env.MONITORING_URL || 'http://localhost:8000';

// Helper function to send metrics
async function sendMetrics(data) {
    if (!MONITORING_ENABLED) return;

    try {
        await axios.post(`${MONITORING_URL}/api/metrics/query`, data, {
            timeout: 1000 // Don't block on monitoring
        });
    } catch (error) {
        // Silently fail - monitoring shouldn't break the app
        console.debug('Monitoring metrics failed:', error.message);
    }
}

// Wrap your query function
async function queryWithMonitoring(platform, prompt, options) {
    const startTime = Date.now();

    try {
        const result = await queryPlatform(platform, prompt, options);
        const responseTime = Date.now() - startTime;

        // Record success
        await sendMetrics({
            platform: platform,
            success: true,
            responseTime,
            timestamp: Date.now()
        });

        return result;
    } catch (error) {
        const responseTime = Date.now() - startTime;

        // Record failure
        await sendMetrics({
            platform: platform,
            success: false,
            responseTime,
            error: error.message,
            timestamp: Date.now()
        });

        throw error;
    }
}
```

## Integration with api-service

Add monitoring to your API service:

```javascript
// In api-service/routes/query.js

const axios = require('axios');

const MONITORING_URL = process.env.MONITORING_URL || 'http://localhost:8000';

// Add to query route
router.post('/query', async (req, res) => {
    const startTime = Date.now();
    const { platform, prompt } = req.body;

    try {
        const result = await orchestrator.query(platform, prompt);
        const responseTime = Date.now() - startTime;

        // Send metrics
        axios.post(`${MONITORING_URL}/api/metrics/query`, {
            platform,
            success: true,
            responseTime,
            timestamp: Date.now()
        }).catch(err => console.debug('Monitoring failed:', err.message));

        res.json(result);
    } catch (error) {
        const responseTime = Date.now() - startTime;

        // Send metrics
        axios.post(`${MONITORING_URL}/api/metrics/query`, {
            platform,
            success: false,
            responseTime,
            error: error.message,
            timestamp: Date.now()
        }).catch(err => console.debug('Monitoring failed:', err.message));

        res.status(500).json({ error: error.message });
    }
});
```

## Health Monitor Integration

Use the existing health-monitor.js with the dashboard:

```javascript
// In health-monitor.js

const axios = require('axios');

class HealthMonitorWithDashboard extends HealthMonitor {
    constructor(options) {
        super(options);
        this.monitoringUrl = options.monitoringUrl || 'http://localhost:8000';
    }

    async check(platformName, checkFunction) {
        const result = await super.check(platformName, checkFunction);

        // Send to monitoring dashboard
        try {
            await axios.post(`${this.monitoringUrl}/api/metrics/platform`, {
                platform: platformName,
                data: {
                    success: result.success,
                    responseTime: result.latency,
                    status: result.status,
                    timestamp: result.timestamp
                }
            });
        } catch (error) {
            console.debug('Failed to send health metrics:', error.message);
        }

        return result;
    }
}
```

## Alert Integration

### Email Alerts

```javascript
// Configure email service
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// In monitoring-server.js
app.post('/api/alerts/email', async (req, res) => {
    const { subject, message, alert } = req.body;

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_TO,
            subject: `[${alert.severity.toUpperCase()}] ${subject}`,
            html: `
                <h2>${subject}</h2>
                <p>${message}</p>
                <hr>
                <p><strong>Severity:</strong> ${alert.severity}</p>
                <p><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
                ${alert.platform ? `<p><strong>Platform:</strong> ${alert.platform}</p>` : ''}
            `
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to send email:', error);
        res.status(500).json({ error: error.message });
    }
});
```

### Slack Alerts

Set up Slack webhook in .env:

```bash
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

The alerts.js will automatically send to Slack when configured.

## Running Multiple Services

To run both the main orchestrator and monitoring dashboard:

```bash
# Terminal 1 - Main AI Orchestrator
npm run web

# Terminal 2 - Monitoring Dashboard
cd monitoring-dashboard
./start-monitoring.sh
```

Or use a process manager like PM2:

```bash
# Install PM2
npm install -g pm2

# Start services
pm2 start ai-orchestrator.js --name orchestrator
pm2 start monitoring-dashboard/monitoring-server.js --name monitoring

# View logs
pm2 logs

# Stop services
pm2 stop all
```

## Environment Variables

Add to your main .env file:

```bash
# Monitoring Configuration
MONITORING_ENABLED=true
MONITORING_URL=http://localhost:8000
MONITORING_PORT=8000
```

## Testing the Integration

### 1. Start the monitoring server
```bash
cd monitoring-dashboard
./start-monitoring.sh
```

### 2. Send test metrics
```bash
curl -X POST http://localhost:8000/api/metrics/query \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "claude",
    "success": true,
    "responseTime": 2345,
    "timestamp": 1234567890
  }'
```

### 3. Check the dashboard
Open http://localhost:8000/monitoring in your browser

### 4. Verify metrics
```bash
curl http://localhost:8000/api/metrics
```

## Troubleshooting

### Dashboard Not Showing Data

1. Check monitoring server is running:
   ```bash
   curl http://localhost:8000/api/health
   ```

2. Verify WebSocket connection in browser console

3. Check metrics are being sent:
   ```bash
   curl http://localhost:8000/api/metrics
   ```

### Metrics Not Recording

1. Check MONITORING_ENABLED is true
2. Verify MONITORING_URL is correct
3. Check network connectivity
4. Review logs for errors

### Alerts Not Sending

1. Verify alert configuration in .env
2. Test notification channels:
   ```javascript
   alertManager.testNotification('email');
   alertManager.testNotification('slack');
   ```
3. Check webhook URLs and credentials

## Production Deployment

### Security Considerations

1. **Add Authentication**
   ```javascript
   // In monitoring-server.js
   const basicAuth = require('express-basic-auth');

   app.use('/monitoring', basicAuth({
       users: { 'admin': process.env.MONITORING_PASSWORD },
       challenge: true
   }));
   ```

2. **Use HTTPS**
   ```javascript
   const https = require('https');
   const fs = require('fs');

   const options = {
       key: fs.readFileSync('key.pem'),
       cert: fs.readFileSync('cert.pem')
   };

   const server = https.createServer(options, app);
   ```

3. **Configure CORS Properly**
   ```javascript
   app.use(cors({
       origin: process.env.ALLOWED_ORIGINS.split(','),
       credentials: true
   }));
   ```

### Using a Reverse Proxy

Nginx configuration:

```nginx
server {
    listen 80;
    server_name monitoring.example.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

## Next Steps

1. Enable monitoring in your orchestrator
2. Configure alert thresholds
3. Set up notification channels
4. Monitor system performance
5. Optimize based on metrics
