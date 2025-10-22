# Error Handling System - Quick Reference

## 🚀 Quick Start

```javascript
const { ResilientOrchestrator } = require('./error-handling-example');

const orchestrator = new ResilientOrchestrator();

// Register platforms
orchestrator.registerPlatform('openai', openaiClient);

// Execute with automatic retry and fallback
const result = await orchestrator.executeWithFallback(
    ['openai', 'anthropic'],
    { prompt: 'Your prompt here' }
);
```

## 📦 Component Imports

```javascript
// Error Handler
const {
    ErrorHandler,
    NetworkError,
    RateLimitError,
    APIError,
    BrowserError,
    ErrorTypes
} = require('./error-handler');

// Retry Manager
const {
    RetryManager,
    RetryStrategy,
    JitterType
} = require('./retry-manager');

// Health Monitor
const {
    HealthMonitor,
    HealthStatus,
    AlertSeverity
} = require('./health-monitor');

// Error Logger
const {
    createLogger,
    LogLevel
} = require('./error-logging');
```

## 🔧 Common Operations

### Initialize Components

```javascript
// Create logger
const logger = createLogger({
    logLevel: LogLevel.INFO,
    enableAggregation: true
});

// Create error handler
const errorHandler = new ErrorHandler({
    enableCircuitBreaker: true,
    enableDeadLetterQueue: true
});

// Create retry manager
const retryManager = new RetryManager({
    enableBudget: true
});

// Create health monitor
const healthMonitor = new HealthMonitor({
    checkInterval: 60000
});
```

### Execute with Retry

```javascript
const result = await retryManager.executeWithRetry(
    async (attemptNumber) => {
        return await yourFunction();
    },
    { platform: 'openai' }
);
```

### Execute with Circuit Breaker

```javascript
const result = await errorHandler.executeWithProtection(
    async () => {
        return await yourFunction();
    },
    { platform: 'openai' }
);
```

### Handle Errors

```javascript
try {
    await yourFunction();
} catch (error) {
    const result = await errorHandler.handle(error, {
        platform: 'openai',
        request: yourRequest
    });

    // Check if should retry
    if (result.strategy.shouldRetry) {
        // Retry logic
    }
}
```

### Check Platform Health

```javascript
const health = await healthMonitor.checkPlatform(
    'openai',
    async () => {
        return await healthCheckFunction();
    }
);

console.log(health.status); // healthy, degraded, unhealthy
```

### Log Errors

```javascript
// Error with context
logger.error('Request failed', error, {
    platform: 'openai',
    requestId: 'req_123'
});

// Warning
logger.warn('Rate limit approaching', {
    platform: 'openai',
    remaining: 10
});

// Info
logger.info('Request successful', {
    platform: 'openai',
    latency: 234
});
```

## 📊 Monitoring

### Get System Status

```javascript
const status = {
    health: healthMonitor.getHealthSummary(),
    retryBudget: retryManager.getBudgetStatus(),
    retryStats: retryManager.getStatistics(),
    errorMetrics: errorHandler.getMetrics(),
    logging: logger.getStats()
};
```

### Get Error Report

```javascript
const report = {
    aggregatedErrors: logger.getErrorReport(),
    circuitBreakers: errorHandler.getMetrics().circuitBreakers,
    alerts: healthMonitor.getAlerts(),
    deadLetterQueue: await errorHandler.getDeadLetterQueue().getStats()
};
```

### Export Reports

```javascript
await logger.exportReport('./logs/error-report.json');
```

## 🎯 Platform Configuration

### Configure Retry Strategy

```javascript
retryManager.setPlatformConfig('openai', {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
    jitterType: JitterType.FULL,
    retryableErrors: [ErrorTypes.NETWORK, ErrorTypes.TIMEOUT]
});
```

### Register Health Check

```javascript
healthMonitor.registerPlatform('openai', {
    checkInterval: 60000,
    unhealthyThreshold: 3,
    degradedThreshold: 2,
    latencyWarningThreshold: 5000,
    errorRateWarningThreshold: 0.1
});
```

## 🔔 Event Handling

### Error Handler Events

```javascript
errorHandler.on('error', ({ error, context }) => {
    console.log('Error occurred:', error.type);
});
```

### Retry Manager Events

```javascript
retryManager.on('retry', ({ platform, attempt, delay }) => {
    console.log(`Retrying ${platform}, attempt ${attempt}`);
});

retryManager.on('retry_success', ({ platform, attempts }) => {
    console.log(`Retry succeeded after ${attempts} attempts`);
});

retryManager.on('retry_failed', ({ platform, error }) => {
    console.log(`Retry failed: ${error.message}`);
});
```

### Health Monitor Events

```javascript
healthMonitor.on('status_change', ({ platform, previous, current }) => {
    console.log(`${platform}: ${previous} → ${current}`);
});

healthMonitor.on('alert', (alert) => {
    console.log(`[${alert.severity}] ${alert.message}`);
});
```

## 🛠️ Utility Functions

### Create Custom Error

```javascript
const error = new NetworkError('Connection timeout', {
    host: 'api.openai.com',
    port: 443,
    timeout: 30000
});
```

