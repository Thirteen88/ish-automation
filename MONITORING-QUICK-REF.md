# Monitoring System Quick Reference

## Quick Start

```bash
# Test the monitoring system
node test-monitoring.js

# View the dashboard
# Open http://localhost:3000/monitoring/dashboard.html in your browser
```

## Key Files

| File | Purpose |
|------|---------|
| `logging/logger.js` | Centralized logging system |
| `monitoring/metrics-collector.js` | Metrics collection and aggregation |
| `monitoring/alerts.js` | Alert rules and notifications |
| `monitoring/dashboard.html` | Real-time web dashboard |
| `monitoring/monitoring-service.js` | Unified monitoring integration |
| `test-monitoring.js` | Comprehensive test suite |

## Common Tasks

### Log a Query

```javascript
const { getLogger } = require('./logging/logger');
const logger = getLogger();

// Start query
logger.logQueryStart('q123', 'claude', 'What is AI?');

// Complete query
logger.logQueryComplete('q123', 'claude', 1523, { tokens: 150 });

// Or if failed
logger.logQueryFailure('q123', 'claude', error, 1523);
```

### Track Metrics

```javascript
const { MetricsCollector } = require('./monitoring/metrics-collector');
const metrics = new MetricsCollector();

// Record query
metrics.recordQueryStart('claude', 'q123');
metrics.recordQueryComplete('claude', 'q123', 1523, true);

// Record error
metrics.recordQueryError('claude', 'q123', 'timeout', 5000);

// Get stats
const stats = metrics.getOverallStats();
console.log(`Success rate: ${stats.successRate}%`);
```

### Check Alerts

```javascript
const { AlertManager } = require('./monitoring/alerts');
const alertManager = new AlertManager();

// Evaluate metrics against rules
alertManager.evaluate({
    errorRate: 0.15,
    avgResponseTime: 95000,
    heapUsed: 900 * 1024 * 1024,
    heapTotal: 1000 * 1024 * 1024
});

// Get active alerts
const alerts = alertManager.getActiveAlerts();
console.log(`${alerts.length} active alerts`);
```

### Integrated Usage

```javascript
const { MonitoringService } = require('./monitoring/monitoring-service');

// Initialize
const monitoring = new MonitoringService({
    logLevel: 'info',
    enableLogging: true,
    enableMetrics: true,
    enableAlerts: true
});

// Use in query processing
async function processQuery(queryId, platform, prompt) {
    monitoring.logQueryStart(queryId, platform, prompt);
    const startTime = Date.now();

    try {
        const result = await executeQuery(platform, prompt);
        const duration = Date.now() - startTime;
        monitoring.logQueryComplete(queryId, platform, duration, true);
        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        monitoring.logQueryError(queryId, platform, error, duration);
        throw error;
    }
}
```

## Health Check Endpoints

```bash
# Liveness probe
curl http://localhost:3000/health

# Readiness probe
curl http://localhost:3000/ready

# Prometheus metrics
curl http://localhost:3000/metrics

# JSON metrics
curl http://localhost:3000/api/metrics | jq
```

## Log Locations

```bash
logs/
├── combined.log       # All logs (JSON format)
├── error.log          # Errors only
├── performance.log    # Performance metrics
├── audit.log          # Audit trail
└── alerts/            # Alert files
    └── alert-*.json
```

## Alert Thresholds

| Alert | Threshold | Severity |
|-------|-----------|----------|
| Platform Down | > 5 min | CRITICAL |
| High Error Rate | > 10% | WARNING |
| Slow Response | > 90s | WARNING |
| High Memory | > 80% | CRITICAL |
| High CPU | > 90% | WARNING |
| Queue Buildup | > 50 | WARNING |

## Metric Queries

```javascript
// Get platform stats
const platformStats = metrics.getPlatformStats('claude', TimeWindows.HOUR);

// Get selector hit rates
const selectorStats = metrics.getSelectorStats('claude');

// Export Prometheus format
const prometheusMetrics = metrics.exportPrometheus();

// Export JSON
const jsonMetrics = metrics.exportJSON();
```

## Troubleshooting

### High Memory Alert

```bash
# Check memory usage
curl http://localhost:3000/health | jq '.checks.memory'

# View recent logs
tail -f logs/combined.log | grep -i memory

# Get active alerts
curl http://localhost:3000/api/metrics | jq '.alerts.alertsBySeverity'
```

### Platform Down

```bash
# Check platform health
curl http://localhost:3000/api/status

# View error logs
tail -f logs/error.log | jq 'select(.platform == "claude")'

# Check health monitor status
# In dashboard: Platform Health Status section
```

### Slow Responses

```bash
# Get response time metrics
curl http://localhost:3000/api/metrics | jq '.stats.platforms'

# View performance logs
tail -f logs/performance.log | jq

# Check P95/P99 times
# In dashboard: Performance Trends section
```

## Testing

```bash
# Run all tests
node test-monitoring.js

# Expected: 10/10 tests passed (100%)

# Test specific scenario
node -e "
const { MonitoringService } = require('./monitoring/monitoring-service');
const m = new MonitoringService();
m.logQueryStart('test', 'claude', 'Hello');
setTimeout(() => m.logQueryComplete('test', 'claude', 1000, true), 1000);
"
```

## Environment Variables

```bash
# Set log level
export LOG_LEVEL=debug

# Set alert webhook
export ALERT_WEBHOOK_URL=https://hooks.slack.com/...

# Start with monitoring
LOG_LEVEL=info node web-server.js
```

## Dashboard Features

- **Auto-refresh**: 5-second intervals
- **WebSocket**: Real-time push updates
- **Filters**: Tab-based log filtering
- **Responsive**: Works on mobile/tablet
- **Connection Status**: Visual indicator
- **Color-coded**: Health status visualization

## Prometheus Integration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'ish-automation'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Support

For issues or questions:
1. Check `/health` endpoint
2. Review `logs/error.log`
3. Check active alerts in dashboard
4. Run test suite: `node test-monitoring.js`
5. Review `MONITORING-REPORT.md` for details
