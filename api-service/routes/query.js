/**
 * Query Routes
 * Handles query submission, retrieval, and streaming
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ValidationMiddleware, schemas } = require('../middleware/validate');
const ErrorHandler = require('../middleware/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

// In-memory query store (replace with database in production)
const queries = new Map();

/**
 * @swagger
 * /v1/query:
 *   post:
 *     summary: Submit a new query
 *     tags: [Queries]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The query text to process
 *                 example: "Explain quantum computing in simple terms"
 *               platform:
 *                 type: string
 *                 enum: [claude, gpt, gemini, llama, auto]
 *                 default: auto
 *                 description: AI platform to use (auto for intelligent selection)
 *               model:
 *                 type: string
 *                 description: Specific model to use (optional)
 *                 example: "claude-3-opus"
 *               systemPrompt:
 *                 type: string
 *                 description: System prompt to guide the AI
 *               temperature:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 2
 *                 default: 0.7
 *               maxTokens:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 100000
 *                 default: 2000
 *               stream:
 *                 type: boolean
 *                 default: false
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *     responses:
 *       200:
 *         description: Query submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     queryId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       enum: [pending, processing, completed, failed]
 *                     estimatedTime:
 *                       type: number
 *                       description: Estimated completion time in seconds
 */
router.post('/',
  ValidationMiddleware.validate(schemas.query),
  ErrorHandler.asyncHandler(async (req, res) => {
    const queryId = uuidv4();
    const queryData = {
      id: queryId,
      ...req.body,
      status: 'pending',
      createdAt: new Date().toISOString(),
      apiKey: req.apiKey,
      result: null,
      error: null
    };

    queries.set(queryId, queryData);

    logger.info('Query submitted', {
      queryId,
      platform: queryData.platform,
      apiKey: req.apiKeyPreview
    });

    // Async processing (simulate - replace with actual orchestrator)
    setImmediate(() => processQuery(queryId));

    res.json({
      success: true,
      data: {
        queryId,
        status: 'pending',
        estimatedTime: 5,
        retrieveUrl: `/v1/query/${queryId}`,
        streamUrl: `/v1/query/${queryId}/stream`
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
 * /v1/query/{id}:
 *   get:
 *     summary: Get query results
 *     tags: [Queries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Query ID
 *     responses:
 *       200:
 *         description: Query found
 *       404:
 *         description: Query not found
 */
router.get('/:id',
  ValidationMiddleware.validate(schemas.queryId, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const query = queries.get(id);

    if (!query) {
      throw ErrorHandler.createError(
        'QUERY_NOT_FOUND',
        'Query not found',
        404,
        { queryId: id }
      );
    }

    // Check if API key matches (privacy)
    if (query.apiKey !== req.apiKey) {
      throw ErrorHandler.createError(
        'FORBIDDEN',
        'Access denied to this query',
        403
      );
    }

    res.json({
      success: true,
      data: {
        queryId: query.id,
        status: query.status,
        query: query.query,
        platform: query.platform,
        model: query.model,
        result: query.result,
        error: query.error,
        createdAt: query.createdAt,
        completedAt: query.completedAt,
        processingTime: query.processingTime
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
 * /v1/query/{id}/stream:
 *   get:
 *     summary: Stream query results (SSE)
 *     tags: [Queries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: SSE stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get('/:id/stream',
  ValidationMiddleware.validate(schemas.queryId, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const query = queries.get(id);

    if (!query) {
      throw ErrorHandler.createError(
        'QUERY_NOT_FOUND',
        'Query not found',
        404,
        { queryId: id }
      );
    }

    if (query.apiKey !== req.apiKey) {
      throw ErrorHandler.createError(
        'FORBIDDEN',
        'Access denied to this query',
        403
      );
    }

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    logger.info('SSE stream started', {
      queryId: id,
      apiKey: req.apiKeyPreview
    });

    // Send initial status
    sendSSE(res, 'status', { status: query.status });

    // Poll for updates
    const pollInterval = setInterval(() => {
      const updatedQuery = queries.get(id);

      if (!updatedQuery) {
        clearInterval(pollInterval);
        sendSSE(res, 'error', { message: 'Query deleted' });
        res.end();
        return;
      }

      sendSSE(res, 'status', { status: updatedQuery.status });

      if (updatedQuery.status === 'completed') {
        sendSSE(res, 'result', updatedQuery.result);
        sendSSE(res, 'done', { processingTime: updatedQuery.processingTime });
        clearInterval(pollInterval);
        res.end();
      } else if (updatedQuery.status === 'failed') {
        sendSSE(res, 'error', updatedQuery.error);
        clearInterval(pollInterval);
        res.end();
      }
    }, 1000);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
      logger.info('SSE stream closed', { queryId: id });
    });
  })
);

// Helper function to send SSE events
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Simulate query processing (replace with actual orchestrator integration)
async function processQuery(queryId) {
  const query = queries.get(queryId);
  if (!query) return;

  try {
    query.status = 'processing';
    query.startedAt = new Date().toISOString();

    logger.info('Processing query', {
      queryId,
      platform: query.platform
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Simulate result
    query.status = 'completed';
    query.completedAt = new Date().toISOString();
    query.processingTime = new Date(query.completedAt) - new Date(query.startedAt);
    query.result = {
      response: `[Simulated ${query.platform} response for: ${query.query.substring(0, 50)}...]`,
      model: query.model || `${query.platform}-default`,
      tokensUsed: Math.floor(Math.random() * 1000) + 100,
      confidence: 0.95
    };

    logger.info('Query completed', {
      queryId,
      processingTime: query.processingTime
    });

  } catch (error) {
    query.status = 'failed';
    query.error = {
      message: error.message,
      code: 'PROCESSING_ERROR'
    };

    logger.error('Query processing failed', {
      queryId,
      error: error.message
    });
  }
}

module.exports = router;
