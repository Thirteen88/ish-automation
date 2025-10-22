# Production Browser Automation for AI Platforms

Production-ready browser automation system for real-time interactions with multiple AI platforms using Playwright.

## Supported Platforms

### Text/Chat Platforms
- **LMArena** (https://lmarena.ai/?mode=direct) - Multi-model comparison platform
- **Claude.ai** - Anthropic's Claude direct access
- **ChatGPT** - OpenAI's web interface
- **Gemini** - Google's AI assistant
- **Poe.com** - Multi-AI aggregator

### Creative Platforms
- **Playground AI** - Image generation
- **VEED.io** - AI video generation

## Features

- Real browser automation with Playwright
- Session and cookie management for persistent authentication
- Streaming response handling
- Error recovery with automatic retries
- Rate limiting protection
- CAPTCHA and authentication detection
- Multi-format response extraction (text, markdown, code, images, videos)
- Parallel platform querying
- Screenshot capture on errors
- Configurable selectors via JSON

## Installation

```bash
npm install playwright
npx playwright install chromium
```

## Quick Start

### Basic Usage

```javascript
const { ProductionBrowserAutomation } = require('./production-browser-automation');

const automation = new ProductionBrowserAutomation({
    headless: true,
    verbose: false,
    screenshotOnError: true
});

await automation.initialize();

// Query a single platform
const result = await automation.sendPrompt(
    'claude',
    'Write a Python function for binary search',
    { responseType: 'markdown' }
);

console.log(result.response);

await automation.cleanup();
```

### Query Multiple Platforms in Parallel

```javascript
const results = await automation.queryMultiplePlatforms(
    ['claude', 'chatgpt', 'gemini'],
    'Explain quantum computing',
    { responseType: 'text' }
);

results.forEach(result => {
    if (result.success) {
        console.log(`${result.platformName}: ${result.response}`);
    } else {
        console.error(`${result.platformName} failed: ${result.error}`);
    }
});
```

### Generate Images

```javascript
const imageResult = await automation.sendPrompt(
    'playground',
    'A serene mountain landscape at sunrise',
    {
        responseType: 'image',
        download: true
    }
);

if (imageResult.success) {
    imageResult.response.forEach(img => {
        console.log(`Image URL: ${img.url}`);
        console.log(`Saved to: ${img.localPath}`);
    });
}
```

## Configuration

### Constructor Options

```javascript
new ProductionBrowserAutomation({
    // Browser settings
    headless: true,              // Run browser in headless mode
    verbose: false,              // Enable detailed logging

    // Timeouts
    timeout: 60000,              // Default timeout (ms)

    // Retry settings
    retryCount: 3,               // Number of retries on failure
    retryDelay: 5000,            // Delay between retries (ms)

    // Error handling
    screenshotOnError: true,     // Capture screenshots on errors

    // Directory settings
    cookiesDir: './cookies',     // Cookie storage directory
    sessionsDir: './sessions',   // Session storage directory
    screenshotsDir: './screenshots',  // Screenshot directory
    downloadsDir: './downloads'  // Media downloads directory
})
```

### Response Types

Specify `responseType` in options to control how responses are extracted:

- `text` - Plain text extraction
- `markdown` - Markdown-formatted response
- `code` - Extract code blocks only
- `image` - Extract image URLs and optionally download
- `video` - Extract video URLs and optionally download

## Authentication

The system supports persistent authentication through cookies:

### First-Time Setup

1. Run with `headless: false`
2. Manually log in to the platform
3. Cookies will be automatically saved
4. Subsequent runs will use saved cookies

```javascript
// First run - manual login required
const automation = new ProductionBrowserAutomation({
    headless: false  // You'll see the browser
});

await automation.initialize();
await automation.sendPrompt('claude', 'Hello!');
await automation.cleanup();  // Saves cookies automatically

// Subsequent runs - automatic login
const automation2 = new ProductionBrowserAutomation({
    headless: true  // Can now run headless
});
await automation2.initialize();
// Cookies loaded automatically
```

### Manual Cookie Management

Cookies are stored in JSON format in the `./cookies` directory:

```
./cookies/
  claude.json
  chatgpt.json
  gemini.json
  ...
```

## Selectors Configuration

Platform-specific selectors are stored in `selectors-config.json`. Update this file if platforms change their UI:

```json
{
  "platforms": {
    "claude": {
      "selectors": {
        "promptInput": [
          "div[contenteditable='true']",
          "div.ProseMirror"
        ],
        "submitButton": [
          "button[aria-label='Send Message']"
        ],
        "responseContainer": [
          "div.message-content"
        ]
      }
    }
  }
}
```

### Updating Selectors

1. Inspect the platform's HTML using browser DevTools
2. Find reliable selectors (prefer data attributes, aria labels, or stable classes)
3. Add multiple fallback selectors
4. Test thoroughly

## Error Handling

The system automatically handles common errors:

### Rate Limiting

```javascript
// Automatic rate limiting per platform
const result = await automation.sendPrompt('claude', 'Hello');
// If rate limit is reached, automatically waits before sending
```

### CAPTCHA Detection

```javascript
// CAPTCHAs are automatically detected
// Error will be thrown with errorType: 'captcha'
try {
    await automation.sendPrompt('chatgpt', 'Hello');
} catch (error) {
    if (error.errorType === 'captcha') {
        console.log('CAPTCHA detected - manual intervention required');
    }
}
```

### Session Timeouts

```javascript
// Authentication errors are detected
// Save new cookies after manual login
if (error.errorType === 'authentication') {
    // Run with headless: false and log in manually
}
```

### Automatic Retries

```javascript
// Configure retry behavior
const automation = new ProductionBrowserAutomation({
    retryCount: 3,      // Try 3 times
    retryDelay: 5000    // Wait 5 seconds between retries
});
```

## Response Extraction

### Text Responses

```javascript
const result = await automation.sendPrompt(
    'claude',
    'Explain REST APIs',
    { responseType: 'text' }
);

console.log(result.response);  // Plain text
```

### Markdown Responses

```javascript
const result = await automation.sendPrompt(
    'chatgpt',
    'Create a table comparing Python and JavaScript',
    { responseType: 'markdown' }
);

console.log(result.response);  // Markdown formatted
```

### Code Extraction

```javascript
const result = await automation.sendPrompt(
    'claude',
    'Write a Python web scraper',
    { responseType: 'code' }
);

result.response.forEach(block => {
    console.log(`Language: ${block.language}`);
    console.log(`Code:\n${block.code}`);
});
```

### Image Extraction

```javascript
const result = await automation.sendPrompt(
    'playground',
    'A futuristic robot',
    {
        responseType: 'image',
        download: true  // Download images locally
    }
);

result.response.forEach(img => {
    console.log(`URL: ${img.url}`);
    console.log(`Local: ${img.localPath}`);
});
```

## Advanced Usage

### Custom Wait Strategies

```javascript
// Platforms have different response times
// Configuration in selectors-config.json:
{
  "waitStrategies": {
    "pageLoad": "networkidle",      // or "domcontentloaded"
    "responseTimeout": 90000,        // Max wait for response
    "typingDelay": 50               // Delay between keystrokes
  }
}
```

### Platform-Specific Rate Limits

```javascript
// Rate limits are enforced automatically
{
  "rateLimit": {
    "requestsPerMinute": 5,
    "cooldownMs": 12000
  }
}
```

### Error Screenshots

```javascript
// Screenshots saved automatically on errors
const automation = new ProductionBrowserAutomation({
    screenshotOnError: true,
    screenshotsDir: './screenshots'
});

// On error, screenshot saved as:
// ./screenshots/error_claude_1729435200000.png
```

### Streaming Response Handling

```javascript
// System automatically detects streaming responses
// Waits for stream to complete before extracting
const result = await automation.sendPrompt(
    'chatgpt',
    'Write a long essay about AI ethics'
);

// Response only returned when streaming completes
console.log(result.response);  // Complete response
```

## Integration Examples

### With Multi-Modal Orchestrator

```javascript
const { MultiModalOrchestrator } = require('./multi-modal-orchestrator');
const { ProductionBrowserAutomation } = require('./production-browser-automation');

class EnhancedOrchestrator extends MultiModalOrchestrator {
    constructor(config) {
        super(config);
        this.browserAutomation = new ProductionBrowserAutomation(config);
    }

    async initialize() {
        await super.initialize();
        await this.browserAutomation.initialize();
    }

    async queryPlatform(platform, prompt, taskType, config) {
        // Use real browser automation instead of simulation
        const result = await this.browserAutomation.sendPrompt(
            platform.name.toLowerCase().replace(/\s/g, ''),
            prompt,
            { responseType: taskType }
        );

        return result;
    }
}
```

### With Parallel Orchestrator

```javascript
const { ParallelOrchestrator } = require('./parallel-orchestrator');
const { ProductionBrowserAutomation } = require('./production-browser-automation');

const automation = new ProductionBrowserAutomation();
await automation.initialize();

// Query all models in parallel
const results = await automation.queryMultiplePlatforms(
    ['claude', 'chatgpt', 'gemini', 'lmarena'],
    'Compare sorting algorithms',
    { responseType: 'markdown' }
);

// Process results
results.forEach(result => {
    console.log(`${result.platformName}: ${result.duration}s`);
});
```

## Troubleshooting

### Platform Changes

If a platform updates its UI:

1. Set `headless: false` and `verbose: true`
2. Inspect the new HTML structure
3. Update selectors in `selectors-config.json`
4. Test the new selectors

### Login Issues

```javascript
// Clear cookies and re-authenticate
const fs = require('fs').promises;
await fs.unlink('./cookies/claude.json');

// Run with visible browser
const automation = new ProductionBrowserAutomation({
    headless: false
});

// Log in manually, cookies will be saved
```

### Rate Limiting

```javascript
// Increase cooldown time in selectors-config.json
{
  "rateLimit": {
    "requestsPerMinute": 3,  // Reduce requests
    "cooldownMs": 20000      // Increase cooldown
  }
}
```

### CAPTCHA Issues

```javascript
// Use with visible browser
const automation = new ProductionBrowserAutomation({
    headless: false
});

// System will detect CAPTCHA and pause
// Solve it manually in the browser
```

## Best Practices

1. **Start with headless: false** during development
2. **Save cookies regularly** to avoid re-authentication
3. **Respect rate limits** - platforms may ban aggressive usage
4. **Use verbose mode** for debugging
5. **Update selectors** when platforms change
6. **Handle errors gracefully** with try-catch blocks
7. **Clean up resources** with await automation.cleanup()
8. **Use appropriate timeouts** for different platforms

## Performance Tips

1. **Parallel queries** for faster results
2. **Reuse browser contexts** for multiple queries
3. **Optimize wait strategies** per platform
4. **Use selective selectors** to reduce wait times
5. **Cache cookies** to skip login flows

## Security Considerations

1. **Never commit cookies/** directory to git
2. **Use environment variables** for sensitive data
3. **Rotate sessions regularly**
4. **Monitor for suspicious activity**
5. **Use VPN/proxy** if making many requests

## License

MIT

## Contributing

Contributions welcome! Please update selectors-config.json when platforms change.

## Support

For issues or questions, please check:
1. Browser console logs (with verbose: true)
2. Error screenshots in ./screenshots
3. Platform-specific documentation
4. Selector configuration
