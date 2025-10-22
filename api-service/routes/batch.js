/**
 * Batch Routes
 * Batch query processing endpoints
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ValidationMiddleware, schemas } = require('../middleware/validate');
const ErrorHandler = require('../middleware/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

// In-memory batch store
const batches = new Map();

/**
 * @swagger
 * /v1/batch:
 *   post:
 *     summary: Submit batch queries
 *     tags: [Batch]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - queries
 *             properties:
 *               queries:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - query
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Client-provided query ID
 *                     query:
 *                       type: string
 *                     platform:
 *                       type: string
 *                     model:
 *                       type: string
 *                     systemPrompt:
 *                       type: string
 *     responses:
 *       200:
 *         description: Batch submitted successfully
 */
router.post('/',
  ValidationMiddleware.validate(schemas.batch),
  ErrorHandler.asyncHandler(async (req, res) => {
    const batchId = uuidv4();
    const { queries: queryList } = req.body;

    const batch = {
      id: batchId,
      queries: queryList.map(q => ({
        ...q,
        status: 'pending',
        result: null,
        error: null
      })),
      status: 'pending',
      createdAt: new Date().toISOString(),
      apiKey: req.apiKey,
      totalQueries: queryList.length,
      completedQueries: 0,
      failedQueries: 0
    };

    batches.set(batchId, batch);

    logger.info('Batch submitted', {
      batchId,
      totalQueries: queryList.length,
      apiKey: req.apiKeyPreview
    });

    // Start async processing
    setImmediate(() => processBatch(batchId));

    res.json({
      success: true,
      data: {
        batchId,
        status: 'pending',
        totalQueries: queryList.length,
        estimatedTime: queryList.length * 3,
        retrieveUrl: `/v1/batch/${batchId}`
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
 * /v1/batch/{id}:
 *   get:
 *     summary: Get batch processing results
 *     tags: [Batch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Batch results
 */
router.get('/:id',
  ValidationMiddleware.validate(schemas.queryId, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const batch = batches.get(id);

    if (!batch) {
      throw ErrorHandler.createError(
        'BATCH_NOT_FOUND',
        'Batch not found',
        404,
        { batchId: id }
      );
    }

    if (batch.apiKey !== req.apiKey) {
      throw ErrorHandler.createError(
        'FORBIDDEN',
        'Access denied to this batch',
        403
      );
    }

    res.json({
      success: true,
      data: {
        batchId: batch.id,
        status: batch.status,
        totalQueries: batch.totalQueries,
        completedQueries: batch.completedQueries,
        failedQueries: batch.failedQueries,
        queries: batch.queries,
        createdAt: batch.createdAt,
        completedAt: batch.completedAt,
        processingTime: batch.processingTime
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
 * /v1/batch/{id}/cancel:
 *   post:
 *     summary: Cancel batch processing
 *     tags: [Batch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Batch cancelled
 */
router.post('/:id/cancel',
  ValidationMiddleware.validate(schemas.queryId, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const batch = batches.get(id);

    if (!batch) {
      throw ErrorHandler.createError(
        'BATCH_NOT_FOUND',
        'Batch not found',
        404,
        { batchId: id }
      );
    }

    if (batch.apiKey !== req.apiKey) {
      throw ErrorHandler.createError(
        'FORBIDDEN',
        'Access denied to this batch',
        403
      );
    }

    if (batch.status === 'completed') {
      throw ErrorHandler.createError(
        'BATCH_ALREADY_COMPLETED',
        'Cannot cancel completed batch',
        400
      );
    }

    batch.status = 'cancelled';
    batch.completedAt = new Date().toISOString();

    logger.info('Batch cancelled', {
      batchId: id,
      apiKey: req.apiKeyPreview
    });

    res.json({
      success: true,
      data: {
        batchId: id,
        status: 'cancelled'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  })
);

// Process batch queries
async function processBatch(batchId) {
  const batch = batches.get(batchId);
  if (!batch) return;

  try {
    batch.status = 'processing';
    batch.startedAt = new Date().toISOString();

    logger.info('Processing batch', {
      batchId,
      totalQueries: batch.totalQueries
    });

    // Process queries sequentially (or in parallel with Promise.all)
    for (const query of batch.queries) {
      if (batch.status === 'cancelled') break;

      try {
        query.status = 'processing';

        // Simulate processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        query.status = 'completed';
        query.result = {
          response: `[Simulated response for: ${query.query.substring(0, 30)}...]`,
          platform: query.platform || 'auto',
          tokensUsed: Math.floor(Math.random() * 500) + 50
        };

        batch.completedQueries++;

      } catch (error) {
        query.status = 'failed';
        query.error = {
          message: error.message,
          code: 'QUERY_PROCESSING_ERROR'
        };

        batch.failedQueries++;
      }
    }

    if (batch.status !== 'cancelled') {
      batch.status = 'completed';
    }

    batch.completedAt = new Date().toISOString();
    batch.processingTime = new Date(batch.completedAt) - new Date(batch.startedAt);

    logger.info('Batch completed', {
      batchId,
      status: batch.status,
      completed: batch.completedQueries,
      failed: batch.failedQueries
    });

  } catch (error) {
    batch.status = 'failed';
    batch.error = {
      message: error.message,
      code: 'BATCH_PROCESSING_ERROR'
    };

    logger.error('Batch processing failed', {
      batchId,
      error: error.message
    });
  }
}

module.exports = router;
