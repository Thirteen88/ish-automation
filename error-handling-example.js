#!/usr/bin/env node

/**
 * Integrated Error Handling System Example
 *
 * Demonstrates how to use all error handling components together:
 * - ErrorHandler for classification and recovery
 * - RetryManager for smart retries
 * - HealthMonitor for platform health
 * - ErrorLogger for structured logging
 */

const { ErrorHandler, NetworkError, RateLimitError } = require('./error-handler');
const { RetryManager } = require('./retry-manager');
const { HealthMonitor, HealthStatus } = require('./health-monitor');
const { createLogger, LogLevel } = require('./error-logging');

/**
 * Resilient AI Orchestrator with Comprehensive Error Handling
 */
class ResilientOrchestrator {
    constructor(options = {}) {
        // Initialize logger first
        this.logger = createLogger({
            logDir: options.logDir || './logs',
            logLevel: options.logLevel || LogLevel.INFO,
            enableAggregation: true,
            enablePerformanceTracking: true
        });

        // Initialize error handler
        this.errorHandler = new ErrorHandler({
            enableCircuitBreaker: true,
            enableDeadLetterQueue: true,
            circuitBreakerOptions: {
                threshold: 5,
                timeout: 60000
            }
        });

        // Initialize retry manager
        this.retryManager = new RetryManager({
            enableBudget: true,
            budgetOptions: {
                maxRetriesPerMinute: 50,
                maxRetriesPerHour: 500
            }
        });

        // Initialize health monitor
        this.healthMonitor = new HealthMonitor({
            checkInterval: 30000,
            enableScheduledChecks: true
        });

        // Setup event listeners
        this.setupEventListeners();

        // Platform clients (mock for demo)
        this.platformClients = new Map();

        this.logger.info('Resilient Orchestrator initialized', {
            component: 'orchestrator',
            features: ['error_handling', 'retry_management', 'health_monitoring', 'logging']
        });
    }

    /**
     * Setup event listeners for all components
     */
    setupEventListeners() {
        // Error handler events
        this.errorHandler.on('error', ({ error, context }) => {
            this.logger.error('Error occurred', error, context);
        });

        // Retry manager events
        this.retryManager.on('retry', ({ platform, attempt, delay, error }) => {
            this.logger.warn('Retrying request', {
                platform,
                attempt,
                delay,
                error: error?.message
            });
        });

        this.retryManager.on('retry_success', ({ platform, attempts }) => {
            this.logger.info('Retry successful', { platform, attempts });
        });

        this.retryManager.on('retry_failed', ({ platform, attempts, error }) => {
            this.logger.error('Retry failed', error, { platform, attempts });
        });

        // Health monitor events
        this.healthMonitor.on('status_change', ({ platform, previous, current }) => {
            this.logger.warn('Platform status changed', {
                platform,
                previousStatus: previous,
                currentStatus: current
            });
        });

        this.healthMonitor.on('alert', (alert) => {
            this.logger.warn(`Health alert: ${alert.message}`, {
                platform: alert.platform,
                severity: alert.severity
            });
        });
    }

    /**
     * Register a platform
     */
    registerPlatform(platformName, client) {
        this.platformClients.set(platformName, client);

        // Register with health monitor
        this.healthMonitor.registerPlatform(platformName, {
            unhealthyThreshold: 3,
            degradedThreshold: 2,
            checkInterval: 60000
        });

        this.logger.info('Platform registered', { platform: platformName });
    }

    /**
     * Execute request with full error handling and resilience
     */
    async executeRequest(platform, request) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.logger.info('Executing request', {
            requestId,
            platform,
            request: { ...request, prompt: request.prompt?.substring(0, 50) + '...' }
        });

