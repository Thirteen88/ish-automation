#!/usr/bin/env node

/**
 * Platform Fallback System
 *
 * Features:
 * - Automatic platform switching on failure
 * - Platform health scoring and monitoring
 * - Weighted routing based on success rates
 * - Platform recovery checks
 * - Priority-based platform selection
 * - Load balancing across healthy platforms
 */

const EventEmitter = require('events');

/**
 * Platform Health Levels
 */
const HealthLevel = {
    HEALTHY: 'healthy',       // > 80% success rate
    DEGRADED: 'degraded',     // 50-80% success rate
    UNHEALTHY: 'unhealthy',   // < 50% success rate
    DOWN: 'down'              // Circuit breaker open
};

/**
 * Platform Status
 */
class PlatformStatus {
    constructor(platform, options = {}) {
        this.platform = platform;
        this.enabled = options.enabled !== false;
        this.priority = options.priority || 1; // Lower = higher priority
        this.weight = options.weight || 1.0; // For weighted routing

        // Health metrics
        this.successCount = 0;
        this.failureCount = 0;
        this.totalRequests = 0;
        this.lastSuccess = null;
        this.lastFailure = null;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;

        // Health scoring
        this.healthScore = 1.0;
        this.healthLevel = HealthLevel.HEALTHY;

        // Response time tracking
        this.responseTimes = [];
        this.maxResponseTimeSamples = 100;
        this.avgResponseTime = 0;

        // Circuit breaker state
        this.circuitOpen = false;
        this.circuitOpenUntil = null;
    }

    recordSuccess(responseTime) {
        this.successCount++;
        this.totalRequests++;
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
        this.lastSuccess = Date.now();

        if (responseTime) {
            this.responseTimes.push(responseTime);
            if (this.responseTimes.length > this.maxResponseTimeSamples) {
                this.responseTimes.shift();
            }
            this.avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
        }

        this.updateHealthScore();
    }

    recordFailure(error = {}) {
        this.failureCount++;
        this.totalRequests++;
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        this.lastFailure = Date.now();

        // Check if circuit breaker should open
        if (error.circuitOpen) {
            this.circuitOpen = true;
            this.circuitOpenUntil = error.nextAttempt || Date.now() + 60000;
        }

        this.updateHealthScore();
    }

    updateHealthScore() {
        if (this.totalRequests === 0) {
            this.healthScore = 1.0;
            this.healthLevel = HealthLevel.HEALTHY;
            return;
        }

        // Base health score on success rate
        const successRate = this.successCount / this.totalRequests;

        // Apply penalties
        let score = successRate;

        // Penalty for consecutive failures
        if (this.consecutiveFailures > 0) {
            score *= Math.max(0, 1 - (this.consecutiveFailures * 0.1));
        }

        // Bonus for consecutive successes
        if (this.consecutiveSuccesses > 5) {
            score = Math.min(1.0, score * 1.1);
        }

        // Penalty for slow response times
        if (this.avgResponseTime > 10000) { // > 10s
            score *= 0.8;
        }

        // Check circuit breaker
        if (this.circuitOpen) {
            if (Date.now() < this.circuitOpenUntil) {
                score = 0;
                this.healthLevel = HealthLevel.DOWN;
            } else {
                // Circuit can be tested
                this.circuitOpen = false;
            }
        }

        this.healthScore = Math.max(0, Math.min(1, score));

        // Determine health level
        if (this.healthScore > 0.8) {
            this.healthLevel = HealthLevel.HEALTHY;
        } else if (this.healthScore > 0.5) {
            this.healthLevel = HealthLevel.DEGRADED;
        } else if (this.healthScore > 0) {
            this.healthLevel = HealthLevel.UNHEALTHY;
        } else {
            this.healthLevel = HealthLevel.DOWN;
        }
    }

    getStatus() {
        return {
            platform: this.platform,
            enabled: this.enabled,
            priority: this.priority,
            weight: this.weight,
            healthScore: this.healthScore,
            healthLevel: this.healthLevel,
            successRate: this.totalRequests > 0 ? this.successCount / this.totalRequests : 0,
            totalRequests: this.totalRequests,
            successCount: this.successCount,
            failureCount: this.failureCount,
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            avgResponseTime: Math.round(this.avgResponseTime),
            lastSuccess: this.lastSuccess ? new Date(this.lastSuccess).toISOString() : null,
            lastFailure: this.lastFailure ? new Date(this.lastFailure).toISOString() : null,
            circuitOpen: this.circuitOpen
        };
    }

    reset() {
        this.successCount = 0;
        this.failureCount = 0;
        this.totalRequests = 0;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.healthScore = 1.0;
        this.healthLevel = HealthLevel.HEALTHY;
        this.responseTimes = [];
        this.avgResponseTime = 0;
        this.circuitOpen = false;
        this.circuitOpenUntil = null;
    }
}

/**
 * Platform Fallback Manager
 */
