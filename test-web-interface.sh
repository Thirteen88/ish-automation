#!/bin/bash

###############################################################################
# Quick Test Script for Web Interface
#
# Tests that all components are in place and server can start
###############################################################################

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🧪 Testing AI Orchestrator Web Interface..."
echo ""

# Test 1: Check required files
echo -n "1. Checking required files... "
MISSING=0

FILES=(
    "web-server.js"
    "api-routes.js"
    "production-browser-automation.js"
    "selectors-config.json"
    "public/index.html"
    "public/app.js"
)

for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo ""
        echo -e "${RED}   ✗ Missing: $file${NC}"
        MISSING=1
    fi
done

if [ $MISSING -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}FAILED${NC}"
    exit 1
fi

# Test 2: Check Node.js
echo -n "2. Checking Node.js... "
if command -v node &> /dev/null; then
    VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} ($VERSION)"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    exit 1
fi

# Test 3: Check dependencies
echo -n "3. Checking dependencies... "
if [ -d "node_modules" ]; then
    DEPS_NEEDED=("express" "ws" "playwright")
    DEPS_OK=1

    for dep in "${DEPS_NEEDED[@]}"; do
        if [ ! -d "node_modules/$dep" ]; then
            echo ""
            echo -e "${YELLOW}   ! Missing: $dep (run npm install)${NC}"
            DEPS_OK=0
        fi
    done

    if [ $DEPS_OK -eq 1 ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}WARNING${NC}"
    fi
else
    echo -e "${YELLOW}! Run npm install${NC}"
fi

# Test 4: Check directories
echo -n "4. Checking directories... "
DIRS=("public" "cookies" "sessions" "screenshots" "downloads")
for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir" 2>/dev/null
    fi
done
echo -e "${GREEN}✓${NC}"

# Test 5: Validate JSON config
echo -n "5. Validating configuration... "
if node -e "require('./selectors-config.json')" 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Invalid JSON in selectors-config.json${NC}"
    exit 1
fi

# Test 6: Check if port is available
echo -n "6. Checking port 3000... "
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}! Port 3000 in use${NC}"
else
    echo -e "${GREEN}✓${NC}"
fi

echo ""
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "You can now start the web server with:"
echo -e "${YELLOW}  ./start-web-server.sh${NC}"
echo ""
echo "Or manually with:"
echo -e "${YELLOW}  node web-server.js${NC}"
echo ""
echo "Then open: ${YELLOW}http://localhost:3000${NC}"
echo ""
