#!/usr/bin/env node

/**
 * Health Monitor for Production AI Orchestrator
 *
 * Features:
 * - Platform availability checking
 * - Real-time health status tracking
 * - Automatic platform disabling when unhealthy
 * - Health check scheduling
 * - Alert system for critical failures
 * - Performance degradation detection
 */

const EventEmitter = require('events');
const { ErrorTypes } = require('./error-handler');

/**
 * Health Status Types
 */
const HealthStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    DISABLED: 'disabled',
    UNKNOWN: 'unknown'
};

/**
 * Alert Severity Levels
 */
const AlertSeverity = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical'
};

/**
 * Platform Health Check
 */
class PlatformHealthCheck {
    constructor(platformName, options = {}) {
        this.platformName = platformName;

        // Configuration
        this.checkInterval = options.checkInterval || 60000; // 1 minute
        this.timeout = options.timeout || 10000; // 10 seconds
        this.unhealthyThreshold = options.unhealthyThreshold || 3; // Consecutive failures
        this.degradedThreshold = options.degradedThreshold || 2; // Consecutive failures
        this.recoveryThreshold = options.recoveryThreshold || 2; // Consecutive successes
        this.disableOnUnhealthy = options.disableOnUnhealthy !== false;

        // Performance thresholds
        this.latencyWarningThreshold = options.latencyWarningThreshold || 5000; // 5s
        this.latencyCriticalThreshold = options.latencyCriticalThreshold || 10000; // 10s
        this.errorRateWarningThreshold = options.errorRateWarningThreshold || 0.1; // 10%
        this.errorRateCriticalThreshold = options.errorRateCriticalThreshold || 0.25; // 25%

        // State
        this.status = HealthStatus.UNKNOWN;
        this.enabled = true;
        this.lastCheckTime = null;
        this.lastSuccessTime = null;
        this.lastFailureTime = null;

        // Metrics
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.totalChecks = 0;
        this.successfulChecks = 0;
        this.failedChecks = 0;

        // Performance metrics
        this.latencyHistory = [];
        this.errorHistory = [];
        this.maxHistorySize = 100;

        // Check history
        this.recentChecks = [];
        this.maxRecentChecks = 20;

        // Scheduled check
        this.checkTimer = null;
    }

    /**
     * Perform health check
     */
    async check(checkFunction) {
        if (!this.enabled) {
            return {
                platform: this.platformName,
                status: HealthStatus.DISABLED,
                timestamp: new Date().toISOString()
            };
        }

        const startTime = Date.now();
        this.lastCheckTime = startTime;
        this.totalChecks++;

        try {
            // Execute check with timeout
            const result = await this.executeWithTimeout(checkFunction, this.timeout);

            const latency = Date.now() - startTime;

            // Record success
            this.recordSuccess(latency);

            // Update status
            this.updateStatus();

            return {
                platform: this.platformName,
                status: this.status,
                success: true,
                latency: latency,
                timestamp: new Date().toISOString(),
                metrics: this.getMetrics()
            };

        } catch (error) {
            const latency = Date.now() - startTime;

            // Record failure
            this.recordFailure(error, latency);

            // Update status
            this.updateStatus();

            return {
                platform: this.platformName,
                status: this.status,
                success: false,
                error: error.message,
                errorType: error.type || ErrorTypes.UNKNOWN,
                latency: latency,
                timestamp: new Date().toISOString(),
                metrics: this.getMetrics()
            };
        }
    }

