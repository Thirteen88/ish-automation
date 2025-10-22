#!/usr/bin/env node

/**
 * Selector Testing Framework
 *
 * This tool validates that selectors in selectors-config.json work correctly
 * against real websites. It provides:
 * - Automated selector validation
 * - Fallback selector testing
 * - Performance metrics
 * - Detailed reporting
 * - Screenshot capture for debugging
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class SelectorTester {
    constructor(config = {}) {
        this.config = {
            headless: config.headless !== false,
            timeout: config.timeout || 30000,
            screenshotsDir: config.screenshotsDir || './test-screenshots',
            verbose: config.verbose || false,
            ...config
        };

        this.browser = null;
        this.results = {
            platforms: {},
            summary: {
                totalPlatforms: 0,
                testedPlatforms: 0,
                successfulPlatforms: 0,
                failedPlatforms: 0,
                totalSelectors: 0,
                workingSelectors: 0,
                failedSelectors: 0
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Initialize browser
     */
    async initialize() {
        this.log('Initializing Selector Testing Framework...');

        // Create screenshots directory
        await fs.mkdir(this.config.screenshotsDir, { recursive: true });

        // Launch browser
        this.browser = await chromium.launch({
            headless: this.config.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        this.log('Browser initialized');
        return true;
    }

    /**
     * Test all platforms in the configuration
     */
    async testAllPlatforms(selectorsConfig) {
        this.log('\n========================================');
        this.log('TESTING ALL PLATFORMS');
        this.log('========================================\n');

        const platforms = Object.keys(selectorsConfig.platforms);
        this.results.summary.totalPlatforms = platforms.length;

        for (const platformName of platforms) {
            try {
                await this.testPlatform(
                    platformName,
                    selectorsConfig.platforms[platformName],
                    selectorsConfig.globalSettings
                );
                this.results.summary.testedPlatforms++;
            } catch (error) {
                this.log(`Failed to test platform ${platformName}: ${error.message}`, 'error');
                this.results.platforms[platformName] = {
                    tested: false,
                    error: error.message
                };
            }
        }

        return this.results;
    }

    /**
     * Test a single platform
     */
    async testPlatform(platformName, platformConfig, globalSettings) {
        this.log(`\n--- Testing Platform: ${platformConfig.name} ---`);
        this.log(`URL: ${platformConfig.url}`);

        const context = await this.browser.newContext({
            viewport: globalSettings.viewport,
            userAgent: globalSettings.userAgent
        });

        const page = await context.newPage();
        page.setDefaultTimeout(this.config.timeout);

        const platformResult = {
            name: platformConfig.name,
            url: platformConfig.url,
            tested: true,
            accessible: false,
            selectors: {},
            timing: {},
            issues: [],
            recommendations: []
        };

        try {
            // Navigate to platform
            const navStart = Date.now();
            this.log(`Navigating to ${platformConfig.url}...`);

            await page.goto(platformConfig.url, {
                waitUntil: platformConfig.waitStrategies?.pageLoad || 'domcontentloaded',
                timeout: globalSettings.navigationTimeout || 60000
            });

            platformResult.timing.navigation = Date.now() - navStart;
            platformResult.accessible = true;

            this.log(`✓ Page loaded in ${platformResult.timing.navigation}ms`);

            // Wait a bit for dynamic content
            await this.sleep(3000);

            // Take screenshot
            const screenshotPath = path.join(
                this.config.screenshotsDir,
                `${platformName}_initial.png`
            );
            await page.screenshot({ path: screenshotPath, fullPage: true });
            platformResult.screenshot = screenshotPath;

            // Test each selector category
            for (const [selectorType, selectors] of Object.entries(platformConfig.selectors)) {
                this.log(`\n  Testing ${selectorType}...`);

                const selectorResult = await this.testSelectorSet(
                    page,
                    selectorType,
                    selectors,
                    platformName
                );

                platformResult.selectors[selectorType] = selectorResult;
                this.results.summary.totalSelectors += selectors.length;

                if (selectorResult.found) {
                    this.log(`  ✓ ${selectorType}: Found using selector #${selectorResult.foundIndex + 1}`);
                    this.results.summary.workingSelectors++;
                } else {
                    this.log(`  ✗ ${selectorType}: Not found`, 'warn');
                    this.results.summary.failedSelectors++;
                    platformResult.issues.push(`Missing ${selectorType}`);
                }
            }

            // Check for authentication requirements
            const authCheck = await this.checkAuthentication(page);
            if (authCheck.required) {
                platformResult.issues.push('Authentication required');
                platformResult.authenticationRequired = true;
                this.log('  ⚠ Authentication required', 'warn');
            }

            // Check for CAPTCHA
            const captchaCheck = await this.checkCaptcha(page);
            if (captchaCheck.detected) {
                platformResult.issues.push('CAPTCHA detected');
                platformResult.captchaDetected = true;
                this.log('  ⚠ CAPTCHA detected', 'warn');
            }

            // Generate recommendations
            platformResult.recommendations = this.generateRecommendations(platformResult);

            // Determine overall success
            const criticalSelectors = ['promptInput', 'submitButton', 'responseContainer'];
            const hasAllCritical = criticalSelectors.every(sel =>
                platformResult.selectors[sel]?.found
            );

            platformResult.success = hasAllCritical && platformResult.accessible;

            if (platformResult.success) {
                this.results.summary.successfulPlatforms++;
                this.log(`\n✓ ${platformConfig.name} - READY FOR PRODUCTION`, 'success');
            } else {
                this.results.summary.failedPlatforms++;
                this.log(`\n✗ ${platformConfig.name} - NEEDS WORK`, 'warn');
            }

        } catch (error) {
            this.log(`Error testing ${platformName}: ${error.message}`, 'error');
            platformResult.error = error.message;
            platformResult.success = false;
            this.results.summary.failedPlatforms++;

            // Take error screenshot
            try {
                const errorScreenshot = path.join(
                    this.config.screenshotsDir,
                    `${platformName}_error.png`
                );
                await page.screenshot({ path: errorScreenshot, fullPage: true });
                platformResult.errorScreenshot = errorScreenshot;
            } catch (screenshotError) {
                // Ignore screenshot errors
            }
        } finally {
            await context.close();
        }

        this.results.platforms[platformName] = platformResult;
        return platformResult;
    }

    /**
     * Test a set of selectors
     */
    async testSelectorSet(page, selectorType, selectors, platformName) {
        const result = {
            selectorType,
            totalSelectors: selectors.length,
            testedSelectors: [],
            found: false,
            foundSelector: null,
            foundIndex: -1,
            timing: {}
        };

        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            const testStart = Date.now();

            try {
                // Try to find element
                const element = await page.waitForSelector(selector, {
                    timeout: 5000,
                    state: 'attached' // More lenient than 'visible'
                });

                const isVisible = element ? await element.isVisible() : false;
                const testTime = Date.now() - testStart;

                result.testedSelectors.push({
                    selector,
                    index: i,
                    found: !!element,
                    visible: isVisible,
                    timing: testTime
                });

                if (element && !result.found) {
                    result.found = true;
                    result.foundSelector = selector;
                    result.foundIndex = i;
                    result.timing.firstMatch = testTime;

                    if (this.config.verbose) {
                        // Get element details
                        const tagName = await element.evaluate(el => el.tagName);
                        const classList = await element.evaluate(el =>
                            Array.from(el.classList).join(' ')
                        );

                        this.log(`    Found: ${selector} (${tagName}, classes: ${classList || 'none'})`);
                    }
                }

            } catch (error) {
                result.testedSelectors.push({
                    selector,
                    index: i,
                    found: false,
                    visible: false,
                    error: error.message,
                    timing: Date.now() - testStart
                });
            }
        }

        return result;
    }

    /**
     * Check if authentication is required
     */
    async checkAuthentication(page) {
        const authPatterns = [
            'button:has-text("Log in")',
            'button:has-text("Sign in")',
            'a:has-text("Login")',
            'input[type="password"]',
            'form[action*="login"]',
            'div:has-text("Please sign in")'
        ];

        for (const pattern of authPatterns) {
            try {
                const element = await page.$(pattern);
                if (element) {
                    return { required: true, pattern };
                }
            } catch (error) {
                // Continue checking
            }
        }

        // Check page content
        const content = await page.content();
        const authKeywords = ['sign in', 'log in', 'authentication required', 'please login'];

        for (const keyword of authKeywords) {
            if (content.toLowerCase().includes(keyword)) {
                return { required: true, pattern: `content: ${keyword}` };
            }
        }

        return { required: false };
    }

    /**
     * Check for CAPTCHA
     */
    async checkCaptcha(page) {
        const captchaPatterns = [
            'iframe[src*="captcha"]',
            'iframe[src*="recaptcha"]',
            'div[class*="captcha"]',
            'div#cf-challenge',
            '.g-recaptcha'
        ];

        for (const pattern of captchaPatterns) {
            try {
                const element = await page.$(pattern);
                if (element) {
                    return { detected: true, pattern };
                }
            } catch (error) {
                // Continue checking
            }
        }

        return { detected: false };
    }

    /**
     * Generate recommendations based on test results
     */
    generateRecommendations(platformResult) {
        const recommendations = [];

        // Check selector coverage
        const selectorTypes = Object.keys(platformResult.selectors);
        const failedSelectors = selectorTypes.filter(
            type => !platformResult.selectors[type]?.found
        );

        if (failedSelectors.length > 0) {
            recommendations.push({
                type: 'selectors',
                priority: 'high',
                message: `Update selectors for: ${failedSelectors.join(', ')}`,
                action: 'Use discover-selectors.js to find working selectors'
            });
        }

        // Check selector efficiency
        for (const [type, result] of Object.entries(platformResult.selectors)) {
            if (result.found && result.foundIndex > 2) {
                recommendations.push({
                    type: 'optimization',
                    priority: 'medium',
                    message: `${type} selector found at position ${result.foundIndex + 1}`,
                    action: 'Move working selector to position 1 for better performance'
                });
            }
        }

        // Authentication
        if (platformResult.authenticationRequired) {
            recommendations.push({
                type: 'authentication',
                priority: 'high',
                message: 'Platform requires authentication',
                action: 'Set up authentication flow or use pre-authenticated cookies'
            });
        }

        // CAPTCHA
        if (platformResult.captchaDetected) {
            recommendations.push({
                type: 'security',
                priority: 'high',
                message: 'CAPTCHA detected',
                action: 'May require manual intervention or CAPTCHA solving service'
            });
        }

        return recommendations;
    }

    /**
     * Test a specific platform by name
     */
    async testSpecificPlatform(platformName, selectorsConfig) {
        const platformConfig = selectorsConfig.platforms[platformName];
        if (!platformConfig) {
            throw new Error(`Platform ${platformName} not found in configuration`);
        }

        return await this.testPlatform(
            platformName,
            platformConfig,
            selectorsConfig.globalSettings
        );
    }

    /**
     * Generate test report
     */
    async generateReport(outputPath = './selector-test-report.json') {
        this.log('\n========================================');
        this.log('TEST REPORT SUMMARY');
        this.log('========================================\n');

        const summary = this.results.summary;

        this.log(`Total Platforms: ${summary.totalPlatforms}`);
        this.log(`Tested: ${summary.testedPlatforms}`);
        this.log(`✓ Successful: ${summary.successfulPlatforms}`);
        this.log(`✗ Failed: ${summary.failedPlatforms}`);
        this.log(`\nTotal Selectors: ${summary.totalSelectors}`);
        this.log(`✓ Working: ${summary.workingSelectors}`);
        this.log(`✗ Failed: ${summary.failedSelectors}`);

        const successRate = summary.totalPlatforms > 0
            ? (summary.successfulPlatforms / summary.totalPlatforms * 100).toFixed(1)
            : 0;

        this.log(`\nSuccess Rate: ${successRate}%`);

        // Production-ready platforms
        const productionReady = Object.entries(this.results.platforms)
            .filter(([_, result]) => result.success)
            .map(([name, _]) => name);

        this.log('\nProduction-Ready Platforms:');
        if (productionReady.length > 0) {
            productionReady.forEach(name => this.log(`  ✓ ${name}`));
        } else {
            this.log('  None');
        }

        // Platforms needing work
        const needsWork = Object.entries(this.results.platforms)
            .filter(([_, result]) => !result.success)
            .map(([name, _]) => name);

        if (needsWork.length > 0) {
            this.log('\nPlatforms Needing Work:');
            needsWork.forEach(name => this.log(`  ✗ ${name}`));
        }

        // Save detailed report
        await fs.writeFile(outputPath, JSON.stringify(this.results, null, 2));
        this.log(`\nDetailed report saved to: ${outputPath}`);

        return this.results;
    }

    /**
     * Cleanup
     */
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
        this.log('Cleanup completed');
    }

    /**
     * Utility: Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Utility: Logging
     */
    log(message, level = 'info') {
        const colors = {
            info: '\x1b[36m',    // Cyan
            success: '\x1b[32m', // Green
            warn: '\x1b[33m',    // Yellow
            error: '\x1b[31m',   // Red
            reset: '\x1b[0m'
        };

        const color = colors[level] || colors.info;
        console.log(`${color}${message}${colors.reset}`);
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const options = {
        headless: !args.includes('--no-headless'),
        verbose: args.includes('--verbose') || args.includes('-v'),
        timeout: 30000
    };

    // Get platform filter if specified
    const platformIndex = args.indexOf('--platform');
    const specificPlatform = platformIndex !== -1 ? args[platformIndex + 1] : null;

    const tester = new SelectorTester(options);

    try {
        await tester.initialize();

        // Load selectors config
        const configPath = path.join(__dirname, 'selectors-config.json');
        const selectorsConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));

        if (specificPlatform) {
            console.log(`\nTesting specific platform: ${specificPlatform}\n`);
            await tester.testSpecificPlatform(specificPlatform, selectorsConfig);
        } else {
            console.log('\nTesting all platforms...\n');
            await tester.testAllPlatforms(selectorsConfig);
        }

        await tester.generateReport();
        await tester.cleanup();

        // Exit with appropriate code
        const success = tester.results.summary.successfulPlatforms > 0;
        process.exit(success ? 0 : 1);

    } catch (error) {
        console.error('Test error:', error);
        await tester.cleanup();
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = { SelectorTester };

// Run if called directly
if (require.main === module) {
    console.log('\n===========================================');
    console.log('   SELECTOR TESTING FRAMEWORK');
    console.log('===========================================\n');
    console.log('Usage:');
    console.log('  node test-selectors.js                 # Test all platforms');
    console.log('  node test-selectors.js --platform claude  # Test specific platform');
    console.log('  node test-selectors.js --verbose       # Verbose output');
    console.log('  node test-selectors.js --no-headless   # Show browser\n');

    main().catch(console.error);
}
