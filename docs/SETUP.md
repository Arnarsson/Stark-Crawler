# Complete Setup Guide - STARK Product Crawler

## Prerequisites

- Node.js 20+ or Docker
- Supabase account (or local PostgreSQL)
- n8n instance (optional, for automation)
- 2GB+ RAM for Playwright

## Step 1: Clone & Install

```bash
# Clone the repository
git clone https://github.com/yourusername/stark-product-crawler.git
cd stark-product-crawler

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

## Step 2: Database Setup

### Option A: Supabase (Recommended)

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor and run the schema from `sql/schema.sql`
3. Get your credentials:
   - Settings → API → URL (SUPABASE_URL)
   - Settings → API → service_role key (SUPABASE_KEY)

### Option B: Local PostgreSQL

```bash
# Run PostgreSQL with Docker
docker run -d \
  --name stark-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=stark_products \
  -p 5432:5432 \
  postgres:15

# Apply schema
psql -h localhost -U postgres -d stark_products < sql/schema.sql
```

## Step 3: Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env
```

Required variables:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your service role key (not anon key!)

## Step 4: Test the Crawler

```bash
# Test with a single product
node crawler/test-crawler.js

# If successful, run full crawl
npm run crawl
```

## Step 5: Setup n8n Automation

### Import Workflow

1. Open n8n dashboard
2. Click "Import" 
3. Paste the JSON from `workflows/stark-nightly.json`
4. Configure credentials:
   - Supabase connection
   - Slack webhook (optional)
   - Email settings (optional)

### Configure Credentials in n8n

1. **Supabase Credentials:**
   - Type: PostgreSQL
   - Host: `db.YOUR-PROJECT.supabase.co`
   - Database: `postgres`
   - User: `postgres`
   - Password: Your database password
   - Port: `5432`
   - SSL: Required

2. **Slack Webhook (Optional):**
   - Get webhook URL from Slack App settings
   - Add as HTTP Header credential

## Step 6: Deploy with Docker (Production)

```bash
# Build and run with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f crawler

# Stop services
docker-compose down
```

## Step 7: Monitoring & Maintenance

### Check Crawl Status

```sql
-- Recent crawl logs
SELECT * FROM stark_crawl_logs 
ORDER BY started_at DESC 
LIMIT 10;

-- Product statistics
SELECT 
  COUNT(*) as total_products,
  COUNT(DISTINCT sku) as unique_skus,
  COUNT(DISTINCT ean) as unique_eans,
  MAX(last_seen_at) as last_update
FROM stark_products;
```

### Export Data

```bash
# Export to CSV
npm run export

# Or use SQL
psql -h localhost -U postgres -d stark_products -c "\copy (SELECT * FROM stark_products) TO 'products.csv' CSV HEADER"
```

## Step 8: Troubleshooting

### Common Issues

1. **"Missing SUPABASE_URL or SUPABASE_KEY"**
   - Ensure `.env` file exists and contains valid credentials
   - Use service_role key, not anon key

2. **"Timeout waiting for selector"**
   - STARK might have changed their HTML structure
   - Check `CRAWLER_TIMEOUT` setting (increase if needed)
   - Verify internet connection

3. **"429 Too Many Requests"**
   - Reduce `CRAWLER_CONCURRENCY` to 1
   - Increase `CRAWLER_DELAY` to 2000ms

4. **Out of Memory**
   - Reduce batch size in crawler
   - Increase Docker memory limit
   - Use `CRAWLER_HEADLESS=true`

### Debug Mode

```bash
# Run with debug logging
LOG_LEVEL=debug npm run crawl

# Test single URL
node -e "
import { extractProduct } from './crawler/stark-crawler.js';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
const product = await extractProduct(page, 'https://www.stark.dk/product-url');
console.log(product);
await browser.close();
"
```

## Step 9: Production Checklist

- [ ] Set strong Supabase service key
- [ ] Configure log rotation
- [ ] Setup error alerting
- [ ] Enable n8n authentication
- [ ] Configure backup strategy
- [ ] Set resource limits in Docker
- [ ] Monitor disk space for logs
- [ ] Review robots.txt compliance
- [ ] Test disaster recovery

## Step 10: API Migration Path

When STARK provides official API access:

1. Replace `crawler/stark-crawler.js` with API client
2. Map API response to existing database schema
3. Update n8n workflow to use API instead of crawler
4. Maintain same database structure for compatibility

## Support

- Issues: Create GitHub issue
- Updates: Check CHANGELOG.md
- Legal: See COMPLIANCE.md