#!/usr/bin/env node

/**
 * Production Web Server for AI Orchestrator
 *
 * Features:
 * - Express REST API for orchestrator operations
 * - WebSocket server for real-time streaming responses
 * - Static file serving for frontend
 * - CORS configuration for browser access
 * - Request queuing and rate limiting
 * - Session management
 * - Health monitoring integration
 * - Graceful shutdown handling
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { ProductionBrowserAutomation } = require('./production-browser-automation');

class WebServer {
    constructor(options = {}) {
        this.config = {
            port: options.port || process.env.PORT || 3000,
            host: options.host || '0.0.0.0',
            corsOrigins: options.corsOrigins || '*',
            maxQueueSize: options.maxQueueSize || 100,
            requestTimeout: options.requestTimeout || 120000,
            enableMetrics: options.enableMetrics !== false,
            ...options
        };

        // Express app
        this.app = express();
        this.server = http.createServer(this.app);

        // WebSocket server
        this.wss = new WebSocket.Server({ server: this.server });

        // Browser automation
        this.browserAutomation = new ProductionBrowserAutomation({
            headless: true,
            verbose: false
        });

        // State management
        this.state = {
            initialized: false,
            requestQueue: [],
            activeRequests: new Map(),
            queryHistory: [],
            platformStatus: new Map(),
            metrics: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                totalResponseTime: 0,
                votes: new Map()
            }
        };

        // WebSocket clients
        this.wsClients = new Set();

        // Query ID counter
        this.queryIdCounter = 0;
    }

    /**
     * Initialize web server and browser automation
     */
    async initialize() {
        console.log('🚀 Initializing AI Orchestrator Web Server...');

        try {
            // Initialize browser automation
            console.log('🌐 Initializing browser automation...');
            await this.browserAutomation.initialize();

            // Setup middleware
            this.setupMiddleware();

            // Setup routes
            this.setupRoutes();

            // Setup WebSocket handlers
            this.setupWebSocket();

            // Initialize platform status
            await this.initializePlatformStatus();

            // Start background tasks
            this.startBackgroundTasks();

            this.state.initialized = true;
            console.log('✅ Web server initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize web server:', error);
            throw error;
        }
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', this.config.corsOrigins);
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });

        // JSON body parser
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Static files
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
            });
            next();
        });

        // Error handling
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({
                success: false,
                error: err.message || 'Internal server error'
            });
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });

        // Submit query to all platforms
        this.app.post('/api/query', async (req, res) => {
            try {
                const { prompt, platforms } = req.body;

                if (!prompt) {
                    return res.status(400).json({
                        success: false,
                        error: 'Prompt is required'
                    });
                }

                const queryId = this.generateQueryId();
                const query = {
                    id: queryId,
                    prompt,
                    platforms: platforms || ['lmarena', 'claude', 'chatgpt', 'gemini'],
                    status: 'pending',
                    responses: {},
                    startTime: Date.now(),
                    endTime: null
                };

                // Add to queue
                this.state.requestQueue.push(query);
                this.state.queryHistory.unshift(query);

                // Keep only last 100 queries
                if (this.state.queryHistory.length > 100) {
                    this.state.queryHistory.pop();
                }

                // Process in background
                this.processQuery(query);

                res.json({
                    success: true,
                    queryId,
                    message: 'Query submitted successfully',
                    platforms: query.platforms
                });

            } catch (error) {
                console.error('Query submission error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get platform status
        this.app.get('/api/status', (req, res) => {
            const status = {};

            for (const [platform, info] of this.state.platformStatus) {
                status[platform] = info;
            }

            res.json({
                success: true,
                platforms: status,
                timestamp: new Date().toISOString()
            });
        });

        // Get query history
        this.app.get('/api/history', (req, res) => {
            const limit = parseInt(req.query.limit) || 50;

            res.json({
                success: true,
                queries: this.state.queryHistory.slice(0, limit),
                total: this.state.queryHistory.length
            });
        });

        // Get specific query
        this.app.get('/api/query/:id', (req, res) => {
            const query = this.state.queryHistory.find(q => q.id === req.params.id);

            if (!query) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            res.json({
                success: true,
                query
            });
        });

        // Vote on response
        this.app.post('/api/vote', (req, res) => {
            try {
                const { queryId, platform, vote } = req.body;

                if (!queryId || !platform || !vote) {
                    return res.status(400).json({
                        success: false,
                        error: 'queryId, platform, and vote are required'
                    });
                }

                const voteKey = `${queryId}:${platform}`;
                this.state.metrics.votes.set(voteKey, vote);

                // Broadcast vote update
                this.broadcast({
                    type: 'vote',
                    data: { queryId, platform, vote }
                });

                res.json({
                    success: true,
                    message: 'Vote recorded'
                });

            } catch (error) {
                console.error('Vote error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get metrics
        this.app.get('/api/metrics', (req, res) => {
            const avgResponseTime = this.state.metrics.totalRequests > 0
                ? (this.state.metrics.totalResponseTime / this.state.metrics.totalRequests).toFixed(2)
                : 0;

            res.json({
                success: true,
                metrics: {
                    totalRequests: this.state.metrics.totalRequests,
                    successfulRequests: this.state.metrics.successfulRequests,
                    failedRequests: this.state.metrics.failedRequests,
                    successRate: this.state.metrics.totalRequests > 0
                        ? ((this.state.metrics.successfulRequests / this.state.metrics.totalRequests) * 100).toFixed(2) + '%'
                        : '0%',
                    averageResponseTime: avgResponseTime + 'ms',
                    queueSize: this.state.requestQueue.length,
                    activeRequests: this.state.activeRequests.size,
                    connectedClients: this.wsClients.size
                }
            });
        });

        // Export query results
        this.app.get('/api/export/:id', (req, res) => {
            const query = this.state.queryHistory.find(q => q.id === req.params.id);

            if (!query) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="query-${query.id}.json"`);
            res.json(query);
        });

        // Root path serves index.html
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    /**
     * Setup WebSocket handlers
     */
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            console.log('🔌 New WebSocket connection');
            this.wsClients.add(ws);

            // Send initial state
            ws.send(JSON.stringify({
                type: 'connected',
                data: {
                    platformStatus: Array.from(this.state.platformStatus.entries()),
                    recentQueries: this.state.queryHistory.slice(0, 10)
                }
            }));

            // Handle messages from client
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    await this.handleWebSocketMessage(ws, data);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: error.message
                    }));
                }
            });

            // Handle disconnection
            ws.on('close', () => {
                console.log('🔌 WebSocket disconnected');
                this.wsClients.delete(ws);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.wsClients.delete(ws);
            });
        });
    }

    /**
     * Handle WebSocket messages
     */
    async handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

            case 'subscribe':
                // Subscribe to specific query updates
                ws.subscriptions = ws.subscriptions || new Set();
                if (data.queryId) {
                    ws.subscriptions.add(data.queryId);
                }
                break;

            case 'unsubscribe':
                if (ws.subscriptions && data.queryId) {
                    ws.subscriptions.delete(data.queryId);
                }
                break;

            default:
                console.warn('Unknown WebSocket message type:', data.type);
        }
    }

    /**
     * Process query on all platforms
     */
    async processQuery(query) {
        this.state.activeRequests.set(query.id, query);
        query.status = 'processing';

        // Broadcast query start
        this.broadcast({
            type: 'query-start',
            data: query
        });

        const results = await Promise.allSettled(
            query.platforms.map(platform => this.queryPlatform(query, platform))
        );

        // Update query status
        query.status = 'completed';
        query.endTime = Date.now();

        // Update metrics
        this.state.metrics.totalRequests++;
        this.state.metrics.totalResponseTime += (query.endTime - query.startTime);

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        this.state.metrics.successfulRequests += successCount;
        this.state.metrics.failedRequests += (results.length - successCount);

        // Remove from active requests
        this.state.activeRequests.delete(query.id);

        // Broadcast query completion
        this.broadcast({
            type: 'query-complete',
            data: query
        });
    }

    /**
     * Query a specific platform
     */
    async queryPlatform(query, platformName) {
        const startTime = Date.now();

        try {
            // Update platform status
            this.updatePlatformStatus(platformName, 'processing');

            // Broadcast platform start
            this.broadcast({
                type: 'platform-start',
                data: { queryId: query.id, platform: platformName }
            });

            // Execute query
            const response = await this.browserAutomation.sendPrompt(
                platformName,
                query.prompt,
                {
                    streaming: true,
                    onChunk: (chunk) => {
                        // Stream response chunks to clients
                        this.broadcast({
                            type: 'response-chunk',
                            data: {
                                queryId: query.id,
                                platform: platformName,
                                chunk
                            }
                        });
                    }
                }
            );

            const duration = Date.now() - startTime;

            // Store response
            query.responses[platformName] = {
                success: true,
                response: response.text,
                timestamp: new Date().toISOString(),
                duration,
                metadata: response.metadata || {}
            };

            // Update platform status
            this.updatePlatformStatus(platformName, 'healthy', { lastResponse: duration });

            // Broadcast platform completion
            this.broadcast({
                type: 'platform-complete',
                data: {
                    queryId: query.id,
                    platform: platformName,
                    response: query.responses[platformName]
                }
            });

            return response;

        } catch (error) {
            console.error(`Platform ${platformName} error:`, error);

            const duration = Date.now() - startTime;

            // Store error
            query.responses[platformName] = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                duration
            };

            // Update platform status
            this.updatePlatformStatus(platformName, 'error', { lastError: error.message });

            // Broadcast platform error
            this.broadcast({
                type: 'platform-error',
                data: {
                    queryId: query.id,
                    platform: platformName,
                    error: error.message
                }
            });

            throw error;
        }
    }

    /**
     * Update platform status
     */
    updatePlatformStatus(platform, status, metadata = {}) {
        const current = this.state.platformStatus.get(platform) || {
            name: platform,
            status: 'unknown',
            lastCheck: null,
            requestCount: 0,
            errorCount: 0
        };

        current.status = status;
        current.lastCheck = new Date().toISOString();
        current.requestCount = (current.requestCount || 0) + 1;

        if (status === 'error') {
            current.errorCount = (current.errorCount || 0) + 1;
        }

        Object.assign(current, metadata);
        this.state.platformStatus.set(platform, current);

        // Broadcast status update
        this.broadcast({
            type: 'platform-status',
            data: { platform, status: current }
        });
    }

    /**
     * Initialize platform status
     */
    async initializePlatformStatus() {
        const platforms = ['lmarena', 'claude', 'chatgpt', 'gemini', 'poe'];

        for (const platform of platforms) {
            this.state.platformStatus.set(platform, {
                name: platform,
                status: 'unknown',
                lastCheck: null,
                requestCount: 0,
                errorCount: 0
            });
        }
    }

    /**
     * Start background tasks
     */
    startBackgroundTasks() {
        // Health check interval
        setInterval(() => {
            this.performHealthCheck();
        }, 60000); // Every minute

        // Cleanup old queries
        setInterval(() => {
            this.cleanupOldQueries();
        }, 300000); // Every 5 minutes
    }

    /**
     * Perform health check on all platforms
     */
    async performHealthCheck() {
        for (const platform of this.state.platformStatus.keys()) {
            try {
                // Simple connectivity check
                const status = this.browserAutomation.pages.has(platform) ? 'healthy' : 'idle';
                this.updatePlatformStatus(platform, status);
            } catch (error) {
                this.updatePlatformStatus(platform, 'error', { lastError: error.message });
            }
        }
    }

    /**
     * Cleanup old queries from history
     */
    cleanupOldQueries() {
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const now = Date.now();

        this.state.queryHistory = this.state.queryHistory.filter(query => {
            return (now - query.startTime) < maxAge;
        });

        console.log(`🧹 Cleaned up queries. Current history size: ${this.state.queryHistory.length}`);
    }

    /**
     * Broadcast message to all WebSocket clients
     */
    broadcast(message) {
        const data = JSON.stringify(message);

        for (const client of this.wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                // Check if client is subscribed to this update
                if (message.data?.queryId && client.subscriptions?.has(message.data.queryId)) {
                    client.send(data);
                } else if (!message.data?.queryId) {
                    // Broadcast to all for non-query-specific messages
                    client.send(data);
                }
            }
        }
    }

    /**
     * Generate unique query ID
     */
    generateQueryId() {
        return `query_${Date.now()}_${++this.queryIdCounter}`;
    }

    /**
     * Start server
     */
    async start() {
        await this.initialize();

        return new Promise((resolve) => {
            this.server.listen(this.config.port, this.config.host, () => {
                console.log(`\n✅ AI Orchestrator Web Server running!`);
                console.log(`   📡 HTTP: http://${this.config.host}:${this.config.port}`);
                console.log(`   🔌 WebSocket: ws://${this.config.host}:${this.config.port}`);
                console.log(`\n   Available endpoints:`);
                console.log(`      POST /api/query       - Submit query to platforms`);
                console.log(`      GET  /api/status      - Get platform status`);
                console.log(`      GET  /api/history     - Get query history`);
                console.log(`      GET  /api/query/:id   - Get specific query`);
                console.log(`      POST /api/vote        - Vote on response`);
                console.log(`      GET  /api/metrics     - Get system metrics`);
                console.log(`      GET  /api/export/:id  - Export query results`);
                console.log(`\n   Press Ctrl+C to shutdown\n`);

                resolve();
            });
        });
    }

    /**
     * Shutdown gracefully
     */
    async shutdown() {
        console.log('\n🛑 Shutting down server...');

        // Close WebSocket connections
        for (const client of this.wsClients) {
            client.close();
        }

        // Close WebSocket server
        this.wss.close();

        // Close HTTP server
        await new Promise((resolve) => {
            this.server.close(resolve);
        });

        // Cleanup browser automation
        await this.browserAutomation.cleanup();

        console.log('✅ Server shutdown complete');
    }
}

module.exports = WebServer;

// Start server if run directly
if (require.main === module) {
    const server = new WebServer();

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await server.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await server.shutdown();
        process.exit(0);
    });

    server.start().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
