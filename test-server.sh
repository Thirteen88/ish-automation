#!/bin/bash

# ARIA Server Test Script
# Tests the improved server configuration

echo "======================================"
echo "ARIA Web Server Configuration Test"
echo "======================================"
echo ""

PORT=${1:-3002}
HOST=${2:-localhost}

# Test 1: HTTP Health Check
echo "Test 1: HTTP Health Check"
echo "------------------------------------"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://${HOST}:${PORT}/health)
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")

if [ "$http_code" = "200" ]; then
    echo "✓ Health check passed"
    echo "Response: $body" | head -c 200
    echo "..."
else
    echo "✗ Health check failed (HTTP $http_code)"
fi
echo ""

# Test 2: Status Endpoint
echo "Test 2: Status Endpoint"
echo "------------------------------------"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://${HOST}:${PORT}/status)
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")

if [ "$http_code" = "200" ]; then
    echo "✓ Status endpoint passed"
    echo "Response: $body" | head -c 200
    echo "..."
else
    echo "✗ Status endpoint failed (HTTP $http_code)"
fi
echo ""

# Test 3: Ping Endpoint
echo "Test 3: Ping Endpoint"
echo "------------------------------------"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://${HOST}:${PORT}/ping)
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")

if [ "$http_code" = "200" ] && [ "$body" = "pong" ]; then
    echo "✓ Ping endpoint passed"
    echo "Response: $body"
else
    echo "✗ Ping endpoint failed (HTTP $http_code, Response: $body)"
fi
echo ""

# Test 4: Root Endpoint (Web Interface)
echo "Test 4: Root Endpoint (Web Interface)"
echo "------------------------------------"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://${HOST}:${PORT}/)
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")

if [ "$http_code" = "200" ]; then
    echo "✓ Web interface served successfully"
    # Check if it contains expected content
    if echo "$body" | grep -q "ARIA"; then
        echo "✓ Contains ARIA branding"
    else
        echo "⚠ Web interface may not be correct"
    fi
else
    echo "✗ Web interface failed (HTTP $http_code)"
fi
echo ""

# Test 5: CORS Headers
echo "Test 5: CORS Headers"
echo "------------------------------------"
headers=$(curl -s -I -H "Origin: https://example.com" http://${HOST}:${PORT}/)
if echo "$headers" | grep -q "Access-Control-Allow-Origin"; then
    echo "✓ CORS headers present"
    echo "$headers" | grep "Access-Control"
else
    echo "✗ CORS headers missing"
fi
echo ""

# Test 6: Preflight Request
echo "Test 6: CORS Preflight Request"
echo "------------------------------------"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X OPTIONS \
    -H "Origin: https://example.com" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    http://${HOST}:${PORT}/)
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)

if [ "$http_code" = "204" ]; then
    echo "✓ CORS preflight handled correctly"
else
    echo "✗ CORS preflight failed (HTTP $http_code)"
fi
echo ""

# Test 7: External Access Test
echo "Test 7: External Access Test"
echo "------------------------------------"
if [ "$HOST" = "localhost" ]; then
    echo "⚠ Testing on localhost. To test external access:"
    echo "  1. Start the server with: PORT=3002 node aria-mobile-server-improved.js"
    echo "  2. Run this script with your public IP: ./test-server.sh 3002 <public-ip>"
    echo "  3. Or use a tunneling service like localtunnel:"
    echo "     npx localtunnel --port 3002"
else
    echo "Testing external access to $HOST:$PORT..."
    if curl -s --max-time 5 http://${HOST}:${PORT}/ping > /dev/null; then
        echo "✓ External access successful"
    else
        echo "✗ External access failed"
    fi
fi
echo ""

# Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo "Server: http://${HOST}:${PORT}"
echo ""
echo "Next Steps:"
echo "1. If all tests pass, the server is properly configured"
echo "2. For external access, use a tunneling service:"
echo "   npx localtunnel --port 3002 --subdomain aria-gary"
echo "3. Access from mobile using the tunnel URL"
echo "4. Monitor logs for connection issues"
echo ""
