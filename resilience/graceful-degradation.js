#!/usr/bin/env node

/**
 * Graceful Degradation System
 *
 * Features:
 * - Fallback responses when all platforms fail
 * - Cached response serving
 * - Partial response handling
 * - Response quality scoring
 * - Stale-while-revalidate pattern
 * - Cache warming strategies
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Cache Entry
 */
class CacheEntry {
    constructor(key, value, options = {}) {
        this.key = key;
        this.value = value;
        this.createdAt = Date.now();
        this.expiresAt = options.ttl ? Date.now() + options.ttl : null;
        this.quality = options.quality || 1.0;
        this.metadata = options.metadata || {};
        this.accessCount = 0;
        this.lastAccessAt = Date.now();
    }

    isExpired() {
        return this.expiresAt && Date.now() > this.expiresAt;
    }

    isStale(staleTtl) {
        if (!this.expiresAt) return false;
        const staleThreshold = this.expiresAt - staleTtl;
        return Date.now() > staleThreshold;
    }

    access() {
        this.accessCount++;
        this.lastAccessAt = Date.now();
    }

    getAge() {
        return Date.now() - this.createdAt;
    }

    toJSON() {
        return {
            key: this.key,
            value: this.value,
            createdAt: this.createdAt,
            expiresAt: this.expiresAt,
            quality: this.quality,
            metadata: this.metadata,
            accessCount: this.accessCount,
            lastAccessAt: this.lastAccessAt
        };
    }

    static fromJSON(json) {
        const entry = new CacheEntry(json.key, json.value, {
            quality: json.quality,
            metadata: json.metadata
        });
        entry.createdAt = json.createdAt;
        entry.expiresAt = json.expiresAt;
        entry.accessCount = json.accessCount;
        entry.lastAccessAt = json.lastAccessAt;
        return entry;
    }
}

/**
 * Response Cache
 */
class ResponseCache extends EventEmitter {
    constructor(options = {}) {
        super();

        this.maxSize = options.maxSize || 1000;
        this.defaultTtl = options.defaultTtl || 3600000; // 1 hour
        this.staleTtl = options.staleTtl || 300000; // 5 minutes
        this.persistPath = options.persistPath || './cache';
        this.persistEnabled = options.persistEnabled !== false;

        this.cache = new Map();
        this.accessLog = [];

        // Load persisted cache
        if (this.persistEnabled) {
            this.loadCache();
        }
    }

    /**
     * Generate cache key
     */
    generateKey(input) {
        const data = typeof input === 'string' ? input : JSON.stringify(input);
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * Set cache entry
     */
    set(key, value, options = {}) {
        // Check cache size limit
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evict();
        }

        const ttl = options.ttl || this.defaultTtl;
        const entry = new CacheEntry(key, value, { ...options, ttl });

        this.cache.set(key, entry);
        this.emit('cache_set', { key, ttl });

        // Persist if enabled
        if (this.persistEnabled) {
            this.persistCache();
        }

        return entry;
    }

