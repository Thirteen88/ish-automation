#!/bin/bash

###############################################################################
# ISH AI Orchestrator API - Quick Start Script
# Automated setup and launch
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
cat << "EOF"
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     ISH AI Orchestrator API Service                     ║
║     Production-Ready REST API                           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ Node.js found:${NC} $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm found:${NC} $(npm --version)"

# Navigate to api-service directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "\n${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "\n${YELLOW}Creating .env file...${NC}"
    cp .env.example .env

    # Generate random API keys
    API_KEY_1=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    API_KEY_2=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)

    # Update .env with generated keys
    sed -i.bak "s/your-api-key-1/$API_KEY_1/g" .env
    sed -i.bak "s/your-api-key-2/$API_KEY_2/g" .env
    rm .env.bak 2>/dev/null || true

    echo -e "${GREEN}✓ Environment file created${NC}"
    echo -e "${YELLOW}Generated API Keys:${NC}"
    echo -e "  Key 1: ${BLUE}$API_KEY_1${NC}"
    echo -e "  Key 2: ${BLUE}$API_KEY_2${NC}"
    echo -e "${YELLOW}Save these keys - they won't be shown again!${NC}"
else
    echo -e "${GREEN}✓ Environment file exists${NC}"
fi

# Create required directories
echo -e "\n${YELLOW}Creating directories...${NC}"
mkdir -p logs data

# Start the server
echo -e "\n${GREEN}Starting API server...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

# Run the server
npm start
