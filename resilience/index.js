#!/usr/bin/env node

/**
 * Integrated Resilience System
 *
 * Combines all resilience components into a unified system:
 * - Retry management with circuit breakers
 * - Platform fallback
 * - Queue management
 * - Error classification
 * - Graceful degradation
 * - Self-healing
 */

const EventEmitter = require('events');
const { RetryManager } = require('./retry-manager');
const { PlatformFallback } = require('./platform-fallback');
const { QueueManager, Priority } = require('./queue-manager');
const { ErrorClassifier } = require('./error-classifier');
const { GracefulDegradation } = require('./graceful-degradation');
const { SelfHealing } = require('./self-heal');

/**
 * Integrated Resilience System
 */
class ResilientOrchestrator extends EventEmitter {
    constructor(options = {}) {
        super();

        // Initialize components
        this.retryManager = new RetryManager({
            retryConfig: options.retryConfig,
            circuitBreakerEnabled: true,
            deduplicationEnabled: true
        });

        this.platformFallback = new PlatformFallback({
            platforms: options.platforms || [],
            enableWeightedRouting: true,
            enableAutoRecovery: true
        });

        this.queueManager = new QueueManager({
            concurrency: options.concurrency || 3,
            storageOptions: options.queueStorageOptions,
            autoStart: options.autoStartQueue !== false
        });

        this.errorClassifier = new ErrorClassifier({
            learningEnabled: true
        });

        this.gracefulDegradation = new GracefulDegradation({
            cacheOptions: options.cacheOptions
        });

        this.selfHealing = new SelfHealing({
            enabled: true,
            autoRecovery: true,
            browserManager: options.browserManager,
            selectorDiscovery: options.selectorDiscovery,
            configManager: options.configManager
        });

        // Setup queue processor
        this.queueManager.on('process', async (item, callback) => {
            try {
                const result = await this.executeResilient(item.data.action, item.data.options);
                callback(null, result);
            } catch (error) {
                callback(error);
            }
        });

        // Wire up events
        this.wireEvents();

        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retries: 0,
            fallbacks: 0,
            cacheHits: 0,
            selfHealingActions: 0,
            avgResponseTime: 0,
            responseTimeSum: 0
        };
    }

    /**
     * Wire up event listeners between components
     */
    wireEvents() {
        // Retry manager events
        this.retryManager.on('retry', (data) => {
            this.metrics.retries++;
            this.emit('retry', data);
        });

        this.retryManager.on('failed', async (data) => {
            // Classify error
            const classification = this.errorClassifier.classify(data.error, data.context);

            // Trigger self-healing if needed
            await this.selfHealing.handleFailure(data.platform, data.error, data.context);

            this.emit('request_failed', { ...data, classification });
        });

        // Platform fallback events
        this.platformFallback.on('fallback', (data) => {
            this.metrics.fallbacks++;
            this.emit('fallback', data);
        });

        // Graceful degradation events
        this.gracefulDegradation.cache.on('cache_hit', () => {
            this.metrics.cacheHits++;
        });

        // Self-healing events
        this.selfHealing.on('recovery_action_completed', (data) => {
            this.metrics.selfHealingActions++;
            this.emit('self_healing', data);
        });

        this.selfHealing.on('platform_recovered', (data) => {
            // Reset circuit breaker for recovered platform
            this.retryManager.resetCircuitBreaker(data.platform);
            this.emit('platform_recovered', data);
        });
    }

    /**
     * Execute request with full resilience
     */
    async executeResilient(action, options = {}) {
        this.metrics.totalRequests++;
        const startTime = Date.now();

        try {
            // Execute with graceful degradation (includes caching)
            const result = await this.gracefulDegradation.execute(async () => {
                // Execute with platform fallback
                return await this.platformFallback.execute(async (platform) => {
                    // Execute with retry manager (includes circuit breaker)
                    return await this.retryManager.execute(async () => {
                        // Execute actual action
                        const actionResult = await action(platform);

                        // Record success for self-healing
                        this.selfHealing.handleSuccess(platform);

                        return actionResult;
                    }, { platform, ...options });
                }, options);
            }, {
                ...options,
                prompt: options.prompt
            });

            this.metrics.successfulRequests++;
            const responseTime = Date.now() - startTime;
            this.metrics.responseTimeSum += responseTime;
            this.metrics.avgResponseTime = this.metrics.responseTimeSum / this.metrics.successfulRequests;

            this.emit('request_success', {
                responseTime,
                source: result.source,
                quality: result.quality
            });

            return result;

        } catch (error) {
            this.metrics.failedRequests++;
            const responseTime = Date.now() - startTime;

            this.emit('request_error', {
                error: error.message,
                responseTime
            });

            throw error;
        }
    }

    /**
     * Enqueue request for async processing
     */
    async enqueueRequest(action, options = {}) {
        const priority = options.priority || Priority.NORMAL;

        return await this.queueManager.enqueue({
            action,
            options
        }, {
            priority,
            maxRetries: options.maxRetries,
            timeout: options.timeout
        });
    }

    /**
     * Get comprehensive metrics
     */
    getMetrics() {
        return {
            overall: {
                ...this.metrics,
                successRate: this.metrics.totalRequests > 0
                    ? this.metrics.successfulRequests / this.metrics.totalRequests
                    : 0,
                failureRate: this.metrics.totalRequests > 0
                    ? this.metrics.failedRequests / this.metrics.totalRequests
                    : 0
            },
            retryManager: this.retryManager.getMetrics(),
            platformFallback: this.platformFallback.getMetrics(),
            queueManager: this.queueManager.getStats(),
            errorClassifier: this.errorClassifier.getStats(),
            gracefulDegradation: this.gracefulDegradation.getMetrics(),
            selfHealing: this.selfHealing.getMetrics()
        };
    }

    /**
     * Get health status
     */
    getHealth() {
        const platforms = this.platformFallback.getAllPlatformsStatus();
        const queueStats = this.queueManager.getStats();
        const cacheStats = this.gracefulDegradation.cache.getStats();

        const health = {
            status: 'healthy',
            platforms: platforms,
            queue: {
                size: queueStats.currentSize,
                processing: queueStats.processingCount,
                deadLetterSize: queueStats.deadLetterSize
            },
            cache: {
                size: cacheStats.size,
                hitRate: this.metrics.totalRequests > 0
                    ? this.metrics.cacheHits / this.metrics.totalRequests
                    : 0
            }
        };

        // Determine overall health status
        const unhealthyPlatforms = Object.values(platforms).filter(
            p => p.healthLevel === 'unhealthy' || p.healthLevel === 'down'
        );

        if (unhealthyPlatforms.length === Object.keys(platforms).length) {
            health.status = 'critical';
        } else if (unhealthyPlatforms.length > 0) {
            health.status = 'degraded';
        } else if (queueStats.currentSize > 100) {
            health.status = 'degraded';
        }

        return health;
    }

    /**
     * Stop all components
     */
    async stop() {
        await this.queueManager.stop();
        this.platformFallback.stopHealthMonitoring();
    }

    /**
     * Start queue processing
     */
    start() {
        this.queueManager.start();
    }
}

