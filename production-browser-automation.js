#!/usr/bin/env node

/**
 * Production Browser Automation for Real-time AI Platform Interactions
 *
 * This module provides production-ready browser automation for interacting with:
 * - LMArena (https://lmarena.ai/?mode=direct)
 * - Claude.ai direct access
 * - ChatGPT web interface
 * - Gemini web interface
 * - Poe.com aggregator
 * - Playground AI for images
 * - VEED.io for videos
 *
 * Features:
 * - Real browser automation with Playwright
 * - Session/cookie management
 * - Response streaming handling
 * - Error recovery and retries
 * - Rate limiting protection
 * - CAPTCHA detection
 * - Multi-format response extraction
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const selectorsConfig = require('./selectors-config.json');

class ProductionBrowserAutomation {
    constructor(config = {}) {
        this.config = {
            headless: config.headless !== false,
            timeout: config.timeout || 60000,
            retryCount: config.retryCount || 3,
            retryDelay: config.retryDelay || 5000,
            screenshotOnError: config.screenshotOnError !== false,
            cookiesDir: config.cookiesDir || './cookies',
            sessionsDir: config.sessionsDir || './sessions',
            screenshotsDir: config.screenshotsDir || './screenshots',
            downloadsDir: config.downloadsDir || './downloads',
            verbose: config.verbose || false,
            ...config
        };

        this.browser = null;
        this.contexts = new Map(); // Platform-specific browser contexts
        this.pages = new Map(); // Platform-specific pages
        this.rateLimiters = new Map(); // Rate limiting trackers
        this.selectorsConfig = selectorsConfig;

        // Response extraction handlers
        this.responseHandlers = {
            text: this.extractTextResponse.bind(this),
            markdown: this.extractMarkdownResponse.bind(this),
            code: this.extractCodeBlocks.bind(this),
            image: this.extractImageResponse.bind(this),
            video: this.extractVideoResponse.bind(this)
        };
    }

    /**
     * Initialize browser and create necessary directories
     */
    async initialize() {
        this.log('Initializing Production Browser Automation...');

        // Create necessary directories
        await this.ensureDirectories();

        // Launch browser with production settings
        this.browser = await chromium.launch({
            headless: this.config.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage'
            ]
        });

        this.log('Browser initialized successfully');
        return true;
    }

    /**
     * Ensure all required directories exist
     */
    async ensureDirectories() {
        const dirs = [
            this.config.cookiesDir,
            this.config.sessionsDir,
            this.config.screenshotsDir,
            this.config.downloadsDir
        ];

        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                this.log(`Warning: Could not create directory ${dir}`, 'warn');
            }
        }
    }

    /**
     * Get or create browser context for a platform
     */
    async getContext(platformName) {
        if (this.contexts.has(platformName)) {
            return this.contexts.get(platformName);
        }

        const platform = this.selectorsConfig.platforms[platformName];
        if (!platform) {
            throw new Error(`Unknown platform: ${platformName}`);
        }

        // Create new context with cookies if available
        const cookiesPath = path.join(this.config.cookiesDir, `${platformName}.json`);
        let cookies = [];

        try {
            const cookiesData = await fs.readFile(cookiesPath, 'utf8');
            cookies = JSON.parse(cookiesData);
            this.log(`Loaded ${cookies.length} cookies for ${platformName}`);
        } catch (error) {
            this.log(`No saved cookies for ${platformName}`);
        }

        const context = await this.browser.newContext({
            viewport: this.selectorsConfig.globalSettings.viewport,
            userAgent: this.selectorsConfig.globalSettings.userAgent,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            permissions: ['clipboard-read', 'clipboard-write'],
            acceptDownloads: true,
            storageState: cookies.length > 0 ? { cookies } : undefined
        });

        // Add request/response logging for debugging
        context.on('request', request => {
            if (this.config.verbose) {
                this.log(`→ ${request.method()} ${request.url()}`);
            }
        });

        context.on('response', response => {
            if (this.config.verbose && !response.ok()) {
                this.log(`← ${response.status()} ${response.url()}`, 'warn');
            }
        });

        this.contexts.set(platformName, context);
        return context;
    }

    /**
     * Get or create page for a platform
     */
    async getPage(platformName) {
        if (this.pages.has(platformName)) {
            return this.pages.get(platformName);
        }

        const context = await this.getContext(platformName);
        const page = await context.newPage();

        // Set default timeout
        page.setDefaultTimeout(this.config.timeout);

        // Add console logging
        page.on('console', msg => {
            if (this.config.verbose) {
                this.log(`[Browser Console] ${msg.text()}`);
            }
        });

        // Add error logging
        page.on('pageerror', error => {
            this.log(`[Page Error] ${error.message}`, 'error');
        });

        this.pages.set(platformName, page);
        return page;
    }

    /**
     * Check rate limits for a platform
     */
    async checkRateLimit(platformName) {
        const platform = this.selectorsConfig.platforms[platformName];
        if (!platform.rateLimit) return true;

        const now = Date.now();
        const limiter = this.rateLimiters.get(platformName) || { requests: [], lastRequest: 0 };

        // Remove old requests outside the window
        const windowMs = 60000; // 1 minute window
        limiter.requests = limiter.requests.filter(time => now - time < windowMs);

        // Check if we're at the limit
        if (limiter.requests.length >= platform.rateLimit.requestsPerMinute) {
            const oldestRequest = limiter.requests[0];
            const waitTime = windowMs - (now - oldestRequest);

            if (waitTime > 0) {
                this.log(`Rate limit reached for ${platformName}, waiting ${Math.ceil(waitTime / 1000)}s...`, 'warn');
                await this.sleep(waitTime);
            }
        }

        // Add current request
        limiter.requests.push(now);
        limiter.lastRequest = now;
        this.rateLimiters.set(platformName, limiter);

        return true;
    }

    /**
     * Navigate to platform and wait for it to be ready
     */
    async navigateToPlatform(platformName, page) {
        const platform = this.selectorsConfig.platforms[platformName];
        const waitStrategy = platform.waitStrategies.pageLoad;

        this.log(`Navigating to ${platform.name}...`);

        try {
            await page.goto(platform.url, {
                waitUntil: waitStrategy,
                timeout: this.selectorsConfig.globalSettings.navigationTimeout
            });

            // Additional wait for dynamic content
            await this.sleep(2000);

            // Check for login requirement
            const loginRequired = await this.checkLoginRequired(platformName, page);
            if (loginRequired) {
                throw new Error(`Authentication required for ${platformName}. Please log in manually and save cookies.`);
            }

            // Check for CAPTCHA
            const captchaDetected = await this.checkCaptcha(platformName, page);
            if (captchaDetected) {
                throw new Error(`CAPTCHA detected on ${platformName}. Please solve manually.`);
            }

            this.log(`Successfully navigated to ${platform.name}`);
            return true;
        } catch (error) {
            await this.handleError(platformName, page, error, 'navigation');
            throw error;
        }
    }

    /**
     * Check if login is required
     */
    async checkLoginRequired(platformName, page) {
        const platform = this.selectorsConfig.platforms[platformName];
        if (!platform.selectors.loginRequired) return false;

        for (const selector of platform.selectors.loginRequired) {
            try {
                const element = await page.$(selector);
                if (element) {
                    this.log(`Login required detected: ${selector}`, 'warn');
                    return true;
                }
            } catch (error) {
                // Continue checking
            }
        }

        return false;
    }

    /**
     * Check for CAPTCHA
     */
    async checkCaptcha(platformName, page) {
        const platform = this.selectorsConfig.platforms[platformName];
        if (!platform.selectors.captcha) return false;

        for (const selector of platform.selectors.captcha) {
            try {
                const element = await page.$(selector);
                if (element) {
                    this.log(`CAPTCHA detected: ${selector}`, 'warn');
                    return true;
                }
            } catch (error) {
                // Continue checking
            }
        }

        // Check global CAPTCHA patterns
        const pageContent = await page.content();
        const captchaPatterns = this.selectorsConfig.errorPatterns.captcha;

        for (const pattern of captchaPatterns) {
            if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
                this.log(`CAPTCHA pattern detected: ${pattern}`, 'warn');
                return true;
            }
        }

        return false;
    }

    /**
     * Find element using multiple selector strategies
     */
    async findElement(page, selectors, timeout = 10000) {
        for (const selector of selectors) {
            try {
                const element = await page.waitForSelector(selector, {
                    timeout: timeout,
                    state: 'visible'
                });

                if (element) {
                    this.log(`Found element: ${selector}`);
                    return element;
                }
            } catch (error) {
                // Try next selector
                continue;
            }
        }

        throw new Error(`Could not find element with any of the provided selectors`);
    }

    /**
     * Send prompt to a platform
     */
    async sendPrompt(platformName, prompt, options = {}) {
        const startTime = Date.now();
        this.log(`\n=== Sending prompt to ${platformName} ===`);
        this.log(`Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);

        // Check rate limits
        await this.checkRateLimit(platformName);

        const platform = this.selectorsConfig.platforms[platformName];
        const page = await this.getPage(platformName);

        try {
            // Navigate to platform
            await this.navigateToPlatform(platformName, page);

            // Find and fill prompt input
            const inputElement = await this.findElement(
                page,
                platform.selectors.promptInput,
                10000
            );

            // Clear existing content
            await inputElement.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Backspace');

            // Type prompt with human-like delay
            await inputElement.type(prompt, {
                delay: platform.waitStrategies.typingDelay
            });

            this.log('Prompt entered, submitting...');

            // Find and click submit button
            const submitButton = await this.findElement(
                page,
                platform.selectors.submitButton,
                5000
            );

            await submitButton.click();
            this.log('Prompt submitted, waiting for response...');

            // Wait for and extract response
            const response = await this.waitForResponse(platformName, page, options);

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            this.log(`✓ Response received in ${duration}s`);

            return {
                platform: platformName,
                platformName: platform.name,
                prompt: prompt,
                response: response,
                duration: duration,
                timestamp: new Date().toISOString(),
                success: true
            };

        } catch (error) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            this.log(`✗ Failed after ${duration}s: ${error.message}`, 'error');

            await this.handleError(platformName, page, error, 'sendPrompt');

            return {
                platform: platformName,
                platformName: platform.name,
                prompt: prompt,
                error: error.message,
                duration: duration,
                timestamp: new Date().toISOString(),
                success: false
            };
        }
    }

    /**
     * Wait for response with streaming support
     */
    async waitForResponse(platformName, page, options = {}) {
        const platform = this.selectorsConfig.platforms[platformName];
        const timeout = options.timeout || platform.waitStrategies.responseTimeout;
        const startTime = Date.now();

        // Wait for response container to appear
        await this.sleep(2000); // Initial wait for streaming to start

        let lastContent = '';
        let stableCount = 0;
        const requiredStableChecks = 3;

        while (Date.now() - startTime < timeout) {
            try {
                // Try to find response container
                const responseElement = await this.findElement(
                    page,
                    platform.selectors.responseContainer,
                    5000
                );

                if (responseElement) {
                    const currentContent = await responseElement.textContent();

                    // Check if content is stable (not streaming anymore)
                    if (currentContent === lastContent && currentContent.trim().length > 0) {
                        stableCount++;

                        if (stableCount >= requiredStableChecks) {
                            this.log('Response stream completed');

                            // Extract formatted response
                            return await this.extractResponse(platformName, responseElement, options);
                        }
                    } else {
                        stableCount = 0;
                        lastContent = currentContent;

                        if (this.config.verbose) {
                            this.log(`Streaming... (${currentContent.length} chars)`);
                        }
                    }
                }

                // Check for streaming indicator
                const isStreaming = await this.isStreaming(platformName, page);
                if (isStreaming) {
                    stableCount = 0; // Reset if still streaming
                }

                await this.sleep(1000); // Wait before next check

            } catch (error) {
                this.log(`Error waiting for response: ${error.message}`, 'warn');
                await this.sleep(1000);
            }
        }

        throw new Error(`Response timeout after ${timeout}ms`);
    }

    /**
     * Check if response is still streaming
     */
    async isStreaming(platformName, page) {
        const platform = this.selectorsConfig.platforms[platformName];
        if (!platform.selectors.streamingIndicator) return false;

        for (const selector of platform.selectors.streamingIndicator) {
            try {
                const element = await page.$(selector);
                if (element && await element.isVisible()) {
                    return true;
                }
            } catch (error) {
                // Continue checking
            }
        }

        return false;
    }

    /**
     * Extract response based on platform and options
     */
    async extractResponse(platformName, element, options = {}) {
        const responseType = options.responseType || 'text';
        const handler = this.responseHandlers[responseType];

        if (!handler) {
            this.log(`Unknown response type: ${responseType}, using text`, 'warn');
            return await this.extractTextResponse(element);
        }

        return await handler(element, options);
    }

    /**
     * Extract plain text response
     */
    async extractTextResponse(element) {
        const text = await element.textContent();
        return this.cleanText(text);
    }

    /**
     * Extract markdown formatted response
     */
    async extractMarkdownResponse(element) {
        const html = await element.innerHTML();

        // Convert HTML to markdown (basic conversion)
        let markdown = html
            // Code blocks
            .replace(/<pre><code[^>]*>(.*?)<\/code><\/pre>/gs, '```\n$1\n```')
            // Inline code
            .replace(/<code[^>]*>(.*?)<\/code>/g, '`$1`')
            // Headers
            .replace(/<h1[^>]*>(.*?)<\/h1>/g, '# $1\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/g, '## $1\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/g, '### $1\n')
            // Bold
            .replace(/<strong[^>]*>(.*?)<\/strong>/g, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/g, '**$1**')
            // Italic
            .replace(/<em[^>]*>(.*?)<\/em>/g, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/g, '*$1*')
            // Lists
            .replace(/<li[^>]*>(.*?)<\/li>/g, '- $1\n')
            // Paragraphs
            .replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n\n')
            // Links
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)')
            // Remove remaining HTML tags
            .replace(/<[^>]+>/g, '');

        return this.cleanText(markdown);
    }

    /**
     * Extract code blocks from response
     */
    async extractCodeBlocks(element) {
        const codeBlocks = await element.$$('pre code, code');
        const blocks = [];

        for (const block of codeBlocks) {
            const code = await block.textContent();
            const language = await block.getAttribute('class');

            blocks.push({
                code: code.trim(),
                language: language ? language.replace('language-', '') : 'text'
            });
        }

        return blocks;
    }

    /**
     * Extract image response (for image generation platforms)
     */
    async extractImageResponse(element, options = {}) {
        const images = await element.$$('img');
        const imageData = [];

        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const src = await img.getAttribute('src');
            const alt = await img.getAttribute('alt');

            if (src && !src.startsWith('data:')) {
                imageData.push({
                    url: src,
                    alt: alt || `Image ${i + 1}`,
                    index: i
                });

                // Download image if requested
                if (options.download) {
                    try {
                        const filename = `${Date.now()}_${i}.png`;
                        const filepath = path.join(this.config.downloadsDir, filename);

                        const response = await element.page().goto(src);
                        const buffer = await response.buffer();
                        await fs.writeFile(filepath, buffer);

                        imageData[i].localPath = filepath;
                        this.log(`Image downloaded: ${filepath}`);
                    } catch (error) {
                        this.log(`Failed to download image: ${error.message}`, 'warn');
                    }
                }
            }
        }

        return imageData;
    }

    /**
     * Extract video response (for video generation platforms)
     */
    async extractVideoResponse(element, options = {}) {
        const videos = await element.$$('video');
        const videoData = [];

        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const src = await video.getAttribute('src');
            const poster = await video.getAttribute('poster');

            if (src) {
                videoData.push({
                    url: src,
                    poster: poster,
                    index: i
                });

                // Download video if requested
                if (options.download) {
                    try {
                        const filename = `${Date.now()}_${i}.mp4`;
                        const filepath = path.join(this.config.downloadsDir, filename);

                        const response = await element.page().goto(src);
                        const buffer = await response.buffer();
                        await fs.writeFile(filepath, buffer);

                        videoData[i].localPath = filepath;
                        this.log(`Video downloaded: ${filepath}`);
                    } catch (error) {
                        this.log(`Failed to download video: ${error.message}`, 'warn');
                    }
                }
            }
        }

        return videoData;
    }

    /**
     * Clean and normalize text
     */
    cleanText(text) {
        return text
            .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
            .replace(/[ \t]+/g, ' ') // Normalize spaces
            .trim();
    }

    /**
     * Handle errors with screenshots and logging
     */
    async handleError(platformName, page, error, context) {
        this.log(`Error in ${context} for ${platformName}: ${error.message}`, 'error');

        if (this.config.screenshotOnError && page) {
            try {
                const filename = `error_${platformName}_${Date.now()}.png`;
                const filepath = path.join(this.config.screenshotsDir, filename);
                await page.screenshot({ path: filepath, fullPage: true });
                this.log(`Error screenshot saved: ${filepath}`);
            } catch (screenshotError) {
                this.log(`Failed to save screenshot: ${screenshotError.message}`, 'warn');
            }
        }

        // Check for specific error patterns
        const pageContent = await page.content().catch(() => '');

        for (const [errorType, patterns] of Object.entries(this.selectorsConfig.errorPatterns)) {
            for (const pattern of patterns) {
                if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
                    this.log(`Detected ${errorType} error: ${pattern}`, 'warn');
                    error.errorType = errorType;
                    break;
                }
            }
        }
    }

    /**
     * Save cookies for a platform
     */
    async saveCookies(platformName) {
        const context = this.contexts.get(platformName);
        if (!context) return;

        try {
            const cookies = await context.cookies();
            const cookiesPath = path.join(this.config.cookiesDir, `${platformName}.json`);
            await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
            this.log(`Saved ${cookies.length} cookies for ${platformName}`);
        } catch (error) {
            this.log(`Failed to save cookies: ${error.message}`, 'warn');
        }
    }

    /**
     * Query multiple platforms in parallel
     */
    async queryMultiplePlatforms(platforms, prompt, options = {}) {
        this.log(`\n=== Querying ${platforms.length} platforms in parallel ===`);

        const promises = platforms.map(platformName =>
            this.sendPrompt(platformName, prompt, options)
                .catch(error => ({
                    platform: platformName,
                    error: error.message,
                    success: false
                }))
        );

        const results = await Promise.all(promises);

        // Summary
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        this.log(`\n=== Results Summary ===`);
        this.log(`✓ Successful: ${successful.length}`);
        this.log(`✗ Failed: ${failed.length}`);

        if (successful.length > 0) {
            const avgDuration = successful.reduce((sum, r) => sum + parseFloat(r.duration), 0) / successful.length;
            this.log(`⏱ Average duration: ${avgDuration.toFixed(2)}s`);
        }

        return results;
    }

    /**
     * Cleanup and close browser
     */
    async cleanup() {
        this.log('Cleaning up...');

        // Save all cookies
        for (const [platformName] of this.contexts) {
            await this.saveCookies(platformName);
        }

        // Close all pages
        for (const [name, page] of this.pages) {
            try {
                await page.close();
            } catch (error) {
                this.log(`Failed to close page ${name}: ${error.message}`, 'warn');
            }
        }

        // Close all contexts
        for (const [name, context] of this.contexts) {
            try {
                await context.close();
            } catch (error) {
                this.log(`Failed to close context ${name}: ${error.message}`, 'warn');
            }
        }

        // Close browser
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
        const timestamp = new Date().toISOString();
        const prefix = {
            info: '[INFO]',
            warn: '[WARN]',
            error: '[ERROR]'
        }[level] || '[INFO]';

        console.log(`${timestamp} ${prefix} ${message}`);
    }
}

// Export
module.exports = { ProductionBrowserAutomation };

// Demo usage
if (require.main === module) {
    async function demo() {
        const automation = new ProductionBrowserAutomation({
            headless: false, // Set to true for production
            verbose: true,
            screenshotOnError: true
        });

        try {
            await automation.initialize();

            // Example 1: Single platform query
            console.log('\n========================================');
            console.log('Example 1: Query Claude.ai');
            console.log('========================================');

            const claudeResult = await automation.sendPrompt(
                'claude',
                'Write a haiku about artificial intelligence',
                { responseType: 'markdown' }
            );

            if (claudeResult.success) {
                console.log('\nResponse from Claude:');
                console.log(claudeResult.response);
            }

            // Example 2: Parallel queries to multiple platforms
            console.log('\n========================================');
            console.log('Example 2: Query Multiple Platforms');
            console.log('========================================');

            const results = await automation.queryMultiplePlatforms(
                ['lmarena', 'claude', 'chatgpt'],
                'Explain quantum computing in one sentence',
                { responseType: 'text' }
            );

            results.forEach(result => {
                if (result.success) {
                    console.log(`\n${result.platformName}:`);
                    console.log(result.response.substring(0, 200) + '...');
                }
            });

            // Example 3: Image generation
            console.log('\n========================================');
            console.log('Example 3: Generate Image');
            console.log('========================================');

            const imageResult = await automation.sendPrompt(
                'playground',
                'A futuristic cityscape at sunset with flying cars',
                {
                    responseType: 'image',
                    download: true
                }
            );

            if (imageResult.success && imageResult.response.length > 0) {
                console.log(`\nGenerated ${imageResult.response.length} images:`);
                imageResult.response.forEach(img => {
                    console.log(`- ${img.url}`);
                    if (img.localPath) {
                        console.log(`  Downloaded to: ${img.localPath}`);
                    }
                });
            }

            await automation.cleanup();

        } catch (error) {
            console.error('Demo error:', error);
            await automation.cleanup();
            process.exit(1);
        }
    }

    demo().catch(console.error);
}
