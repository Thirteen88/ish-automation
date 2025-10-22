#!/usr/bin/env node

/**
 * Complete Example: Using Production API Client
 *
 * This example demonstrates all major features:
 * 1. Individual API queries
 * 2. Parallel queries across providers
 * 3. Cost comparison
 * 4. Performance benchmarking
 * 5. Error handling
 * 6. Metrics tracking
 */

require('dotenv').config();
const { ProductionAPIClient } = require('./production-api-client');
const { APIPoweredOrchestrator } = require('./api-powered-orchestrator');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    gray: '\x1b[90m'
};

function color(text, c) {
    return `${colors[c] || ''}${text}${colors.reset}`;
}

function header(text) {
    console.log('\n' + color('═'.repeat(80), 'cyan'));
    console.log(color(`  ${text}`, 'bright'));
    console.log(color('═'.repeat(80), 'cyan'));
}

function section(text) {
    console.log('\n' + color(`▶ ${text}`, 'yellow'));
    console.log(color('─'.repeat(60), 'gray'));
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EXAMPLE 1: Simple Query
// ============================================================================
async function example1_simpleQuery(client) {
    header('Example 1: Simple Query');

    section('Querying OpenAI GPT-3.5-turbo');

    try {
        const response = await client.queryOpenAI(
            "What is the capital of France? Answer in one sentence.",
            {
                model: 'gpt-3.5-turbo',
                maxTokens: 50
            }
        );

        console.log(color('✓ Success!', 'green'));
        console.log(`  Response: ${response.text}`);
        console.log(`  Tokens: ${response.tokens.total} (${response.tokens.input} in, ${response.tokens.output} out)`);
        console.log(`  Cost: ${color('$' + response.cost.toFixed(6), 'green')}`);
        console.log(`  Model: ${response.model}`);
        console.log(`  Provider: ${response.provider}`);

    } catch (error) {
        console.log(color('✗ Error: ' + error.message, 'red'));
    }
}

// ============================================================================
// EXAMPLE 2: Comparing Multiple Providers
// ============================================================================
async function example2_compareProviders(client) {
    header('Example 2: Comparing Multiple Providers');

    const prompt = "Explain what AI is in exactly one sentence.";
    const providers = ['openai', 'anthropic', 'google'].filter(
        api => client.apiKeys[api]
    );

    if (providers.length === 0) {
        console.log(color('⚠ No API keys found. Skipping this example.', 'yellow'));
        return;
    }

    section(`Testing ${providers.length} providers with: "${prompt}"`);

    const results = await client.queryMultiple(
        prompt,
        providers,
        { maxTokens: 100 }
    );

    console.log('\n' + color('Results:', 'cyan'));

    // Create comparison table
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
        console.log('\n  Provider        Response                          Time    Cost');
        console.log('  ' + '─'.repeat(70));

        successful.forEach(r => {
            const provider = r.api.padEnd(15);
            const preview = r.result.text.substring(0, 30).padEnd(30);
            const time = `${r.duration}ms`.padEnd(7);
            const cost = `$${r.result.cost.toFixed(6)}`;

            console.log(`  ${provider} ${preview} ${time} ${cost}`);
        });

        // Find fastest and cheapest
        const fastest = successful.reduce((min, r) => r.duration < min.duration ? r : min);
        const cheapest = successful.reduce((min, r) => r.result.cost < min.result.cost ? r : min);

        console.log('\n' + color('  Winner Analysis:', 'green'));
        console.log(`  🏃 Fastest: ${fastest.api} (${fastest.duration}ms)`);
        console.log(`  💰 Cheapest: ${cheapest.api} ($${cheapest.result.cost.toFixed(6)})`);
    }

    if (failed.length > 0) {
        console.log('\n' + color('  Failed:', 'red'));
        failed.forEach(r => {
            console.log(`  ✗ ${r.api}: ${r.error}`);
        });
    }
}

