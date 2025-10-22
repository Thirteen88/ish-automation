# Production API Integrations - Quick Start

This directory contains production-ready API integrations for the multi-modal AI orchestrator system.

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up API Keys

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your API keys
nano .env
```

Get your free API keys:
- OpenAI: https://platform.openai.com/api-keys ($5 free credit)
- Anthropic: https://console.anthropic.com/ (limited free tier)
- Google AI: https://makersuite.google.com/ (free quota)
- Replicate: https://replicate.com/signup (pay as you go)
- Together AI: https://api.together.xyz/ ($25 free credit)

### 3. Test Your Setup

```bash
# Run the test suite
node test-api-client.js

# Or test the API client directly
node production-api-client.js
```

## 📁 File Structure

```
/home/gary/ish-automation/
├── production-api-client.js        # Main API client (500+ lines)
├── api-powered-orchestrator.js     # Orchestrator integration (400+ lines)
├── api-config.json                 # API configuration & settings
├── .env.example                    # Template for API keys
├── test-api-client.js              # Comprehensive test suite
├── API-DOCUMENTATION.md            # Full documentation
└── README-API-SETUP.md            # This file
```

## 🎯 Usage Examples

### Basic API Query

```javascript
const { ProductionAPIClient } = require('./production-api-client');

const client = new ProductionAPIClient();

// Query OpenAI
const response = await client.queryOpenAI(
    "Explain quantum computing in simple terms",
    { maxTokens: 200 }
);

console.log(response.text);
console.log(`Cost: $${response.cost.toFixed(6)}`);
```

### Compare Multiple APIs

```javascript
const results = await client.queryMultiple(
    "What is the meaning of life?",
    ['openai', 'anthropic', 'google'],
    { maxTokens: 100 }
);

results.forEach(r => {
    if (r.success) {
        console.log(`${r.api}: ${r.result.text}`);
    }
});
```

### Use the Orchestrator

```javascript
const { APIPoweredOrchestrator } = require('./api-powered-orchestrator');

const orchestrator = new APIPoweredOrchestrator({
    preferAPI: true,           // Use APIs when possible
    fallbackToBrowser: true,   // Fall back to browser if API fails
    parallelMode: false        // Sequential by default
});

await orchestrator.initialize();

const results = await orchestrator.processTextRequest(
    "Write a haiku about technology"
);

orchestrator.displayResults(results);
await orchestrator.cleanup();
```

## 🔑 Features

### ✅ Core Features
- **5 Major AI Providers** - OpenAI, Anthropic, Google, Replicate, Together AI
- **Unified Interface** - Same code for all providers
- **Automatic Rate Limiting** - Token bucket algorithm prevents throttling
- **Smart Retries** - Exponential backoff for failed requests
- **Response Normalization** - Consistent format across providers
- **Cost Tracking** - Track spending per request and total
- **Metrics & Monitoring** - Latency, tokens, success rate
- **Request Caching** - Optional caching for duplicate requests
- **Error Classification** - Categorize and handle errors intelligently

### 🎨 Advanced Features
- **Parallel Queries** - Query multiple APIs simultaneously
- **Hybrid Mode** - Use APIs + browser automation
- **Fallback Mechanism** - API first, browser second
- **Cost Optimization** - Choose cheapest/fastest provider
- **Performance Comparison** - API vs browser benchmarks

## 📊 Supported Models

### OpenAI
- GPT-4-turbo (128K context)
- GPT-4 (8K context)
- GPT-3.5-turbo (16K context)

### Anthropic Claude
- Claude 3 Opus (200K context)
- Claude 3 Sonnet (200K context)
- Claude 3 Haiku (200K context)

### Google AI
- Gemini 1.5 Pro (1M context!)
- Gemini Pro (32K context)

### Replicate
- Llama 3 70B
- Llama 2 70B
- Mistral 7B
- CodeLlama 34B

### Together AI
- Llama 3 70B
- Mixtral 8x7B (32K context)
- Mixtral 8x22B (65K context)
- Qwen 72B

## 💰 Cost Comparison

For a typical 100-input/500-output token request:

| Provider | Model | Cost | Speed |
|----------|-------|------|-------|
| OpenAI | GPT-3.5-turbo | $0.00085 | ⚡️ Fast |
| OpenAI | GPT-4-turbo | $0.016 | 🐢 Slow |
| Anthropic | Claude Haiku | $0.00065 | ⚡️ Fast |
| Anthropic | Claude Opus | $0.039 | 🐢 Slow |
| Google | Gemini Pro | $0.00080 | ⚡️ Fast |
| Together AI | Llama 3 70B | $0.00054 | ⚡️ Fast |

**Cost-effective choices:**
- **Cheapest:** Claude Haiku ($0.00065)
- **Best value:** Together AI Llama 3 ($0.00054)
- **Long context:** Gemini 1.5 Pro (1M tokens!)

## 🛡️ Error Handling

The client automatically handles:

- **Rate Limiting (429)** - Waits and retries automatically
- **Server Errors (500-504)** - Retries with exponential backoff
- **Timeouts (408)** - Retries up to 3 times
- **Authentication (401/403)** - Clear error messages

```javascript
try {
    const response = await client.queryOpenAI(prompt);
} catch (error) {
    if (error.statusCode === 401) {
        console.error('Invalid API key');
    } else if (error.statusCode === 429) {
        console.error('Rate limit - automatically retried');
    } else {
        console.error('Error:', error.message);
    }
}
```

## 📈 Metrics & Monitoring

Get detailed metrics:

```javascript
const metrics = client.getMetrics();

