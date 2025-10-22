#!/usr/bin/env node

/**
 * Error Logging System for Production AI Orchestrator
 *
 * Features:
 * - Structured logging with Winston
 * - Log rotation and compression
 * - Error aggregation and reporting
 * - Debug mode with verbose logging
 * - Performance impact tracking
 * - Multiple log transports (file, console)
 * - Log levels and filtering
 */

const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');
const { ErrorTypes } = require('./error-handler');

/**
 * Log Levels
 */
const LogLevel = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    HTTP: 'http',
    VERBOSE: 'verbose',
    DEBUG: 'debug',
    SILLY: 'silly'
};

/**
 * Custom Winston Format for Error Context
 */
const errorContextFormat = winston.format((info) => {
    if (info instanceof Error) {
        return {
            ...info,
            message: info.message,
            stack: info.stack,
            type: info.type || ErrorTypes.UNKNOWN
        };
    }

    if (info.error instanceof Error) {
        info.error = {
            message: info.error.message,
            stack: info.error.stack,
            type: info.error.type || ErrorTypes.UNKNOWN,
            context: info.error.context
        };
    }

    return info;
});

/**
 * Error Aggregator - Groups similar errors
 */
class ErrorAggregator {
    constructor(options = {}) {
        this.windowSize = options.windowSize || 300000; // 5 minutes
        this.maxGroups = options.maxGroups || 100;
        this.groups = new Map();
    }

    /**
     * Add error to aggregator
     */
    add(error, context = {}) {
        const key = this.getGroupKey(error);
        const now = Date.now();

        if (!this.groups.has(key)) {
            this.groups.set(key, {
                errorType: error.type || ErrorTypes.UNKNOWN,
                message: error.message,
                firstOccurrence: now,
                lastOccurrence: now,
                count: 0,
                occurrences: [],
                platforms: new Set(),
                contexts: []
            });
        }

        const group = this.groups.get(key);
        group.count++;
        group.lastOccurrence = now;
        group.occurrences.push(now);

        if (context.platform) {
            group.platforms.add(context.platform);
        }

        // Store sample contexts (max 5)
        if (group.contexts.length < 5) {
            group.contexts.push({
                timestamp: new Date(now).toISOString(),
                ...context
            });
        }

        // Clean old occurrences
        group.occurrences = group.occurrences.filter(
            time => now - time < this.windowSize
        );

        // Trim groups if too many
        if (this.groups.size > this.maxGroups) {
            const oldestKey = Array.from(this.groups.entries())
                .sort((a, b) => a[1].lastOccurrence - b[1].lastOccurrence)[0][0];
            this.groups.delete(oldestKey);
        }
    }

    /**
     * Get grouping key for error
     */
    getGroupKey(error) {
        const type = error.type || ErrorTypes.UNKNOWN;
        const message = error.message || '';

        // Create a normalized message (remove specific values)
        const normalized = message
            .replace(/\d+/g, 'N') // Replace numbers
            .replace(/[a-f0-9]{8,}/gi, 'ID') // Replace IDs
            .substring(0, 100);

        return `${type}:${normalized}`;
    }

    /**
     * Get all error groups
     */
    getGroups() {
        return Array.from(this.groups.entries()).map(([key, group]) => ({
            key,
            errorType: group.errorType,
            message: group.message,
            count: group.count,
            recentCount: group.occurrences.length,
            firstOccurrence: new Date(group.firstOccurrence).toISOString(),
            lastOccurrence: new Date(group.lastOccurrence).toISOString(),
            platforms: Array.from(group.platforms),
            sampleContexts: group.contexts
        }));
    }

    /**
     * Get top errors by count
     */
    getTopErrors(limit = 10) {
        return this.getGroups()
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Clear aggregator
     */
    clear() {
        this.groups.clear();
    }
}

/**
 * Performance Impact Tracker
 */
class PerformanceTracker {
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.maxSamples = options.maxSamples || 1000;
        this.samples = [];
    }

