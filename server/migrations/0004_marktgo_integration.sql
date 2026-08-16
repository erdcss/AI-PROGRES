-- MARKT-GO / destination integration mapping (idempotent)
-- Shopify credentials and shopify_* ID columns are unchanged.

CREATE TABLE IF NOT EXISTS integration_connections (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  api_base_url TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  token_last4 TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL DEFAULT 'disconnected',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error TEXT,
  last_health_at TIMESTAMPTZ,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_provider_name_uidx
  ON integration_connections (provider, name);

CREATE INDEX IF NOT EXISTS integration_connections_provider_active_idx
  ON integration_connections (provider, is_active);

CREATE TABLE IF NOT EXISTS integration_product_mappings (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  local_product_id TEXT NOT NULL,
  tracked_product_id INTEGER,
  external_product_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'synced',
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  failed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_product_mappings_conn_local_uidx
  ON integration_product_mappings (connection_id, local_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS integration_product_mappings_conn_external_uidx
  ON integration_product_mappings (connection_id, external_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS integration_product_mappings_conn_extid_uidx
  ON integration_product_mappings (connection_id, external_id);

CREATE INDEX IF NOT EXISTS integration_product_mappings_tracked_idx
  ON integration_product_mappings (tracked_product_id);

CREATE TABLE IF NOT EXISTS integration_variant_mappings (
  id SERIAL PRIMARY KEY,
  product_mapping_id INTEGER NOT NULL REFERENCES integration_product_mappings(id) ON DELETE CASCADE,
  local_variant_id TEXT NOT NULL,
  external_variant_id TEXT NOT NULL,
  option1 TEXT,
  option2 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_variant_mappings_prod_local_uidx
  ON integration_variant_mappings (product_mapping_id, local_variant_id);

CREATE TABLE IF NOT EXISTS integration_category_mappings (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'marktgo',
  source_category TEXT NOT NULL,
  external_category_id TEXT NOT NULL,
  external_category_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_category_mappings_conn_source_uidx
  ON integration_category_mappings (connection_id, source_category);
