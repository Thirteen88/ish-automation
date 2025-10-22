#!/bin/bash

###############################################################################
# AI Orchestrator Web Interface Startup Script
#
# This script starts the web server with proper configuration
# and provides helpful startup information.
###############################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
NODE_ENV="${NODE_ENV:-development}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}║        AI Orchestrator Web Interface Startup           ║${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Node.js version
echo -e "${YELLOW}Checking system requirements...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js 18 or higher"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js version 18 or higher required${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies found${NC}"
fi

# Create required directories
echo -e "${YELLOW}Creating required directories...${NC}"
mkdir -p cookies sessions screenshots downloads logs public

echo -e "${GREEN}✓ Directories created${NC}"

# Check if browser automation is configured
if [ ! -f "selectors-config.json" ]; then
    echo -e "${RED}Error: selectors-config.json not found${NC}"
    echo "Please ensure the configuration file exists"
    exit 1
fi

echo -e "${GREEN}✓ Configuration found${NC}"

# Display startup information
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Starting Web Server...                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Configuration:${NC}"
echo -e "  Environment:  ${NODE_ENV}"
echo -e "  Host:         ${HOST}"
echo -e "  Port:         ${PORT}"
echo ""
echo -e "${GREEN}Server will be available at:${NC}"
echo -e "  Local:        ${BLUE}http://localhost:${PORT}${NC}"

# Get local IP address
if command -v hostname &> /dev/null; then
    LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "unavailable")
    if [ "$LOCAL_IP" != "unavailable" ]; then
        echo -e "  Network:      ${BLUE}http://${LOCAL_IP}:${PORT}${NC}"
    fi
fi

echo ""
echo -e "${YELLOW}Available platforms:${NC}"
echo -e "  • LMArena (lmarena.ai)"
echo -e "  • Claude.ai"
echo -e "  • ChatGPT (chat.openai.com)"
echo -e "  • Google Gemini"
echo -e "  • Poe.com"
echo ""
echo -e "${YELLOW}API Endpoints:${NC}"
echo -e "  • POST   /api/query          Submit query"
echo -e "  • GET    /api/status         Platform status"
echo -e "  • GET    /api/history        Query history"
echo -e "  • POST   /api/vote           Vote on response"
echo -e "  • GET    /api/metrics        System metrics"
echo ""
echo -e "${YELLOW}WebSocket:${NC}"
echo -e "  • ws://localhost:${PORT}     Real-time updates"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop the server${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Start the server
export PORT
export HOST
export NODE_ENV

# Check if web-server.js exists
if [ ! -f "web-server.js" ]; then
    echo -e "${RED}Error: web-server.js not found${NC}"
    echo "Please ensure you're in the correct directory"
    exit 1
fi

# Start with node
node web-server.js

# Cleanup on exit
trap 'echo -e "\n${YELLOW}Shutting down gracefully...${NC}"; exit 0' INT TERM
