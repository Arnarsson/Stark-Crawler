# Coolify Deployment Guide for STARK Crawler

## Prerequisites
- Coolify installed on your Hetzner server
- Git repository (GitHub, GitLab, or self-hosted)
- Domain names configured (optional but recommended)

## Quick Start

### 1. Repository Setup
```bash
# If not already in git, initialize repository
git init
git add .
git commit -m "Initial STARK crawler setup"
git remote add origin https://github.com/your-username/stark-crawler.git
git push -u origin main
```

### 2. Coolify Project Creation
1. **Access Coolify Dashboard**
   - Open your Coolify web interface
   - Navigate to "Projects" → "New Project"

2. **Create New Project**
   - Name: `stark-crawler`
   - Description: `STARK product crawler with n8n automation`

3. **Add Git Repository**
   - Select your Git provider
   - Repository: `your-username/stark-crawler`
   - Branch: `main`
   - Deploy Key: Let Coolify generate one

### 3. Service Configuration

#### Method A: Single Docker Compose Stack (Recommended)
1. **New Resource** → **Docker Compose**
2. **Configuration:**
   - Name: `stark-crawler-stack`
   - Docker Compose Location: `docker-compose.coolify.yml`
   - Build Pack: `Docker Compose`

#### Method B: Individual Services
Deploy each service separately for more granular control.

### 4. Environment Variables Setup

In Coolify, add these environment variables:

```bash
# Supabase (Required)
SUPABASE_URL=http://supabasekong-f4808sk00g8s08s8o84o4ww0.135.181.101.70.sslip.io
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Crawler Configuration
CRAWLER_CONCURRENCY=2
CRAWLER_HEADLESS=true
LOG_LEVEL=info

# n8n Configuration
N8N_USER=admin
N8N_PASSWORD=StarkCrawler2024!
N8N_DB_PASSWORD=n8n_secure_pass_2024

# PostgreSQL
DB_PASSWORD=postgres_secure_pass_2024

# PgAdmin (Optional)
PGLADMIN_EMAIL=admin@yourdomain.com
PGLADMIN_PASSWORD=admin_secure_pass_2024
```

### 5. Domain Configuration (Optional)

