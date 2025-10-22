/**
 * API Key Authentication Middleware
 * Validates API keys from request headers
 */

const logger = require('../config/logger');

class AuthMiddleware {
  constructor(validApiKeys) {
    this.validApiKeys = new Set(validApiKeys || []);
  }

  /**
   * Add API key to valid keys
   */
  addApiKey(key) {
    this.validApiKeys.add(key);
    logger.info('API key added', { keyPreview: key.substring(0, 8) + '...' });
  }

  /**
   * Remove API key from valid keys
   */
  removeApiKey(key) {
    this.validApiKeys.delete(key);
    logger.info('API key removed', { keyPreview: key.substring(0, 8) + '...' });
  }

  /**
   * Middleware function to authenticate requests
   */
  authenticate() {
    return (req, res, next) => {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        logger.warn('Missing API key', {
          ip: req.ip,
          path: req.path
        });

        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_API_KEY',
            message: 'API key is required. Please provide X-API-Key header.'
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      }

      if (!this.validApiKeys.has(apiKey)) {
        logger.warn('Invalid API key', {
          ip: req.ip,
          path: req.path,
          keyPreview: apiKey.substring(0, 8) + '...'
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key. Please check your credentials.'
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      }

      // Attach API key info to request
      req.apiKey = apiKey;
      req.apiKeyPreview = apiKey.substring(0, 8) + '...';

      logger.debug('API key validated', {
        keyPreview: req.apiKeyPreview,
        path: req.path,
        method: req.method
      });

      next();
    };
  }

  /**
   * Optional authentication (for public endpoints with optional features)
   */
  optionalAuth() {
    return (req, res, next) => {
      const apiKey = req.headers['x-api-key'];

      if (apiKey && this.validApiKeys.has(apiKey)) {
        req.apiKey = apiKey;
        req.apiKeyPreview = apiKey.substring(0, 8) + '...';
        req.isAuthenticated = true;
      } else {
        req.isAuthenticated = false;
      }

      next();
    };
  }
}

module.exports = AuthMiddleware;
