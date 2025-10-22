#!/usr/bin/env node

/**
 * Monitoring Integration Module
 *
 * Integrates logging, metrics, alerts, and health monitoring
 * into the web server for production deployment.
 */

const { getLogger, LogCategories } = require('../logging/logger');
const { MetricsCollector } = require('./metrics-collector');
const { AlertManager, AlertSeverity } = require('./alerts');
const { HealthMonitor, HealthStatus } = require('../health-monitor');
const path = require('path');

/**
 * Monitoring Service
 */
class MonitoringService {
    constructor(options = {}) {
        this.config = {
            enableLogging: options.enableLogging !== false,
            enableMetrics: options.enableMetrics !== false,
            enableAlerts: options.enableAlerts !== false,
            enableHealthChecks: options.enableHealthChecks !== false,
            ...options
        };

        // Initialize components
        this.logger = this.config.enableLogging ? getLogger({
            logLevel: options.logLevel || 'info',
            logDir: options.logDir || path.join(__dirname, '../logs')
        }) : null;

        this.metrics = this.config.enableMetrics ? new MetricsCollector({
            enableSystemMetrics: true,
            systemMetricsInterval: 5000
        }) : null;

        this.alertManager = this.config.enableAlerts ? new AlertManager({
            alertDir: path.join(__dirname, '../logs/alerts'),
            webhookUrl: options.webhookUrl
        }) : null;

        this.healthMonitor = this.config.enableHealthChecks ? new HealthMonitor({
            checkInterval: 60000,
            enableScheduledChecks: true
        }) : null;

        // State
        this.startTime = Date.now();
        this.queryLog = [];

        // Setup integrations
        this.setupIntegrations();
    }

    /**
     * Setup integrations between components
     */
    setupIntegrations() {
        // Metrics -> Alerts
        if (this.metrics && this.alertManager) {
            this.metrics.on('metric', (event) => {
                this.checkMetricAlerts(event);
            });
        }

        // Health Monitor -> Alerts
        if (this.healthMonitor && this.alertManager) {
            this.healthMonitor.on('status_change', (event) => {
                this.handleHealthStatusChange(event);
            });

            this.healthMonitor.on('alert', (alert) => {
                if (this.logger) {
                    this.logger.warn(alert.message, {
                        category: LogCategories.HEALTH,
                        platform: alert.platform,
                        severity: alert.severity
                    });
                }
            });
        }

        // Alerts -> Logger
        if (this.alertManager && this.logger) {
            this.alertManager.on('alert', (alert) => {
                const level = alert.severity === AlertSeverity.CRITICAL || alert.severity === AlertSeverity.FATAL
                    ? 'error' : 'warn';

                this.logger[level](alert.message, {
                    category: LogCategories.AUDIT,
                    alertId: alert.id,
                    severity: alert.severity
                });
            });
        }
    }

    /**
     * Check metrics for alert conditions
     */
    checkMetricAlerts(event) {
        const stats = this.metrics.getOverallStats();

        // Evaluate alert rules
        this.alertManager.evaluate({
            errorRate: stats.failedQueries / (stats.totalQueries || 1),
            avgResponseTime: stats.avgResponseTime,
            heapUsed: stats.memoryUsage?.heapUsed,
            heapTotal: stats.memoryUsage?.heapTotal,
            cpuUsage: stats.cpuUsage,
            queueSize: stats.queueSize || 0
        });
    }

    /**
     * Handle health status changes
     */
    handleHealthStatusChange(event) {
        const { platform, current, previous } = event;

        if (this.logger) {
            this.logger.info(`Platform ${platform} status changed: ${previous} -> ${current}`, {
                category: LogCategories.HEALTH,
                platform,
                previousStatus: previous,
                currentStatus: current
            });
        }

        // Create alerts for unhealthy platforms
        if (current === HealthStatus.UNHEALTHY && this.alertManager) {
            this.alertManager.createAlert(
                this.alertManager.getRule('platform_down'),
                { platform, status: current }
            );
        }
    }

    /**
     * Log and track query start
     */
    logQueryStart(queryId, platform, prompt) {
        if (this.logger) {
            this.logger.logQueryStart(queryId, platform, prompt);
        }

        if (this.metrics) {
            this.metrics.recordQueryStart(platform, queryId);
        }

        // Track in query log
        this.queryLog.push({
            queryId,
            platform,
            prompt: prompt.substring(0, 100),
            startTime: Date.now(),
            status: 'pending'
        });

        // Limit query log size
        if (this.queryLog.length > 1000) {
            this.queryLog.shift();
        }
    }

