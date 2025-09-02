# Setting Up External n8n with STARK Crawler

## Using Your Existing n8n Instance

Since you have n8n at `https://n8n.aigrowthadvisors.cc`, you can integrate it with the STARK Crawler.

## Setup Steps

### 1. Database Connection
Your n8n needs to connect to the PostgreSQL database where crawler data is stored.

**PostgreSQL Connection Details:**
- Host: `135.181.101.70` (your server IP)
- Port: `5432`
- Database: `stark_products`
- Username: `postgres`
- Password: Check your `.env.coolify` file for `DB_PASSWORD`

### 2. Create n8n Workflow

Create a new workflow in your n8n instance with these nodes:

#### a. Webhook Node (Trigger)
- Create a webhook to receive crawler completion notifications
- URL will be: `https://n8n.aigrowthadvisors.cc/webhook/stark-crawler-complete`

#### b. PostgreSQL Node
- Operation: Execute Query
- Query to get latest products:
```sql
SELECT * FROM stark_products 
WHERE last_seen_at > NOW() - INTERVAL '1 hour'
ORDER BY last_seen_at DESC
LIMIT 100;
```

#### c. Data Processing Nodes
Add any data transformation or processing you need:
- Filter products by criteria
- Format data for export
- Calculate price changes
- Check stock status changes

#### d. Notification/Export Nodes
- Email notifications for new products
- Export to CSV/Excel
- Send to other systems via API
- Update external databases

### 3. Crawler Integration

Update your crawler to notify n8n when crawling completes:

```javascript
// Add to stark-crawler.js after crawl completes
async function notifyN8n(stats) {
  try {
    await fetch('https://n8n.aigrowthadvisors.cc/webhook/stark-crawler-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        stats: stats,
        source: 'stark-crawler'
      })
    });
  } catch (error) {
    logger.error('Failed to notify n8n:', error);
  }
}
```

### 4. Example Workflows

#### Price Change Monitor
1. Schedule trigger (every hour)
2. Query products with price changes
3. Format as report
4. Send email notification

#### Stock Alert System
1. Schedule trigger (every 30 minutes)
2. Query out-of-stock products that came back
3. Send notifications to relevant teams

#### Daily Export
1. Cron trigger (daily at 6 AM)
2. Query all active products
3. Transform to CSV format
4. Upload to FTP/S3/Google Drive

### 5. Security Considerations

1. **Network Access**: Ensure your n8n can reach the PostgreSQL database
   - May need to whitelist n8n's IP in your firewall
   - Or use SSH tunnel for secure connection

2. **Credentials**: Store database credentials securely in n8n
   - Use n8n's credential system
   - Don't hardcode passwords in workflows

3. **Rate Limiting**: Be mindful of database query frequency
   - Use caching where appropriate
   - Batch operations when possible

## Benefits of External n8n

✅ **Centralized Automation** - Manage all workflows in one place
✅ **Better Resources** - Your n8n instance likely has more resources
✅ **Existing Integrations** - Leverage your existing n8n connections
✅ **No Additional Maintenance** - One less service to manage in Coolify

## Need Help?

- n8n Documentation: https://docs.n8n.io
- PostgreSQL in n8n: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/
- Webhook Documentation: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/