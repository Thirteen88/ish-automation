#!/usr/bin/env node

/**
 * Retry Manager for Production AI Orchestrator
 *
 * Features:
 * - Exponential backoff with jitter
 * - Platform-specific retry strategies
 * - Retry budget management
 * - Failed request queue
 * - Retry statistics tracking
 * - Smart retry decisions based on error type
 */

const EventEmitter = require('events');
const { ErrorTypes } = require('./error-handler');

/**
 * Retry Strategy Types
 */
const RetryStrategy = {
    EXPONENTIAL_BACKOFF: 'exponential_backoff',
    LINEAR_BACKOFF: 'linear_backoff',
    FIXED_DELAY: 'fixed_delay',
    FIBONACCI: 'fibonacci',
    IMMEDIATE: 'immediate',
    NO_RETRY: 'no_retry'
};

/**
 * Jitter Types
 */
const JitterType = {
    NONE: 'none',
    FULL: 'full',           // Random between 0 and calculated delay
    EQUAL: 'equal',         // Base delay + random up to base delay
    DECORRELATED: 'decorrelated' // Exponentially growing random
};

/**
 * Platform-Specific Retry Configuration
 */
class PlatformRetryConfig {
    constructor(platformName, options = {}) {
        this.platformName = platformName;
        this.maxRetries = options.maxRetries || 3;
        this.initialDelay = options.initialDelay || 1000;
        this.maxDelay = options.maxDelay || 60000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.strategy = options.strategy || RetryStrategy.EXPONENTIAL_BACKOFF;
        this.jitterType = options.jitterType || JitterType.FULL;
        this.retryableErrors = options.retryableErrors || [
            ErrorTypes.NETWORK,
            ErrorTypes.TIMEOUT,
            ErrorTypes.RATE_LIMIT,
            ErrorTypes.BROWSER
        ];
        this.timeoutIncreaseFactor = options.timeoutIncreaseFactor || 1.5;
    }

    /**
     * Check if error type is retryable for this platform
     */
    isRetryable(errorType) {
        return this.retryableErrors.includes(errorType);
    }

    /**
     * Get retry delay for attempt number
     */
    getDelay(attemptNumber, previousDelay = null) {
        let delay;

        switch (this.strategy) {
            case RetryStrategy.EXPONENTIAL_BACKOFF:
                delay = this.initialDelay * Math.pow(this.backoffMultiplier, attemptNumber);
                break;

            case RetryStrategy.LINEAR_BACKOFF:
                delay = this.initialDelay * (attemptNumber + 1);
                break;

            case RetryStrategy.FIXED_DELAY:
                delay = this.initialDelay;
                break;

            case RetryStrategy.FIBONACCI:
                delay = this.fibonacciDelay(attemptNumber);
                break;

            case RetryStrategy.IMMEDIATE:
                delay = 0;
                break;

            default:
                delay = this.initialDelay;
        }

        // Cap at max delay
        delay = Math.min(delay, this.maxDelay);

        // Apply jitter
        delay = this.applyJitter(delay, previousDelay);

        return delay;
    }

    /**
     * Calculate Fibonacci delay
     */
    fibonacciDelay(n) {
        if (n <= 1) return this.initialDelay;

        let a = this.initialDelay;
        let b = this.initialDelay;

        for (let i = 2; i <= n; i++) {
            const temp = a + b;
            a = b;
            b = temp;
        }

        return b;
    }

    /**
     * Apply jitter to delay
     */
    applyJitter(delay, previousDelay = null) {
        switch (this.jitterType) {
            case JitterType.NONE:
                return delay;

            case JitterType.FULL:
                return Math.random() * delay;

            case JitterType.EQUAL:
                return delay / 2 + Math.random() * (delay / 2);

            case JitterType.DECORRELATED:
                if (previousDelay === null) {
                    return Math.random() * delay;
                }
                return Math.min(
                    this.maxDelay,
                    Math.random() * (previousDelay * 3)
                );

            default:
                return delay;
        }
    }
}

/**
 * Retry Budget - Prevents excessive retries across all platforms
 */
class RetryBudget {
    constructor(options = {}) {
        this.maxRetriesPerMinute = options.maxRetriesPerMinute || 100;
        this.maxRetriesPerHour = options.maxRetriesPerHour || 1000;
        this.windowSize = options.windowSize || 60000; // 1 minute

        this.retryHistory = {
            minute: [],
            hour: []
        };
    }