        // Track performance
        return await this.logger.trackPerformance(
            `request_${platform}`,
            async () => {
                return await this.retryManager.executeWithRetry(
                    async (attemptNumber) => {
                        // Execute with circuit breaker protection
                        return await this.errorHandler.executeWithProtection(
                            async () => {
                                // Check platform health
                                const health = this.healthMonitor.getPlatformHealth(platform);

                                if (health.status === HealthStatus.DISABLED) {
                                    throw new Error(`Platform ${platform} is disabled due to health issues`);
                                }

                                if (health.status === HealthStatus.UNHEALTHY) {
                                    this.logger.warn('Using unhealthy platform', {
                                        platform,
                                        health: health.status
                                    });
                                }

                                // Execute actual request
                                const client = this.platformClients.get(platform);
                                if (!client) {
                                    throw new Error(`No client configured for platform: ${platform}`);
                                }

                                const result = await client.execute(request);

                                this.logger.info('Request successful', {
                                    requestId,
                                    platform,
                                    attempt: attemptNumber
                                });

                                return result;
                            },
                            { platform, requestId }
                        );
                    },
                    { platform, requestId, request }
                );
            },
            { requestId, platform }
        );
    }

    /**
     * Execute request with automatic fallback
     */
    async executeWithFallback(platforms, request) {
        const errors = [];

        for (const platform of platforms) {
            try {
                // Check if platform is healthy
                const health = this.healthMonitor.getPlatformHealth(platform);

                if (health.status === HealthStatus.DISABLED || health.status === HealthStatus.UNHEALTHY) {
                    this.logger.warn('Skipping unhealthy platform', {
                        platform,
                        status: health.status
                    });
                    continue;
                }

                // Try to execute
                const result = await this.executeRequest(platform, request);

                this.logger.info('Request succeeded with platform', { platform });
                return {
                    success: true,
                    platform,
                    result
                };

            } catch (error) {
                errors.push({ platform, error });

                this.logger.warn('Platform failed, trying next', {
                    platform,
                    error: error.message,
                    remainingPlatforms: platforms.length - errors.length
                });
            }
        }

        // All platforms failed
        this.logger.error('All platforms failed', null, {
            platforms,
            errors: errors.map(e => ({ platform: e.platform, error: e.error.message }))
        });

        throw new Error(`All platforms failed. Errors: ${errors.map(e => e.error.message).join(', ')}`);
    }

    /**
     * Check health of all platforms
     */
    async checkAllPlatformHealth() {
        const checkFunctions = {};

        for (const [platformName, client] of this.platformClients) {
            checkFunctions[platformName] = async () => {
                return await client.healthCheck();
            };
        }

        return await this.healthMonitor.checkAllPlatforms(checkFunctions);
    }

    /**
     * Get comprehensive system status
     */
    getSystemStatus() {
        return {
            timestamp: new Date().toISOString(),

            health: this.healthMonitor.getHealthSummary(),

            retryBudget: this.retryManager.getBudgetStatus(),

            retryStats: this.retryManager.getStatistics(),

            failedQueue: this.retryManager.getFailedQueueStats(),

            errorMetrics: this.errorHandler.getMetrics(),

            deadLetterQueue: {
                // Async call needed, return placeholder
                available: true
            },

            logging: this.logger.getStats()
        };
    }

    /**
     * Get error report
     */
    getErrorReport() {
        return {
            timestamp: new Date().toISOString(),
            aggregatedErrors: this.logger.getErrorReport(),
            circuitBreakers: this.errorHandler.getMetrics().circuitBreakers,
            alerts: this.healthMonitor.getAlerts()
        };
    }

    /**
     * Export comprehensive report
     */
    async exportReport(filepath) {
        const report = {
            systemStatus: this.getSystemStatus(),
            errorReport: this.getErrorReport(),
            performanceReport: this.logger.getPerformanceReport()
        };

        await this.logger.exportReport(filepath);
        this.logger.info('Comprehensive report exported', { filepath });
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        this.logger.info('Shutting down orchestrator');

        // Stop scheduled health checks
        this.healthMonitor.stopScheduledChecks();

        // Export final report
        await this.exportReport('./logs/shutdown-report.json');

        // Close logger
        this.logger.close();
    }
}

/**
 * Mock Platform Client for Demo
 */
