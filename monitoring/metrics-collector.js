#!/usr/bin/env node

/**
 * Metrics Collection System for ISH Automation
 *
 * Features:
 * - Real-time metrics collection and aggregation
 * - Platform-specific performance tracking
 * - Response time percentiles (p50, p95, p99)
 * - Success/failure rates with trending
 * - Selector hit rates (first try vs fallback)
 * - WebSocket connection stability
 * - Memory and CPU usage monitoring
 * - Queue metrics and processing times
 * - Time-series data retention
 * - Metrics export for Prometheus/Grafana
 */

const EventEmitter = require('events');
const os = require('os');

/**
 * Metric Types
 */
const MetricTypes = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    SUMMARY: 'summary'
};

/**
 * Time Window for aggregations
 */
const TimeWindows = {
    MINUTE: 60 * 1000,
    FIVE_MINUTES: 5 * 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000
};

/**
 * Counter Metric
 */
class Counter {
    constructor(name, description, labels = []) {
        this.name = name;
        this.description = description;
        this.labels = labels;
        this.values = new Map();
    }

    inc(labelValues = {}, value = 1) {
        const key = this.getLabelKey(labelValues);
        const current = this.values.get(key) || 0;
        this.values.set(key, current + value);
    }

    get(labelValues = {}) {
        const key = this.getLabelKey(labelValues);
        return this.values.get(key) || 0;
    }

    reset(labelValues = {}) {
        if (Object.keys(labelValues).length === 0) {
            this.values.clear();
        } else {
            const key = this.getLabelKey(labelValues);
            this.values.delete(key);
        }
    }

    getLabelKey(labelValues) {
        return JSON.stringify(labelValues);
    }

    toJSON() {
        const result = [];
        for (const [key, value] of this.values) {
            result.push({
                labels: JSON.parse(key),
                value
            });
        }
        return result;
    }
}

/**
 * Gauge Metric
 */
class Gauge {
    constructor(name, description, labels = []) {
        this.name = name;
        this.description = description;
        this.labels = labels;
        this.values = new Map();
    }

    set(labelValues = {}, value) {
        const key = this.getLabelKey(labelValues);
        this.values.set(key, value);
    }

    inc(labelValues = {}, value = 1) {
        const key = this.getLabelKey(labelValues);
        const current = this.values.get(key) || 0;
        this.values.set(key, current + value);
    }

    dec(labelValues = {}, value = 1) {
        this.inc(labelValues, -value);
    }

    get(labelValues = {}) {
        const key = this.getLabelKey(labelValues);
        return this.values.get(key) || 0;
    }

    getLabelKey(labelValues) {
        return JSON.stringify(labelValues);
    }

    toJSON() {
        const result = [];
        for (const [key, value] of this.values) {
            result.push({
                labels: JSON.parse(key),
                value
            });
        }
        return result;
    }
}

/**
 * Histogram Metric (for response times, etc.)
 */