#### For n8n Interface:
- **Domain:** `n8n.yourdomain.com`
- **Service:** `n8n`
- **Port:** `5678`
- **SSL:** Auto (Let's Encrypt)

#### For PgAdmin:
- **Domain:** `db.yourdomain.com` 
- **Service:** `pgadmin`
- **Port:** `80`
- **SSL:** Auto (Let's Encrypt)

### 6. Deploy!

1. **Save configuration**
2. **Deploy** → Wait for build to complete
3. **Check logs** for any issues
4. **Verify services** are running

## Service Details

### Crawler Service
- **Purpose:** Processes STARK product data
- **Resources:** 1 CPU, 1GB RAM (adjustable)
- **Storage:** Logs and exports in persistent volumes
- **Health Check:** Built-in Node.js health check

### n8n Service  
- **Purpose:** Workflow automation and scheduling
- **Access:** Web interface at configured domain
- **Database:** PostgreSQL (shared with main DB)
- **Features:** 
  - Automated daily crawls
  - Slack notifications
  - Price change alerts
  - CSV exports

### PostgreSQL Service
- **Purpose:** Data storage for both crawler and n8n
- **Databases:** 
  - `stark_products` - Main product data
  - `n8n` - Workflow metadata
- **Backup:** Automatic via Coolify
- **Access:** Internal network only (secure)

### PgAdmin Service (Optional)
- **Purpose:** Database administration
- **Access:** Web interface at configured domain
- **Features:**
  - Query editor
  - Data visualization
  - Schema management
  - Backup/restore

## Post-Deployment Setup

### 1. Access n8n
1. Navigate to your n8n domain
2. Login with configured credentials
3. Import workflow from `/workflows/stark-nightly.json`
4. Configure Supabase connection
5. Test workflow execution

### 2. Verify Database
1. Check Coolify logs for database initialization
2. Access PgAdmin if configured
3. Verify tables exist in `stark_products` database
4. Test crawler connection: `node test-connection.js`

### 3. Test Crawler
1. **Manual test:**
   ```bash
   # Via Coolify terminal
   node crawler/test-crawler.js
   ```

2. **Via n8n:**
   - Trigger workflow manually
   - Check execution logs
   - Verify data appears in database

### 4. Schedule Automation
- n8n workflow runs daily at 2:30 AM by default
- Modify schedule in n8n interface if needed
- Set up notifications (Slack, email, webhook)

## Monitoring & Maintenance

### Via Coolify Dashboard
- **Resource Usage:** CPU, RAM, disk
- **Service Status:** Up/down, restart counts
- **Logs:** Real-time and historical
- **Deployments:** History and rollbacks

### Application Monitoring
```bash
# Check crawler status
curl http://localhost:3000/status

# Database product count
curl http://localhost:3000/stats

# n8n workflow status
curl http://n8n.yourdomain.com/api/v1/workflows
```

## Scaling & Optimization

### Vertical Scaling
- Increase CPU/RAM via Coolify resource limits
- Adjust `CRAWLER_CONCURRENCY` for more parallel processing
- Upgrade PostgreSQL memory settings

### Horizontal Scaling
- Deploy multiple crawler instances
- Use load balancer (built-in with Coolify)
- Separate database server if needed

### Performance Tuning
```yaml
# In docker-compose.coolify.yml
services:
  crawler:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
```

## Troubleshooting

### Common Issues

#### Build Failures
- Check Dockerfile syntax
- Verify all files are committed to Git
- Check Coolify build logs

#### Service Won't Start
- Check environment variables
- Verify network connectivity
- Check service dependencies

#### Database Connection Issues
- Verify PostgreSQL is running
- Check database credentials
- Test connection from crawler service

#### n8n Workflows Not Executing
- Check n8n service logs
- Verify database connection
- Test workflow manually

### Log Locations
- **Coolify Logs:** Dashboard → Service → Logs
- **Application Logs:** Persistent volumes
- **Database Logs:** PostgreSQL service logs

### Rollback Procedure
1. **Coolify Dashboard** → **Deployments**
2. **Select Previous Version** 
3. **Deploy** → **Confirm Rollback**
4. **Verify Services** are working

## Security Best Practices

### Environment Variables
- Never commit secrets to Git
- Use Coolify's encrypted environment variables
- Rotate passwords regularly

### Network Security
- Services communicate via internal Docker network
- External access only via configured domains
- SSL/TLS automatically managed by Coolify

### Database Security
- PostgreSQL not exposed externally
- Strong passwords for all accounts
- Regular automated backups

### Access Control
- n8n basic authentication enabled
- PgAdmin with secure credentials
- Coolify RBAC for team access

## Backup Strategy

### Automatic Backups (via Coolify)
- Database snapshots: Daily
- Application data: Weekly
- Configuration: Version controlled in Git

### Manual Backup
```bash
# Database backup
pg_dump -h localhost -p 5432 -U postgres stark_products > backup.sql

# Export products to CSV
node scripts/export-csv.js
```

### Disaster Recovery
1. **Restore from Coolify backup**
2. **Or deploy fresh instance** from Git
3. **Restore database** from backup
4. **Verify all services** operational

## Support & Monitoring

### Health Checks
- All services have health checks configured
- Coolify monitors and alerts on failures
- Automatic restart on unhealthy status

### Notifications
Configure in Coolify:
- Email alerts for service failures
- Slack/Discord integration
- Webhook notifications for deployments

### Performance Metrics
- Resource usage tracking
- Response time monitoring  
- Database performance metrics
- Crawler success rates

---

## Quick Commands Reference

```bash
# View service status
docker ps

# Check logs
docker logs stark-crawler-stack-crawler-1

# Database connection test
psql -h localhost -p 5432 -U postgres -d stark_products

# Manual crawler run
docker exec stark-crawler-stack-crawler-1 node crawler/test-crawler.js

# n8n workflow import
curl -X POST http://n8n.yourdomain.com/api/v1/workflows/import \
  -H "Content-Type: application/json" \
  -d @workflows/stark-nightly.json
```

**🎉 Your STARK crawler is now production-ready with Coolify!**