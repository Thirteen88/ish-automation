#!/usr/bin/env node

/**
 * Query Optimizer
 *
 * Optimizes query processing through deduplication, result prediction,
 * priority scoring, and intelligent routing. Reduces redundant processing
 * and improves overall system efficiency.
 *
 * Features:
 * - Query deduplication
 * - Result prediction using cache
 * - Priority scoring
 * - Smart routing based on query type
 * - Query normalization
 * - Performance analytics
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class Query {
    constructor(id, text, options = {}) {
        this.id = id;
        this.text = text;
        this.originalText = text;
        this.normalizedText = this.normalize(text);
        this.hash = this.generateHash(this.normalizedText);
        this.options = options;
        this.priority = this.calculatePriority();
        this.type = this.detectType();
        this.complexity = this.assessComplexity();
        this.createdAt = Date.now();
        this.metadata = {
            length: text.length,
            wordCount: text.split(/\s+/).length,
            hasCode: this.hasCode(),
            hasUrls: this.hasUrls(),
            language: options.language || 'en'
        };
    }

    normalize(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[^\w\s]/g, ''); // Remove punctuation
    }

    generateHash(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }

    calculatePriority() {
        let priority = this.options.priority || 5; // Base priority 1-10

        // Adjust based on query characteristics
        if (this.options.urgent) priority += 3;
        if (this.options.clientId && this.options.premium) priority += 2;

        // Ensure priority is within bounds
        return Math.max(1, Math.min(10, priority));
    }

    detectType() {
        const text = this.text.toLowerCase();

        if (text.includes('code') || text.includes('function') || text.includes('implement')) {
            return 'code';
        }
        if (text.includes('explain') || text.includes('what is') || text.includes('define')) {
            return 'explanation';
        }
        if (text.includes('analyze') || text.includes('compare') || text.includes('evaluate')) {
            return 'analysis';
        }
        if (text.includes('create') || text.includes('write') || text.includes('generate')) {
            return 'generation';
        }
        if (text.includes('summarize') || text.includes('tldr')) {
            return 'summarization';
        }
        if (text.match(/\?$/)) {
            return 'question';
        }

        return 'general';
    }

    assessComplexity() {
        let complexity = 1; // 1-10 scale

        // Word count factor
        if (this.metadata.wordCount > 100) complexity += 3;
        else if (this.metadata.wordCount > 50) complexity += 2;
        else if (this.metadata.wordCount > 20) complexity += 1;

        // Type factor
        if (this.type === 'analysis' || this.type === 'code') complexity += 2;
        if (this.type === 'generation') complexity += 1;

        // Content complexity
        if (this.hasCode()) complexity += 2;
        if (this.hasUrls()) complexity += 1;

        return Math.min(10, complexity);
    }

    hasCode() {
        return /```|function|class|const|let|var|def|import|require/.test(this.text);
    }

    hasUrls() {
        return /https?:\/\//.test(this.text);
    }

    isSimilarTo(other, threshold = 0.8) {
        // Simple similarity based on normalized text
        if (this.hash === other.hash) return true;

        // Jaccard similarity
        const words1 = new Set(this.normalizedText.split(' '));
        const words2 = new Set(other.normalizedText.split(' '));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        const similarity = intersection.size / union.size;
        return similarity >= threshold;
    }

    getAge() {
        return Date.now() - this.createdAt;
    }
}

class QueryOptimizer extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enableDeduplication: config.enableDeduplication !== false,
            deduplicationWindow: config.deduplicationWindow || 60000, // 1 minute
            enablePrediction: config.enablePrediction !== false,
            similarityThreshold: config.similarityThreshold || 0.85,
            maxCacheSize: config.maxCacheSize || 1000,
            enableSmartRouting: config.enableSmartRouting !== false,
            ...config
        };

        this.queryCache = new Map(); // hash -> { query, result, timestamp }
        this.recentQueries = []; // For deduplication
        this.pendingQueries = new Map(); // hash -> [promises]
        this.nextQueryId = 1;

        // Platform routing preferences by query type
        this.routingPreferences = {
            code: ['claude', 'chatgpt', 'gemini'],
            explanation: ['chatgpt', 'claude', 'gemini'],
            analysis: ['claude', 'chatgpt', 'gemini'],
            generation: ['chatgpt', 'claude', 'gemini'],
            summarization: ['claude', 'chatgpt', 'gemini'],
            question: ['chatgpt', 'claude', 'gemini'],
            general: ['huggingchat', 'chatgpt', 'claude']
        };

        // Metrics
        this.metrics = {
            totalQueries: 0,
            duplicatesDetected: 0,
            cacheHits: 0,
            cacheMisses: 0,
            predictedResults: 0,
            optimizedRoutes: 0,
            totalTimeSaved: 0
        };
    }

    async optimize(queryText, options = {}) {
        const queryId = this.nextQueryId++;
        this.metrics.totalQueries++;

        console.log(`[Optimizer] Processing query #${queryId}...`);

        // Create query object
        const query = new Query(queryId, queryText, options);

        this.emit('queryReceived', query);

        // Step 1: Check for duplicates in recent queries
        if (this.config.enableDeduplication) {
            const duplicate = await this.checkDuplicates(query);
            if (duplicate) {
                this.metrics.duplicatesDetected++;
                console.log(`[Optimizer] Duplicate detected, using existing result`);
                return duplicate;
            }
        }

        // Step 2: Try to predict result from cache
        if (this.config.enablePrediction) {
            const predicted = await this.predictResult(query);
            if (predicted) {
                this.metrics.predictedResults++;
                this.metrics.cacheHits++;
                console.log(`[Optimizer] Result predicted from cache`);
                return predicted;
            }
        }

        this.metrics.cacheMisses++;

        // Step 3: Smart routing
        const route = this.config.enableSmartRouting
            ? this.selectOptimalPlatforms(query)
            : null;

        if (route) {
            this.metrics.optimizedRoutes++;
        }

        // Return optimization result
        return {
            queryId: query.id,
            query: query.text,
            hash: query.hash,
            type: query.type,
            complexity: query.complexity,
            priority: query.priority,
            recommendedPlatforms: route?.platforms || [],
            reasoning: route?.reasoning || null,
            cached: false,
            predicted: false,
            duplicate: false,
            metadata: query.metadata,
            timestamp: new Date().toISOString()
        };
    }

    async checkDuplicates(query) {
        // Clean up old queries
        const cutoff = Date.now() - this.config.deduplicationWindow;
        this.recentQueries = this.recentQueries.filter(q => q.getAge() < this.config.deduplicationWindow);

        // Check for exact duplicates
        const exactDuplicate = this.recentQueries.find(q => q.hash === query.hash);
        if (exactDuplicate) {
            // Check if there's a pending query with the same hash
            if (this.pendingQueries.has(query.hash)) {
                console.log(`[Optimizer] Found pending duplicate query, waiting...`);
                return new Promise((resolve) => {
                    this.pendingQueries.get(query.hash).push(resolve);
                });
            }

            // Check cache for result
            const cached = this.queryCache.get(query.hash);
            if (cached && Date.now() - cached.timestamp < this.config.deduplicationWindow) {
                return {
                    ...cached.result,
                    duplicate: true,
                    originalQueryId: exactDuplicate.id
                };
            }
        }

        // Check for similar queries
        for (const recentQuery of this.recentQueries) {
            if (query.isSimilarTo(recentQuery, this.config.similarityThreshold)) {
                const cached = this.queryCache.get(recentQuery.hash);
                if (cached && Date.now() - cached.timestamp < this.config.deduplicationWindow) {
                    console.log(`[Optimizer] Found similar query (similarity >= ${this.config.similarityThreshold})`);
                    return {
                        ...cached.result,
                        duplicate: true,
                        similar: true,
                        originalQueryId: recentQuery.id
                    };
                }
            }
        }

        // Add to recent queries
        this.recentQueries.push(query);

        // Initialize pending queries array
        if (!this.pendingQueries.has(query.hash)) {
            this.pendingQueries.set(query.hash, []);
        }

        return null;
    }

    async predictResult(query) {
        // Try exact match first
        const cached = this.queryCache.get(query.hash);
        if (cached) {
            const age = Date.now() - cached.timestamp;
            if (age < this.config.deduplicationWindow) {
                return {
                    ...cached.result,
                    cached: true,
                    predicted: true,
                    cacheAge: age
                };
            }
        }

        // Try to find similar queries
        for (const [hash, entry] of this.queryCache) {
            if (query.hash === hash) continue;

            // Check if query is similar
            const similarQuery = this.recentQueries.find(q => q.hash === hash);
            if (similarQuery && query.isSimilarTo(similarQuery, this.config.similarityThreshold)) {
                const age = Date.now() - entry.timestamp;
                if (age < this.config.deduplicationWindow) {
                    return {
                        ...entry.result,
                        cached: true,
                        predicted: true,
                        similar: true,
                        cacheAge: age
                    };
                }
            }
        }

        return null;
    }

    selectOptimalPlatforms(query) {
        // Get preferred platforms for this query type
        const preferredPlatforms = this.routingPreferences[query.type] || this.routingPreferences.general;

        // Score platforms based on query characteristics
        const scores = preferredPlatforms.map((platform, index) => ({
            platform,
            score: this.scorePlatform(platform, query, index)
        }));

        // Sort by score
        scores.sort((a, b) => b.score - a.score);

        // Return top 3 platforms
        const topPlatforms = scores.slice(0, 3).map(s => s.platform);

        return {
            platforms: topPlatforms,
            reasoning: this.generateRoutingReasoning(query, topPlatforms)
        };
    }

    scorePlatform(platform, query, preferenceIndex) {
        let score = 100 - (preferenceIndex * 10); // Base score from preference order

        // Adjust for query type
        if (query.type === 'code' && platform === 'claude') score += 20;
        if (query.type === 'explanation' && platform === 'chatgpt') score += 15;
        if (query.type === 'analysis' && platform === 'claude') score += 15;

        // Adjust for complexity
        if (query.complexity > 7 && (platform === 'claude' || platform === 'chatgpt')) {
            score += 10;
        }

        // Adjust for length
        if (query.metadata.wordCount > 50 && platform === 'claude') {
            score += 10; // Claude handles long contexts well
        }

        return score;
    }

    generateRoutingReasoning(query, platforms) {
        const reasons = [];

        reasons.push(`Query type: ${query.type}`);
        reasons.push(`Complexity: ${query.complexity}/10`);
        reasons.push(`Priority: ${query.priority}/10`);

        if (query.hasCode()) {
            reasons.push('Contains code - preferring code-capable models');
        }

        if (query.metadata.wordCount > 50) {
            reasons.push('Long query - preferring models with large context windows');
        }

        reasons.push(`Recommended platforms: ${platforms.join(', ')}`);

        return reasons.join('; ');
    }

    cacheResult(query, result) {
        // Add to cache
        this.queryCache.set(query.hash, {
            query: query,
            result: result,
            timestamp: Date.now()
        });

        // Resolve pending duplicate queries
        if (this.pendingQueries.has(query.hash)) {
            const waiters = this.pendingQueries.get(query.hash);
            for (const resolve of waiters) {
                resolve({
                    ...result,
                    duplicate: true,
                    originalQueryId: query.id
                });
            }
            this.pendingQueries.delete(query.hash);
        }

        // Limit cache size
        if (this.queryCache.size > this.config.maxCacheSize) {
            // Remove oldest entries
            const entries = Array.from(this.queryCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

            const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize);
            for (const [hash] of toRemove) {
                this.queryCache.delete(hash);
            }
        }

        this.emit('resultCached', query.hash);
    }

    invalidateCache(queryHash = null) {
        if (queryHash) {
            this.queryCache.delete(queryHash);
            console.log(`[Optimizer] Cache invalidated for query: ${queryHash}`);
        } else {
            this.queryCache.clear();
            console.log('[Optimizer] Cache cleared');
        }
    }

    getRecommendedPlatform(queryType) {
        const platforms = this.routingPreferences[queryType] || this.routingPreferences.general;
        return platforms[0];
    }

    setRoutingPreference(queryType, platforms) {
        this.routingPreferences[queryType] = platforms;
        console.log(`[Optimizer] Updated routing preference for ${queryType}: ${platforms.join(', ')}`);
    }

    getMetrics() {
        const deduplicationRate = this.metrics.totalQueries > 0
            ? (this.metrics.duplicatesDetected / this.metrics.totalQueries * 100).toFixed(2)
            : 0;

        const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
            ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2)
            : 0;

        const optimizationRate = this.metrics.totalQueries > 0
            ? ((this.metrics.duplicatesDetected + this.metrics.predictedResults) / this.metrics.totalQueries * 100).toFixed(2)
            : 0;

        return {
            ...this.metrics,
            deduplicationRate: `${deduplicationRate}%`,
            cacheHitRate: `${cacheHitRate}%`,
            optimizationRate: `${optimizationRate}%`,
            cacheSize: this.queryCache.size,
            recentQueriesCount: this.recentQueries.length,
            pendingDuplicates: this.pendingQueries.size,
            timestamp: new Date().toISOString()
        };
    }

    async shutdown() {
        console.log('[Optimizer] Shutting down query optimizer...');

        this.queryCache.clear();
        this.recentQueries = [];
        this.pendingQueries.clear();

        this.emit('shutdown', this.getMetrics());
        console.log('[Optimizer] Query optimizer shut down successfully');
    }
}

module.exports = { QueryOptimizer, Query };

// Demo
if (require.main === module) {
    async function demo() {
        const optimizer = new QueryOptimizer({
            enableDeduplication: true,
            enablePrediction: true,
            enableSmartRouting: true,
            similarityThreshold: 0.85
        });

        // Listen to events
        optimizer.on('queryReceived', (query) => {
            console.log(`✓ Query received: "${query.text.substring(0, 50)}..." (type: ${query.type}, complexity: ${query.complexity})`);
        });

        console.log('=== Testing query optimizer ===\n');

        // Test 1: Different query types
        console.log('--- Test 1: Query Type Detection ---\n');

        const queries = [
            'Write a function to sort an array',
            'Explain how photosynthesis works',
            'Analyze the pros and cons of remote work',
            'Create a haiku about technology',
            'What is quantum computing?'
        ];

        for (const query of queries) {
            const result = await optimizer.optimize(query);
            console.log(`Query: "${query}"`);
            console.log(`Type: ${result.type}, Complexity: ${result.complexity}, Priority: ${result.priority}`);
            console.log(`Recommended: ${result.recommendedPlatforms.join(', ')}`);
            console.log();

            // Cache a mock result
            optimizer.cacheResult(
                new Query(result.queryId, query),
                { response: `Mock response for: ${query}` }
            );
        }

        // Test 2: Duplicate detection
        console.log('\n--- Test 2: Duplicate Detection ---\n');

        const duplicateQuery = 'Write a function to sort an array';
        console.log(`Submitting duplicate query: "${duplicateQuery}"`);

        const result1 = await optimizer.optimize(duplicateQuery);
        console.log(`Duplicate detected: ${result1.duplicate || false}`);
        console.log(`Cached: ${result1.cached || false}`);

        // Test 3: Similar query detection
        console.log('\n--- Test 3: Similar Query Detection ---\n');

        const similarQuery = 'Write a function to sort arrays';
        console.log(`Submitting similar query: "${similarQuery}"`);

        const result2 = await optimizer.optimize(similarQuery);
        console.log(`Similar detected: ${result2.similar || false}`);
        console.log(`Cached: ${result2.cached || false}`);

        // Test 4: Concurrent duplicate queries
        console.log('\n--- Test 4: Concurrent Duplicates ---\n');

        const newQuery = 'What is machine learning in simple terms?';
        console.log(`Submitting 5 concurrent identical queries...`);

        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(optimizer.optimize(newQuery));
        }

        const results = await Promise.all(promises);
        const duplicates = results.filter(r => r.duplicate).length;
        console.log(`Duplicates detected: ${duplicates}/5`);

        console.log('\n=== Optimizer metrics ===\n');
        console.log(JSON.stringify(optimizer.getMetrics(), null, 2));

        await optimizer.shutdown();
    }

    demo().catch(console.error);
}