    /**
     * Execute function with timeout
     */
    executeWithTimeout(fn, timeout) {
        return Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Health check timeout')), timeout)
            )
        ]);
    }

    /**
     * Record successful check
     */
    recordSuccess(latency) {
        this.successfulChecks++;
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
        this.lastSuccessTime = Date.now();

        // Record latency
        this.latencyHistory.push(latency);
        if (this.latencyHistory.length > this.maxHistorySize) {
            this.latencyHistory.shift();
        }

        // Record in recent checks
        this.recentChecks.push({
            timestamp: new Date().toISOString(),
            success: true,
            latency: latency
        });

        if (this.recentChecks.length > this.maxRecentChecks) {
            this.recentChecks.shift();
        }
    }

    /**
     * Record failed check
     */
    recordFailure(error, latency) {
        this.failedChecks++;
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        this.lastFailureTime = Date.now();

        // Record error
        this.errorHistory.push({
            timestamp: Date.now(),
            error: error.message,
            type: error.type || ErrorTypes.UNKNOWN
        });

        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.shift();
        }

        // Record in recent checks
        this.recentChecks.push({
            timestamp: new Date().toISOString(),
            success: false,
            error: error.message,
            latency: latency
        });

        if (this.recentChecks.length > this.maxRecentChecks) {
            this.recentChecks.shift();
        }
    }

    /**
     * Update health status based on metrics
     */
    updateStatus() {
        const previousStatus = this.status;

        // Check if should be disabled
        if (this.disableOnUnhealthy && this.consecutiveFailures >= this.unhealthyThreshold) {
            this.status = HealthStatus.UNHEALTHY;
            this.enabled = false;
            return;
        }

        // Check consecutive failures
        if (this.consecutiveFailures >= this.unhealthyThreshold) {
            this.status = HealthStatus.UNHEALTHY;
        } else if (this.consecutiveFailures >= this.degradedThreshold) {
            this.status = HealthStatus.DEGRADED;
        } else if (this.consecutiveSuccesses >= this.recoveryThreshold) {
            this.status = HealthStatus.HEALTHY;
        }

        // Check performance degradation
        const metrics = this.getMetrics();

        if (
            metrics.avgLatency > this.latencyCriticalThreshold ||
            metrics.errorRate > this.errorRateCriticalThreshold
        ) {
            if (this.status === HealthStatus.HEALTHY) {
                this.status = HealthStatus.DEGRADED;
            }
        } else if (
            metrics.avgLatency > this.latencyWarningThreshold ||
            metrics.errorRate > this.errorRateWarningThreshold
        ) {
            if (this.status === HealthStatus.HEALTHY) {
                this.status = HealthStatus.DEGRADED;
            }
        }

        // Status changed event
        if (previousStatus !== this.status) {
            return {
                statusChanged: true,
                previous: previousStatus,
                current: this.status
            };
        }

        return { statusChanged: false };
    }

    /**
     * Get health metrics
     */
    getMetrics() {
        const now = Date.now();

        // Calculate average latency
        const avgLatency = this.latencyHistory.length > 0
            ? this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
            : 0;

        // Calculate p95 latency
        const p95Latency = this.calculatePercentile(this.latencyHistory, 0.95);

        // Calculate error rate
        const errorRate = this.totalChecks > 0
            ? this.failedChecks / this.totalChecks
            : 0;

        // Recent error rate (last 10 checks)
        const recentErrorRate = this.recentChecks.length > 0
            ? this.recentChecks.filter(c => !c.success).length / this.recentChecks.length
            : 0;

        // Time since last success/failure
        const timeSinceLastSuccess = this.lastSuccessTime
            ? now - this.lastSuccessTime
            : null;

        const timeSinceLastFailure = this.lastFailureTime
            ? now - this.lastFailureTime
            : null;

        return {
            status: this.status,
            enabled: this.enabled,
            totalChecks: this.totalChecks,
            successfulChecks: this.successfulChecks,
            failedChecks: this.failedChecks,
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            errorRate: errorRate,
            recentErrorRate: recentErrorRate,
            avgLatency: Math.round(avgLatency),
            p95Latency: Math.round(p95Latency),
            timeSinceLastSuccess: timeSinceLastSuccess,
            timeSinceLastFailure: timeSinceLastFailure,
            lastCheckTime: this.lastCheckTime ? new Date(this.lastCheckTime).toISOString() : null
        };
    }

    /**
     * Calculate percentile
     */
    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;

        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[index] || 0;
    }

    /**
     * Enable platform
     */
    enable() {
        this.enabled = true;
        if (this.status === HealthStatus.DISABLED) {
            this.status = HealthStatus.UNKNOWN;
        }
    }

    /**
     * Disable platform
     */
    disable() {
        this.enabled = false;
        this.status = HealthStatus.DISABLED;
    }

    /**
     * Reset health check state
     */
    reset() {
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.status = HealthStatus.UNKNOWN;
        this.enabled = true;
    }

    /**
     * Start scheduled health checks
     */
    startScheduled(checkFunction) {
        this.stopScheduled();

        this.checkTimer = setInterval(async () => {
            await this.check(checkFunction);
        }, this.checkInterval);
    }

    /**
     * Stop scheduled health checks
     */
    stopScheduled() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }
}

