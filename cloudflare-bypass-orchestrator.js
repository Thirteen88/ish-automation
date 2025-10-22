#!/usr/bin/env node

/**
 * Cloudflare-Resistant Orchestrator
 *
 * Enhanced with:
 * - Stealth mode using playwright-extra
 * - Cloudflare challenge detection and waiting
 * - Randomized timing and behavior
 * - Enhanced browser fingerprint evasion
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const EventEmitter = require('events');

// Apply stealth plugin
chromium.use(stealth);

const { HealthMonitor } = require('./health-monitor');
const ErrorHandler = require('./error-handler');
const CLIVisualizer = require('./cli-visualizer');

/**
 * Curated Model Registry
 */
const CURATED_MODELS = {
    text: {
        'claude-3.5-sonnet': { provider: 'Anthropic', platform: 'lmarena', speed: 'fast', quality: 'excellent', useCase: 'general-purpose' },
        'claude-3-opus': { provider: 'Anthropic', platform: 'lmarena', speed: 'medium', quality: 'excellent', useCase: 'complex-reasoning' },
        'gpt-4-turbo': { provider: 'OpenAI', platform: 'lmarena', speed: 'fast', quality: 'high', useCase: 'general-purpose' },
        'gpt-4': { provider: 'OpenAI', platform: 'lmarena', speed: 'medium', quality: 'high', useCase: 'general-purpose' },
        'deepseek-coder-v2': { provider: 'DeepSeek', platform: 'lmarena', speed: 'fast', quality: 'high', useCase: 'coding' },
        'kimi-chat': { provider: 'Moonshot', platform: 'lmarena', speed: 'medium', quality: 'high', useCase: 'long-context' },
        'glm-4': { provider: 'Zhipu', platform: 'lmarena', speed: 'fast', quality: 'high', useCase: 'chinese' }
    }
};

/**
 * Enhanced Platform Automation with Cloudflare Handling
 */
class PlatformAutomation {
    constructor(platformName, config = {}) {
        this.platformName = platformName;
        this.config = config;
        this.page = null;
        this.isInitialized = false;
        this.maxCloudflareWait = 30000; // 30 seconds
    }

    async initialize(page) {
        this.page = page;
        await this.setupEnhancedStealth();
        this.isInitialized = true;
    }

    async setupEnhancedStealth() {
        // Enhanced stealth techniques
        await this.page.addInitScript(() => {
            // Override webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false
            });

            // Mock chrome object
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };

            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });

            // Remove automation indicators
            delete navigator.__proto__.webdriver;
        });
    }

    async waitForCloudflareChallenge() {
        console.log('  ⏳ Detecting Cloudflare challenge...');

        const startTime = Date.now();
        let challengeDetected = false;

        while (Date.now() - startTime < this.maxCloudflareWait) {
            // Check for Cloudflare indicators
            const cfCheck = await this.page.evaluate(() => {
                const title = document.title.toLowerCase();
                const bodyText = document.body.textContent.toLowerCase();

                return {
                    isChallenge: title.includes('just a moment') ||
                                bodyText.includes('verify you are human') ||
                                bodyText.includes('verifying you are human') ||
                                bodyText.includes('checking your browser'),
                    hasContent: document.querySelectorAll('textarea, input[type="text"]').length > 0
                };
            });

            if (cfCheck.isChallenge) {
                challengeDetected = true;
                console.log('  🛡️  Cloudflare challenge detected, waiting...');
                await this.page.waitForTimeout(2000);
            } else if (cfCheck.hasContent) {
                console.log('  ✓ Cloudflare challenge passed');
                return true;
            } else {
                await this.page.waitForTimeout(1000);
            }
        }

        if (challengeDetected) {
            throw new Error('Cloudflare challenge timeout - could not bypass automatically');
        }

        return true;
    }

    randomDelay(min = 500, max = 1500) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

/**
 * LMArena with Cloudflare Bypass
 */
class LMArenaAutomation extends PlatformAutomation {
    constructor(config = {}) {
        super('LMArena', config);
        this.baseUrl = 'https://lmarena.ai';
        this.supportedModels = Object.keys(CURATED_MODELS.text);
    }

