# ISH Chat Instance Manager Documentation

## Overview

The ISH Chat Instance Manager is a comprehensive, production-ready system for managing multiple AI model instances with auto-scaling, health monitoring, and intelligent load balancing. It provides maximum performance, uptime, and full high availability for AI model operations.

## Architecture

### Core Components

1. **Instance Manager Service** - Core service for managing AI model instances
2. **Health Monitoring Service** - Continuous health checks and monitoring
3. **Load Balancer Service** - Intelligent request routing with failover
4. **Auto-Scaling Service** - Dynamic capacity management
5. **Performance Monitoring Service** - Metrics collection and analysis
6. **Configuration Service** - Centralized configuration management
7. **Redis Cache Service** - Caching and distributed coordination
8. **Prometheus Metrics** - Observability and monitoring

### Database Schema

The system uses SQLAlchemy ORM with the following main entities:

- **AIInstance** - Individual AI model instances
- **HealthCheck** - Health check results
- **InstanceMetrics** - Performance metrics
- **ScalingEvent** - Auto-scaling events
- **RequestLog** - Request tracking and analytics
- **ProviderGroup** - Logical grouping of instances
- **LoadBalancerConfig** - Load balancing configuration

## Features

### 1. Instance Management

- **Registration & Discovery**: Automatic registration and discovery of AI instances
- **Multi-Provider Support**: Support for ZAI, OpenAI, Anthropic, and Perplexity
- **Configuration Management**: Centralized configuration for all instances
- **Lifecycle Management**: Complete instance lifecycle management

### 2. Health Monitoring

- **Multi-Type Health Checks**: Basic, load, latency, and comprehensive checks
- **Real-time Monitoring**: Continuous health monitoring with configurable intervals
- **Alerting**: Automatic alerting for health issues
- **Historical Tracking**: Complete health history and trends

### 3. Load Balancing

- **Multiple Strategies**: Round-robin, weighted, least connections, health-based
- **Intelligent Failover**: Automatic failover with circuit breakers
- **Session Affinity**: Optional session-based routing
- **Performance Optimization**: Real-time performance-based routing

### 4. Auto-Scaling

- **Dynamic Scaling**: Automatic scaling based on load and performance
- **Multiple Triggers**: Load, response time, error rate, queue length
- **Cooldown Management**: Configurable cooldown periods
- **Predictive Scaling**: Optional predictive scaling capabilities

### 5. Performance Monitoring

- **Comprehensive Metrics**: Request rates, response times, success rates
- **Real-time Analytics**: Real-time performance data and trends
- **Historical Analysis**: Long-term performance analysis
- **Performance Reports**: Automated performance reporting

### 6. Caching & Coordination

- **Redis Integration**: Redis-based caching and coordination
- **Distributed Locks**: Distributed locking for coordination
- **Rate Limiting**: Built-in rate limiting capabilities
- **Session Management**: Distributed session management

## Installation

### Prerequisites

- Python 3.8+
- PostgreSQL or SQLite
- Redis (optional but recommended)
- Docker (for containerized deployment)

### Setup

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd ish-chat-backend
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize Database**
   ```bash
   python -m alembic upgrade head
   ```

5. **Start the Application**
   ```bash
   python src/main_instance_manager.py
   ```

### Docker Deployment

```bash
# Build image
docker build -t ish-chat-instance-manager .

# Run with Docker Compose
docker-compose up -d
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost/ish_chat

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# Instance Manager
INSTANCE_MANAGER_DEBUG=false
INSTANCE_MANAGER_LOG_LEVEL=INFO

# API Configuration
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
BACKEND_API_KEY=your-api-key

# AI Provider Configuration
ZAI_API_KEY=your-zai-key
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### Configuration Files

Configuration is managed through the `ConfigurationService` with support for:

- JSON configuration files
- YAML configuration files
- Environment variables
- Runtime configuration updates

Example `config/instance_manager_config.json`:

```json
{
  "global": {
    "instance_manager": {
      "debug": false,
      "log_level": "INFO",
      "max_concurrent_health_checks": 10
    }
  },
  "providers": {
    "zai": {
      "enabled": true,
      "default_models": ["glm-4", "glm-4-coding-max"],
      "rate_limits": {
        "requests_per_minute": 60,
        "tokens_per_minute": 10000
      }
    }
  },
  "load_balancer": {
    "strategy": "health_based",
    "health_check_interval": 30,
    "failover_enabled": true
  },
  "auto_scaling": {
    "enabled": true,
    "min_instances": 1,
    "max_instances": 10,
    "scale_up_threshold": 0.8
  },
  "monitoring": {
    "enabled": true,
    "metrics_collection_interval": 60,
    "alert_thresholds": {
      "response_time_warning": 2000,
      "error_rate_warning": 5
    }
  }
}
```

## API Reference

### Instance Management Endpoints

#### Register Instance
```http
POST /api/instances/register
Content-Type: application/json

