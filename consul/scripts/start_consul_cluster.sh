#!/bin/bash

# Start Consul Cluster Script for ISH Chat System
# Starts a multi-node Consul cluster using Docker Compose

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/config/docker-compose.consul.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check if compose file exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Generate ACL tokens
generate_acl_tokens() {
    log_info "Generating ACL tokens..."
    
    # Generate master token
    CONSUL_MASTER_TOKEN=$(uuidgen | tr '[:upper:]' '[:lower:]')
    
    # Generate agent token
    CONSUL_AGENT_TOKEN=$(uuidgen | tr '[:upper:]' '[:lower:]')
    
    # Create environment file
    cat > "$PROJECT_DIR/config/consul.env" <<EOF
# Consul ACL Tokens
CONSUL_MASTER_TOKEN=${CONSUL_MASTER_TOKEN}
CONSUL_AGENT_TOKEN=${CONSUL_AGENT_TOKEN}

# Consul Configuration
CONSUL_DATACENTER=ish-chat-dc1
CONSUL_DOMAIN=consul
EOF
    
    # Save tokens for backup
    echo "CONSUL_MASTER_TOKEN=${CONSUL_MASTER_TOKEN}" > "$HOME/.consul_cluster_tokens"
    echo "CONSUL_AGENT_TOKEN=${CONSUL_AGENT_TOKEN}" >> "$HOME/.consul_cluster_tokens"
    chmod 600 "$HOME/.consul_cluster_tokens"
    
    log_info "ACL tokens generated and saved"
    log_info "Master token: ${CONSUL_MASTER_TOKEN}"
    log_info "Agent token: ${CONSUL_AGENT_TOKEN}"
}

# Create network
create_network() {
    log_info "Creating Docker network..."
    
    docker network create ish-chat-network 2>/dev/null || true
    
    log_info "Docker network created"
}

# Start Consul cluster
start_cluster() {
    log_info "Starting Consul cluster..."
    
    cd "$PROJECT_DIR"
    
    # Export environment variables
    if [[ -f "$PROJECT_DIR/config/consul.env" ]]; then
        source "$PROJECT_DIR/config/consul.env"
        export CONSUL_MASTER_TOKEN CONSUL_AGENT_TOKEN CONSUL_DATACENTER CONSUL_DOMAIN
    else
        log_warn "No Consul environment file found, generating new tokens..."
        generate_acl_tokens
        source "$PROJECT_DIR/config/consul.env"
        export CONSUL_MASTER_TOKEN CONSUL_AGENT_TOKEN CONSUL_DATACENTER CONSUL_DOMAIN
    fi
    
    # Start the cluster
    docker-compose -f "$COMPOSE_FILE" up -d
    
    log_info "Consul cluster starting..."
}

# Wait for cluster to be ready
wait_for_cluster() {
    log_info "Waiting for Consul cluster to be ready..."
    
    local max_attempts=60
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        # Check if servers are responding
        if curl -s http://localhost:8501/v1/status/leader > /dev/null 2>&1; then
            log_info "Consul cluster is ready"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Consul cluster failed to start within ${max_attempts} attempts"
            docker-compose -f "$COMPOSE_FILE" logs
            exit 1
        fi
        
        log_info "Waiting for cluster... (attempt ${attempt}/${max_attempts})"
        sleep 5
        ((attempt++))
    done
}

# Setup ACLs
setup_acls() {
    log_info "Setting up ACLs..."
    
    # Load tokens
    source "$HOME/.consul_cluster_tokens"
    
    # Wait a bit more for ACL system to be ready
    sleep 10
    
    # Bootstrap ACL system if not already done
    if ! curl -s -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" http://localhost:8501/v1/acl/policies > /dev/null 2>&1; then
        log_info "Bootstrapping ACL system..."
        
        # Create anonymous policy (allow read access to service discovery)
        cat > /tmp/anonymous-policy.hcl <<EOF
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
        
        # Create anonymous policy
        ANONYMOUS_POLICY_ID=$(curl -s -X PUT \
            -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" \
            -H "Content-Type: application/json" \
            -d @/tmp/anonymous-policy.json \
            http://localhost:8501/v1/acl/policy \
            | jq -r '.ID')
        
        # Create anonymous token
        curl -s -X PUT \
            -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "Description": "Anonymous Token",
                "Policies": [{"Name": "anonymous"}],
                "Local": false
            }' \
            http://localhost:8501/v1/acl/token
        
        rm -f /tmp/anonymous-policy.hcl
    fi
    
    log_info "ACLs configured"
}

