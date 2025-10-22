#!/usr/bin/env node

/**
 * Session Manager and Advanced Utilities
 *
 * Provides:
 * - Session persistence and recovery
 * - Cookie rotation and management
 * - Rate limit tracking and prediction
 * - Response caching
 * - Performance analytics
 * - Batch processing utilities
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SessionManager {
    constructor(config = {}) {
        this.config = {
            sessionsDir: config.sessionsDir || './sessions',
            cacheDir: config.cacheDir || './cache',
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 3600000, // 1 hour default
            ...config
        };

        this.sessions = new Map();
        this.cache = new Map();
        this.analytics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalDuration: 0,
            platformStats: new Map()
        };
    }

    /**
     * Initialize session manager
     */
    async initialize() {
        await this.ensureDirectories();
        await this.loadSessions();
        await this.loadCache();
    }

    /**
     * Ensure required directories exist
     */
    async ensureDirectories() {
        const dirs = [this.config.sessionsDir, this.config.cacheDir];

        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                console.warn(`Could not create directory ${dir}:`, error.message);
            }
        }
    }

    /**
     * Load existing sessions
     */
    async loadSessions() {
        try {
            const files = await fs.readdir(this.config.sessionsDir);

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filepath = path.join(this.config.sessionsDir, file);
                    const data = await fs.readFile(filepath, 'utf8');
                    const session = JSON.parse(data);

                    const platformName = file.replace('.json', '');
                    this.sessions.set(platformName, session);
                }
            }

            console.log(`Loaded ${this.sessions.size} sessions`);
        } catch (error) {
            console.log('No existing sessions found');
        }
    }

    /**
     * Save session for a platform
     */
    async saveSession(platformName, sessionData) {
        const session = {
            platformName,
            lastUsed: Date.now(),
            requestCount: (this.sessions.get(platformName)?.requestCount || 0) + 1,
            ...sessionData
        };

        this.sessions.set(platformName, session);

        const filepath = path.join(this.config.sessionsDir, `${platformName}.json`);
        await fs.writeFile(filepath, JSON.stringify(session, null, 2));

        return session;
    }

    /**
     * Get session for a platform
     */
    getSession(platformName) {
        return this.sessions.get(platformName);
    }

    /**
     * Load cache
     */
    async loadCache() {
        if (!this.config.cacheEnabled) return;

        try {
            const cacheFile = path.join(this.config.cacheDir, 'response-cache.json');
            const data = await fs.readFile(cacheFile, 'utf8');
            const cacheData = JSON.parse(data);

            // Load only non-expired entries
            const now = Date.now();
            Object.entries(cacheData).forEach(([key, entry]) => {
                if (now - entry.timestamp < this.config.cacheTTL) {
                    this.cache.set(key, entry);
                }
            });

            console.log(`Loaded ${this.cache.size} cached responses`);
        } catch (error) {
            console.log('No existing cache found');
        }
    }

    /**
     * Save cache to disk
     */
    async saveCache() {
        if (!this.config.cacheEnabled) return;

        const cacheData = {};
        this.cache.forEach((value, key) => {
            cacheData[key] = value;
        });

        const cacheFile = path.join(this.config.cacheDir, 'response-cache.json');
        await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
    }

    /**
     * Generate cache key for a request
     */
    generateCacheKey(platformName, prompt, options = {}) {
        const data = JSON.stringify({ platformName, prompt, options });
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * Get cached response
     */
    getCachedResponse(platformName, prompt, options = {}) {
        if (!this.config.cacheEnabled) return null;

        const key = this.generateCacheKey(platformName, prompt, options);
        const entry = this.cache.get(key);

        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.config.cacheTTL) {
            this.cache.delete(key);
            return null;
        }

        console.log(`Cache hit for ${platformName}`);
        return entry.response;
    }

    /**
     * Cache response
     */
    async cacheResponse(platformName, prompt, response, options = {}) {
        if (!this.config.cacheEnabled) return;

        const key = this.generateCacheKey(platformName, prompt, options);
        const entry = {
            platformName,
            prompt,
            response,
            options,
            timestamp: Date.now()
        };

        this.cache.set(key, entry);
        await this.saveCache();
    }

    /**
     * Clear cache
     */
    async clearCache() {
        this.cache.clear();
        await this.saveCache();
        console.log('Cache cleared');
    }

    /**
     * Record analytics for a request
     */
    recordRequest(platformName, duration, success, error = null) {
        this.analytics.totalRequests++;

        if (success) {
            this.analytics.successfulRequests++;
            this.analytics.totalDuration += parseFloat(duration);
        } else {
            this.analytics.failedRequests++;
        }

        // Platform-specific stats
        const platformStats = this.analytics.platformStats.get(platformName) || {
            requests: 0,
            successes: 0,
            failures: 0,
            totalDuration: 0,
            errors: []
        };

        platformStats.requests++;

        if (success) {
            platformStats.successes++;
            platformStats.totalDuration += parseFloat(duration);
        } else {
            platformStats.failures++;
            if (error) {
                platformStats.errors.push({
                    error: error,
                    timestamp: Date.now()
                });
            }
        }

        this.analytics.platformStats.set(platformName, platformStats);
    }

    /**
     * Get analytics summary
     */
    getAnalytics() {
        const avgDuration = this.analytics.successfulRequests > 0
            ? (this.analytics.totalDuration / this.analytics.successfulRequests).toFixed(2)
            : 0;

        const successRate = this.analytics.totalRequests > 0
            ? ((this.analytics.successfulRequests / this.analytics.totalRequests) * 100).toFixed(1)
            : 0;

        const platformAnalytics = {};
        this.analytics.platformStats.forEach((stats, platform) => {
            const platformAvg = stats.successes > 0
                ? (stats.totalDuration / stats.successes).toFixed(2)
                : 0;

            const platformSuccessRate = stats.requests > 0
                ? ((stats.successes / stats.requests) * 100).toFixed(1)
                : 0;

            platformAnalytics[platform] = {
                requests: stats.requests,
                successes: stats.successes,
                failures: stats.failures,
                avgDuration: `${platformAvg}s`,
                successRate: `${platformSuccessRate}%`,
                recentErrors: stats.errors.slice(-5)
            };
        });

        return {
            summary: {
                totalRequests: this.analytics.totalRequests,
                successful: this.analytics.successfulRequests,
                failed: this.analytics.failedRequests,
                successRate: `${successRate}%`,
                avgDuration: `${avgDuration}s`
            },
            platforms: platformAnalytics
        };
    }

    /**
     * Save analytics to file
     */
    async saveAnalytics() {
        const analytics = this.getAnalytics();
        const filepath = path.join(this.config.sessionsDir, 'analytics.json');
        await fs.writeFile(filepath, JSON.stringify(analytics, null, 2));
        return analytics;
    }

    /**
     * Cleanup old sessions and cache
     */
    async cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
        const now = Date.now();

        // Cleanup sessions
        for (const [platformName, session] of this.sessions) {
            if (now - session.lastUsed > maxAge) {
                this.sessions.delete(platformName);

                const filepath = path.join(this.config.sessionsDir, `${platformName}.json`);
                await fs.unlink(filepath).catch(() => {});
            }
        }

        // Cleanup cache
        const expiredKeys = [];
        this.cache.forEach((entry, key) => {
            if (now - entry.timestamp > this.config.cacheTTL) {
                expiredKeys.push(key);
            }
        });

        expiredKeys.forEach(key => this.cache.delete(key));
        await this.saveCache();

        console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
}

