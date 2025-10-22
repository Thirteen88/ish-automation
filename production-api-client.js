#!/usr/bin/env node

/**
 * Production API Client for Multi-Modal AI Orchestrator
 *
 * Provides real API integrations for:
 * - OpenAI (ChatGPT)
 * - Anthropic (Claude)
 * - Google AI (Gemini)
 * - Replicate (Open source models)
 * - Together AI (Llama, Mixtral, etc.)
 *
 * Features:
 * - Automatic authentication
 * - Rate limiting with token bucket algorithm
 * - Exponential backoff retry logic
 * - Response normalization
 * - Cost tracking
 * - Comprehensive error handling
 * - Request/response logging
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

class ProductionAPIClient {
    constructor(config = {}) {
        // Load configuration
        this.config = this.loadConfig(config.configPath);
        this.apiKeys = this.loadAPIKeys();

        // Initialize state
        this.metrics = {
            requests: {},
            tokens: {},
            costs: {},
            errors: {},
            latency: {}
        };

        // Rate limiters (token bucket implementation)
        this.rateLimiters = {};
        this.initializeRateLimiters();

        // Request cache
        this.cache = new Map();
        this.cacheEnabled = this.config.globalSettings?.enableCaching || false;

        // Logger
        this.logLevel = this.config.globalSettings?.logLevel || 'info';

        console.log('✅ Production API Client initialized');
        console.log(`   Configured APIs: ${Object.keys(this.config.apis).join(', ')}`);
    }

    /**
     * Load API configuration from file
     */
    loadConfig(configPath) {
        const defaultPath = path.join(__dirname, 'api-config.json');
        const filePath = configPath || defaultPath;

        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            this.log('error', `Failed to load config from ${filePath}:`, error.message);
            throw new Error(`Configuration file not found or invalid: ${filePath}`);
        }
    }

    /**
     * Load API keys from environment variables
     */
    loadAPIKeys() {
        const keys = {};
        const envVars = this.config.globalSettings?.environmentVariables || {};

        for (const [api, envVar] of Object.entries(envVars)) {
            const key = process.env[envVar];
            if (key) {
                keys[api] = key;
                this.log('debug', `Loaded API key for ${api}`);
            } else {
                this.log('warn', `API key for ${api} not found in environment variable ${envVar}`);
            }
        }

        return keys;
    }

    /**
     * Initialize rate limiters for each API
     */
    initializeRateLimiters() {
        for (const [apiName, apiConfig] of Object.entries(this.config.apis)) {
            this.rateLimiters[apiName] = {
                tokens: apiConfig.rateLimits.requestsPerMinute,
                maxTokens: apiConfig.rateLimits.requestsPerMinute,
                refillRate: apiConfig.rateLimits.requestsPerMinute / 60, // per second
                lastRefill: Date.now()
            };
        }
    }

    /**
     * Check and consume rate limit token
     */
    async checkRateLimit(apiName) {
        const limiter = this.rateLimiters[apiName];
        if (!limiter) return true;

        // Refill tokens based on time elapsed
        const now = Date.now();
        const timePassed = (now - limiter.lastRefill) / 1000;
        limiter.tokens = Math.min(
            limiter.maxTokens,
            limiter.tokens + (timePassed * limiter.refillRate)
        );
        limiter.lastRefill = now;

        // Check if we have tokens available
        if (limiter.tokens < 1) {
            const waitTime = (1 - limiter.tokens) / limiter.refillRate * 1000;
            this.log('warn', `Rate limit reached for ${apiName}, waiting ${Math.ceil(waitTime)}ms`);
            await this.sleep(waitTime);
            limiter.tokens = 1;
        }

        // Consume token
        limiter.tokens -= 1;
        return true;
    }

    /**
     * Send a prompt to OpenAI
     */
    async queryOpenAI(prompt, options = {}) {
        const apiConfig = this.config.apis.openai;
        const model = options.model || 'gpt-3.5-turbo';
        const modelConfig = apiConfig.models[model] || apiConfig.models['gpt-3.5-turbo'];

        const requestBody = {
            model: modelConfig.id,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1000,
            stream: false
        };

        const response = await this.makeRequest('openai', {
            method: 'POST',
            path: apiConfig.endpoints.chat,
            body: requestBody,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKeys.openai}`
            }
        });

        return this.normalizeResponse('openai', response, modelConfig);
    }

    /**
     * Send a prompt to Anthropic Claude
     */
    async queryAnthropic(prompt, options = {}) {
        const apiConfig = this.config.apis.anthropic;
        const model = options.model || 'claude-3-sonnet';
        const modelConfig = apiConfig.models[model] || apiConfig.models['claude-3-sonnet'];

        const requestBody = {
            model: modelConfig.id,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: options.maxTokens || 1000,
            temperature: options.temperature || 0.7
        };

        const response = await this.makeRequest('anthropic', {
            method: 'POST',
            path: apiConfig.endpoints.messages,
            body: requestBody,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKeys.anthropic,
                'anthropic-version': '2023-06-01'
            }
        });

        return this.normalizeResponse('anthropic', response, modelConfig);
    }

    /**
     * Send a prompt to Google Gemini
     */
    async queryGoogle(prompt, options = {}) {
        const apiConfig = this.config.apis.google;
        const model = options.model || 'gemini-pro';
        const modelConfig = apiConfig.models[model] || apiConfig.models['gemini-pro'];

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.maxTokens || 1000
            }
        };

        const path = apiConfig.endpoints.generateContent
            .replace('{model}', modelConfig.id);

        const response = await this.makeRequest('google', {
            method: 'POST',
            path: `${path}?key=${this.apiKeys.google}`,
            body: requestBody,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return this.normalizeResponse('google', response, modelConfig);
    }

    /**
     * Send a prompt to Replicate
     */
    async queryReplicate(prompt, options = {}) {
        const apiConfig = this.config.apis.replicate;
        const model = options.model || 'llama-3-70b';
        const modelConfig = apiConfig.models[model] || apiConfig.models['llama-3-70b'];

        // Create prediction
        const requestBody = {
            version: modelConfig.id,
            input: {
                prompt: prompt,
                max_new_tokens: options.maxTokens || 1000,
                temperature: options.temperature || 0.7
            }
        };

        const prediction = await this.makeRequest('replicate', {
            method: 'POST',
            path: apiConfig.endpoints.predictions,
            body: requestBody,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${this.apiKeys.replicate}`
            }
        });

        // Poll for completion
        const result = await this.pollReplicatePrediction(prediction.id, apiConfig);

        return this.normalizeResponse('replicate', result, modelConfig);
    }

    /**
     * Poll Replicate prediction until completion
     */
    async pollReplicatePrediction(predictionId, apiConfig) {
        const maxAttempts = apiConfig.maxPollingAttempts || 300;
        const interval = apiConfig.pollingInterval || 1000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const status = await this.makeRequest('replicate', {
                method: 'GET',
                path: apiConfig.endpoints.predictionStatus.replace('{id}', predictionId),
                headers: {
                    'Authorization': `Token ${this.apiKeys.replicate}`
                }
            });

            if (status.status === 'succeeded') {
                return status;
            } else if (status.status === 'failed') {
                throw new Error(`Replicate prediction failed: ${status.error}`);
            }

            await this.sleep(interval);
        }

        throw new Error('Replicate prediction timeout');
    }

    /**
     * Send a prompt to Together AI
     */
    async queryTogether(prompt, options = {}) {
        const apiConfig = this.config.apis.together;
        const model = options.model || 'llama-3-70b';
        const modelConfig = apiConfig.models[model] || apiConfig.models['llama-3-70b'];

        const requestBody = {
            model: modelConfig.id,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1000
        };

        const response = await this.makeRequest('together', {
            method: 'POST',
            path: apiConfig.endpoints.chat,
            body: requestBody,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKeys.together}`
            }
        });

        return this.normalizeResponse('together', response, modelConfig);
    }

    /**
     * Query multiple APIs in parallel
     */
    async queryMultiple(prompt, apis = [], options = {}) {
        this.log('info', `Querying ${apis.length} APIs in parallel`);

        const promises = apis.map(async (api) => {
            try {
                const method = `query${this.capitalize(api)}`;
                if (typeof this[method] !== 'function') {
                    throw new Error(`Unknown API: ${api}`);
                }

                const startTime = Date.now();
                const result = await this[method](prompt, options);
                const duration = Date.now() - startTime;

                return {
                    api,
                    success: true,
                    result,
                    duration
                };
            } catch (error) {
                this.log('error', `Error querying ${api}:`, error.message);
                return {
                    api,
                    success: false,
                    error: error.message,
                    duration: 0
                };
            }
        });

        const results = await Promise.allSettled(promises);

        return results.map(r => r.status === 'fulfilled' ? r.value : {
            api: 'unknown',
            success: false,
            error: r.reason?.message || 'Unknown error'
        });
    }

    /**
     * Make HTTP/HTTPS request with retry logic
     */
    async makeRequest(apiName, options, retryCount = 0) {
        // Check rate limit
        await this.checkRateLimit(apiName);

        // Check cache
        const cacheKey = this.getCacheKey(apiName, options);
        if (this.cacheEnabled && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < (this.config.globalSettings?.cacheExpiry || 3600000)) {
                this.log('debug', `Cache hit for ${apiName}`);
                return cached.data;
            } else {
                this.cache.delete(cacheKey);
            }
        }

        const apiConfig = this.config.apis[apiName];
        const url = new URL(options.path, apiConfig.baseUrl);

        const requestOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.timeout || apiConfig.timeout
        };

        const startTime = Date.now();

        try {
            const response = await this.executeRequest(url.protocol, requestOptions, options.body);
            const duration = Date.now() - startTime;

            // Track metrics
            this.trackMetrics(apiName, 'success', duration, response);

            // Cache successful response
            if (this.cacheEnabled && options.method === 'POST') {
                this.cache.set(cacheKey, {
                    data: response,
                    timestamp: Date.now()
                });
            }

            return response;

        } catch (error) {
            const duration = Date.now() - startTime;

            // Track error
            this.trackMetrics(apiName, 'error', duration, null, error);

            // Check if error is retryable
            const retryConfig = apiConfig.retryConfig;
            const isRetryable = this.isRetryableError(error, retryConfig);

            if (isRetryable && retryCount < retryConfig.maxRetries) {
                const delay = this.calculateBackoff(retryCount, retryConfig);
                this.log('warn', `Retrying ${apiName} request (attempt ${retryCount + 1}/${retryConfig.maxRetries}) after ${delay}ms`);

                await this.sleep(delay);
                return this.makeRequest(apiName, options, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Execute HTTP/HTTPS request
     */
    executeRequest(protocol, options, body) {
        return new Promise((resolve, reject) => {
            const client = protocol === 'https:' ? https : http;

            const req = client.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);

                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            const error = new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || data}`);
                            error.statusCode = res.statusCode;
                            error.response = parsed;
                            reject(error);
                        }
                    } catch (error) {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(data);
                        } else {
                            const err = new Error(`HTTP ${res.statusCode}: ${data}`);
                            err.statusCode = res.statusCode;
                            reject(err);
                        }
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                const error = new Error('Request timeout');
                error.statusCode = 408;
                reject(error);
            });

            if (body) {
                req.write(JSON.stringify(body));
            }

            req.end();
        });
    }

    /**
     * Normalize API responses to a consistent format
     */
    normalizeResponse(apiName, response, modelConfig) {
        const normalized = {
            provider: apiName,
            model: modelConfig.id,
            text: '',
            tokens: {
                input: 0,
                output: 0,
                total: 0
            },
            cost: 0,
            timestamp: new Date().toISOString(),
            raw: response
        };

        // Extract text based on API format
        switch (apiName) {
            case 'openai':
            case 'together':
                normalized.text = response.choices?.[0]?.message?.content || '';
                normalized.tokens.input = response.usage?.prompt_tokens || 0;
                normalized.tokens.output = response.usage?.completion_tokens || 0;
                normalized.tokens.total = response.usage?.total_tokens || 0;
                break;

            case 'anthropic':
                normalized.text = response.content?.[0]?.text || '';
                normalized.tokens.input = response.usage?.input_tokens || 0;
                normalized.tokens.output = response.usage?.output_tokens || 0;
                normalized.tokens.total = normalized.tokens.input + normalized.tokens.output;
                break;

            case 'google':
                normalized.text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
                normalized.tokens.input = response.usageMetadata?.promptTokenCount || 0;
                normalized.tokens.output = response.usageMetadata?.candidatesTokenCount || 0;
                normalized.tokens.total = response.usageMetadata?.totalTokenCount || 0;
                break;

            case 'replicate':
                normalized.text = Array.isArray(response.output) ?
                    response.output.join('') :
                    (response.output || '');
                // Replicate doesn't provide token counts, estimate
                normalized.tokens.output = Math.ceil(normalized.text.length / 4);
                normalized.tokens.total = normalized.tokens.output;
                break;
        }

        // Calculate cost
        normalized.cost = this.calculateCost(
            modelConfig,
            normalized.tokens.input,
            normalized.tokens.output
        );

        return normalized;
    }

    /**
     * Calculate request cost
     */
    calculateCost(modelConfig, inputTokens, outputTokens) {
        if (modelConfig.costPer1kInput && modelConfig.costPer1kOutput) {
            const inputCost = (inputTokens / 1000) * modelConfig.costPer1kInput;
            const outputCost = (outputTokens / 1000) * modelConfig.costPer1kOutput;
            return inputCost + outputCost;
        } else if (modelConfig.costPerSecond) {
            // For time-based pricing (Replicate)
            return 0; // Would need actual execution time
        }
        return 0;
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error, retryConfig) {
        if (!error.statusCode) return false;
        return retryConfig.retryableStatusCodes.includes(error.statusCode);
    }

    /**
     * Calculate exponential backoff delay
     */
    calculateBackoff(retryCount, retryConfig) {
        const delay = retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, retryCount);
        return Math.min(delay, retryConfig.maxDelay);
    }

    /**
     * Track API metrics
     */
    trackMetrics(apiName, status, duration, response, error) {
        if (!this.metrics.requests[apiName]) {
            this.metrics.requests[apiName] = { success: 0, error: 0 };
            this.metrics.tokens[apiName] = { input: 0, output: 0, total: 0 };
            this.metrics.costs[apiName] = 0;
            this.metrics.errors[apiName] = {};
            this.metrics.latency[apiName] = [];
        }

        this.metrics.requests[apiName][status]++;
        this.metrics.latency[apiName].push(duration);

        if (status === 'success' && response) {
            const normalized = this.normalizeResponse(apiName, response, {});
            this.metrics.tokens[apiName].input += normalized.tokens.input;
            this.metrics.tokens[apiName].output += normalized.tokens.output;
            this.metrics.tokens[apiName].total += normalized.tokens.total;
            this.metrics.costs[apiName] += normalized.cost;
        }

        if (error) {
            const errorType = error.statusCode || 'unknown';
            this.metrics.errors[apiName][errorType] =
                (this.metrics.errors[apiName][errorType] || 0) + 1;
        }
    }

    /**
     * Get metrics summary
     */
    getMetrics() {
        const summary = {
            requests: {},
            tokens: {},
            costs: {},
            latency: {},
            errors: {}
        };

        for (const api of Object.keys(this.metrics.requests)) {
            const requests = this.metrics.requests[api];
            const latencies = this.metrics.latency[api];

            summary.requests[api] = {
                total: requests.success + requests.error,
                success: requests.success,
                error: requests.error,
                successRate: requests.success / (requests.success + requests.error)
            };

            summary.tokens[api] = this.metrics.tokens[api];
            summary.costs[api] = this.metrics.costs[api].toFixed(4);

            if (latencies.length > 0) {
                summary.latency[api] = {
                    min: Math.min(...latencies),
                    max: Math.max(...latencies),
                    avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
                    p50: this.percentile(latencies, 0.5),
                    p95: this.percentile(latencies, 0.95),
                    p99: this.percentile(latencies, 0.99)
                };
            }

            summary.errors[api] = this.metrics.errors[api];
        }

        return summary;
    }

    /**
     * Calculate percentile
     */
    percentile(values, p) {
        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[index];
    }

    /**
     * Get cache key for request
     */
    getCacheKey(apiName, options) {
        return `${apiName}:${options.method}:${options.path}:${JSON.stringify(options.body || {})}`;
    }

    /**
     * Utility: Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Utility: Capitalize
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Logging with levels
     */
    log(level, ...args) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevel = levels[this.logLevel] || 1;

        if (levels[level] >= currentLevel) {
            const timestamp = new Date().toISOString();
            const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
            console.log(prefix, ...args);
        }
    }

    /**
     * Export metrics to file
     */
    exportMetrics(filepath) {
        const metrics = this.getMetrics();
        fs.writeFileSync(filepath, JSON.stringify(metrics, null, 2));
        this.log('info', `Metrics exported to ${filepath}`);
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        this.log('info', 'Cache cleared');
    }
}

