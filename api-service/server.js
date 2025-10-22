/**
 * ISH AI Orchestrator API Server
 * Production-ready REST API service
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');

// Import configurations
const logger = require('./config/logger');
const swaggerSpec = require('./config/swagger');

// Import middleware
const AuthMiddleware = require('./middleware/auth');
const RateLimiter = require('./middleware/rateLimit');
const CacheMiddleware = require('./middleware/cache');
const ErrorHandler = require('./middleware/errorHandler');

// Import routes
const queryRoutes = require('./routes/query');
const platformRoutes = require('./routes/platform');
const batchRoutes = require('./routes/batch');
const compareRoutes = require('./routes/compare');
const statsRoutes = require('./routes/stats');

// Initialize Express app
const app = express();

// Configuration
const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  apiKeys: (process.env.API_KEYS || 'demo-key-1,demo-key-2').split(','),
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  cacheTTL: parseInt(process.env.CACHE_TTL || '300') * 1000,
  cacheMaxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*'
};

// Initialize middleware instances
const auth = new AuthMiddleware(config.apiKeys);
const rateLimiter = new RateLimiter({
  windowMs: config.rateLimitWindow,
  maxRequests: config.rateLimitMax
});
const cache = new CacheMiddleware({
  ttl: config.cacheTTL,
  maxSize: config.cacheMaxSize
});

// ============================================================================
// GLOBAL MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.allowedOrigins === '*' ? '*' : config.allowedOrigins.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Response time tracking
app.use((req, res, next) => {
  const start = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override end function to set header before response ends
  res.end = function(...args) {
    const duration = Date.now() - start;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }
    // Call original end function
    originalEnd.apply(res, args);
  };

  next();
});

// Analytics recording
app.use(statsRoutes.recordAnalytics);

// ============================================================================
// HEALTH CHECK ENDPOINTS (No auth required)
// ============================================================================

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: require('./package.json').version,
      environment: config.env
    }
  });
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: API information
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'ISH AI Orchestrator API',
      version: '1.0.0',
      description: 'Production-ready REST API for AI orchestration',
      documentation: '/api-docs',
      endpoints: {
        queries: '/v1/query',
        platforms: '/v1/platforms',
        batch: '/v1/batch',
        compare: '/v1/compare',
        stats: '/v1/stats'
      },
      authentication: {
        type: 'API Key',
        header: 'X-API-Key',
        docs: '/api-docs'
      },
      rateLimit: {
        window: `${config.rateLimitWindow / 1000 / 60} minutes`,
        maxRequests: config.rateLimitMax
      }
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
});

// ============================================================================
// API DOCUMENTATION
// ============================================================================

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ISH AI Orchestrator API',
  customfavIcon: '/favicon.ico'
}));

// Serve raw OpenAPI spec
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Apply authentication to all /v1/* routes
app.use('/v1', auth.authenticate());

// Apply rate limiting to all /v1/* routes
app.use('/v1', rateLimiter.middleware());

// Mount route handlers
app.use('/v1/query', queryRoutes);
app.use('/v1/platforms', platformRoutes);
app.use('/v1/batch', batchRoutes);
app.use('/v1/compare', compareRoutes);
app.use('/v1/stats', statsRoutes);

// ============================================================================
// ADMIN ENDPOINTS (Internal use)
// ============================================================================

app.get('/admin/cache/stats', auth.authenticate(), (req, res) => {
  res.json({
    success: true,
    data: cache.getStats()
  });
});

app.post('/admin/cache/clear', auth.authenticate(), (req, res) => {
  cache.clear();
  res.json({
    success: true,
    data: { message: 'Cache cleared successfully' }
  });
});

app.get('/admin/rate-limit/:apiKey', auth.authenticate(), (req, res) => {
  const status = rateLimiter.getStatus(req.params.apiKey);
  res.json({
    success: true,
    data: status
  });
});

app.post('/admin/rate-limit/:apiKey/reset', auth.authenticate(), (req, res) => {
  rateLimiter.reset(req.params.apiKey);
  res.json({
    success: true,
    data: { message: 'Rate limit reset successfully' }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use(ErrorHandler.notFound());

// Global error handler
app.use(ErrorHandler.middleware());

// ============================================================================
// SERVER STARTUP
// ============================================================================

const server = app.listen(config.port, config.host, () => {
  logger.info('='.repeat(60));
  logger.info('ISH AI ORCHESTRATOR API SERVER');
  logger.info('='.repeat(60));
  logger.info(`Environment: ${config.env}`);
  logger.info(`Server: http://${config.host}:${config.port}`);
  logger.info(`Documentation: http://${config.host}:${config.port}/api-docs`);
  logger.info(`Health Check: http://${config.host}:${config.port}/health`);
  logger.info(`API Keys: ${config.apiKeys.length} configured`);
  logger.info(`Rate Limit: ${config.rateLimitMax} requests per ${config.rateLimitWindow / 1000 / 60} minutes`);
  logger.info(`Cache: TTL=${config.cacheTTL / 1000}s, Max=${config.cacheMaxSize} entries`);
  logger.info('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = { app, server };