    /**
     * Check if retry is allowed
     */
    canRetry() {
        const now = Date.now();

        // Clean old entries
        this.retryHistory.minute = this.retryHistory.minute.filter(
            time => now - time < 60000
        );
        this.retryHistory.hour = this.retryHistory.hour.filter(
            time => now - time < 3600000
        );

        // Check limits
        const minuteLimit = this.retryHistory.minute.length < this.maxRetriesPerMinute;
        const hourLimit = this.retryHistory.hour.length < this.maxRetriesPerHour;

        return minuteLimit && hourLimit;
    }

    /**
     * Consume retry from budget
     */
    consume() {
        const now = Date.now();
        this.retryHistory.minute.push(now);
        this.retryHistory.hour.push(now);
    }

    /**
     * Get budget status
     */
    getStatus() {
        const now = Date.now();

        // Clean old entries
        this.retryHistory.minute = this.retryHistory.minute.filter(
            time => now - time < 60000
        );
        this.retryHistory.hour = this.retryHistory.hour.filter(
            time => now - time < 3600000
        );

        return {
            retriesInLastMinute: this.retryHistory.minute.length,
            retriesInLastHour: this.retryHistory.hour.length,
            minuteCapacity: this.maxRetriesPerMinute - this.retryHistory.minute.length,
            hourCapacity: this.maxRetriesPerHour - this.retryHistory.hour.length
        };
    }

    /**
     * Reset budget
     */
    reset() {
        this.retryHistory = {
            minute: [],
            hour: []
        };
    }
}

/**
 * Failed Request Queue with Retry Scheduling
 */
