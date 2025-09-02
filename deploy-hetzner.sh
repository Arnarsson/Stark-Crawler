#!/bin/bash
# Hetzner Deployment Script for STARK Crawler

echo "🚀 STARK Crawler Hetzner Deployment"
echo "===================================="

# Update system
echo "📦 Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Node.js
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Git
echo "📦 Installing Git..."
apt-get install -y git

# Install PM2
echo "📦 Installing PM2..."
npm install -g pm2

# Clone repository (replace with your repo URL)
echo "📂 Cloning repository..."
if [ ! -d "stark-crawler" ]; then
    git clone https://github.com/your-username/stark-crawler.git
    cd stark-crawler
else
    cd stark-crawler
    git pull
fi

# Install dependencies
echo "📦 Installing npm packages..."
npm install

# Install Playwright
echo "🎭 Installing Playwright..."
npx playwright install-deps
npx playwright install chromium

# Create .env file
echo "🔧 Setting up environment..."
if [ ! -f .env ]; then
    echo "Please create .env file with:"
    echo "SUPABASE_URL=your_supabase_url"
    echo "SUPABASE_ANON_KEY=your_anon_key"
    echo ""
    echo "Run: nano .env"
    exit 1
fi

# Setup PM2
echo "⚙️ Configuring PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

echo "✅ Deployment complete!"
echo ""
echo "Commands:"
echo "  pm2 status         - Check crawler status"
echo "  pm2 logs           - View logs"
echo "  pm2 restart all    - Restart crawler"
echo "  pm2 stop all       - Stop crawler"