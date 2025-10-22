#!/usr/bin/env node

/**
 * Self-Healing System
 *
 * Features:
 * - Auto-restart failed browser instances
 * - Clear browser cache/cookies on repeated failures
 * - Automatic selector rediscovery on DOM changes
 * - Platform configuration auto-update
 * - Health-based recovery triggers
 * - Recovery action history and analytics
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Recovery Actions
 */
const RecoveryAction = {
    RESTART_BROWSER: 'restart_browser',
    CLEAR_CACHE: 'clear_cache',
    CLEAR_COOKIES: 'clear_cookies',
    REDISCOVER_SELECTORS: 'rediscover_selectors',
    UPDATE_CONFIG: 'update_config',
    RESET_SESSION: 'reset_session',
    CHANGE_USER_AGENT: 'change_user_agent',
    WAIT_AND_RETRY: 'wait_and_retry'
};

/**
 * Health Status
 */
const HealthStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    FAILING: 'failing',
    CRITICAL: 'critical'
};

/**
 * Recovery Record
 */
class RecoveryRecord {
    constructor(platform, action, context = {}) {
        this.id = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.platform = platform;
        this.action = action;
        this.context = context;
        this.timestamp = Date.now();
        this.success = null;
        this.error = null;
        this.duration = null;
    }

    complete(success, error = null, duration = 0) {
        this.success = success;
        this.error = error;
        this.duration = duration;
    }

    toJSON() {
        return {
            id: this.id,
            platform: this.platform,
            action: this.action,
            context: this.context,
            timestamp: this.timestamp,
            success: this.success,
            error: this.error,
            duration: this.duration
        };
    }
}

/**
 * Platform Health Tracker
 */
class PlatformHealthTracker {
    constructor(platform, options = {}) {
        this.platform = platform;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.totalFailures = 0;
        this.totalSuccesses = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.lastRecoveryTime = null;

        // Thresholds
        this.degradedThreshold = options.degradedThreshold || 3;
        this.failingThreshold = options.failingThreshold || 5;
        this.criticalThreshold = options.criticalThreshold || 10;

        // Recovery tracking
        this.recoveryAttempts = 0;
        this.lastRecoveryAction = null;
    }

    recordSuccess() {
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
        this.totalSuccesses++;
        this.lastSuccessTime = Date.now();
    }

    recordFailure() {
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        this.totalFailures++;
        this.lastFailureTime = Date.now();
    }

    recordRecovery(action) {
        this.recoveryAttempts++;
        this.lastRecoveryAction = action;
        this.lastRecoveryTime = Date.now();
    }

    getHealthStatus() {
        if (this.consecutiveFailures >= this.criticalThreshold) {
            return HealthStatus.CRITICAL;
        } else if (this.consecutiveFailures >= this.failingThreshold) {
            return HealthStatus.FAILING;
        } else if (this.consecutiveFailures >= this.degradedThreshold) {
            return HealthStatus.DEGRADED;
        }
        return HealthStatus.HEALTHY;
    }

    reset() {
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
    }

    getStats() {
        return {
            platform: this.platform,
            healthStatus: this.getHealthStatus(),
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            totalFailures: this.totalFailures,
            totalSuccesses: this.totalSuccesses,
            successRate: this.totalSuccesses + this.totalFailures > 0
                ? this.totalSuccesses / (this.totalSuccesses + this.totalFailures)
                : 0,
            recoveryAttempts: this.recoveryAttempts,
            lastRecoveryAction: this.lastRecoveryAction,
            lastRecoveryTime: this.lastRecoveryTime
                ? new Date(this.lastRecoveryTime).toISOString()
                : null
        };
    }
}

/**
 * Self-Healing Manager
 */
