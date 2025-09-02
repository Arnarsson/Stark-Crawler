# 🚀 STARK Crawler - Coolify Ready!

This repository is optimized for **one-click deployment** with Coolify on your Hetzner server.

## 🎯 What You Get

- **🕷️ STARK Product Crawler** - Automated product data extraction
- **🔄 n8n Workflow Automation** - Scheduled crawls, notifications, monitoring  
- **📊 PostgreSQL Database** - Product storage with change tracking
- **🛠️ PgAdmin Interface** - Database management (optional)
- **📈 Complete Monitoring** - Logs, metrics, health checks

## 🚀 Quick Deployment

### 1. In Coolify Dashboard:
- **New Project** → `stark-crawler`
- **Docker Compose** → Point to this repository
- **File**: `docker-compose.coolify.yml`

### 2. Environment Variables:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SUPABASE_SERVICE_KEY=your_service_key
N8N_PASSWORD=your_secure_password
DB_PASSWORD=your_db_password
```

### 3. Deploy!
Click **Deploy** and watch the magic happen ✨

## 📋 Services Deployed

| Service | Purpose | Access |
|---------|---------|---------|
| **Crawler** | Product data extraction | Internal |
| **n8n** | Workflow automation | `https://n8n.yourdomain.com` |
| **PostgreSQL** | Database storage | Internal |
| **PgAdmin** | Database admin | `https://db.yourdomain.com` |

## 🎛️ Post-Deployment

1. **Access n8n** at your configured domain
2. **Login** with your credentials
3. **Import workflow** from `/workflows/stark-nightly.json`
4. **Configure Supabase** connection
5. **Enable scheduling** - runs daily at 2:30 AM

## 📊 Current Status

- ✅ **324+ products** already crawled
- ✅ **Complete Docker setup** 
- ✅ **Production ready**
- ✅ **Auto-scaling capable**
- ✅ **SSL/Domain ready**

## 🛠️ Architecture

```
Internet → Coolify → SSL/Domain → Services
                                    ├── Crawler (data extraction)
                                    ├── n8n (automation)
                                    ├── PostgreSQL (storage)
                                    └── PgAdmin (management)
```

## 📚 Documentation

- **[Coolify Deployment Guide](docs/COOLIFY_DEPLOYMENT.md)** - Complete setup instructions
- **[Hetzner Deployment](docs/HETZNER_DEPLOYMENT.md)** - Alternative deployment
- **[Installation Complete](INSTALLATION_COMPLETE.md)** - Current system status

## 🔧 Configuration Files

- `docker-compose.coolify.yml` - Coolify-optimized compose file
- `.env.coolify.example` - Environment variables template  
- `scripts/init-n8n-db.sh` - Database initialization
- `workflows/stark-nightly.json` - Automation workflow

## 💡 Features

### 🕷️ Crawler Features
- **Automatic product discovery** via sitemaps
- **Batch processing** with concurrency control
- **Error handling** and retry logic
- **Product change detection**
- **Price monitoring**

### 🔄 n8n Automation
- **Scheduled daily crawls**
- **Slack/email notifications** 
- **CSV exports**
- **Price change alerts**
- **Database statistics**
- **Error monitoring**

### 📊 Monitoring
- **Health checks** for all services
- **Resource monitoring** via Coolify
- **Application logs** with rotation
- **Database backup** automation
- **Performance metrics**

## 🎯 Use Cases

- **E-commerce competitor analysis**
- **Price monitoring systems**
- **Product catalog automation**  
- **Market research data**
- **Inventory tracking**
- **Business intelligence**

## 🔒 Security

- **No exposed databases** - Internal network only
- **SSL/TLS certificates** - Auto-managed by Coolify
- **Environment secrets** - Encrypted variable storage
- **Basic authentication** - n8n and PgAdmin protected
- **Docker isolation** - Service containerization

## 📈 Scaling

### Current Capacity
- **~100-200 products/hour**
- **Handles STARK's ~50k+ product catalog**
- **Minimal resource usage**

### Scale Up Options
- **Increase concurrency** - More parallel processing
- **Add crawler instances** - Horizontal scaling
- **Resource limits** - CPU/RAM allocation
- **Database optimization** - Connection pooling

## 🚨 Monitoring & Alerts

- **Service health checks**
- **Resource usage alerts** 
- **Failed crawl notifications**
- **Database connection monitoring**
- **Automatic restarts** on failure

## 🛟 Support

- **Built-in health checks** - All services monitored
- **Comprehensive logging** - Debug any issues
- **Rollback capability** - Previous versions available
- **Documentation** - Complete setup guides

---

**Ready to deploy?** 🎉

Just point Coolify to this repository and you'll have a production-ready STARK crawler running in minutes!

**Questions?** Check out the [complete deployment guide](docs/COOLIFY_DEPLOYMENT.md) 📚