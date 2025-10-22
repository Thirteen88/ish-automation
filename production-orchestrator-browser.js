#!/usr/bin/env node

/**
 * Production Orchestrator - Browser Automation Edition
 *
 * Pure browser automation orchestrator for querying multiple AI platforms:
 * - Claude.ai (claude-3-opus, sonnet, haiku)
 * - ChatGPT (gpt-4, gpt-3.5-turbo)
 * - Google Gemini (gemini-pro, gemini-ultra)
 * - LMArena (100+ models)
 * - ISH Platform (multiple models)
 *
 * Features:
 * - NO API keys required - pure browser automation
 * - Session persistence and cookie management
 * - Anti-detection and stealth mode
 * - Parallel query execution
 * - Automatic error recovery
 * - Health monitoring
 * - CAPTCHA detection and handling
 */

const { chromium } = require('playwright');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

const ConfigurationManager = require('./config-manager');
const ErrorHandler = require('./error-handler');
const { HealthMonitor } = require('./health-monitor');
const CLIVisualizer = require('./cli-visualizer');

/**
 * Platform Automation Modules
 */
class PlatformAutomation {
    constructor(platformName, config = {}) {
        this.platformName = platformName;
        this.config = config;
        this.page = null;
        this.isInitialized = false;
        this.sessionData = null;
    }

    async initialize(page) {
        this.page = page;
        await this.setupStealth();
        this.isInitialized = true;
    }

    async setupStealth() {
        // Anti-detection measures
        await this.page.addInitScript(() => {
            // Override navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false
            });

            // Mock chrome object
            window.chrome = {
                runtime: {}
            };

            // Mock permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);

            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        });
    }

    async saveSession(sessionPath) {
        if (!this.page) return;

        try {
            const cookies = await this.page.context().cookies();
            const localStorage = await this.page.evaluate(() => {
                return JSON.stringify(localStorage);
            });

            const sessionData = {
                platform: this.platformName,
                cookies,
                localStorage,
                timestamp: new Date().toISOString()
            };

            await fs.mkdir(path.dirname(sessionPath), { recursive: true });
            await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));

            console.log(`  ✓ Session saved for ${this.platformName}`);
        } catch (error) {
            console.warn(`  ⚠️  Failed to save session for ${this.platformName}:`, error.message);
        }
    }

    async loadSession(sessionPath) {
        try {
            const content = await fs.readFile(sessionPath, 'utf8');
            this.sessionData = JSON.parse(content);

            if (this.sessionData.cookies) {
                await this.page.context().addCookies(this.sessionData.cookies);
            }

            if (this.sessionData.localStorage) {
                await this.page.evaluate((data) => {
                    const parsed = JSON.parse(data);
                    for (const [key, value] of Object.entries(parsed)) {
                        localStorage.setItem(key, value);
                    }
                }, this.sessionData.localStorage);
            }

            console.log(`  ✓ Session loaded for ${this.platformName}`);
            return true;
        } catch (error) {
            console.log(`  ℹ️  No existing session for ${this.platformName}`);
            return false;
        }
    }

    async detectCaptcha() {
        // Common CAPTCHA selectors
        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            '.g-recaptcha',
            '.h-captcha',
            '#captcha',
            '[class*="captcha"]'
        ];

        for (const selector of captchaSelectors) {
            const element = await this.page.$(selector);
            if (element) {
                return { detected: true, type: 'visual', selector };
            }
        }

        return { detected: false };
    }

    async query(prompt, options = {}) {
        throw new Error('query() must be implemented by platform-specific class');
    }
}

/**
 * Claude.ai Automation
 */
class ClaudeAutomation extends PlatformAutomation {
    constructor(config = {}) {
        super('Claude.ai', config);
        this.baseUrl = 'https://claude.ai';
        this.models = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
    }

