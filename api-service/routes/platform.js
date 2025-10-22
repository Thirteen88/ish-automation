/**
 * Platform Routes
 * Platform information and health status endpoints
 */

const express = require('express');
const { ValidationMiddleware, schemas } = require('../middleware/validate');
const ErrorHandler = require('../middleware/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

// Platform registry (sync with orchestrator)
const platforms = {
  claude: {
    name: 'claude',
    displayName: 'Claude (Anthropic)',
    provider: 'Anthropic',
    models: [
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-2.1',
      'claude-2'
    ],
    capabilities: ['reasoning', 'coding', 'analysis', 'creative', 'long-context'],
    contextWindow: 200000,
    status: 'available',
    latency: 0,
    successRate: 100
  },
  gpt: {
    name: 'gpt',
    displayName: 'GPT (OpenAI)',
    provider: 'OpenAI',
    models: [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4-vision',
      'gpt-3.5-turbo'
    ],
    capabilities: ['reasoning', 'coding', 'analysis', 'creative', 'vision'],
    contextWindow: 128000,
    status: 'available',
    latency: 0,
    successRate: 100
  },
  gemini: {
    name: 'gemini',
    displayName: 'Gemini (Google)',
    provider: 'Google',
    models: [
      'gemini-pro',
      'gemini-pro-vision',
      'gemini-ultra'
    ],
    capabilities: ['reasoning', 'analysis', 'multimodal', 'vision'],
    contextWindow: 32000,
    status: 'available',
    latency: 0,
    successRate: 100
  },
  llama: {
    name: 'llama',
    displayName: 'Llama (Meta)',
    provider: 'Meta',
    models: [
      'llama-3-70b',
      'llama-3-8b',
      'llama-2-70b'
    ],
    capabilities: ['reasoning', 'coding', 'analysis'],
    contextWindow: 8000,
    status: 'available',
    latency: 0,
    successRate: 100
  }
};

/**
 * @swagger
 * /v1/platforms:
 *   get:
 *     summary: List all available platforms
 *     tags: [Platforms]
 *     responses:
 *       200:
 *         description: List of platforms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     platforms:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Platform'
 */
router.get('/',
  ErrorHandler.asyncHandler(async (req, res) => {
    const platformList = Object.values(platforms).map(platform => ({
      name: platform.name,
      displayName: platform.displayName,
      provider: platform.provider,
      models: platform.models,
      capabilities: platform.capabilities,
      contextWindow: platform.contextWindow,
      status: platform.status
    }));

    logger.debug('Platforms listed', {
      count: platformList.length,
      apiKey: req.apiKeyPreview
    });

    res.json({
      success: true,
      data: {
        platforms: platformList,
        count: platformList.length
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
 * /v1/platforms/{name}:
 *   get:
 *     summary: Get detailed platform information
 *     tags: [Platforms]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Platform details
 *       404:
 *         description: Platform not found
 */
router.get('/:name',
  ValidationMiddleware.validate(schemas.platformName, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { name } = req.params;
    const platform = platforms[name];

    if (!platform) {
      throw ErrorHandler.createError(
        'PLATFORM_NOT_FOUND',
        'Platform not found',
        404,
        { platformName: name }
      );
    }

    res.json({
      success: true,
      data: { platform },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  })
);

/**
 * @swagger
 * /v1/platforms/{name}/status:
 *   get:
 *     summary: Get platform health status
 *     tags: [Platforms]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Platform health status
 */
router.get('/:name/status',
  ValidationMiddleware.validate(schemas.platformName, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { name } = req.params;
    const platform = platforms[name];

    if (!platform) {
      throw ErrorHandler.createError(
        'PLATFORM_NOT_FOUND',
        'Platform not found',
        404,
        { platformName: name }
      );
    }

    // Simulate health check
    const healthStatus = await checkPlatformHealth(platform);

    logger.info('Platform health checked', {
      platform: name,
      status: healthStatus.status,
      apiKey: req.apiKeyPreview
    });

    res.json({
      success: true,
      data: {
        platform: name,
        ...healthStatus
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
 * /v1/platforms/{name}/models:
 *   get:
 *     summary: List all models for a platform
 *     tags: [Platforms]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Platform models
 */
router.get('/:name/models',
  ValidationMiddleware.validate(schemas.platformName, 'params'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { name } = req.params;
    const platform = platforms[name];

    if (!platform) {
      throw ErrorHandler.createError(
        'PLATFORM_NOT_FOUND',
        'Platform not found',
        404,
        { platformName: name }
      );
    }

    const modelDetails = platform.models.map(model => ({
      id: model,
      name: model,
      platform: name,
      capabilities: platform.capabilities,
      contextWindow: platform.contextWindow
    }));

    res.json({
      success: true,
      data: {
        platform: name,
        models: modelDetails,
        count: modelDetails.length
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  })
);

// Helper function to check platform health
async function checkPlatformHealth(platform) {
  // Simulate health check (replace with actual checks)
  const latency = Math.floor(Math.random() * 500) + 100;
  const successRate = 95 + Math.random() * 5;
  const status = successRate > 99 ? 'available' : (successRate > 95 ? 'degraded' : 'unavailable');

  return {
    status,
    latency,
    successRate: parseFloat(successRate.toFixed(2)),
    lastCheck: new Date().toISOString(),
    uptime: 99.9,
    details: {
      modelsAvailable: platform.models.length,
      activeConnections: Math.floor(Math.random() * 100),
      queueDepth: Math.floor(Math.random() * 10)
    }
  };
}

module.exports = router;
