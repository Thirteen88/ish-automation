# ISH AI Orchestrator API - Quick Reference

## 🚀 Quick Start

```bash
cd api-service
npm install
./start.sh
```

Access: http://localhost:3000/api-docs

## 🔑 Authentication

All requests need API key:
```bash
-H "X-API-Key: your-api-key"
```

## 📍 Endpoints

### Query
```bash
# Submit
POST /v1/query
{"query": "text", "platform": "auto"}

# Get result
GET /v1/query/{id}

# Stream
GET /v1/query/{id}/stream
```

### Platforms
```bash
GET /v1/platforms              # List all
GET /v1/platforms/{name}       # Details
GET /v1/platforms/{name}/status # Health
```

### Batch
```bash
POST /v1/batch
{"queries": [{"id": "q1", "query": "text"}]}

GET /v1/batch/{id}
```

### Compare
```bash
POST /v1/compare
{"query": "text", "platforms": ["claude", "gpt"]}

GET /v1/compare/{id}
```

### Stats
```bash
GET /v1/stats
GET /v1/stats/summary
GET /v1/stats/export
```

## 💻 SDK Usage

### JavaScript
```javascript
const client = new ISHOrchestratorClient({apiKey: 'key'});
const result = await client.query({query: 'text', platform: 'auto'});
```

### Python
```python
client = ISHOrchestratorClient(api_key='key')
result = client.query(query='text', platform='auto')
```

### cURL
```bash
curl -X POST "http://localhost:3000/v1/query" \
  -H "X-API-Key: key" \
  -d '{"query": "text", "platform": "auto"}'
```

## ⚙️ Configuration

Edit `.env`:
```env
PORT=3000
API_KEYS=key1,key2
RATE_LIMIT_MAX_REQUESTS=100
CACHE_TTL=300
```

## 📊 Rate Limits

- 100 requests per 15 minutes per API key
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## 🎯 Response Format

### Success
```json
{
  "success": true,
  "data": {...},
  "metadata": {"timestamp": "...", "requestId": "..."}
}
```

### Error
```json
{
  "success": false,
  "error": {"code": "...", "message": "..."},
  "metadata": {...}
}
```

## 🔧 Common Commands

```bash
# Start
npm start

# Development
npm run dev

# View docs
open http://localhost:3000/api-docs

# Health check
curl http://localhost:3000/health

# Run examples
./sdk/curl-examples.sh
```

## 📚 Documentation

- Interactive: http://localhost:3000/api-docs
- Website: http://localhost:3000/docs
- README: `api-service/README.md`
- Deployment: `api-service/DEPLOYMENT.md`

## 🐳 Docker

```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## 🔍 Troubleshooting

### Port in use
Change `PORT` in `.env`

### Missing API key
Set `API_KEYS` in `.env`

### Rate limit hit
Wait for reset or increase `RATE_LIMIT_MAX_REQUESTS`

### Cache issues
Clear: `POST /admin/cache/clear`

## 📞 Support

- Docs: http://localhost:3000/docs
- Health: http://localhost:3000/health
- Logs: `api-service/logs/`
