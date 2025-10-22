#!/usr/bin/env node

/**
 * Orchestrator API Service
 *
 * Provides HTTP API wrapper around the streamlined orchestrator
 * Runs as a persistent service that maintains browser sessions
 */

const http = require('http');
const url = require('url');
const StreamlinedOrchestrator = require('./streamlined-orchestrator');

const PORT = process.env.PORT || 8765;
const HOST = process.env.HOST || '0.0.0.0';

class OrchestratorAPIService {
    constructor() {
        this.orchestrator = null;
        this.server = null;
        this.isInitialized = false;
        this.requestQueue = [];
        this.isProcessing = false;
    }

    async initialize() {
        console.log('🚀 Initializing Orchestrator API Service...\n');

        try {
            // Initialize orchestrator
            const headless = process.env.HEADLESS !== 'false';
            this.orchestrator = new StreamlinedOrchestrator({
                environment: 'production',
                headless: headless,
                enableHealthMonitoring: true
            });

            console.log('⏳ Starting orchestrator (this may take 30-60 seconds)...\n');
            await this.orchestrator.initialize();

            this.isInitialized = true;
            console.log('\n✅ Orchestrator ready!\n');

            // Create HTTP server
            this.server = http.createServer(this.handleRequest.bind(this));

            // Start server
            await new Promise((resolve) => {
                this.server.listen(PORT, HOST, () => {
                    console.log(`🌐 API Service listening on http://${HOST}:${PORT}`);
                    console.log('\n📋 Available endpoints:');
                    console.log(`   POST /query - Submit a query`);
                    console.log(`   GET  /models - List available models`);
                    console.log(`   GET  /health - Service health check`);
                    console.log(`   GET  /status - Orchestrator status\n`);
                    resolve();
                });
            });

        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            throw error;
        }
    }

    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        // Handle OPTIONS preflight
        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            // Route requests
            if (pathname === '/query' && method === 'POST') {
                await this.handleQuery(req, res);
            } else if (pathname === '/models' && method === 'GET') {
                await this.handleListModels(req, res);
            } else if (pathname === '/health' && method === 'GET') {
                await this.handleHealth(req, res);
            } else if (pathname === '/status' && method === 'GET') {
                await this.handleStatus(req, res);
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({
                    error: 'Not found',
                    message: `${method} ${pathname} is not a valid endpoint`
                }));
            }
        } catch (error) {
            console.error('Request error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                error: 'Internal server error',
                message: error.message
            }));
        }
    }

    async handleQuery(req, res) {
        // Parse request body
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { prompt, model = 'claude-3.5-sonnet', type = 'text' } = data;

                if (!prompt) {
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        error: 'Bad request',
                        message: 'prompt is required'
                    }));
                    return;
                }

                console.log(`\n📝 Query received: model=${model}, prompt="${prompt.substring(0, 50)}..."`);

                // Execute query
                const result = await this.orchestrator.query({
                    prompt,
                    model,
                    type
                });

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    data: result
                }));

            } catch (error) {
                console.error('Query error:', error);
                res.writeHead(500);
                res.end(JSON.stringify({
                    error: 'Query failed',
                    message: error.message
                }));
            }
        });
    }

    async handleListModels(req, res) {
        try {
            const models = this.orchestrator.listModels();
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                data: models
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                error: 'Failed to list models',
                message: error.message
            }));
        }
    }

    async handleHealth(req, res) {
        const health = {
            status: this.isInitialized ? 'healthy' : 'initializing',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        };

        res.writeHead(this.isInitialized ? 200 : 503);
        res.end(JSON.stringify(health));
    }

    async handleStatus(req, res) {
        try {
            const status = {
                initialized: this.orchestrator.state.initialized,
                startTime: this.orchestrator.state.startTime,
                requestCount: this.orchestrator.state.requestCount,
                platforms: this.orchestrator.platforms.size,
                models: {
                    text: Object.keys(this.orchestrator.models.text).length,
                    image: Object.keys(this.orchestrator.models.image).length,
                    video: Object.keys(this.orchestrator.models.video).length
                }
            };

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                data: status
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                error: 'Failed to get status',
                message: error.message
            }));
        }
    }

    async shutdown() {
        console.log('\n🛑 Shutting down API service...');

        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => {
                    console.log('✅ HTTP server closed');
                    resolve();
                });
            });
        }

        if (this.orchestrator) {
            await this.orchestrator.shutdown();
        }

        console.log('✅ Shutdown complete');
    }
}

// Main
async function main() {
    const service = new OrchestratorAPIService();

    // Handle shutdown signals
    process.on('SIGTERM', async () => {
        console.log('\n📢 Received SIGTERM');
        await service.shutdown();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('\n📢 Received SIGINT');
        await service.shutdown();
        process.exit(0);
    });

    try {
        await service.initialize();
    } catch (error) {
        console.error('❌ Failed to start service:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = OrchestratorAPIService;