    /**
     * Track operation performance
     */
    track(operation, duration, metadata = {}) {
        if (!this.enabled) return;

        this.samples.push({
            operation,
            duration,
            timestamp: Date.now(),
            ...metadata
        });

        // Trim samples
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
    }

    /**
     * Get performance statistics
     */
    getStats(operation = null) {
        let samples = this.samples;

        if (operation) {
            samples = samples.filter(s => s.operation === operation);
        }

        if (samples.length === 0) {
            return null;
        }

        const durations = samples.map(s => s.duration);
        const sorted = durations.slice().sort((a, b) => a - b);

        return {
            operation,
            count: samples.length,
            min: Math.min(...durations),
            max: Math.max(...durations),
            avg: durations.reduce((a, b) => a + b, 0) / durations.length,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)]
        };
    }

    /**
     * Get all operation stats
     */
    getAllStats() {
        const operations = [...new Set(this.samples.map(s => s.operation))];
        const stats = {};

        for (const operation of operations) {
            stats[operation] = this.getStats(operation);
        }

        return stats;
    }

    /**
     * Clear tracker
     */
    clear() {
        this.samples = [];
    }
}

/**
 * Main Error Logger
 */
class ErrorLogger {
    constructor(options = {}) {
        this.options = {
            logDir: options.logDir || './logs',
            logLevel: options.logLevel || LogLevel.INFO,
            enableConsole: options.enableConsole !== false,
            enableFile: options.enableFile !== false,
            enableErrorFile: options.enableErrorFile !== false,
            maxFileSize: options.maxFileSize || 10485760, // 10MB
            maxFiles: options.maxFiles || 5,
            enableAggregation: options.enableAggregation !== false,
            enablePerformanceTracking: options.enablePerformanceTracking !== false,
            ...options
        };

        // Create logs directory
        this.initializeLogDirectory();

        // Winston logger
        this.logger = this.createLogger();

        // Error aggregator
        this.aggregator = new ErrorAggregator({
            windowSize: options.aggregatorWindowSize,
            maxGroups: options.aggregatorMaxGroups
        });

        // Performance tracker
        this.performanceTracker = new PerformanceTracker({
            enabled: this.options.enablePerformanceTracking,
            maxSamples: options.performanceMaxSamples
        });

        // Log statistics
        this.stats = {
            byLevel: {},
            byType: {},
            total: 0
        };
    }

    /**
     * Initialize log directory
     */
    async initializeLogDirectory() {
        try {
            await fs.mkdir(this.options.logDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error.message);
        }
    }

