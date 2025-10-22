/**
 * Utility Functions
 * Common helper functions for the API service
 */

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = initialDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
}

/**
 * Generate a short hash for identifiers
 */
function generateShortId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Sanitize object for logging (remove sensitive data)
 */
function sanitizeForLogging(obj, sensitiveKeys = ['apiKey', 'password', 'token']) {
  const sanitized = { ...obj };
  sensitiveKeys.forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = '***REDACTED***';
    }
  });
  return sanitized;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format duration to human-readable string
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate URL format
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge objects deeply
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] instanceof Object && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Truncate string with ellipsis
 */
function truncate(str, maxLength = 50) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Calculate percentage
 */
function percentage(value, total, decimals = 2) {
  if (total === 0) return 0;
  return parseFloat(((value / total) * 100).toFixed(decimals));
}

/**
 * Rate limiter utility class
 */
class SimpleRateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const requests = this.requests.get(key);
    const recentRequests = requests.filter(time => time > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }

  reset(key) {
    this.requests.delete(key);
  }
}

/**
 * Circuit breaker utility
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'CLOSED';
    this.nextAttempt = Date.now();
  }
}

module.exports = {
  sleep,
  retryWithBackoff,
  generateShortId,
  sanitizeForLogging,
  formatBytes,
  formatDuration,
  isValidEmail,
  isValidUrl,
  deepClone,
  deepMerge,
  truncate,
  percentage,
  SimpleRateLimiter,
  CircuitBreaker
};