### Check Retry Decision

```javascript
const decision = retryManager.shouldRetry(error, {
    platform: 'openai',
    attemptNumber: 2
});

if (decision.shouldRetry) {
    console.log(`Retry in ${decision.delay}ms`);
}
```

### Manual Circuit Breaker Control

```javascript
// Reset circuit breaker
errorHandler.resetCircuitBreaker('openai');

// Get circuit breaker status
const breaker = errorHandler.getCircuitBreaker('openai');
console.log(breaker.getStatus());
```

### Enable/Disable Platforms

```javascript
// Disable platform
healthMonitor.disablePlatform('openai');

// Enable platform
healthMonitor.enablePlatform('openai');

// Reset health
healthMonitor.resetPlatform('openai');
```

## 🎨 Log Levels

```javascript
// Set log level
logger.setLogLevel(LogLevel.DEBUG);

// Enable debug mode
logger.enableDebugMode();

// Disable debug mode
logger.disableDebugMode();
```

## 📈 Performance Tracking

```javascript
// Track sync operation
logger.trackPerformance('calculation', () => {
    return heavyCalculation();
}, { type: 'sync' });

// Track async operation
await logger.trackPerformance('api_call', async () => {
    return await apiCall();
}, { platform: 'openai' });
```

## 🔍 Troubleshooting Checklist

```javascript
// 1. Check circuit breakers
const metrics = errorHandler.getMetrics();
metrics.circuitBreakers.forEach(cb => {
    console.log(`${cb.platform}: ${cb.status.state}`);
});

// 2. Check platform health
const health = healthMonitor.getAllPlatformHealth();
Object.entries(health).forEach(([platform, status]) => {
    console.log(`${platform}: ${status.status} (${status.errorRate})`);
});

// 3. Check retry budget
const budget = retryManager.getBudgetStatus();
console.log(`Budget: ${budget.retriesInLastMinute}/${budget.maxRetriesPerMinute}`);

// 4. Check dead letter queue
const dlq = errorHandler.getDeadLetterQueue();
const stats = await dlq.getStats();
console.log(`DLQ size: ${stats.total}`);

// 5. Get top errors
const report = logger.getErrorReport();
console.log('Top errors:', report.topErrors);
```

## 🚨 Emergency Actions

### Reset Everything

```javascript
// Reset circuit breakers
errorHandler.getMetrics().circuitBreakers.forEach(cb => {
    errorHandler.resetCircuitBreaker(cb.platform);
});

// Reset retry budget
retryManager.resetBudget();

// Clear failed queue
retryManager.clearFailedQueue();

// Clear dead letter queue
await errorHandler.getDeadLetterQueue().clear();

// Clear logs
logger.clearStats();

// Reset all platform health
healthMonitor.getAllPlatformHealth().forEach((_, platform) => {
    healthMonitor.resetPlatform(platform);
});
```

### Process Failed Requests

```javascript
// Process failed request queue
const result = await retryManager.processFailedQueue();
console.log(`Processed: ${result.processed}, Success: ${result.successful}`);
```

## 📱 Integration Patterns

### Pattern 1: Simple Retry

```javascript
const result = await retryManager.executeWithRetry(
    async () => await apiCall(),
    { platform: 'openai' }
);
```

### Pattern 2: Retry + Circuit Breaker

```javascript
const result = await retryManager.executeWithRetry(
    async () => {
        return await errorHandler.executeWithProtection(
            async () => await apiCall(),
            { platform: 'openai' }
        );
    },
    { platform: 'openai' }
);
```

### Pattern 3: Full Resilience

```javascript
try {
    const result = await retryManager.executeWithRetry(
        async () => {
            return await errorHandler.executeWithProtection(
                async () => {
                    // Check health first
                    const health = healthMonitor.getPlatformHealth('openai');
                    if (health.status === HealthStatus.DISABLED) {
                        throw new Error('Platform disabled');
                    }

                    // Execute request
                    return await apiCall();
                },
                { platform: 'openai' }
            );
        },
        { platform: 'openai' }
    );
} catch (error) {
    await errorHandler.handle(error, { platform: 'openai' });
    logger.error('Request failed', error, { platform: 'openai' });
    throw error;
}
```

## 💡 Tips

1. **Always add context** to errors and logs
2. **Use specific error types** for better classification
3. **Monitor circuit breaker state** regularly
4. **Process dead letter queue** periodically
5. **Export reports** for analysis
6. **Use child loggers** for component-specific logging
7. **Set appropriate thresholds** based on your SLAs
8. **Test fallback chains** regularly
9. **Monitor retry budget** to prevent overload
10. **Enable debug mode** for troubleshooting

## 📞 Quick Help

- Logs directory: `./logs/`
- Error log: `./logs/error.log`
- Combined log: `./logs/combined.log`
- Dead letter queue: `./dead-letter-queue.json`
- Reports: Use `exportReport()` method

## 🔗 See Also

- Full documentation: `ERROR-HANDLING-README.md`
- Integration example: `error-handling-example.js`
- Component demos: Run individual files with `node <component>.js`
