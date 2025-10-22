#!/bin/bash

# ARIA Server Comparison and Migration Script

echo "======================================"
echo "ARIA Server Migration Tool"
echo "======================================"
echo ""

# Check if the improved server file exists
if [ ! -f "aria-mobile-server-improved.js" ]; then
    echo "Error: aria-mobile-server-improved.js not found"
    exit 1
fi

# Function to test server
test_server() {
    local port=$1
    local server_name=$2

    echo "Testing $server_name on port $port..."
    echo "------------------------------------"

    # Wait for server to start
    sleep 2

    # Test health endpoint
    if curl -s http://localhost:$port/health > /dev/null 2>&1; then
        echo "✓ Health check available"
    else
        echo "✗ Health check not available"
    fi

    # Test CORS
    if curl -s -I -H "Origin: https://example.com" http://localhost:$port/ | grep -q "Access-Control-Allow-Origin"; then
        echo "✓ CORS headers present"
    else
        echo "✗ CORS headers missing"
    fi

    # Test root
    if curl -s http://localhost:$port/ | grep -q "ARIA"; then
        echo "✓ Web interface working"
    else
        echo "✗ Web interface not working"
    fi

    echo ""
}

# Show differences
echo "Key Differences:"
echo "------------------------------------"
echo "Original Server (aria-mobile-server.js):"
echo "  - Default port: 3001"
echo "  - No CORS support"
echo "  - No health check endpoints"
echo "  - Basic WebSocket handling"
echo ""
echo "Improved Server (aria-mobile-server-improved.js):"
echo "  - Default port: 3002"
echo "  - Full CORS support"
echo "  - Health check endpoints (/health, /status, /ping)"
echo "  - Enhanced WebSocket with heartbeat"
echo "  - Auto-reconnection logic"
echo "  - Better error handling"
echo "  - Connection status indicators"
echo ""

# Migration options
echo "======================================"
echo "Migration Options"
echo "======================================"
echo ""
echo "1. Replace existing server (backup created)"
echo "2. Run improved server on different port"
echo "3. Compare side-by-side"
echo "4. Exit"
echo ""
read -p "Choose option (1-4): " option

case $option in
    1)
        echo ""
        echo "Creating backup..."
        cp aria-mobile-server.js aria-mobile-server.backup.js
        echo "✓ Backup created: aria-mobile-server.backup.js"

        echo "Replacing server..."
        cp aria-mobile-server-improved.js aria-mobile-server.js
        echo "✓ Server replaced"

        echo ""
        echo "Migration complete!"
        echo "To restore original: cp aria-mobile-server.backup.js aria-mobile-server.js"
        ;;

    2)
        echo ""
        echo "Starting improved server on port 3002..."
        echo "Original server on port 3001 remains unchanged"
        echo ""
        echo "Run: PORT=3002 node aria-mobile-server-improved.js"
        ;;

    3)
        echo ""
        echo "Side-by-side comparison:"
        echo ""
        echo "Original server features:"
        grep -c "app.get" aria-mobile-server.js | xargs echo "  Endpoints:"
        echo "  CORS: No"
        echo "  Health checks: No"
        echo "  WebSocket heartbeat: No"
        echo ""
        echo "Improved server features:"
        grep -c "app.get" aria-mobile-server-improved.js | xargs echo "  Endpoints:"
        echo "  CORS: Yes"
        echo "  Health checks: Yes"
        echo "  WebSocket heartbeat: Yes"
        echo ""
        ;;

    4)
        echo "Exiting..."
        exit 0
        ;;

    *)
        echo "Invalid option"
        exit 1
        ;;
esac

echo ""
echo "Next steps:"
echo "1. Test the improved server: ./test-server.sh 3002 localhost"
echo "2. Configure your tunnel: npx localtunnel --port 3002"
echo "3. Access from mobile device"
echo ""
