#!/usr/bin/env node

/**
 * Monitoring Dashboard Server
 *
 * Express server with WebSocket support for real-time monitoring dashboard
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Configuration
const PORT = process.env.MONITORING_PORT || 8000;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 5000; // 5 seconds

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Store metrics in memory (in production, use Redis or database)
let metrics = {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    avgResponseTime: 0,
    errorRate: 0,
    platforms: {},
    resources: {
        cpu: 0,
        memory: 0,
        network: 0,
        disk: 0,
        uptime: 0,
        requestsPerSecond: 0
    },
    startTime: Date.now()
};

// Active WebSocket connections
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Dashboard client connected');
    clients.add(ws);

    // Send initial metrics
    ws.send(JSON.stringify({
        type: 'metrics',
        data: metrics
    }));

    // Send initial platform data
    Object.values(metrics.platforms).forEach(platform => {
        ws.send(JSON.stringify({
            type: 'platform',
            data: platform
        }));
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Dashboard client disconnected');
        clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

/**
 * Broadcast message to all connected clients
 */
function broadcast(message) {
    const data = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

/**
 * Record query event
 */
function recordQuery(queryData) {
    metrics.totalQueries++;

    if (queryData.success) {
        metrics.successfulQueries++;
    } else {
        metrics.failedQueries++;
    }

    // Update error rate
    metrics.errorRate = metrics.failedQueries / metrics.totalQueries;

    // Update average response time
    if (queryData.responseTime) {
        const totalTime = metrics.avgResponseTime * (metrics.totalQueries - 1) + queryData.responseTime;
        metrics.avgResponseTime = totalTime / metrics.totalQueries;
    }

    // Update platform metrics
    if (queryData.platform) {
        updatePlatformMetrics(queryData.platform, queryData);
    }

    // Broadcast update
    broadcast({
        type: 'query',
        data: queryData
    });

    broadcast({
        type: 'metrics',
        data: metrics
    });
}

/**
 * Update platform-specific metrics
 */
function updatePlatformMetrics(platformName, data) {
    if (!metrics.platforms[platformName]) {
        metrics.platforms[platformName] = {
            name: platformName,
            status: 'healthy',
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            avgResponseTime: 0,
            errorRate: 0,
            consecutiveFailures: 0,
            lastSuccess: null,
            lastFailure: null,
            lastChecked: Date.now()
        };
    }

    const platform = metrics.platforms[platformName];
    platform.totalQueries++;
    platform.lastChecked = Date.now();

    if (data.success) {
        platform.successfulQueries++;
        platform.consecutiveFailures = 0;
        platform.lastSuccess = Date.now();
    } else {
        platform.failedQueries++;
        platform.consecutiveFailures++;
        platform.lastFailure = Date.now();
    }

    // Update platform error rate
    platform.errorRate = platform.failedQueries / platform.totalQueries;

    // Update platform average response time
    if (data.responseTime) {
        const totalTime = platform.avgResponseTime * (platform.totalQueries - 1) + data.responseTime;
        platform.avgResponseTime = totalTime / platform.totalQueries;
    }

    // Calculate platform status
    platform.status = calculatePlatformStatus(platform);

    // Broadcast platform update
    broadcast({
        type: 'platform',
        data: platform
    });
}

/**
 * Calculate platform health status
 */
function calculatePlatformStatus(platform) {
    // Consecutive failures check
    if (platform.consecutiveFailures >= 5) {
        return 'unhealthy';
    }

    if (platform.consecutiveFailures >= 3) {
        return 'degraded';
    }

    // Error rate check
    if (platform.errorRate >= 0.25) {
        return 'unhealthy';
    }

    if (platform.errorRate >= 0.1) {
        return 'degraded';
    }

    // Response time check
    if (platform.avgResponseTime >= 10000) {
        return 'unhealthy';
    }

    if (platform.avgResponseTime >= 5000) {
        return 'degraded';
    }

    return 'healthy';
}

/**
 * Update system resource metrics
 */
function updateResourceMetrics() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

    metrics.resources = {
        cpu: Math.min(cpuUsage, 100),
        memory: memoryUsage,
        network: Math.random() * 1000, // Placeholder - implement actual network monitoring
        disk: 50 + Math.random() * 10, // Placeholder - implement actual disk monitoring
        uptime: Date.now() - metrics.startTime,
        requestsPerSecond: metrics.totalQueries / ((Date.now() - metrics.startTime) / 1000)
    };

    // Broadcast resource update
    broadcast({
        type: 'resources',
        data: metrics.resources
    });
}