    /**
     * Create Winston logger with transports
     */
    createLogger() {
        const transports = [];

        // Console transport
        if (this.options.enableConsole) {
            transports.push(
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                        winston.format.printf(({ timestamp, level, message, ...meta }) => {
                            let log = `${timestamp} [${level}]: ${message}`;

                            // Add metadata if present
                            if (Object.keys(meta).length > 0) {
                                const metaStr = JSON.stringify(meta, null, 2);
                                if (metaStr !== '{}') {
                                    log += `\n${metaStr}`;
                                }
                            }

                            return log;
                        })
                    )
                })
            );
        }

        // File transport - all logs
        if (this.options.enableFile) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(this.options.logDir, 'combined.log'),
                    maxsize: this.options.maxFileSize,
                    maxFiles: this.options.maxFiles,
                    tailable: true,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        errorContextFormat(),
                        winston.format.json()
                    )
                })
            );
        }

        // File transport - errors only
        if (this.options.enableErrorFile) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(this.options.logDir, 'error.log'),
                    level: 'error',
                    maxsize: this.options.maxFileSize,
                    maxFiles: this.options.maxFiles,
                    tailable: true,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        errorContextFormat(),
                        winston.format.json()
                    )
                })
            );
        }

        return winston.createLogger({
            level: this.options.logLevel,
            transports: transports,
            exitOnError: false
        });
    }

    /**
     * Log error with context
     */
    error(message, error = null, context = {}) {
        this.updateStats(LogLevel.ERROR, error?.type);

        const logData = {
            message,
            ...context
        };

        if (error) {
            logData.error = error;

            // Add to aggregator
            if (this.options.enableAggregation) {
                this.aggregator.add(error, context);
            }
        }

        this.logger.error(logData);
    }

    /**
     * Log warning
     */
    warn(message, context = {}) {
        this.updateStats(LogLevel.WARN);
        this.logger.warn({ message, ...context });
    }

    /**
     * Log info
     */
    info(message, context = {}) {
        this.updateStats(LogLevel.INFO);
        this.logger.info({ message, ...context });
    }

    /**
     * Log debug
     */
    debug(message, context = {}) {
        this.updateStats(LogLevel.DEBUG);
        this.logger.debug({ message, ...context });
    }

    /**
     * Log verbose
     */
    verbose(message, context = {}) {
        this.updateStats(LogLevel.VERBOSE);
        this.logger.verbose({ message, ...context });
    }

    /**
     * Log HTTP request/response
     */
    http(message, context = {}) {
        this.updateStats(LogLevel.HTTP);
        this.logger.http({ message, ...context });
    }

    /**
     * Track performance of an operation
     */
    trackPerformance(operation, fn, metadata = {}) {
        const startTime = Date.now();

        const trackCompletion = (error = null) => {
            const duration = Date.now() - startTime;

            this.performanceTracker.track(operation, duration, {
                ...metadata,
                success: !error
            });

            if (this.options.logLevel === LogLevel.DEBUG || this.options.logLevel === LogLevel.VERBOSE) {
                this.debug(`Performance: ${operation}`, {
                    duration,
                    ...metadata
                });
            }
        };

        // Handle sync functions
        if (typeof fn === 'function' && fn.constructor.name !== 'AsyncFunction') {
            try {
                const result = fn();
                trackCompletion();
                return result;
            } catch (error) {
                trackCompletion(error);
                throw error;
            }
        }

        // Handle async functions and promises
        return Promise.resolve(fn)
            .then(result => {
                trackCompletion();
                return result;
            })
            .catch(error => {
                trackCompletion(error);
                throw error;
            });
    }

    /**
     * Create child logger with default context
     */
    child(defaultContext) {
        return {
            error: (message, error, context) => this.error(message, error, { ...defaultContext, ...context }),
            warn: (message, context) => this.warn(message, { ...defaultContext, ...context }),
            info: (message, context) => this.info(message, { ...defaultContext, ...context }),
            debug: (message, context) => this.debug(message, { ...defaultContext, ...context }),
            verbose: (message, context) => this.verbose(message, { ...defaultContext, ...context }),
            http: (message, context) => this.http(message, { ...defaultContext, ...context })
        };
    }

    /**
     * Update statistics
     */
    updateStats(level, errorType = null) {
        this.stats.total++;

        this.stats.byLevel[level] = (this.stats.byLevel[level] || 0) + 1;

        if (errorType) {
            this.stats.byType[errorType] = (this.stats.byType[errorType] || 0) + 1;
        }
    }

    /**
     * Get logging statistics
     */
    getStats() {
        return {
            ...this.stats,
            topErrors: this.options.enableAggregation ? this.aggregator.getTopErrors(10) : [],
            performance: this.options.enablePerformanceTracking ? this.performanceTracker.getAllStats() : {}
        };
    }

    /**
     * Get error aggregation report
     */
    getErrorReport() {
        if (!this.options.enableAggregation) {
            return { enabled: false };
        }

        return {
            enabled: true,
            groups: this.aggregator.getGroups(),
            topErrors: this.aggregator.getTopErrors(20)
        };
    }

    /**
     * Get performance report
     */
    getPerformanceReport() {
        if (!this.options.enablePerformanceTracking) {
            return { enabled: false };
        }

        return {
            enabled: true,
            stats: this.performanceTracker.getAllStats()
        };
    }

    /**
     * Export logs to file
     */
    async exportReport(filepath) {
        const report = {
            timestamp: new Date().toISOString(),
            statistics: this.getStats(),
            errorReport: this.getErrorReport(),
            performanceReport: this.getPerformanceReport()
        };

        await fs.writeFile(filepath, JSON.stringify(report, null, 2));
        this.info(`Report exported to ${filepath}`);
    }

    /**
     * Set log level
     */
    setLogLevel(level) {
        this.options.logLevel = level;
        this.logger.level = level;
        this.info(`Log level set to ${level}`);
    }

    /**
     * Enable debug mode
     */
    enableDebugMode() {
        this.setLogLevel(LogLevel.DEBUG);
    }

    /**
     * Disable debug mode
     */
    disableDebugMode() {
        this.setLogLevel(LogLevel.INFO);
    }

    /**
     * Clear statistics
     */
    clearStats() {
        this.stats = {
            byLevel: {},
            byType: {},
            total: 0
        };

        if (this.options.enableAggregation) {
            this.aggregator.clear();
        }

        if (this.options.enablePerformanceTracking) {
            this.performanceTracker.clear();
        }
    }

    /**
     * Close logger
     */
    close() {
        this.logger.close();
    }
}

