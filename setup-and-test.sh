#!/bin/bash

# STARK Crawler - Setup and Test Script
# This script sets up dependencies and tests all connections

set -e

echo "🚀 STARK Crawler - Setup and Test Script"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Check Node.js installation
echo -e "${BLUE}📦 Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js ${NODE_VERSION} detected${NC}"

# Step 2: Check environment file
echo -e "\n${BLUE}🔧 Checking environment configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from template...${NC}"
    if [ -f .env.development ]; then
        cp .env.development .env
        echo -e "${GREEN}✅ Created .env from .env.development${NC}"
        echo -e "${YELLOW}⚠️  Please update .env with your credentials${NC}"
        exit 1
    else
        echo -e "${RED}❌ No .env or .env.development file found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Environment file found${NC}"
fi

# Step 3: Install dependencies
echo -e "\n${BLUE}📦 Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 4: Test connections
echo -e "\n${BLUE}🔍 Testing connections...${NC}"
echo "Running connection test suite..."
node test-all-connections.js

# Check exit code
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ All critical connections successful!${NC}"
    
    # Step 5: Test Supabase data
    echo -e "\n${BLUE}📊 Testing Supabase data access...${NC}"
    node test-supabase-data.js
    
    # Step 6: Optional - Start health check server
    echo -e "\n${YELLOW}💡 Tip: Start the health check server with:${NC}"
    echo "   node health-check-server.js"
    echo ""
    echo "   Available endpoints:"
    echo "   - http://localhost:3001/health"
    echo "   - http://localhost:3001/status"
    echo "   - http://localhost:3001/stats"
    
    echo -e "\n${GREEN}🎉 Setup complete! Your STARK crawler is ready.${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Deploy to Coolify using docker-compose.coolify.yml"
    echo "2. Import n8n workflow from workflows/stark-nightly.json"
    echo "3. Monitor health at your configured endpoints"
    
else
    echo -e "\n${RED}❌ Connection tests failed. Please check your configuration.${NC}"
    echo -e "${YELLOW}Review the .env file and ensure all services are accessible.${NC}"
    exit 1
fi