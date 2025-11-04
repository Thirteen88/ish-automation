# Intelligent Query Router Documentation

## Overview

The Intelligent Query Router is a sophisticated routing system for the ISH Chat multi-instance AI backend that optimally routes user queries to the most suitable AI model instances based on query characteristics, model specializations, performance metrics, and cost considerations.

## Architecture

### Core Components

1. **Query Classifier** - Analyzes queries to determine type, complexity, and requirements
2. **Routing Decision Engine** - Selects optimal instances using various strategies
3. **Model Specialization Registry** - Maintains model capabilities and specializations
4. **Performance Monitor** - Tracks metrics and optimizes routing decisions
5. **Configuration Service** - Manages routing policies and system settings
6. **Circuit Breaker** - Handles failures and provides fallback mechanisms

### System Architecture

```
User Query → Query Classifier → Routing Decision Engine → Selected AI Instance
                ↓                           ↓
         Query Analysis            Load Balancer & Health Checks
                ↓                           ↓
         Model Specialization → Performance Monitoring & Optimization
```

## Features

### Query Classification

The system classifies queries into the following types:

- **Simple Q&A** - Basic factual questions
- **Complex Reasoning** - Multi-step analysis and problem-solving
- **Code Generation** - Programming and development tasks
- **Creative Writing** - Content creation and storytelling
- **Data Analysis** - Mathematical and statistical analysis
- **Translation** - Language translation tasks
- **Summarization** - Text condensation and overview
- **Research** - Information gathering and synthesis
- **Chinese Content** - Chinese language queries
- **Multimodal** - Image and document analysis
- **Automation** - Android automation tasks
- **General** - Default category

### Complexity Levels

Queries are rated on complexity from 1 (Very Low) to 5 (Very High) based on:

- Query length and structure
- Presence of complex reasoning indicators
- Technical terminology
- Multi-step requirements

### Routing Strategies

#### Performance-Based Routing
- Prioritizes fastest response times
- Considers success rates and health status
- Optimal for real-time applications

#### Cost-Based Routing
- Minimizes operational costs
- Considers token pricing and usage
- Suitable for budget-constrained applications

#### Specialization-Based Routing
- Matches queries to models with specific expertise
- Leverages model strengths and avoids weaknesses
- Provides highest quality responses

#### Balanced Routing
- Combines performance, cost, and specialization
- Uses weighted scoring algorithm
- Default strategy for general use

#### Round-Robin Routing
- Simple load distribution
- Fallback strategy for basic operation

#### Predictive Routing (Future)
- Machine learning-based predictions
- Learns from historical performance
- Adapts to changing patterns

### Model Specializations

The system maintains detailed specializations for each AI model:

#### ZAI (智谱AI) - GLM-4
- **Strengths**: Chinese content, general queries
- **Weaknesses**: Code generation, multimodal tasks
- **Cost**: $0.01 per 1K tokens
- **Response Time**: ~800ms

#### OpenAI - GPT-4
- **Strengths**: Complex reasoning, code generation, data analysis
- **Weaknesses**: Chinese content (compared to ZAI)
- **Cost**: $0.03 per 1K tokens
- **Response Time**: ~1200ms

#### OpenAI - GPT-3.5 Turbo
- **Strengths**: Simple Q&A, translation, summarization
- **Weaknesses**: Complex reasoning, code generation
- **Cost**: $0.002 per 1K tokens
- **Response Time**: ~600ms

#### Anthropic - Claude
- **Strengths**: Complex reasoning, creative writing, analysis
- **Weaknesses**: Chinese content
- **Cost**: $0.015 per 1K tokens
- **Response Time**: ~1000ms

#### Perplexity
- **Strengths**: Research, current information
- **Weaknesses**: Code generation, automation
- **Cost**: $0.02 per 1K tokens
- **Response Time**: ~2000ms

## Performance Monitoring

### Metrics Tracked

#### Routing Metrics
- Total requests and success rates
- Average routing time (target: <100ms)
- Strategy distribution
- Query type distribution

#### Instance Metrics
- Response times (average, P95, P99)
- Success and error rates
- Current load and utilization
- Cost efficiency