// ============================================================================
// EXAMPLE 3: Different Model Comparison (Same Provider)
// ============================================================================
async function example3_modelComparison(client) {
    header('Example 3: Model Comparison (OpenAI)');

    if (!client.apiKeys.openai) {
        console.log(color('⚠ OpenAI API key not found. Skipping.', 'yellow'));
        return;
    }

    const prompt = "Explain quantum entanglement.";
    const models = ['gpt-3.5-turbo', 'gpt-4-turbo'];

    section('Testing different OpenAI models');

    for (const model of models) {
        try {
            console.log(`\n  Testing ${color(model, 'cyan')}...`);

            const startTime = Date.now();
            const response = await client.queryOpenAI(prompt, {
                model: model,
                maxTokens: 150
            });
            const duration = Date.now() - startTime;

            console.log(`  ✓ Response: ${response.text.substring(0, 80)}...`);
            console.log(`  ⏱  Time: ${duration}ms`);
            console.log(`  💰 Cost: $${response.cost.toFixed(6)}`);
            console.log(`  📊 Tokens: ${response.tokens.total}`);

        } catch (error) {
            console.log(color(`  ✗ Error: ${error.message}`, 'red'));
        }

        await sleep(1000); // Avoid rate limits
    }
}

// ============================================================================
// EXAMPLE 4: Cost Optimization Strategy
// ============================================================================
async function example4_costOptimization(client) {
    header('Example 4: Cost Optimization Strategy');

    section('Comparing cost-effective models');

    const prompt = "List 3 benefits of renewable energy.";

    // Test with cheapest models
    const tests = [
        { provider: 'openai', model: 'gpt-3.5-turbo', name: 'GPT-3.5-turbo' },
        { provider: 'anthropic', model: 'claude-3-haiku', name: 'Claude Haiku' },
        { provider: 'google', model: 'gemini-pro', name: 'Gemini Pro' }
    ];

    const results = [];

    for (const test of tests) {
        if (!client.apiKeys[test.provider]) {
            console.log(color(`  ⏭ Skipping ${test.name} (no API key)`, 'gray'));
            continue;
        }

        try {
            console.log(`\n  Testing ${color(test.name, 'cyan')}...`);

            const method = `query${test.provider.charAt(0).toUpperCase() + test.provider.slice(1)}`;
            const response = await client[method](prompt, {
                model: test.model,
                maxTokens: 200
            });

            results.push({
                name: test.name,
                cost: response.cost,
                tokens: response.tokens.total,
                text: response.text
            });

            console.log(`  💰 Cost: ${color('$' + response.cost.toFixed(6), 'green')}`);
            console.log(`  📊 Tokens: ${response.tokens.total}`);

        } catch (error) {
            console.log(color(`  ✗ Error: ${error.message}`, 'red'));
        }

        await sleep(1000);
    }

    if (results.length > 0) {
        // Sort by cost
        results.sort((a, b) => a.cost - b.cost);

        console.log('\n' + color('  Cost Ranking:', 'green'));
        results.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.name}: $${r.cost.toFixed(6)} (${r.tokens} tokens)`);
        });

        const savings = ((results[results.length - 1].cost - results[0].cost) / results[results.length - 1].cost * 100).toFixed(1);
        console.log(`\n  💡 Using ${color(results[0].name, 'green')} saves ${color(savings + '%', 'green')} vs ${results[results.length - 1].name}`);
    }
}

// ============================================================================
// EXAMPLE 5: Error Handling & Retry Logic
// ============================================================================
async function example5_errorHandling(client) {
    header('Example 5: Error Handling & Retry Logic');

    section('Testing with invalid API key');

    // Save original key
    const originalKey = client.apiKeys.openai;

    try {
        // Set invalid key
        client.apiKeys.openai = 'sk-invalid-key-for-testing';

        await client.queryOpenAI("Test", { maxTokens: 10 });

        console.log(color('  ✗ Should have thrown an error', 'red'));

    } catch (error) {
        console.log(color('  ✓ Error caught correctly!', 'green'));
        console.log(`  Error type: ${error.statusCode === 401 ? 'Authentication' : 'Other'}`);
        console.log(`  Message: ${error.message}`);
    }

    // Restore original key
    client.apiKeys.openai = originalKey;

    section('Testing retry logic (simulated timeout)');
    console.log('  ℹ The client will automatically retry failed requests');
    console.log('  ℹ Retryable errors: 408, 429, 500, 502, 503, 504');
    console.log('  ℹ Max retries: 3 with exponential backoff');
}

// ============================================================================
// EXAMPLE 6: Performance Metrics
// ============================================================================
async function example6_metrics(client) {
    header('Example 6: Performance Metrics');

    section('Getting comprehensive metrics');

    const metrics = client.getMetrics();

    console.log('\n' + color('  Request Statistics:', 'cyan'));
    for (const [api, stats] of Object.entries(metrics.requests)) {
        console.log(`\n  ${color(api.toUpperCase(), 'yellow')}`);
        console.log(`    Total Requests: ${stats.total}`);
        console.log(`    Successful: ${color(stats.success.toString(), 'green')}`);
        console.log(`    Failed: ${color(stats.error.toString(), stats.error > 0 ? 'red' : 'green')}`);
        console.log(`    Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
    }

    console.log('\n' + color('  Token Usage:', 'cyan'));
    for (const [api, tokens] of Object.entries(metrics.tokens)) {
        if (tokens.total > 0) {
            console.log(`\n  ${color(api.toUpperCase(), 'yellow')}`);
            console.log(`    Input Tokens: ${tokens.input.toLocaleString()}`);
            console.log(`    Output Tokens: ${tokens.output.toLocaleString()}`);
            console.log(`    Total: ${tokens.total.toLocaleString()}`);
        }
    }

    console.log('\n' + color('  Cost Summary:', 'cyan'));
    let totalCost = 0;
    for (const [api, cost] of Object.entries(metrics.costs)) {
        const costNum = parseFloat(cost);
        if (costNum > 0) {
            console.log(`  ${api}: ${color('$' + costNum.toFixed(6), 'green')}`);
            totalCost += costNum;
        }
    }
    console.log(`  ${color('Total:', 'bright')} ${color('$' + totalCost.toFixed(6), 'green')}`);

    console.log('\n' + color('  Latency Statistics:', 'cyan'));
    for (const [api, latency] of Object.entries(metrics.latency)) {
        if (latency.avg) {
            console.log(`\n  ${color(api.toUpperCase(), 'yellow')}`);
            console.log(`    Min: ${latency.min}ms`);
            console.log(`    Max: ${latency.max}ms`);
            console.log(`    Avg: ${latency.avg.toFixed(0)}ms`);
            console.log(`    P95: ${latency.p95.toFixed(0)}ms`);
        }
    }
}

