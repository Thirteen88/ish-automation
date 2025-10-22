/**
 * Analytics and Statistics Routes
 * Usage analytics and statistics endpoints
 */

const express = require('express');
const { ValidationMiddleware, schemas } = require('../middleware/validate');
const ErrorHandler = require('../middleware/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

// In-memory analytics store (replace with database in production)
const analytics = {
  requests: [],
  platforms: {},
  apiKeys: {}
};

/**
 * @swagger
 * /v1/stats:
 *   get:
 *     summary: Get API usage statistics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usage statistics
 */
router.get('/',
  ValidationMiddleware.validate(schemas.statsQuery, 'query'),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { startDate, endDate, groupBy, platform } = req.query;
    const apiKey = req.apiKey;

    // Filter analytics data
    let filteredRequests = analytics.requests.filter(r => r.apiKey === apiKey);

    if (startDate) {
      filteredRequests = filteredRequests.filter(r =>
        new Date(r.timestamp) >= new Date(startDate)
      );
    }

    if (endDate) {
      filteredRequests = filteredRequests.filter(r =>
        new Date(r.timestamp) <= new Date(endDate)
      );
    }

    if (platform) {
      filteredRequests = filteredRequests.filter(r => r.platform === platform);
    }

    // Calculate statistics
    const stats = calculateStats(filteredRequests, groupBy);

    logger.info('Stats retrieved', {
      apiKey: req.apiKeyPreview,
      totalRequests: filteredRequests.length,
      groupBy
    });

    res.json({
      success: true,
      data: {
        period: {
          startDate: startDate || filteredRequests[0]?.timestamp,
          endDate: endDate || new Date().toISOString(),
          groupBy
        },
        statistics: stats,
        totalRequests: filteredRequests.length
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
 * /v1/stats/summary:
 *   get:
 *     summary: Get quick statistics summary
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Statistics summary
 */
router.get('/summary',
  ErrorHandler.asyncHandler(async (req, res) => {
    const apiKey = req.apiKey;
    const userRequests = analytics.requests.filter(r => r.apiKey === apiKey);

    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const summary = {
      total: userRequests.length,
      last24Hours: userRequests.filter(r => new Date(r.timestamp) >= last24h).length,
      last7Days: userRequests.filter(r => new Date(r.timestamp) >= last7d).length,
      last30Days: userRequests.filter(r => new Date(r.timestamp) >= last30d).length,
      byPlatform: {},
      byStatus: {},
      averageResponseTime: 0,
      totalTokensUsed: 0
    };

    // Calculate by platform
    userRequests.forEach(r => {
      summary.byPlatform[r.platform] = (summary.byPlatform[r.platform] || 0) + 1;
      summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
      if (r.responseTime) summary.averageResponseTime += r.responseTime;
      if (r.tokensUsed) summary.totalTokensUsed += r.tokensUsed;
    });

    if (userRequests.length > 0) {
      summary.averageResponseTime = Math.round(summary.averageResponseTime / userRequests.length);
    }

    res.json({
      success: true,
      data: { summary },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  })
);

/**
 * @swagger
 * /v1/stats/platforms:
 *   get:
 *     summary: Get platform usage breakdown
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Platform statistics
 */
router.get('/platforms',
  ErrorHandler.asyncHandler(async (req, res) => {
    const apiKey = req.apiKey;
    const userRequests = analytics.requests.filter(r => r.apiKey === apiKey);

    const platformStats = {};

    userRequests.forEach(r => {
      if (!platformStats[r.platform]) {
        platformStats[r.platform] = {
          platform: r.platform,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          totalTokens: 0,
          averageResponseTime: 0,
          responseTimes: []
        };
      }

      const stats = platformStats[r.platform];
      stats.totalRequests++;

      if (r.status === 'completed') stats.successfulRequests++;
      if (r.status === 'failed') stats.failedRequests++;
      if (r.tokensUsed) stats.totalTokens += r.tokensUsed;
      if (r.responseTime) stats.responseTimes.push(r.responseTime);
    });

    // Calculate averages
    Object.values(platformStats).forEach(stats => {
      if (stats.responseTimes.length > 0) {
        stats.averageResponseTime = Math.round(
          stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
        );
      }
      delete stats.responseTimes;
      stats.successRate = stats.totalRequests > 0
        ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)
        : 0;
    });

    res.json({
      success: true,
      data: {
        platforms: Object.values(platformStats),
        totalPlatforms: Object.keys(platformStats).length
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
 * /v1/stats/export:
 *   get:
 *     summary: Export analytics data (CSV)
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: CSV export
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export',
  ErrorHandler.asyncHandler(async (req, res) => {
    const apiKey = req.apiKey;
    const userRequests = analytics.requests.filter(r => r.apiKey === apiKey);

    // Generate CSV
    const csv = generateCSV(userRequests);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.csv"`);
    res.send(csv);

    logger.info('Analytics exported', {
      apiKey: req.apiKeyPreview,
      records: userRequests.length
    });
  })
);

// Helper: Calculate statistics
function calculateStats(requests, groupBy = 'day') {
  const grouped = {};

  requests.forEach(r => {
    const date = new Date(r.timestamp);
    let key;

    switch (groupBy) {
      case 'hour':
        key = date.toISOString().substring(0, 13);
        break;
      case 'day':
        key = date.toISOString().substring(0, 10);
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().substring(0, 10);
        break;
      case 'month':
        key = date.toISOString().substring(0, 7);
        break;
      default:
        key = date.toISOString().substring(0, 10);
    }

    if (!grouped[key]) {
      grouped[key] = {
        period: key,
        requests: 0,
        successful: 0,
        failed: 0,
        tokens: 0,
        avgResponseTime: 0,
        responseTimes: []
      };
    }

    const group = grouped[key];
    group.requests++;
    if (r.status === 'completed') group.successful++;
    if (r.status === 'failed') group.failed++;
    if (r.tokensUsed) group.tokens += r.tokensUsed;
    if (r.responseTime) group.responseTimes.push(r.responseTime);
  });

  // Calculate averages
  Object.values(grouped).forEach(g => {
    if (g.responseTimes.length > 0) {
      g.avgResponseTime = Math.round(
        g.responseTimes.reduce((a, b) => a + b, 0) / g.responseTimes.length
      );
    }
    delete g.responseTimes;
  });

  return Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));
}

// Helper: Generate CSV
function generateCSV(requests) {
  const headers = ['Timestamp', 'Platform', 'Model', 'Status', 'Response Time', 'Tokens Used'];
  const rows = requests.map(r => [
    r.timestamp,
    r.platform,
    r.model || 'N/A',
    r.status,
    r.responseTime || 0,
    r.tokensUsed || 0
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csv;
}

// Middleware to record analytics (use in server.js)
function recordAnalytics(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Record request
    if (req.apiKey && req.path.startsWith('/v1/query')) {
      analytics.requests.push({
        timestamp: new Date().toISOString(),
        apiKey: req.apiKey,
        path: req.path,
        method: req.method,
        platform: req.body?.platform || 'unknown',
        model: req.body?.model,
        status: data.success ? 'completed' : 'failed',
        responseTime: res.get('X-Response-Time'),
        tokensUsed: data.data?.result?.tokensUsed
      });

      // Update platform stats
      const platform = req.body?.platform || 'unknown';
      if (!analytics.platforms[platform]) {
        analytics.platforms[platform] = { total: 0, successful: 0 };
      }
      analytics.platforms[platform].total++;
      if (data.success) analytics.platforms[platform].successful++;

      // Update API key stats
      if (!analytics.apiKeys[req.apiKey]) {
        analytics.apiKeys[req.apiKey] = { total: 0 };
      }
      analytics.apiKeys[req.apiKey].total++;
    }

    return originalJson(data);
  };

  next();
}

module.exports = router;
module.exports.recordAnalytics = recordAnalytics;
