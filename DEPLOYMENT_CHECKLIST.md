# 🚀 Coolify Deployment Checklist

## ✅ Pre-Deployment (Completed)

- [x] **Docker Compose configuration** - `docker-compose.coolify.yml` created and validated
- [x] **Environment template** - `.env.coolify.example` ready for your values  
- [x] **Database initialization** - PostgreSQL + n8n database setup scripts
- [x] **Documentation** - Complete deployment guides created
- [x] **Health checks** - All services have monitoring configured
- [x] **Security** - Non-root containers, secure passwords, network isolation
- [x] **Coolify labels** - Proper service discovery and routing

## 🎯 Deployment Steps

### 1. Repository Setup
```bash
# If not already in version control:
git init
git add .
git commit -m "Ready for Coolify deployment"
git remote add origin https://github.com/your-username/Stark-Crawler.git
git push -u origin main
```

### 2. Coolify Configuration
1. **Login to Coolify** → Your Hetzner server Coolify dashboard
2. **New Project** → Name: `Stark-Crawler`
3. **New Resource** → **Docker Compose**
4. **Git Repository** → Connect your repository
5. **Docker Compose File** → `docker-compose.coolify.yml`

### 3. Environment Variables
Copy from your current `.env` and add to Coolify:

**Required:**
```env
SUPABASE_URL=http://supabasekong-f4808sk00g8s08s8o84o4ww0.135.181.101.70.sslip.io
SUPABASE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
SUPABASE_SERVICE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

**Optional (with secure defaults):**
```env
N8N_PASSWORD=StarkCrawler2024!
DB_PASSWORD=postgres_secure_2024
PGLADMIN_PASSWORD=admin_secure_2024
CRAWLER_CONCURRENCY=2
LOG_LEVEL=info
```

### 4. Domain Configuration (Optional)
- **n8n**: `n8n.yourdomain.com` → Port 5678
- **PgAdmin**: `db.yourdomain.com` → Port 80

### 5. Deploy!
Click **Deploy** in Coolify and monitor the build process.

## 🔍 Post-Deployment Verification

### Service Health Check
```bash
# Check all services are running
docker ps

# Verify crawler service
docker logs Stark-Crawler-stack_crawler_1

# Verify n8n service  
docker logs Stark-Crawler-stack_n8n_1

# Verify database
docker logs Stark-Crawler-stack_postgres_1
```

### Database Verification
```bash
# Connect to database
docker exec -it Stark-Crawler-stack_postgres_1 psql -U postgres -d stark_products

# Check tables exist
\dt

# Check product count
SELECT COUNT(*) FROM stark_products;

# Exit
\q
```

### n8n Setup
1. **Access** → `https://n8n.yourdomain.com` (or via Coolify proxy)
2. **Login** → admin / StarkCrawler2024!
3. **Import Workflow** → Upload `workflows/stark-nightly.json`
4. **Test Execution** → Run workflow manually
5. **Verify Results** → Check database for new products

### Crawler Test
```bash
# Manual test via container
docker exec Stark-Crawler-stack_crawler_1 node crawler/test-crawler.js

# Check logs
docker exec Stark-Crawler-stack_crawler_1 tail -f logs/crawler.log
```

## 📊 Expected Results

After successful deployment:

- **Crawler**: ✅ Running and processing products
- **Database**: ✅ 324+ products from current setup
- **n8n**: ✅ Accessible via web interface
- **PgAdmin**: ✅ Database management available
- **Scheduling**: ✅ Daily crawls at 2:30 AM
- **Monitoring**: ✅ Health checks and alerts active

## 🚨 Troubleshooting

### Build Failures
- Check Coolify build logs
- Verify all files committed to Git
- Check Docker Compose syntax

### Service Start Issues
- Verify environment variables set correctly
- Check service dependencies (postgres before n8n)
- Review container logs via Coolify

### Database Connection Issues
- Ensure PostgreSQL service started first
- Verify network connectivity between services
- Check database credentials

### n8n Access Issues  
- Verify domain/proxy configuration
- Check n8n service health
- Try direct IP access if domain fails

## 🔄 Rollback Plan

If deployment fails:
1. **Coolify Dashboard** → **Deployments** → **Previous Version**
2. **Deploy** → **Confirm Rollback**  
3. **Verify** services are working
4. **Debug** issues in development

## 📈 Monitoring

### Via Coolify Dashboard
- Service status and resource usage
- Real-time logs
- Deployment history
- Performance metrics

### Application Health
- Crawler: Processing products successfully
- n8n: Workflows executing on schedule  
- Database: Accepting connections and storing data
- Overall: All health checks passing

## 🎉 Success Criteria

✅ **All services running** healthy
✅ **Database** contains existing products (324+)
✅ **n8n accessible** via web interface
✅ **Workflow imported** and tested
✅ **Scheduled crawls** configured
✅ **SSL certificates** working (if domains configured)
✅ **Logs accessible** via Coolify
✅ **No interference** with existing Hetzner services

---

**🚀 Ready to deploy? You have everything needed for a successful Coolify deployment!**

Your STARK crawler will be production-ready with:
- Automatic scaling and restarts
- SSL/TLS certificates  
- Comprehensive monitoring
- Backup capabilities
- Professional-grade infrastructure

**Total setup time: ~30 minutes** ⏱️