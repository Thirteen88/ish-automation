#!/usr/bin/env node

/**
 * Error Handling System Verification Script
 *
 * Runs comprehensive tests to verify all components are working correctly
 */

console.log('\n=== Error Handling System Verification ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('✓', name);
        passed++;
    } catch (error) {
        console.log('✗', name);
        console.log('  Error:', error.message);
        failed++;
    }
}

// Test 1: Module Loading
console.log('\n1. Module Loading\n');

test('error-handler.js loads', () => {
    const { ErrorHandler, NetworkError, ErrorTypes } = require('./error-handler');
    if (!ErrorHandler || !NetworkError || !ErrorTypes) throw new Error('Missing exports');
});

test('retry-manager.js loads', () => {
    const { RetryManager, RetryStrategy, JitterType } = require('./retry-manager');
    if (!RetryManager || !RetryStrategy || !JitterType) throw new Error('Missing exports');
});

test('health-monitor.js loads', () => {
    const { HealthMonitor, HealthStatus, AlertSeverity } = require('./health-monitor');
    if (!HealthMonitor || !HealthStatus || !AlertSeverity) throw new Error('Missing exports');
});

test('error-logging.js loads', () => {
    const { createLogger, LogLevel } = require('./error-logging');
    if (!createLogger || !LogLevel) throw new Error('Missing exports');
});

test('error-handling-example.js loads', () => {
    const { ResilientOrchestrator } = require('./error-handling-example');
    if (!ResilientOrchestrator) throw new Error('Missing exports');
});

// Test 2: Component Initialization
console.log('\n2. Component Initialization\n');

test('ErrorHandler initializes', () => {
    const { ErrorHandler } = require('./error-handler');
    const handler = new ErrorHandler();
    if (!handler) throw new Error('Failed to initialize');
});

test('RetryManager initializes', () => {
    const { RetryManager } = require('./retry-manager');
    const manager = new RetryManager();
    if (!manager) throw new Error('Failed to initialize');
});

test('HealthMonitor initializes', () => {
    const { HealthMonitor } = require('./health-monitor');
    const monitor = new HealthMonitor();
    if (!monitor) throw new Error('Failed to initialize');
});

test('ErrorLogger initializes', () => {
    const { createLogger } = require('./error-logging');
    const logger = createLogger();
    if (!logger) throw new Error('Failed to initialize');
});

// Test 3: Error Classification
console.log('\n3. Error Classification\n');

test('NetworkError classified correctly', () => {
    const { ErrorHandler, ErrorTypes } = require('./error-handler');
    const handler = new ErrorHandler();
    const error = new Error('ECONNREFUSED: Connection refused');
    const classified = handler.classifyError(error);
    if (classified.type !== ErrorTypes.NETWORK) throw new Error('Wrong classification');
});

test('RateLimitError classified correctly', () => {
    const { ErrorHandler, ErrorTypes } = require('./error-handler');
    const handler = new ErrorHandler();
    const error = new Error('Rate limit exceeded');
    const classified = handler.classifyError(error);
    if (classified.type !== ErrorTypes.RATE_LIMIT) throw new Error('Wrong classification');
});

// Test 4: Circuit Breaker
console.log('\n4. Circuit Breaker\n');

test('Circuit breaker starts closed', () => {
    const { CircuitBreaker, CircuitState } = require('./error-handler');
    const breaker = new CircuitBreaker();
    if (breaker.state !== CircuitState.CLOSED) throw new Error('Wrong initial state');
});

test('Circuit breaker opens after failures', () => {
    const { CircuitBreaker, CircuitState } = require('./error-handler');
    const breaker = new CircuitBreaker({ threshold: 3 });
    for (let i = 0; i < 3; i++) {
        breaker.onFailure();
    }
    if (breaker.state !== CircuitState.OPEN) throw new Error('Circuit did not open');
});

// Test 5: Retry Strategies
console.log('\n5. Retry Strategies\n');

test('Exponential backoff calculates delay', () => {
    const { PlatformRetryConfig, RetryStrategy } = require('./retry-manager');
    const config = new PlatformRetryConfig('test', {
        strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
        initialDelay: 1000,
        backoffMultiplier: 2
    });
    const delay = config.getDelay(2);
    if (delay <= 0) throw new Error('Invalid delay');
});

test('Retry budget tracks usage', () => {
    const { RetryBudget } = require('./retry-manager');
    const budget = new RetryBudget({ maxRetriesPerMinute: 10 });
    if (!budget.canRetry()) throw new Error('Should allow retry');
    budget.consume();
    const status = budget.getStatus();
    if (status.retriesInLastMinute !== 1) throw new Error('Wrong tracking');
});

// Test 6: Health Monitoring
console.log('\n6. Health Monitoring\n');

test('Health check records success', () => {
    const { PlatformHealthCheck } = require('./health-monitor');
    const healthCheck = new PlatformHealthCheck('test');
    healthCheck.recordSuccess(100);
    if (healthCheck.consecutiveSuccesses !== 1) throw new Error('Wrong tracking');
});

test('Health status updates correctly', () => {
    const { PlatformHealthCheck, HealthStatus } = require('./health-monitor');
    const healthCheck = new PlatformHealthCheck('test', { unhealthyThreshold: 2 });
    healthCheck.recordFailure(new Error('test'), 100);
    healthCheck.recordFailure(new Error('test'), 100);
    healthCheck.updateStatus();
    if (healthCheck.status !== HealthStatus.UNHEALTHY) throw new Error('Wrong status');
});

// Summary
console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed === 0) {
    console.log('\n✓ All tests passed! System is ready for use.\n');
    process.exit(0);
} else {
    console.log('\n✗ Some tests failed. Please review errors above.\n');
    process.exit(1);
}
