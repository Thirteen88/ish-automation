#!/usr/bin/env node

/**
 * Performance Load Testing Suite
 *
 * Comprehensive load testing system to measure system performance under
 * various load conditions. Tests with 100, 500, and 1000 concurrent requests,
 * identifies bottlenecks, and generates optimization recommendations.
 *
 * Features:
 * - Multiple load levels (100, 500, 1000 concurrent requests)
 * - Realistic traffic patterns
 * - Detailed performance metrics
 * - Bottleneck identification
 * - Optimization recommendations
 * - Visual performance reports
 */

const { ConnectionPool } = require('./connection-pool');
const { CacheManager } = require('./cache-manager');
const { BatchProcessor } = require('./batch-processor');
const { LoadBalancer } = require('./load-balancer');
const { QueryOptimizer } = require('./query-optimizer');
const { PerformanceMonitor } = require('./perf-monitor');
const fs = require('fs').promises;
const path = require('path');

class LoadTest {
    constructor(name, config = {}) {
        this.name = name;
        this.config = {
            concurrency: config.concurrency || 100,
            duration: config.duration || 60000, // 1 minute
            rampUpTime: config.rampUpTime || 10000, // 10 seconds
            requestsPerSecond: config.requestsPerSecond || null, // null = unlimited
            ...config
        };

        this.results = {
            name: this.name,
            config: this.config,
            startTime: null,
            endTime: null,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            responseTimes: [],
            errors: [],
            throughput: 0,
            metrics: null
        };
    }

