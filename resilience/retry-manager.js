#!/usr/bin/env node

/**
 * Advanced Retry Manager with Exponential Backoff and Circuit Breaker
 *
 * Features:
 * - Exponential backoff with jitter (1s, 2s, 4s, 8s, 16s)
 * - Circuit breaker pattern integration
 * - Retry attempt tracking and success rate monitoring
 * - Platform-specific retry policies
 * - Adaptive retry strategies based on error patterns
 * - Request deduplication to prevent thundering herd
 */

const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Retry Policies
 */
const RetryPolicies = {
    EXPONENTIAL: 'exponential',
    LINEAR: 'linear',
    FIXED: 'fixed',
    ADAPTIVE: 'adaptive'
};

/**
 * Circuit Breaker States
 */
const CircuitState = {
    CLOSED: 'closed',
    OPEN: 'open',
    HALF_OPEN: 'half_open'
};

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.threshold = options.threshold || 5;
        this.timeout = options.timeout || 60000; // 60s
        this.monitoringWindow = options.monitoringWindow || 10000; // 10s
        this.halfOpenRequests = options.halfOpenRequests || 3;

        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.successes = 0;
        this.nextAttempt = null;
        this.halfOpenAttempts = 0;
    }

    async execute(action, context = {}) {
        // Check circuit state
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttempt) {
                const error = new Error(`Circuit breaker OPEN for ${context.name || 'service'}`);
                error.circuitOpen = true;
                error.nextAttempt = this.nextAttempt;
                throw error;
            }
            // Transition to half-open
            this.state = CircuitState.HALF_OPEN;
            this.halfOpenAttempts = 0;
        }

        if (this.state === CircuitState.HALF_OPEN) {
            if (this.halfOpenAttempts >= this.halfOpenRequests) {
                const error = new Error(`Circuit breaker HALF_OPEN - max test requests reached`);
                error.circuitOpen = true;
                throw error;
            }
            this.halfOpenAttempts++;
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

    onSuccess() {
        this.successes++;

        if (this.state === CircuitState.HALF_OPEN) {
            // Service recovered, close circuit
            this.state = CircuitState.CLOSED;
            this.failures = [];
            this.halfOpenAttempts = 0;
        }
    }

    onFailure() {
        const now = Date.now();
        this.failures.push(now);

        // Clean old failures outside monitoring window
        this.failures = this.failures.filter(
            time => now - time < this.monitoringWindow
        );

        // Check if threshold exceeded
        if (this.failures.length >= this.threshold) {
            this.state = CircuitState.OPEN;
            this.nextAttempt = now + this.timeout;
        }
    }

    getStatus() {
        return {
            state: this.state,
            failures: this.failures.length,
            successes: this.successes,
            nextAttempt: this.nextAttempt ? new Date(this.nextAttempt).toISOString() : null,
            healthScore: this.calculateHealthScore()
        };
    }

    calculateHealthScore() {
        const total = this.successes + this.failures.length;
        if (total === 0) return 1.0;
        return this.successes / total;
    }

    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.successes = 0;
        this.nextAttempt = null;
        this.halfOpenAttempts = 0;
    }
}

/**
 * Retry Configuration
 */
class RetryConfig {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 5;
        this.baseDelay = options.baseDelay || 1000; // 1s
        this.maxDelay = options.maxDelay || 30000; // 30s
        this.policy = options.policy || RetryPolicies.EXPONENTIAL;
        this.jitterFactor = options.jitterFactor || 0.3; // 30% jitter
        this.retryableErrors = options.retryableErrors || [
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ENOTFOUND',
            'ECONNRESET',
            'timeout',
            'network',
            'rate_limit'
        ];
        this.nonRetryableErrors = options.nonRetryableErrors || [
            'auth',
            'validation',
            'parsing'
        ];
    }

    shouldRetry(error, attempt) {
        // Check if max retries exceeded
        if (attempt >= this.maxRetries) {
            return false;
        }

        // Check circuit breaker
        if (error.circuitOpen) {
            return false;
        }

        // Check if error is retryable
        const errorMessage = error.message?.toLowerCase() || '';
        const errorType = error.type?.toLowerCase() || '';

        // Non-retryable errors
        if (this.nonRetryableErrors.some(err =>
            errorMessage.includes(err) || errorType.includes(err)
        )) {
            return false;
        }

        // Retryable errors
        if (this.retryableErrors.some(err =>
            errorMessage.includes(err) || errorType.includes(err)
        )) {
            return true;
        }

        // Default: retry if retryable flag is set
        return error.retryable === true;
    }

    calculateDelay(attempt) {
        let delay;

        switch (this.policy) {
            case RetryPolicies.EXPONENTIAL:
                delay = this.baseDelay * Math.pow(2, attempt);
                break;

            case RetryPolicies.LINEAR:
                delay = this.baseDelay * (attempt + 1);
                break;

            case RetryPolicies.FIXED:
                delay = this.baseDelay;
                break;

            case RetryPolicies.ADAPTIVE:
                // Adaptive: exponential with success rate adjustment
                delay = this.baseDelay * Math.pow(2, attempt);
                break;

            default:
                delay = this.baseDelay;
        }

        // Cap at max delay
        delay = Math.min(delay, this.maxDelay);

        // Add jitter to prevent thundering herd
        const jitter = delay * this.jitterFactor * (Math.random() - 0.5) * 2;
        delay = delay + jitter;

        return Math.max(0, Math.round(delay));
    }
}

