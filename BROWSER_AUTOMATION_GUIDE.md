# Browser Automation Testing & Production Guide

## Overview

This system provides production-ready browser automation for AI platforms with comprehensive testing, selector discovery, and validation tools.

## Quick Start

### 1. Test Existing Selectors

Test all platforms in the simplified configuration:

```bash
node test-selectors.js
```

Test a specific platform:

```bash
node test-selectors.js --platform lmarena --verbose
```

Test with visible browser (for debugging):

```bash
node test-selectors.js --no-headless --platform huggingface
```

### 2. Discover New Selectors

Discover selectors for a new platform:

```bash
node discover-selectors.js https://lmarena.ai/?mode=direct lmarena
```

With export to config format:

```bash
node discover-selectors.js https://huggingface.co/chat huggingface --export ./config-huggingface.json
```

Show browser window during discovery:

```bash
node discover-selectors.js https://www.perplexity.ai perplexity --no-headless --verbose
```

### 3. Run Integration Tests

Full integration test suite:

```bash
node run-integration-tests.js
```

This will:
- Test all platforms in simplified-config.json
- Generate detailed test reports
- Create production readiness assessment
- Provide deployment recommendations

## File Structure

```
ish-automation/
├── selectors-config.json           # Full platform configuration
├── simplified-config.json          # Production-ready subset
├── production-browser-automation.js # Main automation engine
├── test-selectors.js               # Selector validation framework
├── discover-selectors.js           # Selector discovery tool
├── run-integration-tests.js        # Full integration test suite
├── test-results/                   # Test outputs
│   ├── screenshots/                # Error and test screenshots
│   ├── integration-test-report.json
│   └── production-readiness-report.json
├── selector-discovery/             # Discovery tool outputs
├── cookies/                        # Saved authentication cookies
└── screenshots/                    # Error screenshots
```

## Configuration Files

### simplified-config.json

**Purpose**: Production-focused configuration with proven platforms

**Platforms Included**:
- `lmarena` - LMArena (no auth, very stable)
- `huggingface` - HuggingChat (no auth, reliable)
- `perplexity` - Perplexity AI (limited free access)

**Deployment Strategy**:
- Phase 1: lmarena, huggingface (immediate deployment)
- Phase 2: perplexity (after rate limit testing)
- Phase 3: claude, chatgpt, gemini (requires authentication)

### selectors-config.json

**Purpose**: Comprehensive configuration with all platforms

**Platforms Included**:
- lmarena, claude, chatgpt, gemini, poe, playground, veed

**Status**: Contains theoretical selectors that need validation

## Tools Documentation

### test-selectors.js

**Purpose**: Validate that selectors work against real websites

**Features**:
- Tests all selector variations
- Identifies which selectors work
- Measures performance
- Detects authentication requirements
- Detects CAPTCHA challenges
- Generates recommendations
- Takes screenshots for debugging

**Usage**:
```bash
# Test all platforms
node test-selectors.js

# Test specific platform
node test-selectors.js --platform lmarena

# Verbose mode
node test-selectors.js --verbose

# Show browser
node test-selectors.js --no-headless
```

**Output**:
- Console summary with pass/fail status
- `selector-test-report.json` with detailed results
- Screenshots in `test-screenshots/`

### discover-selectors.js

**Purpose**: Automatically find working selectors for new platforms

**Features**:
- Multiple selector strategies (ID, class, attributes, structure)
- Specificity scoring
- Uniqueness validation
- Semantic selector preference
- Export to config format
- Detailed element analysis

**Usage**:
```bash
# Basic discovery
node discover-selectors.js <url> <platform-name>

# With export
node discover-selectors.js https://lmarena.ai lmarena --export config-lmarena.json

# With visible browser
node discover-selectors.js <url> <name> --no-headless

# Verbose output
node discover-selectors.js <url> <name> --verbose
```

**Output**:
- Console summary of discovered selectors
- `selector-discovery-<platform>.json` with full analysis
- Optional config file ready for integration
- Screenshots in `selector-discovery/`

### run-integration-tests.js

**Purpose**: Comprehensive production readiness testing

**Features**:
- Tests all platforms in simplified-config.json
- Generates production readiness report
- Provides deployment recommendations
- Categorizes platforms by readiness
- Suggests authentication strategies
- Performance metrics

**Usage**:
```bash
node run-integration-tests.js
```

**Output**:
- Console report with production assessment
- `test-results/integration-test-report.json`
- `test-results/production-readiness-report.json`
- Screenshots in `test-results/screenshots/`

## Workflow

### Adding a New Platform

1. **Discover Selectors**:
   ```bash
   node discover-selectors.js https://example.com/chat example --no-headless
   ```

2. **Review Discovery Report**:
   - Check `selector-discovery-example.json`
   - Verify selectors are reasonable
   - Look for high-scoring selectors

3. **Add to Configuration**:
   - Copy discovered selectors to `simplified-config.json`
   - Set appropriate wait strategies
   - Configure rate limits

4. **Test Selectors**:
   ```bash
   node test-selectors.js --platform example --verbose
   ```

5. **Validate with Integration Tests**:
   ```bash
   node run-integration-tests.js
   ```

6. **Deploy to Production**:
   - If tests pass, platform is ready
   - Update production configuration
   - Monitor initial usage

### Fixing Broken Selectors

1. **Identify the Issue**:
   ```bash
   node test-selectors.js --platform lmarena --verbose
   ```

