#!/usr/bin/env node

/**
 * Test Real Platform Selectors
 */

const BrowserOrchestrator = require('./production-orchestrator-browser');

async function testRealSelectors() {
    console.log('🧪 Testing Real Platform Selectors\n');

    const orchestrator = new BrowserOrchestrator({
        environment: 'development',
        headless: true,
        enableHealthMonitoring: false,
        enableSessionPersistence: false
    });

    try {
        await orchestrator.initialize();

        // Test ChatGPT
        console.log('\n📝 Test 1: ChatGPT (checking for login requirement)...\n');
        try {
            const result = await orchestrator.query({
                prompt: 'Say hello',
                platforms: ['chatgpt'],
                model: 'gpt-4'
            });
            console.log('✅ ChatGPT Result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.log('⚠️  ChatGPT Error (expected if not logged in):', error.message);
        }

        // Test LMArena
        console.log('\n\n📝 Test 2: LMArena (no login required)...\n');
        try {
            const result = await orchestrator.query({
                prompt: 'What is 1+1?',
                platforms: ['lmarena'],
                model: 'gpt-4'
            });
            console.log('✅ LMArena Result:', JSON.stringify(result, null, 2));

            // Take screenshot
            const lmarenaPage = orchestrator.platforms.get('lmarena').page;
            await lmarenaPage.screenshot({ path: 'selector-discovery/lmarena-after-query.png' });
            console.log('\n📸 Screenshot saved: selector-discovery/lmarena-after-query.png');

        } catch (error) {
            console.log('❌ LMArena Error:', error.message);
        }

        console.log('\n\n🎉 Test complete!\n');

        await orchestrator.shutdown();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        await orchestrator.shutdown();
        process.exit(1);
    }
}

testRealSelectors().catch(console.error);
