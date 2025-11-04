#!/bin/bash

# Redis Cluster Setup Script for ISH Chat
# Sets up Redis cluster with replication and persistence

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REDIS_PASSWORD=${REDIS_PASSWORD:-"$(openssl rand -base64 32)"}
REDIS_NODES=${REDIS_NODES:-6}
REDIS_REPLICAS=${REDIS_REPLICAS:-1}
REDIS_CLUSTER_PORTS_START=${REDIS_CLUSTER_PORTS_START:-7000}
REDIS_BASE_DIR=${REDIS_BASE_DIR:-"/opt/redis-cluster"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Redis is installed
check_redis() {
    if ! command -v redis-server >/dev/null 2>&1; then
        log_error "Redis is not installed. Please install Redis first."
        exit 1
    fi
    
    if ! command -v redis-cli >/dev/null 2>&1; then
        log_error "Redis CLI is not installed. Please install Redis CLI first."
        exit 1
    fi
    
    log_success "Redis is installed"
}

# Function to create Redis configuration
create_redis_config() {
    local node_id=$1
    local port=$2
    local config_dir="$REDIS_BASE_DIR/node-$node_id"
    
    mkdir -p "$config_dir/data"
    mkdir -p "$config_dir/logs"
    
    cat > "$config_dir/redis.conf" << EOF
# Redis Configuration for Node $node_id
# Generated on $(date)

# Network
port $port
bind 0.0.0.0
protected-mode yes
requirepass $REDIS_PASSWORD

# Cluster Configuration
cluster-enabled yes
cluster-config-file nodes-$node_id.conf
cluster-node-timeout 5000
cluster-announce-ip $(hostname -I | awk '{print $1}')
cluster-announce-port $port
cluster-announce-bus-port $((port + 10000))

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump-$node_id.rdb
dir $config_dir/data

# AOF Persistence
appendonly yes
appendfilename "appendonly-$node_id.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Logging
loglevel notice
logfile $config_dir/logs/redis-$node_id.log

# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Performance
tcp-keepalive 300
timeout 0

# Security
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command KEYS ""
rename-command CONFIG "CONFIG-B8E7F3A9"

# Client
maxclients 10000

# Slow log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Latency monitoring
latency-monitor-threshold 100

# Memory usage optimization
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
list-compress-depth 0
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
hll-sparse-max-bytes 3000

# Active rehashing
activerehashing yes

# Client output buffer limits
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60

# Client query buffer limits
client-query-buffer-limit 1gb

# Protocol max bulk request size
proto-max-bulk-len 512mb

# HZ frequency
hz 10

# Dynamic HZ
dynamic-hz yes

# AOF rewrite incremental fsync
aof-rewrite-incremental-fsync yes

# RDB save incremental fsync
rdb-save-incremental-fsync yes
EOF

    log_success "Created Redis configuration for node $node_id on port $port"
}

# Function to setup Redis cluster nodes
setup_redis_nodes() {
    log_info "Setting up Redis cluster nodes..."
    
    # Create base directory
    sudo mkdir -p "$REDIS_BASE_DIR"
    sudo chown -R $USER:$USER "$REDIS_BASE_DIR"
    
    # Create configuration for each node
    for i in $(seq 1 $REDIS_NODES); do
        port=$((REDIS_CLUSTER_PORTS_START + i - 1))
        create_redis_config $i $port
    done
    
    log_success "Redis cluster nodes configuration created"
}

# Function to start Redis nodes
start_redis_nodes() {
    log_info "Starting Redis cluster nodes..."
    
    for i in $(seq 1 $REDIS_NODES); do
        port=$((REDIS_CLUSTER_PORTS_START + i - 1))
        config_dir="$REDIS_BASE_DIR/node-$i"
        
        # Start Redis server
        redis-server "$config_dir/redis.conf" --daemonize yes
        
        # Wait for node to start
        sleep 2
        
        # Check if node is running
        if redis-cli -p $port -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
            log_success "Redis node $i started on port $port"
        else
            log_error "Failed to start Redis node $i on port $port"
            exit 1
        fi
    done
    
    log_success "All Redis cluster nodes started"
}

# Function to create Redis cluster
create_redis_cluster() {
    log_info "Creating Redis cluster..."
    
    # Build cluster command
    cluster_nodes=""
    for i in $(seq 1 $REDIS_NODES); do
        port=$((REDIS_CLUSTER_PORTS_START + i - 1))
        cluster_nodes="$cluster_nodes 127.0.0.1:$port"
    done
    
    # Create cluster
    yes "yes" | redis-cli --cluster create \
        --cluster-replicas $REDIS_REPLICAS \
        --cluster-yes \
        -a "$REDIS_PASSWORD" \
        $cluster_nodes
    
    # Wait for cluster to be ready
    sleep 5
    
    # Check cluster status
    if redis-cli -p $REDIS_CLUSTER_PORTS_START -a "$REDIS_PASSWORD" cluster info | grep -q "cluster_state:ok"; then
        log_success "Redis cluster created successfully"
    else
        log_error "Failed to create Redis cluster"
        exit 1
    fi
}

# Function to setup Redis monitoring
setup_redis_monitoring() {
    log_info "Setting up Redis monitoring..."
    
    # Create Redis monitoring script
    cat > "$REDIS_BASE_DIR/redis-monitor.sh" << 'EOF'
#!/bin/bash

# Redis Cluster Monitoring Script

REDIS_BASE_DIR="${REDIS_BASE_DIR:-/opt/redis-cluster}"
REDIS_PASSWORD="${REDIS_PASSWORD}"
REDIS_NODES="${REDIS_NODES:-6}"
REDIS_CLUSTER_PORTS_START="${REDIS_CLUSTER_PORTS_START:-7000}"

echo "Redis Cluster Monitoring Report - $(date)"
echo "============================================"
echo ""

# Check cluster status
for i in $(seq 1 $REDIS_NODES); do
    port=$((REDIS_CLUSTER_PORTS_START + i - 1))
    
    echo "Node $i (Port: $port):"
    
    # Check if node is responding
    if redis-cli -p $port -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
        echo "  Status: Online"
        
        # Get node info
        info=$(redis-cli -p $port -a "$REDIS_PASSWORD" info replication)
        master_host=$(echo "$info" | grep "master_host" | cut -d: -f2 | tr -d '\r')
        master_port=$(echo "$info" | grep "master_port" | cut -d: -f2 | tr -d '\r')
        role=$(echo "$info" | grep "role" | cut -d: -f2 | tr -d '\r')
        
        echo "  Role: $role"
        
        if [ "$role" = "master" ]; then
            # Get connected replicas
            connected_replicas=$(echo "$info" | grep "connected_slaves" | cut -d: -f2 | tr -d '\r')
            echo "  Connected Replicas: $connected_replicas"
        else
            echo "  Master: $master_host:$master_port"
        fi
        
        # Get memory usage
        memory_info=$(redis-cli -p $port -a "$REDIS_PASSWORD" info memory)
        used_memory=$(echo "$memory_info" | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
        max_memory=$(echo "$memory_info" | grep "maxmemory_human" | cut -d: -f2 | tr -d '\r')
        echo "  Memory Usage: $used_memory / $max_memory"
        
        # Get key statistics
        keyspace_info=$(redis-cli -p $port -a "$REDIS_PASSWORD" info keyspace)
        if [ -n "$keyspace_info" ]; then
            echo "  Keys: $keyspace_info"
        fi
        
    else
        echo "  Status: Offline"
    fi
    
    echo ""
done

# Check cluster health
echo "Cluster Health:"
cluster_info=$(redis-cli -p $REDIS_CLUSTER_PORTS_START -a "$REDIS_PASSWORD" cluster info)
cluster_state=$(echo "$cluster_info" | grep "cluster_state" | cut -d: -f2 | tr -d '\r')
cluster_nodes=$(echo "$cluster_info" | grep "cluster_known_nodes" | cut -d: -f2 | tr -d '\r')
cluster_slots=$(echo "$cluster_info" | grep "cluster_slots_assigned" | cut -d: -f2 | tr -d '\r')

echo "  State: $cluster_state"
echo "  Nodes: $cluster_nodes"
echo "  Slots Assigned: $cluster_slots"

if [ "$cluster_state" = "ok" ]; then
    echo "  Overall Status: Healthy"
else
    echo "  Overall Status: Unhealthy"
fi

echo ""
EOF

    chmod +x "$REDIS_BASE_DIR/redis-monitor.sh"
    
    # Create systemd service files for auto-start
    for i in $(seq 1 $REDIS_NODES); do
        port=$((REDIS_CLUSTER_PORTS_START + i - 1))
        config_dir="$REDIS_BASE_DIR/node-$i"
        
        cat > "/tmp/redis-cluster-$i.service" << EOF
[Unit]
Description=Redis Cluster Node $i
After=network.target

[Service]
Type=forking
User=$USER
Group=$USER
ExecStart=/usr/local/bin/redis-server $config_dir/redis.conf
ExecStop=/usr/local/bin/redis-cli -p $port -a $REDIS_PASSWORD shutdown
Restart=always
RestartSec=10
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
        
        # Install service (requires sudo)
        if command -v systemctl >/dev/null 2>&1; then
            sudo cp "/tmp/redis-cluster-$i.service" "/etc/systemd/system/"
            sudo systemctl daemon-reload
            sudo systemctl enable "redis-cluster-$i.service" 2>/dev/null || true
        fi
        
        rm "/tmp/redis-cluster-$i.service"
    done
    
    log_success "Redis monitoring setup completed"
}

# Function to test Redis cluster
test_redis_cluster() {
    log_info "Testing Redis cluster..."
    
    # Test basic operations
    test_key="test_key_$(date +%s)"
    test_value="test_value_$(date +%s)"
    
    # Set a key
    if redis-cli -p $REDIS_CLUSTER_PORTS_START -a "$REDIS_PASSWORD" set "$test_key" "$test_value" >/dev/null; then
        log_success "✓ SET operation successful"
    else
        log_error "✗ SET operation failed"
        return 1
    fi
    
    # Get the key
    retrieved_value=$(redis-cli -p $REDIS_CLUSTER_PORTS_START -a "$REDIS_PASSWORD" get "$test_key")
    if [ "$retrieved_value" = "$test_value" ]; then
        log_success "✓ GET operation successful"
    else
        log_error "✗ GET operation failed"
        return 1
    fi
    
    # Delete the key
    if redis-cli -p $REDIS_CLUSTER_PORTS_START -a "$REDIS_PASSWORD" del "$test_key" >/dev/null; then
        log_success "✓ DEL operation successful"
    else
        log_error "✗ DEL operation failed"
        return 1
    fi
    
    # Test cluster info
    cluster_info=$(redis-cli -p $REDIS_CLUSTER_PORTS_START -a "$REDIS_PASSWORD" cluster info)
    if echo "$cluster_info" | grep -q "cluster_state:ok"; then
        log_success "✓ Cluster is healthy"
    else
        log_error "✗ Cluster is not healthy"
        return 1
    fi
    
    log_success "Redis cluster test passed"
}

# Function to show Redis cluster information
show_cluster_info() {
    log_info "Redis Cluster Information"
    echo "==========================="
    echo ""
    echo "📊 Cluster Configuration:"
    echo "   • Number of Nodes: $REDIS_NODES"
    echo "   • Replicas per Master: $REDIS_REPLICAS"
    echo "   • Port Range: $REDIS_CLUSTER_PORTS_START-$((REDIS_CLUSTER_PORTS_START + REDIS_NODES - 1))"
    echo "   • Base Directory: $REDIS_BASE_DIR"
    echo ""
    echo "🔗 Node Addresses:"
    for i in $(seq 1 $REDIS_NODES); do
        port=$((REDIS_CLUSTER_PORTS_START + i - 1))
        echo "   • Node $i: 127.0.0.1:$port"
    done
    echo ""
    echo "🔑 Connection Details:"
    echo "   • Password: $REDIS_PASSWORD"
    echo "   • Command: redis-cli -c -p $REDIS_CLUSTER_PORTS_START -a '$REDIS_PASSWORD'"
    echo ""
    echo "📊 Monitoring:"
    echo "   • Monitor Script: $REDIS_BASE_DIR/redis-monitor.sh"
    echo "   • Cluster Info: redis-cli -p $REDIS_CLUSTER_PORTS_START -a '$REDIS_PASSWORD' cluster info"
    echo "   • Node Info: redis-cli -p $REDIS_CLUSTER_PORTS_START -a '$REDIS_PASSWORD' info replication"
    echo ""
    echo "🔧 Management Commands:"
    echo "   • Start All: $0 start"
    echo "   • Stop All: $0 stop"
    echo "   • Restart All: $0 restart"
    echo "   • Monitor: $0 monitor"
    echo "   • Test: $0 test"
    echo ""
}

# Function to start all Redis nodes
start_all_nodes() {
    log_info "Starting all Redis cluster nodes..."
    
    for i in $(seq 1 $REDIS_NODES); do
        port=$((REDIS_CLUSTER_PORTS_START + i - 1))
        config_dir="$REDIS_BASE_DIR/node-$i"
        
        if pgrep -f "redis-server.*$config_dir" >/dev/null; then
            log_warning "Redis node $i is already running"
        else
            redis-server "$config_dir/redis.conf" --daemonize yes
            sleep 2
            
            if redis-cli -p $port -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
                log_success "Redis node $i started"
            else
                log_error "Failed to start Redis node $i"
            fi
        fi
    done
}

# Function to stop all Redis nodes
stop_all_nodes() {
    log_info "Stopping all Redis cluster nodes..."
    
    for i in $(seq 1 $REDIS_NODES); do
        port=$((REDIS_CLUSTER_PORTS_START + i - 1))
        
        if redis-cli -p $port -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
            redis-cli -p $port -a "$REDIS_PASSWORD" shutdown
            log_success "Redis node $i stopped"
        else
            log_warning "Redis node $i was not running"
        fi
    done
}

# Function to restart all Redis nodes
restart_all_nodes() {
    log_info "Restarting all Redis cluster nodes..."
    stop_all_nodes
    sleep 5
    start_all_nodes
}

# Main function
main() {
    echo "🔧 Redis Cluster Setup for ISH Chat"
    echo "=================================="
    echo ""
    
    # Parse command line arguments
    case "${1:-setup}" in
        "setup")
            check_redis
            setup_redis_nodes
            start_redis_nodes
            create_redis_cluster
            setup_redis_monitoring
            test_redis_cluster
            show_cluster_info
            ;;
        "start")
            start_all_nodes
            ;;
        "stop")
            stop_all_nodes
            ;;
        "restart")
            restart_all_nodes
            ;;
        "monitor")
            "$REDIS_BASE_DIR/redis-monitor.sh"
            ;;
        "test")
            test_redis_cluster
            ;;
        "info")
            show_cluster_info
            ;;
        "clean")
            log_warning "This will stop all Redis nodes and remove data. Are you sure? (y/N)"
            read -r response
            if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
                stop_all_nodes
                sudo rm -rf "$REDIS_BASE_DIR"
                log_success "Redis cluster cleaned up"
            else
                log_info "Cleanup cancelled"
            fi
            ;;
        "help"|"-h"|"--help")
            echo "Redis Cluster Setup Script"
            echo ""
            echo "Usage: $0 [COMMAND]"
            echo ""
            echo "Commands:"
            echo "  setup     Setup and create Redis cluster (default)"
            echo "  start     Start all Redis nodes"
            echo "  stop      Stop all Redis nodes"
            echo "  restart   Restart all Redis nodes"
            echo "  monitor   Show cluster monitoring report"
            echo "  test      Test Redis cluster functionality"
            echo "  info      Show cluster information"
            echo "  clean     Remove all Redis nodes and data"
            echo "  help      Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  REDIS_PASSWORD              Redis password"
            echo "  REDIS_NODES                 Number of Redis nodes (default: 6)"
            echo "  REDIS_REPLICAS              Replicas per master (default: 1)"
            echo "  REDIS_CLUSTER_PORTS_START   Starting port (default: 7000)"
            echo "  REDIS_BASE_DIR              Base directory (default: /opt/redis-cluster)"
            echo ""
            ;;
        *)
            log_error "Unknown command: $1"
            echo "Use '$0 help' for available commands"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"