#### Quality Metrics
- Routing confidence scores
- User satisfaction ratings
- Model performance comparisons

### Performance Optimization

The system continuously optimizes routing based on:

1. **Real-time Performance Data** - Response times, success rates
2. **Cost Analysis** - Token usage and pricing
3. **User Feedback** - Satisfaction scores and explicit feedback
4. **Error Patterns** - Failure analysis and recovery

### Circuit Breaker Pattern

Each AI instance is protected by a circuit breaker that:

- **Opens** after consecutive failures (default: 5)
- **Closes** after successful recovery tests
- **Provides timeout protection** (default: 60 seconds)
- **Prevents cascading failures**

## Configuration

### Routing Policies

Define custom routing rules based on:

- Query types and complexity
- Language preferences
- User segments
- Time windows
- Cost constraints

Example policy:
```yaml
policy_id: "chinese_users_policy"
name: "Chinese Users Optimal Routing"
priority: 8
query_types: [chinese_content, general]
languages: [chinese]
preferred_providers: [zai]
routing_strategy: specialization
max_cost_per_request: 0.02
```

### Cost Configuration

Set budget limits and optimization preferences:

```yaml
cost_budget_monthly: 1000.0  # USD
cost_alert_threshold: 0.8     # Alert at 80%
cost_optimization_enabled: true
cost_weight_in_routing: 0.2
```

### Performance Thresholds

Define acceptable performance levels:

```yaml
max_routing_time: 100.0       # ms
max_response_time: 5000.0     # ms
min_success_rate: 95.0        # %
max_error_rate: 5.0           # %
max_utilization_threshold: 80.0  # %
```

## API Endpoints

### Core Routing

#### POST `/api/v1/router/route`
Route a query to the optimal AI instance.

**Request:**
```json
{
  "query": "What is machine learning?",
  "preferred_provider": "openai",
  "strategy": "balanced",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "query_id": "abc123",
  "selected_instance": {
    "instance_id": "openai_gpt4_1",
    "provider_type": "openai",
    "model_name": "gpt-4",
    "success_rate": 98.0
  },
  "routing_strategy": "balanced",
  "confidence_score": 0.85,
  "estimated_cost": 0.025,
  "estimated_response_time": 1200,
  "query_analysis": {
    "query_type": "simple_qa",
    "complexity": "low",
    "language": "english"
  }
}
```

### Analysis and Monitoring

#### POST `/api/v1/router/analyze`
Analyze a query without routing.

#### GET `/api/v1/router/statistics`
Get comprehensive routing statistics.

#### GET `/api/v1/router/models/specializations`
Get model specializations and capabilities.

### Configuration Management

#### GET `/api/v1/router/config`
Get current routing configuration.

#### PUT `/api/v1/router/config`
Update routing configuration.

#### GET `/api/v1/router/circuit-breakers`
Get circuit breaker status.

#### POST `/api/v1/router/circuit-breakers/update`
Update circuit breaker state.

### Feedback and Learning

#### POST `/api/v1/router/feedback`
Submit feedback for routing decisions.

## Integration Guide

### Basic Integration

```python
from src.services.routing_enhanced_ai_service import get_routing_enhanced_ai_service
from src.services.instance_manager_service import InstanceManagerService
from src.services.enhanced_ai_service import EnhancedAIService

# Initialize services
instance_manager = InstanceManagerService()
ai_service = EnhancedAIService()
routing_service = get_routing_enhanced_ai_service(instance_manager, ai_service)

# Create routing request
request = RoutingAIRequest(
    prompt="Explain quantum computing",
    routing_strategy=RoutingStrategy.BALANCED,
    enable_routing=True,
    enable_fallback=True
)

# Get routed response
response = await routing_service.generate_response(request)

print(f"Provider: {response.provider}")
print(f"Model: {response.model}")
print(f"Response: {response.response}")
print(f"Routing Time: {response.routing_time_ms}ms")
```

### Advanced Configuration