// API Routes

/**
 * GET /api/metrics - Get current metrics
 */
app.get('/api/metrics', (req, res) => {
    res.json({
        metrics: metrics,
        timestamp: Date.now()
    });
});

/**
 * POST /api/metrics/query - Record a query event
 */
app.post('/api/metrics/query', (req, res) => {
    const queryData = req.body;

    try {
        recordQuery(queryData);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to record query:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/metrics/platform - Update platform metrics
 */
app.post('/api/metrics/platform', (req, res) => {
    const { platform, data } = req.body;

    try {
        updatePlatformMetrics(platform, data);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to update platform metrics:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/platforms - Get all platform metrics
 */
app.get('/api/platforms', (req, res) => {
    res.json({
        platforms: Object.values(metrics.platforms),
        timestamp: Date.now()
    });
});

/**
 * GET /api/platforms/:name - Get specific platform metrics
 */
app.get('/api/platforms/:name', (req, res) => {
    const platform = metrics.platforms[req.params.name];

    if (!platform) {
        return res.status(404).json({ error: 'Platform not found' });
    }

    res.json({
        platform: platform,
        timestamp: Date.now()
    });
});

/**
 * POST /api/alerts/email - Send email alert (placeholder)
 */
app.post('/api/alerts/email', async (req, res) => {
    const { subject, message, alert } = req.body;

    console.log('Email Alert:', { subject, message, alert });

    // Implement email sending here
    // Example: await emailService.send({ to, subject, html })

    res.json({
        success: true,
        message: 'Email alert sent (mock)'
    });
});

/**
 * GET /api/health - Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: Date.now() - metrics.startTime,
        clients: clients.size,
        timestamp: Date.now()
    });
});

/**
 * GET /api/stats - Get statistics
 */
app.get('/api/stats', (req, res) => {
    const uptime = Date.now() - metrics.startTime;

    res.json({
        totalQueries: metrics.totalQueries,
        successRate: metrics.totalQueries > 0
            ? metrics.successfulQueries / metrics.totalQueries
            : 0,
        errorRate: metrics.errorRate,
        avgResponseTime: metrics.avgResponseTime,
        uptime: uptime,
        requestsPerSecond: metrics.resources.requestsPerSecond,
        platformCount: Object.keys(metrics.platforms).length,
        healthyPlatforms: Object.values(metrics.platforms).filter(p => p.status === 'healthy').length,
        clients: clients.size,
        timestamp: Date.now()
    });
});

/**
 * POST /api/reset - Reset metrics (development only)
 */
app.post('/api/reset', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Not allowed in production' });
    }

    metrics = {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        avgResponseTime: 0,
        errorRate: 0,
        platforms: {},
        resources: {
            cpu: 0,
            memory: 0,
            network: 0,
            disk: 0,
            uptime: 0,
            requestsPerSecond: 0
        },
        startTime: Date.now()
    };

    broadcast({
        type: 'reset',
        data: { timestamp: Date.now() }
    });

    res.json({ success: true, message: 'Metrics reset' });
});

// Serve dashboard at root and /monitoring
app.get(['/', '/monitoring'], (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Update resource metrics periodically
setInterval(() => {
    updateResourceMetrics();
}, UPDATE_INTERVAL);

// Generate mock data for demo (optional)
if (process.env.GENERATE_MOCK_DATA === 'true') {
    const platforms = ['claude', 'chatgpt', 'gemini', 'perplexity'];

    setInterval(() => {
        const platform = platforms[Math.floor(Math.random() * platforms.length)];
        const success = Math.random() > 0.1;
        const responseTime = 1000 + Math.random() * 3000;

        recordQuery({
            platform,
            success,
            responseTime,
            timestamp: Date.now()
        });
    }, 2000);
}

// Start server
server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('AI Orchestrator Monitoring Dashboard');
    console.log('='.repeat(60));
    console.log(`Dashboard URL: http://localhost:${PORT}/monitoring`);
    console.log(`API Endpoint:  http://localhost:${PORT}/api`);
    console.log(`WebSocket:     ws://localhost:${PORT}/ws`);
    console.log(`Health Check:  http://localhost:${PORT}/api/health`);
    console.log('='.repeat(60));
    console.log(`Server running on port ${PORT}`);
    console.log(`Update interval: ${UPDATE_INTERVAL}ms`);
    console.log(`Connected clients: ${clients.size}`);
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });

    // Force close after 30 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Export for testing
module.exports = {
    app,
    server,
    recordQuery,
    updatePlatformMetrics,
    updateResourceMetrics,
    metrics
};
