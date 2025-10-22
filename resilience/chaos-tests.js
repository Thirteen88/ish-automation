#!/usr/bin/env node

/**
 * Chaos Engineering Test Suite for Resilience System
 *
 * Tests:
 * - Network failures and timeouts
 * - Platform outages
 * - Rate limiting
 * - Partial failures
 * - Recovery mechanisms
 * - Load testing
 * - Cascade failures
 */

const { RetryManager } = require('./retry-manager');
const { PlatformFallback } = require('./platform-fallback');
const { QueueManager, Priority } = require('./queue-manager');
const { ErrorClassifier, ErrorCategory } = require('./error-classifier');
const { GracefulDegradation } = require('./graceful-degradation');
const { SelfHealing } = require('./self-heal');

/**
 * Chaos Scenarios
 */
class ChaosScenarios {
    /**
     * Network failure simulator
     */
    static async networkFailure(probabilityPercent = 50) {
        if (Math.random() * 100 < probabilityPercent) {
            throw new Error('ECONNREFUSED: Network connection failed');
        }
    }

    /**
     * Timeout simulator
     */
    static async timeout(minMs = 1000, maxMs = 5000) {
        const delay = minMs + Math.random() * (maxMs - minMs);
        await new Promise(resolve => setTimeout(resolve, delay));

        if (Math.random() < 0.3) {
            throw new Error('ETIMEDOUT: Request timed out');
        }
    }

    /**
     * Rate limit simulator
     */
    static rateLimit() {
        let requestCount = 0;
        const limit = 10;
        const resetInterval = 60000; // 1 minute

        setInterval(() => { requestCount = 0; }, resetInterval);

        return async () => {
            requestCount++;
            if (requestCount > limit) {
                const error = new Error('Rate limit exceeded');
                error.statusCode = 429;
                throw error;
            }
        };
    }

    /**
     * Intermittent failure simulator
     */
    static intermittentFailure(failureRate = 0.3) {
        let callCount = 0;

        return async () => {
            callCount++;

            // Fail randomly based on failure rate
            if (Math.random() < failureRate) {
                const errors = [
                    'ETIMEDOUT: Connection timeout',
                    'Element not found in browser',
                    'Internal server error',
                    'Service temporarily unavailable'
                ];
                throw new Error(errors[Math.floor(Math.random() * errors.length)]);
            }

            return {
                success: true,
                data: `Response ${callCount}`,
                timestamp: Date.now()
            };
        };
    }

    /**
     * Platform outage simulator
     */
    static platformOutage(platforms, outageDuration = 30000) {
        const outages = new Map();

        return {
            triggerOutage: (platform) => {
                outages.set(platform, Date.now() + outageDuration);
            },

            isDown: (platform) => {
                const outageUntil = outages.get(platform);
                if (!outageUntil) return false;

                if (Date.now() < outageUntil) {
                    return true;
                }

                outages.delete(platform);
                return false;
            }
        };
    }

    /**
     * Cascade failure simulator
     */
    static cascadeFailure() {
        let failureLevel = 0;

        return async (platform) => {
            // Increase failure probability with each failure
            if (Math.random() < failureLevel) {
                failureLevel = Math.min(0.9, failureLevel + 0.2);
                throw new Error(`Cascade failure in ${platform}`);
            }

            // Success reduces failure probability
            failureLevel = Math.max(0, failureLevel - 0.1);
            return { success: true, platform };
        };
    }
}

/**
 * Test Runner
 */
class ChaosTestRunner {
    constructor() {
        this.results = {
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                duration: 0
            }
        };
    }

    async run(testName, testFn) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Running: ${testName}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        let result = {
            name: testName,
            success: false,
            error: null,
            duration: 0,
            metrics: {}
        };

        try {
            const metrics = await testFn();
            result.success = true;
            result.metrics = metrics;
            this.results.summary.passed++;
            console.log(`\n✓ PASSED: ${testName}`);
        } catch (error) {
            result.success = false;
            result.error = error.message;
            this.results.summary.failed++;
            console.log(`\n✗ FAILED: ${testName}`);
            console.log(`  Error: ${error.message}`);
        }

        result.duration = Date.now() - startTime;
        this.results.tests.push(result);
        this.results.summary.total++;
        this.results.summary.duration += result.duration;

        console.log(`  Duration: ${result.duration}ms`);
    }

    getResults() {
        return this.results;
    }

    printSummary() {
        console.log('\n\n' + '='.repeat(60));
        console.log('TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${this.results.summary.total}`);
        console.log(`Passed: ${this.results.summary.passed}`);
        console.log(`Failed: ${this.results.summary.failed}`);
        console.log(`Total Duration: ${this.results.summary.duration}ms`);
        console.log(`Success Rate: ${(this.results.summary.passed / this.results.summary.total * 100).toFixed(2)}%`);
        console.log('='.repeat(60));
    }
}

