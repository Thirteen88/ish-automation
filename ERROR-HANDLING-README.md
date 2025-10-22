# Comprehensive Error Handling and Retry System

A production-ready error handling and resilience system for the AI Orchestrator, designed to handle cascading failures gracefully and ensure maximum uptime.

## 📋 Table of Contents

- [Overview](#overview)
- [Components](#components)
- [Quick Start](#quick-start)
- [Component Details](#component-details)
- [Integration Guide](#integration-guide)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Monitoring and Alerts](#monitoring-and-alerts)

## 🎯 Overview

This system provides comprehensive error handling, retry logic, health monitoring, and logging for distributed AI platform integrations. It's designed to be resilient, observable, and production-ready.

### Key Features

- **Error Classification**: Automatic categorization of errors (Network, Auth, Rate Limit, API, Browser, Parsing, Timeout)
- **Smart Retries**: Exponential backoff with jitter, platform-specific strategies, and retry budgets
- **Circuit Breakers**: Automatic platform disabling to prevent cascading failures
- **Health Monitoring**: Real-time health checks with automatic recovery
- **Dead Letter Queue**: Persistent storage of failed requests for later processing
- **Structured Logging**: Winston-based logging with aggregation and rotation
- **Performance Tracking**: Built-in performance monitoring and degradation detection

## 🧩 Components

### 1. Error Handler (`error-handler.js`)

Classifies errors, determines recovery strategies, and manages circuit breakers.

```javascript
const { ErrorHandler, NetworkError } = require('./error-handler');

const handler = new ErrorHandler({
    enableCircuitBreaker: true,
    enableDeadLetterQueue: true
});

// Handle an error
const result = await handler.handle(error, {
    platform: 'openai',
    request: { prompt: 'test' }
});
```

### 2. Retry Manager (`retry-manager.js`)

Manages intelligent retries with platform-specific strategies and budget control.

```javascript
const { RetryManager } = require('./retry-manager');

const manager = new RetryManager({
    enableBudget: true,
    budgetOptions: {
        maxRetriesPerMinute: 50
    }
});

// Execute with automatic retry
const result = await manager.executeWithRetry(
    async () => {
        return await apiCall();
    },
    { platform: 'anthropic' }
);
```

### 3. Health Monitor (`health-monitor.js`)

Tracks platform health, detects degradation, and manages alerts.

```javascript
const { HealthMonitor } = require('./health-monitor');

const monitor = new HealthMonitor({
    checkInterval: 60000,
    enableScheduledChecks: true
});

// Register platform
monitor.registerPlatform('openai', {
    unhealthyThreshold: 3
});

// Check health
const health = await monitor.checkPlatform('openai', async () => {
    return await healthCheckFunction();
});
```

### 4. Error Logger (`error-logging.js`)

Structured logging with Winston, error aggregation, and performance tracking.

```javascript
const { createLogger, LogLevel } = require('./error-logging');

const logger = createLogger({
    logLevel: LogLevel.INFO,
    enableAggregation: true,
    enablePerformanceTracking: true
});

// Log with context
logger.error('Request failed', error, {
    platform: 'openai',
    requestId: 'req_123'
});
```

## 🚀 Quick Start

### Installation

The system uses Winston for logging. Make sure it's installed:

```bash
npm install winston
```

### Basic Usage

```javascript
const { ResilientOrchestrator } = require('./error-handling-example');

// Create orchestrator with all error handling features
const orchestrator = new ResilientOrchestrator({
    logLevel: 'info'
});

// Register platforms
orchestrator.registerPlatform('openai', openaiClient);
orchestrator.registerPlatform('anthropic', anthropicClient);

// Execute request with automatic retry and fallback
const result = await orchestrator.executeWithFallback(
    ['openai', 'anthropic', 'google'],
    { prompt: 'What is AI?' }
);

// Get system status
const status = orchestrator.getSystemStatus();
console.log(status);
```

### Running the Demo

```bash
# Run the integrated example
node error-handling-example.js

# Run individual component demos
node error-handler.js
node retry-manager.js
node health-monitor.js
node error-logging.js
```

## 📖 Component Details

### Error Handler

#### Error Types

| Type | Retryable | Description |
|------|-----------|-------------|
| `NETWORK` | Yes | Connection issues, timeouts |
| `AUTH` | No | Authentication failures |
| `RATE_LIMIT` | Yes | API rate limiting |
| `API` | Conditional | API errors (5xx retryable) |
| `BROWSER` | Yes | Browser automation issues |
| `PARSING` | No | Response parsing failures |
| `TIMEOUT` | Yes | Request timeouts |
| `VALIDATION` | No | Input validation errors |

#### Custom Error Classes

```javascript
const { NetworkError, RateLimitError, APIError } = require('./error-handler');

// Create specific error types
throw new NetworkError('Connection refused', {
    host: 'api.example.com',
    port: 443
});

throw new RateLimitError('Too many requests', {
    retryAfter: 60000 // milliseconds
});

throw new APIError('Internal server error', {
    statusCode: 500,
    endpoint: '/v1/chat'
});
```

#### Circuit Breaker

Prevents cascading failures by temporarily disabling failing platforms.

```javascript
// Circuit breaker states
CircuitState.CLOSED      // Normal operation
CircuitState.OPEN        // Blocking requests
CircuitState.HALF_OPEN   // Testing recovery

// Configuration
{
    threshold: 5,           // Failures before opening
    timeout: 60000,         // Time before retry (ms)
    monitoringPeriod: 10000 // Window for failures
}
```

#### Dead Letter Queue

Stores failed requests for later processing or analysis.

```javascript
const dlq = handler.getDeadLetterQueue();

// Get failed requests
const failedRequests = await dlq.getAll();

// Get statistics
const stats = await dlq.getStats();

// Remove processed request
await dlq.remove(requestId);
```

### Retry Manager

#### Retry Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `EXPONENTIAL_BACKOFF` | Delay doubles each retry | Most APIs |
| `LINEAR_BACKOFF` | Delay increases linearly | Stable services |
| `FIXED_DELAY` | Same delay each time | Simple retries |
| `FIBONACCI` | Fibonacci sequence delays | Gradual backoff |
| `IMMEDIATE` | No delay | Fast retries |

#### Jitter Types

| Type | Behavior | Purpose |
|------|----------|---------|
| `NONE` | No randomization | Deterministic |
| `FULL` | 0 to full delay | Maximum spread |
| `EQUAL` | Half delay + random | Balanced |
| `DECORRELATED` | Exponential random | Avoid thundering herd |

#### Platform-Specific Configuration

```javascript
// Set custom retry config for a platform
manager.setPlatformConfig('openai', {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
    jitterType: JitterType.FULL,
    retryableErrors: [ErrorTypes.NETWORK, ErrorTypes.TIMEOUT]
});
```

#### Retry Budget

Prevents excessive retries across all platforms.

```javascript
// Budget configuration
{
    maxRetriesPerMinute: 100,
    maxRetriesPerHour: 1000
}

// Check budget status
const status = manager.getBudgetStatus();
console.log(status);
// {
//   retriesInLastMinute: 15,
//   retriesInLastHour: 87,
//   minuteCapacity: 85,
//   hourCapacity: 913
// }
```

### Health Monitor

#### Health Status

| Status | Description | Action |
|--------|-------------|--------|
| `HEALTHY` | Normal operation | Use platform |
| `DEGRADED` | Performance issues | Use with caution |
| `UNHEALTHY` | Multiple failures | Avoid if possible |
| `DISABLED` | Auto-disabled | Do not use |
| `UNKNOWN` | Not checked yet | Unknown state |

#### Health Check Configuration

```javascript
monitor.registerPlatform('openai', {
    checkInterval: 60000,              // 1 minute
    timeout: 10000,                    // 10 seconds
    unhealthyThreshold: 3,             // Consecutive failures
    degradedThreshold: 2,              // Consecutive failures
    recoveryThreshold: 2,              // Consecutive successes
    disableOnUnhealthy: true,          // Auto-disable
    latencyWarningThreshold: 5000,     // 5 seconds
    latencyCriticalThreshold: 10000,   // 10 seconds
    errorRateWarningThreshold: 0.1,    // 10%
    errorRateCriticalThreshold: 0.25   // 25%
});
```

#### Alert System

```javascript
// Listen to alerts
monitor.on('alert', (alert) => {
    console.log(`[${alert.severity}] ${alert.platform}: ${alert.message}`);
});

// Get alerts
const alerts = monitor.getAlerts({
    platform: 'openai',
    severity: 'critical',
    since: new Date(Date.now() - 3600000) // Last hour
});
```

### Error Logger

#### Log Levels

| Level | Purpose |
|-------|---------|
| `ERROR` | Error conditions |
| `WARN` | Warning conditions |
| `INFO` | Informational messages |
| `HTTP` | HTTP requests |
| `VERBOSE` | Detailed information |
| `DEBUG` | Debug information |
| `SILLY` | Very detailed debug |

#### Structured Logging

```javascript
// Log with rich context
logger.error('API call failed', error, {
    platform: 'openai',
    requestId: 'req_123',
    attempt: 2,
    latency: 5432,
    metadata: {
        model: 'gpt-4',
        tokens: 150
    }
});
```

#### Error Aggregation

Automatically groups similar errors for analysis.

```javascript
// Get top errors
const report = logger.getErrorReport();
console.log(report.topErrors);
// [
//   {
//     errorType: 'network',
//     message: 'Connection refused',
//     count: 45,
//     recentCount: 12,
//     platforms: ['openai', 'anthropic']
//   }
// ]
```

#### Performance Tracking

```javascript
// Track operation performance
const result = await logger.trackPerformance(
    'api_call_openai',
    async () => {
        return await apiCall();
    },
    { endpoint: '/v1/chat', model: 'gpt-4' }
);

// Get performance stats
const stats = logger.getPerformanceReport();
console.log(stats.stats.api_call_openai);
// {
//   count: 150,
//   min: 234,
//   max: 8765,
//   avg: 1456,
//   p50: 1234,
//   p95: 3456,
//   p99: 5678
// }
```

## 🔧 Integration Guide

### Integrating with Existing Orchestrator

```javascript
const { ErrorHandler } = require('./error-handler');
const { RetryManager } = require('./retry-manager');
const { HealthMonitor } = require('./health-monitor');
const { createLogger } = require('./error-logging');

class YourOrchestrator {
    constructor() {
        // Add error handling components
        this.logger = createLogger({ logLevel: 'info' });
        this.errorHandler = new ErrorHandler();
        this.retryManager = new RetryManager();
        this.healthMonitor = new HealthMonitor();
    }

    async queryPlatform(platform, prompt) {
        try {
            // Execute with retry and circuit breaker
            return await this.retryManager.executeWithRetry(
                async () => {
                    return await this.errorHandler.executeWithProtection(
                        async () => {
                            // Your existing query logic
                            return await this.existingQueryMethod(platform, prompt);
                        },
                        { platform }
                    );
                },
                { platform }
            );
        } catch (error) {
            // Handle error
            const result = await this.errorHandler.handle(error, {
                platform,
                request: { prompt }
            });

            this.logger.error('Query failed', error, { platform });

            throw error;
        }
    }
}
```

### Integrating with Browser Automation

```javascript
const { ProductionBrowserAutomation } = require('./production-browser-automation');
const { BrowserError } = require('./error-handler');

class ResilientBrowserAutomation extends ProductionBrowserAutomation {
    constructor(config) {
        super(config);

        // Add resilience components
        this.errorHandler = new ErrorHandler();
        this.retryManager = new RetryManager();
        this.logger = createLogger({ logLevel: 'info' });
    }

    async sendPrompt(platformName, prompt, options) {
        return await this.retryManager.executeWithRetry(
            async (attempt) => {
                try {
                    return await super.sendPrompt(platformName, prompt, options);
                } catch (error) {
                    // Convert to BrowserError for proper classification
                    throw new BrowserError(error.message, {
                        platform: platformName,
                        originalError: error
                    });
                }
            },
            { platform: platformName }
        );
    }
}
```

## ⚙️ Configuration

### Recommended Production Settings

```javascript
const orchestrator = new ResilientOrchestrator({
    // Logging
    logDir: './logs',
    logLevel: LogLevel.INFO,
    enableAggregation: true,
    enablePerformanceTracking: true,

    // Error Handler
    enableCircuitBreaker: true,
    enableDeadLetterQueue: true,
    circuitBreakerOptions: {
        threshold: 5,
        timeout: 60000,
        monitoringPeriod: 10000
    },

    // Retry Manager
    enableBudget: true,
    budgetOptions: {
        maxRetriesPerMinute: 50,
        maxRetriesPerHour: 500
    },

    // Health Monitor
    checkInterval: 30000,
    enableScheduledChecks: true,
    healthCheckOptions: {
        unhealthyThreshold: 3,
        degradedThreshold: 2,
        recoveryThreshold: 2,
        latencyWarningThreshold: 5000,
        errorRateWarningThreshold: 0.1
    }
});
```

## 🎯 Best Practices

### 1. Error Classification

Always use specific error types for better recovery:

```javascript
// Good
throw new RateLimitError('Rate limit exceeded', {
    retryAfter: 60000,
    platform: 'openai'
});

// Bad
throw new Error('Rate limit exceeded');
```

### 2. Context Enrichment

Add rich context to all errors and logs:

```javascript
logger.error('Request failed', error, {
    platform: 'openai',
    requestId: requestId,
    attempt: attemptNumber,
    prompt: prompt.substring(0, 50),
    model: 'gpt-4',
    timestamp: new Date().toISOString()
});
```

### 3. Health Checks

Implement lightweight health checks:

```javascript
async function healthCheck() {
    // Quick check, not full request
    const response = await fetch('https://api.openai.com/v1/models', {
        method: 'HEAD',
        timeout: 5000
    });
    return response.ok;
}
```

### 4. Graceful Degradation

Use fallback chains:

```javascript
const result = await orchestrator.executeWithFallback(
    ['openai', 'anthropic', 'google', 'together'],
    request
);
```

### 5. Monitor Dead Letter Queue

Regularly process failed requests:

```javascript
setInterval(async () => {
    const dlq = errorHandler.getDeadLetterQueue();
    const stats = await dlq.getStats();

    if (stats.total > 100) {
        // Alert or take action
        logger.warn('Dead letter queue growing', { stats });
    }
}, 300000); // Every 5 minutes
```

## 📊 Monitoring and Alerts

### System Status Dashboard

```javascript
// Get comprehensive system status
const status = orchestrator.getSystemStatus();

console.log(`
Health Summary:
  Healthy: ${status.health.healthy}
  Degraded: ${status.health.degraded}
  Unhealthy: ${status.health.unhealthy}

Retry Budget:
  Minute: ${status.retryBudget.retriesInLastMinute}/${status.retryBudget.maxRetriesPerMinute}
  Hour: ${status.retryBudget.retriesInLastHour}/${status.retryBudget.maxRetriesPerHour}

Failed Queue: ${status.failedQueue.total} requests

Error Rate: ${(status.errorMetrics.failed / status.errorMetrics.total * 100).toFixed(2)}%
`);
```

### Alert Integration

```javascript
// Forward alerts to external system
healthMonitor.on('alert', async (alert) => {
    if (alert.severity === 'critical') {
        // Send to PagerDuty, Slack, etc.
        await sendAlertToExternalSystem(alert);
    }
});
```

### Metrics Export

```javascript
// Export metrics for Prometheus, Grafana, etc.
setInterval(async () => {
    const metrics = {
        timestamp: Date.now(),
        health: monitor.getHealthSummary(),
        retries: retryManager.getStatistics(),
        errors: errorHandler.getMetrics()
    };

    // Push to metrics system
    await metricsClient.push(metrics);
}, 60000); // Every minute
```

## 📝 Examples

See `error-handling-example.js` for a complete working example that demonstrates:

- Error classification and recovery
- Smart retries with exponential backoff
- Circuit breaker pattern
- Health monitoring and alerts
- Automatic platform fallback
- Comprehensive logging and metrics

## 🔍 Troubleshooting

### High Error Rate

```javascript
// Check error report
const report = logger.getErrorReport();
console.log('Top Errors:', report.topErrors);

// Check platform health
const health = monitor.getAllPlatformHealth();
Object.entries(health).forEach(([platform, status]) => {
    if (status.errorRate > 0.1) {
        console.log(`${platform} has high error rate: ${status.errorRate}`);
    }
});
```

### Circuit Breaker Stuck Open

```javascript
// Check circuit breaker status
const metrics = errorHandler.getMetrics();
metrics.circuitBreakers.forEach(cb => {
    if (cb.status.state === 'open') {
        console.log(`${cb.platform} circuit is OPEN`);

        // Manually reset if needed
        errorHandler.resetCircuitBreaker(cb.platform);
    }
});
```

### Dead Letter Queue Growing

```javascript
// Process failed requests
const manager = retryManager;
const result = await manager.processFailedQueue();

console.log(`
Processed: ${result.processed}
Successful: ${result.successful}
Failed: ${result.failed}
`);
```

## 📄 License

MIT

## 🤝 Contributing

This error handling system is designed to be extensible. To add new features:

1. Follow existing patterns for error types and recovery strategies
2. Add comprehensive logging
3. Include unit tests
4. Update this README

## 📞 Support

For issues or questions:
1. Check logs in `./logs/`
2. Review error reports: `orchestrator.getErrorReport()`
3. Check system status: `orchestrator.getSystemStatus()`