module.exports = { ProductionAPIClient };

// Demo usage
if (require.main === module) {
    async function demo() {
        // Load environment variables
        require('dotenv').config();

        const client = new ProductionAPIClient();

        console.log('\n🚀 Testing Production API Client\n');
        console.log('=' .repeat(80));

        const testPrompt = "What is the capital of France? Answer in one sentence.";

        // Test individual APIs
        const tests = [
            { name: 'OpenAI', method: 'queryOpenAI' },
            { name: 'Anthropic', method: 'queryAnthropic' },
            { name: 'Google', method: 'queryGoogle' },
            { name: 'Together AI', method: 'queryTogether' }
        ];

        for (const test of tests) {
            if (client.apiKeys[test.name.toLowerCase().replace(' ', '')]) {
                console.log(`\n📡 Testing ${test.name}...`);
                try {
                    const result = await client[test.method](testPrompt, { maxTokens: 100 });
                    console.log(`✅ ${test.name} Response:`);
                    console.log(`   Text: ${result.text.substring(0, 100)}...`);
                    console.log(`   Tokens: ${result.tokens.total}`);
                    console.log(`   Cost: $${result.cost.toFixed(6)}`);
                } catch (error) {
                    console.log(`❌ ${test.name} Error: ${error.message}`);
                }
            } else {
                console.log(`⏭️  Skipping ${test.name} (no API key)`);
            }
        }

        // Test parallel queries
        console.log('\n\n📊 Testing Parallel Queries...');
        const availableApis = Object.keys(client.apiKeys);
        if (availableApis.length > 1) {
            const results = await client.queryMultiple(
                testPrompt,
                availableApis.slice(0, 3),
                { maxTokens: 100 }
            );

            console.log(`\n✅ Parallel Results (${results.length} APIs):`);
            results.forEach(r => {
                if (r.success) {
                    console.log(`   ${r.api}: ${r.duration}ms, $${r.result.cost.toFixed(6)}`);
                } else {
                    console.log(`   ${r.api}: Failed - ${r.error}`);
                }
            });
        }

        // Display metrics
        console.log('\n\n📈 Performance Metrics:');
        console.log('=' .repeat(80));
        const metrics = client.getMetrics();
        console.log(JSON.stringify(metrics, null, 2));

        // Export metrics
        client.exportMetrics('./api-metrics.json');
    }

    demo().catch(console.error);
}
