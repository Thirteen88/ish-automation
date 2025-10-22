#!/usr/bin/env node

/**
 * Comprehensive Error Handler for Production AI Orchestrator
 *
 * Features:
 * - Error classification and custom error types
 * - Error context capturing (stack trace, request details, timestamp)
 * - Error recovery strategies per error type
 * - Circuit breaker pattern implementation
 * - Dead letter queue for failed requests
 * - Error metrics and reporting
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

/**
 * Error Types Classification
 */
const ErrorTypes = {
    NETWORK: 'network',
    AUTH: 'auth',
    RATE_LIMIT: 'rate_limit',
    API: 'api',
    BROWSER: 'browser',
    PARSING: 'parsing',
    TIMEOUT: 'timeout',
    VALIDATION: 'validation',
    UNKNOWN: 'unknown'
};

/**
 * Custom Error Classes
 */
class BaseOrchestrationError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date().toISOString();
        this.context = context;
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            timestamp: this.timestamp,
            context: this.context,
            stack: this.stack
        };
    }
}

class NetworkError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.NETWORK;
        this.retryable = true;
    }
}

class AuthenticationError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.AUTH;
        this.retryable = false;
    }
}

class RateLimitError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.RATE_LIMIT;
        this.retryable = true;
        this.retryAfter = context.retryAfter || 60000; // Default 60s
    }
}

class APIError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.API;
        this.retryable = context.statusCode >= 500; // Retry server errors
        this.statusCode = context.statusCode;
    }
}

class BrowserError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.BROWSER;
        this.retryable = true;
    }
}

class ParsingError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.PARSING;
        this.retryable = false;
    }
}

class TimeoutError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.TIMEOUT;
        this.retryable = true;
    }
}

class ValidationError extends BaseOrchestrationError {
    constructor(message, context = {}) {
        super(message, context);
        this.type = ErrorTypes.VALIDATION;
        this.retryable = false;
    }
}

/**
 * Circuit Breaker States
 */
const CircuitState = {
    CLOSED: 'closed',       // Normal operation
    OPEN: 'open',          // Failing, rejecting requests
    HALF_OPEN: 'half_open' // Testing if service recovered
};

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.threshold = options.threshold || 5; // Failures before opening
        this.timeout = options.timeout || 60000; // Time before retry (ms)
        this.monitoringPeriod = options.monitoringPeriod || 10000; // Window for failures

        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.nextAttempt = null;

        // Track failures over time
        this.recentFailures = [];
    }

    /**
     * Execute action with circuit breaker protection
     */
    async execute(action, context = {}) {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttempt) {
                throw new Error(`Circuit breaker is OPEN for ${context.platform || 'service'}. Next attempt at ${new Date(this.nextAttempt).toISOString()}`);
            }
            // Transition to half-open to test
            this.state = CircuitState.HALF_OPEN;
        }

        try {
            const result = await action();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Handle successful execution
     */
    onSuccess() {
        this.successes++;

        if (this.state === CircuitState.HALF_OPEN) {
            // Service recovered, close circuit
            this.state = CircuitState.CLOSED;
            this.failures = 0;
            this.recentFailures = [];
        }
    }

    /**
     * Handle failed execution
     */
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        this.recentFailures.push(Date.now());

        // Clean old failures outside monitoring period
        this.recentFailures = this.recentFailures.filter(
            time => Date.now() - time < this.monitoringPeriod
        );

        // Open circuit if threshold exceeded
        if (this.recentFailures.length >= this.threshold) {
            this.state = CircuitState.OPEN;
            this.nextAttempt = Date.now() + this.timeout;
        }
    }

    /**
     * Get circuit breaker status
     */
    getStatus() {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            recentFailures: this.recentFailures.length,
            nextAttempt: this.nextAttempt ? new Date(this.nextAttempt).toISOString() : null
        };
    }

    /**
     * Manually reset circuit breaker
     */
    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.recentFailures = [];
        this.nextAttempt = null;
    }
}

/**
 * Dead Letter Queue for Failed Requests
 */
