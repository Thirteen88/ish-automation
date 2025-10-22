/**
 * Alert Manager for AI Orchestrator Monitoring Dashboard
 *
 * Manages alert rules, notifications, and integrations
 */

class AlertManager {
    constructor(options = {}) {
        this.options = {
            storageKey: options.storageKey || 'orchestrator_alerts',
            maxAlerts: options.maxAlerts || 100,
            emailEnabled: options.emailEnabled || false,
            slackEnabled: options.slackEnabled || false,
            webhookEnabled: options.webhookEnabled || false,
            emailEndpoint: options.emailEndpoint || '/api/alerts/email',
            slackWebhook: options.slackWebhook || process.env.SLACK_WEBHOOK_URL,
            webhookUrl: options.webhookUrl || '',
            ...options
        };

        // Alert storage
        this.alerts = [];
        this.alertHistory = [];

        // Alert rules
        this.rules = [
            {
                id: 'high-error-rate',
                name: 'High Error Rate',
                description: 'Error rate exceeds threshold',
                severity: 'critical',
                condition: (metrics) => metrics.errorRate > 0.1,
                cooldown: 300000, // 5 minutes
                message: (metrics) => `Error rate at ${(metrics.errorRate * 100).toFixed(1)}% (threshold: 10%)`
            },
            {
                id: 'slow-response',
                name: 'Slow Response Time',
                description: 'Average response time exceeds threshold',
                severity: 'warning',
                condition: (metrics) => metrics.avgResponseTime > 5000,
                cooldown: 300000,
                message: (metrics) => `Average response time at ${(metrics.avgResponseTime / 1000).toFixed(2)}s (threshold: 5s)`
            },
            {
                id: 'platform-unhealthy',
                name: 'Platform Unhealthy',
                description: 'Platform is in unhealthy state',
                severity: 'critical',
                condition: (metrics, platform) => platform && platform.status === 'unhealthy',
                cooldown: 600000, // 10 minutes
                message: (metrics, platform) => `Platform ${platform.name} is unhealthy`
            },
            {
                id: 'platform-degraded',
                name: 'Platform Degraded',
                description: 'Platform is in degraded state',
                severity: 'warning',
                condition: (metrics, platform) => platform && platform.status === 'degraded',
                cooldown: 600000,
                message: (metrics, platform) => `Platform ${platform.name} is degraded`
            },
            {
                id: 'high-cpu',
                name: 'High CPU Usage',
                description: 'CPU usage exceeds threshold',
                severity: 'warning',
                condition: (metrics) => metrics.resources?.cpu > 80,
                cooldown: 300000,
                message: (metrics) => `CPU usage at ${metrics.resources.cpu.toFixed(1)}% (threshold: 80%)`
            },
            {
                id: 'critical-cpu',
                name: 'Critical CPU Usage',
                description: 'CPU usage critically high',
                severity: 'critical',
                condition: (metrics) => metrics.resources?.cpu > 90,
                cooldown: 300000,
                message: (metrics) => `CPU usage critically high at ${metrics.resources.cpu.toFixed(1)}%`
            },
            {
                id: 'high-memory',
                name: 'High Memory Usage',
                description: 'Memory usage exceeds threshold',
                severity: 'warning',
                condition: (metrics) => metrics.resources?.memory > 85,
                cooldown: 300000,
                message: (metrics) => `Memory usage at ${metrics.resources.memory.toFixed(1)}% (threshold: 85%)`
            },
            {
                id: 'critical-memory',
                name: 'Critical Memory Usage',
                description: 'Memory usage critically high',
                severity: 'critical',
                condition: (metrics) => metrics.resources?.memory > 95,
                cooldown: 300000,
                message: (metrics) => `Memory usage critically high at ${metrics.resources.memory.toFixed(1)}%`
            },
            {
                id: 'consecutive-failures',
                name: 'Consecutive Failures',
                description: 'Multiple consecutive query failures',
                severity: 'critical',
                condition: (metrics, platform) => platform && platform.consecutiveFailures >= 5,
                cooldown: 600000,
                message: (metrics, platform) => `Platform ${platform.name} has ${platform.consecutiveFailures} consecutive failures`
            },
            {
                id: 'low-success-rate',
                name: 'Low Success Rate',
                description: 'Platform success rate below threshold',
                severity: 'warning',
                condition: (metrics, platform) => {
                    if (!platform || platform.totalQueries < 10) return false;
                    const successRate = platform.successfulQueries / platform.totalQueries;
                    return successRate < 0.9;
                },
                cooldown: 600000,
                message: (metrics, platform) => {
                    const successRate = ((platform.successfulQueries / platform.totalQueries) * 100).toFixed(1);
                    return `Platform ${platform.name} success rate at ${successRate}% (threshold: 90%)`;
                }
            }
        ];

        // Rule cooldowns (prevent spam)
        this.ruleCooldowns = {};

        // Load from storage
        this.loadFromStorage();
    }

