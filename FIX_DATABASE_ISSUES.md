# Fixing Database Issues in Coolify

## Problem
When PostgreSQL data persists between deployments, the n8n user might not be created, causing authentication failures.

## Solution Options

### Option 1: Run Fix Script (Recommended)

1. **From Coolify Terminal:**
   - Go to your STARK Crawler application in Coolify
   - Click on "Terminal" tab
   - Run these commands:
   ```bash
   curl -sSL https://raw.githubusercontent.com/Arnarsson/Stark-Crawler/main/scripts/fix-n8n-user.sh | bash
   ```

2. **Or manually via SSH:**
   - SSH into your server
   - Navigate to the application directory
   - Run:
   ```bash
   ./scripts/fix-n8n-user.sh
   ```

3. **After running the script:**
   - Go back to Coolify dashboard
   - Click "Stop" on your application
   - Wait for it to stop completely
   - Click "Start" to restart all containers

### Option 2: Reset PostgreSQL Volume (Data Loss!)

⚠️ **WARNING**: This will delete ALL data in PostgreSQL including any crawled products!

1. **In Coolify:**
   - Go to your STARK Crawler application
   - Click "Stop" to stop all containers
   - Click on "Advanced" tab
   - Find "Volumes" section
   - Look for the PostgreSQL data volume (usually `postgres_data`)
   - Click "Delete Volume"
   - Go back and click "Redeploy"

### Option 3: Manual Database Fix

1. **Access Coolify Terminal:**
   - Go to your application's "Terminal" tab
   - Find the PostgreSQL container name:
   ```bash
   docker ps | grep postgres
   ```

2. **Connect to PostgreSQL:**
   ```bash
   docker exec -it [POSTGRES_CONTAINER_NAME] psql -U postgres
   ```

3. **Run these SQL commands:**
   ```sql
   CREATE USER n8n WITH ENCRYPTED PASSWORD 'n8n_secure_password';
   CREATE DATABASE n8n;
   GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n;
   \q
   ```

4. **Restart containers:**
   - Click "Stop" then "Start" in Coolify

## Verify Fix

After applying any solution:

1. Check n8n logs in Coolify:
   - Go to "Logs" tab
   - Select the n8n container
   - Should see "Initializing n8n process" without authentication errors

2. Check if n8n is accessible:
   - If you have a domain configured, visit: `http://your-domain:5678`
   - Default credentials: 
     - Username: `admin`
     - Password: `StarkCrawler2024!`

## Prevention

To prevent this issue in future deployments:
- The SQL initialization scripts have been updated to be idempotent
- The fix is already included in the latest version of the repository
- Just pull the latest changes and redeploy