/**
 * Alert Manager
 */
class AlertManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            enableAlerts: options.enableAlerts !== false,
            alertCooldown: options.alertCooldown || 300000, // 5 minutes
            ...options
        };

        this.alerts = [];
        this.lastAlerts = new Map(); // Track last alert time per platform
    }

    /**
     * Create alert
     */
    createAlert(platform, severity, message, context = {}) {
        if (!this.options.enableAlerts) return;

        // Check cooldown
        const lastAlert = this.lastAlerts.get(`${platform}_${severity}`);
        if (lastAlert && Date.now() - lastAlert < this.options.alertCooldown) {
            return; // Skip duplicate alerts
        }

        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            platform: platform,
            severity: severity,
            message: message,
            context: context,
            timestamp: new Date().toISOString()
        };

        this.alerts.push(alert);
        this.lastAlerts.set(`${platform}_${severity}`, Date.now());

        // Emit alert event
        this.emit('alert', alert);

        // Log alert
        this.logAlert(alert);

        return alert;
    }

    /**
     * Log alert
     */
    logAlert(alert) {
        const prefix = {
            [AlertSeverity.INFO]: '[INFO]',
            [AlertSeverity.WARNING]: '[WARNING]',
            [AlertSeverity.CRITICAL]: '[CRITICAL]'
        }[alert.severity];

        console.log(`${prefix} ${alert.platform}: ${alert.message}`);
    }

    /**
     * Get all alerts
     */
    getAlerts(filters = {}) {
        let filtered = this.alerts;

        if (filters.platform) {
            filtered = filtered.filter(a => a.platform === filters.platform);
        }

        if (filters.severity) {
            filtered = filtered.filter(a => a.severity === filters.severity);
        }

        if (filters.since) {
            filtered = filtered.filter(a => new Date(a.timestamp) >= new Date(filters.since));
        }

        return filtered;
    }

    /**
     * Clear alerts
     */
    clearAlerts() {
        this.alerts = [];
        this.lastAlerts.clear();
    }
}

/**
 * Main Health Monitor
 */
