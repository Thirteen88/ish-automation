#!/bin/bash

# ISH Chat Load Balancer Deployment Script
# Deploys the complete load balancer and API gateway system

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-infrastructure/docker-compose.yml"
ENV_FILE="$PROJECT_ROOT/.env"

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check Docker
    if ! command_exists docker; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command_exists docker-compose; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check available memory
    total_mem=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    if [ "$total_mem" -lt 4096 ]; then
        log_warning "System has less than 4GB RAM. Performance may be affected."
    fi
    
    # Check available disk space
    available_space=$(df -BG "$PROJECT_ROOT" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available_space" -lt 10 ]; then
        log_warning "System has less than 10GB available disk space."
    fi
    
    log_success "System requirements check passed"
}

# Function to create environment file
create_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating environment file..."
        
        cat > "$ENV_FILE" << EOF
# ISH Chat Load Balancer Environment Configuration
# Generated on $(date)

# Network Configuration
COMPOSE_PROJECT_NAME=ish-chat
NETWORK_SUBNET=172.20.0.0/16

# SSL Configuration
SSL_DOMAIN=ish-chat.local
SSL_EMAIL=admin@ish-chat.local

# Database Configuration
POSTGRES_DB=ish_chat
POSTGRES_USER=ishchat
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Redis Configuration
REDIS_PASSWORD=$(openssl rand -base64 32)

# JWT Configuration
JWT_SECRET_KEY=$(openssl rand -base64 32)
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# API Keys (generate or set your own)
ZAI_API_KEY=your_zai_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Backend Configuration
BACKEND_API_KEY=ish-chat-secure-key-$(date +%s)
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000

# Performance Configuration
RATE_LIMIT_PER_MINUTE=60
MAX_FILE_SIZE=10485760
CACHE_TTL=3600

# Monitoring Configuration
PROMETHEUS_RETENTION=200h
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16)

# Logging Configuration
LOG_LEVEL=INFO
ENABLE_METRICS=true

# Security Configuration
ENABLE_SSL=true
ENABLE_RATE_LIMITING=true
ENABLE_JWT_AUTH=true
ENABLE_API_KEY_AUTH=true

# AI Provider Configuration
AI_TIMEOUT=30
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=1000

# Development/Production
ENVIRONMENT=production
DEBUG=false
EOF
        
        log_success "Environment file created at $ENV_FILE"
        log_warning "Please update the environment file with your actual API keys and configurations"
    else
        log_info "Environment file already exists at $ENV_FILE"
    fi
}

# Function to generate SSL certificates
generate_ssl_certificates() {
    log_info "Setting up SSL certificates..."
    
    SSL_DIR="$PROJECT_ROOT/docker-infrastructure/ssl"
    
    if [ ! -f "$SSL_DIR/cert.pem" ]; then
        if [ "${ENABLE_SSL:-true}" = "true" ]; then
            # Check if domain is set for Let's Encrypt
            if [ -n "$SSL_DOMAIN" ] && [ "$SSL_DOMAIN" != "ish-chat.local" ]; then
                log_info "Setting up Let's Encrypt certificates for $SSL_DOMAIN..."
                
                # Check if certbot is available
                if command_exists certbot; then
                    "$SSL_DIR/letsencrypt-setup.sh" "$SSL_DOMAIN" "${SSL_EMAIL:-admin@ish-chat.local}"
                else
                    log_warning "Certbot not found. Using self-signed certificates..."
                    "$SSL_DIR/generate-certs.sh" "$SSL_DOMAIN"
                fi
            else
                log_info "Generating self-signed certificates for development..."
                "$SSL_DIR/generate-certs.sh" "ish-chat.local"
            fi
        else
            log_warning "SSL is disabled. Skipping certificate generation."
        fi
    else
        log_info "SSL certificates already exist"
    fi
}