// Export
module.exports = {
    ResilientOrchestrator
};

// Demo
if (require.main === module) {
    async function demo() {
        console.log('=== Integrated Resilience System Demo ===\n');

        const orchestrator = new ResilientOrchestrator({
            platforms: [
                { name: 'huggingface', priority: 1, weight: 1.0 },
                { name: 'perplexity', priority: 2, weight: 0.8 },
                { name: 'lmarena', priority: 3, weight: 0.6 }
            ],
            concurrency: 2,
            autoStartQueue: false
        });

        // Event listeners
        orchestrator.on('retry', ({ platform, attempt, delay }) => {
            console.log(`[RETRY] ${platform} - Attempt ${attempt} (delay: ${delay}ms)`);
        });

        orchestrator.on('fallback', ({ from, to }) => {
            console.log(`[FALLBACK] ${from} -> ${to}`);
        });

        orchestrator.on('self_healing', ({ platform, action }) => {
            console.log(`[SELF-HEAL] ${platform} - ${action}`);
        });

        orchestrator.on('request_success', ({ responseTime, source, quality }) => {
            console.log(`[SUCCESS] ${responseTime}ms from ${source} (quality: ${quality?.toFixed(2) || 'N/A'})`);
        });

        orchestrator.on('request_error', ({ error }) => {
            console.log(`[ERROR] ${error}`);
        });

        // Simulate platform action
        let callCount = 0;
        const simulateAction = async (platform) => {
            callCount++;
            await new Promise(resolve => setTimeout(resolve, Math.random() * 500));

            // Simulate different platform behaviors
            if (platform === 'lmarena') {
                throw new Error('Platform timeout');
            }

            if (platform === 'perplexity' && callCount % 3 === 0) {
                throw new Error('Temporary failure');
            }

            return {
                platform,
                content: `Response from ${platform}`,
                timestamp: Date.now()
            };
        };

        // Test resilient execution
        console.log('Test 1: Direct resilient execution\n');
        for (let i = 0; i < 5; i++) {
            try {
                const result = await orchestrator.executeResilient(
                    simulateAction,
                    { prompt: `Test query ${i}` }
                );
                console.log(`Result: ${result.result?.platform || result.source}\n`);
            } catch (error) {
                console.log(`Failed: ${error.message}\n`);
            }
        }

        // Test queued execution
        console.log('\n\nTest 2: Queued execution\n');
        orchestrator.start();

        for (let i = 0; i < 3; i++) {
            await orchestrator.enqueueRequest(
                simulateAction,
                { prompt: `Queued query ${i}`, priority: i === 0 ? Priority.HIGH : Priority.NORMAL }
            );
        }

        // Wait for queue processing
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Show metrics
        console.log('\n\nSystem Metrics:');
        const metrics = orchestrator.getMetrics();
        console.log(JSON.stringify(metrics, null, 2));

        console.log('\n\nHealth Status:');
        const health = orchestrator.getHealth();
        console.log(JSON.stringify(health, null, 2));

        // Stop
        await orchestrator.stop();
        console.log('\n\nSystem stopped');
    }

    demo().catch(console.error);
}
