-- Idempotent migration: Ürün Takip Sistemi v2
-- Safe to run multiple times

CREATE TABLE IF NOT EXISTS tracked_products (
  id SERIAL PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  source_site TEXT NOT NULL DEFAULT 'trendyol',
  source_product_id TEXT,
  source_title TEXT NOT NULL,
  shopify_product_id TEXT,
  shopify_handle TEXT,
  shopify_product_gid TEXT,
  current_source_price NUMERIC(10,2),
  current_source_stock INTEGER,
  current_status TEXT NOT NULL DEFAULT 'pending',
  tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMP,
  last_success_at TIMESTAMP,
  last_error_at TIMESTAMP,
  last_error_message TEXT,
  check_interval_minutes INTEGER NOT NULL DEFAULT 1440,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracked_variants (
  id SERIAL PRIMARY KEY,
  tracked_product_id INTEGER NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  source_variant_id TEXT,
  source_variant_title TEXT,
  source_sku TEXT,
  option1 TEXT,
  option2 TEXT,
  option3 TEXT,
  shopify_variant_id TEXT,
  shopify_variant_gid TEXT,
  shopify_sku TEXT,
  current_source_price NUMERIC(10,2),
  current_source_stock INTEGER,
  current_available BOOLEAN,
  match_confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  match_status TEXT NOT NULL DEFAULT 'uncertain',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_snapshots (
  id SERIAL PRIMARY KEY,
  tracked_product_id INTEGER NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL DEFAULT 'check',
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  price NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'TRY',
  stock INTEGER,
  available BOOLEAN,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detected_changes (
  id SERIAL PRIMARY KEY,
  tracked_product_id INTEGER NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  tracked_variant_id INTEGER REFERENCES tracked_variants(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  source_snapshot_id INTEGER REFERENCES product_snapshots(id) ON DELETE SET NULL,
  target_snapshot_id INTEGER REFERENCES product_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  tracked_product_id INTEGER REFERENCES tracked_products(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value NUMERIC(10,2) NOT NULL,
  min_price NUMERIC(10,2),
  max_price NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracked_products_status ON tracked_products(current_status);
CREATE INDEX IF NOT EXISTS idx_tracked_variants_product ON tracked_variants(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_product_snapshots_product ON product_snapshots(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_detected_changes_product ON detected_changes(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_detected_changes_status ON detected_changes(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_product ON sync_logs(tracked_product_id);
