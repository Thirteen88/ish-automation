#!/bin/bash

###############################################################################
# ISH AI Orchestrator - cURL Examples
# Complete API usage examples using cURL
###############################################################################

# Configuration
API_KEY="your-api-key"
BASE_URL="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   ISH AI Orchestrator API - cURL Examples               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

###############################################################################
# HEALTH CHECK
###############################################################################

echo -e "\n${GREEN}[1] Health Check${NC}"
curl -X GET "$BASE_URL/health" \
  -H "Content-Type: application/json" \
  | jq '.'

###############################################################################
# API INFO
###############################################################################

echo -e "\n${GREEN}[2] API Information${NC}"
curl -X GET "$BASE_URL/" \
  -H "Content-Type: application/json" \
  | jq '.'

###############################################################################
# LIST PLATFORMS
###############################################################################

echo -e "\n${GREEN}[3] List All Platforms${NC}"
curl -X GET "$BASE_URL/v1/platforms" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# GET PLATFORM DETAILS
###############################################################################

echo -e "\n${GREEN}[4] Get Claude Platform Details${NC}"
curl -X GET "$BASE_URL/v1/platforms/claude" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# GET PLATFORM STATUS
###############################################################################

echo -e "\n${GREEN}[5] Get Claude Platform Health Status${NC}"
curl -X GET "$BASE_URL/v1/platforms/claude/status" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# SUBMIT QUERY
###############################################################################

echo -e "\n${GREEN}[6] Submit Query${NC}"
QUERY_RESPONSE=$(curl -X POST "$BASE_URL/v1/query" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "query": "Explain quantum computing in simple terms",
    "platform": "auto",
    "temperature": 0.7,
    "maxTokens": 2000
  }' | jq '.')

echo "$QUERY_RESPONSE"

# Extract query ID
QUERY_ID=$(echo "$QUERY_RESPONSE" | jq -r '.data.queryId')
echo -e "${YELLOW}Query ID: $QUERY_ID${NC}"

###############################################################################
# GET QUERY RESULT
###############################################################################

echo -e "\n${GREEN}[7] Get Query Result${NC}"
echo -e "${YELLOW}Waiting for query to complete...${NC}"
sleep 5

curl -X GET "$BASE_URL/v1/query/$QUERY_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# SUBMIT QUERY WITH SPECIFIC MODEL
###############################################################################

echo -e "\n${GREEN}[8] Submit Query with Specific Model${NC}"
curl -X POST "$BASE_URL/v1/query" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "query": "Write a haiku about programming",
    "platform": "claude",
    "model": "claude-3-opus",
    "systemPrompt": "You are a creative poet. Write elegant and concise poetry.",
    "temperature": 0.9
  }' | jq '.'

###############################################################################
# BATCH QUERIES
###############################################################################

echo -e "\n${GREEN}[9] Submit Batch Queries${NC}"
BATCH_RESPONSE=$(curl -X POST "$BASE_URL/v1/batch" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "queries": [
      {
        "id": "q1",
        "query": "What is artificial intelligence?",
        "platform": "claude"
      },
      {
        "id": "q2",
        "query": "Explain machine learning",
        "platform": "gpt"
      },
      {
        "id": "q3",
        "query": "What are neural networks?",
        "platform": "gemini"
      }
    ]
  }' | jq '.')

echo "$BATCH_RESPONSE"

# Extract batch ID
BATCH_ID=$(echo "$BATCH_RESPONSE" | jq -r '.data.batchId')
echo -e "${YELLOW}Batch ID: $BATCH_ID${NC}"

###############################################################################
# GET BATCH RESULTS
###############################################################################

echo -e "\n${GREEN}[10] Get Batch Results${NC}"
echo -e "${YELLOW}Waiting for batch to complete...${NC}"
sleep 8

curl -X GET "$BASE_URL/v1/batch/$BATCH_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# COMPARE PLATFORMS
###############################################################################

echo -e "\n${GREEN}[11] Compare Platforms${NC}"
COMPARE_RESPONSE=$(curl -X POST "$BASE_URL/v1/compare" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "query": "Explain the concept of recursion in programming",
    "platforms": ["claude", "gpt", "gemini"],
    "systemPrompt": "Explain technical concepts clearly and concisely"
  }' | jq '.')

echo "$COMPARE_RESPONSE"

# Extract comparison ID
COMPARE_ID=$(echo "$COMPARE_RESPONSE" | jq -r '.data.comparisonId')
echo -e "${YELLOW}Comparison ID: $COMPARE_ID${NC}"

