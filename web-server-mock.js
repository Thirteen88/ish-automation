#!/usr/bin/env node

/**
 * Web Server with Mock Responses for Mobile PWA Testing
 * TEMPORARY: This uses mock browser automation to demonstrate functionality
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

// Use mock browser automation for testing
const browserAutomation = require('./mock-browser-automation');

class WebServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.wss = null;
        this.clients = new Set();
        this.queries = new Map();
        this.platformStatus = {};
        this.browserAutomation = browserAutomation;
    }

    async initialize() {
        console.log('🚀 Initializing Web Server with MOCK responses...');

        // Middleware
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));

        // Setup routes
        this.setupRoutes();

        // Start server
        this.server = http.createServer(this.app);

        // Setup WebSocket
        this.setupWebSocket();

        // Start listening
        this.server.listen(this.port, () => {
            console.log(`✅ Server running on http://localhost:${this.port}`);
            console.log(`📡 WebSocket available on ws://localhost:${this.port}`);
            console.log('⚠️  Using MOCK browser automation for testing');
        });

        // Initialize platform status
        this.initializePlatformStatus();
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', mock: true });
        });

        // Query endpoint
        this.app.post('/api/query', async (req, res) => {
            const { prompt, platforms } = req.body;
            const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            console.log(`📝 New query: ${queryId}`);
            console.log(`   Prompt: "${prompt}"`);
            console.log(`   Platforms: ${platforms.join(', ')}`);

            // Create query object
            const query = {
                id: queryId,
                prompt,
                platforms,
                responses: {},
                status: 'processing',
                timestamp: new Date().toISOString()
            };

            this.queries.set(queryId, query);

            // Broadcast query start
            this.broadcast({
                type: 'query-start',
                data: { id: queryId, prompt, platforms }
            });

            // Process platforms
            this.processQuery(query);

            res.json({
                success: true,
                queryId,
                message: 'Query submitted successfully'
            });
        });

        // Get query status
        this.app.get('/api/query/:id', (req, res) => {
            const query = this.queries.get(req.params.id);
            if (query) {
                res.json(query);
            } else {
                res.status(404).json({ error: 'Query not found' });
            }
        });

        // Platform status
        this.app.get('/api/status', (req, res) => {
            res.json(this.platformStatus);
        });

        // Query history
        this.app.get('/api/history', (req, res) => {
            const history = Array.from(this.queries.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, parseInt(req.query.limit) || 10);
            res.json(history);
        });
    }

    setupWebSocket() {
        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', (ws) => {
            console.log('🔌 New WebSocket connection');
            this.clients.add(ws);

            // Send initial status
            ws.send(JSON.stringify({
                type: 'connected',
                data: { platformStatus: this.platformStatus }
            }));

            ws.on('close', () => {
                console.log('🔌 WebSocket disconnected');
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.clients.delete(ws);
            });
        });
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    async processQuery(query) {
        const promises = query.platforms.map(platform =>
            this.queryPlatform(query, platform).catch(error => {
                console.error(`Platform ${platform} error:`, error);
                return null;
            })
        );

        await Promise.allSettled(promises);

        // Mark query as complete
        query.status = 'complete';

        // Broadcast completion
        this.broadcast({
            type: 'query-complete',
            data: {
                queryId: query.id,
                responses: query.responses
            }
        });

        console.log(`✅ Query ${query.id} complete`);
    }

    async queryPlatform(query, platformName) {
        console.log(`🔄 Processing ${platformName}...`);

        try {
            // Update platform status
            this.updatePlatformStatus(platformName, 'processing');

            // Broadcast platform start
            this.broadcast({
                type: 'platform-start',
                data: { queryId: query.id, platform: platformName }
            });

            // Execute query with mock automation
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

            // Store response
            query.responses[platformName] = {
                success: true,
                response: response.text,
                timestamp: new Date().toISOString(),
                metadata: response.metadata || {}
            };

            // Update platform status
            this.updatePlatformStatus(platformName, 'healthy');

            // Broadcast platform completion
            this.broadcast({
                type: 'platform-complete',
                data: {
                    queryId: query.id,
                    platform: platformName,
                    response: query.responses[platformName]
                }
            });

            console.log(`✅ ${platformName} complete`);
            return response;

        } catch (error) {
            console.error(`❌ ${platformName} error:`, error.message);

            // Store error
            query.responses[platformName] = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };

            // Update platform status
            this.updatePlatformStatus(platformName, 'error', { error: error.message });

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

    updatePlatformStatus(platformName, status, metadata = {}) {
        this.platformStatus[platformName] = {
            status,
            lastUpdated: new Date().toISOString(),
            ...metadata
        };

        // Broadcast status update
        this.broadcast({
            type: 'platform-status',
            data: this.platformStatus
        });
    }

    initializePlatformStatus() {
        const platforms = ['lmarena', 'claude', 'chatgpt', 'gemini', 'poe'];
        platforms.forEach(platform => {
            this.platformStatus[platform] = {
                status: 'healthy',
                lastUpdated: new Date().toISOString()
            };
        });
    }
}

// Start server
const server = new WebServer(3000);
server.initialize().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});