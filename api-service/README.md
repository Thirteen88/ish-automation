# ISH AI Orchestrator API

Production-ready REST API service for external applications to interact with the AI orchestrator.

## Features

- ✅ **Multi-platform AI access** - Claude, GPT, Gemini, Llama
- ✅ **API key authentication** - Secure access control
- ✅ **Rate limiting** - Per-key request throttling
- ✅ **Response caching** - In-memory LRU cache with TTL
- ✅ **Request validation** - Joi schema validation
- ✅ **Swagger documentation** - Auto-generated OpenAPI docs
- ✅ **CORS support** - Configurable cross-origin access
- ✅ **Batch processing** - Submit multiple queries at once
- ✅ **Platform comparison** - Compare responses across platforms
- ✅ **Real-time streaming** - Server-Sent Events (SSE)
- ✅ **Usage analytics** - Comprehensive statistics and metrics
- ✅ **Official SDKs** - JavaScript, Python, cURL examples

## Quick Start

### 1. Install Dependencies

```bash
cd api-service
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your configuration:

```env
PORT=3000
API_KEYS=your-api-key-1,your-api-key-2
RATE_LIMIT_MAX_REQUESTS=100
CACHE_TTL=300
```

### 3. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

### 4. Access Documentation

- **Interactive API Docs**: http://localhost:3000/api-docs
- **Documentation Website**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health

## Directory Structure

```
api-service/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── .env.example           # Environment template
├── config/
│   ├── swagger.js        # OpenAPI/Swagger config
│   └── logger.js         # Winston logger config
├── middleware/
│   ├── auth.js           # API key authentication
│   ├── rateLimit.js      # Rate limiting
│   ├── cache.js          # Response caching
│   ├── validate.js       # Request validation
│   └── errorHandler.js   # Error handling
├── routes/
│   ├── query.js          # Query endpoints
│   ├── platform.js       # Platform endpoints
│   ├── batch.js          # Batch endpoints
│   ├── compare.js        # Comparison endpoints
│   └── stats.js          # Analytics endpoints
├── sdk/
│   ├── javascript-sdk.js # JavaScript/Node.js client
│   ├── python-sdk.py     # Python client
│   └── curl-examples.sh  # cURL examples
└── docs/
    └── index.html        # Documentation website
```

## API Endpoints

### Queries

- `POST /v1/query` - Submit a new query
- `GET /v1/query/:id` - Get query results
- `GET /v1/query/:id/stream` - Stream query results (SSE)

### Platforms

- `GET /v1/platforms` - List all platforms
- `GET /v1/platforms/:name` - Get platform details
- `GET /v1/platforms/:name/status` - Platform health status
- `GET /v1/platforms/:name/models` - List platform models

### Batch Processing

- `POST /v1/batch` - Submit batch queries
- `GET /v1/batch/:id` - Get batch results
- `POST /v1/batch/:id/cancel` - Cancel batch

### Comparison

- `POST /v1/compare` - Compare platforms
- `GET /v1/compare/:id` - Get comparison results

### Analytics

- `GET /v1/stats` - Usage statistics
- `GET /v1/stats/summary` - Quick summary
- `GET /v1/stats/platforms` - Platform breakdown
- `GET /v1/stats/export` - Export as CSV

## SDK Usage

### JavaScript/Node.js

```javascript
const ISHOrchestratorClient = require('./sdk/javascript-sdk.js');

const client = new ISHOrchestratorClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3000'
});

// Simple query
const result = await client.query({
  query: 'Explain quantum computing',
  platform: 'auto'
});

// Batch processing
const batch = await client.batch([
  { id: 'q1', query: 'What is AI?', platform: 'claude' },
  { id: 'q2', query: 'Explain ML', platform: 'gpt' }
]);

// Platform comparison
const comparison = await client.compare(
  'Write a haiku',
  ['claude', 'gpt', 'gemini']
);
```

### Python

```python
from sdk.python_sdk import ISHOrchestratorClient

client = ISHOrchestratorClient(api_key='your-api-key')

# Simple query
result = client.query(
    query='Explain quantum computing',
    platform='auto'
)

# Batch processing
batch = client.batch([
    {'id': 'q1', 'query': 'What is AI?', 'platform': 'claude'},
    {'id': 'q2', 'query': 'Explain ML', 'platform': 'gpt'}
])

# Platform comparison
comparison = client.compare(
    query='Write a haiku',
    platforms=['claude', 'gpt', 'gemini']
)
```

### cURL

```bash
# Submit query
curl -X POST "http://localhost:3000/v1/query" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "query": "Explain quantum computing",
    "platform": "auto"
  }'

# Get results
curl -X GET "http://localhost:3000/v1/query/{queryId}" \
  -H "X-API-Key: your-api-key"
```

See `sdk/curl-examples.sh` for comprehensive examples.

## Authentication

All API requests require an API key in the `X-API-Key` header:

```bash
X-API-Key: your-api-key-here
```

Configure valid API keys in the `.env` file:

```env
API_KEYS=key1,key2,key3
```

## Rate Limiting

- **Default**: 100 requests per 15 minutes per API key
- **Configurable** via environment variables
- **Headers returned**:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset time

## Response Caching

- **In-memory LRU cache** with TTL
- **Automatic** for GET requests
- **TTL**: Configurable (default: 5 minutes)
- **Headers**:
  - `X-Cache: HIT` or `X-Cache: MISS`
  - `X-Cache-Age`: Cache age in seconds

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "metadata": {
    "timestamp": "2025-10-21T00:00:00.000Z",
    "requestId": "uuid-v4"
  }
}
```

## Production Deployment

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t ish-api-service .
docker run -p 3000:3000 --env-file .env ish-api-service
```

### Environment Variables

Required for production:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
API_KEYS=secure-key-1,secure-key-2
JWT_SECRET=your-secret-key
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CACHE_TTL=300
ALLOWED_ORIGINS=https://yourdomain.com
LOG_LEVEL=info
```

### Scaling

The service is stateless and can be scaled horizontally:

1. **Load Balancer**: Use Nginx, HAProxy, or cloud LB
2. **Multiple Instances**: Run multiple server instances
3. **Shared Cache**: Consider Redis for shared caching
4. **Database**: Replace in-memory stores with Redis/MongoDB

### Monitoring

- **Logs**: Winston logger to file and console
- **Health Check**: `GET /health`
- **Metrics**: Built-in analytics at `/v1/stats`
- **Admin Endpoints**: Cache stats, rate limit info

## Security Best Practices

1. **API Keys**: Use strong, random keys (UUIDs recommended)
2. **HTTPS**: Always use TLS in production
3. **CORS**: Configure allowed origins explicitly
4. **Rate Limiting**: Protect against abuse
5. **Input Validation**: All inputs validated with Joi
6. **Error Handling**: Never expose internal errors in production
7. **Logging**: Log security events and suspicious activity

## Testing

Run the example scripts:

```bash
# cURL examples (comprehensive)
./sdk/curl-examples.sh

# JavaScript SDK
node sdk/javascript-sdk.js

# Python SDK
python sdk/python-sdk.py
```

## Support

- **Documentation**: http://localhost:3000/docs
- **API Explorer**: http://localhost:3000/api-docs
- **Health Check**: http://localhost:3000/health
- **OpenAPI Spec**: http://localhost:3000/api-docs.json

## License

MIT