/**
 * Chaos Tests
 */
async function testRetryManager() {
    const retryManager = new RetryManager({
        retryConfig: { maxRetries: 3, baseDelay: 100 },
        circuitBreakerEnabled: true
    });

    let attempts = 0;
    const action = async () => {
        attempts++;
        if (attempts < 3) {
            throw new Error('ETIMEDOUT: Simulated timeout');
        }
        return { success: true, attempts };
    };

    const result = await retryManager.execute(action, { platform: 'test' });

    if (result.success && attempts === 3) {
        return retryManager.getMetrics();
    }

    throw new Error('Retry manager did not retry correctly');
}

async function testCircuitBreaker() {
    const retryManager = new RetryManager({
        circuitBreakerEnabled: true
    });

    // Trigger circuit breaker with repeated failures
    for (let i = 0; i < 6; i++) {
        try {
            await retryManager.execute(async () => {
                throw new Error('Service unavailable');
            }, { platform: 'test-cb' });
        } catch (error) {
            // Expected
        }
    }

    const metrics = retryManager.getMetrics();
    const cbStatus = metrics.circuitBreakers.find(cb => cb.platform === 'test-cb');

    if (cbStatus && cbStatus.status.state === 'open') {
        return metrics;
    }

    throw new Error('Circuit breaker did not open');
}

async function testPlatformFallback() {
    const fallback = new PlatformFallback({
        platforms: [
            { name: 'platform1', priority: 1 },
            { name: 'platform2', priority: 2 },
            { name: 'platform3', priority: 3 }
        ]
    });

    let callCount = 0;
    const action = async (platform) => {
        callCount++;
        // First two platforms fail
        if (platform === 'platform1' || platform === 'platform2') {
            throw new Error(`${platform} unavailable`);
        }
        return { platform, success: true };
    };

    const result = await fallback.execute(action);

    if (result.platform === 'platform3' && result.fallbackUsed) {
        return fallback.getMetrics();
    }

    throw new Error('Platform fallback did not work correctly');
}

async function testQueueManager() {
    const queueManager = new QueueManager({
        concurrency: 2,
        processingInterval: 100,
        storageOptions: { queueDir: './test-queue' }
    });

    let processedCount = 0;

    queueManager.on('process', async (item, callback) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        processedCount++;
        callback(null, { processed: true });
    });

    // Enqueue items
    await queueManager.enqueue({ task: 'task1' }, { priority: Priority.HIGH });
    await queueManager.enqueue({ task: 'task2' }, { priority: Priority.NORMAL });
    await queueManager.enqueue({ task: 'task3' }, { priority: Priority.LOW });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    await queueManager.stop();

    const stats = queueManager.getStats();

    if (processedCount === 3) {
        return stats;
    }

    throw new Error('Queue manager did not process all items');
}

async function testErrorClassifier() {
    const classifier = new ErrorClassifier();

    const testErrors = [
        { error: new Error('ECONNREFUSED'), expected: ErrorCategory.NETWORK },
        { error: new Error('ETIMEDOUT'), expected: ErrorCategory.TIMEOUT },
        { error: { message: 'Unauthorized', statusCode: 401 }, expected: ErrorCategory.AUTH },
        { error: { message: 'Rate limit', statusCode: 429 }, expected: ErrorCategory.RATE_LIMIT }
    ];

    let correct = 0;

    for (const test of testErrors) {
        const classification = classifier.classify(test.error);
        if (classification.category === test.expected) {
            correct++;
        }
    }

    if (correct === testErrors.length) {
        return classifier.getStats();
    }

    throw new Error(`Error classification failed: ${correct}/${testErrors.length} correct`);
}