/**
 * Create default logger instance
 */
let defaultLogger = null;

function createLogger(options = {}) {
    defaultLogger = new ErrorLogger(options);
    return defaultLogger;
}

function getLogger() {
    if (!defaultLogger) {
        defaultLogger = createLogger();
    }
    return defaultLogger;
}

// Export
module.exports = {
    ErrorLogger,
    LogLevel,
    ErrorAggregator,
    PerformanceTracker,
    createLogger,
    getLogger
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Error Logging System Demo ===\n');

        const logger = createLogger({
            logDir: './logs',
            logLevel: LogLevel.DEBUG,
            enableConsole: true,
            enableFile: true,
            enableAggregation: true,
            enablePerformanceTracking: true
        });

        // Test different log levels
        console.log('Testing log levels:\n');

        logger.info('Application started', { version: '1.0.0', environment: 'development' });

        logger.debug('Debug information', { data: { foo: 'bar' } });

        logger.warn('Warning message', { platform: 'openai', reason: 'rate_limit_approaching' });

        // Test error logging with aggregation
        console.log('\nTesting error logging and aggregation:\n');

        const { NetworkError, AuthenticationError } = require('./error-handler');

        for (let i = 0; i < 5; i++) {
            const error = new NetworkError('Connection refused', {
                host: 'api.example.com',
                port: 443
            });

            logger.error('Network error occurred', error, {
                platform: 'openai',
                attempt: i + 1
            });
        }

        for (let i = 0; i < 3; i++) {
            const error = new AuthenticationError('Invalid API key', {
                apiKey: 'sk-***'
            });

            logger.error('Authentication failed', error, {
                platform: 'anthropic'
            });
        }

        // Test performance tracking
        console.log('\nTesting performance tracking:\n');

        // Sync function
        logger.trackPerformance('sync_operation', () => {
            let sum = 0;
            for (let i = 0; i < 1000000; i++) {
                sum += i;
            }
            return sum;
        }, { type: 'calculation' });

        // Async function
        await logger.trackPerformance('async_operation', async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
        }, { type: 'api_call' });

        // Create child logger
        console.log('\nTesting child logger:\n');

        const platformLogger = logger.child({ platform: 'openai', module: 'api_client' });
        platformLogger.info('Request sent', { endpoint: '/v1/chat/completions' });
        platformLogger.debug('Response received', { status: 200, latency: 234 });

        // Get statistics
        console.log('\n\nLogging Statistics:');
        console.log(JSON.stringify(logger.getStats(), null, 2));

        // Get error report
        console.log('\n\nError Report:');
        const errorReport = logger.getErrorReport();
        console.log(JSON.stringify(errorReport, null, 2));

        // Get performance report
        console.log('\n\nPerformance Report:');
        const perfReport = logger.getPerformanceReport();
        console.log(JSON.stringify(perfReport, null, 2));

        // Export report
        await logger.exportReport('./logs/error-report.json');
        console.log('\n\nReport exported to ./logs/error-report.json');

        // Close logger
        logger.close();
    }

    demo().catch(console.error);
}
