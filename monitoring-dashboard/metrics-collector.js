/**
 * Metrics Collector for AI Orchestrator Monitoring Dashboard
 *
 * Collects, stores, and aggregates metrics from all system components
 */

class MetricsCollector {
    constructor(options = {}) {
        this.options = {
            storageKey: options.storageKey || 'orchestrator_metrics',
            maxDataPoints: options.maxDataPoints || 1440, // 24 hours at 1-minute intervals
            aggregationInterval: options.aggregationInterval || 60000, // 1 minute
            retentionPeriod: options.retentionPeriod || 86400000, // 24 hours
            ...options
        };

        // Time-series data storage
        this.timeSeries = {
            responseTime: [],
            errorRate: [],
            queryVolume: [],
            platformMetrics: {},
            systemResources: []
        };

        // Current metrics snapshot
        this.currentMetrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            avgResponseTime: 0,
            errorRate: 0,
            platforms: {},
            resources: {
                cpu: 0,
                memory: 0,
                network: 0,
                disk: 0
            },
            uptime: 0,
            requestsPerSecond: 0
        };

        // Performance baselines
        this.baselines = {
            responseTime: {
                p50: 2000, // 2 seconds
                p95: 5000, // 5 seconds
                p99: 10000 // 10 seconds
            },
            errorRate: {
                warning: 0.05, // 5%
                critical: 0.1 // 10%
            },
            resources: {
                cpu: {
                    warning: 70,
                    critical: 90
                },
                memory: {
                    warning: 80,
                    critical: 95
                },
                disk: {
                    warning: 80,
                    critical: 90
                }
            }
        };

        // Alert thresholds
        this.thresholds = {
            responseTime: {
                warning: 5000, // 5 seconds
                critical: 10000 // 10 seconds
            },
            errorRate: {
                warning: 0.1, // 10%
                critical: 0.25 // 25%
            },
            consecutiveFailures: {
                warning: 3,
                critical: 5
            },
            platformDowntime: {
                warning: 300000, // 5 minutes
                critical: 900000 // 15 minutes
            }
        };

        // Aggregation state
        this.aggregationBuffer = [];
        this.lastAggregation = Date.now();

        // Initialize from storage
        this.loadFromStorage();

