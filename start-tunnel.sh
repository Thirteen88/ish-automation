#!/bin/bash

# Smart Tunnel Manager with Auto-Reconnect
# No signup required - works immediately!

set -e

PORT="${PORT:-3002}"
LOGFILE="${LOGFILE:-/tmp/ish-tunnel.log}"
SUBDOMAIN="${SUBDOMAIN:-ish-aria-$RANDOM}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOGFILE"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOGFILE"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOGFILE"
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOGFILE"
}

# Check if service is running
check_service() {
    if ! nc -z localhost $PORT 2>/dev/null && ! ss -tlnp 2>/dev/null | grep -q ":$PORT"; then
        error "No service running on port $PORT"
        error "Please start your application first"
        exit 1
    fi
    log "Service detected on port $PORT ✓"
}

# Extract public URL from serveo output
extract_url() {
    grep -o 'https://[a-z0-9.-]*\.serveo\.net' | head -1
}

# Start tunnel with auto-reconnect
start_tunnel() {
    local attempt=1
    local max_attempts=999
    local public_url=""

    while [ $attempt -le $max_attempts ]; do
        log "Tunnel attempt #$attempt"

        # Start serveo tunnel and capture output
        {
            ssh -o StrictHostKeyChecking=no \
                -o ServerAliveInterval=30 \
                -o ServerAliveCountMax=3 \
                -o ExitOnForwardFailure=yes \
                -R "$SUBDOMAIN:80:localhost:$PORT" \
                serveo.net 2>&1 | while IFS= read -r line; do

                echo "$line" | tee -a "$LOGFILE"

                # Extract and display public URL
                if echo "$line" | grep -q "Forwarding HTTP"; then
                    public_url=$(echo "$line" | extract_url)
                    if [ -n "$public_url" ]; then
                        echo ""
                        echo "========================================="
                        log "TUNNEL ACTIVE!"
                        log "Public URL: ${GREEN}$public_url${NC}"
                        echo "========================================="
                        echo ""
                        echo "Your ARIA assistant is now accessible at:"
                        echo ""
                        echo "  $public_url"
                        echo ""
                        echo "Features:"
                        echo "  ✓ HTTPS enabled"
                        echo "  ✓ WebSocket support"
                        echo "  ✓ No authentication required"
                        echo "  ✓ No signup needed"
                        echo ""
                        echo "Press Ctrl+C to stop the tunnel"
                        echo "========================================="
                        echo ""
                    fi
                fi
            done
        } || {
            error "Tunnel disconnected"
            warn "Reconnecting in 5 seconds... (attempt $attempt/$max_attempts)"
            sleep 5
            attempt=$((attempt + 1))
            continue
        }

        break
    done
}

# Cleanup on exit
cleanup() {
    echo ""
    log "Shutting down tunnel..."
    log "Tunnel closed successfully"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Main execution
clear
echo "========================================="
echo "ISH Automation Tunnel Manager"
echo "========================================="
echo ""
info "Configuration:"
echo "  - Local Port: $PORT"
echo "  - Subdomain: $SUBDOMAIN"
echo "  - Log File: $LOGFILE"
echo ""

check_service

log "Starting tunnel with auto-reconnect..."
echo ""

start_tunnel
