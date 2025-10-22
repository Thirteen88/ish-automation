#!/bin/bash

###############################################################################
# AI Orchestrator Monitoring Dashboard - Startup Script
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Functions
print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}   AI Orchestrator - Monitoring Dashboard${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check Node.js installation
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js >= 18.0.0"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version must be >= 18.0.0 (current: $(node -v))"
        exit 1
    fi

    print_success "Node.js $(node -v) detected"
}

# Install dependencies
install_dependencies() {
    print_info "Checking dependencies..."

    if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
        print_info "Installing dependencies..."
        cd "$SCRIPT_DIR"
        npm install
        print_success "Dependencies installed"
    else
        print_success "Dependencies already installed"
    fi
}

# Create .env file if not exists
setup_env() {
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        print_info "Creating .env file from template..."
        cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        print_success ".env file created"
        print_info "Please edit .env file to configure your settings"
    else
        print_success ".env file exists"
    fi
}

# Start server
start_server() {
    print_info "Starting monitoring server..."
    echo ""

    cd "$SCRIPT_DIR"

    # Load environment variables
    if [ -f "$SCRIPT_DIR/.env" ]; then
        export $(cat "$SCRIPT_DIR/.env" | grep -v '^#' | xargs)
    fi

    # Start the server
    node monitoring-server.js
}

# Main execution
main() {
    print_header
    echo ""

    # Check prerequisites
    check_node

    # Setup
    install_dependencies
    setup_env

    echo ""
    print_header
    echo ""

    # Start server
    start_server
}

# Run main function
main