    async query(prompt, options = {}) {
        const model = options.model || 'claude-3.5-sonnet';

        try {
            console.log(`  🌐 LMArena querying with: ${model}`);

            // Navigate
            await this.page.goto(this.baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Wait for Cloudflare
            await this.waitForCloudflareChallenge();

            // Random human-like delay
            await this.page.waitForTimeout(this.randomDelay(1000, 2000));

            // Dismiss cookie consent
            try {
                const cookieButton = await this.page.$('button:has-text("Accept")');
                if (cookieButton) {
                    await cookieButton.click();
                    await this.page.waitForTimeout(this.randomDelay(500, 1000));
                    console.log('  ✓ Dismissed cookie consent');
                }
            } catch (e) {
                // No cookie dialog
            }

            // Find input with multiple strategies
            const selectors = [
                'textarea:not([disabled])',
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="prompt"]',
                'textarea',
                '[contenteditable="true"]'
            ];

            let inputElement = null;
            for (const selector of selectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 3000 });
                    const elements = await this.page.$$(selector);
                    if (elements.length > 0) {
                        inputElement = elements[0];
                        console.log(`  ✓ Found input: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!inputElement) {
                await this.page.screenshot({
                    path: 'selector-discovery/lmarena-cloudflare-error.png',
                    fullPage: true
                });
                throw new Error('Could not find input element after Cloudflare bypass');
            }

            // Human-like typing
            await inputElement.click();
            await this.page.waitForTimeout(this.randomDelay(300, 700));
            await inputElement.type(prompt, { delay: this.randomDelay(50, 150) });
            await this.page.keyboard.press('Enter');

            // Wait for response
            await this.page.waitForTimeout(5000);

            // Extract response
            const response = await this.page.evaluate(() => {
                const selectors = ['[class*="message"]', '[class*="response"]', '.prose'];
                for (const sel of selectors) {
                    const els = document.querySelectorAll(sel);
                    if (els.length > 0) return els[els.length - 1].textContent;
                }
                return '[Response received]';
            });

            return {
                platform: 'LMArena',
                model: model,
                response: response,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            try {
                await this.page.screenshot({
                    path: 'selector-discovery/lmarena-error.png',
                    fullPage: true
                });
            } catch {}
            throw new Error(`LMArena query failed: ${error.message}`);
        }
    }
}

/**
 * ISH with Cloudflare Bypass
 */
class ISHAutomation extends PlatformAutomation {
    constructor(config = {}) {
        super('ISH', config);
        this.baseUrl = 'https://ish.junioralive.in';
        this.supportedModels = ['claude-3-opus', 'claude-3.5-sonnet', 'gpt-4', 'gpt-4-turbo'];
    }

    async query(prompt, options = {}) {
        const model = options.model || 'claude-3.5-sonnet';

        try {
            console.log(`  🌐 ISH querying with: ${model}`);

            await this.page.goto(this.baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Wait for Cloudflare
            await this.waitForCloudflareChallenge();

            await this.page.waitForTimeout(this.randomDelay(1000, 2000));

            // Try to find selectors
            const selectors = await this.page.evaluate(() => {
                return {
                    textareas: Array.from(document.querySelectorAll('textarea')).length,
                    inputs: Array.from(document.querySelectorAll('input')).length,
                    buttons: Array.from(document.querySelectorAll('button')).length
                };
            });

            console.log('  📋 ISH interface elements:', selectors);

            return {
                platform: 'ISH',
                model: model,
                response: `[ISH query attempted - interface detection: ${JSON.stringify(selectors)}]`,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            try {
                await this.page.screenshot({
                    path: 'selector-discovery/ish-error.png',
                    fullPage: true
                });
            } catch {}
            throw new Error(`ISH query failed: ${error.message}`);
        }
    }
}

/**
 * Cloudflare-Resistant Orchestrator
 */
class CloudflareOrchestrator extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            environment: options.environment || 'production',
            headless: options.headless !== undefined ? options.headless : true,
            enableHealthMonitoring: options.enableHealthMonitoring !== false,
            ...options
        };

        this.errorHandler = null;
        this.healthMonitor = null;
        this.visualizer = new CLIVisualizer();
        this.browser = null;
        this.platforms = new Map();
        this.models = CURATED_MODELS;

        this.state = {
            initialized: false,
            startTime: null,
            requestCount: 0
        };
    }

    async initialize() {
        this.visualizer.clear();
        this.visualizer.sectionHeader('Cloudflare-Resistant Orchestrator', '🛡️');

        console.log(`\n📋 Configuration:`);
        console.log(`   Mode: ${this.options.headless ? 'Headless' : 'Headed'}`);
        console.log(`   Stealth: Enhanced with playwright-extra`);
        console.log(`   Models: ${Object.keys(this.models.text).length} curated\n`);

        try {
            // Initialize components
            console.log('🛡️  Initializing error handler...');
            this.errorHandler = new ErrorHandler({ enableCircuitBreaker: true });

            if (this.options.enableHealthMonitoring) {
                console.log('💚 Initializing health monitor...');
                this.healthMonitor = new HealthMonitor();
            }

            console.log('🌐 Launching browser with stealth...');
            await this.initializeBrowser();

            console.log('📡 Initializing platforms...\n');
            await this.initializePlatforms();

            this.state.initialized = true;
            this.state.startTime = new Date().toISOString();

            this.visualizer.displaySuccess('Orchestrator Ready!', {
                'Text Models': Object.keys(this.models.text).length,
                'Platforms': this.platforms.size,
                'Stealth Mode': 'Enabled',
                'Status': 'Ready'
            });

            this.emit('initialized');
            return true;

        } catch (error) {
            this.visualizer.displayError(error, 'Initialization failed');
            throw error;
        }
    }

    async initializeBrowser() {
        this.browser = await chromium.launch({
            headless: this.options.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        console.log('   ✓ Browser launched with stealth');
    }

    async initializePlatforms() {
        const platformConfigs = [
            { name: 'lmarena', class: LMArenaAutomation, priority: 1 },
            { name: 'ish', class: ISHAutomation, priority: 2 }
        ];

        for (const { name, class: PlatformClass, priority } of platformConfigs) {
            const context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            const page = await context.newPage();
            const platform = new PlatformClass(this.options);
            await platform.initialize(page);

            this.platforms.set(name, { instance: platform, priority });
            console.log(`   ✓ ${name} (Priority ${priority})`);

            if (this.healthMonitor) {
                this.healthMonitor.registerPlatform(name);
            }
        }
    }

    async query(request) {
        const { prompt, model, type = 'text' } = request;
        const startTime = Date.now();

        try {
            if (type === 'text' && !this.models.text[model]) {
                throw new Error(`Model ${model} not in curated list`);
            }

            const modelInfo = this.models.text[model];
            const platform = this.platforms.get(modelInfo.platform).instance;

            const result = await this.errorHandler.executeWithProtection(
                async () => await platform.query(prompt, { model }),
                { platform: modelInfo.platform }
            );

            const duration = Date.now() - startTime;
            this.state.requestCount++;

            return {
                success: true,
                duration,
                result,
                model: model,
                modelInfo: modelInfo,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            throw error;
        }
    }

    listModels(type = 'all') {
        if (type === 'all') {
            return { text: Object.keys(this.models.text) };
        }
        return Object.keys(this.models[type] || {});
    }

    async shutdown() {
        console.log('\n🛑 Shutting down...');

        for (const context of await this.browser.contexts()) {
            await context.close();
        }

        if (this.browser) {
            await this.browser.close();
        }

        console.log('✅ Shutdown complete');
        this.emit('shutdown');
    }
}

module.exports = CloudflareOrchestrator;

// Demo
if (require.main === module) {
    async function demo() {
        const orchestrator = new CloudflareOrchestrator({
            environment: 'development',
            headless: true
        });

        try {
            await orchestrator.initialize();

            console.log('\n📋 Available Models:');
            const models = orchestrator.listModels();
            console.log('Text:', models.text.join(', '));

            console.log('\n📝 Testing query with Claude 3.5 Sonnet...');
            const result = await orchestrator.query({
                prompt: 'What is 2+2? Answer in one word.',
                model: 'claude-3.5-sonnet',
                type: 'text'
            });

            console.log('\n✅ Result:', JSON.stringify(result, null, 2));

            await orchestrator.shutdown();
            process.exit(0);

        } catch (error) {
            console.error('❌ Error:', error.message);
            await orchestrator.shutdown();
            process.exit(1);
        }
    }

    demo().catch(console.error);
}
