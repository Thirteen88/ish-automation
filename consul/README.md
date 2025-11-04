# Consul Service Discovery for ISH Chat System

This implementation provides comprehensive service discovery, health checking, and monitoring for the multi-instance ISH Chat system using HashiCorp Consul.

## Overview

The Consul integration enables:

- **Automatic Service Registration**: All AI provider instances and core services automatically register with Consul
- **Dynamic Service Discovery**: Services can discover and connect to each other dynamically
- **Health Checking**: Comprehensive health monitoring with automatic failover
- **Load Balancing**: Intelligent load distribution across healthy instances
- **Monitoring & Alerting**: Real-time monitoring with Prometheus metrics and alerting
- **High Availability**: Multi-node Consul cluster with automatic leader election

## Architecture

### Components

1. **Consul Cluster**: 3-node high-availability cluster
2. **Service Registry**: Automatic registration/deregistration of services
3. **Service Discovery**: Client-side service discovery with multiple strategies
4. **Health Integration**: Comprehensive health checking with Consul integration
5. **Monitoring Service**: Prometheus metrics and alerting
6. **Enhanced Services**: Existing services enhanced with Consul integration

### Service Types

- **AI Providers**: ZAI, OpenAI, Claude, Perplexity instances
- **Core Services**: Instance Manager, Intelligent Router, Load Balancer
- **Support Services**: Database, Cache, Monitoring, API Gateway

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Python 3.8+ with required dependencies
- Redis (for health metrics storage)

### 1. Start Consul Cluster

```bash
# Navigate to consul directory
cd /home/gary/multi-model-orchestrator/ish-chat-backend/consul

# Start the cluster
./scripts/start_consul_cluster.sh start
```

This will start a 3-node Consul cluster with:
- Consul servers on ports 8501, 8511, 8521
- Load balancer on port 8500
- Automatic ACL configuration

### 2. Configure Environment

```bash
# Set Consul environment variables
export CONSUL_HTTP_ADDR=http://localhost:8500
export CONSUL_HTTP_TOKEN=$(cat ~/.consul_cluster_tokens | grep CONSUL_MASTER_TOKEN | cut -d= -f2)
```

### 3. Access Consul UI

Open http://localhost:8500 in your browser to access the Consul UI.

## Configuration

### Service Registration

Services automatically register with Consul using the following configuration:

```python
from src.services.consul_integration_service import get_consul_integration_service

# Get integration service
consul_integration = get_consul_integration_service(
    consul_host="localhost",
    consul_port=8500,
    consul_token=CONSUL_MASTER_TOKEN
)

# Start the service
await consul_integration.start()

# Register core services
await consul_integration.register_core_services(
    api_gateway_host="localhost",
    api_gateway_port=8000,
    instance_manager_host="localhost",
    instance_manager_port=8001,
    router_host="localhost",
    router_port=8002,
    load_balancer_host="localhost",
    load_balancer_port=8003
)
```

### Service Discovery

Use service discovery to find and connect to services:

```python
from src.services.consul_service_discovery import get_consul_service_discovery

# Get discovery client
discovery = get_consul_service_discovery()

# Discover AI instances
instances = await discovery.discover_ai_instances(
    provider_type=ProviderType.OPENAI,
    model_name="gpt-4",
    only_healthy=True
)

# Select best instance
selected_instance = await discovery.select_ai_instance(
    provider_type=ProviderType.OPENAI,
    strategy=DiscoveryStrategy.HEALTH_BASED
)
```

### Health Checking

Configure health checks for services:

```python
from src.services.consul_health_integration import ConsulHealthCheck, HealthCheckType

# Create health check
health_check = ConsulHealthCheck(
    check_id="api-gateway-health",
    name="API Gateway Health Check",
    service_id="api-gateway-1",
    check_type=HealthCheckType.HTTP,
    target="http://localhost:8000/health",
    interval="30s",
    timeout="10s"
)

# Register health check
await health_integration.register_health_check(health_check)
```

## Service Integration

### Enhanced Instance Manager

The instance manager is enhanced with Consul integration:

```python
from src.services.enhanced_instance_manager_service import EnhancedInstanceManagerService

# Create enhanced instance manager
enhanced_manager = EnhancedInstanceManagerService(
    base_instance_manager=base_manager,
    consul_integration_service=consul_integration
)

# Use with Consul discovery
result = await enhanced_manager.select_instance_for_request(
    db, criteria, strategy, use_consul_discovery=True
)
```

### Enhanced Intelligent Router

The intelligent router uses Consul for optimal routing:

```python
from src.services.enhanced_intelligent_router import create_enhanced_intelligent_router

# Create enhanced router
enhanced_router = create_enhanced_intelligent_router(
    base_router=base_router,
    consul_integration_service=consul_integration
)

# Route with Consul priority
decision = await enhanced_router.route_query_with_consul_priority(
    query="Hello, how are you?",
    preferred_provider="openai"
)
```

## Monitoring and Alerting

### Prometheus Metrics

The system exports comprehensive metrics:

- Service health status
- Response times
- Error rates
- Consul cluster status
- Active alerts

Access metrics at http://localhost:9090/metrics

### Monitoring Dashboard

Get comprehensive monitoring data:

```python
from src.services.consul_monitoring_service import get_consul_monitoring_service

# Get monitoring service
monitoring = get_consul_monitoring_service(
    consul_integration_service=consul_integration,
    redis_client=redis_client
)

# Get dashboard data
dashboard = await monitoring.get_monitoring_dashboard()
```

### Alerting

Configure alerts for various conditions:

