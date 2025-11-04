#!/bin/bash

# ISH Chat Deployment Monitoring Script
# Comprehensive monitoring and alerting for the load balancer deployment

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-infrastructure/docker-compose.yml"
ENV_FILE="$PROJECT_ROOT/.env"
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=85
ALERT_THRESHOLD_DISK=90
ALERT_THRESHOLD_RESPONSE_TIME=5000  # milliseconds

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

log_metric() {
    echo -e "${PURPLE}[METRIC]${NC} $1"
}

log_alert() {
    echo -e "${CYAN}[ALERT]${NC} $1"
}

# Function to check if service is healthy
check_service_health() {
    local service_name=$1
    local health_url=$2
    local timeout=${3:-10}
    
    if curl -f -s --max-time $timeout "$health_url" >/dev/null 2>&1; then
        log_success "✓ $service_name is healthy"
        return 0
    else
        log_error "✗ $service_name is unhealthy"
        return 1
    fi
}

# Function to measure response time
measure_response_time() {
    local url=$1
    local timeout=${2:-30}
    
    start_time=$(date +%s%N)
    if curl -f -s --max-time $timeout "$url" >/dev/null 2>&1; then
        end_time=$(date +%s%N)
        response_time=$(( (end_time - start_time) / 1000000 ))  # Convert to milliseconds
        echo $response_time
        return 0
    else
        echo -1
        return 1
    fi
}

