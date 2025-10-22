/**
 * Request Validation Middleware
 * Uses Joi for schema validation
 */

const Joi = require('joi');
const logger = require('../config/logger');

class ValidationMiddleware {
  /**
   * Validate request against Joi schema
   */
  static validate(schema, source = 'body') {
    return (req, res, next) => {
      const data = req[source];

      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }));

        logger.warn('Validation failed', {
          source,
          path: req.path,
          errors: details
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: {
              errors: details
            }
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      }

      // Replace with validated and sanitized data
      req[source] = value;

      next();
    };
  }
}

// Common validation schemas
const schemas = {
  // Query submission
  query: Joi.object({
    query: Joi.string().required().min(1).max(10000),
    platform: Joi.string().valid(
      'claude', 'gpt', 'gemini', 'llama', 'auto'
    ).default('auto'),
    model: Joi.string().optional(),
    systemPrompt: Joi.string().optional().max(5000),
    temperature: Joi.number().min(0).max(2).default(0.7),
    maxTokens: Joi.number().min(1).max(100000).default(2000),
    stream: Joi.boolean().default(false),
    metadata: Joi.object().optional()
  }),

  // Batch query
  batch: Joi.object({
    queries: Joi.array().items(
      Joi.object({
        id: Joi.string().required(),
        query: Joi.string().required().min(1).max(10000),
        platform: Joi.string().optional(),
        model: Joi.string().optional(),
        systemPrompt: Joi.string().optional().max(5000)
      })
    ).min(1).max(10).required()
  }),

  // Compare query
  compare: Joi.object({
    query: Joi.string().required().min(1).max(10000),
    platforms: Joi.array().items(
      Joi.string().valid('claude', 'gpt', 'gemini', 'llama')
    ).min(2).max(4).required(),
    systemPrompt: Joi.string().optional().max(5000)
  }),

  // Query ID parameter
  queryId: Joi.object({
    id: Joi.string().uuid().required()
  }),

  // Platform name parameter
  platformName: Joi.object({
    name: Joi.string().valid('claude', 'gpt', 'gemini', 'llama').required()
  }),

  // Stats query
  statsQuery: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    groupBy: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
    platform: Joi.string().optional(),
    apiKey: Joi.string().optional()
  })
};

module.exports = {
  ValidationMiddleware,
  schemas
};
