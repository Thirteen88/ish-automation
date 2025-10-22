#!/bin/bash

# Quick Tunnel Test Script
# Tests all components before starting the actual tunnel

echo "========================================="
echo "ISH Automation Tunnel Pre-flight Check"
echo "========================================="
echo ""

PORT="${PORT:-3002}"
SUCCESS=0
FAILURES=0

# Test 1: Check if service is running
echo -n "1. Checking service on port $PORT... "
if nc -z localhost $PORT 2>/dev/null || ss -tlnp 2>/dev/null | grep -q ":$PORT"; then
    echo "✓ PASS"
    SUCCESS=$((SUCCESS + 1))
else
    echo "✗ FAIL - No service detected"
    echo "   Start with: PORT=3002 node aria-mobile-server.js"
    FAILURES=$((FAILURES + 1))
fi

# Test 2: Check SSH availability
echo -n "2. Checking SSH client... "
if command -v ssh &> /dev/null; then
    echo "✓ PASS"
    SUCCESS=$((SUCCESS + 1))
else
    echo "✗ FAIL - SSH not installed"
    echo "   Install with: sudo apt install openssh-client"
    FAILURES=$((FAILURES + 1))
fi

# Test 3: Check netcat availability
echo -n "3. Checking netcat (nc)... "
if command -v nc &> /dev/null; then
    echo "✓ PASS"
    SUCCESS=$((SUCCESS + 1))
else
    echo "✗ FAIL - netcat not installed"
    echo "   Install with: sudo apt install netcat"
    FAILURES=$((FAILURES + 1))
fi

# Test 4: Test local HTTP connection
echo -n "4. Testing HTTP connection... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT | grep -q "200"; then
    echo "✓ PASS"
    SUCCESS=$((SUCCESS + 1))
else
    echo "⚠ WARNING - HTTP test failed (service may not be HTTP)"
    # Don't count as failure
fi

# Test 5: Check disk space for logs
echo -n "5. Checking disk space... "
AVAILABLE=$(df /tmp | tail -1 | awk '{print $4}')
if [ "$AVAILABLE" -gt 10000 ]; then
    echo "✓ PASS ($AVAILABLE KB available)"
    SUCCESS=$((SUCCESS + 1))
else
    echo "⚠ WARNING - Low disk space in /tmp"
fi

# Test 6: Check internet connectivity
echo -n "6. Testing internet connection... "
if ping -c 1 -W 2 8.8.8.8 &> /dev/null; then
    echo "✓ PASS"
    SUCCESS=$((SUCCESS + 1))
else
    echo "✗ FAIL - No internet connection"
    FAILURES=$((FAILURES + 1))
fi

# Test 7: Test serveo.net reachability
echo -n "7. Testing serveo.net reachability... "
if timeout 5 bash -c "echo | nc serveo.net 22" 2>/dev/null | grep -q "SSH"; then
    echo "✓ PASS"
    SUCCESS=$((SUCCESS + 1))
else
    echo "⚠ WARNING - Cannot reach serveo.net (may be temporary)"
fi

echo ""
echo "========================================="
echo "Results: $SUCCESS passed, $FAILURES failed"
echo "========================================="
echo ""

if [ $FAILURES -eq 0 ]; then
    echo "✓ All critical checks passed!"
    echo ""
    echo "Ready to start tunnel. Run:"
    echo "  ./start-tunnel.sh"
    echo ""
    exit 0
else
    echo "✗ Some critical checks failed"
    echo "Please fix the issues above before starting the tunnel"
    echo ""
    exit 1
fi