# Function to get container metrics
get_container_metrics() {
    local container_name=$1
    
    if ! docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        log_error "Container $container_name is not running"
        return 1
    fi
    
    # Get container stats
    stats=$(docker stats --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" "$container_name")
    
    # Parse metrics
    cpu_usage=$(echo "$stats" | tail -1 | awk '{print $1}' | sed 's/%//')
    mem_usage=$(echo "$stats" | tail -1 | awk '{print $3}' | sed 's/%//')
    
    echo "$cpu_usage $mem_usage"
}

# Function to check system resources
check_system_resources() {
    log_info "Checking system resources..."
    
    # CPU usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    cpu_usage_int=$(echo "$cpu_usage" | cut -d. -f1)
    
    if [ "$cpu_usage_int" -gt "$ALERT_THRESHOLD_CPU" ]; then
        log_alert "🚨 High CPU usage: ${cpu_usage}%"
    else
        log_metric "CPU usage: ${cpu_usage}%"
    fi
    
    # Memory usage
    memory_info=$(free -m | awk 'NR==2{printf "%.1f", $3*100/$2}')
    memory_usage_int=$(echo "$memory_info" | cut -d. -f1)
    
    if [ "$memory_usage_int" -gt "$ALERT_THRESHOLD_MEMORY" ]; then
        log_alert "🚨 High memory usage: ${memory_info}%"
    else
        log_metric "Memory usage: ${memory_info}%"
    fi
    
    # Disk usage
    disk_usage=$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$disk_usage" -gt "$ALERT_THRESHOLD_DISK" ]; then
        log_alert "🚨 High disk usage: ${disk_usage}%"
    else
        log_metric "Disk usage: ${disk_usage}%"
    fi
    
    # Load average
    load_avg=$(cat /proc/loadavg | awk '{print $1}')
    log_metric "Load average: $load_avg"
    
    # Network connections
    connections=$(netstat -an | grep :443 | wc -l)
    log_metric "HTTPS connections: $connections"
}

# Function to check Docker containers
check_docker_containers() {
    log_info "Checking Docker containers..."
    
    containers=(
        "ish-chat-nginx-lb"
        "ish-chat-app-1"
        "ish-chat-app-2"
        "ish-chat-postgres-primary"
        "ish-chat-redis"
        "ish-chat-zai-provider"
        "ish-chat-openai-provider"
        "ish-chat-claude-provider"
        "ish-chat-perplexity-provider"
        "ish-chat-prometheus"
        "ish-chat-grafana"
    )
    
    unhealthy_containers=()
    
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "$container"; then
            # Check container health
            health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
            if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
                log_success "✓ $container is running"
                
                # Get container metrics
                metrics=$(get_container_metrics "$container")
                if [ $? -eq 0 ]; then
                    cpu=$(echo $metrics | awk '{print $1}')
                    mem=$(echo $metrics | awk '{print $2}')
                    log_metric "  $container - CPU: ${cpu}%, Memory: ${mem}%"
                    
                    # Check for resource alerts
                    cpu_int=$(echo $cpu | sed 's/%//')
                    mem_int=$(echo $mem | sed 's/%//')
                    
                    if [ "$cpu_int" -gt "$ALERT_THRESHOLD_CPU" ]; then
                        log_alert "🚨 $container high CPU usage: ${cpu}%"
                    fi
                    
                    if [ "$mem_int" -gt "$ALERT_THRESHOLD_MEMORY" ]; then
                        log_alert "🚨 $container high memory usage: ${mem}%"
                    fi
                fi
            else
                log_error "✗ $container is unhealthy"
                unhealthy_containers+=("$container")
            fi
        else
            log_error "✗ $container is not running"
            unhealthy_containers+=("$container")
        fi
    done
    
    if [ ${#unhealthy_containers[@]} -gt 0 ]; then
        log_alert "🚨 Unhealthy containers: ${unhealthy_containers[*]}"
        return 1
    fi
    
    return 0
}

# Function to check service endpoints
check_service_endpoints() {
    log_info "Checking service endpoints..."
    
    unhealthy_services=()
    
    # Check load balancer
    response_time=$(measure_response_time "http://localhost/health")
    if [ "$response_time" -gt 0 ]; then
        log_success "✓ Load balancer is healthy"
        log_metric "  Response time: ${response_time}ms"
        
        if [ "$response_time" -gt "$ALERT_THRESHOLD_RESPONSE_TIME" ]; then
            log_alert "🚨 Load balancer slow response: ${response_time}ms"
        fi
    else
        log_error "✗ Load balancer is unhealthy"
        unhealthy_services+=("load-balancer")
    fi
    
    # Check HTTPS if enabled
    if [ "${ENABLE_SSL:-true}" = "true" ]; then
        response_time=$(measure_response_time "https://localhost/health")
        if [ "$response_time" -gt 0 ]; then
            log_success "✓ Load balancer (HTTPS) is healthy"
            log_metric "  HTTPS Response time: ${response_time}ms"
        else
            log_error "✗ Load balancer (HTTPS) is unhealthy"
            unhealthy_services+=("load-balancer-https")
        fi
    fi
    
    # Check application instances
    for port in 8010 8011; do
        response_time=$(measure_response_time "http://localhost:$port/health")
        if [ "$response_time" -gt 0 ]; then
            log_success "✓ Application on port $port is healthy"
            log_metric "  Response time: ${response_time}ms"
            
            if [ "$response_time" -gt "$ALERT_THRESHOLD_RESPONSE_TIME" ]; then
                log_alert "🚨 Application $port slow response: ${response_time}ms"
            fi
        else
            log_error "✗ Application on port $port is unhealthy"
            unhealthy_services+=("app-$port")
        fi
    done
    
    # Check monitoring services
    if curl -f -s "http://localhost:9090/metrics" >/dev/null; then
        log_success "✓ Prometheus is accessible"
    else
        log_error "✗ Prometheus is not accessible"
        unhealthy_services+=("prometheus")
    fi
    
    if curl -f -s "http://localhost:3000/api/health" >/dev/null; then
        log_success "✓ Grafana is accessible"
    else
        log_error "✗ Grafana is not accessible"
        unhealthy_services+=("grafana")
    fi
    
    if [ ${#unhealthy_services[@]} -gt 0 ]; then
        log_alert "🚨 Unhealthy services: ${unhealthy_services[*]}"
        return 1
    fi
    
    return 0
}

# Function to check database connectivity
check_database_connectivity() {
    log_info "Checking database connectivity..."
    
    # Check PostgreSQL
    if docker exec ish-chat-postgres-primary pg_isready -U ishchat -d ish_chat >/dev/null 2>&1; then
        log_success "✓ PostgreSQL is ready"
        
        # Get database stats
        connections=$(docker exec ish-chat-postgres-primary psql -U ishchat -d ish_chat -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ')
        log_metric "  Active connections: $connections"
    else
        log_error "✗ PostgreSQL is not ready"
        return 1
    fi
    
    # Check Redis
    if docker exec ish-chat-redis redis-cli ping >/dev/null 2>&1; then
        log_success "✓ Redis is ready"
        
        # Get Redis info
        redis_info=$(docker exec ish-chat-redis redis-cli info memory)
        used_memory=$(echo "$redis_info" | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
        log_metric "  Memory usage: $used_memory"
    else
        log_error "✗ Redis is not ready"
        return 1
    fi
    
    return 0
}

# Function to check AI providers
check_ai_providers() {
    log_info "Checking AI providers..."
    
    providers=(
        "zai-provider:8001"
        "openai-provider:8002"
        "claude-provider:8003"
        "perplexity-provider:8004"
    )
    
    unhealthy_providers=()
    
    for provider in "${providers[@]}"; do
        name=$(echo "$provider" | cut -d: -f1)
        port=$(echo "$provider" | cut -d: -f2)
        
        if curl -f -s "http://localhost:$port/health" >/dev/null; then
            log_success "✓ $name is healthy"
        else
            log_error "✗ $name is unhealthy"
            unhealthy_providers+=("$name")
        fi
    done
    
    if [ ${#unhealthy_providers[@]} -gt 0 ]; then
        log_alert "🚨 Unhealthy AI providers: ${unhealthy_providers[*]}"
        return 1
    fi
    
    return 0
}

# Function to generate monitoring report
generate_report() {
    log_info "Generating monitoring report..."
    
    report_file="$PROJECT_ROOT/monitoring-report-$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "ISH Chat Deployment Monitoring Report"
        echo "Generated on: $(date)"
        echo "=================================="
        echo ""
        
        echo "System Information:"
        echo "------------------"
        uname -a
        echo ""
        
        echo "Docker Information:"
        echo "-------------------"
        docker --version
        docker-compose --version
        echo ""
        
        echo "Running Containers:"
        echo "-------------------"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        
        echo "Resource Usage:"
        echo "---------------"
        echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')"
        echo "Memory: $(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"
        echo "Disk: $(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $5}')"
        echo "Load: $(cat /proc/loadavg | awk '{print $1}')"
        echo ""
        
        echo "Service Health:"
        echo "---------------"
        
        # Check services
        if curl -f -s "http://localhost/health" >/dev/null; then
            echo "Load Balancer: ✓ Healthy"
        else
            echo "Load Balancer: ✗ Unhealthy"
        fi
        
        if curl -f -s "http://localhost:8010/health" >/dev/null; then
            echo "App 1: ✓ Healthy"
        else
            echo "App 1: ✗ Unhealthy"
        fi
        
        if curl -f -s "http://localhost:8011/health" >/dev/null; then
            echo "App 2: ✓ Healthy"
        else
            echo "App 2: ✗ Unhealthy"
        fi
        
        if curl -f -s "http://localhost:9090/metrics" >/dev/null; then
            echo "Prometheus: ✓ Accessible"
        else
            echo "Prometheus: ✗ Not accessible"
        fi
        
        if curl -f -s "http://localhost:3000/api/health" >/dev/null; then
            echo "Grafana: ✓ Accessible"
        else
            echo "Grafana: ✗ Not accessible"
        fi
        
        echo ""
        
        echo "Recent Docker Logs (last 20 lines):"
        echo "------------------------------------"
        docker-compose --file "$DOCKER_COMPOSE_FILE" logs --tail=20
        echo ""
        
    } > "$report_file"
    
    log_success "Report generated: $report_file"
}

# Function to set up monitoring alerts
setup_alerts() {
    log_info "Setting up monitoring alerts..."
    
    # Create alert script
    alert_script="$PROJECT_ROOT/scripts/check-alerts.sh"
    
    cat > "$alert_script" << 'EOF'
#!/bin/bash

# Alert Check Script
# Checks critical services and sends alerts

ALERT_EMAIL="${ALERT_EMAIL:-admin@example.com}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Function to send email alert
send_email_alert() {
    local subject=$1
    local message=$2
    
    if command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    fi
}

# Function to send Slack alert
send_slack_alert() {
    local message=$1
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK"
    fi
}

# Function to send Telegram alert
send_telegram_alert() {
    local message=$1
    
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST \
            "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d chat_id="$TELEGRAM_CHAT_ID" \
            -d text="$message"
    fi
}

# Function to send alert to all channels
send_alert() {
    local subject=$1
    local message=$2
    
    echo "🚨 ALERT: $subject"
    echo "$message"
    
    send_email_alert "$subject" "$message"
    send_slack_alert "$subject\n$message"
    send_telegram_alert "$subject\n$message"
}

# Check critical services
if ! curl -f -s "http://localhost/health" >/dev/null; then
    send_alert "ISH Chat Load Balancer Down" "The load balancer is not responding to health checks."
fi

if ! docker ps --format "{{.Names}}" | grep -q "ish-chat-app-1\|ish-chat-app-2"; then
    send_alert "ISH Chat Applications Down" "No application instances are running."
fi

# Check system resources
cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
cpu_int=$(echo "$cpu_usage" | cut -d. -f1)

if [ "$cpu_int" -gt 90 ]; then
    send_alert "High CPU Usage" "System CPU usage is ${cpu_usage}%"
fi

memory_usage=$(free -m | awk 'NR==2{printf "%.1f", $3*100/$2}')
memory_int=$(echo "$memory_usage" | cut -d. -f1)

if [ "$memory_int" -gt 90 ]; then
    send_alert "High Memory Usage" "System memory usage is ${memory_usage}%"
fi
EOF
    
    chmod +x "$alert_script"
    
    # Add to cron for monitoring every 5 minutes
    (crontab -l 2>/dev/null; echo "*/5 * * * * $alert_script") | crontab -
    
    log_success "Alert monitoring setup completed"
}

# Function to show dashboard URLs
show_dashboard_urls() {
    log_info "Dashboard URLs"
    echo "================"
    echo ""
    echo "🌐 Main Application:"
    echo "   • HTTP: http://localhost"
    if [ "${ENABLE_SSL:-true}" = "true" ]; then
        echo "   • HTTPS: https://localhost"
    fi
    echo ""
    echo "📊 Monitoring:"
    echo "   • Prometheus: http://localhost:9090"
    echo "   • Grafana: http://localhost:3000"
    echo "   • Grafana Login: admin / $GRAFANA_ADMIN_PASSWORD"
    echo ""
    echo "🔍 Health Endpoints:"
    echo "   • Load Balancer: http://localhost/health"
    echo "   • App 1: http://localhost:8010/health"
    echo "   • App 2: http://localhost:8011/health"
    echo ""
}

# Main monitoring function
main() {
    echo "📊 ISH Chat Deployment Monitoring"
    echo "================================="
    echo ""
    
    # Change to project directory
    cd "$PROJECT_ROOT"
    
    # Parse command line arguments
    case "${1:-check}" in
        "check")
            check_system_resources
            check_docker_containers
            check_service_endpoints
            check_database_connectivity
            check_ai_providers
            
            echo ""
            log_info "Monitoring check completed"
            show_dashboard_urls
            ;;
        "report")
            generate_report
            ;;
        "alerts")
            setup_alerts
            ;;
        "dashboard")
            show_dashboard_urls
            ;;
        "watch")
            log_info "Starting continuous monitoring (Press Ctrl+C to stop)..."
            while true; do
                clear
                echo "📊 ISH Chat Deployment Monitoring - $(date)"
                echo "=============================================="
                echo ""
                
                main check
                
                echo ""
                log_info "Next check in 30 seconds..."
                sleep 30
            done
            ;;
        "help"|"-h"|"--help")
            echo "ISH Chat Deployment Monitoring Script"
            echo ""
            echo "Usage: $0 [COMMAND]"
            echo ""
            echo "Commands:"
            echo "  check     Run comprehensive monitoring check (default)"
            echo "  report    Generate detailed monitoring report"
            echo "  alerts    Set up monitoring alerts"
            echo "  dashboard Show dashboard URLs"
            echo "  watch     Start continuous monitoring"
            echo "  help      Show this help message"
            echo ""
            echo "Configuration:"
            echo "  Set these environment variables to customize alerts:"
            echo "  • ALERT_EMAIL              Email for alerts"
            echo "  • SLACK_WEBHOOK           Slack webhook URL"
            echo "  • TELEGRAM_BOT_TOKEN      Telegram bot token"
            echo "  • TELEGRAM_CHAT_ID        Telegram chat ID"
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