- Service downtime
- High latency
- Error rate thresholds
- Resource usage
- Consul cluster issues

## Deployment

### Production Deployment

For production deployment:

1. **Use External Consul**: Deploy Consul cluster on dedicated infrastructure
2. **Secure ACLs**: Use strong ACL tokens and encryption
3. **High Availability**: Deploy at least 3 Consul servers
4. **Monitoring**: Set up comprehensive monitoring and alerting
5. **Backup**: Configure regular backups of Consul data

### Docker Deployment

```yaml
version: '3.8'
services:
  ish-chat-app:
    build: .
    environment:
      - CONSUL_HTTP_ADDR=http://consul-server:8500
      - CONSUL_HTTP_TOKEN=${CONSUL_AGENT_TOKEN}
    depends_on:
      - consul-server

  consul-server:
    image: consul:1.17.1
    command: consul agent -server -bootstrap-expect=1 -client=0.0.0.0
    environment:
      - CONSUL_BIND_INTERFACE=eth0
    ports:
      - "8500:8500"
```

### Kubernetes Deployment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: consul-config
data:
  consul.json: |
    {
      "datacenter": "ish-chat-dc1",
      "data_dir": "/consul/data",
      "log_level": "INFO",
      "server": true,
      "bootstrap_expect": 1,
      "ui": true,
      "bind_addr": "0.0.0.0",
      "client_addr": "0.0.0.0"
    }

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: consul
spec:
  replicas: 1
  selector:
    matchLabels:
      app: consul
  template:
    metadata:
      labels:
        app: consul
    spec:
      containers:
      - name: consul
        image: consul:1.17.1
        ports:
        - containerPort: 8500
        - containerPort: 8600
        volumeMounts:
        - name: consul-config
          mountPath: /consul/config
      volumes:
      - name: consul-config
        configMap:
          name: consul-config
```

## Management

### Cluster Management

```bash
# Start cluster
./scripts/start_consul_cluster.sh start

# Stop cluster
./scripts/start_consul_cluster.sh stop

# Restart cluster
./scripts/start_consul_cluster.sh restart

# View logs
./scripts/start_consul_cluster.sh logs

# Check status
./scripts/start_consul_cluster.sh status

# Clean up (removes all data)
./scripts/start_consul_cluster.sh clean
```

### Service Management

```bash
# List all services
curl -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" \
  http://localhost:8500/v1/catalog/services

# Get service health
curl -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" \
  http://localhost:8500/v1/health/service/ai-provider-openai

# Deregister service
curl -X PUT -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" \
  http://localhost:8500/v1/agent/service/deregister/service-id
```

### Troubleshooting

#### Common Issues

1. **Services not registering**
   - Check Consul connectivity: `curl http://localhost:8500/v1/status/leader`
   - Verify ACL tokens: Check `~/.consul_cluster_tokens`
   - Check service logs for registration errors

2. **Health checks failing**
   - Verify health check endpoints are accessible
   - Check health check configuration
   - Review service logs for health check errors

3. **Service discovery not working**
   - Ensure services are registered: `curl http://localhost:8500/v1/catalog/services`
   - Check service health status
   - Verify DNS resolution: `dig @localhost -p 8600 service-name.service.consul`

#### Logs

```bash
# Consul logs
docker-compose -f config/docker-compose.consul.yml logs -f consul-server-1

# ISH Chat service logs
docker-compose logs -f ish-chat-app
```

## Security

### ACL Configuration

- **Master Token**: Full administrative access
- **Agent Token**: Service registration and health checking
- **Anonymous Token**: Read-only access for service discovery

### Network Security

- **TLS**: Enable TLS for all Consul communication
- **Firewall**: Restrict access to Consul ports
- **VPC**: Deploy Consul in isolated network segments

### Best Practices

1. Use strong, randomly generated ACL tokens
2. Enable TLS encryption for all communication
3. Regularly rotate ACL tokens
4. Monitor Consul cluster health
5. Implement backup and disaster recovery procedures

## Performance

### Optimization

- **Connection Pooling**: Reuse HTTP connections to Consul
- **Caching**: Cache service discovery results
- **Batch Operations**: Batch service registrations
- **Health Check Tuning**: Optimize health check intervals

### Scaling

- **Horizontal Scaling**: Add more Consul servers for high availability
- **Service Scaling**: Automatically scale services based on load
- **Load Balancing**: Use Consul's built-in load balancing capabilities

## API Reference

### Service Registry API

```python
# Register service
await registry.register_service(service_definition)

# Deregister service
await registry.deregister_service(service_id)

# Discover services
services = await registry.discover_services(
    service_name="ai-provider-openai",
    only_passing=True
)
```

### Service Discovery API

```python
# Select AI instance
instance = await discovery.select_ai_instance(
    provider_type=ProviderType.OPENAI,
    strategy=DiscoveryStrategy.HEALTH_BASED
)

# Get service URL
url = await discovery.get_service_url(
    service_name="instance-manager",
    path="/health"
)
```

### Monitoring API

```python
# Get monitoring dashboard
dashboard = await monitoring.get_monitoring_dashboard()

# Create alert
alert = await monitoring.create_alert(
    alert_type=AlertType.SERVICE_DOWN,
    severity=AlertSeverity.CRITICAL,
    service_id="service-id",
    title="Service Down",
    description="Service is not responding"
)
```

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review Consul documentation: https://www.consul.io/docs
3. Check service logs for detailed error information
4. Verify network connectivity and ACL configurations

## License

This Consul integration is part of the ISH Chat system and follows the same licensing terms.