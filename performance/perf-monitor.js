#!/usr/bin/env node

/**
 * Performance Monitor
 *
 * Comprehensive performance monitoring system that tracks response times,
 * throughput, latency, resource usage, and detects bottlenecks.
 * Provides real-time alerts and detailed performance reports.
 *
 * Features:
 * - Response time tracking (p50, p95, p99)
 * - Throughput monitoring (requests/second)
 * - Latency measurement
 * - Resource usage tracking
 * - Bottleneck detection
 * - Performance alerts
 * - Detailed reports and analytics
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class PerformanceMetric {
    constructor(name, value, unit = '', tags = {}) {
        this.name = name;
        this.value = value;
        this.unit = unit;
        this.tags = tags;
        this.timestamp = Date.now();
    }
}

class TimeSeries {
    constructor(maxSize = 1000) {
        this.data = [];
        this.maxSize = maxSize;
    }

    add(value, timestamp = Date.now()) {
        this.data.push({ value, timestamp });

        // Keep only maxSize most recent points
        if (this.data.length > this.maxSize) {
            this.data.shift();
        }
    }

    getValues() {
        return this.data.map(d => d.value);
    }

    getAverage() {
        if (this.data.length === 0) return 0;
        return this.data.reduce((sum, d) => sum + d.value, 0) / this.data.length;
    }

    getMin() {
        if (this.data.length === 0) return 0;
        return Math.min(...this.data.map(d => d.value));
    }

    getMax() {
        if (this.data.length === 0) return 0;
        return Math.max(...this.data.map(d => d.value));
    }

    getPercentile(percentile) {
        if (this.data.length === 0) return 0;

        const sorted = this.data.map(d => d.value).sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    getRecent(count = 10) {
        return this.data.slice(-count);
    }

    clear() {
        this.data = [];
    }
}

class PerformanceMonitor extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            sampleRate: config.sampleRate || 1.0, // Sample 100% of requests
            enableAlerts: config.enableAlerts !== false,
            alertThresholds: {
                responseTime: config.alertResponseTime || 5000, // 5s
                errorRate: config.alertErrorRate || 0.1, // 10%
                throughput: config.alertThroughput || 1, // 1 req/s minimum
                ...config.alertThresholds
            },
            reportInterval: config.reportInterval || 60000, // 1 minute
            maxTimeSeriesSize: config.maxTimeSeriesSize || 1000,
            ...config
        };

        // Time series data
        this.responseTimes = new TimeSeries(this.config.maxTimeSeriesSize);
        this.throughput = new TimeSeries(this.config.maxTimeSeriesSize);
        this.errorRates = new TimeSeries(this.config.maxTimeSeriesSize);
        this.activeRequests = new TimeSeries(this.config.maxTimeSeriesSize);

        // Platform-specific metrics
        this.platformMetrics = new Map();

        // Component metrics
        this.componentMetrics = {
            connectionPool: new TimeSeries(),
            cache: new TimeSeries(),
            batchProcessor: new TimeSeries(),
            loadBalancer: new TimeSeries(),
            queryOptimizer: new TimeSeries()
        };

        // Request tracking
        this.activeRequestsCount = 0;
        this.requestsInWindow = [];
        this.windowSize = 60000; // 1 minute

        // Alerts
        this.alerts = [];
        this.maxAlerts = 100;

        // Bottleneck detection
        this.bottlenecks = [];

        // Overall metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            startTime: Date.now()
        };

        // Timers
        this.reportTimer = null;
        this.cleanupTimer = null;
    }

    startMonitoring() {
        console.log('[PerfMonitor] Starting performance monitoring...');

        // Start periodic reporting
        this.reportTimer = setInterval(() => {
            this.generatePeriodicReport();
        }, this.config.reportInterval);

        // Start cleanup task
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 60000); // Every minute

        this.emit('monitoringStarted');
    }

    stopMonitoring() {
        console.log('[PerfMonitor] Stopping performance monitoring...');

        if (this.reportTimer) {
            clearInterval(this.reportTimer);
            this.reportTimer = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this.emit('monitoringStopped');
    }

    recordRequest(platform, startTime = Date.now()) {
        this.activeRequestsCount++;
        this.metrics.totalRequests++;

        return {
            platform,
            startTime,
            endTime: null,
            duration: null,
            success: null
        };
    }

    recordResponse(requestData, success = true) {
        this.activeRequestsCount--;

        const endTime = Date.now();
        const duration = endTime - requestData.startTime;

        requestData.endTime = endTime;
        requestData.duration = duration;
        requestData.success = success;

        // Update metrics
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }

        this.metrics.totalResponseTime += duration;
        this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, duration);
        this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, duration);

        // Add to time series
        this.responseTimes.add(duration);
        this.activeRequests.add(this.activeRequestsCount);

        // Add to window for throughput calculation
        this.requestsInWindow.push({
            timestamp: endTime,
            duration,
            success,
            platform: requestData.platform
        });

        // Update platform metrics
        this.updatePlatformMetrics(requestData.platform, duration, success);

        // Check for alerts
        if (this.config.enableAlerts) {
            this.checkAlerts(duration, success);
        }

        // Emit event
        this.emit('responseRecorded', requestData);

        return requestData;
    }

    updatePlatformMetrics(platform, duration, success) {
        if (!this.platformMetrics.has(platform)) {
            this.platformMetrics.set(platform, {
                responseTimes: new TimeSeries(),
                requests: 0,
                successful: 0,
                failed: 0,
                totalResponseTime: 0
            });
        }

        const metrics = this.platformMetrics.get(platform);
        metrics.responseTimes.add(duration);
        metrics.requests++;
        metrics.totalResponseTime += duration;

        if (success) {
            metrics.successful++;
        } else {
            metrics.failed++;
        }
    }

    recordComponentMetric(component, metric) {
        if (this.componentMetrics[component]) {
            this.componentMetrics[component].add(metric.value);
        }
    }

    checkAlerts(responseTime, success) {
        const now = Date.now();

        // Response time alert
        if (responseTime > this.config.alertThresholds.responseTime) {
            this.addAlert('high_response_time', {
                message: `Response time ${responseTime}ms exceeds threshold ${this.config.alertThresholds.responseTime}ms`,
                severity: 'warning',
                value: responseTime,
                threshold: this.config.alertThresholds.responseTime
            });
        }

        // Error rate alert
        const errorRate = this.getErrorRate();
        if (errorRate > this.config.alertThresholds.errorRate) {
            this.addAlert('high_error_rate', {
                message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.config.alertThresholds.errorRate * 100).toFixed(2)}%`,
                severity: 'critical',
                value: errorRate,
                threshold: this.config.alertThresholds.errorRate
            });
        }

        // Throughput alert
        const throughput = this.getThroughput();
        if (throughput < this.config.alertThresholds.throughput) {
            this.addAlert('low_throughput', {
                message: `Throughput ${throughput.toFixed(2)} req/s below threshold ${this.config.alertThresholds.throughput} req/s`,
                severity: 'warning',
                value: throughput,
                threshold: this.config.alertThresholds.throughput
            });
        }
    }

    addAlert(type, data) {
        const alert = {
            type,
            timestamp: Date.now(),
            ...data
        };

        this.alerts.push(alert);

        // Keep only recent alerts
        if (this.alerts.length > this.maxAlerts) {
            this.alerts.shift();
        }

        this.emit('alert', alert);
        console.log(`[PerfMonitor] ALERT [${data.severity.toUpperCase()}]: ${data.message}`);
    }

    detectBottlenecks() {
        const bottlenecks = [];

        // Check connection pool
        const poolMetrics = this.componentMetrics.connectionPool;
        if (poolMetrics.data.length > 0) {
            const avgWaitTime = poolMetrics.getAverage();
            if (avgWaitTime > 1000) { // More than 1s wait
                bottlenecks.push({
                    component: 'connectionPool',
                    issue: 'high_wait_time',
                    value: avgWaitTime,
                    recommendation: 'Increase connection pool size'
                });
            }
        }

        // Check cache
        const cacheMetrics = this.componentMetrics.cache;
        if (cacheMetrics.data.length > 0) {
            const hitRate = cacheMetrics.getAverage();
            if (hitRate < 0.5) { // Less than 50% hit rate
                bottlenecks.push({
                    component: 'cache',
                    issue: 'low_hit_rate',
                    value: hitRate,
                    recommendation: 'Increase cache size or improve cache warming strategy'
                });
            }
        }

        // Check response times
        const p95ResponseTime = this.responseTimes.getPercentile(95);
        if (p95ResponseTime > 3000) { // P95 > 3s
            bottlenecks.push({
                component: 'responseTime',
                issue: 'high_p95_latency',
                value: p95ResponseTime,
                recommendation: 'Investigate slow queries or platform performance'
            });
        }

        // Check error rate
        const errorRate = this.getErrorRate();
        if (errorRate > 0.05) { // More than 5% errors
            bottlenecks.push({
                component: 'errorHandling',
                issue: 'high_error_rate',
                value: errorRate,
                recommendation: 'Review error logs and improve error handling'
            });
        }

        this.bottlenecks = bottlenecks;

        if (bottlenecks.length > 0) {
            console.log(`[PerfMonitor] Detected ${bottlenecks.length} bottlenecks`);
            this.emit('bottlenecksDetected', bottlenecks);
        }

        return bottlenecks;
    }

    getThroughput() {
        // Calculate requests per second in the last minute
        const now = Date.now();
        const oneMinuteAgo = now - this.windowSize;

        const recentRequests = this.requestsInWindow.filter(r => r.timestamp > oneMinuteAgo);
        return recentRequests.length / (this.windowSize / 1000);
    }

    getErrorRate() {
        const recentRequests = this.requestsInWindow.slice(-100); // Last 100 requests
        if (recentRequests.length === 0) return 0;

        const errors = recentRequests.filter(r => !r.success).length;
        return errors / recentRequests.length;
    }

    cleanup() {
        // Clean up old requests from window
        const now = Date.now();
        const cutoff = now - this.windowSize;

        this.requestsInWindow = this.requestsInWindow.filter(r => r.timestamp > cutoff);
    }

    generatePeriodicReport() {
        console.log('[PerfMonitor] Generating periodic performance report...');

        const report = this.getReport();

        // Detect bottlenecks
        this.detectBottlenecks();

        this.emit('periodicReport', report);
    }

    getReport() {
        const uptime = Date.now() - this.metrics.startTime;
        const avgResponseTime = this.metrics.successfulRequests > 0
            ? this.metrics.totalResponseTime / this.metrics.successfulRequests
            : 0;

        const report = {
            summary: {
                uptime: `${(uptime / 1000 / 60).toFixed(2)} minutes`,
                totalRequests: this.metrics.totalRequests,
                successfulRequests: this.metrics.successfulRequests,
                failedRequests: this.metrics.failedRequests,
                successRate: `${((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(2)}%`,
                activeRequests: this.activeRequestsCount
            },
            performance: {
                throughput: `${this.getThroughput().toFixed(2)} req/s`,
                averageResponseTime: `${avgResponseTime.toFixed(0)}ms`,
                minResponseTime: `${this.metrics.minResponseTime === Infinity ? 0 : this.metrics.minResponseTime}ms`,
                maxResponseTime: `${this.metrics.maxResponseTime}ms`,
                p50ResponseTime: `${this.responseTimes.getPercentile(50).toFixed(0)}ms`,
                p95ResponseTime: `${this.responseTimes.getPercentile(95).toFixed(0)}ms`,
                p99ResponseTime: `${this.responseTimes.getPercentile(99).toFixed(0)}ms`,
                errorRate: `${(this.getErrorRate() * 100).toFixed(2)}%`
            },
            platforms: this.getPlatformReport(),
            components: this.getComponentReport(),
            alerts: {
                total: this.alerts.length,
                recent: this.alerts.slice(-10)
            },
            bottlenecks: this.bottlenecks,
            timestamp: new Date().toISOString()
        };

        return report;
    }

    getPlatformReport() {
        const platformReport = {};

        for (const [platform, metrics] of this.platformMetrics) {
            const avgResponseTime = metrics.requests > 0
                ? metrics.totalResponseTime / metrics.requests
                : 0;

            platformReport[platform] = {
                requests: metrics.requests,
                successful: metrics.successful,
                failed: metrics.failed,
                successRate: `${((metrics.successful / metrics.requests) * 100).toFixed(2)}%`,
                averageResponseTime: `${avgResponseTime.toFixed(0)}ms`,
                p95ResponseTime: `${metrics.responseTimes.getPercentile(95).toFixed(0)}ms`
            };
        }

        return platformReport;
    }

    getComponentReport() {
        const componentReport = {};

        for (const [component, timeSeries] of Object.entries(this.componentMetrics)) {
            if (timeSeries.data.length > 0) {
                componentReport[component] = {
                    average: timeSeries.getAverage().toFixed(2),
                    min: timeSeries.getMin().toFixed(2),
                    max: timeSeries.getMax().toFixed(2),
                    dataPoints: timeSeries.data.length
                };
            }
        }

        return componentReport;
    }

    async exportReport(filename = null) {
        const report = this.getReport();
        const filepath = filename || `/home/gary/ish-automation/performance/reports/perf-report-${Date.now()}.json`;

        try {
            await fs.mkdir(path.dirname(filepath), { recursive: true });
            await fs.writeFile(filepath, JSON.stringify(report, null, 2));
            console.log(`[PerfMonitor] Report exported to: ${filepath}`);
            return filepath;
        } catch (error) {
            console.error('[PerfMonitor] Failed to export report:', error.message);
            throw error;
        }
    }

    reset() {
        console.log('[PerfMonitor] Resetting performance metrics...');

        this.responseTimes.clear();
        this.throughput.clear();
        this.errorRates.clear();
        this.activeRequests.clear();

        this.platformMetrics.clear();

        for (const timeSeries of Object.values(this.componentMetrics)) {
            timeSeries.clear();
        }

        this.requestsInWindow = [];
        this.alerts = [];
        this.bottlenecks = [];

        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            startTime: Date.now()
        };

        this.emit('reset');
    }

    async shutdown() {
        console.log('[PerfMonitor] Shutting down performance monitor...');

        this.stopMonitoring();

        // Export final report
        await this.exportReport();

        this.emit('shutdown', this.getReport());
        console.log('[PerfMonitor] Performance monitor shut down successfully');
    }
}

module.exports = { PerformanceMonitor, PerformanceMetric, TimeSeries };

// Demo
if (require.main === module) {
    async function demo() {
        const monitor = new PerformanceMonitor({
            reportInterval: 10000, // 10 seconds
            enableAlerts: true,
            alertThresholds: {
                responseTime: 2000,
                errorRate: 0.1
            }
        });

        // Listen to events
        monitor.on('alert', (alert) => {
            console.log(`\n🚨 ALERT [${alert.severity}]: ${alert.message}\n`);
        });

        monitor.on('bottlenecksDetected', (bottlenecks) => {
            console.log(`\n⚠️  Bottlenecks detected:`);
            bottlenecks.forEach(b => {
                console.log(`  - ${b.component}: ${b.issue} (${b.value})`);
                console.log(`    Recommendation: ${b.recommendation}`);
            });
            console.log();
        });

        monitor.startMonitoring();

        console.log('=== Simulating requests ===\n');

        // Simulate various requests
        const platforms = ['huggingchat', 'claude', 'chatgpt', 'gemini'];

        for (let i = 0; i < 50; i++) {
            const platform = platforms[Math.floor(Math.random() * platforms.length)];
            const requestData = monitor.recordRequest(platform);

            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 500));

            // 90% success rate
            const success = Math.random() > 0.1;
            monitor.recordResponse(requestData, success);

            console.log(`Request ${i + 1}/50: ${platform} - ${success ? 'success' : 'failed'} (${requestData.duration}ms)`);

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('\n=== Performance Report ===\n');
        const report = monitor.getReport();
        console.log(JSON.stringify(report, null, 2));

        console.log('\n=== Detecting Bottlenecks ===\n');
        const bottlenecks = monitor.detectBottlenecks();
        console.log(`Found ${bottlenecks.length} bottlenecks`);

        await monitor.shutdown();
    }

    demo().catch(console.error);
}
