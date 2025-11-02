# AI Test Endpoint Usage Examples

## Overview

The AI Test endpoint (`/api/ai/test`) provides comprehensive testing capabilities for all configured AI providers in the ISH Chat Integration system. It supports multiple test types, cost estimation, quality scoring, and detailed comparisons.

## Available Test Types

1. **simple** - Basic connectivity test with greeting
2. **complex** - Detailed explanation task about AI concepts
3. **reasoning** - Logical puzzle requiring step-by-step thinking
4. **code** - Programming task requiring code generation
5. **creative** - Creative writing task

## API Endpoints

### POST /api/ai/test
Main endpoint for testing AI providers

**Request Body:**
```json
{
  "providers": ["zai", "anthropic"],        // Optional: Test specific providers (empty = all)
  "test_type": "complex",                   // Test type: simple, complex, reasoning, code, creative
  "include_costs": true,                    // Include cost estimation
  "timeout": 30,                           // Timeout per provider in seconds (5-120)
  "save_results": true,                    // Save results to database
  "parallel": true,                        // Run tests in parallel
  "custom_prompt": "Your custom prompt"     // Optional: Override built-in prompt
}
```

**Response:**
```json
{
  "test_id": "uuid-string",
  "test_type": "complex",
  "total_providers": 2,
  "successful_providers": 2,
  "failed_providers": 0,
  "results": [
    {
      "provider": "zai",
      "model": "glm-4",
      "success": true,
      "response": "Full AI response text...",
      "execution_time": 2.34,
      "response_length": 512,
      "estimated_cost": 0.015,
      "quality_score": 0.85,
      "test_prompt": "Test prompt used"
    }
  ],
  "comparison": {
    "fastest_provider": "zai",
    "highest_quality": "anthropic",
    "most_expensive": "anthropic"
  },
  "execution_summary": {
    "total_execution_time": 3.45,
    "average_execution_time": 1.72,
    "total_estimated_cost": 0.025,
    "average_quality_score": 0.78
  },
  "timestamp": "2025-11-02T19:54:00.000Z"
}
```

### GET /api/ai/test/history
Retrieve test history with optional filtering

**Query Parameters:**
- `limit` (int, default=50): Maximum number of results
- `provider` (string): Filter by provider name
- `test_type` (string): Filter by test type

### GET /api/ai/test/stats
Get comprehensive testing statistics

## Usage Examples

### 1. Test All Providers with Simple Connectivity Check
```bash
curl -X POST "http://localhost:8000/api/ai/test" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ish-chat-secure-key-2024" \
  -d '{
    "test_type": "simple",
    "timeout": 15,
    "parallel": true
  }'
```

### 2. Compare Specific Providers with Complex Task
```bash
curl -X POST "http://localhost:8000/api/ai/test" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ish-chat-secure-key-2024" \
  -d '{
    "providers": ["zai", "anthropic"],
    "test_type": "complex",
    "include_costs": true,
    "timeout": 45,
    "parallel": true
  }'
```

### 3. Code Generation Test
```bash
curl -X POST "http://localhost:8000/api/ai/test" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ish-chat-secure-key-2024" \
  -d '{
    "test_type": "code",
    "save_results": true,
    "timeout": 30
  }'
```

### 4. Custom Prompt Test
```bash
curl -X POST "http://localhost:8000/api/ai/test" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ish-chat-secure-key-2024" \
  -d '{
    "custom_prompt": "Explain quantum computing in terms a high school student can understand",
    "include_costs": true,
    "parallel": false
  }'
```

### 5. Get Test History
```bash
curl -X GET "http://localhost:8000/api/ai/test/history?limit=10&provider=zai" \
  -H "X-API-Key: ish-chat-secure-key-2024"
```

### 6. Get Testing Statistics
```bash
curl -X GET "http://localhost:8000/api/ai/test/stats" \
  -H "X-API-Key: ish-chat-secure-key-2024"
```

## Features

### Cost Estimation
- Supports cost calculation for OpenAI, Anthropic, ZAI, and Ollama providers
- Uses per-1K token pricing models
- Returns estimated cost in USD

### Quality Scoring
- Automated quality scoring based on response characteristics
- Test-type specific scoring criteria
- Score range: 0.0 to 1.0

### Performance Metrics
- Response time measurement for each provider
- Execution summary with averages
- Parallel vs sequential execution comparison

### Error Handling
- Timeout management per provider
- Graceful error handling with detailed error messages
- Continues testing other providers if one fails

### WebSocket Notifications
Real-time updates for:
- Test started (`ai_test_started`)
- Test completed (`ai_test_completed`)
- Test failed (`ai_test_failed`)

### Database Integration
- Automatic saving of test results (optional)
- Persistent test history
- Provider performance analytics

## Configuration

The endpoint automatically detects and uses all configured AI providers:
- ZAI (智谱AI) - Currently active
- OpenAI - If API key configured
- Anthropic - If API key configured
- Ollama - If enabled for local models

## Error Responses

**401 Unauthorized:**
```json
{
  "detail": "Invalid API key"
}
```

**400 Bad Request:**
```json
{
  "detail": "None of the specified providers are available. Available: ['zai']"
}
```

**503 Service Unavailable:**
```json
{
  "detail": "No AI providers configured"
}
```

**500 Internal Server Error:**
```json
{
  "detail": "AI test failed: [specific error message]"
}
```

## Best Practices

1. **Use parallel execution** for faster testing when comparing multiple providers
2. **Set appropriate timeouts** based on test complexity (15-30s for simple, 45-60s for complex)
3. **Enable cost tracking** when testing paid providers
4. **Save results** for building performance history
5. **Use specific test types** relevant to your use case
6. **Monitor WebSocket events** for real-time testing updates

## Integration with Existing Systems

The AI Test endpoint integrates seamlessly with:
- Database session management
- WebSocket service for real-time notifications
- Existing authentication and API key validation
- Enhanced AI service with multi-provider support
- Analytics tracking for test metrics