    /**
     * Evaluate alert rules
     */
    evaluateRules(metrics, platforms = []) {
        const triggeredAlerts = [];

        // Evaluate global rules
        this.rules.forEach(rule => {
            if (!rule.condition(metrics)) return;

            if (this.isOnCooldown(rule.id)) return;

            const alert = this.createAlert(rule, metrics);
            triggeredAlerts.push(alert);
            this.addAlert(alert);
            this.setCooldown(rule.id, rule.cooldown);
        });

        // Evaluate platform-specific rules
        platforms.forEach(platform => {
            this.rules.forEach(rule => {
                if (!rule.condition(metrics, platform)) return;

                const ruleId = `${rule.id}-${platform.name}`;
                if (this.isOnCooldown(ruleId)) return;

                const alert = this.createAlert(rule, metrics, platform);
                triggeredAlerts.push(alert);
                this.addAlert(alert);
                this.setCooldown(ruleId, rule.cooldown);
            });
        });

        return triggeredAlerts;
    }

    /**
     * Create alert object
     */
    createAlert(rule, metrics, platform = null) {
        return {
            id: this.generateAlertId(),
            ruleId: rule.id,
            title: rule.name,
            message: rule.message(metrics, platform),
            severity: rule.severity,
            timestamp: Date.now(),
            acknowledged: false,
            platform: platform ? platform.name : null,
            metrics: {
                errorRate: metrics.errorRate,
                avgResponseTime: metrics.avgResponseTime,
                totalQueries: metrics.totalQueries,
                cpu: metrics.resources?.cpu,
                memory: metrics.resources?.memory
            }
        };
    }

    /**
     * Add alert
     */
    addAlert(alert) {
        // Add to active alerts
        this.alerts.unshift(alert);

        // Trim to max size
        if (this.alerts.length > this.options.maxAlerts) {
            this.alerts = this.alerts.slice(0, this.options.maxAlerts);
        }

        // Add to history
        this.alertHistory.unshift(alert);
        if (this.alertHistory.length > this.options.maxAlerts * 2) {
            this.alertHistory = this.alertHistory.slice(0, this.options.maxAlerts * 2);
        }

        // Send notifications
        this.sendNotifications(alert);

        // Save to storage
        this.saveToStorage();

        return alert;
    }

    /**
     * Send notifications
     */
    async sendNotifications(alert) {
        const promises = [];

        // Email notification
        if (this.options.emailEnabled) {
            promises.push(this.sendEmailNotification(alert));
        }

        // Slack notification
        if (this.options.slackEnabled && this.options.slackWebhook) {
            promises.push(this.sendSlackNotification(alert));
        }

        // Webhook notification
        if (this.options.webhookEnabled && this.options.webhookUrl) {
            promises.push(this.sendWebhookNotification(alert));
        }

        try {
            await Promise.allSettled(promises);
        } catch (error) {
            console.error('Failed to send notifications:', error);
        }
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(alert) {
        try {
            const response = await fetch(this.options.emailEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
                    message: alert.message,
                    alert: alert
                })
            });

            if (!response.ok) {
                throw new Error(`Email notification failed: ${response.statusText}`);
            }