###############################################################################
# GET COMPARISON RESULTS
###############################################################################

echo -e "\n${GREEN}[12] Get Comparison Results${NC}"
echo -e "${YELLOW}Waiting for comparison to complete...${NC}"
sleep 10

curl -X GET "$BASE_URL/v1/compare/$COMPARE_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# STATISTICS - SUMMARY
###############################################################################

echo -e "\n${GREEN}[13] Get Statistics Summary${NC}"
curl -X GET "$BASE_URL/v1/stats/summary" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# STATISTICS - PLATFORM BREAKDOWN
###############################################################################

echo -e "\n${GREEN}[14] Get Platform Statistics${NC}"
curl -X GET "$BASE_URL/v1/stats/platforms" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# STATISTICS - DETAILED
###############################################################################

echo -e "\n${GREEN}[15] Get Detailed Statistics${NC}"
curl -X GET "$BASE_URL/v1/stats?groupBy=day&platform=claude" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# EXPORT STATISTICS (CSV)
###############################################################################

echo -e "\n${GREEN}[16] Export Statistics to CSV${NC}"
curl -X GET "$BASE_URL/v1/stats/export" \
  -H "X-API-Key: $API_KEY" \
  -o "analytics-export.csv"

echo -e "${YELLOW}Exported to: analytics-export.csv${NC}"

###############################################################################
# STREAMING (SSE)
###############################################################################

echo -e "\n${GREEN}[17] Stream Query Results (SSE)${NC}"
echo -e "${YELLOW}Note: Use a query ID from a previous query${NC}"
echo -e "${YELLOW}Command:${NC}"
echo "curl -N -X GET \"$BASE_URL/v1/query/\$QUERY_ID/stream\" \\"
echo "  -H \"X-API-Key: $API_KEY\""

###############################################################################
# ERROR HANDLING EXAMPLES
###############################################################################

echo -e "\n${GREEN}[18] Error Handling - Missing API Key${NC}"
curl -X GET "$BASE_URL/v1/platforms" \
  -H "Content-Type: application/json" \
  | jq '.'

echo -e "\n${GREEN}[19] Error Handling - Invalid API Key${NC}"
curl -X GET "$BASE_URL/v1/platforms" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: invalid-key" \
  | jq '.'

echo -e "\n${GREEN}[20] Error Handling - Validation Error${NC}"
curl -X POST "$BASE_URL/v1/query" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "query": "",
    "temperature": 5.0
  }' | jq '.'

###############################################################################
# ADVANCED EXAMPLES
###############################################################################

echo -e "\n${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Advanced Examples                                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

###############################################################################
# CANCEL BATCH
###############################################################################

echo -e "\n${GREEN}[21] Cancel Batch Processing${NC}"
echo -e "${YELLOW}Command:${NC}"
echo "curl -X POST \"$BASE_URL/v1/batch/\$BATCH_ID/cancel\" \\"
echo "  -H \"X-API-Key: $API_KEY\""

###############################################################################
# ADMIN - CACHE STATS
###############################################################################

echo -e "\n${GREEN}[22] Get Cache Statistics (Admin)${NC}"
curl -X GET "$BASE_URL/admin/cache/stats" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# ADMIN - CLEAR CACHE
###############################################################################

echo -e "\n${GREEN}[23] Clear Cache (Admin)${NC}"
curl -X POST "$BASE_URL/admin/cache/clear" \
  -H "X-API-Key: $API_KEY" \
  | jq '.'

###############################################################################
# RATE LIMIT INFO
###############################################################################

echo -e "\n${GREEN}[24] Check Rate Limit Headers${NC}"
echo -e "${YELLOW}Making request and showing headers:${NC}"
curl -i -X GET "$BASE_URL/v1/platforms" \
  -H "X-API-Key: $API_KEY" \
  2>&1 | grep -E "X-RateLimit|HTTP"

###############################################################################
# DOCUMENTATION
###############################################################################

echo -e "\n${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Documentation Links                                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

echo -e "\n${YELLOW}Swagger Documentation:${NC}"
echo "  $BASE_URL/api-docs"

echo -e "\n${YELLOW}OpenAPI Specification:${NC}"
echo "  $BASE_URL/api-docs.json"

echo -e "\n${YELLOW}API Information:${NC}"
echo "  $BASE_URL/"

echo -e "\n${GREEN}Examples completed!${NC}"
echo -e "${YELLOW}Note: Replace 'your-api-key' with your actual API key${NC}"
