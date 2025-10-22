/**
 * Rate Limiting Middleware
 * Implements per-API-key rate limiting with sliding window
 */

const logger = require('../config/logger');

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.maxRequests = options.maxRequests || 100;
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.skipFailedRequests = options.skipFailedRequests || false;

    // Store: Map<apiKey, Array<timestamp>>
    this.requestLog = new Map();

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get rate limit middleware
   */
  middleware() {
    return async (req, res, next) => {
      const apiKey = req.apiKey || req.ip;
      const now = Date.now();

      // Get request log for this API key
      if (!this.requestLog.has(apiKey)) {
        this.requestLog.set(apiKey, []);
      }

      const requests = this.requestLog.get(apiKey);

      // Remove old requests outside the window
      const windowStart = now - this.windowMs;
      const recentRequests = requests.filter(timestamp => timestamp > windowStart);

      // Update the log
      this.requestLog.set(apiKey, recentRequests);

      // Check if limit exceeded
      const requestCount = recentRequests.length;
      const remaining = Math.max(0, this.maxRequests - requestCount);
      const resetTime = recentRequests.length > 0
        ? new Date(recentRequests[0] + this.windowMs)
        : new Date(now + this.windowMs);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime.toISOString());

      if (requestCount >= this.maxRequests) {
        logger.warn('Rate limit exceeded', {
          apiKey: req.apiKeyPreview || apiKey,
          requestCount,
          limit: this.maxRequests,
          resetTime: resetTime.toISOString()
        });

        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Maximum ${this.maxRequests} requests per ${this.windowMs / 1000 / 60} minutes.`,
            details: {
              limit: this.maxRequests,
              remaining: 0,
              resetTime: resetTime.toISOString(),
              retryAfter: Math.ceil((resetTime - now) / 1000)
            }
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      }

      // Log the request
      recentRequests.push(now);

      logger.debug('Rate limit check passed', {
        apiKey: req.apiKeyPreview || apiKey,
        requestCount: requestCount + 1,
        remaining: remaining - 1,
        limit: this.maxRequests
      });

      // Handle response to optionally skip counting
      const originalSend = res.send;
      res.send = function(data) {
        const statusCode = res.statusCode;

        // Remove the request from log if needed
        if (
          (this.skipSuccessfulRequests && statusCode < 400) ||
          (this.skipFailedRequests && statusCode >= 400)
        ) {
          const requests = this.requestLog.get(apiKey);
          requests.pop(); // Remove the last added request
        }

        return originalSend.call(this, data);
      }.bind(this);

      next();
    };
  }

  /**
   * Cleanup old entries from memory
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [apiKey, requests] of this.requestLog.entries()) {
      const recentRequests = requests.filter(timestamp => timestamp > windowStart);

      if (recentRequests.length === 0) {
        this.requestLog.delete(apiKey);
      } else {
        this.requestLog.set(apiKey, recentRequests);
      }
    }

    logger.debug('Rate limiter cleanup', {
      activeKeys: this.requestLog.size
    });
  }

  /**
   * Get current rate limit status for an API key
   */
  getStatus(apiKey) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const requests = this.requestLog.get(apiKey) || [];
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);

    return {
      requestCount: recentRequests.length,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - recentRequests.length),
      resetTime: recentRequests.length > 0
        ? new Date(recentRequests[0] + this.windowMs)
        : new Date(now + this.windowMs)
    };
  }

  /**
   * Reset rate limit for an API key
   */
  reset(apiKey) {
    this.requestLog.delete(apiKey);
    logger.info('Rate limit reset', { apiKey });
  }
}

module.exports = RateLimiter;
