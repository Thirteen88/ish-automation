#!/bin/bash

# Quick Start Script for AI Orchestrator Mobile PWA
#
# This script helps you get the mobile PWA up and running quickly

set -e

echo "🚀 AI Orchestrator Mobile PWA - Quick Start"
echo "==========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "manifest.webmanifest" ]; then
    echo "❌ Error: Please run this script from the mobile-app directory"
    exit 1
fi

# Step 1: Generate assets
echo "📦 Step 1: Generating PWA assets..."
echo ""

if command -v convert &> /dev/null; then
    echo "✅ ImageMagick found. Generating icons and splash screens..."
    ./generate-assets.sh
else
    echo "⚠️  ImageMagick not found. Skipping asset generation."
    echo "   Install with: sudo apt-get install imagemagick"
    echo "   Or download pre-made assets manually."
    echo ""
fi

# Step 2: Check server
echo "📡 Step 2: Checking orchestrator server..."
echo ""

SERVER_URL="http://localhost:3000"

if curl -s "${SERVER_URL}/health" > /dev/null 2>&1; then
    echo "✅ Orchestrator server is running at ${SERVER_URL}"
else
    echo "⚠️  Orchestrator server not detected at ${SERVER_URL}"
    echo "   Start it with: cd .. && node web-server.js"
fi

echo ""

# Step 3: Serve the PWA
echo "📱 Step 3: Starting PWA server..."
echo ""

# Check if serve is available
if command -v npx &> /dev/null; then
    echo "🌐 Serving PWA at http://localhost:8080"
    echo ""
    echo "📱 To test on mobile:"
    echo "   1. Make sure your phone is on the same network"
    echo "   2. Find your local IP: ip addr show | grep 'inet '"
    echo "   3. Open http://YOUR_IP:8080 on your phone"
    echo ""
    echo "📲 To install as PWA:"
    echo "   • iOS: Safari → Share → Add to Home Screen"
    echo "   • Android: Chrome → Menu → Install App"
    echo ""
    echo "🌍 For external access (testing):"
    echo "   • Install ngrok: npm install -g ngrok"
    echo "   • Run: ngrok http 8080"
    echo "   • Use the https URL provided"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    echo "Starting server..."
    sleep 2

    # Start the server
    npx serve -l 8080 .

else
    echo "❌ npx not found. Please install Node.js first."
    echo "   Or use any other static file server:"
    echo ""
    echo "   Python 3: python3 -m http.server 8080"
    echo "   PHP: php -S localhost:8080"
    echo "   nginx: Configure to serve this directory"
    exit 1
fi
