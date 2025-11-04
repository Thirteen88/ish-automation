#!/bin/bash

# Consul Setup Script for ISH Chat System
# Sets up Consul cluster with all necessary configurations

set -e

# Configuration
CONSUL_VERSION="1.17.1"
CONSUL_DATA_DIR="/opt/consul/data"
CONSUL_CONFIG_DIR="/opt/consul/config"
CONSUL_LOG_DIR="/var/log/consul"
CONSUL_USER="consul"

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

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        exit 1
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y curl unzip gnupg software-properties-common
    elif command -v yum &> /dev/null; then
        sudo yum update -y
        sudo yum install -y curl unzip gnupg
    elif command -v brew &> /dev/null; then
        brew install curl unzip
    else
        log_error "Unsupported package manager"
        exit 1
    fi
}

# Install Consul
install_consul() {
    log_info "Installing Consul ${CONSUL_VERSION}..."
    
    # Download Consul
    if [[ $(uname -m) == "aarch64" ]]; then
        ARCH="arm64"
    else
        ARCH="amd64"
    fi
    
    curl -sSL "https://releases.hashicorp.com/consul/${CONSUL_VERSION}/consul_${CONSUL_VERSION}_linux_${ARCH}.zip" -o consul.zip
    
    # Unzip and install
    unzip consul.zip
    sudo mv consul /usr/local/bin/
    sudo chmod +x /usr/local/bin/consul
    
    # Verify installation
    consul version
    rm consul.zip
    
    log_info "Consul installed successfully"
}

# Create directories
create_directories() {
    log_info "Creating Consul directories..."
    
    sudo mkdir -p ${CONSUL_DATA_DIR}
    sudo mkdir -p ${CONSUL_CONFIG_DIR}
    sudo mkdir -p ${CONSUL_LOG_DIR}
    
    # Create consul user
    if ! id "${CONSUL_USER}" &>/dev/null; then
        sudo useradd --system --home ${CONSUL_DATA_DIR} --shell /bin/false ${CONSUL_USER}
    fi
    
    # Set permissions
    sudo chown -R ${CONSUL_USER}:${CONSUL_USER} ${CONSUL_DATA_DIR}
    sudo chown -R ${CONSUL_USER}:${CONSUL_USER} ${CONSUL_CONFIG_DIR}
    sudo chown -R ${CONSUL_USER}:${CONSUL_USER} ${CONSUL_LOG_DIR}
    
    log_info "Directories created successfully"
}

# Generate Consul configuration
generate_config() {
    log_info "Generating Consul configuration..."
    
    # Read environment variables or use defaults
    CONSUL_DATACENTER=${CONSUL_DATACENTER:-"ish-chat-dc1"}
    CONSUL_BIND_INTERFACE=${CONSUL_BIND_INTERFACE:-"eth0"}
    CONSUL_CLIENT_INTERFACE=${CONSUL_CLIENT_INTERFACE:-"eth0"}
    CONSUL_RETRY_JOIN=${CONSUL_RETRY_JOIN:-""}
    CONSUL_BOOTSTRAP_EXPECT=${CONSUL_BOOTSTRAP_EXPECT:-"1"}
    CONSUL_SERVER=${CONSUL_SERVER:-"true"}
    CONSUL_UI=${CONSUL_UI:-"true"}
    CONSUL_ACL_ENABLED=${CONSUL_ACL_ENABLED:-"true"}
    CONSUL_MASTER_TOKEN=${CONSUL_MASTER_TOKEN:-$(uuidgen)}
    CONSUL_AGENT_TOKEN=${CONSUL_AGENT_TOKEN:-$(uuidgen)}
    
    # Create main configuration file
    sudo tee ${CONSUL_CONFIG_DIR}/consul.hcl > /dev/null <<EOF
datacenter = "${CONSUL_DATACENTER}"
data_dir = "${CONSUL_DATA_DIR}"
log_level = "INFO"
server = ${CONSUL_SERVER}
bootstrap_expect = ${CONSUL_BOOTSTRAP_EXPECT}
ui = ${CONSUL_UI}

# Network configuration
bind_addr = "{{ GetInterfaceIP \"${CONSUL_BIND_INTERFACE}\" }}"
client_addr = "0.0.0.0"

# Advertise address
advertise_addr = "{{ GetInterfaceIP \"${CONSUL_CLIENT_INTERFACE}\" }}"

# Cluster configuration
retry_join = ${CONSUL_RETRY_JOIN}

# Ports
ports {
  dns = 8600
  http = 8500
  https = -1
  grpc = 8502
  grpc_tls = 8503
  server = 8300
  serf_lan = 8301
  serf_wan = 8302
}

# Performance tuning
performance {
  raft_multiplier = 1
}

# ACL configuration
acl = {
  enabled = ${CONSUL_ACL_ENABLED}
  default_policy = "deny"
  enable_token_persistence = true
  down_policy = "extend-cache"
  tokens {
    master = "${CONSUL_MASTER_TOKEN}"
    agent = "${CONSUL_AGENT_TOKEN}"
  }
}

# Auto-encrypt
auto_encrypt {
  tls = true
}

# Telemetry
telemetry {
  enable_host_metrics = true
  prometheus_retention_time = "24h"
}

# Service mesh (disabled for now)
connect {
  enabled = false
}

# DNS configuration
recursors = ["8.8.8.8", "1.1.1.1"]
enable_truncate = true
only_passing = false
recursor_timeout = "2s"
EOF

    # Create ACL tokens file
    sudo tee ${CONSUL_CONFIG_DIR}/acl-tokens.hcl > /dev/null <<EOF
acl {
  tokens {
    master = "${CONSUL_MASTER_TOKEN}"
    agent = "${CONSUL_AGENT_TOKEN}"
  }
}
EOF

    # Save tokens to environment file
    sudo tee ${CONSUL_CONFIG_DIR}/consul.env > /dev/null <<EOF
CONSUL_HTTP_TOKEN=${CONSUL_MASTER_TOKEN}
CONSUL_MASTER_TOKEN=${CONSUL_MASTER_TOKEN}
CONSUL_AGENT_TOKEN=${CONSUL_AGENT_TOKEN}
EOF

    # Set permissions
    sudo chown -R ${CONSUL_USER}:${CONSUL_USER} ${CONSUL_CONFIG_DIR}
    
    log_info "Consul configuration generated"
    log_info "Master token: ${CONSUL_MASTER_TOKEN}"
    log_info "Agent token: ${CONSUL_AGENT_TOKEN}"
    
    # Save tokens to a secure location
    echo "CONSUL_MASTER_TOKEN=${CONSUL_MASTER_TOKEN}" > ~/.consul_tokens
    echo "CONSUL_AGENT_TOKEN=${CONSUL_AGENT_TOKEN}" >> ~/.consul_tokens
    chmod 600 ~/.consul_tokens
}