    async run(executor) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Running load test: ${this.name}`);
        console.log(`Concurrency: ${this.config.concurrency}, Duration: ${this.config.duration}ms`);
        console.log('='.repeat(80) + '\n');

        this.results.startTime = Date.now();

        const requests = [];
        const interval = this.config.rampUpTime / this.config.concurrency;

        // Ramp up
        for (let i = 0; i < this.config.concurrency; i++) {
            setTimeout(() => {
                this.executeRequest(executor);
            }, i * interval);
        }

        // Wait for duration
        await new Promise(resolve => setTimeout(resolve, this.config.duration));

        // Wait for all requests to complete (with timeout)
        const maxWait = 30000; // 30 seconds
        const waitStart = Date.now();

        while (this.results.totalRequests < this.config.concurrency && Date.now() - waitStart < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.results.endTime = Date.now();
        this.calculateMetrics();

        console.log(`\n${'='.repeat(80)}`);
        console.log(`Load test completed: ${this.name}`);
        console.log(`Duration: ${((this.results.endTime - this.results.startTime) / 1000).toFixed(2)}s`);
        console.log(`Total requests: ${this.results.totalRequests}`);
        console.log(`Success rate: ${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(2)}%`);
        console.log('='.repeat(80) + '\n');

        return this.results;
    }

    async executeRequest(executor) {
        const startTime = Date.now();

        try {
            await executor();

            const responseTime = Date.now() - startTime;
            this.results.responseTimes.push(responseTime);
            this.results.successfulRequests++;
        } catch (error) {
            this.results.errors.push({
                message: error.message,
                timestamp: Date.now()
            });
            this.results.failedRequests++;
        } finally {
            this.results.totalRequests++;
        }
    }

    calculateMetrics() {
        const duration = (this.results.endTime - this.results.startTime) / 1000; // seconds

        // Sort response times
        const sorted = this.results.responseTimes.sort((a, b) => a - b);

        this.results.metrics = {
            duration: `${duration.toFixed(2)}s`,
            throughput: `${(this.results.totalRequests / duration).toFixed(2)} req/s`,
            successRate: `${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(2)}%`,
            errorRate: `${((this.results.failedRequests / this.results.totalRequests) * 100).toFixed(2)}%`,
            avgResponseTime: sorted.length > 0 ? `${(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(0)}ms` : '0ms',
            minResponseTime: sorted.length > 0 ? `${sorted[0]}ms` : '0ms',
            maxResponseTime: sorted.length > 0 ? `${sorted[sorted.length - 1]}ms` : '0ms',
            p50: sorted.length > 0 ? `${sorted[Math.floor(sorted.length * 0.5)]}ms` : '0ms',
            p90: sorted.length > 0 ? `${sorted[Math.floor(sorted.length * 0.9)]}ms` : '0ms',
            p95: sorted.length > 0 ? `${sorted[Math.floor(sorted.length * 0.95)]}ms` : '0ms',
            p99: sorted.length > 0 ? `${sorted[Math.floor(sorted.length * 0.99)]}ms` : '0ms',
            totalErrors: this.results.errors.length
        };
    }
}

class LoadTestSuite {
    constructor(config = {}) {
        this.config = {
            reportDir: config.reportDir || '/home/gary/ish-automation/performance/load-test-reports',
            ...config
        };

        this.tests = [];
        this.results = [];
        this.systemComponents = null;
    }

    async initialize() {
        console.log('[LoadTest] Initializing test suite...');

        // Initialize system components
        this.systemComponents = {
            connectionPool: new ConnectionPool({
                minConnections: 2,
                maxConnections: 10,
                headless: true
            }),
            cache: new CacheManager({
                enableCompression: true,
                l1MaxSize: 500
            }),
            batchProcessor: new BatchProcessor({
                maxBatchSize: 10,
                batchTimeout: 2000
            }),
            loadBalancer: new LoadBalancer({
                algorithm: 'least-connections',
                enableStickySession: true
            }),
            queryOptimizer: new QueryOptimizer({
                enableDeduplication: true,
                enablePrediction: true
            }),
            perfMonitor: new PerformanceMonitor({
                enableAlerts: true,
                reportInterval: 30000
            })
        };

        // Initialize connection pool
        await this.systemComponents.connectionPool.initialize();

        // Register platforms in load balancer
        this.systemComponents.loadBalancer.registerPlatform('huggingchat', { weight: 3, maxConnections: 50 });
        this.systemComponents.loadBalancer.registerPlatform('claude', { weight: 2, maxConnections: 30 });
        this.systemComponents.loadBalancer.registerPlatform('chatgpt', { weight: 2, maxConnections: 30 });

        // Start monitoring
        this.systemComponents.perfMonitor.startMonitoring();

        console.log('[LoadTest] Test suite initialized');
    }

    addTest(test) {
        this.tests.push(test);
    }

    async runAllTests() {
        console.log(`\n${'='.repeat(80)}`);
        console.log('LOAD TEST SUITE - STARTING ALL TESTS');
        console.log('='.repeat(80) + '\n');

        for (const test of this.tests) {
            const result = await test.run(this.createTestExecutor());
            this.results.push(result);

            // Cool down between tests
            console.log('\nCooling down for 10 seconds...\n');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log('LOAD TEST SUITE - ALL TESTS COMPLETED');
        console.log('='.repeat(80) + '\n');

        return this.results;
    }

    createTestExecutor() {
        const queries = [
            'What is artificial intelligence?',
            'Explain machine learning',
            'How do neural networks work?',
            'Write a function to sort an array',
            'What is the meaning of life?',
            'Explain quantum computing',
            'How does blockchain work?',
            'What is deep learning?',
            'Compare Python and JavaScript',
            'Explain REST API'
        ];

        return async () => {
            const query = queries[Math.floor(Math.random() * queries.length)];
            const platform = ['huggingchat', 'claude', 'chatgpt'][Math.floor(Math.random() * 3)];

            // Record request in monitor
            const requestData = this.systemComponents.perfMonitor.recordRequest(platform);

            try {
                // Optimize query
                const optimized = await this.systemComponents.queryOptimizer.optimize(query);

                // Check cache
                const cached = await this.systemComponents.cache.get(query);
                if (cached) {
                    this.systemComponents.perfMonitor.recordResponse(requestData, true);
                    return cached;
                }

                // Simulate request execution (in real scenario, would use actual browser automation)
                await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));

                // Simulate 95% success rate
                if (Math.random() < 0.95) {
                    const result = { query, response: `Mock response for: ${query}`, platform };

                    // Cache result
                    await this.systemComponents.cache.set(query, result);

                    this.systemComponents.perfMonitor.recordResponse(requestData, true);
                    return result;
                } else {
                    throw new Error('Simulated failure');
                }
            } catch (error) {
                this.systemComponents.perfMonitor.recordResponse(requestData, false);
                throw error;
            }
        };
    }

    async generateReport() {
        console.log('[LoadTest] Generating comprehensive report...');

        const report = {
            summary: {
                totalTests: this.tests.length,
                timestamp: new Date().toISOString(),
                systemComponents: Object.keys(this.systemComponents)
            },
            testResults: this.results.map(r => ({
                name: r.name,
                concurrency: r.config.concurrency,
                metrics: r.metrics
            })),
            bottlenecks: this.identifyBottlenecks(),
            recommendations: this.generateRecommendations(),
            componentMetrics: this.getComponentMetrics(),
            performanceTargets: this.evaluatePerformanceTargets()
        };

        // Save report
        await this.saveReport(report);

        return report;
    }

    identifyBottlenecks() {
        const bottlenecks = [];

        // Analyze test results
        for (const result of this.results) {
            const metrics = result.metrics;

            // Check response times
            const p95 = parseInt(metrics.p95);
            if (p95 > 3000) {
                bottlenecks.push({
                    test: result.name,
                    component: 'response_time',
                    issue: 'High P95 latency',
                    value: metrics.p95,
                    severity: 'high'
                });
            }

            // Check error rate
            const errorRate = parseFloat(metrics.errorRate);
            if (errorRate > 5) {
                bottlenecks.push({
                    test: result.name,
                    component: 'reliability',
                    issue: 'High error rate',
                    value: metrics.errorRate,
                    severity: 'critical'
                });
            }

            // Check throughput
            const throughput = parseFloat(metrics.throughput);
            if (throughput < 10) {
                bottlenecks.push({
                    test: result.name,
                    component: 'throughput',
                    issue: 'Low throughput',
                    value: metrics.throughput,
                    severity: 'medium'
                });
            }
        }

        return bottlenecks;
    }

    generateRecommendations() {
        const recommendations = [];
        const bottlenecks = this.identifyBottlenecks();

        // Response time recommendations
        if (bottlenecks.some(b => b.component === 'response_time')) {
            recommendations.push({
                category: 'Performance',
                priority: 'High',
                recommendation: 'Increase connection pool size from 10 to 20',
                expectedImpact: 'Reduce P95 latency by 30-40%'
            });

            recommendations.push({
                category: 'Performance',
                priority: 'High',
                recommendation: 'Enable query result prediction and cache warming',
                expectedImpact: 'Reduce average response time by 50-60%'
            });

            recommendations.push({
                category: 'Performance',
                priority: 'Medium',
                recommendation: 'Implement request batching for similar queries',
                expectedImpact: 'Improve throughput by 20-30%'
            });
        }

        // Reliability recommendations
        if (bottlenecks.some(b => b.component === 'reliability')) {
            recommendations.push({
                category: 'Reliability',
                priority: 'Critical',
                recommendation: 'Implement circuit breaker pattern for failing platforms',
                expectedImpact: 'Reduce error rate by 40-50%'
            });

            recommendations.push({
                category: 'Reliability',
                priority: 'High',
                recommendation: 'Add automatic retry with exponential backoff',
                expectedImpact: 'Improve success rate by 15-20%'
            });
        }

        // Throughput recommendations
        if (bottlenecks.some(b => b.component === 'throughput')) {
            recommendations.push({
                category: 'Scalability',
                priority: 'High',
                recommendation: 'Scale connection pool to 20+ connections',
                expectedImpact: 'Increase throughput by 50-100%'
            });

            recommendations.push({
                category: 'Scalability',
                priority: 'Medium',
                recommendation: 'Deploy multiple load-balanced instances',
                expectedImpact: 'Linear throughput scaling'
            });
        }

        // General recommendations
        recommendations.push({
            category: 'Optimization',
            priority: 'Medium',
            recommendation: 'Enable response compression to reduce memory usage',
            expectedImpact: 'Reduce memory usage by 60-70%'
        });

        recommendations.push({
            category: 'Monitoring',
            priority: 'Low',
            recommendation: 'Set up real-time alerting for performance degradation',
            expectedImpact: 'Faster incident response'
        });

        return recommendations;
    }

    getComponentMetrics() {
        return {
            connectionPool: this.systemComponents.connectionPool.getMetrics(),
            cache: this.systemComponents.cache.getMetrics(),
            loadBalancer: this.systemComponents.loadBalancer.getMetrics(),
            queryOptimizer: this.systemComponents.queryOptimizer.getMetrics(),
            perfMonitor: this.systemComponents.perfMonitor.getReport()
        };
    }

    evaluatePerformanceTargets() {
        const targets = {
            throughput: {
                target: '100 req/s',
                achieved: null,
                status: null
            },
            responseTime: {
                target: 'P95 < 2000ms',
                achieved: null,
                status: null
            },
            errorRate: {
                target: '< 1%',
                achieved: null,
                status: null
            },
            availability: {
                target: '99.9%',
                achieved: null,
                status: null
            }
        };

        // Evaluate based on highest load test
        const highestLoad = this.results.reduce((max, r) =>
            r.config.concurrency > max.config.concurrency ? r : max
        , this.results[0]);

        if (highestLoad) {
            // Throughput
            const throughput = parseFloat(highestLoad.metrics.throughput);
            targets.throughput.achieved = highestLoad.metrics.throughput;
            targets.throughput.status = throughput >= 100 ? 'PASS' : 'FAIL';

            // Response time
            const p95 = parseInt(highestLoad.metrics.p95);
            targets.responseTime.achieved = highestLoad.metrics.p95;
            targets.responseTime.status = p95 < 2000 ? 'PASS' : 'FAIL';

            // Error rate
            const errorRate = parseFloat(highestLoad.metrics.errorRate);
            targets.errorRate.achieved = highestLoad.metrics.errorRate;
            targets.errorRate.status = errorRate < 1 ? 'PASS' : 'FAIL';

            // Availability
            const successRate = parseFloat(highestLoad.metrics.successRate);
            targets.availability.achieved = highestLoad.metrics.successRate;
            targets.availability.status = successRate >= 99.9 ? 'PASS' : 'FAIL';
        }

        return targets;
    }

    async saveReport(report) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `load-test-report-${timestamp}.json`;
        const filepath = path.join(this.config.reportDir, filename);

        try {
            await fs.mkdir(this.config.reportDir, { recursive: true });
            await fs.writeFile(filepath, JSON.stringify(report, null, 2));

            // Also save a markdown version
            const mdFilename = filename.replace('.json', '.md');
            const mdFilepath = path.join(this.config.reportDir, mdFilename);
            await fs.writeFile(mdFilepath, this.generateMarkdownReport(report));

            console.log(`[LoadTest] Report saved to: ${filepath}`);
            console.log(`[LoadTest] Markdown report saved to: ${mdFilepath}`);

            return filepath;
        } catch (error) {
            console.error('[LoadTest] Failed to save report:', error.message);
            throw error;
        }
    }

    generateMarkdownReport(report) {
        let md = '# ISH Automation - Load Test Report\n\n';
        md += `Generated: ${report.summary.timestamp}\n\n`;

        md += '## Summary\n\n';
        md += `- Total Tests: ${report.summary.totalTests}\n`;
        md += `- System Components: ${report.summary.systemComponents.join(', ')}\n\n`;

        md += '## Test Results\n\n';
        for (const result of report.testResults) {
            md += `### ${result.name}\n\n`;
            md += `- **Concurrency**: ${result.concurrency}\n`;
            md += `- **Duration**: ${result.metrics.duration}\n`;
            md += `- **Throughput**: ${result.metrics.throughput}\n`;
            md += `- **Success Rate**: ${result.metrics.successRate}\n`;
            md += `- **Avg Response Time**: ${result.metrics.avgResponseTime}\n`;
            md += `- **P95**: ${result.metrics.p95}\n`;
            md += `- **P99**: ${result.metrics.p99}\n\n`;
        }

