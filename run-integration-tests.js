#!/usr/bin/env node

/**
 * Integration Test Suite for Browser Automation
 *
 * This script runs comprehensive tests on the simplified configuration
 * to validate production readiness.
 */

const { SelectorTester } = require('./test-selectors');
const fs = require('fs').promises;
const path = require('path');

async function runIntegrationTests() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   BROWSER AUTOMATION - INTEGRATION TEST SUITE         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    try {
        // Load simplified config
        const configPath = path.join(__dirname, 'simplified-config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        console.log('Configuration loaded successfully');
        console.log(`Testing ${Object.keys(config.platforms).length} platforms\n`);

        // Initialize tester
        const tester = new SelectorTester({
            headless: true,  // Run headless for CI/automated testing
            verbose: true,
            timeout: 30000,
            screenshotsDir: './test-results/screenshots'
        });

        await tester.initialize();

        // Test all platforms
        const results = await tester.testAllPlatforms(config);

        // Generate comprehensive report
        const reportPath = './test-results/integration-test-report.json';
        await tester.generateReport(reportPath);

        // Generate production readiness report
        await generateProductionReport(results, config);

        await tester.cleanup();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✓ Testing completed in ${duration}s`);

        // Exit with appropriate code
        const hasProduction = results.summary.successfulPlatforms > 0;
        process.exit(hasProduction ? 0 : 1);

    } catch (error) {
        console.error('\n✗ Test suite failed:', error.message);
        process.exit(1);
    }
}

async function generateProductionReport(testResults, config) {
    console.log('\n\n╔════════════════════════════════════════════════════════╗');
    console.log('║         PRODUCTION READINESS REPORT                   ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const report = {
        timestamp: new Date().toISOString(),
        summary: testResults.summary,
        productionReady: [],
        needsWork: [],
        recommendations: [],
        deployment: config.deploymentStrategy
    };

    // Categorize platforms
    for (const [platformName, result] of Object.entries(testResults.platforms)) {
        const platformConfig = config.platforms[platformName];

        if (result.success && result.accessible) {
            report.productionReady.push({
                name: platformName,
                displayName: result.name,
                difficulty: platformConfig.difficulty,
                authRequired: platformConfig.authenticationRequired,
                selectors: result.selectors,
                timing: result.timing,
                phase: getDeploymentPhase(platformName, config.deploymentStrategy)
            });
        } else {
            report.needsWork.push({
                name: platformName,
                displayName: result.name,
                issues: result.issues || [],
                recommendations: result.recommendations || [],
                error: result.error
            });
        }
    }

    // Display production-ready platforms
    console.log('✓ PRODUCTION-READY PLATFORMS:');
    console.log('─────────────────────────────────────────────────────────\n');

    if (report.productionReady.length > 0) {
        report.productionReady.forEach(platform => {
            console.log(`  ${platform.displayName}`);
            console.log(`    Platform: ${platform.name}`);
            console.log(`    Difficulty: ${platform.difficulty}`);
            console.log(`    Auth Required: ${platform.authRequired ? 'Yes' : 'No'}`);
            console.log(`    Deployment Phase: ${platform.phase}`);
            console.log(`    Navigation Time: ${platform.timing.navigation}ms`);

            // Show selector status
            const selectorStatus = Object.entries(platform.selectors)
                .map(([type, data]) => `${type}: ${data.found ? '✓' : '✗'}`)
                .join(', ');
            console.log(`    Selectors: ${selectorStatus}\n`);
        });
    } else {
        console.log('  None - All platforms need work\n');
    }

    // Display platforms needing work
    if (report.needsWork.length > 0) {
        console.log('\n✗ PLATFORMS NEEDING WORK:');
        console.log('─────────────────────────────────────────────────────────\n');

        report.needsWork.forEach(platform => {
            console.log(`  ${platform.displayName} (${platform.name})`);

            if (platform.issues.length > 0) {
                console.log(`    Issues:`);
                platform.issues.forEach(issue => console.log(`      - ${issue}`));
            }

            if (platform.recommendations.length > 0) {
                console.log(`    Recommendations:`);
                platform.recommendations.forEach(rec => {
                    console.log(`      ${rec.priority.toUpperCase()}: ${rec.message}`);
                    console.log(`      Action: ${rec.action}`);
                });
            }

            if (platform.error) {
                console.log(`    Error: ${platform.error}`);
            }

            console.log('');
        });
    }

    // Generate recommendations
    console.log('\n📋 RECOMMENDATIONS:');
    console.log('─────────────────────────────────────────────────────────\n');

    if (report.productionReady.length >= 2) {
        console.log('  ✓ You have enough platforms for production deployment!');
        console.log(`    Ready: ${report.productionReady.length} platform(s)`);
        console.log('');

        report.recommendations.push({
            type: 'deployment',
            priority: 'high',
            message: 'Begin Phase 1 deployment with production-ready platforms',
            platforms: report.productionReady.map(p => p.name)
        });

        console.log('  Next Steps:');
        console.log('  1. Deploy with production-ready platforms');
        console.log('  2. Set up monitoring and error tracking');
        console.log('  3. Implement rate limiting safeguards');
        console.log('  4. Create cookie management system for authenticated platforms');
        console.log('  5. Set up automated testing pipeline\n');

    } else if (report.productionReady.length === 1) {
        console.log('  ⚠ Only 1 platform is production-ready');
        console.log('    Recommendation: Fix at least one more platform before deployment\n');

        report.recommendations.push({
            type: 'testing',
            priority: 'high',
            message: 'Fix selectors for additional platforms',
            action: 'Use discover-selectors.js to find working selectors'
        });

    } else {
        console.log('  ✗ No platforms are production-ready');
        console.log('    Recommendation: Use discover-selectors.js to find working selectors\n');

        report.recommendations.push({
            type: 'setup',
            priority: 'critical',
            message: 'No platforms ready - selector discovery needed',
            action: 'Run: node discover-selectors.js <url> <platform-name>'
        });
    }

    // Authentication strategy
    console.log('\n🔐 AUTHENTICATION STRATEGY:');
    console.log('─────────────────────────────────────────────────────────\n');

    const noAuthPlatforms = report.productionReady.filter(p => !p.authRequired);
    const authPlatforms = report.productionReady.filter(p => p.authRequired);

    if (noAuthPlatforms.length > 0) {
        console.log('  Phase 1: No-Auth Platforms (Deploy Now)');
        noAuthPlatforms.forEach(p => console.log(`    - ${p.displayName}`));
        console.log('');
    }

    if (authPlatforms.length > 0) {
        console.log('  Phase 2: Authenticated Platforms (Setup Required)');
        authPlatforms.forEach(p => console.log(`    - ${p.displayName}`));
        console.log('\n  Authentication Setup:');
        console.log('    1. Manual login in non-headless mode');
        console.log('    2. Save cookies using production-browser-automation.js');
        console.log('    3. Test with saved cookies');
        console.log('    4. Implement cookie refresh strategy\n');
    }

    // Performance metrics
    console.log('\n📊 PERFORMANCE METRICS:');
    console.log('─────────────────────────────────────────────────────────\n');

    if (report.productionReady.length > 0) {
        const avgNavTime = report.productionReady.reduce((sum, p) => sum + p.timing.navigation, 0) / report.productionReady.length;
        console.log(`  Average Navigation Time: ${avgNavTime.toFixed(0)}ms`);

        const successRate = (testResults.summary.successfulPlatforms / testResults.summary.totalPlatforms * 100).toFixed(1);
        console.log(`  Platform Success Rate: ${successRate}%`);

        const selectorRate = (testResults.summary.workingSelectors / testResults.summary.totalSelectors * 100).toFixed(1);
        console.log(`  Selector Success Rate: ${selectorRate}%\n`);
    }

    // Save report
    const reportPath = './test-results/production-readiness-report.json';
    await fs.mkdir('./test-results', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n📄 Detailed report saved: ${reportPath}\n`);

    return report;
}

function getDeploymentPhase(platformName, deploymentStrategy) {
    for (const [phase, config] of Object.entries(deploymentStrategy)) {
        if (config.platforms.includes(platformName)) {
            return phase;
        }
    }
    return 'future';
}

// Run tests
if (require.main === module) {
    runIntegrationTests().catch(console.error);
}

module.exports = { runIntegrationTests, generateProductionReport };