```python
# Custom routing policy
policy = RoutingPolicy(
    policy_id="cost_sensitive_policy",
    name="Cost Sensitive Routing",
    priority=7,
    query_types=[QueryType.SIMPLE_QA, QueryType.TRANSLATION],
    routing_strategy=RoutingStrategy.COST,
    max_cost_per_request=0.01
)

# Add policy to configuration
config_service = get_router_configuration_service()
config_service.add_routing_policy(policy)
```

### Performance Monitoring

```python
# Get performance dashboard
monitor = get_router_performance_monitor(router)
dashboard = await monitor.get_performance_dashboard()

print(f"Total requests: {dashboard['summary']['total_requests']}")
print(f"Success rate: {dashboard['summary']['success_rate']}%")
print(f"Average response time: {dashboard['summary']['average_response_time']}ms")
```

## Testing

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run all tests
pytest tests/test_intelligent_router.py -v

# Run specific test categories
pytest tests/test_intelligent_router.py::TestQueryClassifier -v
pytest tests/test_intelligent_router.py::TestRoutingPerformance -v
```

### Test Coverage

The test suite covers:

- ✅ Query classification accuracy
- ✅ Routing strategy implementation
- ✅ Circuit breaker functionality
- ✅ Performance requirements (<100ms routing)
- ✅ Cost calculation accuracy
- ✅ Error handling and fallbacks
- ✅ Cache performance
- ✅ Concurrent routing
- ✅ Integration scenarios

### Performance Benchmarks

- **Routing Decision Time**: <100ms (target: 50ms)
- **Query Classification**: <10ms
- **Cache Hit Performance**: <5ms
- **Concurrent Requests**: 100+ simultaneous
- **System Availability**: 99.9%

## Deployment

### Requirements

- Python 3.8+
- Redis (for caching and metrics)
- PostgreSQL (for configuration and logging)
- Access to AI provider APIs

### Configuration Files

1. **router_config.yaml** - Main configuration
2. **model_specializations.yaml** - Model capabilities
3. **routing_policies.yaml** - Custom routing rules

### Environment Variables

```bash
ROUTER_CONFIG_PATH=/path/to/router_config.yaml
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost/router_db
LOG_LEVEL=INFO
```

### Health Checks

- `GET /api/v1/router/health` - System health status
- Circuit breaker monitoring
- Performance metrics validation
- Configuration integrity checks

## Troubleshooting

### Common Issues

#### High Routing Latency
- Check cache configuration
- Verify Redis connectivity
- Monitor system resources
- Review query classification performance

#### Poor Routing Decisions
- Validate model specializations
- Check routing policies
- Review performance metrics
- Analyze feedback data

#### Circuit Breaker Issues
- Check instance health status
- Verify network connectivity
- Review failure thresholds
- Monitor error patterns

### Debug Mode

Enable debug logging:
```python
import logging
logging.getLogger("src.services.intelligent_query_router").setLevel(logging.DEBUG)
```

### Monitoring Dashboards

Key metrics to monitor:

1. **Routing Performance**
   - Average routing time
   - Success rates
   - Cache hit ratios

2. **Cost Management**
   - Daily/monthly costs
   - Cost per request
   - Budget utilization

3. **System Health**
   - Circuit breaker status
   - Instance availability
   - Error rates

## Future Enhancements

### Planned Features

1. **ML-Based Routing**
   - Predictive routing algorithms
   - Automated model selection
   - Dynamic strategy adaptation

2. **A/B Testing Framework**
   - Strategy comparison
   - Performance validation
   - Automated optimization

3. **Advanced Analytics**
   - User behavior analysis
   - Query pattern recognition
   - Performance prediction

4. **Multi-Region Support**
   - Geographic routing
   - Latency optimization
   - Regional cost management

### Extensibility

The system is designed for extensibility:

- **Custom Routing Strategies** - Implement custom algorithms
- **Plugin Architecture** - Add new providers and models
- **Custom Metrics** - Define specialized KPIs
- **Integration APIs** - Connect with external systems

## Support

For support and contributions:

1. **Documentation** - Check this guide and API docs
2. **Issues** - Report bugs via GitHub issues
3. **Discussions** - Use GitHub discussions for questions
4. **Contributing** - Follow contribution guidelines

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Last Updated**: November 2025
**Version**: 1.0.0
**Authors**: ISH Chat Development Team