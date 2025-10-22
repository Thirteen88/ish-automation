#!/usr/bin/env node

/**
 * Simple Example - Browser Orchestrator
 *
 * This example shows basic usage of the browser-based orchestrator
 */

const BrowserOrchestrator = require('./production-orchestrator-browser');

async function simpleExample() {
    console.log('🚀 Starting Browser Orchestrator Example\n');

    // Create orchestrator instance
    const orchestrator = new BrowserOrchestrator({
        environment: 'development',
        headless: false,  // Show browser for debugging
        enableHealthMonitoring: true,
        enableSessionPersistence: true,
        maxConcurrent: 3
    });

    try {
        // Initialize
        console.log('📦 Initializing orchestrator...\n');
        await orchestrator.initialize();

        console.log('\n✅ Orchestrator ready!\n');
        console.log('💡 Tip: If platforms require login, log in manually in the browser windows.');
        console.log('         Sessions will be saved for future use.\n');

        // Wait a moment for user to see the message
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Example 1: Single platform query
        console.log('\n📝 Example 1: Querying ISH platform...\n');
        const result1 = await orchestrator.query({
            prompt: 'What is 2+2?',
            platforms: ['ish'],
            model: 'claude-3-opus'
        });

        console.log('\n✅ Result from ISH:');
        console.log(JSON.stringify(result1, null, 2));

        // Example 2: Multi-platform query
        console.log('\n\n📝 Example 2: Querying multiple platforms...\n');
        const result2 = await orchestrator.query({
            prompt: 'Explain quantum computing in one sentence.',
            platforms: ['ish', 'lmarena'],
            model: 'default'
        });

        console.log('\n✅ Results from multiple platforms:');
        console.log(JSON.stringify(result2, null, 2));

        // Example 3: Error handling
        console.log('\n\n📝 Example 3: Error handling...\n');
        try {
            await orchestrator.query({
                prompt: 'Test query',
                platforms: ['invalid-platform'],
                model: 'default'
            });
        } catch (error) {
            console.log('✅ Error caught successfully:', error.message);
        }

        console.log('\n\n🎉 Examples completed!\n');
        console.log('Press Ctrl+C to exit...\n');

        // Keep running
        await new Promise(() => {});

    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error(error.stack);
    } finally {
        // Handle Ctrl+C
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Shutting down...\n');
            await orchestrator.shutdown();
            process.exit(0);
        });
    }
}

// Run example
simpleExample().catch(console.error);
