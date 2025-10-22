#!/bin/bash

# ARIA Personal Assistant Launcher
# Easy startup script for your AI assistant

echo "═══════════════════════════════════════════════════════════"
echo "           Starting ARIA Personal Assistant"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Start ARIA
node aria.js

# Keep terminal open on Windows
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    read -p "Press any key to exit..."
fi