# Create systemd service
create_systemd_service() {
    log_info "Creating Consul systemd service..."
    
    sudo tee /etc/systemd/system/consul.service > /dev/null <<EOF
[Unit]
Description=Consul Agent
Documentation=https://www.consul.io/docs/
Wants=network-online.target
After=network-online.target

[Service]
Type=notify
User=${CONSUL_USER}
Group=${CONSUL_USER}
ExecStart=/usr/local/bin/consul agent -config-dir=${CONSUL_CONFIG_DIR}
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=process
Restart=on-failure
LimitNOFILE=65536
EnvironmentFile=-${CONSUL_CONFIG_DIR}/consul.env

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable consul
    
    log_info "Consul systemd service created"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."
    
    # Check firewall tool
    if command -v ufw &> /dev/null; then
        # Ubuntu/Debian
        sudo ufw allow 8300/tcp comment "Consul Server RPC"
        sudo ufw allow 8301/tcp comment "Consul Serf LAN"
        sudo ufw allow 8302/tcp comment "Consul Serf WAN"
        sudo ufw allow 8500/tcp comment "Consul HTTP API"
        sudo ufw allow 8600/tcp comment "Consul DNS"
        sudo ufw allow 8600/udp comment "Consul DNS"
    elif command -v firewall-cmd &> /dev/null; then
        # CentOS/RHEL
        sudo firewall-cmd --permanent --add-port=8300/tcp --add-port=8301/tcp --add-port=8302/tcp --add-port=8500/tcp --add-port=8600/tcp --add-port=8600/udp
        sudo firewall-cmd --reload
    else
        log_warn "No firewall tool found. Please configure firewall manually."
    fi
}

# Start Consul
start_consul() {
    log_info "Starting Consul..."
    
    sudo systemctl start consul
    
    # Wait for Consul to start
    sleep 5
    
    # Check if Consul is running
    if sudo systemctl is-active --quiet consul; then
        log_info "Consul started successfully"
        
        # Show status
        sudo systemctl status consul --no-pager
        
        # Show Consul members
        echo -e "\n${GREEN}Consul members:${NC}"
        consul members
        
        echo -e "\n${GREEN}Consul UI available at: http://localhost:8500${NC}"
    else
        log_error "Failed to start Consul"
        sudo journalctl -u consul --no-pager
        exit 1
    fi
}

# Setup ACLs
setup_acls() {
    log_info "Setting up ACLs..."
    
    # Load tokens
    source ~/.consul_tokens
    
    # Wait for Consul to be ready
    sleep 10
    
    # Configure ACL system
    consul acl bootstrap 2>/dev/null || true
    
    log_info "ACLs configured"
}

# Test Consul installation
test_consul() {
    log_info "Testing Consul installation..."
    
    # Test API
    if curl -s http://localhost:8500/v1/status/leader > /dev/null; then
        log_info "Consul API is responding"
    else
        log_error "Consul API is not responding"
        exit 1
    fi
    
    # Test DNS
    if dig @localhost -p 8600 consul.service.consul +short > /dev/null 2>&1; then
        log_info "Consul DNS is working"
    else
        log_warn "Consul DNS test failed (dig may not be installed)"
    fi
    
    log_info "Consul installation test completed"
}

# Main execution
main() {
    log_info "Starting Consul setup for ISH Chat System..."
    
    check_root
    install_dependencies
    install_consul
    create_directories
    generate_config
    create_systemd_service
    configure_firewall
    start_consul
    setup_acls
    test_consul
    
    log_info "Consul setup completed successfully!"
    log_info "Next steps:"
    log_info "1. Configure your ISH Chat services to use Consul"
    log_info "2. Set CONSUL_HTTP_TOKEN environment variable: export CONSUL_HTTP_TOKEN=${CONSUL_MASTER_TOKEN}"
    log_info "3. Access Consul UI at http://localhost:8500"
}

# Handle script arguments
case "${1:-}" in
    "install")
        main
        ;;
    "start")
        sudo systemctl start consul
        ;;
    "stop")
        sudo systemctl stop consul
        ;;
    "restart")
        sudo systemctl restart consul
        ;;
    "status")
        sudo systemctl status consul --no-pager
        ;;
    "logs")
        sudo journalctl -u consul -f
        ;;
    *)
        echo "Usage: $0 {install|start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  install  - Install and configure Consul"
        echo "  start    - Start Consul service"
        echo "  stop     - Stop Consul service"
        echo "  restart  - Restart Consul service"
        echo "  status   - Show Consul service status"
        echo "  logs     - Show Consul service logs"
        exit 1
        ;;
esac