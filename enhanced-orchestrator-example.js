#!/usr/bin/env node

/**
 * Complete Integration Example
 *
 * Demonstrates how to use all components together:
 * - ProductionBrowserAutomation
 * - SessionManager
 * - RateLimitTracker
 * - BatchProcessor
 * - Integration with existing orchestrators
 */

const { ProductionBrowserAutomation } = require('./production-browser-automation');
const { SessionManager, RateLimitTracker, BatchProcessor } = require('./session-manager');

class EnhancedAIOrchestrator {
    constructor(config = {}) {
        this.automation = new ProductionBrowserAutomation({
            headless: config.headless !== false,
            verbose: config.verbose || false,
            ...config
        });

        this.sessionManager = new SessionManager({
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 3600000
        });

        this.rateLimitTracker = new RateLimitTracker({
            defaultRequestsPerMinute: 5,
            defaultCooldownMs: 12000
        });

        this.batchProcessor = new BatchProcessor(this.automation, {
            concurrency: config.concurrency || 3
        });

        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        console.log('Initializing Enhanced AI Orchestrator...\n');

        await this.automation.initialize();
        await this.sessionManager.initialize();

        // Configure rate limits for each platform
        this.rateLimitTracker.setLimit('claude', 5, 12000);
        this.rateLimitTracker.setLimit('chatgpt', 3, 20000);
        this.rateLimitTracker.setLimit('gemini', 5, 12000);
        this.rateLimitTracker.setLimit('lmarena', 10, 6000);
        this.rateLimitTracker.setLimit('poe', 5, 12000);
        this.rateLimitTracker.setLimit('playground', 2, 30000);
        this.rateLimitTracker.setLimit('veed', 1, 60000);

        this.initialized = true;
        console.log('✓ Enhanced AI Orchestrator initialized\n');
    }

    /**
     * Send a prompt with caching and rate limiting
     */
    async sendPrompt(platformName, prompt, options = {}) {
        await this.initialize();

        // Check cache first
        const cachedResponse = this.sessionManager.getCachedResponse(
            platformName,
            prompt,
            options
        );

        if (cachedResponse) {
            console.log(`Using cached response for ${platformName}`);
            return {
                platform: platformName,
                response: cachedResponse,
                cached: true,
                duration: '0.00'
            };
        }

        // Check rate limits
        const rateLimitCheck = this.rateLimitTracker.canMakeRequest(platformName);

        if (!rateLimitCheck.allowed) {
            console.log(`Rate limit for ${platformName}, waiting ${rateLimitCheck.waitTime}ms...`);
            await this.sleep(rateLimitCheck.waitTime);
        }

        // Record request
        this.rateLimitTracker.recordRequest(platformName);

        // Send request
        const result = await this.automation.sendPrompt(platformName, prompt, options);

        // Record analytics
        this.sessionManager.recordRequest(
            platformName,
            result.duration,
            result.success,
            result.error
        );

        // Cache successful response
        if (result.success) {
            await this.sessionManager.cacheResponse(
                platformName,
                prompt,
                result.response,
                options
            );
        } else if (result.error && result.error.includes('rate limit')) {
            // Block platform temporarily if rate limited
            this.rateLimitTracker.blockPlatform(platformName, 60000);
        }

        return result;
    }

    /**
     * Query multiple platforms in parallel
     */
    async queryMultiplePlatforms(platforms, prompt, options = {}) {
        await this.initialize();

        const results = await Promise.all(
            platforms.map(platform =>
                this.sendPrompt(platform, prompt, options)
            )
        );

        return results;
    }

    /**
     * Batch process multiple prompts
     */
    async processBatch(tasks, options = {}) {
        await this.initialize();
        return await this.batchProcessor.processBatch(tasks, options);
    }

    /**
     * Compare responses across platforms
     */
    async compareAcrossPlatforms(platforms, prompt, options = {}) {
        await this.initialize();
        return await this.batchProcessor.compareAcrossPlatforms(
            platforms,
            prompt,
            options
        );
    }

    /**
     * Get analytics
     */
    getAnalytics() {
        return this.sessionManager.getAnalytics();
    }

    /**
     * Get rate limit status
     */
    getRateLimitStatus() {
        return this.rateLimitTracker.getAllStatuses();
    }

    /**
     * Clear cache
     */
    async clearCache() {
        await this.sessionManager.clearCache();
    }

