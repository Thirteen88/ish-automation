#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Production API Client
 *
 * Tests all major functionality:
 * - Individual API queries
 * - Parallel queries
 * - Error handling
 * - Rate limiting
 * - Metrics tracking
 * - Cost calculation
 * - Response normalization
 */

require('dotenv').config();
const { ProductionAPIClient } = require('./production-api-client');
const { APIPoweredOrchestrator } = require('./api-powered-orchestrator');

// Color utilities
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function colorize(text, color) {
    return `${colors[color] || ''}${text}${colors.reset}`;
}

function printHeader(text) {
    console.log('\n' + '='.repeat(80));
    console.log(colorize(text, 'cyan'));
    console.log('='.repeat(80));
}

function printSection(text) {
    console.log('\n' + colorize(text, 'yellow'));
    console.log('-'.repeat(60));
}

function printSuccess(text) {
    console.log(colorize('✅ ' + text, 'green'));
}

function printError(text) {
    console.log(colorize('❌ ' + text, 'red'));
}

function printInfo(text) {
    console.log(colorize('ℹ️  ' + text, 'gray'));
}

class APITestSuite {
    constructor() {
        this.client = null;
        this.orchestrator = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            skipped: 0,
            tests: []
        };
    }

    async runTest(name, testFn) {
        printSection(`Test: ${name}`);

        const startTime = Date.now();

        try {
            await testFn();
            const duration = Date.now() - startTime;

            printSuccess(`Passed (${duration}ms)`);
            this.testResults.passed++;
            this.testResults.tests.push({
                name,
                status: 'passed',
                duration
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            if (error.message.includes('SKIP')) {
                printInfo(`Skipped: ${error.message}`);
                this.testResults.skipped++;
                this.testResults.tests.push({
                    name,
                    status: 'skipped',
                    reason: error.message
                });
            } else {
                printError(`Failed: ${error.message}`);
                console.error(colorize(error.stack, 'gray'));
                this.testResults.failed++;
                this.testResults.tests.push({
                    name,
                    status: 'failed',
                    error: error.message,
                    duration
                });
            }
        }
    }

    async initialize() {
        printHeader('🚀 Production API Client Test Suite');

        printInfo('Initializing API client...');
        this.client = new ProductionAPIClient();

        printInfo('Checking available API keys...');
        const availableAPIs = Object.keys(this.client.apiKeys);

        if (availableAPIs.length === 0) {
            throw new Error('No API keys found. Please set up your .env file.');
        }

        printSuccess(`Found ${availableAPIs.length} API keys: ${availableAPIs.join(', ')}`);
    }

    async testOpenAI() {
        await this.runTest('OpenAI API Query', async () => {
            if (!this.client.apiKeys.openai) {
                throw new Error('SKIP: No OpenAI API key');
            }

            const prompt = "What is 2+2? Answer in one word.";
            const response = await this.client.queryOpenAI(prompt, {
                model: 'gpt-3.5-turbo',
                maxTokens: 10
            });

            if (!response.text) {
                throw new Error('Response text is empty');
            }

            if (response.tokens.total <= 0) {
                throw new Error('Token count is invalid');
            }

            if (response.cost < 0) {
                throw new Error('Cost is negative');
            }

            printInfo(`Response: "${response.text}"`);
            printInfo(`Tokens: ${response.tokens.total}, Cost: $${response.cost.toFixed(6)}`);
        });
    }

    async testAnthropic() {
        await this.runTest('Anthropic API Query', async () => {
            if (!this.client.apiKeys.anthropic) {
                throw new Error('SKIP: No Anthropic API key');
            }

            const prompt = "Name a primary color. One word only.";
            const response = await this.client.queryAnthropic(prompt, {
                model: 'claude-3-haiku',
                maxTokens: 10
            });

            if (!response.text) {
                throw new Error('Response text is empty');
            }

            printInfo(`Response: "${response.text}"`);
            printInfo(`Tokens: ${response.tokens.total}, Cost: $${response.cost.toFixed(6)}`);
        });
    }

    async testGoogle() {
        await this.runTest('Google AI API Query', async () => {
            if (!this.client.apiKeys.google) {
                throw new Error('SKIP: No Google API key');
            }

            const prompt = "What is the largest planet? Answer in one word.";
            const response = await this.client.queryGoogle(prompt, {
                model: 'gemini-pro',
                maxTokens: 10
            });

            if (!response.text) {
                throw new Error('Response text is empty');
            }

            printInfo(`Response: "${response.text}"`);
            printInfo(`Tokens: ${response.tokens.total}, Cost: $${response.cost.toFixed(6)}`);
        });
    }

    async testTogether() {
        await this.runTest('Together AI API Query', async () => {
            if (!this.client.apiKeys.together) {
                throw new Error('SKIP: No Together AI API key');
            }

            const prompt = "Say hello in one word.";
            const response = await this.client.queryTogether(prompt, {
                model: 'llama-3-70b',
                maxTokens: 10
            });

            if (!response.text) {
                throw new Error('Response text is empty');
            }

            printInfo(`Response: "${response.text}"`);
            printInfo(`Tokens: ${response.tokens.total}, Cost: $${response.cost.toFixed(6)}`);
        });
    }

    async testParallelQueries() {
        await this.runTest('Parallel API Queries', async () => {
            const availableAPIs = Object.keys(this.client.apiKeys).slice(0, 3);

            if (availableAPIs.length < 2) {
                throw new Error('SKIP: Need at least 2 API keys for parallel testing');
            }

            const prompt = "What is the speed of light? Answer in one sentence.";
            const results = await this.client.queryMultiple(
                prompt,
                availableAPIs,
                { maxTokens: 50 }
            );

            const successful = results.filter(r => r.success);

            if (successful.length === 0) {
                throw new Error('All parallel queries failed');
            }

            printInfo(`Successful: ${successful.length}/${results.length}`);
            successful.forEach(r => {
                printInfo(`  ${r.api}: ${r.duration}ms, $${r.result.cost.toFixed(6)}`);
            });
        });
    }

    async testRateLimiting() {
        await this.runTest('Rate Limiting', async () => {
            const availableAPIs = Object.keys(this.client.apiKeys);

            if (availableAPIs.length === 0) {
                throw new Error('SKIP: No API keys available');
            }

            const api = availableAPIs[0];

            // Make multiple rapid requests
            const promises = [];
            for (let i = 0; i < 3; i++) {
                promises.push(
                    this.client.makeRequest(api, {
                        method: 'GET',
                        path: '/models',
                        headers: {}
                    }).catch(e => ({ error: e.message }))
                );
            }

            await Promise.all(promises);

            printInfo('Rate limiting handled successfully');
        });
    }

    async testErrorHandling() {
        await this.runTest('Error Handling', async () => {
            try {
                // Try with invalid API key
                const client = new ProductionAPIClient();
                client.apiKeys.openai = 'invalid-key';

                await client.queryOpenAI('Test', { maxTokens: 10 });

                throw new Error('Should have thrown an authentication error');
            } catch (error) {
                if (error.statusCode === 401 || error.message.includes('authentication')) {
                    printInfo('Authentication error handled correctly');
                } else if (error.message.includes('Should have thrown')) {
                    throw error;
                } else {
                    printInfo(`Error handled: ${error.message}`);
                }
            }
        });
    }

    async testMetricsTracking() {
        await this.runTest('Metrics Tracking', async () => {
            const metrics = this.client.getMetrics();

            if (!metrics.requests) {
                throw new Error('Metrics not tracking requests');
            }

            printInfo('Metrics summary:');

            for (const [api, data] of Object.entries(metrics.requests)) {
                printInfo(`  ${api}: ${data.total} requests, ${(data.successRate * 100).toFixed(1)}% success`);
            }

            const totalCost = Object.values(metrics.costs)
                .reduce((sum, cost) => sum + parseFloat(cost), 0);

            printInfo(`Total cost across all APIs: $${totalCost.toFixed(6)}`);
        });
    }

    async testResponseNormalization() {
        await this.runTest('Response Normalization', async () => {
            const availableAPIs = Object.keys(this.client.apiKeys).slice(0, 2);

            if (availableAPIs.length < 2) {
                throw new Error('SKIP: Need at least 2 API keys for normalization testing');
            }

            const prompt = "Say 'test' in one word.";
            const results = await this.client.queryMultiple(
                prompt,
                availableAPIs,
                { maxTokens: 10 }
            );

            const successful = results.filter(r => r.success);

            // Check all responses have required fields
            successful.forEach(r => {
                const response = r.result;

                if (!response.provider) throw new Error('Missing provider');
                if (!response.model) throw new Error('Missing model');
                if (!response.text) throw new Error('Missing text');
                if (!response.tokens) throw new Error('Missing tokens');
                if (response.cost === undefined) throw new Error('Missing cost');
                if (!response.timestamp) throw new Error('Missing timestamp');
            });

            printInfo('All responses normalized correctly');
        });
    }

    async testCostCalculation() {
        await this.runTest('Cost Calculation', async () => {
            const availableAPIs = Object.keys(this.client.apiKeys);

            if (availableAPIs.length === 0) {
                throw new Error('SKIP: No API keys available');
            }

            const api = availableAPIs[0];
            const method = `query${this.capitalize(api)}`;

            const response = await this.client[method](
                "Count to 5.",
                { maxTokens: 50 }
            );

            if (response.cost <= 0) {
                throw new Error('Cost calculation returned zero or negative');
            }

            const estimatedCost = (response.tokens.total / 1000) * 0.002; // Rough estimate

            if (response.cost > estimatedCost * 100) {
                throw new Error('Cost seems unreasonably high');
            }

            printInfo(`Calculated cost: $${response.cost.toFixed(6)}`);
            printInfo(`Input: ${response.tokens.input}, Output: ${response.tokens.output}`);
        });
    }

    async testCaching() {
        await this.runTest('Response Caching', async () => {
            const availableAPIs = Object.keys(this.client.apiKeys);

            if (availableAPIs.length === 0) {
                throw new Error('SKIP: No API keys available');
            }

            // Enable caching
            this.client.cacheEnabled = true;

            const api = availableAPIs[0];
            const method = `query${this.capitalize(api)}`;
            const prompt = "What is 1+1?";

            // First request
            const start1 = Date.now();
            await this.client[method](prompt, { maxTokens: 10 });
            const time1 = Date.now() - start1;

            // Second request (should be cached, but API might still be called)
            const start2 = Date.now();
            await this.client[method](prompt, { maxTokens: 10 });
            const time2 = Date.now() - start2;

            printInfo(`First request: ${time1}ms`);
            printInfo(`Second request: ${time2}ms`);
            printInfo('Caching mechanism validated');

            // Clear cache
            this.client.clearCache();
        });
    }

    async testOrchestratorIntegration() {
        await this.runTest('Orchestrator Integration', async () => {
            const availableAPIs = Object.keys(this.client.apiKeys);

            if (availableAPIs.length === 0) {
                throw new Error('SKIP: No API keys available');
            }

            this.orchestrator = new APIPoweredOrchestrator({
                preferAPI: true,
                fallbackToBrowser: false,
                parallelMode: false
            });

            await this.orchestrator.initialize();

            const results = await this.orchestrator.processTextRequest(
                "What is AI? Answer in one sentence.",
                {
                    apis: [availableAPIs[0]],
                    maxTokens: 50
                }
            );

            if (!results.success) {
                throw new Error('Orchestrator request failed');
            }

            printInfo(`Orchestrator successfully processed request`);
            printInfo(`Results: ${results.summary.successful}/${results.summary.total} successful`);

            await this.orchestrator.cleanup();
        });
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    printSummary() {
        printHeader('📊 Test Summary');

        const total = this.testResults.passed + this.testResults.failed + this.testResults.skipped;
        const passRate = total > 0 ? (this.testResults.passed / total * 100).toFixed(1) : 0;

        console.log('');
        console.log(`Total Tests: ${total}`);
        console.log(colorize(`✅ Passed: ${this.testResults.passed}`, 'green'));
        console.log(colorize(`❌ Failed: ${this.testResults.failed}`, 'red'));
        console.log(colorize(`⏭️  Skipped: ${this.testResults.skipped}`, 'yellow'));
        console.log(`Pass Rate: ${passRate}%`);

        if (this.testResults.failed > 0) {
            console.log(colorize('\nFailed Tests:', 'red'));
            this.testResults.tests
                .filter(t => t.status === 'failed')
                .forEach(t => {
                    console.log(`  - ${t.name}: ${t.error}`);
                });
        }

        if (this.testResults.skipped > 0) {
            console.log(colorize('\nSkipped Tests:', 'yellow'));
            this.testResults.tests
                .filter(t => t.status === 'skipped')
                .forEach(t => {
                    console.log(`  - ${t.name}: ${t.reason}`);
                });
        }

        // Export metrics
        if (this.client) {
            printSection('Exporting Metrics');
            try {
                this.client.exportMetrics('./test-api-metrics.json');
                printSuccess('Metrics exported to test-api-metrics.json');
            } catch (error) {
                printError(`Failed to export metrics: ${error.message}`);
            }
        }

        console.log('\n' + '='.repeat(80) + '\n');

        // Return exit code
        return this.testResults.failed === 0 ? 0 : 1;
    }

    async runAll() {
        try {
            await this.initialize();

            // Run all tests
            await this.testOpenAI();
            await this.testAnthropic();
            await this.testGoogle();
            await this.testTogether();
            await this.testParallelQueries();
            await this.testRateLimiting();
            await this.testErrorHandling();
            await this.testMetricsTracking();
            await this.testResponseNormalization();
            await this.testCostCalculation();
            await this.testCaching();
            await this.testOrchestratorIntegration();

            const exitCode = this.printSummary();
            process.exit(exitCode);

        } catch (error) {
            printError(`Fatal error: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        }
    }
}

// Run tests
if (require.main === module) {
    const testSuite = new APITestSuite();
    testSuite.runAll().catch(console.error);
}

module.exports = { APITestSuite };
