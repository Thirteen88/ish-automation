#!/usr/bin/env node

/**
 * Production Orchestrator - Complete Example
 *
 * This example demonstrates the full capabilities of the production orchestrator:
 * - Configuration management with hot reload
 * - Secrets management with encryption
 * - Feature flags with A/B testing
 * - Error handling with automatic recovery
 * - Health monitoring with alerts
 * - Production-ready request handling
 */

const ProductionOrchestrator = require('./production-orchestrator');

async function comprehensiveDemo() {
    console.log('🚀 Production Orchestrator - Comprehensive Demo\n');
    console.log('This demo showcases all production features:\n');
    console.log('1. Configuration Management');
    console.log('2. Secrets Management');
    console.log('3. Feature Flags');
    console.log('4. Error Handling & Recovery');
    console.log('5. Health Monitoring');
    console.log('6. Production Request Execution');
    console.log('\n' + '='.repeat(80) + '\n');

    // Create production orchestrator
    const orchestrator = new ProductionOrchestrator({
        environment: process.env.NODE_ENV || 'development',
        enableHealthMonitoring: true,
        enableFeatureFlags: true,
        autoRecovery: true
    });

    try {
        // Initialize
        await orchestrator.initialize();

        // ========== DEMO 1: Configuration Management ==========
        console.log('\n' + '='.repeat(80));
        console.log('📋 DEMO 1: Configuration Management');
        console.log('='.repeat(80) + '\n');

        console.log('Current Configuration:');
        const config = orchestrator.configManager.getAll();
        console.log(`  Environment: ${config.environment}`);
        console.log(`  Version: ${config.version}`);
        console.log(`  Server Port: ${config.server.port}`);
        console.log(`  Orchestrator Timeout: ${config.orchestrator.timeout}ms`);
        console.log(`  Max Concurrent: ${config.orchestrator.maxConcurrent}`);

        console.log('\nConfiguration Metadata:');
        const metadata = orchestrator.configManager.getMetadata();
        console.log(`  Loaded At: ${metadata.loadedAt}`);
        console.log(`  Reload Count: ${metadata.reloadCount}`);
        console.log(`  Watching Files: ${metadata.watchingFiles}`);

        // Listen for config changes
        orchestrator.configManager.on('reloaded', (event) => {
            console.log('\n🔄 Configuration Reloaded Event Received!');
            console.log(`  Timestamp: ${event.timestamp}`);
        });

        // ========== DEMO 2: Secrets Management ==========
        console.log('\n' + '='.repeat(80));
        console.log('🔐 DEMO 2: Secrets Management');
        console.log('='.repeat(80) + '\n');

        // Set some example secrets
        await orchestrator.secretsManager.setSecret('DEMO_API_KEY', 'sk-demo-key-abc123', {
            description: 'Demo API Key',
            tags: ['api', 'demo'],
            userId: 'system'
        });

        await orchestrator.secretsManager.setSecret('DEMO_PASSWORD', 'super-secret-password', {
            description: 'Demo Password',
            tags: ['credentials', 'demo'],
            userId: 'system'
        });

        console.log('Secrets Created:');
        const secrets = orchestrator.secretsManager.listSecrets();
        secrets.forEach(s => {
            console.log(`  ${s.key}:`);
            console.log(`    Description: ${s.description}`);
            console.log(`    Tags: ${s.tags.join(', ')}`);
            console.log(`    Access Count: ${s.accessCount}`);
        });

        // Get a secret
        console.log('\nRetrieving Secret:');
        const apiKey = await orchestrator.secretsManager.getSecret('DEMO_API_KEY', {
            userId: 'system'
        });
        console.log(`  DEMO_API_KEY: ${apiKey.substring(0, 15)}...`);

        // Check rotation status
        console.log('\nRotation Status:');
        const needRotation = orchestrator.secretsManager.getSecretsNeedingRotation();
        if (needRotation.length > 0) {
            needRotation.forEach(s => {
                console.log(`  ${s.key}: ${s.daysSinceRotation} days since rotation`);
            });
        } else {
            console.log('  All secrets are up to date');
        }

        // ========== DEMO 3: Feature Flags ==========
        console.log('\n' + '='.repeat(80));
        console.log('🚩 DEMO 3: Feature Flags & A/B Testing');
        console.log('='.repeat(80) + '\n');

        if (orchestrator.featureFlags) {
            console.log('Available Feature Flags:');
            const flags = orchestrator.featureFlags.listFlags();
            flags.forEach(f => {
                console.log(`  ${f.key}:`);
                console.log(`    Enabled: ${f.enabled}`);
                console.log(`    Rollout: ${f.rolloutPercentage}%`);
                console.log(`    Has Variants: ${f.hasVariants}`);
                console.log(`    Description: ${f.description}`);
            });

            // Test feature flags with different users
            console.log('\nTesting Feature Flags:');
            const testUsers = [
                { userId: 'user-1', groups: ['beta'] },
                { userId: 'user-2', groups: ['standard'] },
                { userId: 'user-3', groups: ['premium'] }
            ];

            for (const user of testUsers) {
                console.log(`\n  User: ${user.userId} (${user.groups.join(', ')})`);

                for (const flag of flags) {
                    const enabled = orchestrator.featureFlags.isEnabled(flag.key, user);
                    const variant = orchestrator.featureFlags.getVariant(flag.key, user);

                    console.log(`    ${flag.key}: ${enabled ? '✅ Enabled' : '❌ Disabled'}${variant ? ` [${variant}]` : ''}`);
                }
            }

            // Show analytics
            console.log('\nFeature Flag Analytics:');
            const analytics = orchestrator.featureFlags.getAllAnalytics();

            for (const [flagKey, stats] of Object.entries(analytics)) {
                console.log(`\n  ${flagKey}:`);
                console.log(`    Enabled: ${stats.enabled} (${stats.enabledPercentage}%)`);
                console.log(`    Disabled: ${stats.disabled}`);
                console.log(`    Unique Users: ${stats.uniqueUsers}`);

                if (stats.variants) {
                    console.log(`    Variants:`);
                    for (const [variant, data] of Object.entries(stats.variants)) {
                        console.log(`      ${variant}: ${data.count} uses, ${data.uniqueUsers} users`);
                    }
                }
            }
        }

        // ========== DEMO 4: Production Request Execution ==========
        console.log('\n' + '='.repeat(80));
        console.log('⚡ DEMO 4: Production Request Execution');
        console.log('='.repeat(80) + '\n');

        const requests = [
            {
                name: 'Text Generation Request',
                request: {
                    type: 'text',
                    prompt: 'Explain the benefits of microservices architecture',
                    model: 'gpt-4'
                },
                options: {
                    userId: 'demo-user',
                    timeout: 30000
                }
            },
            {
                name: 'Browser Automation Request',
                request: {
                    type: 'browser',
                    url: 'https://example.com',
                    actions: []
                },
                options: {
                    userId: 'demo-user',
                    contextId: 'demo-context'
                }
            }
        ];

        for (const { name, request, options } of requests) {
            console.log(`\n📝 Executing: ${name}`);

            try {
                const result = await orchestrator.execute(request, options);

                console.log(`✅ Success:`);
                console.log(`   Request ID: ${result.requestId}`);
                console.log(`   Duration: ${result.duration}ms`);
                console.log(`   Timestamp: ${result.timestamp}`);

                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.log(`❌ Failed: ${error.message}`);
            }
        }

        // ========== DEMO 5: Error Handling ==========
        console.log('\n' + '='.repeat(80));
        console.log('🛡️ DEMO 5: Error Handling & Recovery');
        console.log('='.repeat(80) + '\n');

        console.log('Testing error handling with invalid request...');

        try {
            await orchestrator.execute({
                type: 'invalid',
                prompt: 'This should fail'
            }, {
                userId: 'demo-user'
            });
        } catch (error) {
            console.log(`✅ Error caught and logged: ${error.message}`);
        }

        // Show error statistics
        console.log('\nError Handler Statistics:');
        const errorStats = orchestrator.errorHandler.getStatistics();
        console.log(`  Total Errors: ${errorStats.totalErrors}`);
        console.log(`  Errors by Category:`);
        for (const [category, count] of Object.entries(errorStats.errorsByCategory)) {
            console.log(`    ${category}: ${count}`);
        }

        // ========== DEMO 6: Health Monitoring ==========
        console.log('\n' + '='.repeat(80));
        console.log('💚 DEMO 6: Health Monitoring');
        console.log('='.repeat(80) + '\n');

        if (orchestrator.healthMonitor) {
            console.log('Running health checks...');
            const healthStatus = await orchestrator.healthMonitor.checkHealth();

            console.log(`\nOverall Status: ${healthStatus.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
            console.log(`\nIndividual Checks:`);

            for (const [name, result] of Object.entries(healthStatus.checks)) {
                console.log(`  ${name}: ${result.healthy ? '✅' : '❌'} ${result.message}`);
            }

            console.log('\nSystem Metrics:');
            const metrics = orchestrator.healthMonitor.collectMetrics();
            console.log(`  CPU Usage: ${metrics.cpu.toFixed(2)}%`);
            console.log(`  Memory Usage: ${metrics.memory.toFixed(2)}%`);
            console.log(`  Memory (MB): ${(metrics.memoryMB).toFixed(2)} MB`);
        }

        // ========== DEMO 7: Production Metrics ==========
        console.log('\n' + '='.repeat(80));
        console.log('📊 DEMO 7: Production Metrics');
        console.log('='.repeat(80) + '\n');

        const metrics = orchestrator.getMetrics();

        console.log('Orchestrator Metrics:');
        console.log(`  Uptime: ${metrics.uptime}`);
        console.log(`\n  Requests:`);
        console.log(`    Total: ${metrics.requests.total}`);
        console.log(`    Successful: ${metrics.requests.successful}`);
        console.log(`    Failed: ${metrics.requests.failed}`);
        console.log(`    Error Rate: ${metrics.requests.errorRate}`);
        console.log(`\n  Performance:`);
        console.log(`    Average Latency: ${metrics.performance.averageLatency}`);
        console.log(`    P95 Latency: ${metrics.performance.p95Latency}`);
        console.log(`    P99 Latency: ${metrics.performance.p99Latency}`);
        console.log(`\n  Resources:`);
        console.log(`    Active Pages: ${metrics.resources.pages}`);
        console.log(`    Active Contexts: ${metrics.resources.contexts}`);
        console.log(`    Browser Connected: ${metrics.resources.browserConnected}`);
        console.log(`\n  Health:`);
        console.log(`    Status: ${metrics.health.status}`);

        // ========== DEMO 8: Event Listeners ==========
        console.log('\n' + '='.repeat(80));
        console.log('🎧 DEMO 8: Event Listeners');
        console.log('='.repeat(80) + '\n');

        console.log('Setting up event listeners...');

        orchestrator.on('config-reloaded', (event) => {
            console.log(`  📋 Config reloaded at ${event.timestamp}`);
        });

        orchestrator.on('feature-updated', (event) => {
            console.log(`  🚩 Feature flag updated: ${event.flagKey}`);
        });

        orchestrator.on('health-alert', (alert) => {
            console.log(`  🚨 Health alert: ${alert.type} - ${alert.message}`);
        });

        console.log('Event listeners registered');

        // ========== Summary ==========
        console.log('\n' + '='.repeat(80));
        console.log('📋 DEMO SUMMARY');
        console.log('='.repeat(80) + '\n');

        console.log('✅ Configuration Management:');
        console.log(`   - Loaded configuration for ${config.environment} environment`);
        console.log(`   - Hot reload enabled with file watching`);
        console.log(`   - Version tracking and rollback available`);

        console.log('\n✅ Secrets Management:');
        console.log(`   - ${secrets.length} secrets loaded and encrypted`);
        console.log(`   - Audit logging enabled`);
        console.log(`   - Rotation tracking active`);

        if (orchestrator.featureFlags) {
            console.log('\n✅ Feature Flags:');
            console.log(`   - ${flags.length} feature flags configured`);
            console.log(`   - A/B testing and gradual rollout supported`);
            console.log(`   - Real-time analytics tracking`);
        }

        console.log('\n✅ Error Handling:');
        console.log(`   - Circuit breaker pattern enabled`);
        console.log(`   - Automatic retry with exponential backoff`);
        console.log(`   - Comprehensive error logging`);

        if (orchestrator.healthMonitor) {
            console.log('\n✅ Health Monitoring:');
            console.log(`   - Continuous health checks running`);
            console.log(`   - System metrics collection active`);
            console.log(`   - Alert thresholds configured`);
        }

        console.log('\n✅ Production Ready:');
        console.log(`   - Zero-downtime configuration updates`);
        console.log(`   - Automatic resource cleanup`);
        console.log(`   - Graceful shutdown support`);
        console.log(`   - Performance monitoring and metrics`);

        // Keep running for demonstration
        console.log('\n' + '='.repeat(80));
        console.log('✅ Production Orchestrator is running');
        console.log('='.repeat(80));
        console.log('\nTip: Try editing config files to see hot reload in action!');
        console.log('     Edit: config/development.json or config/feature-flags.json\n');
        console.log('Press Ctrl+C to shutdown gracefully...\n');

        // Graceful shutdown handler
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Shutdown signal received...');
            await orchestrator.shutdown();
            console.log('👋 Goodbye!\n');
            process.exit(0);
        });

    } catch (error) {
        console.error('\n❌ Demo Error:', error);
        console.error(error.stack);
        await orchestrator.shutdown();
        process.exit(1);
    }
}

// Run the demo
if (require.main === module) {
    comprehensiveDemo().catch(console.error);
}

module.exports = { comprehensiveDemo };
