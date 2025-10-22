#!/usr/bin/env node

/**
 * Alert System for ISH Automation
 *
 * Features:
 * - Rule-based alerting with thresholds
 * - Multiple severity levels
 * - Alert deduplication and cooldown
 * - Multiple notification channels (console, file, webhook, email)
 * - Alert history and acknowledgement
 * - Conditional alerts based on metrics
 * - Alert aggregation and batching
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Alert Severity Levels
 */
const AlertSeverity = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical',
    FATAL: 'fatal'
};

/**
 * Alert States
 */
const AlertState = {
    ACTIVE: 'active',
    ACKNOWLEDGED: 'acknowledged',
    RESOLVED: 'resolved',
    SUPPRESSED: 'suppressed'
};

/**
 * Alert Rule
 */
class AlertRule {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.description = config.description;
        this.severity = config.severity || AlertSeverity.WARNING;
        this.condition = config.condition; // Function that returns true/false
        this.threshold = config.threshold;
        this.window = config.window || 60000; // 1 minute
        this.cooldown = config.cooldown || 300000; // 5 minutes
        this.channels = config.channels || ['console'];
        this.enabled = config.enabled !== false;
        this.metadata = config.metadata || {};

        // State
        this.lastTriggered = null;
        this.triggerCount = 0;
        this.state = AlertState.ACTIVE;
    }

    /**
     * Check if rule should trigger
     */
    shouldTrigger(data) {
        if (!this.enabled) return false;

        // Check cooldown
        if (this.lastTriggered) {
            const timeSinceLastTrigger = Date.now() - this.lastTriggered;
            if (timeSinceLastTrigger < this.cooldown) {
                return false;
            }
        }

        // Evaluate condition
        return this.condition(data, this.threshold);
    }

    /**
     * Trigger alert
     */
    trigger() {
        this.lastTriggered = Date.now();
        this.triggerCount++;
        this.state = AlertState.ACTIVE;
    }

    /**
     * Acknowledge alert
     */
    acknowledge() {
        this.state = AlertState.ACKNOWLEDGED;
    }

    /**
     * Resolve alert
     */
    resolve() {
        this.state = AlertState.RESOLVED;
    }

    /**
     * Suppress alert
     */
    suppress() {
        this.state = AlertState.SUPPRESSED;
    }

    /**
     * Enable rule
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable rule
     */
    disable() {
        this.enabled = false;
    }
}

/**
 * Alert
 */
