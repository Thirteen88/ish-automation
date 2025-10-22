#!/usr/bin/env node

/**
 * Quick Test - Just initialize and show platforms
 */

const BrowserOrchestrator = require('./production-orchestrator-browser');

async function quickTest() {
    console.log('🧪 Quick Test - Browser Orchestrator\n');

    const orchestrator = new BrowserOrchestrator({
        environment: 'development',
        headless: true,  // Always headless for testing
        enableHealthMonitoring: false,  // Disable for quick test
        enableSessionPersistence: false  // Disable for quick test
    });

    try {
        console.log('📦 Initializing...\n');
        await orchestrator.initialize();

        console.log('\n✅ Orchestrator initialized successfully!\n');

        console.log('📡 Available Platforms:');
        for (const [name, platform] of orchestrator.platforms) {
            console.log(`  ✓ ${name}`);
            console.log(`     Models: ${platform.models ? platform.models.join(', ') : 'default'}`);
            console.log(`     Initialized: ${platform.isInitialized}`);
        }

        console.log('\n🎉 Test complete! Shutting down...\n');

        await orchestrator.shutdown();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

quickTest().catch(console.error);
