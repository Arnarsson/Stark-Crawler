#!/bin/bash
# Initialize n8n database
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE n8n;
    CREATE USER n8n WITH ENCRYPTED PASSWORD 'n8n_secure_password';
    GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n;
    
    -- Grant connect privilege
    GRANT CONNECT ON DATABASE n8n TO n8n;
    
    -- Switch to n8n database and set permissions
    \c n8n
    GRANT ALL ON SCHEMA public TO n8n;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO n8n;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO n8n;
EOSQL

echo "n8n database initialized successfully"