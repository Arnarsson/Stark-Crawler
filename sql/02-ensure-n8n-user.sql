-- Ensure n8n user and database exist (idempotent)
-- This script can be run multiple times safely

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

-- Grant all privileges on n8n database to n8n user
GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n;
GRANT CONNECT ON DATABASE n8n TO n8n;

-- Connect to n8n database and set permissions
\c n8n
GRANT ALL ON SCHEMA public TO n8n;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO n8n;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO n8n;