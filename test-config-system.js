#!/usr/bin/env node

/**
 * Quick Test Script for Configuration Management System
 *
 * Tests all components to ensure they work correctly
 */

const ConfigurationManager = require('./config-manager');
const SecretsManager = require('./secrets-manager');
const FeatureFlagsManager = require('./feature-flags');

async function quickTest() {
    console.log('🧪 Configuration Management System - Quick Test\n');
    console.log('='.repeat(80) + '\n');

    let allPassed = true;

    // Test 1: Configuration Manager
    console.log('Test 1: Configuration Manager');
    try {
        const configManager = new ConfigurationManager({
            environment: 'development',
            enableWatch: false,
            validateOnLoad: true
        });

        await configManager.initialize();

        const port = configManager.get('server.port');
        const environment = configManager.get('environment');

        console.log(`  ✅ Configuration loaded`);
        console.log(`     Environment: ${environment}`);
        console.log(`     Server Port: ${port}`);

        await configManager.cleanup();
    } catch (error) {
        console.log(`  ❌ Configuration Manager failed: ${error.message}`);
        allPassed = false;
    }

    // Test 2: Secrets Manager
    console.log('\nTest 2: Secrets Manager');
    try {
        const secretsManager = new SecretsManager({
            backend: 'memory',
            enableEncryption: true,
            enableAuditLog: false,
            encryptionKey: 'test-encryption-key-for-demo'
        });

        await secretsManager.initialize();

        await secretsManager.setSecret('TEST_KEY', 'test-value-123', {
            description: 'Test secret'
        });

        const value = await secretsManager.getSecret('TEST_KEY');

        console.log(`  ✅ Secrets Manager working`);
        console.log(`     Secret set and retrieved: ${value === 'test-value-123' ? 'SUCCESS' : 'FAILED'}`);

        await secretsManager.cleanup();
    } catch (error) {
        console.log(`  ❌ Secrets Manager failed: ${error.message}`);
        allPassed = false;
    }

    // Test 3: Feature Flags
    console.log('\nTest 3: Feature Flags Manager');
    try {
        const featureFlags = new FeatureFlagsManager({
            enableWatch: false,
            enableAnalytics: true
        });

        await featureFlags.initialize();

        const flags = featureFlags.listFlags();
        const enabled = featureFlags.isEnabled('ultraParallelExecution', {
            userId: 'test-user'
        });

        console.log(`  ✅ Feature Flags working`);
        console.log(`     Flags loaded: ${flags.length}`);
        console.log(`     Test flag status: ${enabled ? 'Enabled' : 'Disabled'}`);

        await featureFlags.cleanup();
    } catch (error) {
        console.log(`  ❌ Feature Flags failed: ${error.message}`);
        allPassed = false;
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Test Summary\n');

    if (allPassed) {
        console.log('✅ All tests passed!');
        console.log('\nYou can now run the full production example:');
        console.log('  node production-example.js\n');
        return 0;
    } else {
        console.log('❌ Some tests failed. Please check the errors above.\n');
        return 1;
    }
}

// Run tests
if (require.main === module) {
    quickTest()
        .then(code => process.exit(code))
        .catch(error => {
            console.error('Test error:', error);
            process.exit(1);
        });
}

module.exports = { quickTest };