class RateLimitTracker {
    constructor(config = {}) {
        this.limits = new Map();
        this.config = {
            defaultRequestsPerMinute: config.defaultRequestsPerMinute || 5,
            defaultCooldownMs: config.defaultCooldownMs || 12000,
            ...config
        };
    }

    /**
     * Configure rate limit for a platform
     */
    setLimit(platformName, requestsPerMinute, cooldownMs) {
        this.limits.set(platformName, {
            requestsPerMinute,
            cooldownMs,
            requests: [],
            blocked: false,
            blockedUntil: 0
        });
    }

    /**
     * Check if request is allowed
     */
    canMakeRequest(platformName) {
        const limit = this.limits.get(platformName) || {
            requestsPerMinute: this.config.defaultRequestsPerMinute,
            cooldownMs: this.config.defaultCooldownMs,
            requests: []
        };

        const now = Date.now();

        // Check if blocked
        if (limit.blocked && now < limit.blockedUntil) {
            const waitTime = limit.blockedUntil - now;
            return {
                allowed: false,
                waitTime,
                reason: 'rate_limit'
            };
        } else if (limit.blocked && now >= limit.blockedUntil) {
            limit.blocked = false;
            limit.requests = [];
        }

        // Remove old requests
        const windowMs = 60000; // 1 minute
        limit.requests = limit.requests.filter(time => now - time < windowMs);

        // Check limit
        if (limit.requests.length >= limit.requestsPerMinute) {
            const oldestRequest = limit.requests[0];
            const waitTime = windowMs - (now - oldestRequest);

            return {
                allowed: false,
                waitTime,
                reason: 'rate_limit',
                currentRate: limit.requests.length,
                maxRate: limit.requestsPerMinute
            };
        }

        return {
            allowed: true,
            currentRate: limit.requests.length,
            maxRate: limit.requestsPerMinute,
            remainingRequests: limit.requestsPerMinute - limit.requests.length
        };
    }

