#!/usr/bin/env node

/**
 * API-Powered Multi-Modal Orchestrator
 *
 * Integrates the Production API Client with the Multi-Modal Orchestrator
 * to provide real API connections alongside browser automation.
 *
 * Features:
 * - Hybrid mode: Use APIs or browser automation
 * - Smart routing: Choose fastest/cheapest option
 * - Fallback mechanism: API first, then browser automation
 * - Cost optimization: Track and minimize API costs
 * - Performance comparison: API vs browser automation
 */

const { MultiModalOrchestrator } = require('./multi-modal-orchestrator');
const { ProductionAPIClient } = require('./production-api-client');
const CLIVisualizer = require('./cli-visualizer');

class APIPoweredOrchestrator {
    constructor(config = {}) {
        this.visualizer = new CLIVisualizer();
        this.config = {
            preferAPI: config.preferAPI !== false, // Prefer API by default
            fallbackToBrowser: config.fallbackToBrowser !== false,
            costThreshold: config.costThreshold || 0.10, // Max cost per request in dollars
            parallelMode: config.parallelMode || false,
            ...config
        };

        // Initialize API client
        try {
            this.apiClient = new ProductionAPIClient(config.apiConfig);
            this.apiAvailable = true;
            this.log('✅ API Client initialized');
        } catch (error) {
            this.log('⚠️  API Client initialization failed:', error.message);
            this.apiAvailable = false;
        }

        // Initialize browser orchestrator (as fallback)
        this.browserOrchestrator = null;

        // Track performance
        this.performanceStats = {
            api: { count: 0, totalTime: 0, totalCost: 0 },
            browser: { count: 0, totalTime: 0, totalCost: 0 }
        };
    }

    async initialize() {
        this.visualizer.clear();
        this.visualizer.sectionHeader('API-Powered Multi-Modal Orchestrator', '🚀');

        console.log(this.colorize('\n📊 Configuration:', 'yellow'));
        console.log(`  Prefer API: ${this.colorize(String(this.config.preferAPI), 'green')}`);
        console.log(`  Fallback to Browser: ${this.colorize(String(this.config.fallbackToBrowser), 'green')}`);
        console.log(`  API Available: ${this.colorize(String(this.apiAvailable), this.apiAvailable ? 'green' : 'red')}`);

        // Initialize browser orchestrator if needed
        if (this.config.fallbackToBrowser) {
            this.browserOrchestrator = new MultiModalOrchestrator({
                headless: true,
                parallel: this.config.parallelMode
            });
            await this.browserOrchestrator.initialize();
        }

        return true;
    }

    /**
     * Route text request intelligently
     */
    async processTextRequest(prompt, options = {}) {
        this.visualizer.sectionHeader('Processing Text Request', '💬');
        console.log(this.colorize(`\nPrompt: "${prompt.substring(0, 100)}..."`, 'cyan'));

        const strategy = this.determineStrategy('text', options);
        console.log(this.colorize(`Strategy: ${strategy}`, 'yellow'));

        switch (strategy) {
            case 'api':
                return await this.handleAPIRequest(prompt, options);

            case 'browser':
                return await this.handleBrowserRequest(prompt, 'text', options);

            case 'parallel':
                return await this.handleParallelRequest(prompt, options);

            case 'api-with-fallback':
                try {
                    return await this.handleAPIRequest(prompt, options);
                } catch (error) {
                    this.log('⚠️  API request failed, falling back to browser');
                    return await this.handleBrowserRequest(prompt, 'text', options);
                }

            default:
                throw new Error(`Unknown strategy: ${strategy}`);
        }
    }