class SelfHealing extends EventEmitter {
    constructor(options = {}) {
        super();

        this.enabled = options.enabled !== false;
        this.autoRecovery = options.autoRecovery !== false;
        this.browserManager = options.browserManager;
        this.selectorDiscovery = options.selectorDiscovery;
        this.configManager = options.configManager;

        // Health trackers
        this.healthTrackers = new Map();

        // Recovery history
        this.recoveryHistory = [];
        this.maxHistorySize = options.maxHistorySize || 1000;

        // Recovery strategies by error pattern
        this.recoveryStrategies = new Map([
            ['browser_crash', [RecoveryAction.RESTART_BROWSER]],
            ['selector_not_found', [RecoveryAction.REDISCOVER_SELECTORS, RecoveryAction.RESTART_BROWSER]],
            ['timeout', [RecoveryAction.WAIT_AND_RETRY, RecoveryAction.RESTART_BROWSER]],
            ['captcha', [RecoveryAction.CLEAR_COOKIES, RecoveryAction.CHANGE_USER_AGENT]],
            ['rate_limit', [RecoveryAction.WAIT_AND_RETRY]],
            ['auth_failed', [RecoveryAction.RESET_SESSION, RecoveryAction.UPDATE_CONFIG]],
            ['repeated_failures', [RecoveryAction.CLEAR_CACHE, RecoveryAction.CLEAR_COOKIES, RecoveryAction.RESTART_BROWSER]]
        ]);

        // Metrics
        this.metrics = {
            totalRecoveries: 0,
            successfulRecoveries: 0,
            failedRecoveries: 0,
            byAction: {}
        };
    }

    /**
     * Get or create health tracker for platform
     */
    getHealthTracker(platform) {
        if (!this.healthTrackers.has(platform)) {
            this.healthTrackers.set(platform, new PlatformHealthTracker(platform));
        }
        return this.healthTrackers.get(platform);
    }

    /**
     * Handle failure and trigger recovery if needed
     */
    async handleFailure(platform, error, context = {}) {
        const tracker = this.getHealthTracker(platform);
        tracker.recordFailure();

        const healthStatus = tracker.getHealthStatus();

        this.emit('health_status_changed', {
            platform,
            status: healthStatus,
            consecutiveFailures: tracker.consecutiveFailures
        });

        // Check if recovery is needed
        if (this.autoRecovery && healthStatus !== HealthStatus.HEALTHY) {
            return await this.triggerRecovery(platform, error, context);
        }

        return null;
    }

    /**
     * Handle success
     */
    handleSuccess(platform) {
        const tracker = this.getHealthTracker(platform);
        tracker.recordSuccess();

        if (tracker.consecutiveSuccesses >= 3) {
            // Platform recovered
            this.emit('platform_recovered', {
                platform,
                recoveryAttempts: tracker.recoveryAttempts
            });
        }
    }

    /**
     * Trigger recovery actions
     */
    async triggerRecovery(platform, error, context = {}) {
        if (!this.enabled) return null;

        const tracker = this.getHealthTracker(platform);

        // Determine recovery strategy
        const strategy = this.determineRecoveryStrategy(error, tracker);

        this.emit('recovery_started', {
            platform,
            strategy,
            healthStatus: tracker.getHealthStatus()
        });

        // Execute recovery actions
        for (const action of strategy) {
            const record = new RecoveryRecord(platform, action, context);
            const startTime = Date.now();

            try {
                await this.executeRecoveryAction(platform, action, context);

                const duration = Date.now() - startTime;
                record.complete(true, null, duration);

                tracker.recordRecovery(action);
                this.metrics.totalRecoveries++;
                this.metrics.successfulRecoveries++;
                this.updateActionMetrics(action, true);

                this.emit('recovery_action_completed', {
                    platform,
                    action,
                    success: true,
                    duration
                });

                // Add to history
                this.addToHistory(record);

                // If recovery succeeded, stop trying other actions
                return { action, success: true };

            } catch (recoveryError) {
                const duration = Date.now() - startTime;
                record.complete(false, recoveryError.message, duration);

                this.metrics.totalRecoveries++;
                this.metrics.failedRecoveries++;
                this.updateActionMetrics(action, false);

                this.emit('recovery_action_failed', {
                    platform,
                    action,
                    error: recoveryError.message,
                    duration
                });

                // Add to history
                this.addToHistory(record);

                // Continue to next action
            }
        }

        // All recovery actions failed
        this.emit('recovery_failed', {
            platform,
            strategy,
            healthStatus: tracker.getHealthStatus()
        });

        return null;
    }

