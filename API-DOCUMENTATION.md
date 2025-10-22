# Production API Client - Documentation

## Overview

The Production API Client provides production-ready integrations with major AI API providers:

- **OpenAI** (GPT-4, GPT-3.5-turbo)
- **Anthropic** (Claude 3 Opus, Sonnet, Haiku)
- **Google AI** (Gemini 1.5 Pro, Gemini Pro)
- **Replicate** (Llama 3, Mistral, CodeLlama)
- **Together AI** (Llama 3, Mixtral, Qwen)

## Features

### Core Capabilities

- ✅ **Unified Interface** - Single API for multiple providers
- ✅ **Rate Limiting** - Token bucket algorithm prevents API throttling
- ✅ **Retry Logic** - Exponential backoff with configurable retries
- ✅ **Response Normalization** - Consistent format across providers
- ✅ **Cost Tracking** - Automatic cost calculation per request
- ✅ **Metrics & Monitoring** - Track latency, tokens, errors
- ✅ **Request Caching** - Optional caching for duplicate requests
- ✅ **Error Classification** - Categorize and handle different error types

## Installation

### Prerequisites

```bash
# Node.js 18+ required
node --version

# Install dependencies
npm install
```

### Environment Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Add your API keys to `.env`:

```env
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
GOOGLE_API_KEY=your-google-key
REPLICATE_API_KEY=r8_your-replicate-key
TOGETHER_API_KEY=your-together-key
```

### Getting API Keys

| Provider | Sign Up URL | Free Tier |
|----------|------------|-----------|
| OpenAI | https://platform.openai.com/signup | $5 credit |
| Anthropic | https://console.anthropic.com/ | Limited free tier |
| Google AI | https://makersuite.google.com/ | Free quota |
| Replicate | https://replicate.com/signup | Pay as you go |
| Together AI | https://api.together.xyz/ | $25 credit |

## Quick Start

### Basic Usage

```javascript
const { ProductionAPIClient } = require('./production-api-client');

// Initialize client
const client = new ProductionAPIClient();

// Query OpenAI
const response = await client.queryOpenAI(
    "What is the capital of France?",
    { maxTokens: 100 }
);

console.log(response.text);
console.log(`Cost: $${response.cost.toFixed(6)}`);
```

### Query Multiple APIs in Parallel

```javascript
const results = await client.queryMultiple(
    "Explain quantum computing",
    ['openai', 'anthropic', 'google'],
    { maxTokens: 500 }
);

results.forEach(r => {
    if (r.success) {
        console.log(`${r.api}: ${r.result.text}`);
    }
});
```

### API-Powered Orchestrator

```javascript
const { APIPoweredOrchestrator } = require('./api-powered-orchestrator');

const orchestrator = new APIPoweredOrchestrator({
    preferAPI: true,
    fallbackToBrowser: true
});

await orchestrator.initialize();

const results = await orchestrator.processTextRequest(
    "Write a short story about AI",
    { apis: ['anthropic', 'openai'] }
);

orchestrator.displayResults(results);
```

## Configuration

### API Configuration (`api-config.json`)

The configuration file defines settings for each API provider:

```json
{
  "apis": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "models": { ... },
      "rateLimits": {
        "requestsPerMinute": 3500,
        "tokensPerMinute": 90000
      },
      "retryConfig": {
        "maxRetries": 3,
        "initialDelay": 1000
      }
    }
  }
}
```

### Rate Limiting

Each API has different rate limits:

| Provider | Requests/Min | Tokens/Min | Requests/Day |
|----------|--------------|------------|--------------|
| OpenAI | 3,500 | 90,000 | 10,000 |
| Anthropic | 50 | 40,000 | 1,000 |
| Google AI | 60 | 32,000 | 1,500 |
| Replicate | 120 | N/A | 5,000 |
| Together AI | 600 | 100,000 | 10,000 |

The client automatically handles rate limiting using a token bucket algorithm.

### Retry Logic

Failed requests are automatically retried with exponential backoff:

```javascript
{
  "maxRetries": 3,
  "initialDelay": 1000,      // 1 second
  "maxDelay": 10000,         // 10 seconds
  "backoffMultiplier": 2,    // Double delay each retry
  "retryableStatusCodes": [408, 429, 500, 502, 503, 504]
}
```