    /**
     * Handle API-based request
     */
    async handleAPIRequest(prompt, options = {}) {
        this.visualizer.displayInfo('Using API mode...');

        const requestedAPIs = options.apis || this.getDefaultAPIs();
        const results = [];

        for (const apiName of requestedAPIs) {
            const startTime = Date.now();

            try {
                this.visualizer.displayAgentActivity(
                    `🤖 ${apiName}`,
                    'Querying API...',
                    'active'
                );

                let response;
                const model = options.models?.[apiName];

                switch (apiName.toLowerCase()) {
                    case 'openai':
                        response = await this.apiClient.queryOpenAI(prompt, {
                            model: model || 'gpt-3.5-turbo',
                            maxTokens: options.maxTokens || 1000,
                            temperature: options.temperature || 0.7
                        });
                        break;

                    case 'anthropic':
                        response = await this.apiClient.queryAnthropic(prompt, {
                            model: model || 'claude-3-sonnet',
                            maxTokens: options.maxTokens || 1000,
                            temperature: options.temperature || 0.7
                        });
                        break;

                    case 'google':
                        response = await this.apiClient.queryGoogle(prompt, {
                            model: model || 'gemini-pro',
                            maxTokens: options.maxTokens || 1000,
                            temperature: options.temperature || 0.7
                        });
                        break;

                    case 'together':
                        response = await this.apiClient.queryTogether(prompt, {
                            model: model || 'llama-3-70b',
                            maxTokens: options.maxTokens || 1000,
                            temperature: options.temperature || 0.7
                        });
                        break;

                    case 'replicate':
                        response = await this.apiClient.queryReplicate(prompt, {
                            model: model || 'llama-3-70b',
                            maxTokens: options.maxTokens || 1000,
                            temperature: options.temperature || 0.7
                        });
                        break;

                    default:
                        throw new Error(`Unsupported API: ${apiName}`);
                }

                const duration = Date.now() - startTime;

                this.visualizer.displayAgentActivity(
                    `🤖 ${apiName}`,
                    `Complete (${(duration / 1000).toFixed(2)}s, $${response.cost.toFixed(6)})`,
                    'complete'
                );

                // Track stats
                this.performanceStats.api.count++;
                this.performanceStats.api.totalTime += duration;
                this.performanceStats.api.totalCost += response.cost;

                results.push({
                    provider: apiName,
                    method: 'api',
                    success: true,
                    response: response,
                    duration: duration,
                    cost: response.cost
                });

                // Stop after first success if not querying all
                if (!options.queryAll) {
                    break;
                }

            } catch (error) {
                const duration = Date.now() - startTime;

                this.visualizer.displayAgentActivity(
                    `🤖 ${apiName}`,
                    `Failed (${error.message})`,
                    'error'
                );

                results.push({
                    provider: apiName,
                    method: 'api',
                    success: false,
                    error: error.message,
                    duration: duration
                });
            }
        }

        return this.formatResults(results);
    }

    /**
     * Handle browser-based request
     */
    async handleBrowserRequest(prompt, taskType, options = {}) {
        if (!this.browserOrchestrator) {
            throw new Error('Browser orchestrator not initialized');
        }

        this.visualizer.displayInfo('Using browser automation mode...');

        const startTime = Date.now();
        const results = await this.browserOrchestrator.routeRequest(prompt, {
            type: taskType,
            ...options
        });
        const duration = Date.now() - startTime;

        // Track stats
        this.performanceStats.browser.count++;
        this.performanceStats.browser.totalTime += duration;

        return this.formatResults([{
            provider: 'browser-automation',
            method: 'browser',
            success: true,
            results: results,
            duration: duration,
            cost: 0
        }]);
    }

    /**
     * Handle parallel API + Browser request
     */
    async handleParallelRequest(prompt, options = {}) {
        this.visualizer.displayInfo('Using parallel mode (API + Browser)...');

        const promises = [
            this.handleAPIRequest(prompt, { ...options, queryAll: false })
                .catch(error => ({ method: 'api', success: false, error: error.message })),
            this.handleBrowserRequest(prompt, 'text', { ...options, queryAll: false })
                .catch(error => ({ method: 'browser', success: false, error: error.message }))
        ];

        const [apiResult, browserResult] = await Promise.allSettled(promises);

        const results = [];
        if (apiResult.status === 'fulfilled') {
            results.push(...(apiResult.value.results || [apiResult.value]));
        }
        if (browserResult.status === 'fulfilled') {
            results.push(...(browserResult.value.results || [browserResult.value]));
        }

        return this.formatResults(results);
    }

    /**
     * Determine best strategy based on context
     */
    determineStrategy(taskType, options = {}) {
        // If explicitly specified
        if (options.strategy) {
            return options.strategy;
        }

        // Text tasks: prefer API
        if (taskType === 'text') {
            if (this.apiAvailable && this.config.preferAPI) {
                return this.config.fallbackToBrowser ? 'api-with-fallback' : 'api';
            } else if (this.config.fallbackToBrowser) {
                return 'browser';
            }
        }

        // Non-text tasks: use browser automation
        if (['image', 'video', 'voice', 'design'].includes(taskType)) {
            return 'browser';
        }

        // Parallel mode if requested
        if (this.config.parallelMode && options.queryAll) {
            return 'parallel';
        }

        return 'browser';
    }

    /**
     * Get default APIs based on available keys
     */
    getDefaultAPIs() {
        const available = [];

        if (this.apiClient.apiKeys.openai) available.push('openai');
        if (this.apiClient.apiKeys.anthropic) available.push('anthropic');
        if (this.apiClient.apiKeys.google) available.push('google');
        if (this.apiClient.apiKeys.together) available.push('together');

        // Default order: prioritize faster/cheaper APIs
        return available.length > 0 ? available : ['openai'];
    }

    /**
     * Format and normalize results
     */
    formatResults(results) {
        const formatted = {
            success: results.some(r => r.success),
            results: results,
            summary: {
                total: results.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                totalCost: results.reduce((sum, r) => sum + (r.cost || 0), 0),
                averageLatency: results.length > 0 ?
                    results.reduce((sum, r) => sum + r.duration, 0) / results.length : 0
            }
        };

        return formatted;
    }