class Alert {
    constructor(config) {
        this.id = config.id || `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.ruleId = config.ruleId;
        this.ruleName = config.ruleName;
        this.severity = config.severity;
        this.message = config.message;
        this.description = config.description;
        this.timestamp = new Date().toISOString();
        this.state = config.state || AlertState.ACTIVE;
        this.context = config.context || {};
        this.acknowledgedBy = null;
        this.acknowledgedAt = null;
        this.resolvedAt = null;
    }

    /**
     * Acknowledge alert
     */
    acknowledge(userId = 'system') {
        this.state = AlertState.ACKNOWLEDGED;
        this.acknowledgedBy = userId;
        this.acknowledgedAt = new Date().toISOString();
    }

    /**
     * Resolve alert
     */
    resolve() {
        this.state = AlertState.RESOLVED;
        this.resolvedAt = new Date().toISOString();
    }

    /**
     * Get alert age in ms
     */
    getAge() {
        return Date.now() - new Date(this.timestamp).getTime();
    }

    /**
     * Convert to JSON
     */
    toJSON() {
        return {
            id: this.id,
            ruleId: this.ruleId,
            ruleName: this.ruleName,
            severity: this.severity,
            message: this.message,
            description: this.description,
            timestamp: this.timestamp,
            state: this.state,
            context: this.context,
            acknowledgedBy: this.acknowledgedBy,
            acknowledgedAt: this.acknowledgedAt,
            resolvedAt: this.resolvedAt,
            age: this.getAge()
        };
    }
}

/**
 * Alert Manager
 */
class AlertManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.config = {
            alertDir: options.alertDir || path.join(__dirname, '../logs/alerts'),
            maxAlerts: options.maxAlerts || 1000,
            enableNotifications: options.enableNotifications !== false,
            webhookUrl: options.webhookUrl || null,
            emailConfig: options.emailConfig || null,
            ...options
        };

        // Rules and alerts
        this.rules = new Map();
        this.alerts = [];
        this.activeAlerts = new Map();

        // Initialize default rules
        this.initializeDefaultRules();

        // Statistics
        this.stats = {
            totalAlerts: 0,
            alertsBySeverity: {
                info: 0,
                warning: 0,
                critical: 0,
                fatal: 0
            },
            alertsByRule: new Map()
        };
    }

    /**
     * Initialize default alert rules
     */
    initializeDefaultRules() {
        // Platform down for > 5 minutes
        this.addRule({
            id: 'platform_down',
            name: 'Platform Down',
            description: 'Platform has been down for more than 5 minutes',
            severity: AlertSeverity.CRITICAL,
            condition: (data, threshold) => {
                return data.status === 'unhealthy' && data.downtime > threshold;
            },
            threshold: 5 * 60 * 1000, // 5 minutes
            cooldown: 10 * 60 * 1000, // 10 minutes
            channels: ['console', 'file', 'webhook']
        });

        // Error rate > 10%
        this.addRule({
            id: 'high_error_rate',
            name: 'High Error Rate',
            description: 'Error rate exceeds 10%',
            severity: AlertSeverity.WARNING,
            condition: (data, threshold) => {
                return data.errorRate > threshold;
            },
            threshold: 0.10, // 10%
            cooldown: 5 * 60 * 1000,
            channels: ['console', 'file']
        });

        // Response time > 90 seconds
        this.addRule({
            id: 'slow_response',
            name: 'Slow Response Time',
            description: 'Response time exceeds 90 seconds',
            severity: AlertSeverity.WARNING,
            condition: (data, threshold) => {
                return data.avgResponseTime > threshold;
            },
            threshold: 90000, // 90 seconds
            cooldown: 5 * 60 * 1000,
            channels: ['console', 'file']
        });

        // Memory usage > 80%
        this.addRule({
            id: 'high_memory',
            name: 'High Memory Usage',
            description: 'Memory usage exceeds 80%',
            severity: AlertSeverity.CRITICAL,
            condition: (data, threshold) => {
                if (!data.heapTotal || !data.heapUsed) return false;
                const usage = data.heapUsed / data.heapTotal;
                return usage > threshold;
            },
            threshold: 0.80, // 80%
            cooldown: 10 * 60 * 1000,
            channels: ['console', 'file', 'webhook']
        });

        // CPU usage > 90%
        this.addRule({
            id: 'high_cpu',
            name: 'High CPU Usage',
            description: 'CPU usage exceeds 90%',
            severity: AlertSeverity.WARNING,
            condition: (data, threshold) => {
                return data.cpuUsage > threshold;
            },
            threshold: 90, // 90%
            cooldown: 5 * 60 * 1000,
            channels: ['console', 'file']
        });

        // WebSocket connection instability
        this.addRule({
            id: 'websocket_instability',
            name: 'WebSocket Instability',
            description: 'WebSocket connection count is unstable',
            severity: AlertSeverity.INFO,
            condition: (data, threshold) => {
                return data.connectionChurn > threshold;
            },
            threshold: 10, // 10 connections per minute
            cooldown: 5 * 60 * 1000,
            channels: ['console']
        });

        // Queue buildup
        this.addRule({
            id: 'queue_buildup',
            name: 'Queue Buildup',
            description: 'Request queue is building up',
            severity: AlertSeverity.WARNING,
            condition: (data, threshold) => {
                return data.queueSize > threshold;
            },
            threshold: 50,
            cooldown: 5 * 60 * 1000,
            channels: ['console', 'file']
        });
    }

    /**
     * Add alert rule
     */
    addRule(config) {
        const rule = new AlertRule(config);
        this.rules.set(rule.id, rule);
        return rule;
    }

    /**
     * Get rule
     */
    getRule(ruleId) {
        return this.rules.get(ruleId);
    }

    /**
     * Remove rule
     */
    removeRule(ruleId) {
        return this.rules.delete(ruleId);
    }

    /**
     * Evaluate all rules against data
     */
    evaluate(data) {
        const triggeredAlerts = [];

        for (const [ruleId, rule] of this.rules) {
            if (rule.shouldTrigger(data)) {
                const alert = this.createAlert(rule, data);
                triggeredAlerts.push(alert);
            }
        }

        return triggeredAlerts;
    }

    /**
     * Create and fire alert
     */
    createAlert(rule, context = {}) {
        const alert = new Alert({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: this.formatMessage(rule, context),
            description: rule.description,
            context: context
        });

        // Trigger rule
        rule.trigger();

        // Store alert
        this.alerts.unshift(alert);
        this.activeAlerts.set(alert.id, alert);

        // Limit alert history
        if (this.alerts.length > this.config.maxAlerts) {
            this.alerts.pop();
        }

        // Update statistics
        this.updateStats(alert);

        // Emit alert event
        this.emit('alert', alert);

        // Send notifications
        if (this.config.enableNotifications) {
            this.sendNotifications(alert, rule.channels);
        }

        return alert;
    }

    /**
     * Format alert message
     */
    formatMessage(rule, context) {
        let message = `[${rule.severity.toUpperCase()}] ${rule.name}`;

        if (context.platform) {
            message += ` - Platform: ${context.platform}`;
        }

        if (context.errorRate !== undefined) {
            message += ` - Error Rate: ${(context.errorRate * 100).toFixed(1)}%`;
        }

        if (context.avgResponseTime !== undefined) {
            message += ` - Avg Response Time: ${context.avgResponseTime}ms`;
        }

        if (context.heapUsed && context.heapTotal) {
            const usage = ((context.heapUsed / context.heapTotal) * 100).toFixed(1);
            message += ` - Memory: ${usage}%`;
        }

        return message;
    }

    /**
     * Send notifications through channels
     */
    async sendNotifications(alert, channels) {
        for (const channel of channels) {
            try {
                switch (channel) {
                    case 'console':
                        this.sendConsoleNotification(alert);
                        break;
                    case 'file':
                        await this.sendFileNotification(alert);
                        break;
                    case 'webhook':
                        await this.sendWebhookNotification(alert);
                        break;
                    case 'email':
                        await this.sendEmailNotification(alert);
                        break;
                    default:
                        console.warn(`Unknown notification channel: ${channel}`);
                }
            } catch (error) {
                console.error(`Failed to send notification to ${channel}:`, error.message);
            }
        }
    }

    /**
     * Send console notification
     */
    sendConsoleNotification(alert) {
        const color = {
            info: '\x1b[36m',      // Cyan
            warning: '\x1b[33m',   // Yellow
            critical: '\x1b[31m',  // Red
            fatal: '\x1b[41m'      // Red background
        }[alert.severity] || '';

        const reset = '\x1b[0m';

        console.log(`${color}[ALERT] ${alert.message}${reset}`);
        console.log(`  Description: ${alert.description}`);
        console.log(`  Timestamp: ${alert.timestamp}`);
        console.log(`  Context:`, JSON.stringify(alert.context, null, 2));
    }

    /**
     * Send file notification
     */
    async sendFileNotification(alert) {
        const alertPath = path.join(this.config.alertDir, `alert-${Date.now()}.json`);

        try {
            await fs.mkdir(this.config.alertDir, { recursive: true });
            await fs.writeFile(alertPath, JSON.stringify(alert.toJSON(), null, 2));
        } catch (error) {
            console.error('Failed to write alert to file:', error);
        }
    }

    /**
     * Send webhook notification
     */
    async sendWebhookNotification(alert) {
        if (!this.config.webhookUrl) return;

        try {
            const response = await fetch(this.config.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(alert.toJSON())
            });

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to send webhook notification:', error);
        }
    }

    /**
     * Send email notification (placeholder)
     */
    async sendEmailNotification(alert) {
        // Placeholder for email notification
        // Would integrate with email service (SendGrid, SES, etc.)
        console.log('Email notification:', alert.message);
    }

    /**
     * Acknowledge alert
     */
    acknowledgeAlert(alertId, userId = 'system') {
        const alert = this.activeAlerts.get(alertId);
        if (alert) {
            alert.acknowledge(userId);
            this.emit('alert_acknowledged', alert);
        }
    }

    /**
     * Resolve alert
     */
    resolveAlert(alertId) {
        const alert = this.activeAlerts.get(alertId);
        if (alert) {
            alert.resolve();
            this.activeAlerts.delete(alertId);
            this.emit('alert_resolved', alert);
        }
    }

    /**
     * Get active alerts
     */
    getActiveAlerts(filters = {}) {
        let alerts = Array.from(this.activeAlerts.values());

        if (filters.severity) {
            alerts = alerts.filter(a => a.severity === filters.severity);
        }

        if (filters.ruleId) {
            alerts = alerts.filter(a => a.ruleId === filters.ruleId);
        }

        if (filters.state) {
            alerts = alerts.filter(a => a.state === filters.state);
        }

        return alerts;
    }

    /**
     * Get alert history
     */
    getAlertHistory(limit = 100) {
        return this.alerts.slice(0, limit);
    }

    /**
     * Update statistics
     */
    updateStats(alert) {
        this.stats.totalAlerts++;
        this.stats.alertsBySeverity[alert.severity]++;

        const ruleCount = this.stats.alertsByRule.get(alert.ruleId) || 0;
        this.stats.alertsByRule.set(alert.ruleId, ruleCount + 1);
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeAlertsCount: this.activeAlerts.size,
            rulesCount: this.rules.size,
            alertsByRule: Object.fromEntries(this.stats.alertsByRule)
        };
    }

    /**
     * Clear old resolved alerts
     */
    clearOldAlerts(maxAge = 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAge;

        this.alerts = this.alerts.filter(alert => {
            if (alert.state === AlertState.RESOLVED) {
                const resolvedTime = new Date(alert.resolvedAt).getTime();
                return resolvedTime > cutoff;
            }
            return true;
        });
    }

    /**
     * Export alerts to file
     */
    async exportAlerts(filePath) {
        const data = {
            alerts: this.alerts.map(a => a.toJSON()),
            stats: this.getStats(),
            exportedAt: new Date().toISOString()
        };

        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }
}

// Export
module.exports = {
    AlertManager,
    AlertRule,
    Alert,
    AlertSeverity,
    AlertState
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Alert Manager Demo ===\n');

        const alertManager = new AlertManager();

        // Listen to alert events
        alertManager.on('alert', (alert) => {
            console.log('\n--- New Alert ---');
        });

        alertManager.on('alert_acknowledged', (alert) => {
            console.log(`\nAlert acknowledged: ${alert.id}`);
        });

        alertManager.on('alert_resolved', (alert) => {
            console.log(`\nAlert resolved: ${alert.id}`);
        });

        // Test different scenarios
        console.log('Testing alert scenarios...\n');

        // High error rate
        alertManager.evaluate({
            platform: 'claude',
            errorRate: 0.15,
            avgResponseTime: 2000
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Slow response time
        alertManager.evaluate({
            platform: 'chatgpt',
            avgResponseTime: 95000,
            errorRate: 0.05
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // High memory usage
        alertManager.evaluate({
            heapUsed: 900 * 1024 * 1024,
            heapTotal: 1000 * 1024 * 1024,
            cpuUsage: 45
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // High CPU
        alertManager.evaluate({
            cpuUsage: 95,
            heapUsed: 500 * 1024 * 1024,
            heapTotal: 1000 * 1024 * 1024
        });

        // Get active alerts
        console.log('\n\n=== Active Alerts ===');
        const activeAlerts = alertManager.getActiveAlerts();
        console.log(`Total active alerts: ${activeAlerts.length}`);

        for (const alert of activeAlerts) {
            console.log(`\n${alert.severity.toUpperCase()}: ${alert.message}`);
        }

        // Acknowledge an alert
        if (activeAlerts.length > 0) {
            alertManager.acknowledgeAlert(activeAlerts[0].id, 'admin');
        }

        // Get statistics
        console.log('\n\n=== Alert Statistics ===');
        console.log(JSON.stringify(alertManager.getStats(), null, 2));

        console.log('\n✅ Demo complete');
    }

    demo().catch(console.error);
}
