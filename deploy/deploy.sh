#!/bin/bash
################################################################################
# ISH Automation Deployment Script
# Supports zero-downtime blue-green deployment with health checks
################################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${PROJECT_ROOT}/logs/deployment.log"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$LOG_FILE"
}

# Parse arguments
ENVIRONMENT="${1:-production}"
VERSION="${2:-latest}"
DEPLOYMENT_TYPE="${3:-blue-green}"

log "======================================================================"
log "ISH Automation Deployment Script"
log "======================================================================"
log "Environment: $ENVIRONMENT"
log "Version: $VERSION"
log "Deployment Type: $DEPLOYMENT_TYPE"
log "======================================================================"

# Validate environment
case "$ENVIRONMENT" in
    development|staging|production)
        log "Valid environment: $ENVIRONMENT"
        ;;
    *)
        error "Invalid environment: $ENVIRONMENT"
        error "Must be one of: development, staging, production"
        exit 1
        ;;
esac

# Load environment-specific configuration
ENV_FILE="${PROJECT_ROOT}/config/environments/${ENVIRONMENT}.env"
if [ -f "$ENV_FILE" ]; then
    log "Loading environment configuration from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
else
    warning "Environment file not found: $ENV_FILE"
fi

# Pre-deployment checks
log "Running pre-deployment checks..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    error "Docker is not running"
    exit 1
fi
success "Docker is running"

# Check if required images exist
if ! docker image inspect "ish-automation:${VERSION}" > /dev/null 2>&1; then
    error "Docker image not found: ish-automation:${VERSION}"
    exit 1
fi
success "Docker image exists: ish-automation:${VERSION}"

# Function to check service health
check_health() {
    local service_url="$1"
    local max_attempts="${2:-30}"
    local attempt=0

    log "Checking health of $service_url"

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "$service_url/health" > /dev/null 2>&1; then
            success "Service is healthy: $service_url"
            return 0
        fi
        attempt=$((attempt + 1))
        log "Health check attempt $attempt/$max_attempts failed, retrying in 10s..."
        sleep 10
    done

    error "Service failed health check after $max_attempts attempts: $service_url"
    return 1
}

# Function to run database migrations
run_migrations() {
    log "Running database migrations..."

    if [ -f "${SCRIPT_DIR}/migrations.sh" ]; then
        bash "${SCRIPT_DIR}/migrations.sh" "$ENVIRONMENT"
    else
        warning "Migration script not found, skipping migrations"
    fi
}

# Function to create backup
create_backup() {
    log "Creating backup before deployment..."

    if [ -f "${SCRIPT_DIR}/backup.sh" ]; then
        bash "${SCRIPT_DIR}/backup.sh" "$ENVIRONMENT"
    else
        warning "Backup script not found, skipping backup"
    fi
}

# Function for blue-green deployment
blue_green_deploy() {
    log "Starting blue-green deployment..."

    # Determine current and new colors
    CURRENT_COLOR=$(docker ps --filter "name=ish-api" --format "{{.Names}}" | grep -o "blue\|green" || echo "blue")
    if [ "$CURRENT_COLOR" == "blue" ]; then
        NEW_COLOR="green"
    else
        NEW_COLOR="blue"
    fi

    log "Current deployment: $CURRENT_COLOR"
    log "New deployment: $NEW_COLOR"

    # Deploy new version
    log "Deploying new version with color: $NEW_COLOR"

    export DEPLOYMENT_COLOR="$NEW_COLOR"
    export IMAGE_VERSION="$VERSION"

    docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" \
        -f "${PROJECT_ROOT}/deploy/docker-compose.${NEW_COLOR}.yml" \
        up -d --no-deps --build \
        api-${NEW_COLOR} web-${NEW_COLOR} pwa-${NEW_COLOR}

    # Wait for new deployment to be healthy
    log "Waiting for new deployment to be healthy..."
    sleep 20

    if check_health "http://localhost:${API_PORT_NEW:-3100}"; then
        success "New deployment is healthy"
    else
        error "New deployment failed health check"
        log "Rolling back..."
        docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" \
            -f "${PROJECT_ROOT}/deploy/docker-compose.${NEW_COLOR}.yml" \
            down
        exit 1
    fi

    # Switch traffic to new deployment
    log "Switching traffic to new deployment..."

    # Update nginx/load balancer configuration
    if [ -f "${SCRIPT_DIR}/switch-traffic.sh" ]; then
        bash "${SCRIPT_DIR}/switch-traffic.sh" "$NEW_COLOR"
    fi

    # Wait for traffic switch
    sleep 10

    # Verify new deployment is serving traffic
    if check_health "http://localhost:${API_PORT:-3000}"; then
        success "Traffic successfully switched to new deployment"
    else
        error "New deployment not serving traffic correctly"
        exit 1
    fi

    # Stop old deployment
    log "Stopping old deployment: $CURRENT_COLOR"
    docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" \
        -f "${PROJECT_ROOT}/deploy/docker-compose.${CURRENT_COLOR}.yml" \
        down

    success "Blue-green deployment completed successfully"
}

# Function for rolling deployment
rolling_deploy() {
    log "Starting rolling deployment..."

    docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" \
        up -d --no-deps --build \
        --scale api=3 \
        api web pwa

    # Wait for services to be healthy
    sleep 20

    if check_health "http://localhost:${API_PORT:-3000}"; then
        success "Rolling deployment completed successfully"
    else
        error "Rolling deployment failed health check"
        exit 1
    fi
}

# Main deployment flow
log "Creating backup..."
create_backup

log "Running database migrations..."
run_migrations

# Execute deployment based on type
case "$DEPLOYMENT_TYPE" in
    blue-green)
        blue_green_deploy
        ;;
    rolling)
        rolling_deploy
        ;;
    *)
        error "Unknown deployment type: $DEPLOYMENT_TYPE"
        exit 1
        ;;
esac

# Post-deployment verification
log "Running post-deployment verification..."

# Check API health
if check_health "http://localhost:${API_PORT:-3000}"; then
    success "API health check passed"
else
    error "API health check failed"
    exit 1
fi

# Check Web health
if check_health "http://localhost:${WEB_PORT:-3001}"; then
    success "Web health check passed"
else
    error "Web health check failed"
    exit 1
fi

# Check PWA health
if check_health "http://localhost:${PWA_PORT:-3002}"; then
    success "PWA health check passed"
else
    error "PWA health check failed"
    exit 1
fi

# Run smoke tests
if [ -f "${SCRIPT_DIR}/smoke-tests.sh" ]; then
    log "Running smoke tests..."
    bash "${SCRIPT_DIR}/smoke-tests.sh" "$ENVIRONMENT"
fi

# Create deployment record
DEPLOYMENT_RECORD="${PROJECT_ROOT}/logs/deployments/${TIMESTAMP}_${ENVIRONMENT}_${VERSION}.json"
mkdir -p "$(dirname "$DEPLOYMENT_RECORD")"
cat > "$DEPLOYMENT_RECORD" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "version": "$VERSION",
  "deployment_type": "$DEPLOYMENT_TYPE",
  "status": "success",
  "deployed_by": "${USER:-unknown}",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF

success "======================================================================"
success "Deployment completed successfully!"
success "Environment: $ENVIRONMENT"
success "Version: $VERSION"
success "Timestamp: $TIMESTAMP"
success "======================================================================"

exit 0