async function testGracefulDegradation() {
    const degradation = new GracefulDegradation({
        cacheOptions: { persistEnabled: false }
    });

    // First call succeeds and caches
    await degradation.execute(async () => ({
        content: 'Test response',
        timestamp: Date.now()
    }), { prompt: 'test query' });

    // Second call fails but should serve from cache
    const result = await degradation.execute(async () => {
        throw new Error('Service unavailable');
    }, { prompt: 'test query', fallback: true, allowStale: true });

    if (result.source === 'cache' || result.source === 'cache_stale') {
        return degradation.getMetrics();
    }

    throw new Error('Graceful degradation did not serve from cache');
}

async function testSelfHealing() {
    const mockBrowserManager = {
        restart: async () => {},
        clearCache: async () => {},
        clearCookies: async () => {}
    };

    const selfHealing = new SelfHealing({
        enabled: true,
        autoRecovery: true,
        browserManager: mockBrowserManager
    });

    const platform = 'test-platform';

    // Trigger failures to initiate recovery
    for (let i = 0; i < 6; i++) {
        await selfHealing.handleFailure(platform, new Error('Browser crash'));
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Simulate recovery
    for (let i = 0; i < 3; i++) {
        selfHealing.handleSuccess(platform);
    }

    const metrics = selfHealing.getMetrics();

    if (metrics.totalRecoveries > 0) {
        return metrics;
    }

    throw new Error('Self-healing did not trigger recovery');
}

async function testLoadHandling() {
    const retryManager = new RetryManager({
        retryConfig: { maxRetries: 2, baseDelay: 50 }
    });

    const requests = 50;
    const results = [];

    const action = ChaosScenarios.intermittentFailure(0.2);

    const promises = [];
    for (let i = 0; i < requests; i++) {
        promises.push(
            retryManager.execute(action, { platform: 'load-test' })
                .then(result => results.push({ success: true, result }))
                .catch(error => results.push({ success: false, error: error.message }))
        );
    }

    await Promise.all(promises);

    const successful = results.filter(r => r.success).length;
    const successRate = successful / requests;

    if (successRate > 0.7) {
        return {
            requests,
            successful,
            failed: requests - successful,
            successRate,
            metrics: retryManager.getMetrics()
        };
    }

    throw new Error(`Load handling failed: success rate ${(successRate * 100).toFixed(2)}%`);
}

async function testCascadeRecovery() {
    const fallback = new PlatformFallback({
        platforms: [
            { name: 'p1', priority: 1 },
            { name: 'p2', priority: 2 },
            { name: 'p3', priority: 3 }
        ]
    });

    const cascadeAction = ChaosScenarios.cascadeFailure();

    let recovered = false;

    for (let i = 0; i < 10; i++) {
        try {
            await fallback.execute(cascadeAction);
            recovered = true;
        } catch (error) {
            // Continue trying
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (recovered) {
        return fallback.getMetrics();
    }

    throw new Error('Failed to recover from cascade failure');
}

/**
 * Main test execution
 */
async function runChaosTests() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     CHAOS ENGINEERING TEST SUITE - RESILIENCE SYSTEM      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const runner = new ChaosTestRunner();

    await runner.run('Retry Manager with Exponential Backoff', testRetryManager);
    await runner.run('Circuit Breaker Activation', testCircuitBreaker);
    await runner.run('Platform Fallback Chain', testPlatformFallback);
    await runner.run('Queue Manager with Priority', testQueueManager);
    await runner.run('Error Classification Accuracy', testErrorClassifier);
    await runner.run('Graceful Degradation with Cache', testGracefulDegradation);
    await runner.run('Self-Healing Recovery', testSelfHealing);
    await runner.run('Load Handling (50 concurrent requests)', testLoadHandling);
    await runner.run('Cascade Failure Recovery', testCascadeRecovery);

    runner.printSummary();

    return runner.getResults();
}

// Run tests
if (require.main === module) {
    runChaosTests()
        .then(results => {
            console.log('\n\nDetailed Results:');
            console.log(JSON.stringify(results, null, 2));

            // Exit with appropriate code
            process.exit(results.summary.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('\n\nTest suite failed:', error);
            process.exit(1);
        });
}

module.exports = {
    runChaosTests,
    ChaosScenarios,
    ChaosTestRunner
};