class PlatformFallback extends EventEmitter {
    constructor(options = {}) {
        super();

        this.platforms = new Map();
        this.fallbackChain = options.fallbackChain || [];
        this.enableWeightedRouting = options.enableWeightedRouting !== false;
        this.enableAutoRecovery = options.enableAutoRecovery !== false;
        this.healthCheckInterval = options.healthCheckInterval || 30000; // 30s
        this.minHealthScore = options.minHealthScore || 0.3;

        // Initialize platforms
        if (options.platforms) {
            options.platforms.forEach(platform => {
                this.addPlatform(platform.name, platform);
            });
        }

        // Start health monitoring
        if (this.enableAutoRecovery) {
            this.startHealthMonitoring();
        }

        // Metrics
        this.metrics = {
            totalRequests: 0,
            fallbacks: 0,
            failedRequests: 0
        };
    }

    /**
     * Add platform to fallback system
     */
    addPlatform(name, options = {}) {
        const status = new PlatformStatus(name, options);
        this.platforms.set(name, status);
        this.emit('platform_added', { platform: name, status: status.getStatus() });
    }

    /**
     * Remove platform from fallback system
     */
    removePlatform(name) {
        this.platforms.delete(name);
        this.emit('platform_removed', { platform: name });
    }

    /**
     * Enable/disable platform
     */
    setPlatformEnabled(name, enabled) {
        const platform = this.platforms.get(name);
        if (platform) {
            platform.enabled = enabled;
            this.emit('platform_toggled', { platform: name, enabled });
        }
    }

    /**
     * Execute action with automatic fallback
     */
    async execute(action, options = {}) {
        this.metrics.totalRequests++;

        const {
            preferredPlatform,
            excludePlatforms = [],
            timeout = 30000
        } = options;

        // Get available platforms
        let availablePlatforms = this.getAvailablePlatforms(excludePlatforms);

        if (availablePlatforms.length === 0) {
            const error = new Error('No available platforms');
            error.allPlatformsDown = true;
            this.metrics.failedRequests++;
            throw error;
        }

        // Try preferred platform first
        if (preferredPlatform && !excludePlatforms.includes(preferredPlatform)) {
            const platform = this.platforms.get(preferredPlatform);
            if (platform && platform.enabled && platform.healthLevel !== HealthLevel.DOWN) {
                availablePlatforms = [preferredPlatform, ...availablePlatforms.filter(p => p !== preferredPlatform)];
            }
        }

        // Try platforms in order
        let lastError;
        for (let i = 0; i < availablePlatforms.length; i++) {
            const platformName = availablePlatforms[i];
            const platform = this.platforms.get(platformName);

            if (i > 0) {
                this.metrics.fallbacks++;
                this.emit('fallback', {
                    from: availablePlatforms[i - 1],
                    to: platformName,
                    error: lastError?.message
                });
            }

            try {
                const startTime = Date.now();

                // Execute with timeout
                const result = await this.executeWithTimeout(
                    () => action(platformName),
                    timeout
                );

                const responseTime = Date.now() - startTime;
                platform.recordSuccess(responseTime);

                this.emit('success', {
                    platform: platformName,
                    responseTime,
                    attemptNumber: i + 1
                });

                return {
                    result,
                    platform: platformName,
                    responseTime,
                    fallbackUsed: i > 0
                };

            } catch (error) {
                lastError = error;
                platform.recordFailure(error);

                this.emit('failure', {
                    platform: platformName,
                    error: error.message,
                    attemptNumber: i + 1
                });

                // Continue to next platform
            }
        }

        // All platforms failed
        this.metrics.failedRequests++;
        this.emit('all_platforms_failed', {
            error: lastError?.message,
            attemptedPlatforms: availablePlatforms
        });

        throw lastError || new Error('All platforms failed');
    }

    /**
     * Get available platforms sorted by health and priority
     */
    getAvailablePlatforms(excludePlatforms = []) {
        const available = Array.from(this.platforms.values())
            .filter(p =>
                p.enabled &&
                !excludePlatforms.includes(p.platform) &&
                p.healthScore >= this.minHealthScore
            );

        // Sort by priority, then health score
        available.sort((a, b) => {
            // Primary: priority (lower is better)
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }

            // Secondary: health score (higher is better)
            if (this.enableWeightedRouting) {
                return b.healthScore - a.healthScore;
            }

            return 0;
        });

