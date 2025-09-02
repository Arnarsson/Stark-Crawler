# Hetzner Deployment Guide

## Prerequisites
- Hetzner Cloud account
- SSH key configured
- Domain name (optional)

## Server Requirements
- **Minimum**: CX21 (2 vCPU, 4GB RAM) - €5.83/month
- **Recommended**: CPX21 (3 vCPU, 4GB RAM) - €8.21/month
- **Production**: CPX31 (4 vCPU, 8GB RAM) - €15.30/month

## Step-by-Step Deployment

### 1. Create Hetzner Server
```bash
# Via Hetzner Cloud Console or CLI
hcloud server create \
  --name stark-crawler \
  --type cpx21 \
  --image ubuntu-22.04 \
  --ssh-key your-key
```

### 2. Initial Server Setup
```bash
# SSH into server
ssh root@your-server-ip

# Run deployment script
wget https://raw.githubusercontent.com/your-repo/stark-crawler/main/deploy-hetzner.sh
chmod +x deploy-hetzner.sh
./deploy-hetzner.sh
```

### 3. Configure Environment
```bash
# Create .env file
nano .env

# Add your credentials:
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
```

### 4. Start Crawler with PM2
```bash
# Start crawler
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# View logs
pm2 logs stark-crawler
```

### 5. Setup Firewall (Optional)
```bash
# Allow SSH and HTTP/HTTPS
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

### 6. Setup Nginx Reverse Proxy (Optional)
```bash
# Install Nginx
apt-get install nginx

# Configure proxy
nano /etc/nginx/sites-available/stark-crawler

# Add configuration:
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
ln -s /etc/nginx/sites-available/stark-crawler /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

## Monitoring & Maintenance

### Check Status
```bash
pm2 status
pm2 info stark-crawler
```

### View Logs
```bash
pm2 logs stark-crawler --lines 100
tail -f logs/crawler.log
```

### Database Status
```bash
node crawler-status.js
```

### Restart Crawler
```bash
pm2 restart stark-crawler
```

### Update Code
```bash
cd stark-crawler
git pull
npm install
pm2 restart all
```

## Scaling Options

### 1. Horizontal Scaling
- Deploy multiple Hetzner servers
- Use load balancer
- Distribute crawling tasks

### 2. Vertical Scaling
- Upgrade to larger server
- Increase PM2 memory limits
- Optimize crawler batch size

### 3. Database Optimization
- Use Hetzner's managed PostgreSQL
- Or deploy PostgreSQL on separate server
- Enable connection pooling

## Cost Optimization

### Basic Setup (€5.83/month)
- CX21 server
- Single crawler instance
- Suitable for <1000 products/day

### Production Setup (€15.30/month)
- CPX31 server
- Multiple crawler instances
- API server
- Suitable for 5000+ products/day

### Enterprise Setup (€50+/month)
- Multiple servers
- Managed database
- Load balancer
- Monitoring stack

## Troubleshooting

### Out of Memory
```bash
# Increase swap
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

### Crawler Timeouts
```bash
# Edit ecosystem.config.js
max_memory_restart: '2G'
```

### Playwright Issues
```bash
# Reinstall dependencies
npx playwright install-deps
npx playwright install chromium
```

## Security Best Practices

1. **Use SSH keys** (no password auth)
2. **Enable firewall** (ufw)
3. **Regular updates** (unattended-upgrades)
4. **Use environment variables** (never commit secrets)
5. **Setup fail2ban** for brute force protection
6. **Use HTTPS** with Let's Encrypt

## Support

For issues or questions:
- Check logs: `pm2 logs`
- Database status: `node crawler-status.js`
- System resources: `htop`