2. **Rediscover Selectors**:
   ```bash
   node discover-selectors.js https://lmarena.ai lmarena --no-headless
   ```

3. **Update Configuration**:
   - Replace broken selectors with discovered ones
   - Prioritize high-scoring selectors

4. **Retest**:
   ```bash
   node test-selectors.js --platform lmarena
   ```

## Selector Best Practices

### Selector Priority (Best to Worst)

1. **Data Attributes** (Most stable)
   - `[data-testid="prompt-input"]`
   - `[data-id="message-container"]`

2. **ARIA Labels** (Semantic and accessible)
   - `[aria-label="Send message"]`
   - `button[aria-label="Submit"]`

3. **IDs** (Unique but may change)
   - `#prompt-textarea`
   - `#submit-button`

4. **Placeholder/Name** (Content-based)
   - `textarea[placeholder*="Enter prompt"]`
   - `input[name="message"]`

5. **Classes** (Least stable, often generated)
   - `.prompt-input.main`
   - `button.primary.send-btn`

### Fallback Strategy

Always provide multiple selectors in order of preference:

```json
"promptInput": [
  "textarea[data-testid='prompt']",      // Best: data attribute
  "textarea[aria-label='Enter prompt']", // Good: semantic
  "#prompt-input",                       // OK: ID
  "textarea[placeholder*='prompt']",     // Fallback: partial match
  "textarea"                             // Last resort: tag only
]
```

## Authentication Handling

### No-Auth Platforms (Phase 1)

Platforms ready for immediate deployment:
- lmarena
- huggingface

**Strategy**: Direct access, no special handling needed

### Auth-Required Platforms (Phase 2/3)

Platforms requiring authentication:
- claude
- chatgpt
- gemini
- poe

**Strategy**:
1. Manual login in non-headless mode
2. Save cookies using browser automation
3. Load cookies on subsequent runs
4. Implement cookie refresh logic

**Example**:
```javascript
// Login manually and save cookies
const automation = new ProductionBrowserAutomation({
    headless: false
});

await automation.initialize();
await automation.getPage('claude');
// Login manually in browser
// ...
await automation.saveCookies('claude');
```

## Rate Limiting

### Platform-Specific Limits

Each platform has configured rate limits:

```json
"rateLimit": {
  "requestsPerMinute": 10,
  "cooldownMs": 6000
}
```

### Best Practices

1. **Respect Rate Limits**: Honor configured limits
2. **Implement Backoff**: Exponential backoff on errors
3. **Monitor Usage**: Track requests per platform
4. **Rotate Platforms**: Distribute load across platforms
5. **Queue Requests**: Don't spam simultaneously

## Error Handling

### Common Issues

1. **Selectors Not Found**
   - Run `discover-selectors.js` to find new ones
   - Platform UI may have changed
   - Check for authentication requirements

2. **CAPTCHA Detected**
   - Platform is rate-limiting
   - May need manual intervention
   - Consider using authenticated sessions

3. **Timeout Errors**
   - Platform is slow or down
   - Increase timeout in config
   - Check internet connection

4. **Authentication Required**
   - Platform needs login
   - Set up cookie management
   - Use authenticated session

### Error Screenshots

All tools capture screenshots on error:
- `test-screenshots/` for test-selectors.js
- `selector-discovery/` for discover-selectors.js
- `screenshots/` for production automation

## Production Deployment

### Pre-Deployment Checklist

- [ ] Run integration tests: `node run-integration-tests.js`
- [ ] At least 2 platforms production-ready
- [ ] Selector success rate > 95%
- [ ] Navigation time < 60s average
- [ ] Error handling tested
- [ ] Rate limiting configured
- [ ] Monitoring set up
- [ ] Logging configured

### Monitoring

Key metrics to track:
- Request success rate per platform
- Average response time
- Error types and frequency
- Rate limit hits
- Platform uptime
- Selector failures

### Maintenance

Regular maintenance tasks:
- Weekly: Test selectors for breakage
- Monthly: Discover new platforms
- As needed: Update broken selectors
- Quarterly: Review and optimize rate limits

## Troubleshooting

### Tests Failing

1. Check internet connection
2. Verify platforms are accessible
3. Run with `--no-headless` to see browser
4. Check for CAPTCHA or authentication
5. Review error screenshots

### Selectors Not Working

1. Platform UI may have changed
2. Run discover-selectors.js to find new ones
3. Check if authentication is now required
4. Verify element is actually on page

### Slow Performance

1. Increase timeouts in config
2. Check platform responsiveness
3. Reduce rate limits
4. Optimize selector specificity

## Advanced Usage

### Programmatic Testing

```javascript
const { SelectorTester } = require('./test-selectors');

const tester = new SelectorTester({
    headless: true,
    verbose: false
});

await tester.initialize();
const result = await tester.testSpecificPlatform('lmarena', config);
console.log(result);
await tester.cleanup();
```

### Programmatic Discovery

```javascript
const { SelectorDiscovery } = require('./discover-selectors');

const discovery = new SelectorDiscovery({
    headless: false,
    verbose: true
});

await discovery.initialize();
const selectors = await discovery.discoverPlatform(url, 'myplatform');
await discovery.exportToConfig('myplatform', './config.json');
await discovery.cleanup();
```

## Support

For issues or questions:
1. Check error screenshots
2. Run tests with `--verbose` flag
3. Review test reports in `test-results/`
4. Check platform accessibility manually

## License

MIT