    /**
     * Determine recovery strategy based on error and health
     */
    determineRecoveryStrategy(error, tracker) {
        const errorMessage = (error.message || '').toLowerCase();

        // Check specific error patterns
        for (const [pattern, actions] of this.recoveryStrategies) {
            if (errorMessage.includes(pattern.replace('_', ' '))) {
                return actions;
            }
        }

        // Check health status
        const status = tracker.getHealthStatus();

        if (status === HealthStatus.CRITICAL) {
            return [
                RecoveryAction.CLEAR_CACHE,
                RecoveryAction.CLEAR_COOKIES,
                RecoveryAction.RESTART_BROWSER,
                RecoveryAction.UPDATE_CONFIG
            ];
        } else if (status === HealthStatus.FAILING) {
            return [
                RecoveryAction.RESTART_BROWSER,
                RecoveryAction.REDISCOVER_SELECTORS
            ];
        } else if (status === HealthStatus.DEGRADED) {
            return [
                RecoveryAction.WAIT_AND_RETRY,
                RecoveryAction.RESTART_BROWSER
            ];
        }

        // Default strategy
        return [RecoveryAction.RESTART_BROWSER];
    }

    /**
     * Execute recovery action
     */
    async executeRecoveryAction(platform, action, context = {}) {
        switch (action) {
            case RecoveryAction.RESTART_BROWSER:
                return await this.restartBrowser(platform, context);

            case RecoveryAction.CLEAR_CACHE:
                return await this.clearCache(platform, context);

            case RecoveryAction.CLEAR_COOKIES:
                return await this.clearCookies(platform, context);

            case RecoveryAction.REDISCOVER_SELECTORS:
                return await this.rediscoverSelectors(platform, context);

            case RecoveryAction.UPDATE_CONFIG:
                return await this.updateConfig(platform, context);

            case RecoveryAction.RESET_SESSION:
                return await this.resetSession(platform, context);

            case RecoveryAction.CHANGE_USER_AGENT:
                return await this.changeUserAgent(platform, context);

            case RecoveryAction.WAIT_AND_RETRY:
                return await this.waitAndRetry(platform, context);

            default:
                throw new Error(`Unknown recovery action: ${action}`);
        }
    }

    /**
     * Restart browser
     */
    async restartBrowser(platform, context) {
        if (!this.browserManager) {
            throw new Error('Browser manager not configured');
        }

        await this.browserManager.restart(platform);
        await this.sleep(2000); // Wait for browser to stabilize
    }

    /**
     * Clear browser cache
     */
    async clearCache(platform, context) {
        if (!this.browserManager) {
            throw new Error('Browser manager not configured');
        }

        await this.browserManager.clearCache(platform);
    }

    /**
     * Clear browser cookies
     */
    async clearCookies(platform, context) {
        if (!this.browserManager) {
            throw new Error('Browser manager not configured');
        }

        await this.browserManager.clearCookies(platform);
    }

    /**
     * Rediscover selectors
     */
    async rediscoverSelectors(platform, context) {
        if (!this.selectorDiscovery) {
            throw new Error('Selector discovery not configured');
        }

        const newSelectors = await this.selectorDiscovery.discover(platform);

        if (!newSelectors || Object.keys(newSelectors).length === 0) {
            throw new Error('Failed to discover new selectors');
        }

        // Update configuration with new selectors
        if (this.configManager) {
            await this.configManager.updateSelectors(platform, newSelectors);
        }

        return newSelectors;
    }

    /**
     * Update platform configuration
     */
    async updateConfig(platform, context) {
        if (!this.configManager) {
            throw new Error('Config manager not configured');
        }

        await this.configManager.reload(platform);
    }

    /**
     * Reset session
     */
    async resetSession(platform, context) {
        if (!this.browserManager) {
            throw new Error('Browser manager not configured');
        }

        await this.browserManager.clearCookies(platform);
        await this.browserManager.restart(platform);
        await this.sleep(2000);
    }

    /**
     * Change user agent
     */
    async changeUserAgent(platform, context) {
        if (!this.browserManager) {
            throw new Error('Browser manager not configured');
        }

        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        const newUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await this.browserManager.setUserAgent(platform, newUserAgent);
    }