        return available.map(p => p.platform);
    }

    /**
     * Select platform using weighted random selection
     */
    selectPlatformWeighted(excludePlatforms = []) {
        const available = Array.from(this.platforms.values())
            .filter(p =>
                p.enabled &&
                !excludePlatforms.includes(p.platform) &&
                p.healthLevel !== HealthLevel.DOWN
            );

        if (available.length === 0) return null;

        // Calculate total weight
        const totalWeight = available.reduce((sum, p) =>
            sum + (p.weight * p.healthScore), 0
        );

        // Random selection based on weights
        let random = Math.random() * totalWeight;
        for (const platform of available) {
            const weight = platform.weight * platform.healthScore;
            if (random < weight) {
                return platform.platform;
            }
            random -= weight;
        }

        return available[0].platform;
    }

    /**
     * Execute with timeout
     */
    async executeWithTimeout(action, timeout) {
        return Promise.race([
            action(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            )
        ]);
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        this.healthCheckTimer = setInterval(() => {
            this.checkPlatformHealth();
        }, this.healthCheckInterval);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * Check platform health
     */
    checkPlatformHealth() {
        for (const [name, platform] of this.platforms) {
            const status = platform.getStatus();

            // Check for recovery
            if (status.healthLevel === HealthLevel.DOWN && !platform.circuitOpen) {
                this.emit('platform_recovering', { platform: name, status });
            }

            // Check for degradation
            if (status.healthLevel === HealthLevel.DEGRADED) {
                this.emit('platform_degraded', { platform: name, status });
            }

            // Check for failure
            if (status.consecutiveFailures > 10) {
                this.emit('platform_failing', { platform: name, status });
            }
        }
    }

    /**
     * Get platform status
     */
    getPlatformStatus(name) {
        const platform = this.platforms.get(name);
        return platform ? platform.getStatus() : null;
    }

    /**
     * Get all platforms status
     */
    getAllPlatformsStatus() {
        const statuses = {};
        for (const [name, platform] of this.platforms) {
            statuses[name] = platform.getStatus();
        }
        return statuses;
    }

    /**
     * Get metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            platforms: this.getAllPlatformsStatus(),
            availablePlatforms: this.getAvailablePlatforms(),
            fallbackRate: this.metrics.totalRequests > 0
                ? this.metrics.fallbacks / this.metrics.totalRequests
                : 0,
            failureRate: this.metrics.totalRequests > 0
                ? this.metrics.failedRequests / this.metrics.totalRequests
                : 0
        };
    }

    /**
     * Reset platform metrics
     */
    resetPlatformMetrics(name) {
        const platform = this.platforms.get(name);
        if (platform) {
            platform.reset();
            this.emit('platform_reset', { platform: name });
        }
    }

    /**
     * Reset all metrics
     */
    resetAllMetrics() {
        for (const platform of this.platforms.values()) {
            platform.reset();
        }
        this.metrics = {
            totalRequests: 0,
            fallbacks: 0,
            failedRequests: 0
        };
        this.emit('metrics_reset');
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopHealthMonitoring();
        this.platforms.clear();
    }
}

// Export
module.exports = {
    PlatformFallback,
    PlatformStatus,
    HealthLevel
};

// Demo
if (require.main === module) {
    async function demo() {
        console.log('=== Platform Fallback System Demo ===\n');

        const fallback = new PlatformFallback({
            platforms: [
                { name: 'huggingface', priority: 1, weight: 1.0 },
                { name: 'perplexity', priority: 2, weight: 0.8 },
                { name: 'lmarena', priority: 3, weight: 0.6 }
            ],
            enableWeightedRouting: true,
            enableAutoRecovery: true
        });

        // Event listeners
        fallback.on('fallback', ({ from, to, error }) => {
            console.log(`[FALLBACK] ${from} -> ${to} (${error})`);
        });

        fallback.on('success', ({ platform, responseTime, attemptNumber }) => {
            console.log(`[SUCCESS] ${platform} - ${responseTime}ms (attempt ${attemptNumber})`);
        });

        fallback.on('failure', ({ platform, error, attemptNumber }) => {
            console.log(`[FAILURE] ${platform} - ${error} (attempt ${attemptNumber})`);
        });

        fallback.on('platform_degraded', ({ platform, status }) => {
            console.log(`[DEGRADED] ${platform} - Health: ${status.healthScore.toFixed(2)}`);
        });

        // Simulate platform actions
        const simulateAction = async (platform) => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));

            // Simulate different platform behaviors
            if (platform === 'lmarena') {
                throw new Error('Platform timeout');
            }
            if (platform === 'perplexity' && Math.random() < 0.5) {
                throw new Error('Rate limit exceeded');
            }
            return { data: `Response from ${platform}`, timestamp: Date.now() };
        };

        // Test fallback
        console.log('Test 1: Automatic fallback\n');
        try {
            const result = await fallback.execute(simulateAction);
            console.log('Result:', result);
        } catch (error) {
            console.log('Error:', error.message);
        }

        // Test multiple requests
        console.log('\n\nTest 2: Multiple requests\n');
        for (let i = 0; i < 10; i++) {
            try {
                await fallback.execute(simulateAction);
            } catch (error) {
                // Expected
            }
        }

        // Show metrics
        console.log('\n\nPlatform Metrics:');
        const metrics = fallback.getMetrics();
        console.log(JSON.stringify(metrics, null, 2));

        fallback.destroy();
    }

    demo().catch(console.error);
}