// ============================================================================
// EXAMPLE 7: Using the Orchestrator
// ============================================================================
async function example7_orchestrator() {
    header('Example 7: API-Powered Orchestrator');

    section('Initializing orchestrator');

    const orchestrator = new APIPoweredOrchestrator({
        preferAPI: true,
        fallbackToBrowser: false,
        parallelMode: false
    });

    await orchestrator.initialize();

    section('Processing text request');

    const results = await orchestrator.processTextRequest(
        "What are the three laws of robotics? Answer briefly.",
        {
            maxTokens: 150
        }
    );

    console.log('\n' + color('  Results:', 'green'));
    console.log(`  Success: ${results.success}`);
    console.log(`  Total: ${results.summary.total}`);
    console.log(`  Successful: ${results.summary.successful}`);
    console.log(`  Failed: ${results.summary.failed}`);
    console.log(`  Total Cost: $${results.summary.totalCost.toFixed(6)}`);
    console.log(`  Avg Latency: ${(results.summary.averageLatency / 1000).toFixed(2)}s`);

    if (results.results.length > 0 && results.results[0].response) {
        console.log(`\n  Response Preview:`);
        console.log(`  ${results.results[0].response.text.substring(0, 200)}...`);
    }

    section('Performance comparison');
    orchestrator.displayPerformanceComparison();

    await orchestrator.cleanup();
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================
async function main() {
    console.clear();

    header('🚀 Production API Client - Complete Examples');

    console.log(color('\nThis demo will run 7 comprehensive examples:', 'cyan'));
    console.log('  1. Simple Query');
    console.log('  2. Compare Multiple Providers');
    console.log('  3. Model Comparison');
    console.log('  4. Cost Optimization');
    console.log('  5. Error Handling');
    console.log('  6. Performance Metrics');
    console.log('  7. Orchestrator Integration');

    console.log(color('\n⚠ Note: Examples will be skipped if API keys are not found', 'yellow'));
    console.log(color('⚠ Make sure you have set up your .env file', 'yellow'));

    await sleep(3000);

    // Initialize client
    let client;
    try {
        client = new ProductionAPIClient();
    } catch (error) {
        console.log(color('\n✗ Failed to initialize API client', 'red'));
        console.log(color('  Make sure api-config.json exists and is valid', 'yellow'));
        process.exit(1);
    }

    // Check for API keys
    const availableKeys = Object.keys(client.apiKeys);
    if (availableKeys.length === 0) {
        console.log(color('\n⚠ No API keys found!', 'yellow'));
        console.log('  Please set up your .env file with at least one API key');
        console.log('  See .env.example for the template');
        process.exit(1);
    }

    console.log(color(`\n✓ Found ${availableKeys.length} API key(s): ${availableKeys.join(', ')}`, 'green'));

    await sleep(2000);

    // Run examples
    try {
        await example1_simpleQuery(client);
        await sleep(2000);

        await example2_compareProviders(client);
        await sleep(2000);

        await example3_modelComparison(client);
        await sleep(2000);

        await example4_costOptimization(client);
        await sleep(2000);

        await example5_errorHandling(client);
        await sleep(2000);

        await example6_metrics(client);
        await sleep(2000);

        await example7_orchestrator();

    } catch (error) {
        console.log(color('\n✗ Error during examples:', 'red'));
        console.error(error);
    }

    // Final summary
    header('🎉 Demo Complete!');

    console.log(color('\nWhat we demonstrated:', 'cyan'));
    console.log('  ✓ Individual API queries');
    console.log('  ✓ Parallel provider comparison');
    console.log('  ✓ Cost optimization strategies');
    console.log('  ✓ Error handling & retries');
    console.log('  ✓ Comprehensive metrics tracking');
    console.log('  ✓ Orchestrator integration');

    console.log(color('\nNext steps:', 'yellow'));
    console.log('  1. Review the code in this file');
    console.log('  2. Check API-DOCUMENTATION.md for full reference');
    console.log('  3. Run test-api-client.js for comprehensive testing');
    console.log('  4. Integrate with your own application');

    console.log(color('\nMetrics exported to:', 'green'));
    console.log('  ./api-metrics.json');
    console.log('  ./test-api-metrics.json');

    // Export final metrics
    client.exportMetrics('./complete-example-metrics.json');

    console.log('\n' + color('═'.repeat(80), 'cyan') + '\n');
}

// Run main
if (require.main === module) {
    main().catch(error => {
        console.error(color('\n✗ Fatal error:', 'red'), error);
        process.exit(1);
    });
}

module.exports = {
    example1_simpleQuery,
    example2_compareProviders,
    example3_modelComparison,
    example4_costOptimization,
    example5_errorHandling,
    example6_metrics,
    example7_orchestrator
};
