#!/bin/bash

# Script to fix n8n database user in running PostgreSQL container
# This can be run from Coolify's terminal or SSH

echo "Fixing n8n database user..."

# Find the PostgreSQL container
POSTGRES_CONTAINER=$(docker ps --format "table {{.Names}}" | grep -E "postgres.*e4ogcs0080g0o4oc48ww0sgw" | head -1)

if [ -z "$POSTGRES_CONTAINER" ]; then
    echo "Error: PostgreSQL container not found"
    echo "Looking for any postgres container..."
    POSTGRES_CONTAINER=$(docker ps --format "table {{.Names}}" | grep postgres | head -1)
fi

if [ -z "$POSTGRES_CONTAINER" ]; then
    echo "Error: No PostgreSQL container found"
    exit 1
fi

echo "Found PostgreSQL container: $POSTGRES_CONTAINER"

# Create the n8n user and database
echo "Creating n8n user and granting permissions..."

docker exec -i "$POSTGRES_CONTAINER" psql -U postgres << 'EOF'
-- Create n8n user if it doesn't exist
DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'n8n') THEN
      CREATE USER n8n WITH ENCRYPTED PASSWORD 'n8n_secure_password';
   END IF;
END
$$;

-- Create n8n database if it doesn't exist
SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n;
GRANT CONNECT ON DATABASE n8n TO n8n;

-- Connect to n8n database and set permissions
\c n8n
GRANT ALL ON SCHEMA public TO n8n;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO n8n;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO n8n;

-- Verify the user was created
\du n8n
EOF

if [ $? -eq 0 ]; then
    echo "✅ Successfully created/updated n8n user"
    echo ""
    echo "Now restart the n8n container to apply changes:"
    echo "  1. In Coolify, go to your application"
    echo "  2. Click 'Stop' then 'Start' to restart containers"
else
    echo "❌ Failed to create n8n user"
    exit 1
fi