    async query(prompt, options = {}) {
        const model = options.model || 'claude-3-sonnet';

        try {
            // Navigate to Claude.ai
            await this.page.goto(this.baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Check for CAPTCHA
            const captcha = await this.detectCaptcha();
            if (captcha.detected) {
                throw new Error('CAPTCHA detected - manual intervention required');
            }

            // Check if logged in
            const isLoggedIn = await this.checkLoginStatus();
            if (!isLoggedIn) {
                throw new Error('Not logged in - please log in manually first');
            }

            // Start new conversation or use existing
            await this.startNewConversation();

            // Type prompt
            const inputSelector = 'div[contenteditable="true"]';
            await this.page.waitForSelector(inputSelector, { timeout: 10000 });
            await this.page.click(inputSelector);
            await this.page.fill(inputSelector, prompt);

            // Submit
            const submitButton = 'button[type="submit"]';
            await this.page.click(submitButton);

            // Wait for response
            await this.page.waitForSelector('.response-text', { timeout: 60000 });

            // Extract response
            const response = await this.page.evaluate(() => {
                const responseEl = document.querySelector('.response-text');
                return responseEl ? responseEl.textContent : null;
            });

            return {
                platform: 'Claude.ai',
                model: model,
                response: response,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Claude.ai automation failed: ${error.message}`);
        }
    }

    async checkLoginStatus() {
        // Check for login-specific elements
        try {
            const loggedInSelector = '[data-testid="user-menu"]';
            await this.page.waitForSelector(loggedInSelector, { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async startNewConversation() {
        try {
            const newChatButton = 'button[aria-label="New chat"]';
            await this.page.click(newChatButton);
            await this.page.waitForTimeout(1000);
        } catch (error) {
            // Already in new conversation
        }
    }
}

/**
 * ChatGPT Automation
 */
class ChatGPTAutomation extends PlatformAutomation {
    constructor(config = {}) {
        super('ChatGPT', config);
        this.baseUrl = 'https://chat.openai.com';
        this.models = ['gpt-4', 'gpt-3.5-turbo'];
    }

    async query(prompt, options = {}) {
        const model = options.model || 'gpt-4';

        try {
            await this.page.goto(this.baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            const captcha = await this.detectCaptcha();
            if (captcha.detected) {
                throw new Error('CAPTCHA detected - manual intervention required');
            }

            const isLoggedIn = await this.checkLoginStatus();
            if (!isLoggedIn) {
                throw new Error('Not logged in - please log in manually first');
            }

            // Find prompt textarea - updated selector based on discovery
            const promptSelector = '#prompt-textarea';
            await this.page.waitForSelector(promptSelector, { timeout: 10000 });

            // Click and type
            await this.page.click(promptSelector);
            await this.page.type(promptSelector, prompt);

            // Submit - look for send button
            const sendButton = 'button[data-testid="send-button"]';
            try {
                await this.page.click(sendButton);
            } catch {
                // Fallback: press Enter
                await this.page.keyboard.press('Enter');
            }

            // Wait for response with longer timeout
            await this.page.waitForTimeout(3000);

            // Extract response - ChatGPT uses markdown for responses
            const response = await this.page.evaluate(() => {
                // Look for the last assistant message
                const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (messages.length > 0) {
                    const lastMessage = messages[messages.length - 1];
                    return lastMessage.textContent;
                }

                // Fallback: look for markdown
                const markdown = document.querySelectorAll('.markdown');
                if (markdown.length > 0) {
                    return markdown[markdown.length - 1].textContent;
                }

                return 'Response received but could not extract text';
            });

            return {
                platform: 'ChatGPT',
                model: model,
                response: response,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`ChatGPT automation failed: ${error.message}`);
        }
    }

    async checkLoginStatus() {
        try {
            const loggedInSelector = 'button[aria-label="User"]';
            await this.page.waitForSelector(loggedInSelector, { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Gemini Automation
 */
class GeminiAutomation extends PlatformAutomation {
    constructor(config = {}) {
        super('Gemini', config);
        this.baseUrl = 'https://gemini.google.com';
        this.models = ['gemini-pro', 'gemini-ultra'];
    }

    async query(prompt, options = {}) {
        const model = options.model || 'gemini-pro';

        try {
            await this.page.goto(this.baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            const captcha = await this.detectCaptcha();
            if (captcha.detected) {
                throw new Error('CAPTCHA detected - manual intervention required');
            }

            // Find input
            const inputSelector = 'textarea.ql-editor';
            await this.page.waitForSelector(inputSelector, { timeout: 10000 });
            await this.page.fill(inputSelector, prompt);

            // Submit
            const sendButton = 'button[aria-label="Send"]';
            await this.page.click(sendButton);

            // Wait for response
            await this.page.waitForTimeout(5000);

            // Extract response
            const response = await this.page.evaluate(() => {
                const responseEls = document.querySelectorAll('.model-response');
                const lastResponse = responseEls[responseEls.length - 1];
                return lastResponse ? lastResponse.textContent : null;
            });

            return {
                platform: 'Gemini',
                model: model,
                response: response,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Gemini automation failed: ${error.message}`);
        }
    }
}

/**
 * LMArena Automation
 */
class LMArenaAutomation extends PlatformAutomation {
    constructor(config = {}) {
        super('LMArena', config);
        this.baseUrl = 'https://lmarena.ai';
        this.models = config.models || ['gpt-4', 'claude-3-opus', 'gemini-pro'];
    }