console.log(JSON.stringify(metrics, null, 2));
```

Example output:
```json
{
  "requests": {
    "openai": {
      "total": 10,
      "success": 9,
      "error": 1,
      "successRate": 0.9
    }
  },
  "tokens": {
    "openai": {
      "input": 2500,
      "output": 5000,
      "total": 7500
    }
  },
  "costs": {
    "openai": "0.0125"
  },
  "latency": {
    "openai": {
      "min": 450,
      "max": 2300,
      "avg": 1200
    }
  }
}
```

Export to file:
```javascript
client.exportMetrics('./my-metrics.json');
```

## 🧪 Testing

### Run Full Test Suite

```bash
node test-api-client.js
```

This tests:
- ✅ Individual API queries
- ✅ Parallel queries
- ✅ Error handling
- ✅ Rate limiting
- ✅ Metrics tracking
- ✅ Cost calculation
- ✅ Response normalization
- ✅ Caching
- ✅ Orchestrator integration

### Test Specific API

```bash
# Test OpenAI only
ANTHROPIC_API_KEY="" GOOGLE_API_KEY="" node test-api-client.js
```

## 🔧 Configuration

### Custom Config File

Create a custom `api-config.json`:

```json
{
  "apis": {
    "openai": {
      "rateLimits": {
        "requestsPerMinute": 60
      },
      "timeout": 30000
    }
  }
}
```

Load it:

```javascript
const client = new ProductionAPIClient({
    configPath: './my-config.json'
});
```

### Environment Variables

```env
# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
REPLICATE_API_KEY=r8_...
TOGETHER_API_KEY=...

# Optional settings
LOG_LEVEL=info              # debug, info, warn, error
ENABLE_CACHE=true           # Enable response caching
MAX_CONCURRENT_REQUESTS=10  # Parallel request limit
```

## 🚨 Troubleshooting

### No API keys found

```bash
# Check if .env exists
ls -la .env

# Check if dotenv is installed
npm list dotenv

# Verify API keys are set
node -e "require('dotenv').config(); console.log(process.env.OPENAI_API_KEY)"
```

### Rate limit errors

The client handles these automatically, but if persistent:

1. Check your API plan limits
2. Reduce request frequency
3. Upgrade your API plan

### Timeout errors

Increase timeout in `api-config.json`:

```json
{
  "apis": {
    "openai": {
      "timeout": 120000  // 2 minutes
    }
  }
}
```

### Authentication errors

```bash
# Verify API key format
echo $OPENAI_API_KEY  # Should start with sk-
echo $ANTHROPIC_API_KEY  # Should start with sk-ant-

