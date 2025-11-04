#!/bin/bash

# Simple load testing script for ISH Chat backend
API_URL="http://localhost:8000"
API_KEY="ish-chat-secure-key-2024"

echo "=== ISH Chat Backend Load Testing ==="
echo "Testing against: $API_URL"
echo "Started at: $(date)"
echo

# Test 1: Health endpoint load test
echo "1. Testing Health Endpoint (/health)"
echo "Running 20 concurrent requests..."
for i in {1..20}; do
    curl -s -w "Request $i: %{http_code} - %{time_total}s\n" "$API_URL/health" &
done
wait
echo

# Test 2: Relay endpoint load test
echo "2. Testing Relay Endpoint (/api/relay)"
echo "Running 10 concurrent requests..."
for i in {1..10}; do
    curl -s -X POST \
         -H "Content-Type: application/json" \
         -H "X-API-Key: $API_KEY" \
         -d '{"message": "Load test message '$i'", "sender": "user", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
         -w "Request $i: %{http_code} - %{time_total}s\n" \
         "$API_URL/api/relay" &
done
wait
echo

# Test 3: Mixed load test
echo "3. Mixed Load Test (Health + Relay)"
echo "Running 15 mixed requests..."
for i in {1..15}; do
    if [ $((i % 2)) -eq 0 ]; then
        curl -s -w "Health $i: %{http_code} - %{time_total}s\n" "$API_URL/health" &
    else
        curl -s -X POST \
             -H "Content-Type: application/json" \
             -H "X-API-Key: $API_KEY" \
             -d '{"message": "Mixed test message '$i'", "sender": "user", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
             -w "Relay $i: %{http_code} - %{time_total}s\n" \
             "$API_URL/api/relay" &
    fi
done
wait
echo

echo "Load testing completed at: $(date)"