    /**
     * Get cache entry
     */
    get(key, options = {}) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.emit('cache_miss', { key });
            return null;
        }

        entry.access();

        // Check if expired
        if (entry.isExpired()) {
            if (options.allowStale) {
                this.emit('cache_stale', { key, age: entry.getAge() });
                return { value: entry.value, stale: true, quality: entry.quality };
            }

            this.cache.delete(key);
            this.emit('cache_expired', { key });
            return null;
        }

        // Check if stale (but not expired)
        if (entry.isStale(this.staleTtl)) {
            this.emit('cache_stale', { key, age: entry.getAge() });
            return { value: entry.value, stale: true, quality: entry.quality };
        }

        this.emit('cache_hit', { key });
        return { value: entry.value, stale: false, quality: entry.quality };
    }

    /**
     * Evict least recently used entry
     */
    evict() {
        let lruKey = null;
        let lruTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessAt < lruTime) {
                lruTime = entry.lastAccessAt;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
            this.emit('cache_evicted', { key: lruKey });
        }
    }

    /**
     * Clear cache
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.emit('cache_cleared', { size });
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const entries = Array.from(this.cache.values());

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            totalAccesses: entries.reduce((sum, e) => sum + e.accessCount, 0),
            avgQuality: entries.length > 0
                ? entries.reduce((sum, e) => sum + e.quality, 0) / entries.length
                : 0,
            staleEntries: entries.filter(e => e.isStale(this.staleTtl)).length,
            expiredEntries: entries.filter(e => e.isExpired()).length
        };
    }

    /**
     * Persist cache to disk
     */
    async persistCache() {
        if (!this.persistEnabled) return;

        try {
            await fs.mkdir(this.persistPath, { recursive: true });
            const data = Array.from(this.cache.values()).map(e => e.toJSON());
            await fs.writeFile(
                path.join(this.persistPath, 'cache.json'),
                JSON.stringify(data, null, 2)
            );
        } catch (error) {
            console.error('Failed to persist cache:', error.message);
        }
    }

    /**
     * Load cache from disk
     */
    async loadCache() {
        try {
            const data = await fs.readFile(
                path.join(this.persistPath, 'cache.json'),
                'utf8'
            );
            const entries = JSON.parse(data);

            for (const json of entries) {
                const entry = CacheEntry.fromJSON(json);
                if (!entry.isExpired()) {
                    this.cache.set(entry.key, entry);
                }
            }

            this.emit('cache_loaded', { size: this.cache.size });
        } catch (error) {
            // File doesn't exist or invalid, skip
        }
    }
}

/**
 * Response Quality Scorer
 */
class QualityScorer {
    /**
     * Score response quality
     */
    static score(response, options = {}) {
        let score = 1.0;
        const factors = [];

        // Check completeness
        if (!response || typeof response !== 'object') {
            score *= 0.5;
            factors.push({ factor: 'incomplete', impact: -0.5 });
        }

        // Check response time
        if (options.responseTime) {
            if (options.responseTime > 30000) {
                score *= 0.7;
                factors.push({ factor: 'slow_response', impact: -0.3 });
            } else if (options.responseTime > 10000) {
                score *= 0.9;
                factors.push({ factor: 'moderate_response', impact: -0.1 });
            }
        }

        // Check content length
        if (response.content || response.text) {
            const content = response.content || response.text;
            const length = content.length;

            if (length < 50) {
                score *= 0.6;
                factors.push({ factor: 'short_content', impact: -0.4 });
            } else if (length < 200) {
                score *= 0.8;
                factors.push({ factor: 'moderate_content', impact: -0.2 });
            }
        }

        // Check error indicators
        if (response.error || response.errorMessage) {
            score *= 0.3;
            factors.push({ factor: 'contains_error', impact: -0.7 });
        }

        // Check partial response
        if (options.partial) {
            score *= 0.5;
            factors.push({ factor: 'partial_response', impact: -0.5 });
        }

        // Check age (for cached responses)
        if (options.age) {
            const ageInHours = options.age / 3600000;
            if (ageInHours > 24) {
                score *= 0.6;
                factors.push({ factor: 'very_old', impact: -0.4 });
            } else if (ageInHours > 1) {
                score *= 0.8;
                factors.push({ factor: 'old', impact: -0.2 });
            }
        }

        return {
            score: Math.max(0, Math.min(1, score)),
            factors
        };
    }
}

/**
 * Graceful Degradation Manager
 */
class GracefulDegradation extends EventEmitter {
    constructor(options = {}) {
        super();

        this.cache = new ResponseCache(options.cacheOptions);
        this.fallbackEnabled = options.fallbackEnabled !== false;
        this.partialResponseEnabled = options.partialResponseEnabled !== false;
        this.minQualityThreshold = options.minQualityThreshold || 0.3;

        // Fallback strategies
        this.fallbackStrategies = options.fallbackStrategies || [
            'cache',
            'partial',
            'generic'
        ];

        // Metrics
        this.metrics = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            fallbackUsed: 0,
            partialResponses: 0,
            genericResponses: 0
        };

