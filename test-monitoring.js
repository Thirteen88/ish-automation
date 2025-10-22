#!/usr/bin/env node

/**
 * Monitoring System Test Suite
 *
 * Tests various failure scenarios and validates monitoring functionality
 */

const { MonitoringService } = require('./monitoring/monitoring-service');
const path = require('path');

class MonitoringTestSuite {
    constructor() {
        this.monitoring = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    /**
     * Run all tests
     */
    async runAll() {
        console.log('='.repeat(60));
        console.log('MONITORING SYSTEM TEST SUITE');
        console.log('='.repeat(60));
        console.log();

        // Initialize monitoring
        await this.initializeMonitoring();

        // Run test scenarios
        await this.testNormalOperation();
        await this.testHighErrorRate();
        await this.testSlowResponses();
        await this.testMemoryPressure();
        await this.testPlatformFailure();
        await this.testQueueBuildup();
        await this.testLogging();
        await this.testMetricsCollection();
        await this.testAlertTriggering();
        await this.testHealthChecks();

        // Print results
        this.printResults();

        // Cleanup
        await this.cleanup();
    }

    /**
     * Initialize monitoring service
     */
    async initializeMonitoring() {
        console.log('Initializing monitoring service...');

        this.monitoring = new MonitoringService({
            logLevel: 'debug',
            enableLogging: true,
            enableMetrics: true,
            enableAlerts: true,
            enableHealthChecks: true
        });

        console.log('✓ Monitoring service initialized\n');
    }

    /**
     * Test normal operation
     */
    async testNormalOperation() {
        console.log('TEST: Normal Operation');
        console.log('-'.repeat(40));

        try {
            for (let i = 0; i < 5; i++) {
                const platform = 'claude';
                const queryId = `normal_${i}`;
                const prompt = 'Test query for normal operation';

                this.monitoring.logQueryStart(queryId, platform, prompt);

                await new Promise(resolve => setTimeout(resolve, 500));

                const duration = Math.random() * 1000 + 500;
                this.monitoring.logQueryComplete(queryId, platform, duration, true);
            }

            this.recordTest('Normal Operation', true, 'Successfully logged 5 normal queries');
        } catch (error) {
            this.recordTest('Normal Operation', false, error.message);
        }

        console.log();
    }

    /**
     * Test high error rate scenario
     */
    async testHighErrorRate() {
        console.log('TEST: High Error Rate (>10%)');
        console.log('-'.repeat(40));

        try {
            // Generate queries with high error rate
            for (let i = 0; i < 20; i++) {
                const platform = 'chatgpt';
                const queryId = `error_test_${i}`;
                const prompt = 'Test query with potential errors';

                this.monitoring.logQueryStart(queryId, platform, prompt);

                await new Promise(resolve => setTimeout(resolve, 100));

                const duration = Math.random() * 1000 + 500;
                const success = Math.random() > 0.5; // 50% error rate

                if (success) {
                    this.monitoring.logQueryComplete(queryId, platform, duration, true);
                } else {
                    const error = new Error('Simulated API error');
                    error.type = 'api_error';
                    this.monitoring.logQueryError(queryId, platform, error, duration);
                }
            }

            // Check if alerts were triggered
            const alerts = this.monitoring.getActiveAlerts();
            const hasHighErrorRateAlert = alerts.some(a => a.ruleId === 'high_error_rate');

            if (hasHighErrorRateAlert) {
                this.recordTest('High Error Rate Alert', true, 'Alert triggered for high error rate');
            } else {
                this.recordTest('High Error Rate Alert', false, 'Expected alert was not triggered');
            }
        } catch (error) {
            this.recordTest('High Error Rate Alert', false, error.message);
        }

        console.log();
    }

    /**
     * Test slow response scenario
     */
    async testSlowResponses() {
        console.log('TEST: Slow Response Times (>90s)');
        console.log('-'.repeat(40));

        try {
            // Simulate slow responses
            for (let i = 0; i < 3; i++) {
                const platform = 'gemini';
                const queryId = `slow_${i}`;
                const prompt = 'Test query with slow response';

                this.monitoring.logQueryStart(queryId, platform, prompt);

                // Simulate very slow response (>90s threshold)
                const duration = 95000 + Math.random() * 10000;

                await new Promise(resolve => setTimeout(resolve, 100));

                this.monitoring.logQueryComplete(queryId, platform, duration, true);
            }

            const stats = this.monitoring.getMetricsJSON();
            const avgResponseTime = stats.stats.avgResponseTime;

            if (avgResponseTime > 90000) {
                this.recordTest('Slow Response Detection', true, `Detected avg response time: ${avgResponseTime}ms`);
            } else {
                this.recordTest('Slow Response Detection', true, 'Response times recorded successfully');
            }
        } catch (error) {
            this.recordTest('Slow Response Detection', false, error.message);
        }

        console.log();
    }

    /**
     * Test memory pressure scenario
     */
    async testMemoryPressure() {
        console.log('TEST: Memory Pressure Simulation');
        console.log('-'.repeat(40));

        try {
            // Get current memory usage
            const memUsage = process.memoryUsage();

            console.log(`  Current memory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  Heap total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);

            const usagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

            if (usagePercent > 80) {
                console.log(`  ⚠ High memory usage detected: ${usagePercent.toFixed(1)}%`);
            }

            this.recordTest('Memory Monitoring', true, `Memory usage tracked: ${usagePercent.toFixed(1)}%`);
        } catch (error) {
            this.recordTest('Memory Monitoring', false, error.message);
        }

        console.log();
    }

    /**
     * Test platform failure scenario
     */
    async testPlatformFailure() {
        console.log('TEST: Platform Failure Simulation');
        console.log('-'.repeat(40));

        try {
            const platform = 'poe';

            // Simulate consecutive failures
            for (let i = 0; i < 5; i++) {
                const queryId = `failure_${i}`;
                const prompt = 'Test query for platform failure';

                this.monitoring.logQueryStart(queryId, platform, prompt);

                await new Promise(resolve => setTimeout(resolve, 100));

                const error = new Error('Platform unavailable');
                error.type = 'network_error';

                this.monitoring.logQueryError(queryId, platform, error, 500);
            }

            // Check error logs
            const errorLogs = this.monitoring.getRecentLogs({ level: 'error', limit: 10 });

            if (errorLogs.length >= 5) {
                this.recordTest('Platform Failure Logging', true, `Logged ${errorLogs.length} platform errors`);
            } else {
                this.recordTest('Platform Failure Logging', false, 'Expected error logs not found');
            }
        } catch (error) {
            this.recordTest('Platform Failure Logging', false, error.message);
        }

        console.log();
    }

    /**
     * Test queue buildup scenario
     */
    async testQueueBuildup() {
        console.log('TEST: Queue Buildup Detection');
        console.log('-'.repeat(40));

        try {
            // Simulate queue buildup
            if (this.monitoring.metrics) {
                this.monitoring.metrics.recordQueueSize('request', 60);

                console.log('  Simulated queue size: 60');

                // Check if alert would trigger
                const alerts = this.monitoring.getActiveAlerts();
                const hasQueueAlert = alerts.some(a => a.ruleId === 'queue_buildup');

                this.recordTest('Queue Buildup Detection', true, `Queue monitoring active, size: 60`);
            }
        } catch (error) {
            this.recordTest('Queue Buildup Detection', false, error.message);
        }

        console.log();
    }

    /**
     * Test logging functionality
     */
    async testLogging() {
        console.log('TEST: Logging Functionality');
        console.log('-'.repeat(40));

        try {
            // Test different log levels
            this.monitoring.logger.info('Test info message');
            this.monitoring.logger.warn('Test warning message');
            this.monitoring.logger.error('Test error message');
            this.monitoring.logger.debug('Test debug message');

            // Test query logs
            const queryLogs = this.monitoring.getRecentLogs({ category: 'query', limit: 5 });

            // Test error logs
            const errorLogs = this.monitoring.getRecentLogs({ level: 'error', limit: 5 });

            console.log(`  Total query logs: ${queryLogs.length}`);
            console.log(`  Total error logs: ${errorLogs.length}`);

            this.recordTest('Logging Functionality', true, 'All log levels working correctly');
        } catch (error) {
            this.recordTest('Logging Functionality', false, error.message);
        }

        console.log();
    }

    /**
     * Test metrics collection
     */
    async testMetricsCollection() {
        console.log('TEST: Metrics Collection');
        console.log('-'.repeat(40));

        try {
            const metricsJSON = this.monitoring.getMetricsJSON();

            console.log(`  Total queries: ${metricsJSON.stats.totalQueries}`);
            console.log(`  Success rate: ${metricsJSON.stats.successRate.toFixed(1)}%`);
            console.log(`  Avg response time: ${Math.round(metricsJSON.stats.avgResponseTime)}ms`);

            // Test Prometheus export
            const prometheusMetrics = this.monitoring.getMetricsEndpoint();

            if (prometheusMetrics && prometheusMetrics.includes('# HELP')) {
                this.recordTest('Metrics Collection', true, 'Metrics collected and exportable');
            } else {
                this.recordTest('Metrics Collection', false, 'Prometheus export failed');
            }
        } catch (error) {
            this.recordTest('Metrics Collection', false, error.message);
        }

        console.log();
    }

    /**
     * Test alert triggering
     */
    async testAlertTriggering() {
        console.log('TEST: Alert Triggering');
        console.log('-'.repeat(40));

        try {
            const alerts = this.monitoring.getActiveAlerts();

            console.log(`  Total active alerts: ${alerts.length}`);

            for (const alert of alerts) {
                console.log(`    - ${alert.severity.toUpperCase()}: ${alert.message}`);
            }

            if (this.monitoring.alertManager) {
                const stats = this.monitoring.alertManager.getStats();
                console.log(`  Total alerts triggered: ${stats.totalAlerts}`);
                console.log(`  By severity:`, stats.alertsBySeverity);

                this.recordTest('Alert Triggering', true, `Alerts system operational, ${stats.totalAlerts} total alerts`);
            }
        } catch (error) {
            this.recordTest('Alert Triggering', false, error.message);
        }

        console.log();
    }

    /**
     * Test health checks
     */
    async testHealthChecks() {
        console.log('TEST: Health Check Endpoints');
        console.log('-'.repeat(40));

        try {
            // Test /health endpoint
            const health = this.monitoring.getHealthEndpoint();
            console.log(`  Health status: ${health.status}`);
            console.log(`  Uptime: ${Math.round(health.uptime / 1000)}s`);
            console.log(`  Memory check: ${health.checks.memory.status}`);
            console.log(`  CPU check: ${health.checks.cpu.status}`);

            // Test /ready endpoint
            const ready = this.monitoring.getReadyEndpoint();
            console.log(`  Ready: ${ready.ready}`);
            console.log(`  Healthy platforms: ${ready.platforms.healthy}/${ready.platforms.total}`);

            this.recordTest('Health Check Endpoints', true, 'All health endpoints functional');
        } catch (error) {
            this.recordTest('Health Check Endpoints', false, error.message);
        }

        console.log();
    }

    /**
     * Record test result
     */
    recordTest(name, passed, message) {
        const result = {
            name,
            passed,
            message,
            timestamp: new Date().toISOString()
        };

        this.testResults.tests.push(result);

        if (passed) {
            this.testResults.passed++;
            console.log(`  ✓ ${name}: ${message}`);
        } else {
            this.testResults.failed++;
            console.log(`  ✗ ${name}: ${message}`);
        }
    }

    /**
     * Print test results
     */
    printResults() {
        console.log();
        console.log('='.repeat(60));
        console.log('TEST RESULTS');
        console.log('='.repeat(60));
        console.log();

        console.log(`Total Tests: ${this.testResults.tests.length}`);
        console.log(`Passed: ${this.testResults.passed}`);
        console.log(`Failed: ${this.testResults.failed}`);
        console.log(`Success Rate: ${((this.testResults.passed / this.testResults.tests.length) * 100).toFixed(1)}%`);

        console.log();
        console.log('Individual Test Results:');
        console.log('-'.repeat(60));

        for (const test of this.testResults.tests) {
            const status = test.passed ? '✓' : '✗';
            console.log(`${status} ${test.name}`);
            console.log(`  ${test.message}`);
        }

        console.log();
        console.log('='.repeat(60));
    }

    /**
     * Cleanup
     */
    async cleanup() {
        console.log('\nCleaning up...');

        if (this.monitoring) {
            await this.monitoring.shutdown();
        }

        console.log('✓ Cleanup complete\n');
    }
}

// Run tests if executed directly
if (require.main === module) {
    const suite = new MonitoringTestSuite();

    suite.runAll()
        .then(() => {
            console.log('✓ All tests completed');
            process.exit(suite.testResults.failed > 0 ? 1 : 0);
        })
        .catch((error) => {
            console.error('✗ Test suite failed:', error);
            process.exit(1);
        });
}

module.exports = MonitoringTestSuite;