    /**
     * Log and track query completion
     */
    logQueryComplete(queryId, platform, duration, success = true, metadata = {}) {
        if (this.logger) {
            this.logger.logQueryComplete(queryId, platform, duration, metadata);
        }

        if (this.metrics) {
            this.metrics.recordQueryComplete(platform, queryId, duration, success);
        }

        // Update query log
        const query = this.queryLog.find(q => q.queryId === queryId && q.platform === platform);
        if (query) {
            query.status = success ? 'success' : 'failure';
            query.duration = duration;
            query.endTime = Date.now();
        }

        // Audit log
        if (this.logger) {
            this.logger.audit('query_completed', 'system', {
                queryId,
                platform,
                duration,
                success
            });
        }
    }

    /**
     * Log and track query error
     */
    logQueryError(queryId, platform, error, duration, metadata = {}) {
        if (this.logger) {
            this.logger.logQueryFailure(queryId, platform, error, duration, metadata);
        }

        if (this.metrics) {
            const errorType = error.type || 'unknown';
            this.metrics.recordQueryError(platform, queryId, errorType, duration);
        }

        // Update query log
        const query = this.queryLog.find(q => q.queryId === queryId && q.platform === platform);
        if (query) {
            query.status = 'error';
            query.error = error.message;
            query.duration = duration;
            query.endTime = Date.now();
        }
    }

    /**
     * Log WebSocket events
     */
    logWebSocket(event, metadata = {}) {
        if (this.logger) {
            this.logger.logWebSocket(event, metadata);
        }

        if (this.metrics) {
            if (event === 'connection') {
                this.metrics.recordWebSocketConnection(1);
            } else if (event === 'disconnection') {
                this.metrics.recordWebSocketConnection(-1);
            } else if (event === 'message_sent') {
                this.metrics.recordWebSocketMessage('outbound', metadata.type || 'unknown');
            } else if (event === 'message_received') {
                this.metrics.recordWebSocketMessage('inbound', metadata.type || 'unknown');
            }
        }
    }

    /**
     * Log health check
     */
    logHealthCheck(platform, status, metrics = {}) {
        if (this.logger) {
            this.logger.logHealthCheck(platform, status, metrics);
        }

        if (this.metrics) {
            this.metrics.recordPlatformHealth(platform, status);
        }
    }

    /**
     * Get health check endpoints data
     */
    getHealthEndpoint() {
        const uptime = Date.now() - this.startTime;
        const stats = this.metrics ? this.metrics.getOverallStats() : {};
        const healthSummary = this.healthMonitor ? this.healthMonitor.getHealthSummary() : {};

        const healthy = !healthSummary.unhealthy && !healthSummary.degraded;

        return {
            status: healthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime,
            checks: {
                platforms: healthSummary,
                memory: this.checkMemoryHealth(),
                cpu: this.checkCpuHealth(),
                queue: this.checkQueueHealth()
            },
            metrics: {
                totalQueries: stats.totalQueries || 0,
                successRate: stats.successRate || 100,
                avgResponseTime: stats.avgResponseTime || 0
            }
        };
    }

    /**
     * Get readiness endpoint data
     */
    getReadyEndpoint() {
        const healthSummary = this.healthMonitor ? this.healthMonitor.getHealthSummary() : { healthy: 0 };

        // System is ready if at least one platform is healthy
        const ready = healthSummary.healthy > 0;

        return {
            ready,
            timestamp: new Date().toISOString(),
            platforms: {
                total: healthSummary.total || 0,
                healthy: healthSummary.healthy || 0,
                degraded: healthSummary.degraded || 0,
                unhealthy: healthSummary.unhealthy || 0
            }
        };
    }

    /**
     * Get metrics endpoint data (Prometheus format)
     */
    getMetricsEndpoint() {
        if (!this.metrics) {
            return 'Metrics collection disabled';
        }

        return this.metrics.exportPrometheus();
    }

    /**
     * Get metrics JSON endpoint
     */
    getMetricsJSON() {
        if (!this.metrics) {
            return { error: 'Metrics collection disabled' };
        }

        const stats = this.metrics.getOverallStats();
        const selectorStats = this.metrics.getSelectorStats();
        const alertStats = this.alertManager ? this.alertManager.getStats() : {};

        return {
            success: true,
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime,
            stats,
            selectors: selectorStats,
            alerts: alertStats,
            health: this.healthMonitor ? this.healthMonitor.getHealthSummary() : {}
        };
    }