        // Start aggregation
        this.startAggregation();
    }

    /**
     * Record a query event
     */
    recordQuery(queryData) {
        const timestamp = Date.now();

        // Update current metrics
        this.currentMetrics.totalQueries++;

        if (queryData.success) {
            this.currentMetrics.successfulQueries++;
        } else {
            this.currentMetrics.failedQueries++;
        }

        // Calculate error rate
        this.currentMetrics.errorRate =
            this.currentMetrics.failedQueries / this.currentMetrics.totalQueries;

        // Update response time
        if (queryData.responseTime) {
            const totalTime =
                this.currentMetrics.avgResponseTime * (this.currentMetrics.totalQueries - 1) +
                queryData.responseTime;
            this.currentMetrics.avgResponseTime =
                totalTime / this.currentMetrics.totalQueries;
        }

        // Add to aggregation buffer
        this.aggregationBuffer.push({
            timestamp,
            type: 'query',
            data: queryData
        });

        // Record platform-specific metrics
        if (queryData.platform) {
            this.recordPlatformMetric(queryData.platform, queryData);
        }

        // Persist to storage
        this.saveToStorage();

        return this.currentMetrics;
    }

    /**
     * Record platform-specific metrics
     */
    recordPlatformMetric(platform, data) {
        if (!this.currentMetrics.platforms[platform]) {
            this.currentMetrics.platforms[platform] = {
                name: platform,
                status: 'healthy',
                totalQueries: 0,
                successfulQueries: 0,
                failedQueries: 0,
                avgResponseTime: 0,
                errorRate: 0,
                consecutiveFailures: 0,
                lastSuccess: null,
                lastFailure: null,
                uptime: 0,
                lastChecked: Date.now()
            };
        }

        const platformMetrics = this.currentMetrics.platforms[platform];
        platformMetrics.totalQueries++;
        platformMetrics.lastChecked = Date.now();

        if (data.success) {
            platformMetrics.successfulQueries++;
            platformMetrics.consecutiveFailures = 0;
            platformMetrics.lastSuccess = Date.now();
        } else {
            platformMetrics.failedQueries++;
            platformMetrics.consecutiveFailures++;
            platformMetrics.lastFailure = Date.now();
        }

        // Update error rate
        platformMetrics.errorRate =
            platformMetrics.failedQueries / platformMetrics.totalQueries;

        // Update average response time
        if (data.responseTime) {
            const totalTime =
                platformMetrics.avgResponseTime * (platformMetrics.totalQueries - 1) +
                data.responseTime;
            platformMetrics.avgResponseTime = totalTime / platformMetrics.totalQueries;
        }

        // Update platform status
        platformMetrics.status = this.calculatePlatformStatus(platformMetrics);

        // Store in time-series
        if (!this.timeSeries.platformMetrics[platform]) {
            this.timeSeries.platformMetrics[platform] = [];
        }

        this.timeSeries.platformMetrics[platform].push({
            timestamp: Date.now(),
            responseTime: data.responseTime,
            success: data.success,
            errorRate: platformMetrics.errorRate
        });

        // Trim old data
        this.trimTimeSeries(this.timeSeries.platformMetrics[platform]);
    }

    /**
     * Calculate platform health status
     */
    calculatePlatformStatus(metrics) {
        // Disabled check
        if (metrics.enabled === false) {
            return 'disabled';
        }

        // Consecutive failures check
        if (metrics.consecutiveFailures >= this.thresholds.consecutiveFailures.critical) {
            return 'unhealthy';
        }

        if (metrics.consecutiveFailures >= this.thresholds.consecutiveFailures.warning) {
            return 'degraded';
        }

        // Error rate check
        if (metrics.errorRate >= this.thresholds.errorRate.critical) {
            return 'unhealthy';
        }

        if (metrics.errorRate >= this.thresholds.errorRate.warning) {
            return 'degraded';
        }

        // Response time check
        if (metrics.avgResponseTime >= this.thresholds.responseTime.critical) {
            return 'unhealthy';
        }

        if (metrics.avgResponseTime >= this.thresholds.responseTime.warning) {
            return 'degraded';
        }

        // Downtime check
        if (metrics.lastSuccess) {
            const downtime = Date.now() - metrics.lastSuccess;

            if (downtime >= this.thresholds.platformDowntime.critical) {
                return 'unhealthy';
            }

            if (downtime >= this.thresholds.platformDowntime.warning) {
                return 'degraded';
            }
        }

        return 'healthy';
    }

    /**
     * Record system resource metrics
     */
    recordResources(resourceData) {
        this.currentMetrics.resources = {
            cpu: resourceData.cpu || 0,
            memory: resourceData.memory || 0,
            network: resourceData.network || 0,
            disk: resourceData.disk || 0,
            uptime: resourceData.uptime || 0,
            requestsPerSecond: resourceData.requestsPerSecond || 0
        };

        // Add to time-series
        this.timeSeries.systemResources.push({
            timestamp: Date.now(),
            ...resourceData
        });

        // Trim old data
        this.trimTimeSeries(this.timeSeries.systemResources);

        // Persist to storage
        this.saveToStorage();

        return this.currentMetrics.resources;
    }

    /**
     * Perform aggregation
     */
    aggregate() {
        const now = Date.now();
        const timeSinceLastAggregation = now - this.lastAggregation;

        if (timeSinceLastAggregation < this.options.aggregationInterval) {
            return;
        }

        // Aggregate response times
        const responseTimes = this.aggregationBuffer
            .filter(event => event.type === 'query' && event.data.responseTime)
            .map(event => event.data.responseTime);

        if (responseTimes.length > 0) {
            const avgResponseTime =
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

            this.timeSeries.responseTime.push({
                timestamp: now,
                value: avgResponseTime,
                min: Math.min(...responseTimes),
                max: Math.max(...responseTimes),
                count: responseTimes.length
            });

            this.trimTimeSeries(this.timeSeries.responseTime);
        }

        // Aggregate error rates
        const totalQueries = this.aggregationBuffer.filter(e => e.type === 'query').length;
        const failedQueries = this.aggregationBuffer.filter(
            e => e.type === 'query' && !e.data.success
        ).length;

        if (totalQueries > 0) {
            this.timeSeries.errorRate.push({
                timestamp: now,
                value: failedQueries / totalQueries,
                failed: failedQueries,
                total: totalQueries
            });

            this.trimTimeSeries(this.timeSeries.errorRate);
        }

        // Aggregate query volume
        this.timeSeries.queryVolume.push({
            timestamp: now,
            value: totalQueries
        });

        this.trimTimeSeries(this.timeSeries.queryVolume);

        // Clear aggregation buffer
        this.aggregationBuffer = [];
        this.lastAggregation = now;

        // Persist to storage
        this.saveToStorage();
    }

    /**
     * Get time-series data for a specific metric
     */
    getTimeSeries(metric, timeRange = 3600000) { // Default 1 hour
        const now = Date.now();
        const cutoff = now - timeRange;

        const data = this.timeSeries[metric] || [];
        return data.filter(point => point.timestamp >= cutoff);
    }

    /**
     * Get platform-specific time-series
     */
    getPlatformTimeSeries(platform, timeRange = 3600000) {
        const now = Date.now();
        const cutoff = now - timeRange;

        const data = this.timeSeries.platformMetrics[platform] || [];
        return data.filter(point => point.timestamp >= cutoff);
    }

    /**
     * Get current metrics snapshot
     */
    getCurrentMetrics() {
        return {
            ...this.currentMetrics,
            timestamp: Date.now()
        };
    }

    /**
     * Get platform metrics
     */
    getPlatformMetrics(platform) {
        return this.currentMetrics.platforms[platform] || null;
    }

    /**
     * Get all platform metrics
     */
    getAllPlatformMetrics() {
        return Object.values(this.currentMetrics.platforms);
    }

    /**
     * Calculate percentiles
     */
    calculatePercentiles(values, percentiles = [50, 95, 99]) {
        if (values.length === 0) return {};

        const sorted = [...values].sort((a, b) => a - b);
        const result = {};

        percentiles.forEach(p => {
            const index = Math.ceil((p / 100) * sorted.length) - 1;
            result[`p${p}`] = sorted[Math.max(0, index)];
        });

        return result;
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats(timeRange = 3600000) {
        const responseTimes = this.getTimeSeries('responseTime', timeRange);
        const errorRates = this.getTimeSeries('errorRate', timeRange);
        const queryVolumes = this.getTimeSeries('queryVolume', timeRange);

        // Extract values
        const responseTimeValues = responseTimes.map(d => d.value);
        const errorRateValues = errorRates.map(d => d.value);
        const totalQueries = queryVolumes.reduce((sum, d) => sum + d.value, 0);

        return {
            responseTime: {
                avg: responseTimeValues.reduce((a, b) => a + b, 0) / responseTimeValues.length || 0,
                percentiles: this.calculatePercentiles(responseTimeValues),
                trend: this.calculateTrend(responseTimeValues)
            },
            errorRate: {
                avg: errorRateValues.reduce((a, b) => a + b, 0) / errorRateValues.length || 0,
                trend: this.calculateTrend(errorRateValues)
            },
            queryVolume: {
                total: totalQueries,
                trend: this.calculateTrend(queryVolumes.map(d => d.value))
            },
            timeRange: timeRange,
            timestamp: Date.now()
        };
    }

    /**
     * Calculate trend (positive or negative change)
     */
    calculateTrend(values) {
        if (values.length < 2) return 0;

        const half = Math.floor(values.length / 2);
        const firstHalf = values.slice(0, half);
        const secondHalf = values.slice(half);

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        if (firstAvg === 0) return 0;

        return ((secondAvg - firstAvg) / firstAvg) * 100;
    }

    /**
     * Check if metric exceeds threshold
     */
    checkThreshold(metric, value) {
        const threshold = this.thresholds[metric];
        if (!threshold) return 'normal';

        if (value >= threshold.critical) return 'critical';
        if (value >= threshold.warning) return 'warning';

        return 'normal';
    }

    /**
     * Get baseline comparison
     */
    compareToBaseline(metric, value) {
        const baseline = this.baselines[metric];
        if (!baseline) return null;

        return {
            value,
            baseline,
            deviation: this.calculateDeviation(value, baseline),
            status: this.checkThreshold(metric, value)
        };
    }

    /**
     * Calculate deviation from baseline
     */
    calculateDeviation(value, baseline) {
        if (typeof baseline === 'object' && baseline.p50) {
            const deviation = ((value - baseline.p50) / baseline.p50) * 100;
            return {
                percentage: deviation,
                p50: baseline.p50,
                p95: baseline.p95,
                p99: baseline.p99
            };
        }

        return null;
    }

    /**
     * Trim time-series data to max size
     */
    trimTimeSeries(series) {
        if (series.length > this.options.maxDataPoints) {
            series.splice(0, series.length - this.options.maxDataPoints);
        }
    }

    /**
     * Start aggregation interval
     */
    startAggregation() {
        this.aggregationTimer = setInterval(() => {
            this.aggregate();
        }, this.options.aggregationInterval);
    }

    /**
     * Stop aggregation
     */
    stopAggregation() {
        if (this.aggregationTimer) {
            clearInterval(this.aggregationTimer);
            this.aggregationTimer = null;
        }
    }

    /**
     * Save metrics to localStorage
     */
    saveToStorage() {
        try {
            const data = {
                timeSeries: this.timeSeries,
                currentMetrics: this.currentMetrics,
                lastUpdated: Date.now()
            };

            localStorage.setItem(this.options.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save metrics to storage:', error);
        }
    }

    /**
     * Load metrics from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.options.storageKey);
            if (!stored) return;

            const data = JSON.parse(stored);

            // Check if data is not too old
            const age = Date.now() - (data.lastUpdated || 0);
            if (age > this.options.retentionPeriod) {
                this.clearStorage();
                return;
            }

            this.timeSeries = data.timeSeries || this.timeSeries;
            this.currentMetrics = data.currentMetrics || this.currentMetrics;
        } catch (error) {
            console.error('Failed to load metrics from storage:', error);
            this.clearStorage();
        }
    }

    /**
     * Clear storage
     */
    clearStorage() {
        try {
            localStorage.removeItem(this.options.storageKey);
        } catch (error) {
            console.error('Failed to clear storage:', error);
        }
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.timeSeries = {
            responseTime: [],
            errorRate: [],
            queryVolume: [],
            platformMetrics: {},
            systemResources: []
        };

        this.currentMetrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            avgResponseTime: 0,
            errorRate: 0,
            platforms: {},
            resources: {
                cpu: 0,
                memory: 0,
                network: 0,
                disk: 0
            },
            uptime: 0,
            requestsPerSecond: 0
        };

        this.aggregationBuffer = [];
        this.clearStorage();
    }

    /**
     * Export metrics data
     */
    exportData() {
        return {
            timeSeries: this.timeSeries,
            currentMetrics: this.currentMetrics,
            baselines: this.baselines,
            thresholds: this.thresholds,
            exportedAt: Date.now()
        };
    }

    /**
     * Import metrics data
     */
    importData(data) {
        if (data.timeSeries) {
            this.timeSeries = data.timeSeries;
        }

        if (data.currentMetrics) {
            this.currentMetrics = data.currentMetrics;
        }

        if (data.baselines) {
            this.baselines = data.baselines;
        }

        if (data.thresholds) {
            this.thresholds = data.thresholds;
        }

        this.saveToStorage();
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopAggregation();
        this.saveToStorage();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetricsCollector;
}