class MockPlatformClient {
    constructor(platformName, options = {}) {
        this.platformName = platformName;
        this.failureRate = options.failureRate || 0.2;
        this.latency = options.latency || 1000;
        this.callCount = 0;
    }

    async execute(request) {
        this.callCount++;

        // Simulate latency
        await new Promise(resolve => setTimeout(resolve, this.latency));

        // Simulate random failures
        if (Math.random() < this.failureRate) {
            if (Math.random() < 0.5) {
                const error = new NetworkError('Connection timeout', {
                    platform: this.platformName
                });
                throw error;
            } else {
                const error = new RateLimitError('Rate limit exceeded', {
                    platform: this.platformName,
                    retryAfter: 5000
                });
                throw error;
            }
        }

        return {
            success: true,
            platform: this.platformName,
            data: `Response from ${this.platformName} for: ${request.prompt}`,
            callNumber: this.callCount
        };
    }

    async healthCheck() {
        await new Promise(resolve => setTimeout(resolve, 100));

        if (Math.random() < this.failureRate / 2) {
            throw new Error('Health check failed');
        }

        return { healthy: true };
    }
}

// Demo
async function demo() {
    console.log('=== Integrated Error Handling System Demo ===\n');

    const orchestrator = new ResilientOrchestrator({
        logLevel: LogLevel.INFO
    });

    // Register mock platforms
    console.log('Registering platforms...\n');

    orchestrator.registerPlatform('openai', new MockPlatformClient('openai', {
        failureRate: 0.3,
        latency: 500
    }));

    orchestrator.registerPlatform('anthropic', new MockPlatformClient('anthropic', {
        failureRate: 0.2,
        latency: 700
    }));

    orchestrator.registerPlatform('google', new MockPlatformClient('google', {
        failureRate: 0.4,
        latency: 600
    }));

    // Test 1: Single request with retries
    console.log('\n--- Test 1: Single Request with Automatic Retries ---\n');

    try {
        const result = await orchestrator.executeRequest('openai', {
            prompt: 'What is the meaning of life?'
        });
        console.log('✓ Request successful:', result);
    } catch (error) {
        console.log('✗ Request failed:', error.message);
    }

    // Test 2: Request with fallback
    console.log('\n--- Test 2: Request with Automatic Fallback ---\n');

    try {
        const result = await orchestrator.executeWithFallback(
            ['google', 'anthropic', 'openai'],
            { prompt: 'Explain quantum computing' }
        );
        console.log('✓ Request successful with fallback:', result.platform);
    } catch (error) {
        console.log('✗ All platforms failed:', error.message);
    }

    // Test 3: Multiple requests to trigger circuit breaker
    console.log('\n--- Test 3: Testing Circuit Breaker ---\n');

    for (let i = 0; i < 8; i++) {
        try {
            await orchestrator.executeRequest('google', {
                prompt: `Request ${i + 1}`
            });
            console.log(`✓ Request ${i + 1} succeeded`);
        } catch (error) {
            console.log(`✗ Request ${i + 1} failed: ${error.message}`);
        }
    }

    // Test 4: Health checks
    console.log('\n--- Test 4: Platform Health Checks ---\n');

    const healthResults = await orchestrator.checkAllPlatformHealth();
    healthResults.forEach(result => {
        console.log(`${result.platform}: ${result.status} (${result.success ? 'healthy' : 'unhealthy'})`);
    });

    // Get system status
    console.log('\n--- System Status ---\n');
    const status = orchestrator.getSystemStatus();
    console.log(JSON.stringify(status, null, 2));

    // Get error report
    console.log('\n--- Error Report ---\n');
    const errorReport = orchestrator.getErrorReport();
    console.log(JSON.stringify(errorReport, null, 2));

    // Shutdown
    await orchestrator.shutdown();
    console.log('\n✓ Orchestrator shutdown complete');
}

// Run demo if executed directly
if (require.main === module) {
    demo().catch(console.error);
}

// Export
module.exports = { ResilientOrchestrator, MockPlatformClient };