# Test API key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

## 📚 Documentation

- **Full Documentation:** [API-DOCUMENTATION.md](./API-DOCUMENTATION.md)
- **OpenAI Docs:** https://platform.openai.com/docs
- **Anthropic Docs:** https://docs.anthropic.com/
- **Google AI Docs:** https://ai.google.dev/docs
- **Replicate Docs:** https://replicate.com/docs
- **Together AI Docs:** https://docs.together.ai/

## 🎓 Examples

### Example 1: Simple Query

```javascript
require('dotenv').config();
const { ProductionAPIClient } = require('./production-api-client');

async function simpleQuery() {
    const client = new ProductionAPIClient();

    const response = await client.queryOpenAI(
        "What is the capital of France?",
        { maxTokens: 50 }
    );

    console.log(response.text);
}

simpleQuery();
```

### Example 2: Compare Providers

```javascript
async function compareProviders() {
    const client = new ProductionAPIClient();

    const prompt = "Explain black holes in one sentence.";
    const results = await client.queryMultiple(
        prompt,
        ['openai', 'anthropic', 'google']
    );

    results.forEach(r => {
        if (r.success) {
            console.log(`\n${r.api}:`);
            console.log(`Text: ${r.result.text}`);
            console.log(`Cost: $${r.result.cost.toFixed(6)}`);
            console.log(`Time: ${r.duration}ms`);
        }
    });
}

compareProviders();
```

### Example 3: Cost-Optimized Query

```javascript
async function costOptimized() {
    const client = new ProductionAPIClient();

    // Use cheapest models
    const results = await client.queryMultiple(
        "Count to 10",
        ['openai', 'anthropic'],
        {
            models: {
                openai: 'gpt-3.5-turbo',
                anthropic: 'claude-3-haiku'
            },
            maxTokens: 50
        }
    );

    // Pick cheapest successful response
    const cheapest = results
        .filter(r => r.success)
        .sort((a, b) => a.result.cost - b.result.cost)[0];

    console.log(`Cheapest: ${cheapest.api} ($${cheapest.result.cost.toFixed(6)})`);
    console.log(cheapest.result.text);
}

costOptimized();
```

## 🔒 Security Best Practices

1. **Never commit .env file:**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Rotate API keys regularly** (every 90 days)

3. **Monitor usage dashboards:**
   - OpenAI: https://platform.openai.com/usage
   - Anthropic: https://console.anthropic.com/
   - Google: https://console.cloud.google.com/

4. **Set spending limits** in provider dashboards

5. **Use environment variables only:**
   ```javascript
   // ❌ Bad
   const apiKey = "sk-hardcoded-key";

   // ✅ Good
   const apiKey = process.env.OPENAI_API_KEY;
   ```

## 🤝 Integration with Existing System

The API client integrates seamlessly with your existing multi-modal orchestrator:

```javascript
const { MultiModalOrchestrator } = require('./multi-modal-orchestrator');
const { APIPoweredOrchestrator } = require('./api-powered-orchestrator');

// Use API-powered version for text
const orchestrator = new APIPoweredOrchestrator({
    preferAPI: true,
    fallbackToBrowser: true
});

// Process text with APIs
await orchestrator.processTextRequest("Your text prompt");

// Non-text tasks still use browser automation
await orchestrator.handleBrowserRequest(prompt, 'image');
```

## 📞 Support

Need help?

1. Check [API-DOCUMENTATION.md](./API-DOCUMENTATION.md)
2. Run tests: `node test-api-client.js`
3. Check provider status pages
4. Review error messages (they're descriptive!)

## ✨ Next Steps

1. ✅ Set up your `.env` file
2. ✅ Run `node test-api-client.js`
3. ✅ Try the examples above
4. ✅ Read the full documentation
5. ✅ Integrate with your application

Happy coding! 🚀