class DeadLetterQueue {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 1000;
        this.persistPath = options.persistPath || './dead-letter-queue.json';
        this.queue = [];
        this.loaded = false;
    }

    /**
     * Load persisted queue from disk
     */
    async load() {
        if (this.loaded) return;

        try {
            const data = await fs.readFile(this.persistPath, 'utf8');
            this.queue = JSON.parse(data);
            this.loaded = true;
        } catch (error) {
            // File doesn't exist or invalid, start fresh
            this.queue = [];
            this.loaded = true;
        }
    }

    /**
     * Add failed request to queue
     */
    async add(request, error, metadata = {}) {
        await this.load();

        const entry = {
            id: `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            request: request,
            error: {
                message: error.message,
                type: error.type || ErrorTypes.UNKNOWN,
                stack: error.stack,
                context: error.context
            },
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                retryCount: metadata.retryCount || 0
            }
        };

        this.queue.push(entry);

        // Trim queue if exceeds max size
        if (this.queue.length > this.maxSize) {
            this.queue = this.queue.slice(-this.maxSize);
        }

        await this.persist();
        return entry.id;
    }

    /**
     * Get all entries in queue
     */
    async getAll() {
        await this.load();
        return this.queue;
    }

    /**
     * Get entry by ID
     */
    async get(id) {
        await this.load();
        return this.queue.find(entry => entry.id === id);
    }

    /**
     * Remove entry from queue
     */
    async remove(id) {
        await this.load();
        this.queue = this.queue.filter(entry => entry.id !== id);
        await this.persist();
    }

    /**
     * Clear entire queue
     */
    async clear() {
        this.queue = [];
        await this.persist();
    }

    /**
     * Get queue statistics
     */
    async getStats() {
        await this.load();

        const byErrorType = {};
        const byPlatform = {};

        this.queue.forEach(entry => {
            const errorType = entry.error.type;
            const platform = entry.metadata.platform;

            byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;
            if (platform) {
                byPlatform[platform] = (byPlatform[platform] || 0) + 1;
            }
        });

        return {
            total: this.queue.length,
            byErrorType,
            byPlatform,
            oldestEntry: this.queue[0]?.metadata.timestamp,
            newestEntry: this.queue[this.queue.length - 1]?.metadata.timestamp
        };
    }

    /**
     * Persist queue to disk
     */
    async persist() {
        try {
            await fs.writeFile(this.persistPath, JSON.stringify(this.queue, null, 2));
        } catch (error) {
            console.error('Failed to persist dead letter queue:', error.message);
        }
    }
}

/**
 * Error Recovery Strategies
 */
class RecoveryStrategies {
    static async forNetworkError(error, context) {
        return {
            shouldRetry: true,
            retryDelay: 2000,
            maxRetries: 5,
            strategy: 'exponential_backoff',
            action: 'retry_request'
        };
    }

    static async forAuthError(error, context) {
        return {
            shouldRetry: false,
            strategy: 'manual_intervention',
            action: 'check_credentials',
            message: 'Authentication failed. Please verify API keys or login status.'
        };
    }

    static async forRateLimitError(error, context) {
        return {
            shouldRetry: true,
            retryDelay: error.retryAfter || 60000,
            maxRetries: 3,
            strategy: 'delayed_retry',
            action: 'wait_and_retry'
        };
    }

    static async forAPIError(error, context) {
        const isServerError = error.statusCode >= 500;

        return {
            shouldRetry: isServerError,
            retryDelay: isServerError ? 5000 : 0,
            maxRetries: isServerError ? 3 : 0,
            strategy: isServerError ? 'exponential_backoff' : 'no_retry',
            action: isServerError ? 'retry_request' : 'fallback_to_alternative'
        };
    }

    static async forBrowserError(error, context) {
        return {
            shouldRetry: true,
            retryDelay: 3000,
            maxRetries: 3,
            strategy: 'browser_restart',
            action: 'restart_browser_and_retry'
        };
    }

    static async forParsingError(error, context) {
        return {
            shouldRetry: false,
            strategy: 'data_validation',
            action: 'log_and_notify',
            message: 'Response parsing failed. Data format may have changed.'
        };
    }

    static async forTimeoutError(error, context) {
        return {
            shouldRetry: true,
            retryDelay: 1000,
            maxRetries: 2,
            strategy: 'increased_timeout',
            action: 'retry_with_longer_timeout'
        };
    }

    static async forUnknownError(error, context) {
        return {
            shouldRetry: false,
            strategy: 'investigate',
            action: 'log_and_alert',
            message: 'Unknown error occurred. Manual investigation required.'
        };
    }
}

/**
 * Main Error Handler
 */
class ErrorHandler extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            enableCircuitBreaker: options.enableCircuitBreaker !== false,
            enableDeadLetterQueue: options.enableDeadLetterQueue !== false,
            circuitBreakerOptions: options.circuitBreakerOptions || {},
            deadLetterQueueOptions: options.deadLetterQueueOptions || {},
            metricsEnabled: options.metricsEnabled !== false,
            ...options
        };

        // Circuit breakers per platform
        this.circuitBreakers = new Map();

        // Dead letter queue
        this.deadLetterQueue = new DeadLetterQueue(this.options.deadLetterQueueOptions);

        // Error metrics
        this.metrics = {
            byType: {},
            byPlatform: {},
            total: 0,
            recovered: 0,
            failed: 0
        };
    }

    /**
     * Classify error into appropriate type
     */
    classifyError(error, context = {}) {
        // Already classified
        if (error instanceof BaseOrchestrationError) {
            return error;
        }

        const message = error.message || String(error);
        const statusCode = error.statusCode || context.statusCode;

        // Network errors
        if (
            message.includes('ECONNREFUSED') ||
            message.includes('ENOTFOUND') ||
            message.includes('ETIMEDOUT') ||
            message.includes('ECONNRESET') ||
            message.includes('network')
        ) {
            return new NetworkError(message, { ...context, originalError: error });
        }

        // Authentication errors
        if (
            statusCode === 401 ||
            statusCode === 403 ||
            message.includes('unauthorized') ||
            message.includes('authentication') ||
            message.includes('api key')
        ) {
            return new AuthenticationError(message, { ...context, statusCode, originalError: error });
        }

        // Rate limit errors
        if (
            statusCode === 429 ||
            message.includes('rate limit') ||
            message.includes('too many requests')
        ) {
            const retryAfter = context.retryAfter || this.extractRetryAfter(error);
            return new RateLimitError(message, { ...context, statusCode, retryAfter, originalError: error });
        }

        // API errors
        if (statusCode && statusCode >= 400) {
            return new APIError(message, { ...context, statusCode, originalError: error });
        }

        // Browser/automation errors
        if (
            message.includes('browser') ||
            message.includes('page') ||
            message.includes('selector') ||
            message.includes('element not found') ||
            message.includes('captcha')
        ) {
            return new BrowserError(message, { ...context, originalError: error });
        }

        // Timeout errors
        if (
            message.includes('timeout') ||
            message.includes('timed out') ||
            statusCode === 408
        ) {
            return new TimeoutError(message, { ...context, statusCode, originalError: error });
        }

        // Parsing errors
        if (
            message.includes('parse') ||
            message.includes('JSON') ||
            message.includes('invalid response')
        ) {
            return new ParsingError(message, { ...context, originalError: error });
        }

        // Default to generic error
        return new BaseOrchestrationError(message, { ...context, originalError: error });
    }

    /**
     * Extract retry-after from error
     */
    extractRetryAfter(error) {
        if (error.response?.headers?.['retry-after']) {
            const retryAfter = error.response.headers['retry-after'];
            // Could be seconds or a date
            const seconds = parseInt(retryAfter);
            if (!isNaN(seconds)) {
                return seconds * 1000;
            }
        }
        return null;
    }

    /**
     * Handle error with appropriate strategy
     */
    async handle(error, context = {}) {
        // Classify error
        const classifiedError = this.classifyError(error, context);

        // Track metrics
        this.trackError(classifiedError, context);

        // Emit error event
        this.emit('error', {
            error: classifiedError,
            context: context
        });

        // Get recovery strategy
        const strategy = await this.getRecoveryStrategy(classifiedError, context);

        // Log error
        this.logError(classifiedError, strategy, context);

        // Check circuit breaker
        if (this.options.enableCircuitBreaker && context.platform) {
            const breaker = this.getCircuitBreaker(context.platform);
            const breakerStatus = breaker.getStatus();

            if (breakerStatus.state === CircuitState.OPEN) {
                strategy.shouldRetry = false;
                strategy.action = 'circuit_breaker_open';
                strategy.message = `Circuit breaker is OPEN for ${context.platform}`;
            }
        }

        // Add to dead letter queue if not retryable
        if (!strategy.shouldRetry && this.options.enableDeadLetterQueue) {
            await this.deadLetterQueue.add(
                context.request || {},
                classifiedError,
                {
                    platform: context.platform,
                    retryCount: context.retryCount || 0,
                    strategy: strategy
                }
            );
        }

        return {
            error: classifiedError,
            strategy: strategy,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get recovery strategy for error type
     */
    async getRecoveryStrategy(error, context) {
        const strategyMap = {
            [ErrorTypes.NETWORK]: RecoveryStrategies.forNetworkError,
            [ErrorTypes.AUTH]: RecoveryStrategies.forAuthError,
            [ErrorTypes.RATE_LIMIT]: RecoveryStrategies.forRateLimitError,
            [ErrorTypes.API]: RecoveryStrategies.forAPIError,
            [ErrorTypes.BROWSER]: RecoveryStrategies.forBrowserError,
            [ErrorTypes.PARSING]: RecoveryStrategies.forParsingError,
            [ErrorTypes.TIMEOUT]: RecoveryStrategies.forTimeoutError
        };

        const strategyFn = strategyMap[error.type] || RecoveryStrategies.forUnknownError;
        return await strategyFn(error, context);
    }

    /**
     * Get or create circuit breaker for platform
     */
    getCircuitBreaker(platform) {
        if (!this.circuitBreakers.has(platform)) {
            this.circuitBreakers.set(
                platform,
                new CircuitBreaker(this.options.circuitBreakerOptions)
            );
        }
        return this.circuitBreakers.get(platform);
    }

    /**
     * Execute action with circuit breaker protection
     */
    async executeWithProtection(action, context = {}) {
        if (!context.platform) {
            return await action();
        }

        const breaker = this.getCircuitBreaker(context.platform);
        return await breaker.execute(action, context);
    }

    /**
     * Track error in metrics
     */
    trackError(error, context) {
        if (!this.options.metricsEnabled) return;

        this.metrics.total++;

        // By type
        const type = error.type || ErrorTypes.UNKNOWN;
        this.metrics.byType[type] = (this.metrics.byType[type] || 0) + 1;

        // By platform
        if (context.platform) {
            if (!this.metrics.byPlatform[context.platform]) {
                this.metrics.byPlatform[context.platform] = {};
            }
            this.metrics.byPlatform[context.platform][type] =
                (this.metrics.byPlatform[context.platform][type] || 0) + 1;
        }
    }

    /**
     * Log error with context
     */
    logError(error, strategy, context) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: error.type,
            message: error.message,
            platform: context.platform,
            retryable: strategy.shouldRetry,
            strategy: strategy.strategy,
            stack: error.stack
        };

        console.error('[ERROR]', JSON.stringify(logEntry, null, 2));
    }

    /**
     * Get error metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([platform, breaker]) => ({
                platform,
                status: breaker.getStatus()
            }))
        };
    }

    /**
     * Reset circuit breaker for platform
     */
    resetCircuitBreaker(platform) {
        const breaker = this.circuitBreakers.get(platform);
        if (breaker) {
            breaker.reset();
        }
    }

    /**
     * Get dead letter queue
     */
    getDeadLetterQueue() {
        return this.deadLetterQueue;
    }
}

// Export classes and types
module.exports = {
    ErrorHandler,
    ErrorTypes,
    CircuitBreaker,
    CircuitState,
    DeadLetterQueue,

    // Error classes
    BaseOrchestrationError,
    NetworkError,
    AuthenticationError,
    RateLimitError,
    APIError,
    BrowserError,
    ParsingError,
    TimeoutError,
    ValidationError,

    // Recovery strategies
    RecoveryStrategies
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Error Handler Demo ===\n');

        const handler = new ErrorHandler({
            enableCircuitBreaker: true,
            enableDeadLetterQueue: true,
            metricsEnabled: true
        });

        // Listen to error events
        handler.on('error', ({ error, context }) => {
            console.log(`\n[Event] Error occurred: ${error.type} - ${error.message}`);
        });

        // Simulate different error types
        const testErrors = [
            new Error('ECONNREFUSED: Connection refused'),
            new Error('Unauthorized: Invalid API key'),
            new Error('Rate limit exceeded'),
            { message: 'Internal Server Error', statusCode: 500 },
            new Error('Element not found in page'),
            new Error('Request timeout after 30000ms')
        ];

        console.log('Testing error classification and recovery strategies:\n');

        for (let i = 0; i < testErrors.length; i++) {
            const error = testErrors[i];
            const context = {
                platform: 'test-platform',
                request: { prompt: 'test prompt' },
                retryCount: 0
            };

            const result = await handler.handle(error, context);

            console.log(`\nTest ${i + 1}:`);
            console.log(`  Error Type: ${result.error.type}`);
            console.log(`  Should Retry: ${result.strategy.shouldRetry}`);
            console.log(`  Strategy: ${result.strategy.strategy}`);
            console.log(`  Action: ${result.strategy.action}`);
        }

        // Test circuit breaker
        console.log('\n\nTesting circuit breaker:');
        const breaker = handler.getCircuitBreaker('test-platform');

        for (let i = 0; i < 7; i++) {
            try {
                await breaker.execute(async () => {
                    throw new Error('Simulated failure');
                }, { platform: 'test-platform' });
            } catch (error) {
                // Expected
            }
            console.log(`  Attempt ${i + 1}: ${breaker.getStatus().state}`);
        }

        // Get metrics
        console.log('\n\nError Metrics:');
        console.log(JSON.stringify(handler.getMetrics(), null, 2));

        // Get DLQ stats
        console.log('\n\nDead Letter Queue Stats:');
        const dlqStats = await handler.getDeadLetterQueue().getStats();
        console.log(JSON.stringify(dlqStats, null, 2));
    }

    demo().catch(console.error);
}

// Export the ErrorHandler class
module.exports = ErrorHandler;