class HealthMonitor extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            checkInterval: options.checkInterval || 60000,
            enableScheduledChecks: options.enableScheduledChecks !== false,
            healthCheckOptions: options.healthCheckOptions || {},
            alertOptions: options.alertOptions || {},
            ...options
        };

        // Platform health checks
        this.healthChecks = new Map();

        // Alert manager
        this.alertManager = new AlertManager(this.options.alertOptions);

        // Forward alert events
        this.alertManager.on('alert', (alert) => {
            this.emit('alert', alert);
        });
    }

    /**
     * Register platform for health monitoring
     */
    registerPlatform(platformName, options = {}) {
        const healthCheck = new PlatformHealthCheck(platformName, {
            ...this.options.healthCheckOptions,
            ...options
        });

        this.healthChecks.set(platformName, healthCheck);

        return healthCheck;
    }

    /**
     * Unregister platform
     */
    unregisterPlatform(platformName) {
        const healthCheck = this.healthChecks.get(platformName);
        if (healthCheck) {
            healthCheck.stopScheduled();
            this.healthChecks.delete(platformName);
        }
    }

    /**
     * Check platform health
     */
    async checkPlatform(platformName, checkFunction) {
        const healthCheck = this.healthChecks.get(platformName);
        if (!healthCheck) {
            throw new Error(`Platform ${platformName} not registered`);
        }

        const result = await healthCheck.check(checkFunction);

        // Handle status changes and alerts
        const statusChange = healthCheck.updateStatus();

        if (statusChange && statusChange.statusChanged) {
            this.handleStatusChange(platformName, statusChange.previous, statusChange.current, result);
        }

        // Emit health check event
        this.emit('health_check', result);

        return result;
    }

    /**
     * Handle status change
     */
    handleStatusChange(platform, previousStatus, currentStatus, checkResult) {
        this.emit('status_change', {
            platform,
            previous: previousStatus,
            current: currentStatus,
            timestamp: new Date().toISOString()
        });

        // Create alerts based on status
        if (currentStatus === HealthStatus.UNHEALTHY) {
            this.alertManager.createAlert(
                platform,
                AlertSeverity.CRITICAL,
                `Platform is UNHEALTHY. Consecutive failures: ${checkResult.metrics.consecutiveFailures}`,
                { previousStatus, checkResult }
            );
        } else if (currentStatus === HealthStatus.DEGRADED) {
            this.alertManager.createAlert(
                platform,
                AlertSeverity.WARNING,
                `Platform performance is DEGRADED. Error rate: ${(checkResult.metrics.errorRate * 100).toFixed(1)}%`,
                { previousStatus, checkResult }
            );
        } else if (currentStatus === HealthStatus.HEALTHY && previousStatus !== HealthStatus.HEALTHY) {
            this.alertManager.createAlert(
                platform,
                AlertSeverity.INFO,
                `Platform recovered and is now HEALTHY`,
                { previousStatus, checkResult }
            );
        }
    }

    /**
     * Check all registered platforms
     */
    async checkAllPlatforms(checkFunctions) {
        const results = [];

        for (const [platformName, healthCheck] of this.healthChecks) {
            const checkFunction = checkFunctions[platformName];

            if (checkFunction) {
                try {
                    const result = await this.checkPlatform(platformName, checkFunction);
                    results.push(result);
                } catch (error) {
                    results.push({
                        platform: platformName,
                        status: HealthStatus.UNKNOWN,
                        success: false,
                        error: error.message
                    });
                }
            }
        }

        return results;
    }

    /**
     * Start scheduled health checks for all platforms
     */
    startScheduledChecks(checkFunctions) {
        if (!this.options.enableScheduledChecks) return;

        for (const [platformName, healthCheck] of this.healthChecks) {
            const checkFunction = checkFunctions[platformName];

            if (checkFunction) {
                healthCheck.startScheduled(async () => {
                    return await this.checkPlatform(platformName, checkFunction);
                });
            }
        }
    }

    /**
     * Stop all scheduled health checks
     */
    stopScheduledChecks() {
        for (const [, healthCheck] of this.healthChecks) {
            healthCheck.stopScheduled();
        }
    }

    /**
     * Get platform health status
     */
    getPlatformHealth(platformName) {
        const healthCheck = this.healthChecks.get(platformName);
        if (!healthCheck) {
            return {
                platform: platformName,
                status: HealthStatus.UNKNOWN,
                error: 'Platform not registered'
            };
        }

        return {
            platform: platformName,
            ...healthCheck.getMetrics(),
            recentChecks: healthCheck.recentChecks
        };
    }

    /**
     * Get all platform health statuses
     */
    getAllPlatformHealth() {
        const health = {};

        for (const [platformName] of this.healthChecks) {
            health[platformName] = this.getPlatformHealth(platformName);
        }

        return health;
    }

    /**
     * Get healthy platforms
     */
    getHealthyPlatforms() {
        return Array.from(this.healthChecks.entries())
            .filter(([, healthCheck]) => healthCheck.status === HealthStatus.HEALTHY)
            .map(([platformName]) => platformName);
    }

    /**
     * Get degraded platforms
     */
    getDegradedPlatforms() {
        return Array.from(this.healthChecks.entries())
            .filter(([, healthCheck]) => healthCheck.status === HealthStatus.DEGRADED)
            .map(([platformName]) => platformName);
    }

    /**
     * Get unhealthy platforms
     */
    getUnhealthyPlatforms() {
        return Array.from(this.healthChecks.entries())
            .filter(([, healthCheck]) => healthCheck.status === HealthStatus.UNHEALTHY)
            .map(([platformName]) => platformName);
    }

    /**
     * Enable platform
     */
    enablePlatform(platformName) {
        const healthCheck = this.healthChecks.get(platformName);
        if (healthCheck) {
            healthCheck.enable();
        }
    }

    /**
     * Disable platform
     */
    disablePlatform(platformName) {
        const healthCheck = this.healthChecks.get(platformName);
        if (healthCheck) {
            healthCheck.disable();
        }
    }

    /**
     * Reset platform health
     */
    resetPlatform(platformName) {
        const healthCheck = this.healthChecks.get(platformName);
        if (healthCheck) {
            healthCheck.reset();
        }
    }

    /**
     * Get alerts
     */
    getAlerts(filters) {
        return this.alertManager.getAlerts(filters);
    }

    /**
     * Clear alerts
     */
    clearAlerts() {
        this.alertManager.clearAlerts();
    }

    /**
     * Get health summary
     */
    getHealthSummary() {
        const allHealth = this.getAllPlatformHealth();

        const summary = {
            total: this.healthChecks.size,
            healthy: 0,
            degraded: 0,
            unhealthy: 0,
            disabled: 0,
            unknown: 0,
            platforms: allHealth
        };

        for (const [, health] of Object.entries(allHealth)) {
            switch (health.status) {
                case HealthStatus.HEALTHY:
                    summary.healthy++;
                    break;
                case HealthStatus.DEGRADED:
                    summary.degraded++;
                    break;
                case HealthStatus.UNHEALTHY:
                    summary.unhealthy++;
                    break;
                case HealthStatus.DISABLED:
                    summary.disabled++;
                    break;
                default:
                    summary.unknown++;
            }
        }

        return summary;
    }
}