# Verify cluster
verify_cluster() {
    log_info "Verifying Consul cluster..."
    
    # Load tokens
    source "$HOME/.consul_cluster_tokens"
    
    # Check cluster status
    echo -e "\n${GREEN}=== Consul Cluster Status ===${NC}"
    
    # Show members
    echo -e "\n${YELLOW}Cluster Members:${NC}"
    docker exec consul-server-1 consul members
    
    # Show leader
    echo -e "\n${YELLOW}Cluster Leader:${NC}"
    curl -s -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" http://localhost:8501/v1/status/leader
    
    # Show services
    echo -e "\n${YELLOW}Registered Services:${NC}"
    curl -s -H "X-Consul-Token: $CONSUL_MASTER_TOKEN" http://localhost:8501/v1/catalog/services | jq -r 'to_entries[] | "\(.key): \(.value | join(", "))"'
    
    # Show UI URLs
    echo -e "\n${GREEN}=== Consul UI URLs ===${NC}"
    echo "Server 1: http://localhost:8501"
    echo "Server 2: http://localhost:8511"
    echo "Server 3: http://localhost:8521"
    echo "Load Balancer: http://localhost:8500"
    
    echo -e "\n${GREEN}=== Environment Variables ===${NC}"
    echo "export CONSUL_HTTP_ADDR=http://localhost:8500"
    echo "export CONSUL_HTTP_TOKEN=$CONSUL_MASTER_TOKEN"
    echo "export CONSUL_HTTP_SSL_VERIFY=false"
}

# Show logs
show_logs() {
    log_info "Showing Consul cluster logs..."
    docker-compose -f "$COMPOSE_FILE" logs -f
}

# Stop cluster
stop_cluster() {
    log_info "Stopping Consul cluster..."
    
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" down
    
    log_info "Consul cluster stopped"
}

# Clean cluster
clean_cluster() {
    log_info "Cleaning Consul cluster..."
    
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" down -v
    
    # Remove network
    docker network rm ish-chat-network 2>/dev/null || true
    
    # Clean up tokens
    rm -f "$HOME/.consul_cluster_tokens"
    
    log_info "Consul cluster cleaned"
}

# Restart cluster
restart_cluster() {
    log_info "Restarting Consul cluster..."
    
    stop_cluster
    sleep 5
    start_cluster
    wait_for_cluster
    setup_acls
    verify_cluster
}

# Main execution
main() {
    case "${1:-start}" in
        "start")
            check_prerequisites
            generate_acl_tokens
            create_network
            start_cluster
            wait_for_cluster
            setup_acls
            verify_cluster
            ;;
        "stop")
            stop_cluster
            ;;
        "restart")
            restart_cluster
            ;;
        "logs")
            show_logs
            ;;
        "clean")
            clean_cluster
            ;;
        "status")
            verify_cluster
            ;;
        "generate-tokens")
            generate_acl_tokens
            ;;
        *)
            echo "Usage: $0 {start|stop|restart|logs|clean|status|generate-tokens}"
            echo ""
            echo "Commands:"
            echo "  start          - Start Consul cluster"
            echo "  stop           - Stop Consul cluster"
            echo "  restart        - Restart Consul cluster"
            echo "  logs           - Show cluster logs"
            echo "  clean          - Stop and clean cluster (removes data)"
            echo "  status         - Show cluster status"
            echo "  generate-tokens - Generate new ACL tokens"
            echo ""
            echo "Examples:"
            echo "  $0 start       # Start the cluster"
            echo "  $0 logs        # View logs"
            echo "  $0 status      # Check status"
            exit 1
            ;;
    esac
}

# Handle signals
trap 'log_warn "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"