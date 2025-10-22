#!/usr/bin/env node

/**
 * Centralized Logging System for ISH Automation
 *
 * Features:
 * - Structured logging with multiple levels
 * - Log rotation and archival
 * - Context enrichment (platform, query ID, timestamp, duration)
 * - Multiple transports (console, file, database)
 * - Log aggregation for distributed components
 * - Performance tracking
 * - Query-specific log grouping
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;
const { format } = winston;

/**
 * Log Levels
 */
const LogLevels = {
    FATAL: 'fatal',
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    TRACE: 'trace'
};

/**
 * Log Categories
 */
const LogCategories = {
    SYSTEM: 'system',
    PLATFORM: 'platform',
    QUERY: 'query',
    AUTH: 'auth',
    CONFIG: 'config',
    PERFORMANCE: 'performance',
    WEBSOCKET: 'websocket',
    HEALTH: 'health',
    AUDIT: 'audit'
};

/**
 * Centralized Logger Class
 */
class CentralizedLogger {
    constructor(options = {}) {
        this.config = {
            logDir: options.logDir || path.join(__dirname, '../logs'),
            logLevel: options.logLevel || 'info',
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
            maxFiles: options.maxFiles || 14, // Keep 14 days
            enableConsole: options.enableConsole !== false,
            enableFile: options.enableFile !== false,
            enableAudit: options.enableAudit !== false,
            contextDefaults: options.contextDefaults || {},
            ...options
        };

        // Log storage
        this.logs = [];
        this.maxLogsInMemory = 1000;

        // Performance tracking
        this.performanceMarks = new Map();

        // Initialize Winston logger
        this.initializeLogger();
    }

