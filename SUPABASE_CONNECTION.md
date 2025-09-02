# Connecting Crawler to Your Supabase

## Current Issue
The crawler cannot connect to your Supabase at `135.181.101.70:5432` from inside the Docker container.

## Solutions

### Option 1: Use Local PostgreSQL (Recommended for now)
The crawler will save to the local PostgreSQL container and you can sync it later:
1. The deployment already has a local PostgreSQL
2. Data is saved there successfully
3. You can export and import to Supabase later

### Option 2: Open Supabase Port (If Supabase is on same server)
If your Supabase is running on the same server (135.181.101.70):

1. Check if Supabase PostgreSQL is listening on all interfaces:
```bash
# SSH to your server and run:
sudo netstat -tlnp | grep 5432
```

2. If it shows `127.0.0.1:5432`, you need to configure PostgreSQL to listen on all interfaces:
```bash
# Edit PostgreSQL config in your Supabase setup
# Usually in supabase/docker/volumes/db/postgresql.conf
listen_addresses = '*'  # or '0.0.0.0'
```

3. Check firewall:
```bash
sudo ufw status
# If needed, allow from Docker network:
sudo ufw allow from 172.16.0.0/12 to any port 5432
```

### Option 3: Use Network Mode Host
Add to docker-compose.coolify.yml for the crawler service:
```yaml
crawler:
  network_mode: "host"
  # This allows direct access to localhost services
```

### Option 4: Create Database Link
If you have both databases, you can sync them:

1. In your Supabase SQL editor:
```sql
-- Create foreign data wrapper
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Create server connection
CREATE SERVER coolify_postgres
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (host 'YOUR_COOLIFY_IP', port '5432', dbname 'stark_products');

-- Create user mapping
CREATE USER MAPPING FOR postgres
SERVER coolify_postgres
OPTIONS (user 'postgres', password 'your_password');

-- Import foreign schema
IMPORT FOREIGN SCHEMA public
FROM SERVER coolify_postgres
INTO public;
```

## Quick Fix for Now

Since you already have 500 products in Supabase and want to continue using it, the best approach is:

1. **Export your existing Supabase data**:
```sql
-- In Supabase SQL editor
COPY stark_products TO '/tmp/products.csv' CSV HEADER;
```

2. **Import to local PostgreSQL**:
```sql
-- In pgAdmin connected to local PostgreSQL
COPY stark_products FROM '/tmp/products.csv' CSV HEADER;
```

3. **Let crawler run with local PostgreSQL**

4. **Periodically sync back to Supabase**

## To Test Connection

From your server, test if Supabase PostgreSQL is accessible:
```bash
# Test from host
psql postgresql://postgres:65LEOEDaSVDnvzbrIzzIBGY7937RmEFV@127.0.0.1:5432/postgres

# Test from Docker
docker run --rm -it postgres:15 psql postgresql://postgres:65LEOEDaSVDnvzbrIzzIBGY7937RmEFV@135.181.101.70:5432/postgres
```

If the second command fails, then Docker containers cannot reach your Supabase.