    /**
     * Record a request
     */
    recordRequest(platformName) {
        const limit = this.limits.get(platformName) || {
            requestsPerMinute: this.config.defaultRequestsPerMinute,
            cooldownMs: this.config.defaultCooldownMs,
            requests: []
        };

        limit.requests.push(Date.now());
        this.limits.set(platformName, limit);
    }

    /**
     * Block platform temporarily (e.g., after rate limit error)
     */
    blockPlatform(platformName, durationMs) {
        const limit = this.limits.get(platformName) || {
            requestsPerMinute: this.config.defaultRequestsPerMinute,
            cooldownMs: this.config.defaultCooldownMs,
            requests: []
        };

        limit.blocked = true;
        limit.blockedUntil = Date.now() + durationMs;
        this.limits.set(platformName, limit);

        console.log(`Platform ${platformName} blocked for ${durationMs}ms`);
    }

    /**
     * Get rate limit status
     */
    getStatus(platformName) {
        const limit = this.limits.get(platformName);
        if (!limit) return null;

        const now = Date.now();
        const windowMs = 60000;

        const recentRequests = limit.requests.filter(time => now - time < windowMs);

        return {
            platform: platformName,
            blocked: limit.blocked,
            blockedUntil: limit.blocked ? new Date(limit.blockedUntil).toISOString() : null,
            requestsInWindow: recentRequests.length,
            maxRequests: limit.requestsPerMinute,
            utilizationPercent: ((recentRequests.length / limit.requestsPerMinute) * 100).toFixed(1)
        };
    }

    /**
     * Get all statuses
     */
    getAllStatuses() {
        const statuses = {};

        this.limits.forEach((_, platformName) => {
            statuses[platformName] = this.getStatus(platformName);
        });

        return statuses;
    }
}

class BatchProcessor {
    constructor(automation, config = {}) {
        this.automation = automation;
        this.config = {
            concurrency: config.concurrency || 3,
            retryOnFailure: config.retryOnFailure !== false,
            ...config
        };
    }

    /**
     * Process multiple prompts in batches
     */
    async processBatch(tasks, options = {}) {
        const results = [];
        const concurrency = options.concurrency || this.config.concurrency;

        console.log(`Processing ${tasks.length} tasks with concurrency ${concurrency}`);

        for (let i = 0; i < tasks.length; i += concurrency) {
            const batch = tasks.slice(i, i + concurrency);

            console.log(`Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(tasks.length / concurrency)}`);

            const batchResults = await Promise.all(
                batch.map(task =>
                    this.automation.sendPrompt(
                        task.platform,
                        task.prompt,
                        task.options || {}
                    ).catch(error => ({
                        ...task,
                        error: error.message,
                        success: false
                    }))
                )
            );

            results.push(...batchResults);

            // Pause between batches to avoid rate limiting
            if (i + concurrency < tasks.length) {
                await this.sleep(2000);
            }
        }

        return results;
    }

    /**
     * Process A/B comparison across platforms
     */
    async compareAcrossPlatforms(platforms, prompt, options = {}) {
        const tasks = platforms.map(platform => ({
            platform,
            prompt,
            options
        }));

        const results = await this.processBatch(tasks);

        return this.analyzeComparison(results);
    }

    /**
     * Analyze comparison results
     */
    analyzeComparison(results) {
        const successful = results.filter(r => r.success);

        return {
            totalPlatforms: results.length,
            successful: successful.length,
            failed: results.length - successful.length,
            responses: successful.map(r => ({
                platform: r.platformName,
                duration: r.duration,
                responseLength: r.response.length,
                response: r.response
            })),
            performance: {
                fastest: successful.reduce((min, r) =>
                    parseFloat(r.duration) < parseFloat(min.duration) ? r : min
                ),
                slowest: successful.reduce((max, r) =>
                    parseFloat(r.duration) > parseFloat(max.duration) ? r : max
                ),
                average: (successful.reduce((sum, r) =>
                    sum + parseFloat(r.duration), 0) / successful.length
                ).toFixed(2)
            }
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = {
    SessionManager,
    RateLimitTracker,
    BatchProcessor
};
