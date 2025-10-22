#!/bin/bash

# Tunneling Solution for ISH Automation (No Signup Required)
# Supports: serveo.net, localhost.run, bore.pub
# Handles WebSocket connections

set -e

PORT="${PORT:-3002}"
TUNNEL_METHOD="${TUNNEL_METHOD:-serveo}"
CUSTOM_SUBDOMAIN="${CUSTOM_SUBDOMAIN:-}"

echo "========================================="
echo "ISH Automation Tunneling Solution"
echo "========================================="
echo "Port: $PORT"
echo "Method: $TUNNEL_METHOD"
echo ""

# Check if service is running on the port
check_service() {
    if ! nc -z localhost $PORT 2>/dev/null; then
        echo "ERROR: No service running on port $PORT"
        echo "Please start your application first"
        exit 1
    fi
    echo "✓ Service detected on port $PORT"
}

# Method 1: serveo.net (SSH-based, most reliable)
tunnel_serveo() {
    echo ""
    echo "Starting Serveo.net tunnel..."
    echo "This provides a stable HTTPS URL with WebSocket support"
    echo ""

    if [ -n "$CUSTOM_SUBDOMAIN" ]; then
        echo "Requesting custom subdomain: $CUSTOM_SUBDOMAIN.serveo.net"
        ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R "$CUSTOM_SUBDOMAIN:80:localhost:$PORT" serveo.net
    else
        echo "Using random subdomain..."
        ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R "80:localhost:$PORT" serveo.net
    fi
}

# Method 2: localhost.run (SSH-based alternative)
tunnel_localhost_run() {
    echo ""
    echo "Starting localhost.run tunnel..."
    echo "This provides a stable HTTPS URL with WebSocket support"
    echo ""

    ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R "80:localhost:$PORT" nokey@localhost.run
}

# Method 3: bore.pub (Rust-based, requires bore binary)
tunnel_bore() {
    echo ""
    echo "Starting bore.pub tunnel..."
    echo ""

    # Check if bore is installed
    if ! command -v bore &> /dev/null; then
        echo "Installing bore..."
        cargo install bore-cli 2>/dev/null || {
            echo "ERROR: bore requires Rust/Cargo to be installed"
            echo "Install with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
            exit 1
        }
    fi

    bore local $PORT --to bore.pub
}

# Method 4: Direct SSH tunnel to a custom server (if you have one)
tunnel_custom_ssh() {
    if [ -z "$CUSTOM_SSH_HOST" ] || [ -z "$CUSTOM_SSH_USER" ]; then
        echo "ERROR: Custom SSH tunnel requires CUSTOM_SSH_HOST and CUSTOM_SSH_USER"
        exit 1
    fi

    echo ""
    echo "Starting custom SSH tunnel to $CUSTOM_SSH_HOST..."
    echo ""

    ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 \
        -R "0.0.0.0:$PORT:localhost:$PORT" \
        "$CUSTOM_SSH_USER@$CUSTOM_SSH_HOST"
}

# Cleanup handler
cleanup() {
    echo ""
    echo "Tunnel closed"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main execution
check_service

case "$TUNNEL_METHOD" in
    serveo)
        tunnel_serveo
        ;;
    localhost.run|localhost)
        tunnel_localhost_run
        ;;
    bore)
        tunnel_bore
        ;;
    custom)
        tunnel_custom_ssh
        ;;
    *)
        echo "Unknown tunnel method: $TUNNEL_METHOD"
        echo "Available methods: serveo, localhost.run, bore, custom"
        exit 1
        ;;
esac
