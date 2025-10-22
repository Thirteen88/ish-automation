#!/bin/bash

# AI Response Comparison Tool Launcher
# This script starts the comparison tool with optional orchestrator integration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   AI Response Comparison & Ranking Tool Launcher     ║"
echo "╔═══════════════════════════════════════════════════════╗"
echo -e "${NC}"

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

print_success "Node.js found: $(node --version)"

# Check if required files exist
if [ ! -f "index.html" ]; then
    print_error "index.html not found. Please ensure you're in the comparison-tool directory."
    exit 1
fi

print_success "Comparison tool files found"

# Parse command line arguments
MODE="standalone"
PORT=3001

while [[ $# -gt 0 ]]; do
    case $1 in
        --integrated)
            MODE="integrated"
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --integrated    Start integrated with orchestrator"
            echo "  --port PORT     Specify port (default: 3001)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Start the server
if [ "$MODE" = "integrated" ]; then
    print_info "Starting comparison tool integrated with orchestrator..."

    # Check if orchestrator is running
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        print_success "Orchestrator detected on port 3000"
        print_info "Comparison tool will be available at: http://localhost:3000/comparison"
        print_info "Please restart the orchestrator to load comparison endpoints"
    else
        print_warning "Orchestrator not detected on port 3000"
        print_info "Start the orchestrator with: node ai-orchestrator.js"
    fi
else
    print_info "Starting standalone comparison tool server..."

    # Check if port is available
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_error "Port $PORT is already in use"
        print_info "Use --port to specify a different port"
        exit 1
    fi

    # Start the server
    PORT=$PORT node -e "require('./integration.js').startComparisonServer($PORT)" &
    SERVER_PID=$!

    # Wait for server to start
    sleep 2

    if kill -0 $SERVER_PID 2>/dev/null; then
        print_success "Server started successfully (PID: $SERVER_PID)"
        print_success "Comparison tool available at: http://localhost:$PORT/comparison"
        print_info "Press Ctrl+C to stop the server"

        # Open browser if available
        if command -v xdg-open &> /dev/null; then
            print_info "Opening browser..."
            xdg-open "http://localhost:$PORT/comparison" 2>/dev/null &
        elif command -v open &> /dev/null; then
            print_info "Opening browser..."
            open "http://localhost:$PORT/comparison" 2>/dev/null &
        fi

        # Wait for server process
        wait $SERVER_PID
    else
        print_error "Failed to start server"
        exit 1
    fi
fi

echo ""
print_info "Quick Start Guide:"
echo "  1. Click 'Load Responses' to upload a JSON file"
echo "  2. Or click 'Load from Orchestrator' to fetch recent data"
echo "  3. Compare responses using different algorithms"
echo "  4. Drag and drop to rank responses"
echo "  5. Export reports in various formats"
echo ""
print_success "Ready to compare AI responses!"
