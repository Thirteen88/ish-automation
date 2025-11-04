#!/bin/bash

# ISH Chat Monitoring Deployment Script
# This script deploys the complete monitoring stack

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MONITORING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../monitoring" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_FILE="/tmp/ish-chat-monitoring-deploy.log"

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
    
    # Check available disk space (at least 5GB)
    available_space=$(df / | tail -1 | awk '{print $4}')
    if [ "$available_space" -lt 5242880 ]; then  # 5GB in KB
        log_warning "Low disk space detected. Monitoring requires at least 5GB of free space."
    fi
    
    # Check available memory (at least 4GB)
    available_memory=$(free -m | awk 'NR==2{print $7}')
    if [ "$available_memory" -lt 4096 ]; then
        log_warning "Low memory detected. Monitoring stack requires at least 4GB of RAM."
    fi
    
    log "Prerequisites check completed."
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    # Create data directories
    mkdir -p "$MONITORING_DIR/data/prometheus"
    mkdir -p "$MONITORING_DIR/data/grafana"
    mkdir -p "$MONITORING_DIR/data/alertmanager"
    mkdir -p "$MONITORING_DIR/data/loki"
    
    # Create log directories
    mkdir -p "$MONITORING_DIR/logs/prometheus"
    mkdir -p "$MONITORING_DIR/logs/grafana"
    mkdir -p "$MONITORING_DIR/logs/alertmanager"
    
    # Set proper permissions
    chmod 755 "$MONITORING_DIR/data"/*
    chmod 755 "$MONITORING_DIR/logs"/*
    
    log "Directories created successfully."
}

# Generate configuration files
generate_configs() {
    log "Generating configuration files..."
    
    # Create Prometheus configuration directory
    mkdir -p "$MONITORING_DIR/prometheus"
    
    # Create AlertManager configuration directory
    mkdir -p "$MONITORING_DIR/alertmanager"
    
    # Create Grafana provisioning directories
    mkdir -p "$MONITORING_DIR/grafana/provisioning/datasources"
    mkdir -p "$MONITORING_DIR/grafana/provisioning/dashboards"
    mkdir -p "$MONITORING_DIR/grafana/dashboards"
    
    # Generate Blackbox exporter configuration
    cat > "$MONITORING_DIR/blackbox.yml" << EOF
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions:
        - "HTTP/1.1"
        - "HTTP/2.0"
      valid_status_codes: [200, 201, 202]
      method: GET
      follow_redirects: true
      fail_if_ssl: false
      fail_if_not_ssl: false

  tcp_connect:
    prober: tcp
    timeout: 5s

  icmp:
    prober: icmp
    timeout: 5s
EOF
    
    # Generate Loki configuration
    mkdir -p "$MONITORING_DIR/loki"
    cat > "$MONITORING_DIR/loki/loki.yml" << EOF
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 1h
  max_chunk_age: 1h
  chunk_target_size: 1048576
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
EOF
    
    # Generate Promtail configuration
    mkdir -p "$MONITORING_DIR/promtail"
    cat > "$MONITORING_DIR/promtail/promtail.yml" << EOF
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
- job_name: containers
  static_configs:
  - targets:
      - localhost
    labels:
      job: containerlogs
      __path__: /var/lib/docker/containers/*/*log

  pipeline_stages:
  - json:
      expressions:
        output: log
        stream: stream
        attrs:
  - json:
      expressions:
        tag:
      source: attrs
  - regex:
      expression: (?P<container_name>(?:[^|]*))\|
      source: tag
  - timestamp:
      format: RFC3339Nano
      source: time
  - labels:
      stream:
      container_name:
  - output:
      source: output

