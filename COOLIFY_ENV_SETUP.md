# 🔐 Coolify Environment Setup Guide

## Quick Copy-Paste for Coolify

Copy these environment variables directly into your Coolify dashboard:

```env
# === Core Configuration (REQUIRED) ===
SUPABASE_URL=http://supabasekong-f4808sk00g8s08s8o84o4ww0.135.181.101.70.sslip.io
SUPABASE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc1Njc1OTg2MCwiZXhwIjo0OTEyNDMzNDYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.gPToiL-2O5k1NvB4TjL0qAbU7iTwVCefDLE9j5y7qT4
SUPABASE_SERVICE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc1Njc1OTg2MCwiZXhwIjo0OTEyNDMzNDYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.gPToiL-2O5k1NvB4TjL0qAbU7iTwVCefDLE9j5y7qT4

# === Crawler Configuration ===
CRAWLER_CONCURRENCY=2
CRAWLER_DELAY=1000
CRAWLER_TIMEOUT=60000
CRAWLER_HEADLESS=true
LOG_LEVEL=info

# === n8n Integration ===
N8N_WEBHOOK_URL=https://n8n.aigrowthadvisors.cc/webhook/stark_crawler
N8N_USER=admin
N8N_PASSWORD=StarkCrawler2024!
N8N_DB_PASSWORD=n8n_secure_pass_2024

# === Slack Notifications ===
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/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

# === PostgreSQL ===
DB_PASSWORD=postgres_secure_pass_2024

# === PgAdmin ===
PGADMIN_EMAIL=admin@aigrowthadvisors.cc
PGADMIN_PASSWORD=admin_secure_pass_2024
```

## 📋 Configuration Details

### ✅ Already Configured:
- **Supabase**: Using your existing Supabase instance (324+ products already stored)
- **n8n Webhook**: Points to your n8n instance at `n8n.aigrowthadvisors.cc`
- **Slack**: Webhook configured for notifications
- **Database**: PostgreSQL for local services and n8n storage

### 🔧 Customizable Settings:
- **Crawler Concurrency**: Set to 2 (increase for faster crawling)
- **Crawler Delay**: 1000ms between requests (adjust based on target site)
- **Log Level**: info (change to debug for troubleshooting)

### 🌐 Service Endpoints:
- **n8n Interface**: Will be available at your configured domain
- **PgAdmin**: Database management interface
- **Slack**: Notifications will go to your configured webhook

## 🚀 Deployment Steps in Coolify

1. **Navigate to Environment Variables** in Coolify
2. **Copy the entire block above**
3. **Paste into Coolify's environment section**
4. **Save and Deploy**

## 🔒 Security Notes

⚠️ **Important**: The Supabase keys and Slack webhook are sensitive. Coolify will encrypt these values.

### Recommended Security Practices:
1. **Rotate passwords** after initial deployment
2. **Use Coolify's secret management** for sensitive values
3. **Restrict access** to the Coolify dashboard
4. **Enable 2FA** on all service accounts

## 📊 Current Database Status

Your Supabase instance already contains:
- **324+ products** crawled and stored
- **Product change tracking** enabled
- **Crawl logs** for monitoring

## 🎯 Ready to Deploy!

With these environment variables, your Stark-Crawler will:
- ✅ Connect to your existing Supabase database
- ✅ Send notifications to your Slack channel
- ✅ Integrate with your n8n workflows
- ✅ Store all data securely
- ✅ Run automated daily crawls

**Just copy, paste, and deploy!** 🚀