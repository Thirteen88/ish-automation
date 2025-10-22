# Browser-Based Production Orchestrator

A pure browser automation orchestrator for querying multiple AI platforms **WITHOUT API keys**.

## 🌟 Features

- **No API Keys Required** - Pure browser automation using Playwright
- **Multiple AI Platforms**:
  - Claude.ai (claude-3-opus, sonnet, haiku)
  - ChatGPT (gpt-4, gpt-3.5-turbo)
  - Google Gemini (gemini-pro, gemini-ultra)
  - LMArena (100+ models)
  - ISH Platform (multiple models)
- **Session Persistence** - Saves and loads browser sessions (cookies, localStorage)
- **Anti-Detection** - Stealth mode to avoid bot detection
- **Parallel Execution** - Query multiple platforms simultaneously
- **Health Monitoring** - Automatic health checks and platform availability tracking
- **Error Recovery** - Circuit breakers and automatic retry logic
- **CAPTCHA Detection** - Detects when CAPTCHA is required

## 📦 Installation

```bash
# Install dependencies
npm install playwright

# Install Chromium browser
npx playwright install chromium
```

## 🚀 Quick Start

### Basic Usage

```javascript
const BrowserOrchestrator = require('./production-orchestrator-browser');

const orchestrator = new BrowserOrchestrator({
    environment: 'development',
    headless: false, // Set to true for production
    enableHealthMonitoring: true,
    enableSessionPersistence: true
});

// Initialize
await orchestrator.initialize();

// Query multiple platforms
const result = await orchestrator.query({
    prompt: 'Explain quantum computing in simple terms',
    platforms: ['claude', 'chatgpt', 'gemini'],
    model: 'default'
});

console.log(result);

// Shutdown gracefully
await orchestrator.shutdown();
```

### Run the Demo

```bash
# Run in headed mode (shows browser)
node production-orchestrator-browser.js

# Run in headless mode
HEADLESS=true node production-orchestrator-browser.js
```

## 🎯 Platform Configuration

### Supported Platforms

| Platform | Name | Models | Login Required |
|----------|------|--------|----------------|
| Claude.ai | `claude` | opus, sonnet, haiku | Yes |
| ChatGPT | `chatgpt` | gpt-4, gpt-3.5-turbo | Yes |
| Gemini | `gemini` | gemini-pro, gemini-ultra | Yes |
| LMArena | `lmarena` | 100+ models | No |
| ISH | `ish` | Multiple | No |

### First-Time Setup

1. **Run in headed mode** (headless: false)
2. **Log in manually** to Claude, ChatGPT, and Gemini
3. **Sessions are automatically saved** in `.sessions/` directory
4. **Future runs** will use saved sessions

```javascript
const orchestrator = new BrowserOrchestrator({
    headless: false, // Shows browser for login
    enableSessionPersistence: true
});
```

## 🔧 Configuration Options

```javascript
{
    environment: 'production',      // Environment: development/production
    headless: true,                 // Run browser in headless mode
    enableHealthMonitoring: true,   // Enable platform health checks
    enableSessionPersistence: true, // Save/load browser sessions
    sessionDir: '.sessions',        // Directory for session files
    autoRecovery: true,             // Auto-recover from errors
    maxConcurrent: 5                // Max parallel queries
}
```

## 📡 API Reference

### Initialize

```javascript
await orchestrator.initialize();
```

Initializes the orchestrator, launches browser, and loads platform automation modules.

### Query

```javascript
const result = await orchestrator.query({
    prompt: 'Your question here',
    platforms: ['claude', 'chatgpt', 'gemini'], // Array of platforms
    model: 'gpt-4' // Optional: specific model
});
```

Returns:
```javascript
{
    success: true,
    duration: 5234,  // milliseconds
    results: [
        {
            success: true,
            platformName: 'claude',
            result: {
                platform: 'Claude.ai',
                model: 'claude-3-sonnet',
                response: '...',
                timestamp: '2025-10-22T...'
            }
        },
        // ... more results
    ],
    timestamp: '2025-10-22T...'
}
```

### Shutdown

```javascript
await orchestrator.shutdown();
```

Saves sessions and closes all browser contexts gracefully.

## 🛡️ Anti-Detection Features

The orchestrator includes multiple anti-detection measures:

- **Navigator.webdriver override** - Hides automation flag
- **Chrome object mocking** - Mimics real Chrome browser
- **Plugin simulation** - Adds fake plugins
- **Realistic user agent** - Uses current Chrome UA
- **Randomized timing** - Adds human-like delays

## 🔄 Session Management

Sessions are automatically saved after each successful interaction:

```
.sessions/
├── claude-session.json
├── chatgpt-session.json
├── gemini-session.json
├── lmarena-session.json
└── ish-session.json
```

Each session file contains:
- Cookies
- LocalStorage data
- Timestamp

## 🚨 CAPTCHA Handling

When CAPTCHA is detected:

1. **Detection** - Automatically detects reCAPTCHA, hCAPTCHA, and others
2. **Alert** - Throws error with CAPTCHA type
3. **Manual Intervention** - Requires human to solve
4. **Resume** - After solving, query will retry

```javascript
try {
    await orchestrator.query({ ... });
} catch (error) {
    if (error.message.includes('CAPTCHA detected')) {
        console.log('Please solve CAPTCHA manually');
        // Wait for user to solve CAPTCHA
        // Then retry
    }
}
```

## 📊 Health Monitoring

Health monitoring tracks platform availability:

```javascript
// Get health status
const health = orchestrator.healthMonitor.getAllPlatformHealth();

console.log(health);
// {
//   claude: { status: 'healthy', totalChecks: 10, errorRate: 0 },
//   chatgpt: { status: 'healthy', totalChecks: 10, errorRate: 0 },
//   ...
// }
```

## 🐛 Debugging

### Enable Debug Mode

```javascript
const orchestrator = new BrowserOrchestrator({
    headless: false,  // Show browser
    environment: 'development'
});
```

### Screenshots

Orchestrator automatically saves screenshots on errors:

```
screenshots/
├── claude-error-1729600000.png
├── chatgpt-error-1729600100.png
└── ...
```

### Verbose Logging

```bash
DEBUG=* node production-orchestrator-browser.js
```

## ⚠️ Important Notes

### Login Requirements

- **Claude.ai** - Requires login, session persists
- **ChatGPT** - Requires login, session persists
- **Gemini** - Requires login, session persists
- **LMArena** - No login required
- **ISH** - No login required

### Rate Limiting

Each platform has rate limits. The orchestrator includes:
- **Circuit breakers** - Stops requests to failing platforms
- **Exponential backoff** - Increases delay between retries
- **Error tracking** - Monitors error rates

### Browser Resources

Running multiple browser contexts uses significant resources:
- **Memory** - ~200MB per context
- **CPU** - ~10% per active query
- **Disk** - Session files ~1MB each

## 🔒 Security

- **No credentials stored** - Only cookies and localStorage
- **Local execution only** - All automation runs on your machine
- **Session files** - Add `.sessions/` to `.gitignore`

```bash
echo ".sessions/" >> .gitignore
```

## 🎓 Advanced Usage

### Custom Platform

```javascript
class CustomPlatform extends PlatformAutomation {
    constructor(config = {}) {
        super('CustomPlatform', config);
        this.baseUrl = 'https://custom.ai';
    }

    async query(prompt, options = {}) {
        // Your custom automation logic
        await this.page.goto(this.baseUrl);
        // ...
        return { platform: 'CustomPlatform', response: '...' };
    }
}

// Register custom platform
orchestrator.platforms.set('custom', new CustomPlatform());
```

### Batch Queries

```javascript
const prompts = [
    'What is AI?',
    'Explain machine learning',
    'What is deep learning?'
];

const results = await Promise.all(
    prompts.map(prompt =>
        orchestrator.query({
            prompt,
            platforms: ['claude', 'chatgpt']
        })
    )
);
```

## 📈 Performance Tips

1. **Use headless mode** for production (faster)
2. **Limit concurrent platforms** (3-5 recommended)
3. **Enable session persistence** (faster subsequent runs)
4. **Run on dedicated machine** (better performance)

## 🤝 Contributing

The platform automation modules need accurate selectors for each platform. If you find issues:

1. Run in headed mode to inspect elements
2. Update selectors in platform classes
3. Test thoroughly before committing

## 📝 License

MIT

## 🙏 Acknowledgments

- Built with [Playwright](https://playwright.dev/)
- Integrates with [ISH Platform](https://ish.junioralive.in/)
- Supports [LMArena](https://lmarena.ai/)
