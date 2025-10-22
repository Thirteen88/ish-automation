#!/usr/bin/env node

/**
 * WebSocket Test Client for Mock Server
 * This tests the complete flow of WebSocket messages
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

class TestClient {
    constructor() {
        this.ws = null;
        this.messages = [];
        this.responseData = {};
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('🔌 Connecting to WebSocket...');
            this.ws = new WebSocket(WS_URL);

            this.ws.on('open', () => {
                console.log('✅ WebSocket connected');
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.messages.push(message);
                    console.log(`\n📨 Message: ${message.type}`);

                    switch(message.type) {
                        case 'connected':
                            console.log('   Platform Status:', message.data.platformStatus);
                            break;

                        case 'query-start':
                            console.log(`   Query ID: ${message.data.id}`);
                            console.log(`   Platforms: ${message.data.platforms.join(', ')}`);
                            break;

                        case 'platform-start':
                            console.log(`   Platform: ${message.data.platform}`);
                            this.responseData[message.data.platform] = '';
                            break;

                        case 'response-chunk':
                            const chunk = message.data.chunk;
                            console.log(`   Platform: ${message.data.platform}`);
                            console.log(`   Chunk: "${chunk}"`);
                            this.responseData[message.data.platform] += chunk;
                            break;

                        case 'platform-complete':
                            console.log(`   Platform: ${message.data.platform}`);
                            console.log(`   Success: ${message.data.response.success}`);
                            console.log(`   Response: "${message.data.response.response}"`);
                            break;

                        case 'platform-error':
                            console.log(`   Platform: ${message.data.platform}`);
                            console.log(`   Error: ${message.data.error}`);
                            break;

                        case 'query-complete':
                            console.log(`   Query ID: ${message.data.queryId}`);
                            console.log(`   Responses received: ${Object.keys(message.data.responses).length}`);
                            break;

                        case 'platform-status':
                            console.log('   Status update:', Object.keys(message.data).length, 'platforms');
                            break;
                    }
                } catch (error) {
                    console.error('❌ Error parsing message:', error);
                }
            });

            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
                reject(error);
            });

            this.ws.on('close', () => {
                console.log('🔌 WebSocket disconnected');
            });
        });
    }

    async submitQuery(prompt, platforms) {
        console.log('\n📤 Submitting query...');
        console.log(`   Prompt: "${prompt}"`);
        console.log(`   Platforms: ${platforms.join(', ')}`);

        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, platforms })
            });

            const data = await response.json();
            console.log('\n✅ Query submitted');
            console.log(`   Query ID: ${data.queryId}`);
            console.log(`   Success: ${data.success}`);

            return data.queryId;
        } catch (error) {
            console.error('❌ Failed to submit query:', error);
            throw error;
        }
    }

    async waitForCompletion(timeout = 10000) {
        console.log('\n⏳ Waiting for query completion...');

        return new Promise((resolve) => {
            const startTime = Date.now();

            const checkInterval = setInterval(() => {
                const queryComplete = this.messages.find(m => m.type === 'query-complete');

                if (queryComplete) {
                    clearInterval(checkInterval);
                    console.log('\n🎉 Query completed!');
                    this.printResults();
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    console.log('\n⏱️ Timeout waiting for completion');
                    this.printResults();
                    resolve(false);
                }
            }, 100);
        });
    }

    printResults() {
        console.log('\n📊 Final Results:');
        console.log('================');

        Object.entries(this.responseData).forEach(([platform, response]) => {
            console.log(`\n${platform.toUpperCase()}:`);
            console.log(`   Streamed: "${response}"`);
        });

        console.log('\n📬 Total messages received:', this.messages.length);

        const messageTypes = {};
        this.messages.forEach(m => {
            messageTypes[m.type] = (messageTypes[m.type] || 0) + 1;
        });

        console.log('\n📈 Message breakdown:');
        Object.entries(messageTypes).forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Run the test
async function runTest() {
    console.log('🚀 Starting WebSocket Test Client');
    console.log('================================');

    const client = new TestClient();

    try {
        // Connect to WebSocket
        await client.connect();

        // Wait a moment for initial messages
        await new Promise(resolve => setTimeout(resolve, 500));

        // Submit a test query
        const queryId = await client.submitQuery(
            'What is 2+2?',
            ['lmarena', 'claude', 'chatgpt', 'gemini', 'poe']
        );

        // Wait for completion
        await client.waitForCompletion();

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        // Disconnect
        client.disconnect();
    }
}

// Run the test
runTest().catch(console.error);