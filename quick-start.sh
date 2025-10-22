#!/bin/bash

# ISH Automation - Quick Start Script
# This script helps you get started with the browser automation system

echo "╔════════════════════════════════════════════════════════╗"
echo "║   ISH AUTOMATION - BROWSER AUTOMATION QUICK START     ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Create necessary directories
echo -e "${BLUE}Creating necessary directories...${NC}"
mkdir -p test-results/screenshots
mkdir -p test-screenshots
mkdir -p selector-discovery
mkdir -p cookies
mkdir -p sessions
mkdir -p screenshots
mkdir -p downloads
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Display menu
echo "What would you like to do?"
echo ""
echo "1) Test all platforms (recommended first step)"
echo "2) Test a specific platform"
echo "3) Discover selectors for a new platform"
echo "4) Run full integration tests"
echo "5) View documentation"
echo "6) Exit"
echo ""
read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}Running selector tests on all platforms...${NC}"
        echo "This will test selectors in simplified-config.json"
        echo ""
        read -p "Show browser window? (y/n): " show_browser

        if [ "$show_browser" = "y" ]; then
            node test-selectors.js --no-headless --verbose
        else
            node test-selectors.js --verbose
        fi
        ;;

    2)
        echo ""
        echo "Available platforms:"
        echo "  - lmarena"
        echo "  - huggingface"
        echo "  - perplexity"
        echo ""
        read -p "Enter platform name: " platform
        read -p "Show browser window? (y/n): " show_browser

        echo ""
        echo -e "${BLUE}Testing platform: $platform${NC}"

        if [ "$show_browser" = "y" ]; then
            node test-selectors.js --platform $platform --no-headless --verbose
        else
            node test-selectors.js --platform $platform --verbose
        fi
        ;;

    3)
        echo ""
        read -p "Enter platform URL: " url
        read -p "Enter platform name (e.g., lmarena): " name
        read -p "Show browser window? (y/n): " show_browser

        echo ""
        echo -e "${BLUE}Discovering selectors for: $name${NC}"
        echo -e "${BLUE}URL: $url${NC}"
        echo ""

        if [ "$show_browser" = "y" ]; then
            node discover-selectors.js "$url" "$name" --no-headless --verbose --export "./config-$name.json"
        else
            node discover-selectors.js "$url" "$name" --verbose --export "./config-$name.json"
        fi
        ;;

    4)
        echo ""
        echo -e "${BLUE}Running full integration test suite...${NC}"
        echo "This will test all platforms and generate a production readiness report"
        echo ""
        node run-integration-tests.js

        echo ""
        echo -e "${GREEN}Reports generated:${NC}"
        echo "  - test-results/integration-test-report.json"
        echo "  - test-results/production-readiness-report.json"
        ;;

    5)
        echo ""
        echo -e "${BLUE}Documentation files:${NC}"
        echo ""
        echo "1. BROWSER_AUTOMATION_GUIDE.md - Complete usage guide"
        echo "2. PRODUCTION_READINESS_REPORT.md - Production analysis and recommendations"
        echo ""
        read -p "Which file would you like to view? (1-2): " doc_choice

        case $doc_choice in
            1)
                if command -v less &> /dev/null; then
                    less BROWSER_AUTOMATION_GUIDE.md
                else
                    cat BROWSER_AUTOMATION_GUIDE.md
                fi
                ;;
            2)
                if command -v less &> /dev/null; then
                    less PRODUCTION_READINESS_REPORT.md
                else
                    cat PRODUCTION_READINESS_REPORT.md
                fi
                ;;
        esac
        ;;

    6)
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0
        ;;

    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the test results"
echo "  2. Check screenshots if there were any errors"
echo "  3. Read PRODUCTION_READINESS_REPORT.md for deployment guide"
echo ""