class FailedRequestQueue {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 500;
        this.queue = [];
        this.processing = false;
    }

    /**
     * Add failed request to queue
     */
    add(request, error, retryConfig) {
        const entry = {
            id: `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            request: request,
            error: error,
            retryConfig: retryConfig,
            attempts: 0,
            lastAttempt: null,
            nextRetry: null,
            addedAt: new Date().toISOString()
        };

        this.queue.push(entry);

        // Trim queue if exceeds max size
        if (this.queue.length > this.maxSize) {
            this.queue.shift();
        }

        return entry.id;
    }

    /**
     * Get requests ready for retry
     */
    getReadyForRetry() {
        const now = Date.now();
        return this.queue.filter(entry => {
            return entry.nextRetry === null || entry.nextRetry <= now;
        });
    }

    /**
     * Update retry attempt
     */
    updateAttempt(id, success, nextDelay = null) {
        const entry = this.queue.find(e => e.id === id);
        if (!entry) return;

        entry.attempts++;
        entry.lastAttempt = Date.now();

        if (success) {
            // Remove from queue
            this.queue = this.queue.filter(e => e.id !== id);
        } else if (nextDelay !== null) {
            // Schedule next retry
            entry.nextRetry = Date.now() + nextDelay;
        }
    }

    /**
     * Remove entry from queue
     */
    remove(id) {
        this.queue = this.queue.filter(e => e.id !== id);
    }

    /**
     * Get queue statistics
     */
    getStats() {
        const byErrorType = {};
        const byPlatform = {};

        this.queue.forEach(entry => {
            const errorType = entry.error.type;
            const platform = entry.request.platform;

            byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;
            if (platform) {
                byPlatform[platform] = (byPlatform[platform] || 0) + 1;
            }
        });

        return {
            total: this.queue.length,
            readyForRetry: this.getReadyForRetry().length,
            byErrorType,
            byPlatform,
            avgAttempts: this.queue.reduce((sum, e) => sum + e.attempts, 0) / this.queue.length || 0
        };
    }

    /**
     * Clear queue
     */
    clear() {
        this.queue = [];
    }
}

/**
 * Retry Statistics Tracker
 */
class RetryStatistics {
    constructor() {
        this.stats = {
            total: 0,
            successful: 0,
            failed: 0,
            byPlatform: {},
            byErrorType: {},
            delayTotals: [],
            attemptCounts: []
        };
    }

    /**
     * Record retry attempt
     */
    recordAttempt(platform, errorType, attemptNumber, delay, success) {
        this.stats.total++;

        if (success) {
            this.stats.successful++;
        } else {
            this.stats.failed++;
        }

        // By platform
        if (!this.stats.byPlatform[platform]) {
            this.stats.byPlatform[platform] = { total: 0, successful: 0, failed: 0 };
        }
        this.stats.byPlatform[platform].total++;
        if (success) {
            this.stats.byPlatform[platform].successful++;
        } else {
            this.stats.byPlatform[platform].failed++;
        }

        // By error type
        if (!this.stats.byErrorType[errorType]) {
            this.stats.byErrorType[errorType] = { total: 0, successful: 0, failed: 0 };
        }
        this.stats.byErrorType[errorType].total++;
        if (success) {
            this.stats.byErrorType[errorType].successful++;
        } else {
            this.stats.byErrorType[errorType].failed++;
        }

        // Track delays and attempts
        this.stats.delayTotals.push(delay);
        this.stats.attemptCounts.push(attemptNumber);
    }

    /**
     * Get statistics summary
     */
    getSummary() {
        const avgDelay = this.stats.delayTotals.length > 0
            ? this.stats.delayTotals.reduce((a, b) => a + b, 0) / this.stats.delayTotals.length
            : 0;

        const avgAttempts = this.stats.attemptCounts.length > 0
            ? this.stats.attemptCounts.reduce((a, b) => a + b, 0) / this.stats.attemptCounts.length
            : 0;

        return {
            total: this.stats.total,
            successful: this.stats.successful,
            failed: this.stats.failed,
            successRate: this.stats.total > 0 ? this.stats.successful / this.stats.total : 0,
            avgDelay: Math.round(avgDelay),
            avgAttempts: avgAttempts.toFixed(2),
            byPlatform: this.stats.byPlatform,
            byErrorType: this.stats.byErrorType
        };
    }

    /**
     * Reset statistics
     */
    reset() {
        this.stats = {
            total: 0,
            successful: 0,
            failed: 0,
            byPlatform: {},
            byErrorType: {},
            delayTotals: [],
            attemptCounts: []
        };
    }
}

/**
 * Main Retry Manager
 */
class RetryManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            enableBudget: options.enableBudget !== false,
            budgetOptions: options.budgetOptions || {},
            defaultRetryConfig: options.defaultRetryConfig || {},
            ...options
        };

        // Platform-specific configurations
        this.platformConfigs = new Map();

        // Retry budget
        this.budget = new RetryBudget(this.options.budgetOptions);

        // Failed request queue
        this.failedQueue = new FailedRequestQueue();

        // Statistics
        this.statistics = new RetryStatistics();

        // Default platform configs
        this.initializeDefaultConfigs();
    }

    /**
     * Initialize default retry configurations for common platforms
     */
    initializeDefaultConfigs() {
        const defaultConfigs = {
            openai: new PlatformRetryConfig('openai', {
                maxRetries: 3,
                initialDelay: 1000,
                maxDelay: 30000,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                jitterType: JitterType.FULL
            }),
            anthropic: new PlatformRetryConfig('anthropic', {
                maxRetries: 3,
                initialDelay: 1000,
                maxDelay: 30000,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                jitterType: JitterType.FULL
            }),
            google: new PlatformRetryConfig('google', {
                maxRetries: 3,
                initialDelay: 2000,
                maxDelay: 60000,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                jitterType: JitterType.EQUAL
            }),
            replicate: new PlatformRetryConfig('replicate', {
                maxRetries: 2,
                initialDelay: 5000,
                maxDelay: 120000,
                strategy: RetryStrategy.LINEAR_BACKOFF,
                jitterType: JitterType.NONE
            }),
            together: new PlatformRetryConfig('together', {
                maxRetries: 3,
                initialDelay: 1000,
                maxDelay: 30000,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                jitterType: JitterType.FULL
            }),
            claude: new PlatformRetryConfig('claude', {
                maxRetries: 3,
                initialDelay: 2000,
                maxDelay: 45000,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                jitterType: JitterType.DECORRELATED
            }),
            chatgpt: new PlatformRetryConfig('chatgpt', {
                maxRetries: 3,
                initialDelay: 2000,
                maxDelay: 45000,
                strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
                jitterType: JitterType.DECORRELATED
            }),
            lmarena: new PlatformRetryConfig('lmarena', {
                maxRetries: 2,
                initialDelay: 3000,
                maxDelay: 30000,
                strategy: RetryStrategy.FIXED_DELAY,
                jitterType: JitterType.EQUAL
            })
        };

        for (const [platform, config] of Object.entries(defaultConfigs)) {
            this.platformConfigs.set(platform, config);
        }
    }

    /**
     * Set custom retry configuration for a platform
     */
    setPlatformConfig(platformName, options) {
        const config = new PlatformRetryConfig(platformName, options);
        this.platformConfigs.set(platformName, config);
    }

    /**
     * Get retry configuration for platform
     */
    getPlatformConfig(platformName) {
        if (this.platformConfigs.has(platformName)) {
            return this.platformConfigs.get(platformName);
        }

        // Create default config
        const config = new PlatformRetryConfig(platformName, this.options.defaultRetryConfig);
        this.platformConfigs.set(platformName, config);
        return config;
    }

    /**
     * Execute action with automatic retry
     */
    async executeWithRetry(action, context = {}) {
        const platform = context.platform || 'unknown';
        const config = this.getPlatformConfig(platform);
        let lastError = null;
        let previousDelay = null;

        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                // First attempt is not a retry
                if (attempt > 0) {
                    // Check retry budget
                    if (this.options.enableBudget && !this.budget.canRetry()) {
                        throw new Error('Retry budget exceeded');
                    }

                    // Calculate delay
                    const delay = config.getDelay(attempt - 1, previousDelay);
                    previousDelay = delay;

                    // Emit retry event
                    this.emit('retry', {
                        platform,
                        attempt,
                        delay,
                        error: lastError
                    });

                    // Wait before retry
                    await this.sleep(delay);

                    // Consume budget
                    if (this.options.enableBudget) {
                        this.budget.consume();
                    }

                    // Record retry attempt
                    const errorType = lastError?.type || ErrorTypes.UNKNOWN;
                    this.statistics.recordAttempt(platform, errorType, attempt, delay, false);
                }

                // Execute action
                const result = await action(attempt);

                // Success - record if this was a retry
                if (attempt > 0) {
                    const errorType = lastError?.type || ErrorTypes.UNKNOWN;
                    this.statistics.recordAttempt(platform, errorType, attempt, previousDelay || 0, true);

                    this.emit('retry_success', {
                        platform,
                        attempts: attempt,
                        totalDelay: previousDelay
                    });
                }

                return result;

            } catch (error) {
                lastError = error;

                // Check if error is retryable
                const errorType = error.type || ErrorTypes.UNKNOWN;
                const isRetryable = config.isRetryable(errorType);

                if (!isRetryable || attempt >= config.maxRetries) {
                    // Add to failed queue if retryable but max retries reached
                    if (isRetryable && attempt >= config.maxRetries) {
                        this.failedQueue.add(
                            { action, platform, ...context },
                            error,
                            config
                        );
                    }

                    this.emit('retry_failed', {
                        platform,
                        attempts: attempt,
                        error
                    });

                    throw error;
                }

                // Log retry
                this.logRetry(platform, attempt, config.maxRetries, error);
            }
        }

        throw lastError;
    }

    /**
     * Smart retry decision based on error analysis
     */
    shouldRetry(error, context = {}) {
        const platform = context.platform || 'unknown';
        const config = this.getPlatformConfig(platform);
        const attemptNumber = context.attemptNumber || 0;

        // Check max retries
        if (attemptNumber >= config.maxRetries) {
            return {
                shouldRetry: false,
                reason: 'max_retries_exceeded'
            };
        }

        // Check error type
        const errorType = error.type || ErrorTypes.UNKNOWN;
        if (!config.isRetryable(errorType)) {
            return {
                shouldRetry: false,
                reason: 'error_not_retryable',
                errorType
            };
        }

        // Check retry budget
        if (this.options.enableBudget && !this.budget.canRetry()) {
            return {
                shouldRetry: false,
                reason: 'budget_exceeded'
            };
        }

        // Calculate next delay
        const delay = config.getDelay(attemptNumber, context.previousDelay);

        return {
            shouldRetry: true,
            delay,
            strategy: config.strategy,
            maxRetries: config.maxRetries,
            remainingRetries: config.maxRetries - attemptNumber
        };
    }

    /**
     * Process failed request queue
     */
    async processFailedQueue() {
        const readyForRetry = this.failedQueue.getReadyForRetry();

        if (readyForRetry.length === 0) {
            return { processed: 0, successful: 0, failed: 0 };
        }

        let successful = 0;
        let failed = 0;

        for (const entry of readyForRetry) {
            try {
                // Check if we should still retry
                const decision = this.shouldRetry(entry.error, {
                    platform: entry.request.platform,
                    attemptNumber: entry.attempts
                });

                if (!decision.shouldRetry) {
                    this.failedQueue.remove(entry.id);
                    failed++;
                    continue;
                }

                // Retry the action
                await this.executeWithRetry(entry.request.action, entry.request);

                // Success
                this.failedQueue.updateAttempt(entry.id, true);
                successful++;

            } catch (error) {
                // Failed again
                const config = entry.retryConfig;
                const nextDelay = config.getDelay(entry.attempts);
                this.failedQueue.updateAttempt(entry.id, false, nextDelay);
                failed++;
            }
        }

        return {
            processed: readyForRetry.length,
            successful,
            failed
        };
    }

    /**
     * Get retry statistics
     */
    getStatistics() {
        return this.statistics.getSummary();
    }

    /**
     * Get budget status
     */
    getBudgetStatus() {
        return this.budget.getStatus();
    }

    /**
     * Get failed queue stats
     */
    getFailedQueueStats() {
        return this.failedQueue.getStats();
    }

    /**
     * Reset retry budget
     */
    resetBudget() {
        this.budget.reset();
    }

    /**
     * Clear failed queue
     */
    clearFailedQueue() {
        this.failedQueue.clear();
    }

    /**
     * Log retry attempt
     */
    logRetry(platform, attempt, maxRetries, error) {
        console.log(`[RETRY] Platform: ${platform}, Attempt: ${attempt + 1}/${maxRetries + 1}, Error: ${error.message}`);
    }

    /**
     * Utility: Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export
module.exports = {
    RetryManager,
    RetryStrategy,
    JitterType,
    PlatformRetryConfig,
    RetryBudget,
    FailedRequestQueue,
    RetryStatistics
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Retry Manager Demo ===\n');

        const manager = new RetryManager({
            enableBudget: true,
            budgetOptions: {
                maxRetriesPerMinute: 10,
                maxRetriesPerHour: 100
            }
        });

        // Listen to events
        manager.on('retry', ({ platform, attempt, delay }) => {
            console.log(`[Event] Retrying ${platform}, attempt ${attempt}, delay ${delay}ms`);
        });

        manager.on('retry_success', ({ platform, attempts }) => {
            console.log(`[Event] Retry successful for ${platform} after ${attempts} attempts`);
        });

        manager.on('retry_failed', ({ platform, attempts, error }) => {
            console.log(`[Event] Retry failed for ${platform} after ${attempts} attempts: ${error.message}`);
        });

        // Test 1: Successful retry
        console.log('Test 1: Simulating transient network error with successful retry\n');

        let callCount = 0;
        try {
            const result = await manager.executeWithRetry(async (attempt) => {
                callCount++;
                if (callCount < 3) {
                    const error = new Error('ECONNREFUSED: Connection refused');
                    error.type = ErrorTypes.NETWORK;
                    throw error;
                }
                return { success: true, data: 'Operation completed' };
            }, { platform: 'openai' });

            console.log('Result:', result);
        } catch (error) {
            console.log('Error:', error.message);
        }

        // Test 2: Max retries exceeded
        console.log('\n\nTest 2: Simulating persistent error (max retries exceeded)\n');

        try {
            await manager.executeWithRetry(async (attempt) => {
                const error = new Error('Service unavailable');
                error.type = ErrorTypes.NETWORK;
                throw error;
            }, { platform: 'anthropic' });
        } catch (error) {
            console.log('Error:', error.message);
        }

        // Test 3: Non-retryable error
        console.log('\n\nTest 3: Simulating non-retryable authentication error\n');

        try {
            await manager.executeWithRetry(async (attempt) => {
                const error = new Error('Unauthorized: Invalid API key');
                error.type = ErrorTypes.AUTH;
                throw error;
            }, { platform: 'google' });
        } catch (error) {
            console.log('Error:', error.message);
        }

        // Test 4: Retry budget
        console.log('\n\nTest 4: Testing retry budget\n');

        console.log('Budget status before:', manager.getBudgetStatus());

        for (let i = 0; i < 5; i++) {
            try {
                await manager.executeWithRetry(async () => {
                    const error = new Error('Timeout');
                    error.type = ErrorTypes.TIMEOUT;
                    throw error;
                }, { platform: 'replicate' });
            } catch (error) {
                // Expected
            }
        }

        console.log('Budget status after:', manager.getBudgetStatus());

        // Statistics
        console.log('\n\nRetry Statistics:');
        console.log(JSON.stringify(manager.getStatistics(), null, 2));

        console.log('\n\nFailed Queue Stats:');
        console.log(JSON.stringify(manager.getFailedQueueStats(), null, 2));
    }

    demo().catch(console.error);
}
