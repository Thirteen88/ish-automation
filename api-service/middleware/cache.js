/**
 * Response Caching Middleware
 * In-memory cache with TTL and LRU eviction
 */

const crypto = require('crypto');
const logger = require('../config/logger');

class CacheMiddleware {
  constructor(options = {}) {
    this.ttl = options.ttl || 300000; // 5 minutes default
    this.maxSize = options.maxSize || 1000; // Maximum cache entries
    this.cache = new Map();
    this.accessOrder = new Map(); // For LRU tracking

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Generate cache key from request
   */
  generateKey(req) {
    const parts = [
      req.method,
      req.path,
      JSON.stringify(req.query),
      JSON.stringify(req.body),
      req.apiKey || 'anonymous'
    ];

    const hash = crypto
      .createHash('md5')
      .update(parts.join(':'))
      .digest('hex');

    return hash;
  }

  /**
   * Cache middleware
   */
  middleware(options = {}) {
    const cacheTTL = options.ttl || this.ttl;
    const cacheKey = options.key;

    return (req, res, next) => {
      // Skip cache for non-GET requests unless explicitly enabled
      if (req.method !== 'GET' && !options.forceCacheAll) {
        return next();
      }

      const key = cacheKey || this.generateKey(req);

      // Check cache
      const cached = this.get(key);
      if (cached) {
        logger.debug('Cache hit', {
          key: key.substring(0, 16),
          path: req.path,
          age: Date.now() - cached.timestamp
        });

        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Age', Math.floor((Date.now() - cached.timestamp) / 1000));
        return res.json(cached.data);
      }

      // Cache miss - intercept response
      res.setHeader('X-Cache', 'MISS');

      const originalJson = res.json.bind(res);
      res.json = (data) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.set(key, data, cacheTTL);

          logger.debug('Cache set', {
            key: key.substring(0, 16),
            path: req.path,
            ttl: cacheTTL
          });
        }

        return originalJson(data);
      };

      next();
    };
  }

  /**
   * Get value from cache
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }

    // Update access order (LRU)
    this.accessOrder.set(key, Date.now());

    return entry;
  }

  /**
   * Set value in cache
   */
  set(key, data, ttl = this.ttl) {
    // Enforce max size with LRU eviction
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl
    });

    this.accessOrder.set(key, Date.now());
  }

  /**
   * Delete value from cache
   */
  delete(key) {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    logger.info('Cache cleared');
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);

      logger.debug('LRU eviction', {
        key: oldestKey.substring(0, 16),
        age: Date.now() - oldestTime
      });
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cache cleanup', {
        cleaned,
        remaining: this.cache.size
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expired = 0;

    for (const [_, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired,
      active: this.cache.size - expired,
      utilizationPercent: (this.cache.size / this.maxSize * 100).toFixed(2)
    };
  }

  /**
   * Invalidate cache by pattern
   */
  invalidatePattern(pattern) {
    let invalidated = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        invalidated++;
      }
    }

    logger.info('Cache invalidated by pattern', {
      pattern,
      invalidated
    });

    return invalidated;
  }
}

module.exports = CacheMiddleware;