# Function to create secrets
create_secrets() {
    log_info "Creating secrets directory and files..."
    
    SECRETS_DIR="$PROJECT_ROOT/docker-infrastructure/secrets"
    mkdir -p "$SECRETS_DIR"
    
    # Create password files
    echo "$POSTGRES_PASSWORD" > "$SECRETS_DIR/postgres_password.txt"
    echo "$REDIS_PASSWORD" > "$SECRETS_DIR/redis_password.txt"
    echo "$ZAI_API_KEY" > "$SECRETS_DIR/zai_api_key.txt"
    echo "$OPENAI_API_KEY" > "$SECRETS_DIR/openai_api_key.txt"
    echo "$ANTHROPIC_API_KEY" > "$SECRETS_DIR/anthropic_api_key.txt"
    
    # Set proper permissions
    chmod 600 "$SECRETS_DIR"/*.txt
    
    log_success "Secrets created"
}

# Function to build Docker images
build_images() {
    log_info "Building Docker images..."
    
    cd "$PROJECT_ROOT/docker-infrastructure"
    
    # Build load balancer image
    log_info "Building Nginx load balancer image..."
    docker build -t ish-chat/nginx-lb:latest ./load-balancer/
    
    # Build main application image
    log_info "Building main application image..."
    docker build -t ish-chat/app:latest -f ./main-app.Dockerfile ..
    
    log_success "Docker images built successfully"
}

# Function to start services
start_services() {
    log_info "Starting services..."
    
    cd "$PROJECT_ROOT/docker-infrastructure"
    
    # Start with database first
    log_info "Starting database services..."
    docker-compose up -d postgres-primary redis
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 30
    
    # Start AI providers
    log_info "Starting AI providers..."
    docker-compose up -d zai-provider openai-provider claude-provider perplexity-provider
    
    # Wait for AI providers to be ready
    log_info "Waiting for AI providers to be ready..."
    sleep 30
    
    # Start main applications
    log_info "Starting main applications..."
    docker-compose up -d ish-chat-app-1 ish-chat-app-2
    
    # Wait for applications to be ready
    log_info "Waiting for applications to be ready..."
    sleep 30
    
    # Start load balancer and monitoring
    log_info "Starting load balancer and monitoring..."
    docker-compose up -d nginx-lb prometheus grafana
    
    log_success "All services started successfully"
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check if containers are running
    log_info "Checking container status..."
    cd "$PROJECT_ROOT/docker-infrastructure"
    
    containers=("ish-chat-nginx-lb" "ish-chat-app-1" "ish-chat-app-2" "ish-chat-postgres-primary" "ish-chat-redis" "ish-chat-zai-provider" "ish-chat-openai-provider" "ish-chat-claude-provider" "ish-chat-perplexity-provider" "ish-chat-prometheus" "ish-chat-grafana")
    
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "$container"; then
            log_success "✓ $container is running"
        else
            log_error "✗ $container is not running"
        fi
    done
    
    # Check health endpoints
    log_info "Checking health endpoints..."
    
    # Check load balancer health
    if curl -f -s http://localhost/health >/dev/null; then
        log_success "✓ Load balancer health check passed"
    else
        log_error "✗ Load balancer health check failed"
    fi
    
    # Check application health
    if curl -f -s http://localhost:8010/health >/dev/null; then
        log_success "✓ Application 1 health check passed"
    else
        log_error "✗ Application 1 health check failed"
    fi
    
    if curl -f -s http://localhost:8011/health >/dev/null; then
        log_success "✓ Application 2 health check passed"
    else
        log_error "✗ Application 2 health check failed"
    fi
    
    # Check SSL
    if [ "${ENABLE_SSL:-true}" = "true" ]; then
        log_info "Checking SSL configuration..."
        if curl -k -s https://localhost/health >/dev/null; then
            log_success "✓ SSL configuration is working"
        else
            log_warning "⚠ SSL configuration may have issues"
        fi
    fi
    
    # Check monitoring
    if curl -f -s http://localhost:9090/metrics >/dev/null; then
        log_success "✓ Prometheus metrics endpoint is accessible"
    else
        log_error "✗ Prometheus metrics endpoint is not accessible"
    fi
    
    if curl -f -s http://localhost:3000/api/health >/dev/null; then
        log_success "✓ Grafana is accessible"
    else
        log_error "✗ Grafana is not accessible"
    fi
}

# Function to show deployment summary
show_summary() {
    log_info "Deployment Summary"
    echo "===================="
    echo ""
    echo "🚀 ISH Chat Load Balancer deployed successfully!"
    echo ""
    echo "📋 Service URLs:"
    echo "   • Main Application: http://localhost"
    if [ "${ENABLE_SSL:-true}" = "true" ]; then
        echo "   • Main Application (HTTPS): https://localhost"
    fi
    echo "   • Application 1: http://localhost:8010"
    echo "   • Application 2: http://localhost:8011"
    echo "   • Prometheus: http://localhost:9090"
    echo "   • Grafana: http://localhost:3000"
    echo ""
    echo "🔑 Grafana Login:"
    echo "   • Username: admin"
    echo "   • Password: $GRAFANA_ADMIN_PASSWORD"
    echo ""
    echo "📊 Health Endpoints:"
    echo "   • Load Balancer: http://localhost/health"
    echo "   • Application 1: http://localhost:8010/health"
    echo "   • Application 2: http://localhost:8011/health"
    echo ""
    echo "🔧 Management Commands:"
    echo "   • View logs: docker-compose logs -f"
    echo "   • Stop services: docker-compose down"
    echo "   • Restart services: docker-compose restart"
    echo "   • Update services: docker-compose pull && docker-compose up -d"
    echo ""
    echo "📁 Important Files:"
    echo "   • Environment: $ENV_FILE"
    echo "   • Docker Compose: $DOCKER_COMPOSE_FILE"
    echo "   • SSL Certificates: $PROJECT_ROOT/docker-infrastructure/ssl/"
    echo "   • Secrets: $PROJECT_ROOT/docker-infrastructure/secrets/"
    echo ""
    echo "⚠️  Important Notes:"
    echo "   • Update your API keys in the .env file"
    echo "   • Configure your domain for production SSL certificates"
    echo "   • Monitor system resources and adjust configurations as needed"
    echo "   • Regular backup of database and configurations is recommended"
    echo ""
}

# Function to cleanup on error
cleanup() {
    if [ $? -ne 0 ]; then
        log_error "Deployment failed. Cleaning up..."
        cd "$PROJECT_ROOT/docker-infrastructure"
        docker-compose down 2>/dev/null || true
        log_info "Cleanup completed"
    fi
}

# Main deployment function
main() {
    echo "🚀 ISH Chat Load Balancer Deployment"
    echo "==================================="
    echo ""
    
    # Set up error handling
    trap cleanup ERR
    
    # Check if running as root (not recommended for Docker)
    if [ "$EUID" -eq 0 ]; then
        log_warning "Running as root is not recommended for Docker deployments"
    fi
    
    # Change to project directory
    cd "$PROJECT_ROOT"
    
    # Load environment variables
    if [ -f "$ENV_FILE" ]; then
        source "$ENV_FILE"
        log_info "Environment variables loaded from $ENV_FILE"
    fi
    
    # Run deployment steps
    check_requirements
    create_env_file
    generate_ssl_certificates
    create_secrets
    build_images
    start_services
    verify_deployment
    show_summary
    
    log_success "Deployment completed successfully! 🎉"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        log_info "Stopping all services..."
        cd "$PROJECT_ROOT/docker-infrastructure"
        docker-compose down
        log_success "All services stopped"
        ;;
    "restart")
        log_info "Restarting all services..."
        cd "$PROJECT_ROOT/docker-infrastructure"
        docker-compose restart
        log_success "All services restarted"
        ;;
    "logs")
        cd "$PROJECT_ROOT/docker-infrastructure"
        docker-compose logs -f
        ;;
    "status")
        cd "$PROJECT_ROOT/docker-infrastructure"
        docker-compose ps
        ;;
    "health")
        verify_deployment
        ;;
    "update")
        log_info "Updating services..."
        cd "$PROJECT_ROOT/docker-infrastructure"
        docker-compose pull
        docker-compose up -d
        verify_deployment
        log_success "Services updated"
        ;;
    "clean")
        log_warning "This will remove all containers, networks, and volumes. Are you sure? (y/N)"
        read -r response
        if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            cd "$PROJECT_ROOT/docker-infrastructure"
            docker-compose down -v --rmi all
            docker system prune -f
            log_success "Cleanup completed"
        else
            log_info "Cleanup cancelled"
        fi
        ;;
    "help"|"-h"|"--help")
        echo "ISH Chat Load Balancer Deployment Script"
        echo ""
        echo "Usage: $0 [COMMAND]"
        echo ""
        echo "Commands:"
        echo "  deploy    Deploy the complete load balancer system (default)"
        echo "  stop      Stop all services"
        echo "  restart   Restart all services"
        echo "  logs      Show logs for all services"
        echo "  status    Show status of all services"
        echo "  health    Check health of all services"
        echo "  update    Update services to latest versions"
        echo "  clean     Remove all containers, networks, and volumes"
        echo "  help      Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 deploy     # Deploy the system"
        echo "  $0 logs       # View logs"
        echo "  $0 status     # Check status"
        echo ""
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for available commands"
        exit 1
        ;;
esac