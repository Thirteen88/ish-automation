/**
 * Compare Routes
 * Multi-platform response comparison endpoints
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ValidationMiddleware, schemas } = require('../middleware/validate');
const ErrorHandler = require('../middleware/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

// In-memory comparison store
const comparisons = new Map();

/**
 * @swagger
 * /v1/compare:
 *   post:
 *     summary: Compare responses across platforms
 *     tags: [Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - platforms
 *             properties:
 *               query:
 *                 type: string
 *               platforms:
 *                 type: array
 *                 minItems: 2
 *                 maxItems: 4
 *                 items:
 *                   type: string
 *                   enum: [claude, gpt, gemini, llama]
 *               systemPrompt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comparison started
 */
router.post('/',
  ValidationMiddleware.validate(schemas.compare),
  ErrorHandler.asyncHandler(async (req, res) => {
    const comparisonId = uuidv4();
    const { query, platforms: platformList, systemPrompt } = req.body;

    const comparison = {
      id: comparisonId,
      query,
      platforms: platformList,
      systemPrompt,
      status: 'pending',
      createdAt: new Date().toISOString(),
      apiKey: req.apiKey,
      results: platformList.map(platform => ({
        platform,
        status: 'pending',
        result: null,
        error: null,
        metrics: null
      }))
    };

    comparisons.set(comparisonId, comparison);

    logger.info('Comparison started', {
      comparisonId,
      platforms: platformList,
      apiKey: req.apiKeyPreview
    });

    // Start async processing
    setImmediate(() => processComparison(comparisonId));

    res.json({
      success: true,
      data: {
        comparisonId,
        status: 'pending',
        platforms: platformList,
        estimatedTime: platformList.length * 3,
        retrieveUrl: `/v1/compare/${comparisonId}`
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  })
);

/**
 * @swagger
 * /v1/compare/{id}:
 *   get:
 *     summary: Get comparison results
 *     tags: [Analytics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Comparison results
 */
router.get('/:id',
  ValidationMiddleware.validate(schemas.queryId, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const comparison = comparisons.get(id);

    if (!comparison) {
      throw ErrorHandler.createError(
        'COMPARISON_NOT_FOUND',
        'Comparison not found',
        404,
        { comparisonId: id }
      );
    }

    if (comparison.apiKey !== req.apiKey) {
      throw ErrorHandler.createError(
        'FORBIDDEN',
        'Access denied to this comparison',
        403
      );
    }

    // Calculate summary if completed
    let summary = null;
    if (comparison.status === 'completed') {
      summary = calculateComparisonSummary(comparison);
    }

    res.json({
      success: true,
      data: {
        comparisonId: comparison.id,
        query: comparison.query,
        status: comparison.status,
        platforms: comparison.platforms,
        results: comparison.results,
        summary,
        createdAt: comparison.createdAt,
        completedAt: comparison.completedAt,
        processingTime: comparison.processingTime
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  })
);

// Process comparison across platforms
async function processComparison(comparisonId) {
  const comparison = comparisons.get(comparisonId);
  if (!comparison) return;

  try {
    comparison.status = 'processing';
    comparison.startedAt = new Date().toISOString();

    logger.info('Processing comparison', {
      comparisonId,
      platforms: comparison.platforms
    });

    // Process all platforms in parallel
    await Promise.all(
      comparison.results.map(async (result) => {
        try {
          result.status = 'processing';
          const startTime = Date.now();

          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

          const endTime = Date.now();

          result.status = 'completed';
          result.result = {
            response: `[${result.platform} response to: ${comparison.query.substring(0, 40)}...]`,
            model: `${result.platform}-default`,
            tokensUsed: Math.floor(Math.random() * 1000) + 200,
            confidence: 0.9 + Math.random() * 0.1
          };

          result.metrics = {
            responseTime: endTime - startTime,
            tokensPerSecond: result.result.tokensUsed / ((endTime - startTime) / 1000),
            responseLength: result.result.response.length
          };

        } catch (error) {
          result.status = 'failed';
          result.error = {
            message: error.message,
            code: 'PLATFORM_ERROR'
          };
        }
      })
    );

    comparison.status = 'completed';
    comparison.completedAt = new Date().toISOString();
    comparison.processingTime = new Date(comparison.completedAt) - new Date(comparison.startedAt);

    logger.info('Comparison completed', {
      comparisonId,
      processingTime: comparison.processingTime
    });

  } catch (error) {
    comparison.status = 'failed';
    comparison.error = {
      message: error.message,
      code: 'COMPARISON_ERROR'
    };

    logger.error('Comparison failed', {
      comparisonId,
      error: error.message
    });
  }
}

// Calculate comparison summary and analytics
function calculateComparisonSummary(comparison) {
  const completed = comparison.results.filter(r => r.status === 'completed');

  if (completed.length === 0) {
    return null;
  }

  // Find fastest and most token-efficient
  const fastest = completed.reduce((prev, curr) =>
    prev.metrics.responseTime < curr.metrics.responseTime ? prev : curr
  );

  const mostEfficient = completed.reduce((prev, curr) =>
    prev.metrics.tokensPerSecond > curr.metrics.tokensPerSecond ? prev : curr
  );

  // Average metrics
  const avgResponseTime = completed.reduce((sum, r) => sum + r.metrics.responseTime, 0) / completed.length;
  const avgTokens = completed.reduce((sum, r) => sum + r.result.tokensUsed, 0) / completed.length;

  return {
    totalPlatforms: comparison.platforms.length,
    successfulResponses: completed.length,
    failedResponses: comparison.results.filter(r => r.status === 'failed').length,
    fastest: {
      platform: fastest.platform,
      responseTime: fastest.metrics.responseTime
    },
    mostEfficient: {
      platform: mostEfficient.platform,
      tokensPerSecond: mostEfficient.metrics.tokensPerSecond
    },
    averageMetrics: {
      responseTime: Math.round(avgResponseTime),
      tokensUsed: Math.round(avgTokens)
    },
    recommendations: generateRecommendations(completed)
  };
}

// Generate platform recommendations
function generateRecommendations(results) {
  const recommendations = [];

  // Speed recommendation
  const fastest = results.reduce((prev, curr) =>
    prev.metrics.responseTime < curr.metrics.responseTime ? prev : curr
  );
  recommendations.push({
    category: 'speed',
    platform: fastest.platform,
    reason: `Fastest response time (${fastest.metrics.responseTime}ms)`
  });

  // Quality recommendation (based on confidence)
  const highestConfidence = results.reduce((prev, curr) =>
    prev.result.confidence > curr.result.confidence ? prev : curr
  );
  recommendations.push({
    category: 'quality',
    platform: highestConfidence.platform,
    reason: `Highest confidence score (${(highestConfidence.result.confidence * 100).toFixed(1)}%)`
  });

  return recommendations;
}

module.exports = router;
