# Consul Service Discovery Deployment Guide

This guide provides detailed instructions for deploying Consul service discovery for the ISH Chat system in production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Planning the Deployment](#planning-the-deployment)
3. [Consul Cluster Setup](#consul-cluster-setup)
4. [Service Integration](#service-integration)
5. [Security Configuration](#security-configuration)
6. [Monitoring Setup](#monitoring-setup)
7. [Production Considerations](#production-considerations)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum Requirements:**
- 3 servers for Consul cluster (4+ recommended for production)
- 2 CPU cores per Consul server
- 4GB RAM per Consul server
- 50GB SSD storage per Consul server
- Network latency < 10ms between Consul servers

**Recommended Requirements:**
- 5 servers for Consul cluster
- 4 CPU cores per Consul server
- 8GB RAM per Consul server
- 100GB SSD storage per Consul server
- 10Gbps network between Consul servers

### Software Requirements

- **Operating System**: Ubuntu 20.04+ / CentOS 8+ / RHEL 8+
- **Docker**: 20.10+ (for containerized deployment)
- **Python**: 3.8+ (for ISH Chat services)
- **Redis**: 6.0+ (for health metrics)
- **Prometheus**: 2.30+ (for metrics collection)

### Network Requirements

- **Ports**:
  - 8300: Server RPC
  - 8301: Serf LAN
  - 8302: Serf WAN
  - 8500: HTTP API
  - 8600: DNS TCP/UDP

- **Firewall Rules**:
  ```
  # Allow Consul cluster communication
  sudo ufw allow 8300:8600/tcp comment "Consul Cluster"
  sudo ufw allow 8600/udp comment "Consul DNS"
  
  # Allow access from application servers
  sudo ufw allow from 10.0.1.0/24 to any port 8500
  sudo ufw allow from 10.0.1.0/24 to any port 8600
  ```

## Planning the Deployment

### Architecture Decision

**Single Datacenter Deployment:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Consul Server  │◄──►│   Consul Server  │◄──►│   Consul Server  │
│   (Leader)      │    │   (Follower)    │    │   (Follower)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Consul Clients │
                    │ (App Servers)   │
                    └─────────────────┘
```

**Multi-Datacenter Deployment (WAN Federation):**
```
Datacenter A (Primary)               Datacenter B (Secondary)
┌─────────────────┐                ┌─────────────────┐
│   Consul Server  │◄───WAN───►    │   Consul Server  │
└─────────────────┘                └─────────────────┘
         │                                   │
    ┌─────────┐                         ┌─────────┐
    │ Apps    │                         │ Apps    │
    └─────────┘                         └─────────┘
```

### Capacity Planning

**Service Count Estimation:**
- AI Provider Instances: 50-200
- Core Services: 5-10
- Support Services: 3-5
- Total Services: ~200-215

**Storage Requirements:**
- Consul Data: 10GB per server (includes service definitions, health checks, sessions)
- Logs: 5GB per server
- OS & Tools: 20GB per server
- **Total**: 35GB per server minimum

**Network Bandwidth:**
- Intra-cluster: 100Mbps minimum
- Client-to-server: 10Mbps per 100 services
- DNS queries: 1Mbps per 1000 queries/second

## Consul Cluster Setup

### Option 1: Docker Compose (Development/Testing)

```bash
# Clone the repository
git clone <repository-url>
cd ish-chat-backend/consul

# Start the cluster
./scripts/start_consul_cluster.sh start

# Verify cluster status
./scripts/start_consul_cluster.sh status
```

### Option 2: Systemd Service (Production)

**Step 1: Install Consul**

```bash
# Download Consul
wget https://releases.hashicorp.com/consul/1.17.1/consul_1.17.1_linux_amd64.zip
unzip consul_1.17.1_linux_amd64.zip
sudo mv consul /usr/local/bin/

# Verify installation
consul version
```

**Step 2: Create Configuration**

```bash
# Create directories
sudo mkdir -p /opt/consul/{config,data,logs}
sudo useradd --system --home /opt/consul --shell /bin/false consul
sudo chown -R consul:consul /opt/consul

# Create configuration
sudo tee /opt/consul/config/consul.hcl > /dev/null <<EOF
datacenter = "ish-chat-dc1"
data_dir = "/opt/consul/data"
log_level = "INFO"
server = true
bootstrap_expect = 3
ui = true

# Network
bind_addr = "{{ GetInterfaceIP `eth0` }}"
client_addr = "0.0.0.0"
advertise_addr = "{{ GetInterfaceIP `eth0` }}"

# Cluster
retry_join = ["consul-server-1", "consul-server-2", "consul-server-3"]

# Ports
ports {
  dns = 8600
  http = 8500
  https = -1
  grpc = 8502
  server = 8300
  serf_lan = 8301
  serf_wan = 8302
}

# ACLs
acl = {
  enabled = true
  default_policy = "deny"
  enable_token_persistence = true
  down_policy = "extend-cache"
  tokens {
    master = "YOUR_MASTER_TOKEN_HERE"
    agent = "YOUR_AGENT_TOKEN_HERE"
  }
}

# Encryption
encrypt = "YOUR_ENCRYPTION_KEY_HERE"
verify_incoming = true
verify_outgoing = true
verify_server_hostname = true
ca_file = "/opt/consul/config/tls/ca.pem"
cert_file = "/opt/consul/config/tls/server.pem"
key_file = "/opt/consul/config/tls/server-key.pem"

# Performance
performance {
  raft_multiplier = 1
}

# Telemetry
telemetry {
  enable_host_metrics = true
  prometheus_retention_time = "24h"
}
EOF
```

**Step 3: Create Systemd Service**

```bash
sudo tee /etc/systemd/system/consul.service > /dev/null <<EOF
[Unit]
Description=Consul Agent
Documentation=https://www.consul.io/docs/
Wants=network-online.target
After=network-online.target

[Service]
Type=notify
User=consul
Group=consul
ExecStart=/usr/local/bin/consul agent -config-dir=/opt/consul/config
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=process
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable consul
sudo systemctl start consul
```

**Step 4: Initialize ACLs**

```bash
# Generate encryption key
consul keygen > /opt/consul/config/encrypt-key
sudo chown consul:consul /opt/consul/config/encrypt-key

# Bootstrap ACLs
export CONSUL_HTTP_ADDR=http://localhost:8500
consul acl bootstrap
```

### Option 3: Kubernetes Deployment

**Step 1: Create Namespace**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: consul
```

**Step 2: Create ConfigMap**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: consul-config
  namespace: consul
data:
  consul.json: |
    {
      "datacenter": "ish-chat-dc1",
      "data_dir": "/consul/data",
      "log_level": "INFO",
      "server": true,
      "bootstrap_expect": 3,
      "ui": true,
      "bind_addr": "0.0.0.0",
      "client_addr": "0.0.0.0",
      "acl": {
        "enabled": true,
        "default_policy": "deny",
        "enable_token_persistence": true
      },
      "connect": {
        "enabled": false
      },
      "ports": {
        "dns": 8600,
        "http": 8500,
        "https": -1,
        "grpc": 8502,
        "server": 8300,
        "serf_lan": 8301
      }
    }
```

**Step 3: Create StatefulSet**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: consul
  namespace: consul
spec:
  serviceName: consul
  replicas: 3
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
          name: http
        - containerPort: 8600
          name: dns
          protocol: UDP
        env:
        - name: CONSUL_BIND_INTERFACE
          value: "eth0"
        - name: CONSUL_HTTP_ADDR
          value: "0.0.0.0:8500"
        volumeMounts:
        - name: consul-config
          mountPath: /consul/config
        - name: consul-data
          mountPath: /consul/data
      volumes:
      - name: consul-config
        configMap:
          name: consul-config
  volumeClaimTemplates:
  - metadata:
      name: consul-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 50Gi
```

**Step 4: Create Services**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: consul
  namespace: consul
spec:
  selector:
    app: consul
  ports:
  - name: http
    port: 8500
    targetPort: 8500
  - name: dns
    port: 8600
    targetPort: 8600
    protocol: UDP

---
apiVersion: v1
kind: Service
metadata:
  name: consul-ui
  namespace: consul
spec:
  type: LoadBalancer
  selector:
    app: consul
  ports:
  - name: http
    port: 8500
    targetPort: 8500
```

## Service Integration

### Step 1: Update Requirements

Add Consul dependencies to `requirements.txt`:

```txt
python-consul==1.1.0
aiohttp==3.9.1
redis==5.0.1
prometheus-client==0.18.0
```

### Step 2: Configure Environment Variables

```bash
# Consul Configuration
CONSUL_HOST=localhost
CONSUL_PORT=8500
CONSUL_TOKEN=your_consul_token
CONSUL_DATACENTER=ish-chat-dc1

# Service Configuration
SERVICE_NAME=ish-chat-api
SERVICE_HOST=0.0.0.0
SERVICE_PORT=8000
SERVICE_TAGS=api,ish-chat

# Health Check Configuration
HEALTH_CHECK_INTERVAL=30s
HEALTH_CHECK_TIMEOUT=10s
HEALTH_CHECK_DEREGISTER_AFTER=60s
```

### Step 3: Integrate with Main Application

```python
# main.py
import asyncio
from src.services.consul_integration_service import get_consul_integration_service
from src.config.settings import settings

async def main():
    # Initialize Consul integration
    consul_integration = get_consul_integration_service(
        consul_host=settings.consul_host,
        consul_port=settings.consul_port,
        consul_token=settings.consul_token
    )
    
    # Start Consul services
    await consul_integration.start()
    
    # Register core services
    await consul_integration.register_core_services(
        api_gateway_host=settings.api_gateway_host,
        api_gateway_port=settings.api_gateway_port,
        instance_manager_host=settings.instance_manager_host,
        instance_manager_port=settings.instance_manager_port,
        router_host=settings.router_host,
        router_port=settings.router_port,
        load_balancer_host=settings.load_balancer_host,
        load_balancer_port=settings.load_balancer_port
    )
    
    # Start the application
    app = create_app()
    
    # Setup shutdown
    @app.on_event("shutdown")
    async def shutdown_event():
        await consul_integration.stop()
    
    # Run the application
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)

if __name__ == "__main__":
    asyncio.run(main())
```

### Step 4: Update Service Endpoints

```python
# Example: Update AI provider service to use Consul discovery
from src.services.consul_service_discovery import get_consul_service_discovery

class AIProviderService:
    def __init__(self):
        self.consul_discovery = get_consul_service_discovery()
    
    async def get_provider_endpoint(self, provider_type: str, model_name: str):
        endpoint = await self.consul_discovery.select_ai_instance(
            provider_type=ProviderType(provider_type),
            model_name=model_name,
            strategy=DiscoveryStrategy.HEALTH_BASED
        )
        
        if not endpoint:
            raise ValueError(f"No healthy {provider_type} instances found")
        
        return endpoint.endpoint_url
```

## Security Configuration

### Step 1: Generate TLS Certificates

```bash
# Create certificate authority
openssl genrsa -out ca-key.pem 2048
openssl req -x509 -new -nodes -key ca-key.pem -days 3650 -out ca.pem -subj "/C=US/ST=CA/L=San Francisco/O=Consul/OU=Consul CA/CN=Consul CA"

# Generate server certificates
openssl genrsa -out server-key.pem 2048
openssl req -new -key server-key.pem -out server.csr -subj "/C=US/ST=CA/L=San Francisco/O=Consul/OU=Consul Server/CN=server.dc1.consul"
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server.pem -days 3650 -extensions v3_req -extfile <(cat <<EOF
[v3_req]
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = server.dc1.consul
DNS.2 = localhost
IP.1 = 127.0.0.1
IP.2 = <server-ip>
EOF
)

# Generate client certificates
openssl genrsa -out client-key.pem 2048
openssl req -new -key client-key.pem -out client.csr -subj "/C=US/ST=CA/L=San Francisco/O=Consul/OU=Consul Client/CN=client.dc1.consul"
openssl x509 -req -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out client.pem -days 3650
```

### Step 2: Configure ACLs

```bash
# Create policies
cat > anonymous-policy.hcl <<EOF
key_prefix "" {
  policy = "read"
}

service_prefix "" {
  policy = "read"
}

node_prefix "" {
  policy = "read"
}
EOF

# Create agent policy
cat > agent-policy.hcl <<EOF
agent "" {
  policy = "write"
}

node "" {
  policy = "write"
}

service "" {
  policy = "write"
}
EOF

# Apply policies using Consul API
consul acl policy create -name anonymous -rules @anonymous-policy.hcl
consul acl policy create -name agent -rules @agent-policy.hcl

# Create tokens
consul acl token create -description "Agent Token" -policy-name agent
consul acl token create -description "Anonymous Token" -policy-name anonymous
```

### Step 3: Configure Gossip Encryption

```bash
# Generate encryption key
consul keygen > /opt/consul/config/encrypt-key

# Add to consul.hcl
encrypt = "$(cat /opt/consul/config/encrypt-key)"
verify_incoming = true
verify_outgoing = true
verify_server_hostname = true
```

## Monitoring Setup

### Step 1: Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'consul'
    static_configs:
      - targets: ['localhost:8500']
    metrics_path: '/v1/agent/metrics'
    params:
      format: ['prometheus']
    consul_sd_configs:
      - server: 'localhost:8500'
        services: []
```

### Step 2: Grafana Dashboard

Import the Consul dashboard from Grafana.com:
- Consul Cluster Dashboard: ID 10617
- Consul Nodes Dashboard: ID 10618

### Step 3: Alertmanager Rules

```yaml
# consul-alerts.yml
groups:
- name: consul_alerts
  rules:
  - alert: ConsulServiceDown
    expr: consul_up == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Consul service {{ $labels.service }} is down"
      description: "Consul service {{ $labels.service }} on {{ $labels.instance }} has been down for more than 1 minute."

  - alert: ConsulNodeHealthCritical
    expr: consul_node_health_critical > 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Consul node health is critical"
      description: "Consul node {{ $labels.node }} has {{ $value }} critical health checks."

  - alert: ConsulLeaderElectionTimeout
    expr: consul_autopilot_healthy == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Consul leader election timeout"
      description: "Consul cluster has no healthy leader."
```

## Production Considerations

### Backup Strategy

```bash
#!/bin/bash
# backup_consul.sh

BACKUP_DIR="/backup/consul"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Snapshot Consul data
consul snapshot save $BACKUP_DIR/consul-snapshot-$DATE.snap

# Backup configuration
tar -czf $BACKUP_DIR/consul-config-$DATE.tar.gz /opt/consul/config/

# Clean up old backups (keep 7 days)
find $BACKUP_DIR -name "*.snap" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

### Disaster Recovery

```bash
#!/bin/bash
# restore_consul.sh

SNAPSHOT_FILE=$1
CONFIG_BACKUP=$2

if [ -z "$SNAPSHOT_FILE" ] || [ -z "$CONFIG_BACKUP" ]; then
    echo "Usage: $0 <snapshot_file> <config_backup>"
    exit 1
fi

# Stop Consul
sudo systemctl stop consul

# Restore configuration
sudo tar -xzf $CONFIG_BACKUP -C /

# Clear data directory
sudo rm -rf /opt/consul/data/*

# Restore snapshot
consul snapshot restore $SNAPSHOT_FILE

# Start Consul
sudo systemctl start consul

# Verify restoration
consul members
```

### Performance Tuning

```hcl
# Performance optimizations in consul.hcl
performance {
  raft_multiplier = 1
  rpc_hold_timeout = "10s"
}

limits {
  http_max_conns_per_client = 200
  http_max_conns_per_client_tls = 500
}

# Increase log level for debugging
log_level = "INFO"

# Enable audit logging
audit {
  enabled = true
  file_path = "/var/log/consul/audit.log"
}
```

### Scaling Guidelines

**Adding New Consul Servers:**

1. Provision new server with same specifications
2. Install and configure Consul
3. Update `retry_join` to include existing servers
4. Start new Consul server
5. Verify cluster health: `consul members`

**Handling Increased Service Load:**

1. Monitor service count: `curl localhost:8500/v1/catalog/services | jq length`
2. Add more Consul servers if service count > 500
3. Consider using Consul Enterprise for larger deployments
4. Implement service sharding if needed

## Troubleshooting

### Common Issues

**1. Consul cluster not forming**

```bash
# Check network connectivity
telnet consul-server-1 8301

# Check logs
journalctl -u consul -f

# Verify configuration
consul validate /opt/consul/config/consul.hcl
```

**2. Services not registering**

```bash
# Check ACL permissions
curl -H "X-Consul-Token: $TOKEN" \
  http://localhost:8500/v1/acl/policies

# Check service logs
grep -i consul /var/log/ish-chat/app.log

# Verify agent connectivity
consul info
```

**3. Health checks failing**

```bash
# Check health check status
curl -H "X-Consul-Token: $TOKEN" \
  http://localhost:8500/v1/health/checks/service-name

# Test health check endpoint manually
curl http://localhost:8000/health

# Check network connectivity
nc -zv localhost 8000
```

**4. High memory usage**

```bash
# Check memory usage
consul info | grep -i memory

# Reduce data retention
consul operator raft list-peers

# Clean up old data
consul kv delete -recurse old-prefix/
```

### Debug Commands

```bash
# Cluster status
consul operator raft list-peers
consul members

# Service catalog
curl localhost:8500/v1/catalog/services
curl localhost:8500/v1/catalog/service/service-name

# Health status
curl localhost:8500/v1/health/state/critical
curl localhost:8500/v1/health/service/service-name

# ACL status
consul acl policy list
consul acl token list

# Performance metrics
curl localhost:8500/v1/agent/metrics?format=prometheus
```

### Log Analysis

```bash
# Filter Consul logs
journalctl -u consul | grep ERROR
journalctl -u consul | grep WARNING

# Monitor service registration
tail -f /var/log/ish-chat/app.log | grep consul

# Network debugging
tcpdump -i any port 8500 -n
```

## Support

For production support:

1. Monitor cluster health 24/7
2. Set up alerting for critical issues
3. Regular backup verification
4. Performance monitoring and tuning
5. Security audit and certificate rotation

Emergency Contacts:
- Platform Engineering: platform@company.com
- On-call Engineer: oncall@company.com
- Security Team: security@company.com