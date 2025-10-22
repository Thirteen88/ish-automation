# Resilience System - Quick Start Guide

## Installation

```bash
cd /home/gary/ish-automation/resilience
npm install
```

## Basic Usage

### 1. Import the Resilient Orchestrator

```javascript
const { ResilientOrchestrator } = require('./resilience');
const { Priority } = require('./queue-manager');
```

### 2. Initialize with Platform Configuration

```javascript
const orchestrator = new ResilientOrchestrator({
    platforms: [
        { name: 'huggingface', priority: 1, weight: 1.0 },
        { name: 'perplexity', priority: 2, weight: 0.8 },
        { name: 'lmarena', priority: 3, weight: 0.6 }
    ],
    concurrency: 3,
    retryConfig: {
        maxRetries: 5,
        baseDelay: 1000,
        jitterFactor: 0.3
    },
    cacheOptions: {
        maxSize: 1000,
        defaultTtl: 3600000  // 1 hour
    }
});
```

### 3. Execute Resilient Requests

```javascript
// Synchronous execution with full resilience
const result = await orchestrator.executeResilient(
    async (platform) => {
        // Your platform-specific logic here
        return await queryAIPlatform(platform, prompt);
    },
    {
        prompt: 'What is machine learning?',
        preferredPlatform: 'huggingface',
        timeout: 30000
    }
);

console.log(result.result);  // The actual response
console.log(result.source);  // 'live', 'cache', or 'cache_stale'
console.log(result.quality); // Quality score 0.0-1.0
```

### 4. Queue Requests for Async Processing

```javascript
// Enqueue high-priority request
const requestId = await orchestrator.enqueueRequest(
    async (platform) => await queryAIPlatform(platform, prompt),
    {
        prompt: 'Explain quantum computing',
        priority: Priority.HIGH,
        maxRetries: 3,
        timeout: 30000
    }
);

console.log(`Request queued: ${requestId}`);
```

### 5. Monitor System Health

```javascript
// Get comprehensive metrics
const metrics = orchestrator.getMetrics();
console.log('Success Rate:', metrics.overall.successRate);
console.log('Retry Rate:', metrics.retryManager.retryRate);
console.log('Cache Hit Rate:', metrics.gracefulDegradation.cacheHitRate);

// Get health status
const health = orchestrator.getHealth();
console.log('System Status:', health.status); // 'healthy', 'degraded', or 'critical'
console.log('Platform Health:', health.platforms);
```

### 6. Listen to Events

```javascript
// Retry events
orchestrator.on('retry', ({ platform, attempt, delay }) => {
    console.log(`Retrying ${platform}, attempt ${attempt}, delay ${delay}ms`);
});

// Fallback events
orchestrator.on('fallback', ({ from, to, error }) => {
    console.log(`Falling back from ${from} to ${to}: ${error}`);
});

// Self-healing events
orchestrator.on('self_healing', ({ platform, action, success }) => {
    console.log(`Self-healing ${platform}: ${action} (${success ? 'success' : 'failed'})`);
});

// Platform recovery
orchestrator.on('platform_recovered', ({ platform, recoveryAttempts }) => {
    console.log(`Platform ${platform} recovered after ${recoveryAttempts} attempts`);
});

// Request success/failure
orchestrator.on('request_success', ({ responseTime, source, quality }) => {
    console.log(`Request succeeded in ${responseTime}ms from ${source} (quality: ${quality})`);
});

orchestrator.on('request_error', ({ error, responseTime }) => {
    console.error(`Request failed after ${responseTime}ms: ${error}`);
});
```

## Common Patterns

### Pattern 1: Simple Query with Fallback

```javascript
try {
    const result = await orchestrator.executeResilient(
        async (platform) => await queryPlatform(platform, 'Hello'),
        { prompt: 'Hello', allowStale: true }
    );
    console.log(result.result);
} catch (error) {
    console.error('All platforms and cache failed:', error);
}
```

### Pattern 2: Batch Processing with Queue

```javascript
const queries = ['Query 1', 'Query 2', 'Query 3'];

for (const query of queries) {
    await orchestrator.enqueueRequest(
        async (platform) => await queryPlatform(platform, query),
        { prompt: query, priority: Priority.NORMAL }
    );
}

// Wait for processing
await new Promise(resolve => setTimeout(resolve, 10000));

// Check queue status
const stats = orchestrator.queueManager.getStats();
console.log('Queue:', stats);
```