/**
 * Request Tracker for Deduplication
 */
class RequestTracker {
    constructor(options = {}) {
        this.ttl = options.ttl || 60000; // 1 minute
        this.requests = new Map();
    }

    getRequestId(action, context) {
        const data = JSON.stringify({ action: action.toString(), context });
        return crypto.createHash('md5').update(data).digest('hex');
    }

    track(requestId, promise) {
        this.requests.set(requestId, {
            promise,
            timestamp: Date.now()
        });

        // Cleanup when promise resolves
        promise.finally(() => {
            setTimeout(() => this.requests.delete(requestId), this.ttl);
        });
    }

    get(requestId) {
        const request = this.requests.get(requestId);
        if (!request) return null;

        // Check if expired
        if (Date.now() - request.timestamp > this.ttl) {
            this.requests.delete(requestId);
            return null;
        }

        return request.promise;
    }

    cleanup() {
        const now = Date.now();
        for (const [id, request] of this.requests.entries()) {
            if (now - request.timestamp > this.ttl) {
                this.requests.delete(id);
            }
        }
    }
}

/**
 * Main Retry Manager
 */
class RetryManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.config = new RetryConfig(options.retryConfig || {});
        this.circuitBreakerEnabled = options.circuitBreakerEnabled !== false;
        this.deduplicationEnabled = options.deduplicationEnabled !== false;

        // Circuit breakers per platform/service
        this.circuitBreakers = new Map();

        // Request tracker for deduplication
        this.requestTracker = new RequestTracker();

        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            totalRetries: 0,
            deduplicatedRequests: 0,
            byPlatform: {}
        };

        // Cleanup interval
        setInterval(() => this.requestTracker.cleanup(), 60000);
    }

    /**
     * Execute action with retry logic
     */
    async execute(action, context = {}) {
        this.metrics.totalRequests++;

        const platform = context.platform || 'default';

        // Initialize platform metrics
        if (!this.metrics.byPlatform[platform]) {
            this.metrics.byPlatform[platform] = {
                requests: 0,
                successes: 0,
                failures: 0,
                retries: 0
            };
        }
        this.metrics.byPlatform[platform].requests++;

        // Check for duplicate request
        if (this.deduplicationEnabled) {
            const requestId = this.requestTracker.getRequestId(action, context);
            const existingRequest = this.requestTracker.get(requestId);

            if (existingRequest) {
                this.metrics.deduplicatedRequests++;
                this.emit('deduplicated', { platform, context });
                return await existingRequest;
            }

            // Track new request
            const promise = this._executeWithRetry(action, context, platform);
            this.requestTracker.track(requestId, promise);
            return await promise;
        }

        return await this._executeWithRetry(action, context, platform);
    }

    async _executeWithRetry(action, context, platform) {
        let attempt = 0;
        let lastError;

        while (true) {
            try {
                // Execute with circuit breaker if enabled
                let result;
                if (this.circuitBreakerEnabled) {
                    const breaker = this.getCircuitBreaker(platform);
                    result = await breaker.execute(action, { ...context, name: platform });
                } else {
                    result = await action();
                }

                // Success
                this.metrics.successfulRequests++;
                this.metrics.byPlatform[platform].successes++;

                if (attempt > 0) {
                    this.metrics.retriedRequests++;
                    this.emit('retry_success', {
                        platform,
                        attempts: attempt,
                        context
                    });
                }

                this.emit('success', { platform, attempts: attempt, context });
                return result;

            } catch (error) {
                lastError = error;
                attempt++;

                this.metrics.totalRetries++;
                this.metrics.byPlatform[platform].retries++;

                // Check if should retry
                if (!this.config.shouldRetry(error, attempt)) {
                    this.metrics.failedRequests++;
                    this.metrics.byPlatform[platform].failures++;

                    this.emit('failed', {
                        platform,
                        error,
                        attempts: attempt,
                        context
                    });

                    throw error;
                }

                // Calculate delay
                const delay = this.config.calculateDelay(attempt - 1);

                this.emit('retry', {
                    platform,
                    attempt,
                    delay,
                    error: error.message,
                    context
                });

                // Wait before retry
                await this.sleep(delay);
            }
        }
    }

    /**
     * Get or create circuit breaker for platform
     */
    getCircuitBreaker(platform) {
        if (!this.circuitBreakers.has(platform)) {
            this.circuitBreakers.set(platform, new CircuitBreaker({
                threshold: 5,
                timeout: 60000,
                monitoringWindow: 10000
            }));
        }
        return this.circuitBreakers.get(platform);
    }

    /**
     * Get retry manager metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([platform, breaker]) => ({
                platform,
                status: breaker.getStatus()
            })),
            successRate: this.metrics.totalRequests > 0
                ? this.metrics.successfulRequests / this.metrics.totalRequests
                : 0,
            retryRate: this.metrics.totalRequests > 0
                ? this.metrics.retriedRequests / this.metrics.totalRequests
                : 0
        };
    }

    /**
     * Reset circuit breaker for platform
     */
    resetCircuitBreaker(platform) {
        const breaker = this.circuitBreakers.get(platform);
        if (breaker) {
            breaker.reset();
            this.emit('circuit_reset', { platform });
        }
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            totalRetries: 0,
            deduplicatedRequests: 0,
            byPlatform: {}
        };
        this.emit('metrics_reset');
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export classes
module.exports = {
    RetryManager,
    RetryConfig,
    CircuitBreaker,
    RetryPolicies,
    CircuitState
};

