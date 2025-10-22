#!/usr/bin/env node

/**
 * Multi-Tier Response Cache Manager
 *
 * Implements an intelligent caching system with multiple tiers for optimal
 * performance. Supports in-memory caching (L1), Redis caching (L2),
 * cache warming, intelligent invalidation, and compression.
 *
 * Features:
 * - Multi-tier caching (Memory + Redis)
 * - Automatic cache warming
 * - Smart cache invalidation
 * - Response compression (zlib)
 * - TTL-based expiration
 * - LRU eviction policy
 * - Cache statistics and metrics
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const EventEmitter = require('events');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class CacheEntry {
    constructor(key, value, options = {}) {
        this.key = key;
        this.value = value;
        this.createdAt = Date.now();
        this.lastAccessed = Date.now();
        this.accessCount = 0;
        this.ttl = options.ttl || 3600000; // 1 hour default
        this.compressed = options.compressed || false;
        this.size = this.calculateSize(value);
        this.tags = options.tags || [];
    }

    calculateSize(value) {
        try {
            return Buffer.byteLength(JSON.stringify(value), 'utf8');
        } catch {
            return 0;
        }
    }

    isExpired() {
        return Date.now() - this.createdAt > this.ttl;
    }

    touch() {
        this.lastAccessed = Date.now();
        this.accessCount++;
    }

    getAge() {
        return Date.now() - this.createdAt;
    }

    getIdleTime() {
        return Date.now() - this.lastAccessed;
    }
}

class MemoryCache {
    constructor(config = {}) {
        this.config = {
            maxSize: config.maxSize || 1000, // Maximum entries
            maxMemory: config.maxMemory || 100 * 1024 * 1024, // 100MB
            ttl: config.ttl || 3600000, // 1 hour
            ...config
        };

        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            size: 0,
            memory: 0
        };
    }

    generateKey(key) {
        return crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex');
    }

    get(key) {
        const cacheKey = this.generateKey(key);
        const entry = this.cache.get(cacheKey);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        if (entry.isExpired()) {
            this.delete(cacheKey);
            this.stats.misses++;
            return null;
        }

        entry.touch();
        this.stats.hits++;
        return entry.value;
    }

    set(key, value, options = {}) {
        const cacheKey = this.generateKey(key);

        // Check if we need to evict entries
        if (this.cache.size >= this.config.maxSize) {
            this.evictLRU();
        }

        const entry = new CacheEntry(cacheKey, value, {
            ttl: options.ttl || this.config.ttl,
            tags: options.tags,
            compressed: options.compressed
        });

        this.cache.set(cacheKey, entry);
        this.stats.sets++;
        this.updateStats();

        return true;
    }

    delete(key) {
        const cacheKey = typeof key === 'string' && key.length === 64 ? key : this.generateKey(key);
        const deleted = this.cache.delete(cacheKey);
        if (deleted) {
            this.stats.deletes++;
            this.updateStats();
        }
        return deleted;
    }

    clear() {
        this.cache.clear();
        this.updateStats();
    }

    evictLRU() {
        let oldestEntry = null;
        let oldestKey = null;

        for (const [key, entry] of this.cache) {
            if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
                oldestEntry = entry;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    invalidateByTag(tag) {
        let count = 0;
        for (const [key, entry] of this.cache) {
            if (entry.tags.includes(tag)) {
                this.cache.delete(key);
                count++;
            }
        }
        this.updateStats();
        return count;
    }

    updateStats() {
        this.stats.size = this.cache.size;
        this.stats.memory = Array.from(this.cache.values())
            .reduce((sum, entry) => sum + entry.size, 0);
    }

    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            memoryUsage: `${(this.stats.memory / 1024 / 1024).toFixed(2)} MB`
        };
    }
}

class CacheManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enableCompression: config.enableCompression !== false,
            compressionThreshold: config.compressionThreshold || 1024, // 1KB
            warmingEnabled: config.warmingEnabled !== false,
            warmingInterval: config.warmingInterval || 300000, // 5 minutes
            l1: {
                maxSize: config.l1MaxSize || 1000,
                maxMemory: config.l1MaxMemory || 100 * 1024 * 1024,
                ttl: config.l1Ttl || 300000 // 5 minutes
            },
            l2: {
                enabled: config.l2Enabled || false,
                ttl: config.l2Ttl || 3600000 // 1 hour
            },
            ...config
        };

        this.l1Cache = new MemoryCache(this.config.l1);
        this.l2Cache = null; // Would be Redis in production
        this.warmingTimer = null;
        this.warmingPatterns = [];

        // Metrics
        this.metrics = {
            totalRequests: 0,
            l1Hits: 0,
            l2Hits: 0,
            misses: 0,
            compressionSavings: 0,
            warmingExecutions: 0
        };
    }

    async get(key, options = {}) {
        this.metrics.totalRequests++;

        // Try L1 cache first
        const l1Value = this.l1Cache.get(key);
        if (l1Value !== null) {
            this.metrics.l1Hits++;
            this.emit('hit', 'L1', key);
            return await this.decompress(l1Value);
        }

        // Try L2 cache if enabled
        if (this.config.l2.enabled && this.l2Cache) {
            const l2Value = await this.getFromL2(key);
            if (l2Value !== null) {
                this.metrics.l2Hits++;
                this.emit('hit', 'L2', key);

                // Promote to L1
                this.l1Cache.set(key, l2Value, options);

                return await this.decompress(l2Value);
            }
        }

        this.metrics.misses++;
        this.emit('miss', key);
        return null;
    }

    async set(key, value, options = {}) {
        try {
            // Compress if enabled and value is large enough
            let processedValue = value;
            let compressed = false;

            if (this.config.enableCompression) {
                const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
                if (size >= this.config.compressionThreshold) {
                    processedValue = await this.compress(value);
                    compressed = true;

                    const compressedSize = Buffer.byteLength(JSON.stringify(processedValue), 'utf8');
                    this.metrics.compressionSavings += (size - compressedSize);

                    this.emit('compressed', key, size, compressedSize);
                }
            }

            // Store in L1
            this.l1Cache.set(key, processedValue, {
                ...options,
                compressed
            });

            // Store in L2 if enabled
            if (this.config.l2.enabled && this.l2Cache) {
                await this.setToL2(key, processedValue, options);
            }

            this.emit('set', key);
            return true;
        } catch (error) {
            console.error('[Cache] Error setting cache:', error.message);
            return false;
        }
    }

    async compress(value) {
        try {
            const json = JSON.stringify(value);
            const compressed = await gzip(Buffer.from(json, 'utf8'));
            return {
                _compressed: true,
                data: compressed.toString('base64')
            };
        } catch (error) {
            console.error('[Cache] Compression error:', error.message);
            return value;
        }
    }

    async decompress(value) {
        try {
            if (value && value._compressed) {
                const buffer = Buffer.from(value.data, 'base64');
                const decompressed = await gunzip(buffer);
                return JSON.parse(decompressed.toString('utf8'));
            }
            return value;
        } catch (error) {
            console.error('[Cache] Decompression error:', error.message);
            return value;
        }
    }

    async delete(key) {
        this.l1Cache.delete(key);

        if (this.config.l2.enabled && this.l2Cache) {
            await this.deleteFromL2(key);
        }

        this.emit('delete', key);
        return true;
    }

    async clear() {
        this.l1Cache.clear();

        if (this.config.l2.enabled && this.l2Cache) {
            await this.clearL2();
        }

        this.emit('clear');
        return true;
    }

    async invalidateByTag(tag) {
        const l1Count = this.l1Cache.invalidateByTag(tag);

        let l2Count = 0;
        if (this.config.l2.enabled && this.l2Cache) {
            l2Count = await this.invalidateL2ByTag(tag);
        }

        this.emit('invalidate', tag, l1Count + l2Count);
        console.log(`[Cache] Invalidated ${l1Count + l2Count} entries with tag: ${tag}`);

        return l1Count + l2Count;
    }

    async invalidateByPattern(pattern) {
        // Pattern-based invalidation (e.g., "platform:*", "query:search:*")
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        let count = 0;

        for (const [key] of this.l1Cache.cache) {
            if (regex.test(key)) {
                await this.delete(key);
                count++;
            }
        }

        this.emit('invalidatePattern', pattern, count);
        console.log(`[Cache] Invalidated ${count} entries matching pattern: ${pattern}`);

        return count;
    }

    addWarmingPattern(pattern, fetcher, options = {}) {
        this.warmingPatterns.push({
            pattern,
            fetcher,
            interval: options.interval || this.config.warmingInterval,
            lastExecution: 0,
            ...options
        });

        console.log(`[Cache] Added warming pattern: ${pattern}`);
    }

    startWarming() {
        if (!this.config.warmingEnabled) {
            console.log('[Cache] Cache warming is disabled');
            return;
        }

        console.log('[Cache] Starting cache warming...');

        this.warmingTimer = setInterval(async () => {
            await this.executeWarming();
        }, 60000); // Check every minute

        // Execute immediately
        this.executeWarming();
    }

    async executeWarming() {
        console.log('[Cache] Executing cache warming...');
        this.metrics.warmingExecutions++;

        const now = Date.now();

        for (const pattern of this.warmingPatterns) {
            if (now - pattern.lastExecution >= pattern.interval) {
                try {
                    console.log(`[Cache] Warming pattern: ${pattern.pattern}`);

                    const data = await pattern.fetcher();
                    await this.set(pattern.pattern, data, {
                        ttl: pattern.ttl || this.config.l1.ttl,
                        tags: pattern.tags || []
                    });

                    pattern.lastExecution = now;
                    this.emit('warmed', pattern.pattern);
                } catch (error) {
                    console.error(`[Cache] Warming error for ${pattern.pattern}:`, error.message);
                }
            }
        }
    }

    stopWarming() {
        if (this.warmingTimer) {
            clearInterval(this.warmingTimer);
            this.warmingTimer = null;
            console.log('[Cache] Cache warming stopped');
        }
    }

    // L2 Cache methods (Redis placeholders)
    async getFromL2(key) {
        // TODO: Implement Redis get
        return null;
    }

    async setToL2(key, value, options) {
        // TODO: Implement Redis set
        return true;
    }

    async deleteFromL2(key) {
        // TODO: Implement Redis delete
        return true;
    }

    async clearL2() {
        // TODO: Implement Redis clear
        return true;
    }

    async invalidateL2ByTag(tag) {
        // TODO: Implement Redis tag-based invalidation
        return 0;
    }

    getMetrics() {
        const l1Stats = this.l1Cache.getStats();
        const hitRate = this.metrics.totalRequests > 0
            ? ((this.metrics.l1Hits + this.metrics.l2Hits) / this.metrics.totalRequests * 100).toFixed(2)
            : 0;

        return {
            ...this.metrics,
            hitRate: `${hitRate}%`,
            l1Stats,
            compressionSavings: `${(this.metrics.compressionSavings / 1024 / 1024).toFixed(2)} MB`,
            timestamp: new Date().toISOString()
        };
    }

    async shutdown() {
        console.log('[Cache] Shutting down cache manager...');

        this.stopWarming();
        await this.clear();

        this.emit('shutdown', this.getMetrics());
        console.log('[Cache] Cache manager shut down successfully');
    }
}

module.exports = { CacheManager, MemoryCache };

// Demo
if (require.main === module) {
    async function demo() {
        const cache = new CacheManager({
            enableCompression: true,
            compressionThreshold: 100,
            warmingEnabled: true,
            l1MaxSize: 100
        });

        // Listen to events
        cache.on('hit', (tier, key) => console.log(`✓ Cache hit (${tier}): ${key.substring(0, 16)}...`));
        cache.on('miss', (key) => console.log(`✗ Cache miss: ${key.substring(0, 16)}...`));
        cache.on('compressed', (key, before, after) => {
            const ratio = ((1 - after / before) * 100).toFixed(2);
            console.log(`✓ Compressed: ${before} → ${after} bytes (${ratio}% savings)`);
        });

        console.log('=== Testing basic cache operations ===\n');

        // Set values
        await cache.set('user:123', { name: 'John Doe', email: 'john@example.com' });
        await cache.set('user:456', { name: 'Jane Smith', email: 'jane@example.com' });

        // Get values
        const user1 = await cache.get('user:123');
        console.log('Retrieved user:', user1);

        const user2 = await cache.get('user:456');
        console.log('Retrieved user:', user2);

        // Cache miss
        const user3 = await cache.get('user:789');
        console.log('Non-existent user:', user3);

        console.log('\n=== Testing compression ===\n');

        // Large value for compression
        const largeData = {
            data: 'Lorem ipsum dolor sit amet, '.repeat(100),
            metadata: { timestamp: Date.now() }
        };
        await cache.set('large:data', largeData);

        console.log('\n=== Testing tag-based invalidation ===\n');

        await cache.set('query:search:1', { results: [1, 2, 3] }, { tags: ['search'] });
        await cache.set('query:search:2', { results: [4, 5, 6] }, { tags: ['search'] });
        await cache.set('query:filter:1', { results: [7, 8, 9] }, { tags: ['filter'] });

        const invalidated = await cache.invalidateByTag('search');
        console.log(`Invalidated ${invalidated} entries`);

        console.log('\n=== Testing cache warming ===\n');

        cache.addWarmingPattern('popular:items', async () => {
            console.log('Fetching popular items for warming...');
            return { items: ['item1', 'item2', 'item3'] };
        }, { interval: 5000, tags: ['popular'] });

        cache.startWarming();

        // Wait for warming
        await new Promise(resolve => setTimeout(resolve, 2000));

        const popularItems = await cache.get('popular:items');
        console.log('Warmed data:', popularItems);

        console.log('\n=== Cache metrics ===\n');
        console.log(JSON.stringify(cache.getMetrics(), null, 2));

        await cache.shutdown();
    }

    demo().catch(console.error);
}