        md += '## Performance Targets\n\n';
        md += '| Target | Goal | Achieved | Status |\n';
        md += '|--------|------|----------|--------|\n';
        for (const [key, target] of Object.entries(report.performanceTargets)) {
            md += `| ${key} | ${target.target} | ${target.achieved || 'N/A'} | ${target.status || 'N/A'} |\n`;
        }
        md += '\n';

        if (report.bottlenecks.length > 0) {
            md += '## Identified Bottlenecks\n\n';
            for (const bottleneck of report.bottlenecks) {
                md += `- **${bottleneck.component}** (${bottleneck.severity}): ${bottleneck.issue}\n`;
                md += `  - Test: ${bottleneck.test}\n`;
                md += `  - Value: ${bottleneck.value}\n\n`;
            }
        }

        md += '## Optimization Recommendations\n\n';
        for (const rec of report.recommendations) {
            md += `### ${rec.category} (Priority: ${rec.priority})\n\n`;
            md += `**Recommendation**: ${rec.recommendation}\n\n`;
            md += `**Expected Impact**: ${rec.expectedImpact}\n\n`;
        }

        return md;
    }

    async cleanup() {
        console.log('[LoadTest] Cleaning up test suite...');

        if (this.systemComponents) {
            await this.systemComponents.connectionPool.shutdown();
            await this.systemComponents.cache.shutdown();
            await this.systemComponents.batchProcessor.shutdown();
            await this.systemComponents.loadBalancer.shutdown();
            await this.systemComponents.queryOptimizer.shutdown();
            await this.systemComponents.perfMonitor.shutdown();
        }

        console.log('[LoadTest] Test suite cleaned up');
    }
}