    /**
     * Display comprehensive results
     */
    displayResults(results) {
        this.visualizer.sectionHeader('Results', '📊');

        console.log(this.colorize('\n✅ Successful Responses:', 'green'));
        const successful = results.results.filter(r => r.success);

        successful.forEach(r => {
            console.log(`\n  Provider: ${r.provider} (${r.method})`);
            console.log(`  Duration: ${(r.duration / 1000).toFixed(2)}s`);
            console.log(`  Cost: $${(r.cost || 0).toFixed(6)}`);

            if (r.response?.text) {
                const preview = r.response.text.substring(0, 150);
                console.log(`  Response: ${preview}${r.response.text.length > 150 ? '...' : ''}`);
            }
        });

        if (results.summary.failed > 0) {
            console.log(this.colorize('\n❌ Failed Responses:', 'red'));
            const failed = results.results.filter(r => !r.success);

            failed.forEach(r => {
                console.log(`  Provider: ${r.provider} - ${r.error}`);
            });
        }

        // Display summary
        this.visualizer.displayMetrics({
            'Total Requests': results.summary.total,
            'Successful': results.summary.successful,
            'Failed': results.summary.failed,
            'Total Cost': `$${results.summary.totalCost.toFixed(6)}`,
            'Avg Latency': `${(results.summary.averageLatency / 1000).toFixed(2)}s`
        });
    }

    /**
     * Get performance comparison
     */
    getPerformanceComparison() {
        const api = this.performanceStats.api;
        const browser = this.performanceStats.browser;

        return {
            api: {
                requests: api.count,
                averageTime: api.count > 0 ? (api.totalTime / api.count / 1000).toFixed(2) + 's' : 'N/A',
                totalCost: '$' + api.totalCost.toFixed(4),
                averageCost: api.count > 0 ? '$' + (api.totalCost / api.count).toFixed(6) : 'N/A'
            },
            browser: {
                requests: browser.count,
                averageTime: browser.count > 0 ? (browser.totalTime / browser.count / 1000).toFixed(2) + 's' : 'N/A',
                totalCost: '$0.0000',
                averageCost: '$0.0000'
            }
        };
    }

    /**
     * Display performance comparison
     */
    displayPerformanceComparison() {
        const comparison = this.getPerformanceComparison();

        this.visualizer.sectionHeader('Performance Comparison', '📈');

        console.log(this.colorize('\n🤖 API Mode:', 'cyan'));
        console.log(`  Requests: ${comparison.api.requests}`);
        console.log(`  Avg Time: ${comparison.api.averageTime}`);
        console.log(`  Total Cost: ${comparison.api.totalCost}`);
        console.log(`  Avg Cost: ${comparison.api.averageCost}`);

        console.log(this.colorize('\n🌐 Browser Mode:', 'cyan'));
        console.log(`  Requests: ${comparison.browser.requests}`);
        console.log(`  Avg Time: ${comparison.browser.averageTime}`);
        console.log(`  Total Cost: ${comparison.browser.totalCost}`);
        console.log(`  Avg Cost: ${comparison.browser.averageCost}`);
    }

    /**
     * Export API metrics
     */
    exportAPIMetrics(filepath) {
        if (this.apiClient) {
            this.apiClient.exportMetrics(filepath);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.visualizer.displayInfo('Cleaning up resources...');

        if (this.browserOrchestrator) {
            await this.browserOrchestrator.cleanup();
        }

        if (this.apiClient) {
            this.apiClient.clearCache();
        }

        this.visualizer.displaySuccess('Cleanup completed');
    }

    log(message, ...args) {
        console.log(message, ...args);
    }

    colorize(text, color) {
        const colors = {
            reset: '\x1b[0m',
            cyan: '\x1b[36m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            red: '\x1b[31m'
        };
        return `${colors[color] || ''}${text}${colors.reset}`;
    }
}

module.exports = { APIPoweredOrchestrator };

// Demo
if (require.main === module) {
    async function demo() {
        require('dotenv').config();

        const orchestrator = new APIPoweredOrchestrator({
            preferAPI: true,
            fallbackToBrowser: true,
            parallelMode: false
        });

        try {
            await orchestrator.initialize();

            // Example queries
            const examples = [
                {
                    prompt: "Explain quantum entanglement in simple terms",
                    options: { apis: ['openai', 'anthropic'] }
                },
                {
                    prompt: "Write a haiku about artificial intelligence",
                    options: { queryAll: true }
                },
                {
                    prompt: "What are the benefits of renewable energy?",
                    options: { maxTokens: 200 }
                }
            ];

            for (const example of examples) {
                console.log('\n' + '='.repeat(80));
                console.log(`\nExample: "${example.prompt}"`);

                const results = await orchestrator.processTextRequest(
                    example.prompt,
                    example.options
                );

                orchestrator.displayResults(results);

                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Display performance comparison
            console.log('\n' + '='.repeat(80));
            orchestrator.displayPerformanceComparison();

            // Export metrics
            orchestrator.exportAPIMetrics('./api-performance-metrics.json');

            await orchestrator.cleanup();

        } catch (error) {
            console.error('Error:', error);
            await orchestrator.cleanup();
        }
    }

    demo().catch(console.error);
}