    /**
     * Initialize Winston logger with transports
     */
    initializeLogger() {
        const transports = [];

        // Console transport
        if (this.config.enableConsole) {
            transports.push(
                new winston.transports.Console({
                    format: format.combine(
                        format.colorize(),
                        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                        format.printf(this.consoleFormat.bind(this))
                    )
                })
            );
        }

        // File transport - General logs
        if (this.config.enableFile) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(this.config.logDir, 'combined.log'),
                    maxsize: this.config.maxFileSize,
                    maxFiles: this.config.maxFiles,
                    format: format.combine(
                        format.timestamp(),
                        format.json()
                    )
                })
            );

            // Error logs
            transports.push(
                new winston.transports.File({
                    filename: path.join(this.config.logDir, 'error.log'),
                    level: 'error',
                    maxsize: this.config.maxFileSize,
                    maxFiles: this.config.maxFiles,
                    format: format.combine(
                        format.timestamp(),
                        format.json()
                    )
                })
            );

            // Performance logs
            transports.push(
                new winston.transports.File({
                    filename: path.join(this.config.logDir, 'performance.log'),
                    maxsize: this.config.maxFileSize,
                    maxFiles: this.config.maxFiles,
                    format: format.combine(
                        format.timestamp(),
                        format.json()
                    ),
                    filter: (log) => log.category === LogCategories.PERFORMANCE
                })
            );

            // Audit logs
            if (this.config.enableAudit) {
                transports.push(
                    new winston.transports.File({
                        filename: path.join(this.config.logDir, 'audit.log'),
                        maxsize: this.config.maxFileSize,
                        maxFiles: this.config.maxFiles * 2, // Keep audit logs longer
                        format: format.combine(
                            format.timestamp(),
                            format.json()
                        ),
                        filter: (log) => log.category === LogCategories.AUDIT
                    })
                );
            }
        }

        // Create Winston logger
        this.logger = winston.createLogger({
            level: this.config.logLevel,
            levels: {
                fatal: 0,
                error: 1,
                warn: 2,
                info: 3,
                debug: 4,
                trace: 5
            },
            transports: transports
        });

        // Add custom level colors
        winston.addColors({
            fatal: 'red bold',
            error: 'red',
            warn: 'yellow',
            info: 'green',
            debug: 'blue',
            trace: 'gray'
        });
    }

    /**
     * Console log format
     */
    consoleFormat(info) {
        const { timestamp, level, message, category, platform, queryId, duration, ...meta } = info;

        let output = `${timestamp} [${level.toUpperCase()}]`;

        if (category) output += ` [${category}]`;
        if (platform) output += ` [${platform}]`;
        if (queryId) output += ` [Q:${queryId}]`;

        output += ` ${message}`;

        if (duration !== undefined) {
            output += ` (${duration}ms)`;
        }

        // Add extra metadata if present
        const extraKeys = Object.keys(meta).filter(k => !['level', 'timestamp', 'message'].includes(k));
        if (extraKeys.length > 0) {
            output += ` ${JSON.stringify(meta)}`;
        }

        return output;
    }

    /**
     * Create log entry with context
     */
    createLogEntry(level, message, context = {}) {
        const entry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            category: context.category || LogCategories.SYSTEM,
            ...this.config.contextDefaults,
            ...context
        };

        // Store in memory (with limit)
        this.logs.push(entry);
        if (this.logs.length > this.maxLogsInMemory) {
            this.logs.shift();
        }

        return entry;
    }

    /**
     * Fatal level log
     */
    fatal(message, context = {}) {
        const entry = this.createLogEntry(LogLevels.FATAL, message, context);
        this.logger.log('fatal', message, entry);
        return entry;
    }

    /**
     * Error level log
     */
    error(message, context = {}) {
        const entry = this.createLogEntry(LogLevels.ERROR, message, context);
        this.logger.error(message, entry);
        return entry;
    }

    /**
     * Warn level log
     */
    warn(message, context = {}) {
        const entry = this.createLogEntry(LogLevels.WARN, message, context);
        this.logger.warn(message, entry);
        return entry;
    }

    /**
     * Info level log
     */
    info(message, context = {}) {
        const entry = this.createLogEntry(LogLevels.INFO, message, context);
        this.logger.info(message, entry);
        return entry;
    }

    /**
     * Debug level log
     */
    debug(message, context = {}) {
        const entry = this.createLogEntry(LogLevels.DEBUG, message, context);
        this.logger.debug(message, entry);
        return entry;
    }

    /**
     * Trace level log
     */
    trace(message, context = {}) {
        const entry = this.createLogEntry(LogLevels.TRACE, message, context);
        this.logger.log('trace', message, entry);
        return entry;
    }

    /**
     * Log query start
     */
    logQueryStart(queryId, platform, prompt, metadata = {}) {
        return this.info(`Query started on ${platform}`, {
            category: LogCategories.QUERY,
            queryId,
            platform,
            prompt: prompt.substring(0, 100), // Truncate for logs
            action: 'query_start',
            ...metadata
        });
    }

    /**
     * Log query completion
     */
    logQueryComplete(queryId, platform, duration, metadata = {}) {
        return this.info(`Query completed on ${platform}`, {
            category: LogCategories.QUERY,
            queryId,
            platform,
            duration,
            action: 'query_complete',
            ...metadata
        });
    }

    /**
     * Log query failure
     */
    logQueryFailure(queryId, platform, error, duration, metadata = {}) {
        return this.error(`Query failed on ${platform}: ${error.message}`, {
            category: LogCategories.QUERY,
            queryId,
            platform,
            duration,
            error: {
                message: error.message,
                type: error.type || 'unknown',
                stack: error.stack
            },
            action: 'query_failure',
            ...metadata
        });
    }

    /**
     * Log platform health check
     */
    logHealthCheck(platform, status, metrics = {}) {
        const level = status === 'healthy' ? LogLevels.INFO :
                     status === 'degraded' ? LogLevels.WARN :
                     LogLevels.ERROR;

        return this[level](`Platform health check: ${status}`, {
            category: LogCategories.HEALTH,
            platform,
            status,
            metrics,
            action: 'health_check'
        });
    }

    /**
     * Log authentication event
     */
    logAuth(event, success, metadata = {}) {
        const level = success ? LogLevels.INFO : LogLevels.WARN;

        return this[level](`Authentication ${event}: ${success ? 'success' : 'failure'}`, {
            category: LogCategories.AUTH,
            event,
            success,
            action: 'auth',
            ...metadata
        });
    }

    /**
     * Log configuration change
     */
    logConfigChange(key, oldValue, newValue, metadata = {}) {
        return this.info(`Configuration changed: ${key}`, {
            category: LogCategories.CONFIG,
            key,
            oldValue,
            newValue,
            action: 'config_change',
            ...metadata
        });
    }

    /**
     * Log WebSocket event
     */
    logWebSocket(event, metadata = {}) {
        return this.debug(`WebSocket ${event}`, {
            category: LogCategories.WEBSOCKET,
            event,
            action: 'websocket',
            ...metadata
        });
    }

    /**
     * Log performance metric
     */
    logPerformance(operation, duration, metadata = {}) {
        return this.info(`Performance: ${operation}`, {
            category: LogCategories.PERFORMANCE,
            operation,
            duration,
            action: 'performance',
            ...metadata
        });
    }

    /**
     * Start performance tracking
     */
    startPerformance(markId, metadata = {}) {
        this.performanceMarks.set(markId, {
            startTime: Date.now(),
            metadata
        });
    }

    /**
     * End performance tracking and log
     */
    endPerformance(markId, operation) {
        const mark = this.performanceMarks.get(markId);
        if (!mark) {
            this.warn(`Performance mark not found: ${markId}`);
            return null;
        }

        const duration = Date.now() - mark.startTime;
        this.performanceMarks.delete(markId);

        return this.logPerformance(operation, duration, mark.metadata);
    }

    /**
     * Audit log - for compliance and security tracking
     */
    audit(action, userId, metadata = {}) {
        return this.info(`Audit: ${action}`, {
            category: LogCategories.AUDIT,
            action,
            userId,
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Get recent logs
     */
    getRecentLogs(filters = {}) {
        let logs = [...this.logs];

        if (filters.level) {
            logs = logs.filter(log => log.level === filters.level);
        }

        if (filters.category) {
            logs = logs.filter(log => log.category === filters.category);
        }

        if (filters.platform) {
            logs = logs.filter(log => log.platform === filters.platform);
        }

        if (filters.queryId) {
            logs = logs.filter(log => log.queryId === filters.queryId);
        }

        if (filters.since) {
            const sinceTime = new Date(filters.since).getTime();
            logs = logs.filter(log => new Date(log.timestamp).getTime() >= sinceTime);
        }

        if (filters.limit) {
            logs = logs.slice(-filters.limit);
        }

        return logs;
    }

    /**
     * Get logs by query ID
     */
    getQueryLogs(queryId) {
        return this.getRecentLogs({ queryId });
    }

    /**
     * Get logs by platform
     */
    getPlatformLogs(platform, limit = 100) {
        return this.getRecentLogs({ platform, limit });
    }

    /**
     * Get error logs
     */
    getErrorLogs(limit = 100) {
        return this.getRecentLogs({ level: LogLevels.ERROR, limit });
    }

    /**
     * Export logs to file
     */
    async exportLogs(filePath, filters = {}) {
        const logs = this.getRecentLogs(filters);
        await fs.writeFile(filePath, JSON.stringify(logs, null, 2));
        return logs.length;
    }

    /**
     * Rotate logs manually
     */
    async rotateLogs() {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const archiveDir = path.join(this.config.logDir, 'archive');

        try {
            await fs.mkdir(archiveDir, { recursive: true });

            const files = ['combined.log', 'error.log', 'performance.log', 'audit.log'];

            for (const file of files) {
                const sourcePath = path.join(this.config.logDir, file);
                const archivePath = path.join(archiveDir, `${file}.${timestamp}`);

                try {
                    await fs.rename(sourcePath, archivePath);
                    this.info(`Rotated log file: ${file}`, {
                        category: LogCategories.SYSTEM,
                        archivePath
                    });
                } catch (error) {
                    // File might not exist, skip
                }
            }

            return true;
        } catch (error) {
            this.error(`Failed to rotate logs: ${error.message}`, {
                category: LogCategories.SYSTEM,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get log statistics
     */
    getStatistics() {
        const stats = {
            total: this.logs.length,
            byLevel: {},
            byCategory: {},
            byPlatform: {},
            recentErrors: 0,
            avgDuration: 0
        };

        let totalDuration = 0;
        let durationCount = 0;
        const oneHourAgo = Date.now() - 60 * 60 * 1000;

        for (const log of this.logs) {
            // By level
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

            // By category
            if (log.category) {
                stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
            }

            // By platform
            if (log.platform) {
                stats.byPlatform[log.platform] = (stats.byPlatform[log.platform] || 0) + 1;
            }

            // Recent errors
            if (log.level === LogLevels.ERROR && new Date(log.timestamp).getTime() > oneHourAgo) {
                stats.recentErrors++;
            }

            // Average duration
            if (log.duration !== undefined) {
                totalDuration += log.duration;
                durationCount++;
            }
        }

        if (durationCount > 0) {
            stats.avgDuration = Math.round(totalDuration / durationCount);
        }

        return stats;
    }

    /**
     * Clear in-memory logs
     */
    clearLogs() {
        this.logs = [];
        this.info('In-memory logs cleared', { category: LogCategories.SYSTEM });
    }

    /**
     * Set log level
     */
    setLogLevel(level) {
        this.logger.level = level;
        this.config.logLevel = level;
        this.info(`Log level changed to: ${level}`, { category: LogCategories.SYSTEM });
    }

    /**
     * Shutdown logger gracefully
     */
    async shutdown() {
        this.info('Logger shutting down', { category: LogCategories.SYSTEM });

        // Wait for all transports to finish
        return new Promise((resolve) => {
            this.logger.on('finish', resolve);
            this.logger.end();
        });
    }
}

/**
 * Singleton instance
 */
let loggerInstance = null;

/**
 * Get or create logger instance
 */
function getLogger(options = {}) {
    if (!loggerInstance) {
        loggerInstance = new CentralizedLogger(options);
    }
    return loggerInstance;
}

/**
 * Reset logger instance (for testing)
 */
function resetLogger() {
    loggerInstance = null;
}

// Export
module.exports = {
    CentralizedLogger,
    getLogger,
    resetLogger,
    LogLevels,
    LogCategories
};

// Demo usage
if (require.main === module) {
    async function demo() {
        console.log('=== Centralized Logger Demo ===\n');

        const logger = getLogger({
            logLevel: 'trace',
            enableConsole: true,
            enableFile: true
        });

        // System logs
        logger.info('Logger initialized', { category: LogCategories.SYSTEM });

        // Query logs
        logger.logQueryStart('q123', 'claude', 'What is AI?');
        logger.startPerformance('q123-claude', { queryId: 'q123', platform: 'claude' });

        await new Promise(resolve => setTimeout(resolve, 1500));

        logger.endPerformance('q123-claude', 'claude-query');
        logger.logQueryComplete('q123', 'claude', 1500, { tokens: 150 });

        // Error log
        try {
            throw new Error('Simulated platform error');
        } catch (error) {
            logger.logQueryFailure('q124', 'chatgpt', error, 500);
        }

        // Health check log
        logger.logHealthCheck('claude', 'healthy', { latency: 250, errorRate: 0.01 });
        logger.logHealthCheck('chatgpt', 'degraded', { latency: 5000, errorRate: 0.15 });

        // Auth log
        logger.logAuth('login', true, { userId: 'user123', method: 'oauth' });

        // Config change
        logger.logConfigChange('maxRetries', 3, 5, { userId: 'admin' });

        // WebSocket log
        logger.logWebSocket('connection', { clientId: 'ws123' });

        // Audit log
        logger.audit('query_submitted', 'user123', { queryId: 'q123', platform: 'claude' });

        // Get statistics
        console.log('\nLog Statistics:');
        console.log(JSON.stringify(logger.getStatistics(), null, 2));

        // Get recent logs
        console.log('\nRecent Query Logs:');
        const queryLogs = logger.getRecentLogs({ category: LogCategories.QUERY });
        console.log(JSON.stringify(queryLogs, null, 2));

        // Export logs
        const exportPath = path.join(__dirname, '../logs/demo-export.json');
        await logger.exportLogs(exportPath);
        console.log(`\nLogs exported to: ${exportPath}`);

        // Shutdown
        await logger.shutdown();
        console.log('\n✅ Demo complete');
    }

    demo().catch(console.error);
}