Retry delays:
- Attempt 1: 1 second
- Attempt 2: 2 seconds
- Attempt 3: 4 seconds

## API Methods

### OpenAI

```javascript
const response = await client.queryOpenAI(prompt, {
    model: 'gpt-4-turbo',      // or 'gpt-4', 'gpt-3.5-turbo'
    maxTokens: 1000,
    temperature: 0.7
});
```

**Models:**
- `gpt-4-turbo` - Most capable, $0.01/1K input, $0.03/1K output
- `gpt-4` - High quality, $0.03/1K input, $0.06/1K output
- `gpt-3.5-turbo` - Fast & cheap, $0.0005/1K input, $0.0015/1K output

### Anthropic Claude

```javascript
const response = await client.queryAnthropic(prompt, {
    model: 'claude-3-opus',    // or 'claude-3-sonnet', 'claude-3-haiku'
    maxTokens: 1000,
    temperature: 0.7
});
```

**Models:**
- `claude-3-opus` - Most capable, $0.015/1K input, $0.075/1K output
- `claude-3-sonnet` - Balanced, $0.003/1K input, $0.015/1K output
- `claude-3-haiku` - Fast & cheap, $0.00025/1K input, $0.00125/1K output

### Google Gemini

```javascript
const response = await client.queryGoogle(prompt, {
    model: 'gemini-1.5-pro',   // or 'gemini-pro'
    maxTokens: 1000,
    temperature: 0.7
});
```

**Models:**
- `gemini-1.5-pro` - 1M context, $0.00125/1K input, $0.005/1K output
- `gemini-pro` - 32K context, $0.0005/1K input, $0.0015/1K output

### Replicate

```javascript
const response = await client.queryReplicate(prompt, {
    model: 'llama-3-70b',      // or 'llama-2-70b', 'mistral-7b'
    maxTokens: 1000,
    temperature: 0.7
});
```

**Models:**
- `llama-3-70b` - Latest Llama model
- `llama-2-70b` - Stable version
- `mistral-7b` - Fast & efficient
- `codellama-34b` - Code-specialized

### Together AI

```javascript
const response = await client.queryTogether(prompt, {
    model: 'llama-3-70b',      // or 'mixtral-8x7b', 'mixtral-8x22b'
    maxTokens: 1000,
    temperature: 0.7
});
```

**Models:**
- `llama-3-70b` - Latest Llama model
- `mixtral-8x7b` - 32K context
- `mixtral-8x22b` - 65K context
- `qwen-72b` - Multilingual

## Response Format

All responses are normalized to a consistent format:

```javascript
{
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    text: 'The response text...',
    tokens: {
        input: 25,
        output: 150,
        total: 175
    },
    cost: 0.000275,
    timestamp: '2025-10-20T12:34:56.789Z',
    raw: { /* Original API response */ }
}
```

## Metrics & Monitoring

### Get Metrics

```javascript
const metrics = client.getMetrics();
console.log(JSON.stringify(metrics, null, 2));
```

**Metrics Include:**

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
      "avg": 1200,
      "p50": 1100,
      "p95": 2000,
      "p99": 2200
    }
  },
  "errors": {
    "openai": {
      "429": 1
    }
  }
}
```

### Export Metrics

```javascript
client.exportMetrics('./api-metrics.json');
```

## Error Handling

### Error Categories

Errors are automatically classified:

| Category | HTTP Codes | Handling |
|----------|------------|----------|
| Authentication | 401, 403 | Check API keys |
| Rate Limiting | 429 | Automatic retry with backoff |
| Server Error | 500, 502, 503, 504 | Automatic retry |
| Timeout | 408 | Automatic retry |
| Bad Request | 400 | No retry, fix request |

### Try-Catch Pattern

```javascript
try {
    const response = await client.queryOpenAI(prompt);
    console.log(response.text);
} catch (error) {
    if (error.statusCode === 401) {
        console.error('Invalid API key');
    } else if (error.statusCode === 429) {
        console.error('Rate limit exceeded');
    } else {
        console.error('Request failed:', error.message);
    }
}
```

## Advanced Usage

### Custom Configuration

```javascript
const client = new ProductionAPIClient({
    configPath: './my-custom-config.json'
});
```

### Cache Management

```javascript
// Enable/disable caching
client.cacheEnabled = true;