{
  "provider_type": "zai",
  "model_name": "glm-4",
  "instance_name": "production-zai-1",
  "endpoint_url": "https://api.zhipu.ai/v4",
  "api_key": "your-api-key",
  "max_concurrent_requests": 10,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

#### List Instances
```http
GET /api/instances?provider_type=zai&status=healthy&limit=100&offset=0
```

#### Get Instance Details
```http
GET /api/instances/{instance_id}
```

#### Update Instance Load
```http
PUT /api/instances/{instance_id}/load?current_load=5
```

#### Deregister Instance
```http
DELETE /api/instances/{instance_id}
```

### Health Monitoring Endpoints

#### Trigger Health Check
```http
POST /api/instances/{instance_id}/health-check?check_type=basic
```

#### Get Health Status
```http
GET /api/instances/{instance_id}/health
```

#### Get Health Summary
```http
GET /api/instances/health-summary
```

### Load Balancer Endpoints

#### Select Instance for Request
```http
POST /api/instances/select-instance
Content-Type: application/json

{
  "provider_type": "zai",
  "model_name": "glm-4",
  "strategy": "health_based",
  "min_health_score": 0.7
}
```

#### Get Load Balancer Metrics
```http
GET /api/instances/load-balancer/metrics
```

### Auto-Scaling Endpoints

#### Create Provider Group
```http
POST /api/instances/groups
Content-Type: application/json

{
  "group_name": "zai-production",
  "provider_type": "zai",
  "min_instances": 2,
  "max_instances": 10,
  "auto_scaling_enabled": true,
  "scale_up_threshold": 0.8
}
```

#### Configure Auto-Scaling
```http
POST /api/instances/groups/{group_id}/auto-scaling
Content-Type: application/json

{
  "enabled": true,
  "min_instances": 2,
  "max_instances": 10,
  "scale_up_threshold": 0.8,
  "scale_down_threshold": 0.2
}
```

## Usage Examples

### Basic Instance Registration

```python
import httpx

# Register a new ZAI instance
instance_data = {
    "provider_type": "zai",
    "model_name": "glm-4",
    "instance_name": "production-zai-1",
    "endpoint_url": "https://api.zhipu.ai/v4",
    "api_key": "your-api-key",
    "max_concurrent_requests": 10
}

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/instances/register",
        json=instance_data
    )
    instance = response.json()
    print(f"Registered instance: {instance['instance_id']}")
```

### Load Balancing Request

```python
# Select best instance for a request
selection_request = {
    "provider_type": "zai",
    "model_name": "glm-4",
    "strategy": "health_based"
}

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/instances/select-instance",
        json=selection_request
    )
    result = response.json()
    
    selected_instance = result['selected_instance']
    print(f"Selected instance: {selected_instance['instance_id']}")
    print(f"Selection reason: {result['selection_reason']}")
```

### Health Monitoring

```python
# Trigger health check for an instance
async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/instances/{instance_id}/health-check"
    )
    health_result = response.json()
    
    print(f"Health status: {health_result['status']}")
    print(f"Health score: {health_result['score']}")
```

### Auto-Scaling Configuration

```python
# Configure auto-scaling for a provider group
scaling_config = {
    "group_id": 1,
    "enabled": True,
    "min_instances": 2,
    "max_instances": 10,
    "scale_up_threshold": 0.8,
    "scale_down_threshold": 0.2
}

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/instances/groups/1/auto-scaling",
        json=scaling_config
    )
    print(response.json())
```

## Monitoring

### Prometheus Metrics

The system exposes Prometheus metrics on port 9090 by default:

```bash
curl http://localhost:9090/metrics
```

Key metrics include:

- `instance_manager_requests_total` - Total requests processed
- `instance_manager_request_duration_seconds` - Request duration histogram
- `instance_manager_instances_total` - Total instances by status
- `instance_manager_health_checks_total` - Health checks performed
- `instance_manager_scaling_events_total` - Scaling events

### Health Checks

```bash
# Overall system health
curl http://localhost:8000/health

# System status
curl http://localhost:8000/api/instances/status
```

### Logs

The system uses structured logging with configurable levels:

```bash
# View logs
tail -f logs/instance_manager.log

# Filter by level
grep "ERROR" logs/instance_manager.log
```

## Performance Optimization

### Database Optimization

1. **Connection Pooling**: Configure appropriate pool sizes
2. **Indexing**: Ensure proper database indexes
3. **Query Optimization**: Optimize frequently run queries
4. **Cleanup**: Regular cleanup of old data

### Caching Strategy

1. **Redis Caching**: Enable Redis for performance
2. **Cache TTL**: Configure appropriate cache TTL values
3. **Cache Invalidation**: Implement proper cache invalidation
4. **Monitoring**: Monitor cache hit rates

### Load Balancing

1. **Strategy Selection**: Choose optimal load balancing strategy
2. **Health Thresholds**: Configure appropriate health thresholds
3. **Failover Settings**: Optimize failover configurations
4. **Circuit Breakers**: Enable circuit breakers for stability

## Security

### API Security

1. **Authentication**: Use API keys for authentication
2. **Authorization**: Implement proper authorization
3. **Rate Limiting**: Configure rate limiting
4. **CORS**: Configure CORS appropriately

### Data Security

1. **API Key Encryption**: Encrypt stored API keys
2. **Secure Communication**: Use HTTPS/TLS
3. **Data Access**: Limit data access permissions
4. **Audit Logging**: Enable audit logging

## Troubleshooting

### Common Issues

1. **Instance Registration Failures**
   - Check API key validity
   - Verify endpoint accessibility
   - Review configuration settings

2. **Health Check Failures**
   - Check instance connectivity
   - Review health check configuration
   - Monitor response times

3. **Load Balancing Issues**
   - Verify instance health status
   - Check load balancing strategy
   - Review failover configuration

4. **Auto-Scaling Problems**
   - Monitor scaling metrics
   - Check threshold configurations
   - Review cooldown periods

### Debug Mode

Enable debug mode for detailed logging:

```bash
export INSTANCE_MANAGER_DEBUG=true
export INSTANCE_MANAGER_LOG_LEVEL=DEBUG
python src/main_instance_manager.py
```

### Health Diagnostics

Run comprehensive health diagnostics:

```bash
curl http://localhost:8000/api/instances/status | jq .
```

## Development

### Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_instance_manager.py -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html
```

### Code Style

```bash
# Format code
black src/ tests/

# Check linting
flake8 src/ tests/

# Type checking
mypy src/
```

### Database Migrations

```bash
# Create migration
alembic revision --autogenerate -m "Add new feature"

# Apply migration
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

## Deployment

### Production Deployment

1. **Environment Setup**: Configure production environment
2. **Database Setup**: Set up production database
3. **Redis Setup**: Configure Redis cluster
4. **Load Balancer**: Configure external load balancer
5. **Monitoring**: Set up monitoring and alerting
6. **Backup**: Implement backup strategy

### Docker Deployment

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src/ ./src/
COPY config/ ./config/

EXPOSE 8000
CMD ["python", "src/main_instance_manager.py"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: instance-manager
spec:
  replicas: 3
  selector:
    matchLabels:
      app: instance-manager
  template:
    metadata:
      labels:
        app: instance-manager
    spec:
      containers:
      - name: instance-manager
        image: ish-chat-instance-manager:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: REDIS_HOST
          value: "redis-service"
```

## Support

### Documentation

- API Documentation: Available at `/docs` endpoint
- Configuration Guide: See configuration section
- Troubleshooting Guide: See troubleshooting section

### Community

- GitHub Issues: Report bugs and feature requests
- Discussions: Community discussions and Q&A
- Wiki: Additional documentation and guides

### Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request
5. Wait for review and merge

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

### Version 1.0.0

- Initial release
- Complete instance management system
- Health monitoring and auto-scaling
- Load balancing and failover
- Performance monitoring and metrics
- Configuration management
- Redis integration
- Prometheus metrics
- Comprehensive API
- Full documentation