    /**
     * Cleanup
     */
    async cleanup() {
        await this.sessionManager.saveAnalytics();
        await this.automation.cleanup();
        console.log('\n✓ Enhanced AI Orchestrator cleanup completed');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==================== EXAMPLE USAGE ====================

async function runExamples() {
    const orchestrator = new EnhancedAIOrchestrator({
        headless: false,
        verbose: true,
        cacheEnabled: true
    });

    try {
        // Example 1: Simple single query
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('Example 1: Single Platform Query with Caching');
        console.log('═══════════════════════════════════════════════════════════\n');

        const result1 = await orchestrator.sendPrompt(
            'claude',
            'What are the key principles of clean code?'
        );

        console.log(`\nResponse (${result1.duration}s):`);
        console.log(result1.response.substring(0, 300) + '...\n');

        // Query again to demonstrate caching
        console.log('Querying again (should use cache)...\n');
        const result1b = await orchestrator.sendPrompt(
            'claude',
            'What are the key principles of clean code?'
        );

        if (result1b.cached) {
            console.log('✓ Response served from cache!\n');
        }

        // Example 2: Parallel platform comparison
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('Example 2: Parallel Platform Comparison');
        console.log('═══════════════════════════════════════════════════════════\n');

        const comparison = await orchestrator.compareAcrossPlatforms(
            ['claude', 'chatgpt', 'gemini'],
            'Explain the difference between async/await and promises in JavaScript'
        );

        console.log('\nComparison Results:');
        console.log(`Total Platforms: ${comparison.totalPlatforms}`);
        console.log(`Successful: ${comparison.successful}`);
        console.log(`Failed: ${comparison.failed}`);
        console.log(`\nPerformance:`);
        console.log(`  Fastest: ${comparison.performance.fastest.platformName} (${comparison.performance.fastest.duration}s)`);
        console.log(`  Slowest: ${comparison.performance.slowest.platformName} (${comparison.performance.slowest.duration}s)`);
        console.log(`  Average: ${comparison.performance.average}s`);

        console.log('\nResponses:');
        comparison.responses.forEach(resp => {
            console.log(`\n--- ${resp.platform} (${resp.duration}s, ${resp.responseLength} chars) ---`);
            console.log(resp.response.substring(0, 200) + '...');
        });

        // Example 3: Batch processing
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('Example 3: Batch Processing Multiple Prompts');
        console.log('═══════════════════════════════════════════════════════════\n');

        const batchTasks = [
            {
                platform: 'claude',
                prompt: 'Write a function to reverse a string in Python'
            },
            {
                platform: 'chatgpt',
                prompt: 'Write a function to reverse a string in JavaScript'
            },
            {
                platform: 'gemini',
                prompt: 'Write a function to reverse a string in Java'
            },
            {
                platform: 'claude',
                prompt: 'Explain the time complexity of quicksort'
            }
        ];

        const batchResults = await orchestrator.processBatch(batchTasks, {
            concurrency: 2
        });

        console.log('\nBatch Results:');
        batchResults.forEach((result, index) => {
            if (result.success) {
                console.log(`\n${index + 1}. ${result.platformName} - Success (${result.duration}s)`);
                console.log(`   Prompt: ${batchTasks[index].prompt}`);
                console.log(`   Response: ${result.response.substring(0, 150)}...`);
            } else {
                console.log(`\n${index + 1}. ${result.platform} - Failed: ${result.error}`);
            }
        });

        // Example 4: Rate limit status
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('Example 4: Rate Limit Status');
        console.log('═══════════════════════════════════════════════════════════\n');

        const rateLimitStatus = orchestrator.getRateLimitStatus();

        console.log('Current Rate Limits:');
        Object.entries(rateLimitStatus).forEach(([platform, status]) => {
            if (status) {
                console.log(`\n${platform}:`);
                console.log(`  Requests in window: ${status.requestsInWindow}/${status.maxRequests}`);
                console.log(`  Utilization: ${status.utilizationPercent}%`);
                console.log(`  Blocked: ${status.blocked ? 'Yes' : 'No'}`);
            }
        });

        // Example 5: Analytics
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('Example 5: Session Analytics');
        console.log('═══════════════════════════════════════════════════════════\n');

        const analytics = orchestrator.getAnalytics();

        console.log('Overall Statistics:');
        console.log(`  Total Requests: ${analytics.summary.totalRequests}`);
        console.log(`  Successful: ${analytics.summary.successful}`);
        console.log(`  Failed: ${analytics.summary.failed}`);
        console.log(`  Success Rate: ${analytics.summary.successRate}`);
        console.log(`  Avg Duration: ${analytics.summary.avgDuration}`);

        console.log('\nPlatform-Specific Analytics:');
        Object.entries(analytics.platforms).forEach(([platform, stats]) => {
            console.log(`\n${platform}:`);
            console.log(`  Requests: ${stats.requests}`);
            console.log(`  Success Rate: ${stats.successRate}`);
            console.log(`  Avg Duration: ${stats.avgDuration}`);
            if (stats.recentErrors.length > 0) {
                console.log(`  Recent Errors: ${stats.recentErrors.length}`);
            }
        });

        // Example 6: Code generation with extraction
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('Example 6: Code Generation with Block Extraction');
        console.log('═══════════════════════════════════════════════════════════\n');

        const codeResult = await orchestrator.sendPrompt(
            'claude',
            'Write a Python class for a binary search tree with insert and search methods',
            { responseType: 'code' }
        );

        if (codeResult.success && Array.isArray(codeResult.response)) {
            console.log(`\nExtracted ${codeResult.response.length} code blocks:\n`);
            codeResult.response.forEach((block, index) => {
                console.log(`Block ${index + 1} (${block.language}):`);
                console.log(block.code);
                console.log('\n' + '-'.repeat(60) + '\n');
            });
        }

        // Cleanup
        await orchestrator.cleanup();

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('All examples completed successfully!');
        console.log('═══════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Error running examples:', error);
        await orchestrator.cleanup();
        process.exit(1);
    }
}

// Run examples if executed directly
if (require.main === module) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     Enhanced AI Orchestrator - Complete Integration      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    runExamples().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { EnhancedAIOrchestrator };