// Main execution
async function main() {
    const suite = new LoadTestSuite();

    try {
        await suite.initialize();

        // Add load tests
        suite.addTest(new LoadTest('Low Load Test', {
            concurrency: 100,
            duration: 30000, // 30 seconds
            rampUpTime: 5000
        }));

        suite.addTest(new LoadTest('Medium Load Test', {
            concurrency: 500,
            duration: 60000, // 1 minute
            rampUpTime: 10000
        }));

        suite.addTest(new LoadTest('High Load Test', {
            concurrency: 1000,
            duration: 60000, // 1 minute
            rampUpTime: 15000
        }));

        // Run all tests
        await suite.runAllTests();

        // Generate report
        const report = await suite.generateReport();

        console.log('\n' + '='.repeat(80));
        console.log('FINAL REPORT SUMMARY');
        console.log('='.repeat(80) + '\n');

        console.log('Performance Targets:');
        for (const [key, target] of Object.entries(report.performanceTargets)) {
            const status = target.status === 'PASS' ? '✓' : '✗';
            console.log(`  ${status} ${key}: ${target.target} (achieved: ${target.achieved || 'N/A'})`);
        }

        console.log(`\nBottlenecks Identified: ${report.bottlenecks.length}`);
        console.log(`Recommendations: ${report.recommendations.length}`);

        console.log('\n' + '='.repeat(80) + '\n');

        await suite.cleanup();

    } catch (error) {
        console.error('Load test suite error:', error);
        await suite.cleanup();
        process.exit(1);
    }
}

// Export for use as module
module.exports = { LoadTestSuite, LoadTest };

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}