class Histogram {
    constructor(name, description, labels = [], buckets = null) {
        this.name = name;
        this.description = description;
        this.labels = labels;
        this.buckets = buckets || [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
        this.observations = new Map();
    }

    observe(labelValues = {}, value) {
        const key = this.getLabelKey(labelValues);
        const obs = this.observations.get(key) || {
            count: 0,
            sum: 0,
            values: [],
            buckets: new Map()
        };

        obs.count++;
        obs.sum += value;
        obs.values.push(value);

        // Update buckets
        for (const bucket of this.buckets) {
            if (value <= bucket) {
                obs.buckets.set(bucket, (obs.buckets.get(bucket) || 0) + 1);
            }
        }

        this.observations.set(key, obs);
    }

    getPercentile(labelValues = {}, percentile) {
        const key = this.getLabelKey(labelValues);
        const obs = this.observations.get(key);
        if (!obs || obs.values.length === 0) return 0;

        const sorted = [...obs.values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }

    getAverage(labelValues = {}) {
        const key = this.getLabelKey(labelValues);
        const obs = this.observations.get(key);
        if (!obs || obs.count === 0) return 0;
        return obs.sum / obs.count;
    }

    getCount(labelValues = {}) {
        const key = this.getLabelKey(labelValues);
        const obs = this.observations.get(key);
        return obs ? obs.count : 0;
    }

    getLabelKey(labelValues) {
        return JSON.stringify(labelValues);
    }

    toJSON() {
        const result = [];
        for (const [key, obs] of this.observations) {
            result.push({
                labels: JSON.parse(key),
                count: obs.count,
                sum: obs.sum,
                average: obs.count > 0 ? obs.sum / obs.count : 0,
                p50: this.getPercentile(JSON.parse(key), 50),
                p95: this.getPercentile(JSON.parse(key), 95),
                p99: this.getPercentile(JSON.parse(key), 99)
            });
        }
        return result;
    }
}

/**
 * Metrics Collector
 */
class MetricsCollector extends EventEmitter {
    constructor(options = {}) {
        super();

        this.config = {
            enableSystemMetrics: options.enableSystemMetrics !== false,
            systemMetricsInterval: options.systemMetricsInterval || 5000,
            retentionPeriod: options.retentionPeriod || TimeWindows.HOUR,
            ...options
        };

        // Metrics registry
        this.metrics = new Map();

        // Time-series data
        this.timeSeries = [];
        this.maxTimeSeriesSize = 1000;

        // Initialize default metrics
        this.initializeMetrics();

        // Start system metrics collection
        if (this.config.enableSystemMetrics) {
            this.startSystemMetrics();
        }
    }

    /**
     * Initialize default metrics
     */
    initializeMetrics() {
        // Query metrics
        this.registerMetric(new Counter(
            'queries_total',
            'Total number of queries submitted',
            ['platform', 'status']
        ));

        this.registerMetric(new Histogram(
            'query_duration_ms',
            'Query response time in milliseconds',
            ['platform']
        ));

        this.registerMetric(new Counter(
            'query_errors_total',
            'Total number of query errors',
            ['platform', 'error_type']
        ));

        // Selector metrics
        this.registerMetric(new Counter(
            'selector_attempts_total',
            'Total selector match attempts',
            ['platform', 'selector_type', 'result']
        ));

        // WebSocket metrics
        this.registerMetric(new Gauge(
            'websocket_connections',
            'Current number of WebSocket connections',
            []
        ));

        this.registerMetric(new Counter(
            'websocket_messages_total',
            'Total WebSocket messages sent/received',
            ['direction', 'type']
        ));

        // Queue metrics
        this.registerMetric(new Gauge(
            'queue_size',
            'Current size of request queue',
            ['queue_type']
        ));

        this.registerMetric(new Histogram(
            'queue_wait_time_ms',
            'Time requests spend in queue',
            ['queue_type']
        ));

        // System metrics
        this.registerMetric(new Gauge(
            'system_memory_usage_bytes',
            'System memory usage in bytes',
            ['type']
        ));

        this.registerMetric(new Gauge(
            'system_cpu_usage_percent',
            'System CPU usage percentage',
            []
        ));

        // Platform health metrics
        this.registerMetric(new Gauge(
            'platform_health_status',
            'Platform health status (1=healthy, 0.5=degraded, 0=unhealthy)',
            ['platform']
        ));

        this.registerMetric(new Counter(
            'platform_health_checks_total',
            'Total platform health checks',
            ['platform', 'status']
        ));
    }

    /**
     * Register a metric
     */
    registerMetric(metric) {
        this.metrics.set(metric.name, metric);
    }

    /**
     * Get a metric
     */
    getMetric(name) {
        return this.metrics.get(name);
    }

    /**
     * Record query start
     */
    recordQueryStart(platform, queryId) {
        this.getMetric('queries_total').inc({ platform, status: 'started' });

        this.emit('metric', {
            type: 'query_start',
            platform,
            queryId,
            timestamp: Date.now()
        });
    }

    /**
     * Record query completion
     */
    recordQueryComplete(platform, queryId, duration, success = true) {
        const status = success ? 'success' : 'failure';

        this.getMetric('queries_total').inc({ platform, status });
        this.getMetric('query_duration_ms').observe({ platform }, duration);

        // Add to time series
        this.addTimeSeriesPoint({
            timestamp: Date.now(),
            platform,
            queryId,
            duration,
            success
        });

        this.emit('metric', {
            type: 'query_complete',
            platform,
            queryId,
            duration,
            success,
            timestamp: Date.now()
        });
    }

    /**
     * Record query error
     */
    recordQueryError(platform, queryId, errorType, duration) {
        this.getMetric('query_errors_total').inc({ platform, error_type: errorType });
        this.recordQueryComplete(platform, queryId, duration, false);

        this.emit('metric', {
            type: 'query_error',
            platform,
            queryId,
            errorType,
            duration,
            timestamp: Date.now()
        });
    }

    /**
     * Record selector attempt
     */
    recordSelectorAttempt(platform, selectorType, success) {
        const result = success ? 'hit' : 'miss';
        this.getMetric('selector_attempts_total').inc({ platform, selector_type: selectorType, result });

        this.emit('metric', {
            type: 'selector_attempt',
            platform,
            selectorType,
            success,
            timestamp: Date.now()
        });
    }

    /**
     * Record WebSocket connection change
     */
    recordWebSocketConnection(delta) {
        this.getMetric('websocket_connections').inc({}, delta);

        this.emit('metric', {
            type: 'websocket_connection',
            delta,
            current: this.getMetric('websocket_connections').get({}),
            timestamp: Date.now()
        });
    }

    /**
     * Record WebSocket message
     */
    recordWebSocketMessage(direction, messageType) {
        this.getMetric('websocket_messages_total').inc({ direction, type: messageType });

        this.emit('metric', {
            type: 'websocket_message',
            direction,
            messageType,
            timestamp: Date.now()
        });
    }

    /**
     * Record queue size
     */
    recordQueueSize(queueType, size) {
        this.getMetric('queue_size').set({ queue_type: queueType }, size);

        this.emit('metric', {
            type: 'queue_size',
            queueType,
            size,
            timestamp: Date.now()
        });
    }

    /**
     * Record queue wait time
     */
    recordQueueWaitTime(queueType, waitTime) {
        this.getMetric('queue_wait_time_ms').observe({ queue_type: queueType }, waitTime);

        this.emit('metric', {
            type: 'queue_wait_time',
            queueType,
            waitTime,
            timestamp: Date.now()
        });
    }

    /**
     * Record platform health
     */
    recordPlatformHealth(platform, status) {
        const statusValue = status === 'healthy' ? 1 : status === 'degraded' ? 0.5 : 0;
        this.getMetric('platform_health_status').set({ platform }, statusValue);
        this.getMetric('platform_health_checks_total').inc({ platform, status });

        this.emit('metric', {
            type: 'platform_health',
            platform,
            status,
            timestamp: Date.now()
        });
    }

    /**
     * Add time series data point
     */
    addTimeSeriesPoint(data) {
        this.timeSeries.push(data);

        // Limit size
        if (this.timeSeries.length > this.maxTimeSeriesSize) {
            this.timeSeries.shift();
        }

        // Remove old data
        const cutoff = Date.now() - this.config.retentionPeriod;
        this.timeSeries = this.timeSeries.filter(point => point.timestamp > cutoff);
    }

    /**
     * Start system metrics collection
     */
    startSystemMetrics() {
        this.systemMetricsTimer = setInterval(() => {
            this.collectSystemMetrics();
        }, this.config.systemMetricsInterval);
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();

        // Memory metrics
        this.getMetric('system_memory_usage_bytes').set({ type: 'heap_used' }, memUsage.heapUsed);
        this.getMetric('system_memory_usage_bytes').set({ type: 'heap_total' }, memUsage.heapTotal);
        this.getMetric('system_memory_usage_bytes').set({ type: 'rss' }, memUsage.rss);
        this.getMetric('system_memory_usage_bytes').set({ type: 'external' }, memUsage.external);

        // CPU metrics (simple approximation)
        const cpuUsage = process.cpuUsage();
        const totalCPU = cpuUsage.user + cpuUsage.system;
        const cpuPercent = (totalCPU / (os.cpus().length * 1000000)) * 100;
        this.getMetric('system_cpu_usage_percent').set({}, cpuPercent);

        this.emit('metric', {
            type: 'system_metrics',
            memory: memUsage,
            cpu: cpuPercent,
            timestamp: Date.now()
        });
    }

    /**
     * Get platform statistics
     */
    getPlatformStats(platform, timeWindow = TimeWindows.HOUR) {
        const cutoff = Date.now() - timeWindow;
        const platformData = this.timeSeries.filter(
            point => point.platform === platform && point.timestamp > cutoff
        );

        if (platformData.length === 0) {
            return {
                platform,
                totalQueries: 0,
                successfulQueries: 0,
                failedQueries: 0,
                successRate: 0,
                avgResponseTime: 0,
                p95ResponseTime: 0,
                p99ResponseTime: 0
            };
        }

        const successful = platformData.filter(p => p.success);
        const failed = platformData.filter(p => !p.success);
        const durations = platformData.map(p => p.duration).sort((a, b) => a - b);

        return {
            platform,
            totalQueries: platformData.length,
            successfulQueries: successful.length,
            failedQueries: failed.length,
            successRate: (successful.length / platformData.length) * 100,
            avgResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
            p95ResponseTime: durations[Math.floor(durations.length * 0.95)],
            p99ResponseTime: durations[Math.floor(durations.length * 0.99)]
        };
    }

    /**
     * Get overall statistics
     */
    getOverallStats(timeWindow = TimeWindows.HOUR) {
        const cutoff = Date.now() - timeWindow;
        const recentData = this.timeSeries.filter(point => point.timestamp > cutoff);

        const platforms = [...new Set(recentData.map(p => p.platform))];
        const platformStats = {};

        for (const platform of platforms) {
            platformStats[platform] = this.getPlatformStats(platform, timeWindow);
        }

        const successful = recentData.filter(p => p.success);
        const durations = recentData.map(p => p.duration).sort((a, b) => a - b);

        return {
            totalQueries: recentData.length,
            successfulQueries: successful.length,
            failedQueries: recentData.length - successful.length,
            successRate: recentData.length > 0 ? (successful.length / recentData.length) * 100 : 0,
            avgResponseTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
            platforms: platformStats,
            websocketConnections: this.getMetric('websocket_connections').get({}),
            memoryUsage: {
                heapUsed: this.getMetric('system_memory_usage_bytes').get({ type: 'heap_used' }),
                heapTotal: this.getMetric('system_memory_usage_bytes').get({ type: 'heap_total' }),
                rss: this.getMetric('system_memory_usage_bytes').get({ type: 'rss' })
            },
            cpuUsage: this.getMetric('system_cpu_usage_percent').get({})
        };
    }

    /**
     * Get selector hit rates
     */
    getSelectorStats(platform = null) {
        const selectorMetric = this.getMetric('selector_attempts_total');
        const stats = {};

        for (const entry of selectorMetric.toJSON()) {
            const { platform: p, selector_type, result } = entry.labels;

            if (platform && p !== platform) continue;

            if (!stats[p]) {
                stats[p] = { total: 0, hits: 0, misses: 0, byType: {} };
            }

            stats[p].total += entry.value;

            if (result === 'hit') {
                stats[p].hits += entry.value;
            } else {
                stats[p].misses += entry.value;
            }

            if (!stats[p].byType[selector_type]) {
                stats[p].byType[selector_type] = { hits: 0, misses: 0 };
            }

            stats[p].byType[selector_type][result === 'hit' ? 'hits' : 'misses'] += entry.value;
        }

        // Calculate hit rates
        for (const p in stats) {
            stats[p].hitRate = stats[p].total > 0 ? (stats[p].hits / stats[p].total) * 100 : 0;

            for (const type in stats[p].byType) {
                const total = stats[p].byType[type].hits + stats[p].byType[type].misses;
                stats[p].byType[type].hitRate = total > 0 ? (stats[p].byType[type].hits / total) * 100 : 0;
            }
        }

        return platform ? stats[platform] : stats;
    }

    /**
     * Export metrics in Prometheus format
     */
    exportPrometheus() {
        let output = '';

        for (const [name, metric] of this.metrics) {
            output += `# HELP ${name} ${metric.description}\n`;
            output += `# TYPE ${name} ${this.getPrometheusType(metric)}\n`;

            const data = metric.toJSON();

            for (const entry of data) {
                const labels = Object.entries(entry.labels)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(',');

                const labelStr = labels ? `{${labels}}` : '';

                if (metric instanceof Histogram) {
                    output += `${name}${labelStr} ${entry.average}\n`;
                    output += `${name}_count${labelStr} ${entry.count}\n`;
                    output += `${name}_sum${labelStr} ${entry.sum}\n`;
                } else {
                    output += `${name}${labelStr} ${entry.value}\n`;
                }
            }

            output += '\n';
        }

        return output;
    }

    /**
     * Get Prometheus metric type
     */
    getPrometheusType(metric) {
        if (metric instanceof Counter) return 'counter';
        if (metric instanceof Gauge) return 'gauge';
        if (metric instanceof Histogram) return 'histogram';
        return 'untyped';
    }

    /**
     * Export metrics as JSON
     */
    exportJSON() {
        const metrics = {};

        for (const [name, metric] of this.metrics) {
            metrics[name] = {
                type: metric.constructor.name.toLowerCase(),
                description: metric.description,
                data: metric.toJSON()
            };
        }

        return {
            metrics,
            overall: this.getOverallStats(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset all metrics
     */
    reset() {
        for (const metric of this.metrics.values()) {
            if (metric instanceof Counter || metric instanceof Gauge) {
                metric.reset();
            }
        }

        this.timeSeries = [];
    }

    /**
     * Stop metrics collection
     */
    stop() {
        if (this.systemMetricsTimer) {
            clearInterval(this.systemMetricsTimer);
            this.systemMetricsTimer = null;
        }
    }
}

// Export
module.exports = {
    MetricsCollector,
    MetricTypes,
    TimeWindows,
    Counter,
    Gauge,
    Histogram
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Metrics Collector Demo ===\n');

        const collector = new MetricsCollector({
            enableSystemMetrics: true,
            systemMetricsInterval: 1000
        });

        // Listen to metric events
        collector.on('metric', (event) => {
            console.log(`[Metric Event] ${event.type}:`, event);
        });

        // Simulate some queries
        console.log('Simulating queries...\n');

        const platforms = ['claude', 'chatgpt', 'gemini'];

        for (let i = 0; i < 20; i++) {
            const platform = platforms[Math.floor(Math.random() * platforms.length)];
            const queryId = `q${i}`;
            const duration = Math.random() * 3000 + 500;
            const success = Math.random() > 0.1;

            collector.recordQueryStart(platform, queryId);

            await new Promise(resolve => setTimeout(resolve, 100));

            if (success) {
                collector.recordQueryComplete(platform, queryId, duration, true);
            } else {
                collector.recordQueryError(platform, queryId, 'timeout', duration);
            }

            // Simulate selector attempts
            collector.recordSelectorAttempt(platform, 'primary', Math.random() > 0.2);
            if (Math.random() > 0.8) {
                collector.recordSelectorAttempt(platform, 'fallback', Math.random() > 0.5);
            }
        }

        // Simulate WebSocket connections
        collector.recordWebSocketConnection(1);
        collector.recordWebSocketConnection(1);
        collector.recordWebSocketMessage('inbound', 'query');
        collector.recordWebSocketMessage('outbound', 'response');

        // Get statistics
        console.log('\n=== Overall Statistics ===');
        console.log(JSON.stringify(collector.getOverallStats(), null, 2));

        console.log('\n=== Platform Statistics ===');
        for (const platform of platforms) {
            console.log(`\n${platform}:`);
            console.log(JSON.stringify(collector.getPlatformStats(platform), null, 2));
        }

        console.log('\n=== Selector Statistics ===');
        console.log(JSON.stringify(collector.getSelectorStats(), null, 2));

        console.log('\n=== Prometheus Export ===');
        console.log(collector.exportPrometheus());

        // Cleanup
        collector.stop();
        console.log('\n✅ Demo complete');
    }

    demo().catch(console.error);
}