// Export
module.exports = {
    HealthMonitor,
    HealthStatus,
    AlertSeverity,
    AlertManager,
    PlatformHealthCheck
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Health Monitor Demo ===\n');

        const monitor = new HealthMonitor({
            checkInterval: 5000,
            enableScheduledChecks: false
        });

        // Register platforms
        monitor.registerPlatform('openai', {
            unhealthyThreshold: 3,
            degradedThreshold: 2
        });

        monitor.registerPlatform('anthropic', {
            unhealthyThreshold: 3,
            degradedThreshold: 2
        });

        // Listen to events
        monitor.on('health_check', (result) => {
            console.log(`[Health Check] ${result.platform}: ${result.status} (${result.latency}ms)`);
        });

        monitor.on('status_change', ({ platform, previous, current }) => {
            console.log(`[Status Change] ${platform}: ${previous} -> ${current}`);
        });

        monitor.on('alert', (alert) => {
            console.log(`[Alert] ${alert.severity.toUpperCase()} - ${alert.platform}: ${alert.message}`);
        });

        // Simulate health checks
        console.log('Simulating health checks with varying results:\n');

        const checkFunctions = {
            openai: async () => {
                // Simulate random success/failure
                if (Math.random() > 0.3) {
                    return { success: true };
                }
                throw new Error('API error');
            },
            anthropic: async () => {
                // Simulate degraded performance
                await new Promise(resolve => setTimeout(resolve, 6000));
                return { success: true };
            }
        };

        // Run checks
        for (let i = 0; i < 5; i++) {
            console.log(`\n--- Check Round ${i + 1} ---`);
            await monitor.checkAllPlatforms(checkFunctions);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Get summary
        console.log('\n\nHealth Summary:');
        console.log(JSON.stringify(monitor.getHealthSummary(), null, 2));

        // Get alerts
        console.log('\n\nAlerts:');
        const alerts = monitor.getAlerts();
        alerts.forEach(alert => {
            console.log(`  [${alert.severity}] ${alert.platform}: ${alert.message}`);
        });
    }

    demo().catch(console.error);
}


// Remove duplicate export - already exported above
