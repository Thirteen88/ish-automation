#!/usr/bin/env node

/**
 * Test Actual Query - Test querying ISH platform
 */

const BrowserOrchestrator = require('./production-orchestrator-browser');

async function testQuery() {
    console.log('🧪 Testing Actual Query Execution\n');

    const orchestrator = new BrowserOrchestrator({
        environment: 'development',
        headless: true,
        enableHealthMonitoring: false,
        enableSessionPersistence: false
    });

    try {
        console.log('📦 Initializing orchestrator...\n');
        await orchestrator.initialize();

        console.log('\n✅ Orchestrator ready!\n');

        // Test 1: Query ISH platform
        console.log('📝 Test 1: Querying ISH platform...\n');
        const result1 = await orchestrator.query({
            prompt: 'What is 2+2? Answer in one sentence.',
            platforms: ['ish'],
            model: 'claude-3-opus'
        });

        console.log('\n✅ Result from ISH:');
        console.log(JSON.stringify(result1, null, 2));

        console.log('\n\n🎉 Test passed! Shutting down...\n');

        await orchestrator.shutdown();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);

        await orchestrator.shutdown();
        process.exit(1);
    }
}

testQuery().catch(console.error);
