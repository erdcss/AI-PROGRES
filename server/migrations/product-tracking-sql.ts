/** Settings tabloları — eski migration dosyalarına eklenir */
export const PRODUCT_TRACKING_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS tracking_settings (
  id SERIAL PRIMARY KEY,
  tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  scheduler_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_shopify_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  check_interval_minutes INTEGER NOT NULL DEFAULT 60,
  batch_size INTEGER NOT NULL DEFAULT 5,
  request_delay_ms INTEGER NOT NULL DEFAULT 1500,
  max_errors_before_pause INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_gateway_settings (
  id SERIAL PRIMARY KEY,
  gateway_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  proxy_fallback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  provider_type TEXT NOT NULL DEFAULT 'none',
  provider_endpoint TEXT,
  provider_api_key_encrypted TEXT,
  proxy_url_encrypted TEXT,
  local_agent_endpoint TEXT,
  local_agent_token_encrypted TEXT,
  timeout_ms INTEGER NOT NULL DEFAULT 20000,
  retry_count INTEGER NOT NULL DEFAULT 2,
  retry_delay_ms INTEGER NOT NULL DEFAULT 1500,
  use_proxy_for_html BOOLEAN NOT NULL DEFAULT TRUE,
  use_proxy_for_images BOOLEAN NOT NULL DEFAULT TRUE,
  use_proxy_for_api BOOLEAN NOT NULL DEFAULT FALSE,
  last_test_status TEXT,
  last_test_at TIMESTAMP,
  last_test_error TEXT,
  last_working_provider TEXT,
  last_test_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_test_success BOOLEAN,
  last_test_message TEXT,
  last_test_url TEXT,
  last_test_html_size INTEGER,
  last_test_title_found BOOLEAN,
  last_test_price_found BOOLEAN,
  last_test_images_found INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_error TEXT;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_working_provider TEXT;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_url TEXT;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_html_size INTEGER;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_title_found BOOLEAN;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_price_found BOOLEAN;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_images_found INTEGER;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS local_agent_endpoint TEXT;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS local_agent_token_encrypted TEXT;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_status TEXT;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_success BOOLEAN;
ALTER TABLE scrape_gateway_settings ADD COLUMN IF NOT EXISTS last_test_message TEXT;
`;

/** Bundled fallback — SQL dosyası deploy paketinde bulunamazsa veya eskiyse kullanılır */
export const PRODUCT_TRACKING_MIGRATION_SQL = `-- Idempotent migration: Ürün Takip Sistemi v2
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
${PRODUCT_TRACKING_SETTINGS_SQL}`;

export const PRODUCT_TRACKING_TABLES = [
  "tracked_products",
  "tracked_variants",
  "product_snapshots",
  "detected_changes",
  "sync_logs",
  "price_rules",
  "tracking_settings",
  "scrape_gateway_settings",
] as const;

export function migrationSqlIncludesSettingsTables(sql: string): boolean {
  return sql.includes("tracking_settings") && sql.includes("scrape_gateway_settings");
}

export function augmentMigrationSql(fileSql: string): string {
  if (migrationSqlIncludesSettingsTables(fileSql)) {
    return fileSql;
  }
  console.warn(
    "⚠️ Migration dosyası eski (settings tabloları yok) — embedded settings SQL ekleniyor",
  );
  return `${fileSql.trim()}\n\n-- Settings tables supplement\n${PRODUCT_TRACKING_SETTINGS_SQL}`;
}