            console.log('Email notification sent:', alert.id);
        } catch (error) {
            console.error('Failed to send email notification:', error);
        }
    }

    /**
     * Send Slack notification
     */
    async sendSlackNotification(alert) {
        try {
            const color = alert.severity === 'critical' ? '#ef4444' :
                         alert.severity === 'warning' ? '#f59e0b' :
                         '#3b82f6';

            const payload = {
                attachments: [{
                    color: color,
                    title: alert.title,
                    text: alert.message,
                    fields: [
                        {
                            title: 'Severity',
                            value: alert.severity.toUpperCase(),
                            short: true
                        },
                        {
                            title: 'Time',
                            value: new Date(alert.timestamp).toLocaleString(),
                            short: true
                        }
                    ],
                    footer: 'AI Orchestrator Monitoring',
                    ts: Math.floor(alert.timestamp / 1000)
                }]
            };

            if (alert.platform) {
                payload.attachments[0].fields.push({
                    title: 'Platform',
                    value: alert.platform,
                    short: true
                });
            }

            const response = await fetch(this.options.slackWebhook, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Slack notification failed: ${response.statusText}`);
            }

            console.log('Slack notification sent:', alert.id);
        } catch (error) {
            console.error('Failed to send Slack notification:', error);
        }
    }

    /**
     * Send webhook notification
     */
    async sendWebhookNotification(alert) {
        try {
            const response = await fetch(this.options.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event: 'alert.triggered',
                    alert: alert,
                    timestamp: Date.now()
                })
            });

            if (!response.ok) {
                throw new Error(`Webhook notification failed: ${response.statusText}`);
            }

            console.log('Webhook notification sent:', alert.id);
        } catch (error) {
            console.error('Failed to send webhook notification:', error);
        }
    }

    /**
     * Acknowledge alert
     */
    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = Date.now();
            this.saveToStorage();
        }
        return alert;
    }

    /**
     * Clear alert
     */
    clearAlert(alertId) {
        const index = this.alerts.findIndex(a => a.id === alertId);
        if (index !== -1) {
            const alert = this.alerts.splice(index, 1)[0];
            this.saveToStorage();
            return alert;
        }
        return null;
    }

    /**
     * Clear all alerts
     */
    clearAllAlerts() {
        this.alerts = [];
        this.saveToStorage();
    }

    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return this.alerts.filter(a => !a.acknowledged);
    }

    /**
     * Get recent alerts
     */
    getRecentAlerts(limit = 10) {
        return this.alerts.slice(0, limit);
    }

    /**
     * Get alerts by severity
     */
    getAlertsBySeverity(severity) {
        return this.alerts.filter(a => a.severity === severity);
    }

    /**
     * Get alert history
     */
    getAlertHistory(limit = 50) {
        return this.alertHistory.slice(0, limit);
    }

    /**
     * Get alert statistics
     */
    getAlertStatistics(timeRange = 86400000) { // 24 hours
        const cutoff = Date.now() - timeRange;
        const recentAlerts = this.alertHistory.filter(a => a.timestamp >= cutoff);

        const stats = {
            total: recentAlerts.length,
            critical: recentAlerts.filter(a => a.severity === 'critical').length,
            warning: recentAlerts.filter(a => a.severity === 'warning').length,
            info: recentAlerts.filter(a => a.severity === 'info').length,
            byRule: {},
            byPlatform: {},
            acknowledged: recentAlerts.filter(a => a.acknowledged).length
        };

        // Count by rule
        recentAlerts.forEach(alert => {
            stats.byRule[alert.ruleId] = (stats.byRule[alert.ruleId] || 0) + 1;

            if (alert.platform) {
                stats.byPlatform[alert.platform] = (stats.byPlatform[alert.platform] || 0) + 1;
            }
        });

        return stats;
    }

    /**
     * Check if rule is on cooldown
     */
    isOnCooldown(ruleId) {
        const cooldownEnd = this.ruleCooldowns[ruleId];
        if (!cooldownEnd) return false;

        return Date.now() < cooldownEnd;
    }

    /**
     * Set rule cooldown
     */
    setCooldown(ruleId, duration) {
        this.ruleCooldowns[ruleId] = Date.now() + duration;

        // Cleanup old cooldowns
        setTimeout(() => {
            delete this.ruleCooldowns[ruleId];
        }, duration);
    }

    /**
     * Add custom rule
     */
    addRule(rule) {
        const newRule = {
            id: rule.id || this.generateRuleId(),
            name: rule.name,
            description: rule.description || '',
            severity: rule.severity || 'warning',
            condition: rule.condition,
            cooldown: rule.cooldown || 300000,
            message: rule.message,
            enabled: rule.enabled !== false
        };

        this.rules.push(newRule);
        this.saveRules();

        return newRule;
    }

    /**
     * Update rule
     */
    updateRule(ruleId, updates) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (!rule) return null;

        Object.assign(rule, updates);
        this.saveRules();

        return rule;
    }

    /**
     * Remove rule
     */
    removeRule(ruleId) {
        const index = this.rules.findIndex(r => r.id === ruleId);
        if (index !== -1) {
            const rule = this.rules.splice(index, 1)[0];
            this.saveRules();
            return rule;
        }
        return null;
    }

    /**
     * Enable rule
     */
    enableRule(ruleId) {
        return this.updateRule(ruleId, { enabled: true });
    }

    /**
     * Disable rule
     */
    disableRule(ruleId) {
        return this.updateRule(ruleId, { enabled: false });
    }

    /**
     * Get all rules
     */
    getRules() {
        return this.rules;
    }

    /**
     * Generate alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate rule ID
     */
    generateRuleId() {
        return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Save to storage
     */
    saveToStorage() {
        try {
            const data = {
                alerts: this.alerts,
                alertHistory: this.alertHistory,
                lastUpdated: Date.now()
            };

            localStorage.setItem(this.options.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save alerts to storage:', error);
        }
    }

    /**
     * Load from storage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.options.storageKey);
            if (!stored) return;

            const data = JSON.parse(stored);

            this.alerts = data.alerts || [];
            this.alertHistory = data.alertHistory || [];
        } catch (error) {
            console.error('Failed to load alerts from storage:', error);
        }
    }

    /**
     * Save rules to storage
     */
    saveRules() {
        try {
            const rulesKey = `${this.options.storageKey}_rules`;
            localStorage.setItem(rulesKey, JSON.stringify(this.rules));
        } catch (error) {
            console.error('Failed to save rules to storage:', error);
        }
    }

    /**
     * Load rules from storage
     */
    loadRules() {
        try {
            const rulesKey = `${this.options.storageKey}_rules`;
            const stored = localStorage.getItem(rulesKey);
            if (!stored) return;

            const rules = JSON.parse(stored);
            this.rules = rules;
        } catch (error) {
            console.error('Failed to load rules from storage:', error);
        }
    }

    /**
     * Clear storage
     */
    clearStorage() {
        try {
            localStorage.removeItem(this.options.storageKey);
            localStorage.removeItem(`${this.options.storageKey}_rules`);
        } catch (error) {
            console.error('Failed to clear storage:', error);
        }
    }

    /**
     * Export configuration
     */
    exportConfig() {
        return {
            rules: this.rules,
            options: this.options,
            exportedAt: Date.now()
        };
    }

    /**
     * Import configuration
     */
    importConfig(config) {
        if (config.rules) {
            this.rules = config.rules;
            this.saveRules();
        }

        if (config.options) {
            Object.assign(this.options, config.options);
        }
    }

    /**
     * Test alert notification
     */
    async testNotification(channel = 'all') {
        const testAlert = {
            id: 'test_' + Date.now(),
            ruleId: 'test',
            title: 'Test Alert',
            message: 'This is a test alert notification',
            severity: 'info',
            timestamp: Date.now(),
            acknowledged: false
        };

        if (channel === 'email' || channel === 'all') {
            await this.sendEmailNotification(testAlert);
        }

        if (channel === 'slack' || channel === 'all') {
            await this.sendSlackNotification(testAlert);
        }

        if (channel === 'webhook' || channel === 'all') {
            await this.sendWebhookNotification(testAlert);
        }

        return testAlert;
    }

    /**
     * Get notification configuration
     */
    getNotificationConfig() {
        return {
            email: {
                enabled: this.options.emailEnabled,
                endpoint: this.options.emailEndpoint
            },
            slack: {
                enabled: this.options.slackEnabled,
                webhookConfigured: !!this.options.slackWebhook
            },
            webhook: {
                enabled: this.options.webhookEnabled,
                url: this.options.webhookUrl
            }
        };
    }

    /**
     * Update notification configuration
     */
    updateNotificationConfig(config) {
        if (config.email !== undefined) {
            this.options.emailEnabled = config.email.enabled;
            if (config.email.endpoint) {
                this.options.emailEndpoint = config.email.endpoint;
            }
        }

        if (config.slack !== undefined) {
            this.options.slackEnabled = config.slack.enabled;
            if (config.slack.webhook) {
                this.options.slackWebhook = config.slack.webhook;
            }
        }

        if (config.webhook !== undefined) {
            this.options.webhookEnabled = config.webhook.enabled;
            if (config.webhook.url) {
                this.options.webhookUrl = config.webhook.url;
            }
        }

        this.saveToStorage();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlertManager;
}
