# Quick Reference Guide - Production Browser Automation

## Quick Start Commands

```bash
# Install dependencies
npm install playwright
npx playwright install chromium

# Run comprehensive tests
node test-browser-automation.js

# Run integration examples
node enhanced-orchestrator-example.js

# Run individual platform tests
node production-browser-automation.js
```

## File Overview

| File | Purpose |
|------|---------|
| `production-browser-automation.js` | Main browser automation engine |
| `selectors-config.json` | Platform-specific CSS/XPath selectors |
| `session-manager.js` | Session, cache, and rate limit management |
| `enhanced-orchestrator-example.js` | Complete integration example |
| `test-browser-automation.js` | Comprehensive test suite |
| `BROWSER_AUTOMATION_README.md` | Full documentation |

## Common Use Cases

### 1. Query Single Platform

```javascript
const { ProductionBrowserAutomation } = require('./production-browser-automation');

const automation = new ProductionBrowserAutomation({ headless: true });
await automation.initialize();

const result = await automation.sendPrompt(
    'claude',
    'Your prompt here'
);

console.log(result.response);
await automation.cleanup();
```

### 2. Query Multiple Platforms in Parallel

```javascript
const results = await automation.queryMultiplePlatforms(
    ['claude', 'chatgpt', 'gemini'],
    'Your prompt here'
);

results.forEach(r => {
    if (r.success) {
        console.log(`${r.platformName}: ${r.response}`);
    }
});
```

### 3. With Caching and Session Management

```javascript
const { EnhancedAIOrchestrator } = require('./enhanced-orchestrator-example');

const orchestrator = new EnhancedAIOrchestrator({
    headless: true,
    cacheEnabled: true
});

await orchestrator.initialize();

// First query - fetches from platform
const result1 = await orchestrator.sendPrompt('claude', 'Hello');

// Second query - served from cache
const result2 = await orchestrator.sendPrompt('claude', 'Hello');

await orchestrator.cleanup();
```

### 4. Batch Processing

```javascript
const { EnhancedAIOrchestrator } = require('./enhanced-orchestrator-example');

const orchestrator = new EnhancedAIOrchestrator();
await orchestrator.initialize();

const tasks = [
    { platform: 'claude', prompt: 'Question 1' },
    { platform: 'chatgpt', prompt: 'Question 2' },
    { platform: 'gemini', prompt: 'Question 3' }
];

const results = await orchestrator.processBatch(tasks, {
    concurrency: 2
});

await orchestrator.cleanup();
```

## Platform Codes

| Code | Platform | URL |
|------|----------|-----|
| `claude` | Claude.ai | https://claude.ai |
| `chatgpt` | ChatGPT | https://chat.openai.com |
| `gemini` | Gemini | https://gemini.google.com |
| `lmarena` | LMArena | https://lmarena.ai/?mode=direct |
| `poe` | Poe.com | https://poe.com |
| `playground` | Playground AI | https://playground.com |
| `veed` | VEED.io | https://veed.io |

## Response Types

```javascript
// Text extraction
{ responseType: 'text' }

// Markdown formatting
{ responseType: 'markdown' }

// Code blocks only
{ responseType: 'code' }

// Image URLs and download
{ responseType: 'image', download: true }

// Video URLs and download
{ responseType: 'video', download: true }
```

## Configuration Options

```javascript
new ProductionBrowserAutomation({
    headless: true,              // Run in headless mode
    verbose: false,              // Detailed logging
    timeout: 60000,              // Default timeout (ms)
    retryCount: 3,               // Retry attempts
    retryDelay: 5000,            // Retry delay (ms)
    screenshotOnError: true,     // Capture errors
    cookiesDir: './cookies',     // Cookie storage
    screenshotsDir: './screenshots'
})
```

## Authentication Setup

```bash
# First run - manual login
node -e "
const { ProductionBrowserAutomation } = require('./production-browser-automation');
(async () => {
    const automation = new ProductionBrowserAutomation({ headless: false });
    await automation.initialize();
    await automation.sendPrompt('claude', 'test');
    await automation.cleanup();
})()
"

# Cookies are saved automatically
# Subsequent runs use saved cookies
```

## Troubleshooting

### Update Selectors

1. Edit `selectors-config.json`
2. Find platform section
3. Update selectors array
4. Add multiple fallback selectors

```json
{
  "platforms": {
    "claude": {
      "selectors": {
        "promptInput": [
          "div[contenteditable='true']",
          "div.ProseMirror",
          "textarea.prompt-input"
        ]
      }
    }
  }
}
```