        // Event listeners
        this.cache.on('cache_hit', () => this.metrics.cacheHits++);
        this.cache.on('cache_miss', () => this.metrics.cacheMisses++);
    }

    /**
     * Execute with graceful degradation
     */
    async execute(action, options = {}) {
        this.metrics.totalRequests++;

        const {
            cacheKey,
            allowStale = true,
            fallback = true,
            prompt
        } = options;

        // Generate cache key
        const key = cacheKey || this.cache.generateKey(prompt || action.toString());

        try {
            // Try to execute action
            const startTime = Date.now();
            const result = await action();
            const responseTime = Date.now() - startTime;

            // Score quality
            const quality = QualityScorer.score(result, { responseTime });

            // Cache successful response
            if (quality.score >= this.minQualityThreshold) {
                this.cache.set(key, result, {
                    quality: quality.score,
                    metadata: { responseTime, prompt }
                });
            }

            this.emit('success', {
                quality: quality.score,
                responseTime,
                cached: false
            });

            return {
                result,
                quality: quality.score,
                source: 'live',
                responseTime
            };

        } catch (error) {
            // Action failed, try fallback strategies
            if (!fallback) throw error;

            this.metrics.fallbackUsed++;
            this.emit('fallback_triggered', { error: error.message });

            for (const strategy of this.fallbackStrategies) {
                try {
                    const fallbackResult = await this.tryFallback(strategy, key, prompt, allowStale);
                    if (fallbackResult) {
                        return fallbackResult;
                    }
                } catch (fallbackError) {
                    // Continue to next strategy
                }
            }

            // All fallbacks failed
            throw error;
        }
    }

    /**
     * Try fallback strategy
     */
    async tryFallback(strategy, key, prompt, allowStale) {
        switch (strategy) {
            case 'cache':
                return await this.tryCacheFallback(key, allowStale);

            case 'partial':
                return await this.tryPartialResponse(prompt);

            case 'generic':
                return await this.tryGenericResponse(prompt);

            default:
                return null;
        }
    }

    /**
     * Try to serve from cache
     */
    async tryCacheFallback(key, allowStale) {
        const cached = this.cache.get(key, { allowStale });
        if (!cached) return null;

        this.emit('cache_served', {
            stale: cached.stale,
            quality: cached.quality
        });

        return {
            result: cached.value,
            quality: cached.quality,
            source: cached.stale ? 'cache_stale' : 'cache',
            stale: cached.stale
        };
    }

    /**
     * Try to provide partial response
     */
    async tryPartialResponse(prompt) {
        if (!this.partialResponseEnabled) return null;

        // Try to find similar cached responses
        const similar = await this.findSimilarCached(prompt);
        if (similar.length === 0) return null;

        this.metrics.partialResponses++;

        // Return best quality similar response
        const best = similar.sort((a, b) => b.quality - a.quality)[0];

        this.emit('partial_response', {
            quality: best.quality * 0.7,
            originalPrompt: prompt
        });

        return {
            result: {
                ...best.value,
                partial: true,
                note: 'This is a similar response from cache. The exact query could not be processed.'
            },
            quality: best.quality * 0.7, // Reduce quality for partial match
            source: 'partial'
        };
    }

    /**
     * Try to provide generic fallback response
     */
    async tryGenericResponse(prompt) {
        this.metrics.genericResponses++;

        this.emit('generic_response', { prompt });

        const genericResponse = {
            content: 'The AI service is currently unavailable. Please try again later.',
            error: true,
            fallback: true,
            timestamp: new Date().toISOString()
        };

        return {
            result: genericResponse,
            quality: 0.1,
            source: 'generic'
        };
    }

    /**
     * Find similar cached responses
     */
    async findSimilarCached(prompt) {
        const similar = [];
        const promptLower = (prompt || '').toLowerCase();
        const promptWords = new Set(promptLower.split(/\s+/));

        for (const entry of this.cache.cache.values()) {
            if (entry.isExpired()) continue;

            const cachedPrompt = (entry.metadata.prompt || '').toLowerCase();
            const cachedWords = new Set(cachedPrompt.split(/\s+/));

            // Calculate similarity
            const intersection = new Set([...promptWords].filter(x => cachedWords.has(x)));
            const union = new Set([...promptWords, ...cachedWords]);
            const similarity = intersection.size / union.size;

            if (similarity > 0.5) {
                similar.push({
                    ...entry,
                    similarity
                });
            }
        }

        return similar;
    }

    /**
     * Pre-warm cache with common queries
     */
    async warmCache(queries) {
        const results = [];

        for (const query of queries) {
            try {
                const key = this.cache.generateKey(query.prompt);
                if (query.response) {
                    const quality = QualityScorer.score(query.response);
                    this.cache.set(key, query.response, {
                        quality: quality.score,
                        metadata: { prompt: query.prompt, warmed: true }
                    });
                    results.push({ query: query.prompt, success: true });
                }
            } catch (error) {
                results.push({ query: query.prompt, success: false, error: error.message });
            }
        }

        this.emit('cache_warmed', { count: results.filter(r => r.success).length });
        return results;
    }

    /**
     * Get metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cache: this.cache.getStats(),
            cacheHitRate: this.metrics.totalRequests > 0
                ? this.metrics.cacheHits / this.metrics.totalRequests
                : 0,
            fallbackRate: this.metrics.totalRequests > 0
                ? this.metrics.fallbackUsed / this.metrics.totalRequests
                : 0
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// Export
module.exports = {
    GracefulDegradation,
    ResponseCache,
    QualityScorer,
    CacheEntry
};

// Demo
if (require.main === module) {
    async function demo() {
        console.log('=== Graceful Degradation Demo ===\n');

        const degradation = new GracefulDegradation({
            cacheOptions: {
                maxSize: 100,
                defaultTtl: 60000, // 1 minute for demo
                persistEnabled: false
            }
        });

        // Event listeners
        degradation.on('success', ({ quality, cached }) => {
            console.log(`[SUCCESS] Quality: ${quality.toFixed(2)}, Cached: ${cached}`);
        });

        degradation.on('fallback_triggered', ({ error }) => {
            console.log(`[FALLBACK] Triggered due to: ${error}`);
        });

        degradation.on('cache_served', ({ stale, quality }) => {
            console.log(`[CACHE] Served (stale: ${stale}, quality: ${quality.toFixed(2)})`);
        });

        degradation.on('partial_response', ({ quality }) => {
            console.log(`[PARTIAL] Response quality: ${quality.toFixed(2)}`);
        });

        degradation.on('generic_response', () => {
            console.log(`[GENERIC] Fallback response served`);
        });

        // Simulate action
        let callCount = 0;
        const simulateAction = async () => {
            callCount++;
            await new Promise(resolve => setTimeout(resolve, 100));

            if (callCount > 2) {
                throw new Error('Service unavailable');
            }

            return {
                content: `Response ${callCount}`,
                timestamp: Date.now()
            };
        };

        // Test 1: Success and caching
        console.log('Test 1: Success and caching\n');
        for (let i = 0; i < 3; i++) {
            try {
                const result = await degradation.execute(simulateAction, {
                    prompt: 'test query',
                    fallback: true,
                    allowStale: true
                });
                console.log(`Result: ${JSON.stringify(result)}\n`);
            } catch (error) {
                console.log(`Error: ${error.message}\n`);
            }
        }

        // Test 2: Fallback to cache
        console.log('\nTest 2: Fallback to cache after failure\n');
        for (let i = 0; i < 2; i++) {
            try {
                const result = await degradation.execute(async () => {
                    throw new Error('Platform timeout');
                }, {
                    prompt: 'test query',
                    fallback: true,
                    allowStale: true
                });
                console.log(`Result source: ${result.source}\n`);
            } catch (error) {
                console.log(`Error: ${error.message}\n`);
            }
        }

        // Show metrics
        console.log('\nMetrics:');
        console.log(JSON.stringify(degradation.getMetrics(), null, 2));
    }

    demo().catch(console.error);
}