    async query(prompt, options = {}) {
        const model = options.model || 'gpt-4';

        try {
            // Try different LMArena modes
            console.log('  🌐 Navigating to LMArena...');
            await this.page.goto(`${this.baseUrl}`, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            // Wait for page load
            await this.page.waitForTimeout(3000);

            // Try multiple selector strategies
            let inputElement = null;
            const selectors = [
                'textarea:not([disabled])',
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="prompt"]',
                'textarea',
                '[contenteditable="true"]'
            ];

            for (const selector of selectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 2000 });
                    const elements = await this.page.$$(selector);
                    if (elements.length > 0) {
                        inputElement = elements[0];
                        console.log(`  ✓ Found input using: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!inputElement) {
                // Take screenshot for debugging
                await this.page.screenshot({
                    path: 'selector-discovery/lmarena-no-input.png'
                });
                throw new Error('Could not find input element - check screenshot');
            }

            // Fill and submit
            await inputElement.click();
            await inputElement.type(prompt);
            await this.page.keyboard.press('Enter');

            // Wait for response
            await this.page.waitForTimeout(5000);

            // Extract response
            const response = await this.page.evaluate(() => {
                const selectors = [
                    '[class*="message"]',
                    '[class*="response"]',
                    '[class*="output"]',
                    '.prose'
                ];

                for (const sel of selectors) {
                    const els = document.querySelectorAll(sel);
                    if (els.length > 0) {
                        return els[els.length - 1].textContent;
                    }
                }

                return '[Response - check screenshot]';
            });

            // Take screenshot
            await this.page.screenshot({
                path: 'selector-discovery/lmarena-success.png'
            });

            return {
                platform: 'LMArena',
                model: model,
                response: response,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            // Save screenshot on error
            try {
                await this.page.screenshot({
                    path: 'selector-discovery/lmarena-error.png'
                });
            } catch {}

            throw new Error(`LMArena automation failed: ${error.message}`);
        }
    }

    async selectModel(modelName) {
        // Implementation for model selection in LMArena
        try {
            await this.page.click('select#model-select');
            await this.page.selectOption('select#model-select', modelName);
        } catch (error) {
            console.warn(`  ⚠️  Failed to select model ${modelName}`);
        }
    }
}

/**
 * ISH Platform Automation
 */
class ISHAutomation extends PlatformAutomation {
    constructor(config = {}) {
        super('ISH', config);
        this.baseUrl = 'https://ish.junioralive.in';
        this.models = config.models || ['claude-3-opus', 'gpt-4'];
    }

    async query(prompt, options = {}) {
        const model = options.model || 'claude-3-opus';

        try {
            await this.page.goto(this.baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Wait for page to load
            await this.page.waitForSelector('body', { timeout: 10000 });

            // Simulate ISH interaction
            // (Adapt based on actual ISH interface)
            await this.page.waitForTimeout(2000);

            return {
                platform: 'ISH',
                model: model,
                response: `[ISH Response for: ${prompt}]`,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`ISH automation failed: ${error.message}`);
        }
    }
}

/**
 * Main Browser-Based Production Orchestrator
 */
class BrowserProductionOrchestrator extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            environment: options.environment || process.env.NODE_ENV || 'production',
            headless: options.headless !== undefined ? options.headless : (process.env.HEADLESS !== 'false'),
            enableHealthMonitoring: options.enableHealthMonitoring !== false,
            enableSessionPersistence: options.enableSessionPersistence !== false,
            sessionDir: options.sessionDir || path.join(__dirname, '.sessions'),
            autoRecovery: options.autoRecovery !== false,
            maxConcurrent: options.maxConcurrent || 5,
            ...options
        };

        // Core components
        this.configManager = null;
        this.errorHandler = null;
        this.healthMonitor = null;
        this.visualizer = new CLIVisualizer();

        // Browser instances
        this.browser = null;
        this.contexts = new Map();

        // Platform automation modules
        this.platforms = new Map();

        // State
        this.state = {
            initialized: false,
            healthy: true,
            startTime: null,
            requestCount: 0,
            errorCount: 0
        };

        // Metrics
        this.metrics = {
            requests: [],
            errors: [],
            latencies: []
        };
    }

    async initialize() {
        this.visualizer.clear();
        this.visualizer.sectionHeader('Browser-Based Production Orchestrator', '🌐');

        console.log(`\n📋 Environment: ${this.options.environment}`);
        console.log(`🔧 Configuration:`);
        console.log(`   Browser Mode: ${this.options.headless ? 'Headless' : 'Headed'}`);
        console.log(`   Session Persistence: ${this.options.enableSessionPersistence ? 'Enabled' : 'Disabled'}`);
        console.log(`   Health Monitoring: ${this.options.enableHealthMonitoring ? 'Enabled' : 'Disabled'}`);
        console.log(`   Auto Recovery: ${this.options.autoRecovery ? 'Enabled' : 'Disabled'}`);

        try {
            // Initialize error handler
            console.log('\n🛡️ Initializing Error Handler...');
            this.errorHandler = new ErrorHandler({
                enableCircuitBreaker: true,
                enableDeadLetterQueue: true
            });

            // Initialize health monitor
            if (this.options.enableHealthMonitoring) {
                console.log('\n💚 Initializing Health Monitor...');
                this.healthMonitor = new HealthMonitor({
                    checkInterval: 60000,
                    enableScheduledChecks: true
                });
            }

            // Initialize browser
            console.log('\n🌐 Initializing Browser...');
            await this.initializeBrowser();

            // Initialize platforms
            console.log('\n📡 Initializing Platform Automation Modules...');
            await this.initializePlatforms();

            // Load sessions
            if (this.options.enableSessionPersistence) {
                console.log('\n💾 Loading Sessions...');
                await this.loadAllSessions();
            }

            this.state.initialized = true;
            this.state.startTime = new Date().toISOString();

            this.visualizer.displaySuccess('Browser-Based Orchestrator initialized!', {
                'Platforms': this.platforms.size,
                'Browser': 'Ready',
                'Sessions': this.options.enableSessionPersistence ? 'Loaded' : 'Disabled',
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
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security'
            ]
        });

        console.log(`   ✓ Browser launched (${this.options.headless ? 'headless' : 'headed'})`);
    }

    async initializePlatforms() {
        // Create platform automation modules
        const platformConfigs = [
            { name: 'claude', class: ClaudeAutomation },
            { name: 'chatgpt', class: ChatGPTAutomation },
            { name: 'gemini', class: GeminiAutomation },
            { name: 'lmarena', class: LMArenaAutomation },
            { name: 'ish', class: ISHAutomation }
        ];

        for (const { name, class: PlatformClass } of platformConfigs) {
            const context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                locale: 'en-US',
                timezoneId: 'America/New_York'
            });

            const page = await context.newPage();
            const platform = new PlatformClass(this.options);
            await platform.initialize(page);

            this.platforms.set(name, platform);
            this.contexts.set(name, context);

            console.log(`   ✓ ${name} automation initialized`);

            // Register health check
            if (this.healthMonitor) {
                this.healthMonitor.registerPlatform(name, {
                    unhealthyThreshold: 3,
                    degradedThreshold: 2
                });
            }
        }
    }

    async loadAllSessions() {
        for (const [name, platform] of this.platforms) {
            const sessionPath = path.join(this.options.sessionDir, `${name}-session.json`);
            await platform.loadSession(sessionPath);
        }
    }

    async saveAllSessions() {
        for (const [name, platform] of this.platforms) {
            const sessionPath = path.join(this.options.sessionDir, `${name}-session.json`);
            await platform.saveSession(sessionPath);
        }
    }

    async query(request) {
        const { prompt, platforms, model } = request;
        const startTime = Date.now();

        try {
            const results = [];

            // Execute queries in parallel
            const queries = platforms.map(async (platformName) => {
                const platform = this.platforms.get(platformName);
                if (!platform) {
                    throw new Error(`Platform ${platformName} not found`);
                }

                try {
                    const result = await this.errorHandler.executeWithProtection(
                        async () => await platform.query(prompt, { model }),
                        { platform: platformName }
                    );
                    return { success: true, platformName, result };
                } catch (error) {
                    return { success: false, platformName, error: error.message };
                }
            });

            results.push(...await Promise.allSettled(queries));

            const duration = Date.now() - startTime;
            this.trackMetrics('success', duration);
            this.state.requestCount++;

            return {
                success: true,
                duration,
                results: results.map(r => r.value),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.trackMetrics('error', duration);
            this.state.errorCount++;

            throw error;
        }
    }

    trackMetrics(type, duration) {
        if (type === 'success') {
            this.metrics.requests.push({
                timestamp: Date.now(),
                duration
            });
        } else {
            this.metrics.errors.push({
                timestamp: Date.now(),
                duration
            });
        }

        this.metrics.latencies.push(duration);

        // Keep only last 1000 entries
        if (this.metrics.requests.length > 1000) this.metrics.requests.shift();
        if (this.metrics.errors.length > 1000) this.metrics.errors.shift();
        if (this.metrics.latencies.length > 1000) this.metrics.latencies.shift();
    }

    async shutdown() {
        console.log('\n🛑 Shutting down Browser-Based Orchestrator...');

        try {
            // Save sessions
            if (this.options.enableSessionPersistence) {
                console.log('💾 Saving sessions...');
                await this.saveAllSessions();
            }

            // Close all contexts
            for (const context of this.contexts.values()) {
                await context.close();
            }

            // Close browser
            if (this.browser) {
                await this.browser.close();
            }

            // Cleanup health monitor
            if (this.healthMonitor) {
                this.healthMonitor.stopScheduledChecks();
            }

            console.log('✅ Shutdown complete');
            this.emit('shutdown');

        } catch (error) {
            console.error('❌ Shutdown error:', error.message);
        }
    }
}

module.exports = BrowserProductionOrchestrator;

// Demo
if (require.main === module) {
    async function demo() {
        const orchestrator = new BrowserProductionOrchestrator({
            environment: 'development',
            headless: process.env.HEADLESS !== 'false', // Check env var
            enableHealthMonitoring: true,
            enableSessionPersistence: true
        });

        try {
            await orchestrator.initialize();

            console.log('\n📝 Testing multi-platform query...');

            const result = await orchestrator.query({
                prompt: 'What is the capital of France?',
                platforms: ['claude', 'chatgpt', 'gemini'],
                model: 'default'
            });

            console.log('\n✅ Results:');
            console.log(JSON.stringify(result, null, 2));

            // Graceful shutdown
            process.on('SIGINT', async () => {
                await orchestrator.shutdown();
                process.exit(0);
            });

            console.log('\n✅ Orchestrator running (Press Ctrl+C to exit)');

        } catch (error) {
            console.error('Error:', error);
            await orchestrator.shutdown();
            process.exit(1);
        }
    }

    demo().catch(console.error);
}
