#!/bin/bash

# STARK Crawler Setup Script
# Automated setup for the STARK product crawler

set -e

echo "========================================="
echo "    STARK Product Crawler Setup"
echo "========================================="
echo ""

# Check Node.js version
echo "📌 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. Current version: $(node -v)"
    echo "   Please update Node.js and try again."
    exit 1
fi
echo "✅ Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium
npx playwright install-deps chromium
echo "✅ Playwright browsers installed"
echo ""

# Create directories
echo "📁 Creating directories..."
mkdir -p logs exports
echo "✅ Directories created"
echo ""

# Setup environment file
if [ ! -f .env ]; then
    echo "🔧 Setting up environment file..."
    cp .env.example .env
    echo "✅ .env file created from template"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file with your credentials:"
    echo "   - SUPABASE_URL"
    echo "   - SUPABASE_KEY"
    echo ""
else
    echo "✅ .env file already exists"
    echo ""
fi

# Check Supabase credentials
if [ -f .env ]; then
    source .env
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
        echo "⚠️  Supabase credentials not configured in .env"
        echo ""
    else
        echo "✅ Supabase credentials detected"
        echo ""
    fi
fi

# Test crawler
echo "🧪 Would you like to run a test? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "Running test crawler..."
    node crawler/test-crawler.js
fi

echo ""
echo "========================================="
echo "    Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env with your Supabase credentials"
echo "2. Run 'npm run test' to test single product"
echo "3. Run 'npm run crawl' to start full crawl"
echo "4. Import workflows/stark-nightly.json to n8n"
echo ""
echo "For detailed instructions, see docs/SETUP.md"