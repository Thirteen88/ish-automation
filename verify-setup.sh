#!/bin/bash

# ARIA Server Verification Script
# Verifies all components are in place and working

set -e

echo "======================================"
echo "ARIA Server Setup Verification"
echo "======================================"
echo ""

PASS_COUNT=0
FAIL_COUNT=0

# Helper functions
check_file() {
    local file=$1
    local description=$2

    if [ -f "$file" ]; then
        echo "✓ $description"
        echo "  File: $file"
        echo "  Size: $(ls -lh "$file" | awk '{print $5}')"
        ((PASS_COUNT++))
    else
        echo "✗ $description"
        echo "  Missing: $file"
        ((FAIL_COUNT++))
    fi
    echo ""
}

check_executable() {
    local file=$1
    local description=$2

    if [ -f "$file" ] && [ -x "$file" ]; then
        echo "✓ $description (executable)"
        echo "  File: $file"
        ((PASS_COUNT++))
    elif [ -f "$file" ]; then
        echo "⚠ $description (not executable)"
        echo "  File: $file"
        echo "  Fix: chmod +x $file"
        ((FAIL_COUNT++))
    else
        echo "✗ $description"
        echo "  Missing: $file"
        ((FAIL_COUNT++))
    fi
    echo ""
}

# Check core files
echo "Checking Core Files..."
echo "------------------------------------"
check_file "aria-mobile-server.js" "Original ARIA Server"
check_file "aria-mobile-server-improved.js" "Improved ARIA Server"
check_file "aria.js" "ARIA Core Module"

# Check scripts
echo "Checking Scripts..."
echo "------------------------------------"
check_executable "test-server.sh" "Server Test Script"
check_executable "migrate-server.sh" "Migration Script"
check_executable "start-aria-server.sh" "Quick Start Script"

# Check documentation
echo "Checking Documentation..."
echo "------------------------------------"
check_file "EXTERNAL_ACCESS_GUIDE.md" "External Access Guide"
check_file "README_FIXES.md" "Fixes Summary"

# Check Node.js and dependencies
echo "Checking Environment..."
echo "------------------------------------"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js installed: $NODE_VERSION"
    ((PASS_COUNT++))
else
    echo "✗ Node.js not found"
    ((FAIL_COUNT++))
fi
echo ""

if [ -f "package.json" ]; then
    echo "✓ package.json found"
    ((PASS_COUNT++))

    # Check for required dependencies
    if command -v node &> /dev/null; then
        echo "  Checking dependencies..."

        if node -e "require('express')" 2>/dev/null; then
            echo "  ✓ express installed"
        else
            echo "  ✗ express missing (run: npm install)"
        fi

        if node -e "require('ws')" 2>/dev/null; then
            echo "  ✓ ws (WebSocket) installed"
        else
            echo "  ✗ ws missing (run: npm install)"
        fi
    fi
else
    echo "✗ package.json not found"
    ((FAIL_COUNT++))
fi
echo ""

# Test server functionality (if server is running)
echo "Checking Server Status..."
echo "------------------------------------"

if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "✓ Server running on port 3002"
    ((PASS_COUNT++))

    # Try to connect
    if curl -s --max-time 2 http://localhost:3002/ping > /dev/null 2>&1; then
        echo "✓ Server responding to requests"
        ((PASS_COUNT++))

        # Check for improved server features
        if curl -s -I http://localhost:3002/ | grep -q "Access-Control-Allow-Origin"; then
            echo "✓ CORS headers detected (improved server)"
            ((PASS_COUNT++))
        else
            echo "⚠ No CORS headers (original server running)"
            echo "  Consider switching to improved server"
            ((FAIL_COUNT++))
        fi
    else
        echo "⚠ Server not responding"
        ((FAIL_COUNT++))
    fi
else
    echo "⚠ No server running on port 3002"
    echo "  To start: ./start-aria-server.sh"
fi
echo ""

# Summary
echo "======================================"
echo "Verification Summary"
echo "======================================"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "✅ All checks passed!"
    echo ""
    echo "Next steps:"
    echo "1. Start the server: ./start-aria-server.sh"
    echo "2. Test the server: ./test-server.sh 3002 localhost"
    echo "3. Set up tunnel for external access"
    echo "4. Access from mobile device"
else
    echo "⚠️ Some checks failed"
    echo ""
    echo "Common fixes:"
    echo "- Install dependencies: npm install"
    echo "- Make scripts executable: chmod +x *.sh"
    echo "- Start the server: ./start-aria-server.sh"
fi
echo ""

# Quick start reminder
echo "======================================"
echo "Quick Start Commands"
echo "======================================"
echo ""
echo "Test server configuration:"
echo "  ./test-server.sh 3002 localhost"
echo ""
echo "Start improved server:"
echo "  ./start-aria-server.sh"
echo ""
echo "Start with tunnel:"
echo "  PORT=3002 node aria-mobile-server-improved.js &"
echo "  npx localtunnel --port 3002 --subdomain aria-gary"
echo ""
echo "Migrate to improved server:"
echo "  ./migrate-server.sh"
echo ""