    /**
     * Check memory health
     */
    checkMemoryHealth() {
        if (!this.metrics) return { status: 'unknown' };

        const stats = this.metrics.getOverallStats();
        if (!stats.memoryUsage) return { status: 'unknown' };

        const usage = stats.memoryUsage.heapUsed / stats.memoryUsage.heapTotal;

        return {
            status: usage > 0.9 ? 'unhealthy' : usage > 0.7 ? 'degraded' : 'healthy',
            usagePercent: (usage * 100).toFixed(1),
            heapUsed: stats.memoryUsage.heapUsed,
            heapTotal: stats.memoryUsage.heapTotal
        };
    }

    /**
     * Check CPU health
     */
    checkCpuHealth() {
        if (!this.metrics) return { status: 'unknown' };

        const stats = this.metrics.getOverallStats();
        const usage = stats.cpuUsage || 0;

        return {
            status: usage > 90 ? 'unhealthy' : usage > 70 ? 'degraded' : 'healthy',
            usagePercent: usage.toFixed(1)
        };
    }

    /**
     * Check queue health
     */
    checkQueueHealth() {
        if (!this.metrics) return { status: 'unknown' };

        const stats = this.metrics.getOverallStats();
        const queueSize = stats.queueSize || 0;

        return {
            status: queueSize > 50 ? 'unhealthy' : queueSize > 20 ? 'degraded' : 'healthy',
            size: queueSize
        };
    }

    /**
     * Get active alerts
     */
    getActiveAlerts() {
        if (!this.alertManager) {
            return [];
        }

        return this.alertManager.getActiveAlerts();
    }

    /**
     * Get recent logs
     */
    getRecentLogs(filters = {}) {
        if (!this.logger) {
            return [];
        }

        return this.logger.getRecentLogs(filters);
    }

    /**
     * Export monitoring data
     */
    async exportMonitoringData(outputDir) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');

        // Export logs
        if (this.logger) {
            await this.logger.exportLogs(
                path.join(outputDir, `logs-${timestamp}.json`)
            );
        }

        // Export alerts
        if (this.alertManager) {
            await this.alertManager.exportAlerts(
                path.join(outputDir, `alerts-${timestamp}.json`)
            );
        }

        // Export metrics
        if (this.metrics) {
            const metricsData = this.metrics.exportJSON();
            const fs = require('fs').promises;
            await fs.writeFile(
                path.join(outputDir, `metrics-${timestamp}.json`),
                JSON.stringify(metricsData, null, 2)
            );
        }
    }

    /**
     * Shutdown monitoring service
     */
    async shutdown() {
        if (this.logger) {
            await this.logger.shutdown();
        }

        if (this.metrics) {
            this.metrics.stop();
        }

        if (this.healthMonitor) {
            this.healthMonitor.stopScheduledChecks();
        }
    }
}

// Export
module.exports = {
    MonitoringService
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Monitoring Service Demo ===\n');

        const monitoring = new MonitoringService({
            logLevel: 'debug',
            enableLogging: true,
            enableMetrics: true,
            enableAlerts: true
        });

        // Simulate some activity
        console.log('Simulating queries...\n');

        const platforms = ['claude', 'chatgpt', 'gemini'];

        for (let i = 0; i < 10; i++) {
            const platform = platforms[Math.floor(Math.random() * platforms.length)];
            const queryId = `q${i}`;
            const prompt = `Test query ${i}`;

            monitoring.logQueryStart(queryId, platform, prompt);

            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

            const duration = Math.random() * 3000 + 500;
            const success = Math.random() > 0.1;

            if (success) {
                monitoring.logQueryComplete(queryId, platform, duration, true);
            } else {
                monitoring.logQueryError(queryId, platform, new Error('Test error'), duration);
            }
        }

        // Simulate WebSocket activity
        monitoring.logWebSocket('connection', { clientId: 'test123' });
        monitoring.logWebSocket('message_sent', { type: 'query_start' });
        monitoring.logWebSocket('message_received', { type: 'ping' });

        // Get health status
        console.log('\n=== Health Status ===');
        console.log(JSON.stringify(monitoring.getHealthEndpoint(), null, 2));

        // Get metrics
        console.log('\n=== Metrics ===');
        console.log(JSON.stringify(monitoring.getMetricsJSON(), null, 2));

        // Get active alerts
        console.log('\n=== Active Alerts ===');
        const alerts = monitoring.getActiveAlerts();
        console.log(`Total alerts: ${alerts.length}`);

        // Get recent logs
        console.log('\n=== Recent Logs ===');
        const logs = monitoring.getRecentLogs({ limit: 5 });
        console.log(JSON.stringify(logs, null, 2));

        // Cleanup
        await monitoring.shutdown();
        console.log('\n✅ Demo complete');
    }

    demo().catch(console.error);
}
