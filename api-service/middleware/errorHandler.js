/**
 * Centralized Error Handling Middleware
 * Handles all errors and formats responses consistently
 */

const logger = require('../config/logger');

class ErrorHandler {
  /**
   * Custom API Error class
   */
  static ApiError = class extends Error {
    constructor(code, message, statusCode = 500, details = {}) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.details = details;
      this.isOperational = true;
      Error.captureStackTrace(this, this.constructor);
    }
  };

  /**
   * Error handler middleware
   */
  static middleware() {
    return (err, req, res, next) => {
      // Default error values
      let statusCode = err.statusCode || 500;
      let code = err.code || 'INTERNAL_SERVER_ERROR';
      let message = err.message || 'An unexpected error occurred';
      let details = err.details || {};

      // Handle specific error types
      if (err.name === 'ValidationError') {
        statusCode = 400;
        code = 'VALIDATION_ERROR';
      } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        code = 'UNAUTHORIZED';
      } else if (err.name === 'CastError') {
        statusCode = 400;
        code = 'INVALID_FORMAT';
        message = 'Invalid data format';
      }

      // Log error
      logger.error('Request error', {
        code,
        message,
        statusCode,
        path: req.path,
        method: req.method,
        apiKey: req.apiKeyPreview,
        stack: err.stack,
        details
      });

      // Don't expose internal errors in production
      if (statusCode === 500 && process.env.NODE_ENV === 'production') {
        message = 'Internal server error';
        details = {};
      }

      // Send error response
      res.status(statusCode).json({
        success: false,
        error: {
          code,
          message,
          details
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: req.id
        }
      });
    };
  }

  /**
   * 404 Not Found handler
   */
  static notFound() {
    return (req, res) => {
      logger.warn('Route not found', {
        path: req.path,
        method: req.method,
        apiKey: req.apiKeyPreview
      });

      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.path} not found`,
          details: {
            availableRoutes: [
              'POST /v1/query',
              'GET /v1/query/:id',
              'GET /v1/query/:id/stream',
              'GET /v1/platforms',
              'GET /v1/platforms/:name/status',
              'POST /v1/batch',
              'GET /v1/compare',
              'GET /v1/stats'
            ]
          }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: req.id
        }
      });
    };
  }

  /**
   * Async handler wrapper
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Create error response
   */
  static createError(code, message, statusCode = 500, details = {}) {
    return new this.ApiError(code, message, statusCode, details);
  }
}

module.exports = ErrorHandler;