// Demo
if (require.main === module) {
    async function demo() {
        console.log('=== Retry Manager Demo ===\n');

        const retryManager = new RetryManager({
            retryConfig: {
                maxRetries: 5,
                baseDelay: 1000,
                policy: RetryPolicies.EXPONENTIAL,
                jitterFactor: 0.3
            },
            circuitBreakerEnabled: true,
            deduplicationEnabled: true
        });

        // Listen to events
        retryManager.on('retry', ({ platform, attempt, delay, error }) => {
            console.log(`[RETRY] ${platform} - Attempt ${attempt}, delay ${delay}ms - ${error}`);
        });

        retryManager.on('retry_success', ({ platform, attempts }) => {
            console.log(`[SUCCESS] ${platform} - Succeeded after ${attempts} retries`);
        });

        retryManager.on('failed', ({ platform, error, attempts }) => {
            console.log(`[FAILED] ${platform} - Failed after ${attempts} attempts - ${error.message}`);
        });

        retryManager.on('deduplicated', ({ platform }) => {
            console.log(`[DEDUPLICATED] ${platform} - Request deduplicated`);
        });

        // Test 1: Successful retry after failures
        console.log('Test 1: Eventual success\n');
        let callCount = 0;
        try {
            const result = await retryManager.execute(async () => {
                callCount++;
                if (callCount < 3) {
                    throw new Error('ETIMEDOUT: Connection timeout');
                }
                return { success: true, data: 'Success!' };
            }, { platform: 'test-platform-1' });
            console.log('Result:', result);
        } catch (error) {
            console.log('Error:', error.message);
        }

        // Test 2: Circuit breaker activation
        console.log('\n\nTest 2: Circuit breaker\n');
        for (let i = 0; i < 8; i++) {
            try {
                await retryManager.execute(async () => {
                    throw new Error('ECONNREFUSED: Service unavailable');
                }, { platform: 'test-platform-2' });
            } catch (error) {
                console.log(`Attempt ${i + 1}: ${error.message}`);
            }
        }

        // Test 3: Request deduplication
        console.log('\n\nTest 3: Request deduplication\n');
        const sameAction = async () => {
            await retryManager.sleep(1000);
            return { data: 'Same request' };
        };

        const promises = [
            retryManager.execute(sameAction, { platform: 'test-platform-3', request: 'same' }),
            retryManager.execute(sameAction, { platform: 'test-platform-3', request: 'same' }),
            retryManager.execute(sameAction, { platform: 'test-platform-3', request: 'same' })
        ];

        await Promise.all(promises);

        // Show metrics
        console.log('\n\nMetrics:');
        console.log(JSON.stringify(retryManager.getMetrics(), null, 2));
    }

    demo().catch(console.error);
}
