#!/bin/bash

# ARIA Web Server Quick Start Script
# Launches the improved server with optimal settings for external access

set -e

# Configuration
PORT=${PORT:-3002}
HOST=${HOST:-0.0.0.0}
NODE_ENV=${NODE_ENV:-production}

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================"
echo "ARIA Web Server Quick Start"
echo -e "======================================${NC}"
echo ""

# Check if improved server exists
if [ ! -f "aria-mobile-server-improved.js" ]; then
    echo -e "${YELLOW}Warning: aria-mobile-server-improved.js not found${NC}"
    echo "Using aria-mobile-server.js instead..."
    SERVER_FILE="aria-mobile-server.js"
else
    SERVER_FILE="aria-mobile-server-improved.js"
fi

# Check if aria.js exists
if [ ! -f "aria.js" ]; then
    echo -e "${YELLOW}Warning: aria.js not found${NC}"
    echo "Make sure ARIA is properly set up"
fi

# Display configuration
echo -e "${GREEN}Configuration:${NC}"
echo "  Server: $SERVER_FILE"
echo "  Port: $PORT"
echo "  Host: $HOST"
echo "  Environment: $NODE_ENV"
echo ""

# Check if port is available
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}Warning: Port $PORT is already in use${NC}"
    read -p "Do you want to kill the existing process? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PID=$(lsof -ti:$PORT)
        kill -9 $PID 2>/dev/null || true
        echo "Process killed"
        sleep 1
    else
        echo "Exiting..."
        exit 1
    fi
fi

# Display access information
echo -e "${GREEN}Server will be accessible at:${NC}"
echo "  Local: http://localhost:$PORT"

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "unknown")
if [ "$LOCAL_IP" != "unknown" ]; then
    echo "  Network: http://$LOCAL_IP:$PORT"
fi

echo ""
echo -e "${BLUE}For external access, use a tunnel service:${NC}"
echo "  localtunnel: npx localtunnel --port $PORT --subdomain aria-gary"
echo "  ngrok: ngrok http $PORT"
echo "  bore: bore local $PORT --to bore.pub"
echo ""

# Option to start tunnel automatically
read -p "Start localtunnel automatically? (y/n) " -n 1 -r
echo ""
TUNNEL_PID=""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting localtunnel..."
    npx localtunnel --port $PORT --subdomain aria-gary &
    TUNNEL_PID=$!
    sleep 3
    echo -e "${GREEN}Tunnel started (PID: $TUNNEL_PID)${NC}"
    echo "Public URL: https://aria-gary.loca.lt"
    echo ""
fi

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down..."
    if [ ! -z "$TUNNEL_PID" ]; then
        kill $TUNNEL_PID 2>/dev/null || true
        echo "Tunnel stopped"
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start the server
echo -e "${GREEN}Starting ARIA Web Server...${NC}"
echo "Press Ctrl+C to stop"
echo ""

PORT=$PORT HOST=$HOST NODE_ENV=$NODE_ENV node $SERVER_FILE

# This line will only be reached if the server exits
if [ ! -z "$TUNNEL_PID" ]; then
    kill $TUNNEL_PID 2>/dev/null || true
fi
