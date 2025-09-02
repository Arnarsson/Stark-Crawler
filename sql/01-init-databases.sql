-- Initialize all databases for STARK Crawler
-- This combines schema creation and n8n database setup

-- Create n8n database and user
CREATE DATABASE n8n;
CREATE USER n8n WITH ENCRYPTED PASSWORD 'n8n_secure_password';
GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n;

-- Grant connect privilege
GRANT CONNECT ON DATABASE n8n TO n8n;

-- Switch to main database for STARK products schema
-- The following schema will be created in the main database (stark_products)

-- Main products table
CREATE TABLE IF NOT EXISTS public.stark_products (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  name TEXT,
  sku TEXT,
  ean TEXT,
  vvs TEXT,
  price_text TEXT,
  price_numeric DECIMAL(10,2),
  currency TEXT DEFAULT 'DKK',
  in_stock BOOLEAN,
  category TEXT,
  subcategory TEXT,
  brand TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json JSONB,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Unique indexes for SKU and EAN
CREATE UNIQUE INDEX IF NOT EXISTS idx_stark_products_sku 
  ON public.stark_products (sku) 
  WHERE sku IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stark_products_ean 
  ON public.stark_products (ean) 
  WHERE ean IS NOT NULL;

-- Composite index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_stark_products_sku_ean 
  ON public.stark_products (COALESCE(sku, ''), COALESCE(ean, ''));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_stark_products_last_seen 
  ON public.stark_products (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_stark_products_category 
  ON public.stark_products (category, subcategory);

-- Change tracking table
CREATE TABLE IF NOT EXISTS public.stark_product_changes (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES public.stark_products(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crawl log table
CREATE TABLE IF NOT EXISTS public.stark_crawl_logs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  urls_discovered INTEGER DEFAULT 0,
  products_processed INTEGER DEFAULT 0,
  products_added INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  log_data JSONB
);

-- Index for change tracking
CREATE INDEX IF NOT EXISTS idx_stark_product_changes_product 
  ON public.stark_product_changes (product_id, changed_at DESC);

-- Index for crawl logs
CREATE INDEX IF NOT EXISTS idx_stark_crawl_logs_started 
  ON public.stark_crawl_logs (started_at DESC);