### Pattern 3: Manual Platform Selection

```javascript
const result = await orchestrator.executeResilient(
    async (platform) => await queryPlatform(platform, prompt),
    {
        prompt: 'Your query',
        preferredPlatform: 'huggingface',  // Try this first
        excludePlatforms: ['lmarena']      // Skip this one
    }
);
```

### Pattern 4: Custom Error Handling

```javascript
orchestrator.on('request_failed', async ({ platform, error, classification }) => {
    console.log(`Platform: ${platform}`);
    console.log(`Error Category: ${classification.category}`);
    console.log(`Retryable: ${classification.retryable}`);
    console.log(`Strategy: ${classification.strategy}`);
    
    // Custom handling based on error type
    if (classification.category === 'auth') {
        // Alert admin
        await notifyAdmin('Authentication failure', platform);
    }
});
```

## Testing

### Run Demos

```bash
# Test individual components
node retry-manager.js
node platform-fallback.js
node queue-manager.js
node error-classifier.js
node graceful-degradation.js
node self-heal.js

# Test integrated system
node index.js
```

### Run Chaos Tests

```bash
node chaos-tests.js
```

Expected output: 8/9 tests passing

### Generate Report

```bash
node generate-report.js
```

## Configuration Options

### Retry Configuration

```javascript
retryConfig: {
    maxRetries: 5,           // Max retry attempts
    baseDelay: 1000,         // Base delay in ms
    maxDelay: 30000,         // Max delay in ms
    policy: 'exponential',   // 'exponential', 'linear', 'fixed', 'adaptive'
    jitterFactor: 0.3        // Jitter factor (0.0-1.0)
}
```

### Cache Configuration

```javascript
cacheOptions: {
    maxSize: 1000,           // Max cache entries
    defaultTtl: 3600000,     // Default TTL in ms (1 hour)
    staleTtl: 300000,        // Stale threshold in ms (5 minutes)
    persistEnabled: true     // Enable disk persistence
}
```

### Queue Configuration

```javascript
queueStorageOptions: {
    queueDir: './queue',     // Queue storage directory
    maxQueueSize: 10000,     // Max queue size
    concurrency: 3,          // Parallel processing
    processingInterval: 100  // Processing loop interval in ms
}
```

## Troubleshooting

### Problem: Circuit Breaker Stuck Open

```javascript
// Reset circuit breaker manually
orchestrator.retryManager.resetCircuitBreaker('platform-name');
```

### Problem: High Queue Backlog

```javascript
// Check queue
const stats = orchestrator.queueManager.getStats();
console.log('Queue size:', stats.currentSize);

// Increase concurrency
orchestrator.queueManager.concurrency = 5;
```

### Problem: Low Cache Hit Rate

```javascript
// Check cache stats
const cacheStats = orchestrator.gracefulDegradation.cache.getStats();
console.log('Cache hit rate:', cacheStats.hitRate);

// Increase cache size or TTL
orchestrator.gracefulDegradation.cache.maxSize = 2000;
orchestrator.gracefulDegradation.cache.defaultTtl = 7200000; // 2 hours
```

### Problem: Platform Marked as Unhealthy

```javascript
// Check platform health
const health = orchestrator.getPlatformHealth('platform-name');
console.log(health);

// Reset platform health if needed
orchestrator.resetPlatformHealth('platform-name');
```

## Production Checklist

- [ ] Configure platform priorities based on reliability
- [ ] Set up Winston logging
- [ ] Configure alerts for circuit breaker events
- [ ] Set appropriate cache TTL
- [ ] Consider Redis for queue persistence
- [ ] Tune circuit breaker thresholds
- [ ] Enable health monitoring
- [ ] Set up metrics export
- [ ] Test disaster recovery
- [ ] Document escalation procedures

## Performance Tips

1. **Enable Request Deduplication**: Prevents duplicate processing
2. **Use Priority Queuing**: Process critical requests first
3. **Configure Appropriate TTL**: Balance freshness vs availability
4. **Monitor Platform Health**: Adjust priorities based on performance
5. **Use Weighted Routing**: Distribute load to healthy platforms

## Support

- Full Documentation: `README.md`
- Implementation Report: `IMPLEMENTATION_REPORT.md`
- Production Report: `resilience-report-*.md`

---

**Quick Start Guide Version:** 1.0.0
**Last Updated:** October 21, 2025
