#!/bin/bash
################################################################################
# Smoke Tests Script
# Runs basic smoke tests to verify deployment
################################################################################

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

echo "Running smoke tests against: $BASE_URL"

# Test 1: Health endpoint
echo "Test 1: Health endpoint..."
HEALTH_RESPONSE=$(curl -sf "$BASE_URL/health" || echo "FAILED")
if [[ "$HEALTH_RESPONSE" == *"healthy"* ]]; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed"
    exit 1
fi

# Test 2: API root endpoint
echo "Test 2: API root endpoint..."
ROOT_RESPONSE=$(curl -sf "$BASE_URL/" || echo "FAILED")
if [[ "$ROOT_RESPONSE" == *"ISH"* ]]; then
    echo "✓ Root endpoint passed"
else
    echo "✗ Root endpoint failed"
    exit 1
fi

# Test 3: API documentation
echo "Test 3: API documentation..."
DOCS_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api-docs" || echo "000")
if [[ "$DOCS_STATUS" == "200" ]]; then
    echo "✓ API docs accessible"
else
    echo "✗ API docs failed"
    exit 1
fi

# Test 4: Platform status
echo "Test 4: Platform status..."
if curl -sf "$BASE_URL/v1/platforms" -H "X-API-Key: demo-key-1" > /dev/null 2>&1; then
    echo "✓ Platform endpoint accessible"
else
    echo "✗ Platform endpoint failed"
    exit 1
fi

# Test 5: Response time check
echo "Test 5: Response time check..."
RESPONSE_TIME=$(curl -sf -o /dev/null -w "%{time_total}" "$BASE_URL/health")
if (( $(echo "$RESPONSE_TIME < 2.0" | bc -l) )); then
    echo "✓ Response time acceptable: ${RESPONSE_TIME}s"
else
    echo "✗ Response time too slow: ${RESPONSE_TIME}s"
    exit 1
fi

echo ""
echo "All smoke tests passed successfully!"
exit 0