    /**
     * Wait and retry
     */
    async waitAndRetry(platform, context) {
        const delay = context.retryDelay || 5000;
        await this.sleep(delay);
    }

    /**
     * Add record to history
     */
    addToHistory(record) {
        this.recoveryHistory.push(record);

        if (this.recoveryHistory.length > this.maxHistorySize) {
            this.recoveryHistory.shift();
        }
    }

    /**
     * Update action metrics
     */
    updateActionMetrics(action, success) {
        if (!this.metrics.byAction[action]) {
            this.metrics.byAction[action] = {
                total: 0,
                successful: 0,
                failed: 0
            };
        }

        this.metrics.byAction[action].total++;
        if (success) {
            this.metrics.byAction[action].successful++;
        } else {
            this.metrics.byAction[action].failed++;
        }
    }

    /**
     * Get recovery metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            platforms: Array.from(this.healthTrackers.values()).map(t => t.getStats()),
            recentRecoveries: this.recoveryHistory.slice(-10).map(r => r.toJSON()),
            successRate: this.metrics.totalRecoveries > 0
                ? this.metrics.successfulRecoveries / this.metrics.totalRecoveries
                : 0
        };
    }

    /**
     * Get platform health
     */
    getPlatformHealth(platform) {
        const tracker = this.healthTrackers.get(platform);
        return tracker ? tracker.getStats() : null;
    }

    /**
     * Reset platform health
     */
    resetPlatformHealth(platform) {
        const tracker = this.healthTrackers.get(platform);
        if (tracker) {
            tracker.reset();
            this.emit('health_reset', { platform });
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export
module.exports = {
    SelfHealing,
    RecoveryAction,
    HealthStatus,
    PlatformHealthTracker,
    RecoveryRecord
};

// Demo
if (require.main === module) {
    async function demo() {
        console.log('=== Self-Healing System Demo ===\n');

        // Mock browser manager
        const mockBrowserManager = {
            restart: async (platform) => {
                console.log(`  [Browser] Restarting ${platform}`);
                await new Promise(resolve => setTimeout(resolve, 500));
            },
            clearCache: async (platform) => {
                console.log(`  [Browser] Clearing cache for ${platform}`);
            },
            clearCookies: async (platform) => {
                console.log(`  [Browser] Clearing cookies for ${platform}`);
            },
            setUserAgent: async (platform, ua) => {
                console.log(`  [Browser] Setting user agent for ${platform}`);
            }
        };

        const selfHealing = new SelfHealing({
            enabled: true,
            autoRecovery: true,
            browserManager: mockBrowserManager
        });

        // Event listeners
        selfHealing.on('health_status_changed', ({ platform, status, consecutiveFailures }) => {
            console.log(`[HEALTH] ${platform}: ${status} (failures: ${consecutiveFailures})`);
        });

        selfHealing.on('recovery_started', ({ platform, strategy }) => {
            console.log(`[RECOVERY] Starting for ${platform}: ${strategy.join(', ')}`);
        });

        selfHealing.on('recovery_action_completed', ({ platform, action, duration }) => {
            console.log(`[RECOVERY] ${action} completed in ${duration}ms`);
        });

        selfHealing.on('platform_recovered', ({ platform, recoveryAttempts }) => {
            console.log(`[RECOVERED] ${platform} after ${recoveryAttempts} recovery attempts`);
        });

        // Simulate failures and recoveries
        console.log('Simulating platform failures:\n');

        const platform = 'test-platform';

        // Simulate multiple failures
        for (let i = 0; i < 7; i++) {
            const error = new Error(i < 3 ? 'Timeout error' : 'Element selector not found');
            await selfHealing.handleFailure(platform, error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Simulate recovery
        console.log('\nSimulating recovery:\n');
        for (let i = 0; i < 5; i++) {
            selfHealing.handleSuccess(platform);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Show metrics
        console.log('\n\nRecovery Metrics:');
        console.log(JSON.stringify(selfHealing.getMetrics(), null, 2));
    }

    demo().catch(console.error);
}