### Clear Cache and Cookies

```bash
rm -rf ./cookies/*
rm -rf ./cache/*
rm -rf ./sessions/*
```

### Handle Rate Limits

```javascript
// Automatic rate limiting
const orchestrator = new EnhancedAIOrchestrator();
await orchestrator.initialize();

// Will automatically wait if rate limited
const result = await orchestrator.sendPrompt('claude', 'prompt');
```

### Debug with Screenshots

```javascript
const automation = new ProductionBrowserAutomation({
    headless: false,
    verbose: true,
    screenshotOnError: true
});

// Screenshots saved to ./screenshots on errors
```

## Analytics

```javascript
const orchestrator = new EnhancedAIOrchestrator();
await orchestrator.initialize();

// ... make some requests ...

const analytics = orchestrator.getAnalytics();
console.log(analytics);

/*
{
  summary: {
    totalRequests: 10,
    successful: 8,
    failed: 2,
    successRate: '80.0%',
    avgDuration: '3.45s'
  },
  platforms: {
    claude: { ... },
    chatgpt: { ... }
  }
}
*/
```

## Rate Limit Status

```javascript
const status = orchestrator.getRateLimitStatus();
console.log(status);

/*
{
  claude: {
    requestsInWindow: 3,
    maxRequests: 5,
    utilizationPercent: '60.0%',
    blocked: false
  }
}
*/
```

## Error Handling

```javascript
try {
    const result = await automation.sendPrompt('claude', 'prompt');

    if (result.success) {
        console.log(result.response);
    } else {
        console.error(result.error);

        // Check error type
        if (result.errorType === 'captcha') {
            // Handle CAPTCHA
        } else if (result.errorType === 'authentication') {
            // Re-authenticate
        } else if (result.errorType === 'rate_limit') {
            // Wait and retry
        }
    }
} catch (error) {
    console.error('Fatal error:', error);
}
```

## Performance Optimization

```javascript
// 1. Enable caching
const orchestrator = new EnhancedAIOrchestrator({
    cacheEnabled: true,
    cacheTTL: 3600000  // 1 hour
});

// 2. Use parallel queries
const results = await orchestrator.queryMultiplePlatforms(
    ['claude', 'chatgpt'],
    'prompt'
);

// 3. Batch processing
const results = await orchestrator.processBatch(tasks, {
    concurrency: 3
});

// 4. Reuse browser context
// (automatically handled)
```

## Integration with Existing Code

```javascript
// With MultiModalOrchestrator
const { MultiModalOrchestrator } = require('./multi-modal-orchestrator');
const { ProductionBrowserAutomation } = require('./production-browser-automation');

class Enhanced extends MultiModalOrchestrator {
    constructor(config) {
        super(config);
        this.browser = new ProductionBrowserAutomation(config);
    }

    async queryPlatform(platform, prompt) {
        return await this.browser.sendPrompt(
            platform.name.toLowerCase(),
            prompt
        );
    }
}
```

## Best Practices

1. ✅ Start with `headless: false` during development
2. ✅ Use caching for repeated queries
3. ✅ Respect rate limits
4. ✅ Handle errors gracefully
5. ✅ Clean up resources with `cleanup()`
6. ✅ Update selectors when platforms change
7. ✅ Use multiple fallback selectors
8. ✅ Save cookies for persistent sessions

## Security

1. 🔒 Add `cookies/`, `cache/`, `sessions/` to `.gitignore`
2. 🔒 Never commit authentication data
3. 🔒 Rotate sessions regularly
4. 🔒 Use environment variables for secrets
5. 🔒 Monitor for suspicious activity

## Directory Structure

```
ish-automation/
├── production-browser-automation.js
├── selectors-config.json
├── session-manager.js
├── enhanced-orchestrator-example.js
├── test-browser-automation.js
├── BROWSER_AUTOMATION_README.md
├── QUICK_REFERENCE.md
├── cookies/
│   ├── claude.json
│   ├── chatgpt.json
│   └── ...
├── cache/
│   └── response-cache.json
├── sessions/
│   └── analytics.json
├── screenshots/
│   └── error_*.png
└── downloads/
    └── *.png, *.mp4
```

## Support

- Full Documentation: `BROWSER_AUTOMATION_README.md`
- Test Suite: `node test-browser-automation.js`
- Examples: `node enhanced-orchestrator-example.js`
- Selectors: Update `selectors-config.json`