- job_name: system
  static_configs:
  - targets:
      - localhost
    labels:
      job: varlogs
      __path__: /var/log/*log
EOF
    
    log "Configuration files generated successfully."
}

# Setup environment variables
setup_environment() {
    log "Setting up environment variables..."
    
    # Create environment file for monitoring
    cat > "$MONITORING_DIR/.env" << EOF
# Monitoring Environment Configuration
COMPOSE_PROJECT_NAME=ish-chat-monitoring
COMPOSE_FILE=docker-compose.monitoring.yml

# Network Configuration
MONITORING_NETWORK_SUBNET=172.20.0.0/16

# Prometheus Configuration
PROMETHEUS_RETENTION=15d
PROMETHEUS_RETENTION_SIZE=10GB
PROMETHEUS_WEB_PORT=9090

# AlertManager Configuration
ALERTMANAGER_WEB_PORT=9093
ALERTMANAGER_SMTP_HOST=localhost:587
ALERTMANAGER_SMTP_USER=alerts@ish-chat.local
ALERTMANAGER_SMTP_FROM=alerts@ish-chat.local

# Grafana Configuration
GRAFANA_WEB_PORT=3000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin123
GRAFANA_SMTP_ENABLED=true
GRAFANA_SMTP_HOST=localhost:587

# Exporter Ports
NODE_EXPORTER_PORT=9100
POSTGRES_EXPORTER_PORT=9187
REDIS_EXPORTER_PORT=9121
CADVISOR_PORT=8080
BLACKBOX_EXPORTER_PORT=9115
NGINX_EXPORTER_PORT=9113
PUSHGATEWAY_PORT=9091

# Loki Configuration
LOKI_PORT=3100
PROMTAIL_PORT=9080

# Thanos Configuration
THANOS_QUERIER_PORT=9092
EOF
    
    log "Environment variables configured."
}

# Deploy monitoring stack
deploy_monitoring() {
    log "Deploying monitoring stack..."
    
    # Change to project directory
    cd "$PROJECT_ROOT"
    
    # Pull latest images
    log "Pulling Docker images..."
    docker-compose -f docker-compose.monitoring.yml pull
    
    # Start services
    log "Starting monitoring services..."
    docker-compose -f docker-compose.monitoring.yml up -d
    
    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    check_service_health
    
    log "Monitoring stack deployed successfully."
}

# Check service health
check_service_health() {
    log "Checking service health..."
    
    local services=("prometheus:9090" "alertmanager:9093" "grafana:3000" "node-exporter:9100")
    local unhealthy_services=()
    
    for service in "${services[@]}"; do
        local service_name=$(echo "$service" | cut -d':' -f1)
        local service_port=$(echo "$service" | cut -d':' -f2)
        
        if curl -f -s "http://localhost:$service_port/-/healthy" > /dev/null 2>&1; then
            log "✅ $service_name is healthy"
        else
            log_warning "❌ $service_name is not healthy"
            unhealthy_services+=("$service_name")
        fi
    done
    
    if [ ${#unhealthy_services[@]} -gt 0 ]; then
        log_warning "Some services are not healthy. Check logs with:"
        for service in "${unhealthy_services[@]}"; do
            echo "  docker-compose -f docker-compose.monitoring.yml logs $service"
        done
    else
        log "✅ All services are healthy"
    fi
}

# Setup Grafana datasources and dashboards
setup_grafana() {
    log "Setting up Grafana..."
    
    # Wait for Grafana to be ready
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://localhost:3000/api/health" > /dev/null 2>&1; then
            break
        fi
        log_info "Waiting for Grafana to be ready... (attempt $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log_error "Grafana did not become ready in time"
        return 1
    fi
    
    # Import dashboards (if API key is available)
    # This would require additional setup for automated dashboard import
    log "Grafana is ready. Visit http://localhost:3000 (admin/admin123) to complete setup."
    
    # Create API key for automation (optional)
    log_info "To create Grafana API key for automation:"
    echo "1. Login to Grafana at http://localhost:3000"
    echo "2. Go to Configuration -> API Keys"
    echo "3. Create new API key with Admin role"
    echo "4. Export as GRAFANA_API_KEY environment variable"
}

# Verify installation
verify_installation() {
    log "Verifying monitoring installation..."
    
    # Check if all containers are running
    local running_containers=$(docker-compose -f "$PROJECT_ROOT/docker-compose.monitoring.yml" ps -q | wc -l)
    local expected_containers=15  # Adjust based on actual number of services
    
    if [ "$running_containers" -eq "$expected_containers" ]; then
        log "✅ All $expected_containers containers are running"
    else
        log_warning "Expected $expected_containers containers, but $running_containers are running"
    fi
    
    # Check if metrics endpoints are accessible
    local endpoints=(
        "http://localhost:9090/-/healthy"
        "http://localhost:9093/-/healthy"
        "http://localhost:3000/api/health"
        "http://localhost:9100/metrics"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s "$endpoint" > /dev/null 2>&1; then
            log "✅ $endpoint is accessible"
        else
            log_error "❌ $endpoint is not accessible"
        fi
    done
    
    # Check disk usage
    local disk_usage=$(df "$MONITORING_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -lt 80 ]; then
        log "✅ Disk usage is at ${disk_usage}%"
    else
        log_warning "⚠️ Disk usage is high at ${disk_usage}%"
    fi
    
    log "Installation verification completed."
}

# Print next steps
print_next_steps() {
    log "🎉 ISH Chat monitoring stack has been successfully deployed!"
    echo
    echo "📊 Access Points:"
    echo "  • Grafana:      http://localhost:3000 (admin/admin123)"
    echo "  • Prometheus:   http://localhost:9090"
    echo "  • AlertManager: http://localhost:9093"
    echo "  • Node Exporter: http://localhost:9100/metrics"
    echo
    echo "🔧 Management Commands:"
    echo "  • View logs:    docker-compose -f docker-compose.monitoring.yml logs -f [service]"
    echo "  • Stop stack:   docker-compose -f docker-compose.monitoring.yml down"
    echo "  • Restart:      docker-compose -f docker-compose.monitoring.yml restart [service]"
    echo "  • Update:       docker-compose -f docker-compose.monitoring.yml pull && docker-compose -f docker-compose.monitoring.yml up -d"
    echo
    echo "📚 Documentation:"
    echo "  • Monitoring Guide: $MONITORING_DIR/README.md"
    echo "  • Alert Rules:      $MONITORING_DIR/prometheus/*rules.yml"
    echo "  • Dashboards:       $MONITORING_DIR/grafana/dashboards/"
    echo
    echo "⚙️ Next Steps:"
    echo "  1. Configure AlertManager SMTP settings in monitoring/alertmanager/alertmanager.yml"
    echo "  2. Set up Slack webhooks for notifications"
    echo "  3. Configure data sources in Grafana"
    echo "  4. Import additional dashboards as needed"
    echo "  5. Set up log rotation for monitoring data"
    echo
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        log_error "Deployment failed. Check logs at $LOG_FILE"
        log_error "To clean up partially deployed services, run:"
        echo "  docker-compose -f $PROJECT_ROOT/docker-compose.monitoring.yml down -v"
    fi
}

# Main execution
main() {
    trap cleanup EXIT
    
    log "Starting ISH Chat monitoring deployment..."
    
    check_prerequisites
    create_directories
    generate_configs
    setup_environment
    deploy_monitoring
    setup_grafana
    verify_installation
    print_next_steps
    
    log "Deployment completed successfully!"
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        log "Stopping monitoring stack..."
        cd "$PROJECT_ROOT"
        docker-compose -f docker-compose.monitoring.yml down
        log "Monitoring stack stopped."
        ;;
    "restart")
        log "Restarting monitoring stack..."
        cd "$PROJECT_ROOT"
        docker-compose -f docker-compose.monitoring.yml restart
        check_service_health
        log "Monitoring stack restarted."
        ;;
    "logs")
        cd "$PROJECT_ROOT"
        docker-compose -f docker-compose.monitoring.yml logs -f "${2:-}"
        ;;
    "status")
        check_service_health
        ;;
    "cleanup")
        log "Cleaning up monitoring stack..."
        cd "$PROJECT_ROOT"
        docker-compose -f docker-compose.monitoring.yml down -v --remove-orphans
        docker system prune -f
        log "Cleanup completed."
        ;;
    "help"|"-h"|"--help")
        echo "ISH Chat Monitoring Deployment Script"
        echo
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  deploy   Deploy monitoring stack (default)"
        echo "  stop     Stop monitoring stack"
        echo "  restart  Restart monitoring stack"
        echo "  logs     Show logs for all or specific service"
        echo "  status   Check service health"
        echo "  cleanup  Remove all monitoring data and containers"
        echo "  help     Show this help message"
        echo
        echo "Examples:"
        echo "  $0 deploy              # Deploy monitoring stack"
        echo "  $0 logs prometheus     # Show Prometheus logs"
        echo "  $0 restart grafana     # Restart Grafana only"
        echo
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for usage information."
        exit 1
        ;;
esac