// Clear cache
client.clearCache();
```

### Logging Levels

Set log level in environment:

```env
LOG_LEVEL=debug  # debug, info, warn, error
```

Or in config:

```javascript
const client = new ProductionAPIClient();
client.logLevel = 'debug';
```

## Cost Optimization

### Tips for Reducing Costs

1. **Choose the right model:**
   - Use GPT-3.5-turbo for simple tasks ($0.0005/1K)
   - Use Claude Haiku for fast responses ($0.00025/1K)
   - Use Gemini Pro for long contexts ($0.0005/1K)

2. **Limit token usage:**
   ```javascript
   { maxTokens: 200 }  // Limit response length
   ```

3. **Enable caching:**
   ```javascript
   client.cacheEnabled = true;
   ```

4. **Use parallel queries strategically:**
   - Only query multiple APIs when needed
   - Stop after first success

### Cost Comparison

For a 100-token input, 500-token output request:

| Provider | Model | Cost |
|----------|-------|------|
| OpenAI | GPT-3.5-turbo | $0.00085 |
| OpenAI | GPT-4-turbo | $0.016 |
| Anthropic | Claude Haiku | $0.00065 |
| Anthropic | Claude Opus | $0.0390 |
| Google | Gemini Pro | $0.00080 |
| Together AI | Llama 3 70B | $0.00054 |

## Troubleshooting

### API Key Not Found

```
⚠️ API key for openai not found in environment variable OPENAI_API_KEY
```

**Solution:** Add the API key to your `.env` file.

### Rate Limit Errors

```
Rate limit reached for openai, waiting 5000ms
```

**Solution:** The client automatically handles this. To avoid, reduce request frequency.

### Timeout Errors

```
Request timeout
```

**Solution:** Increase timeout in `api-config.json`:

```json
"timeout": 120000  // 2 minutes
```

### Authentication Errors

```
HTTP 401: Invalid authentication
```

**Solution:** Verify your API key is correct and active.

## Testing

### Run Demo

```bash
# Test all APIs
node production-api-client.js

# Test orchestrator
node api-powered-orchestrator.js
```

### Unit Testing

```javascript
describe('ProductionAPIClient', () => {
    it('should query OpenAI successfully', async () => {
        const client = new ProductionAPIClient();
        const response = await client.queryOpenAI('Hello');
        expect(response.text).toBeDefined();
        expect(response.cost).toBeGreaterThan(0);
    });
});
```

## Performance

### Benchmarks

Average response times (100-token prompts):

| Provider | Model | Latency |
|----------|-------|---------|
| OpenAI | GPT-3.5-turbo | 800ms |
| OpenAI | GPT-4-turbo | 2000ms |
| Anthropic | Claude Haiku | 1200ms |
| Anthropic | Claude Opus | 3500ms |
| Google | Gemini Pro | 1000ms |
| Together AI | Llama 3 70B | 1500ms |

### Optimization Tips

1. **Use parallel queries for comparison:**
   ```javascript
   await client.queryMultiple(prompt, ['openai', 'anthropic']);
   ```

2. **Cache repeated queries:**
   ```javascript
   client.cacheEnabled = true;
   ```

3. **Choose faster models for prototyping:**
   - GPT-3.5-turbo
   - Claude Haiku
   - Gemini Pro

## Security

### Best Practices

1. **Never commit API keys:**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use environment variables:**
   ```javascript
   const apiKey = process.env.OPENAI_API_KEY;
   ```

3. **Rotate keys regularly:**
   - OpenAI: https://platform.openai.com/api-keys
   - Anthropic: https://console.anthropic.com/

4. **Monitor usage:**
   ```javascript
   const metrics = client.getMetrics();
   console.log('Total cost:', metrics.costs);
   ```

## Support

### Resources

- [OpenAI Documentation](https://platform.openai.com/docs)
- [Anthropic Documentation](https://docs.anthropic.com/)
- [Google AI Documentation](https://ai.google.dev/docs)
- [Replicate Documentation](https://replicate.com/docs)
- [Together AI Documentation](https://docs.together.ai/)

### Common Issues

- **Rate limiting:** Reduce request frequency or upgrade plan
- **Timeout:** Increase timeout or reduce prompt complexity
- **High costs:** Use cheaper models or enable caching
- **Authentication:** Verify API keys are correct and active

## License

MIT License - See LICENSE file for details.

## Contributors

Contributions welcome! Please submit issues and pull requests.
