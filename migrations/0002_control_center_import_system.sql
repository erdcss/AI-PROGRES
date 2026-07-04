-- Control Center: import jobs, tracking v3 extensions, audit
-- Idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS import_jobs (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  source_platform TEXT NOT NULL DEFAULT 'trendyol',
  source_product_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage TEXT,
  progress_percentage INTEGER NOT NULL DEFAULT 0,
  scrape_mode TEXT NOT NULL DEFAULT 'auto',
  upload_mode TEXT NOT NULL DEFAULT 'manual_approval',
  profit_rule_id INTEGER,
  requested_by TEXT,
  canonical_product JSONB,
  quality_result JSONB,
  shopify_result JSONB,
  tracking_result JSONB,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_source_url ON import_jobs(source_url);
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;


CREATE TABLE IF NOT EXISTS import_job_events (
  id SERIAL PRIMARY KEY,
  import_job_id INTEGER NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  code TEXT,
  message TEXT NOT NULL,
  safe_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_job_events_job ON import_job_events(import_job_id);

-- tracked_products extensions
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS approval_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMP;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS last_snapshot_id INTEGER;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS last_applied_snapshot_id INTEGER;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS last_shopify_sync_at TIMESTAMP;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS paused_reason TEXT;
ALTER TABLE tracked_products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

-- tracked_variants extensions
ALTER TABLE tracked_variants ADD COLUMN IF NOT EXISTS source_option_key TEXT;
ALTER TABLE tracked_variants ADD COLUMN IF NOT EXISTS shopify_inventory_item_id TEXT;
ALTER TABLE tracked_variants ADD COLUMN IF NOT EXISTS shopify_location_id TEXT;
ALTER TABLE tracked_variants ADD COLUMN IF NOT EXISTS previous_source_price NUMERIC(10,2);
ALTER TABLE tracked_variants ADD COLUMN IF NOT EXISTS previous_source_stock INTEGER;
ALTER TABLE tracked_variants ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMP;
ALTER TABLE tracked_variants ADD COLUMN IF NOT EXISTS mismatch_reason TEXT;

-- detected_changes extensions
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS change_group_id TEXT;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS apply_status TEXT;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS rejected_by TEXT;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS apply_error TEXT;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE detected_changes ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_detected_changes_group ON detected_changes(change_group_id);
CREATE INDEX IF NOT EXISTS idx_detected_changes_apply_status ON detected_changes(apply_status);

CREATE TABLE IF NOT EXISTS tracking_runs (
  id SERIAL PRIMARY KEY,
  tracked_product_id INTEGER REFERENCES tracked_products(id) ON DELETE SET NULL,
  run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'running',
  priority TEXT NOT NULL DEFAULT 'normal',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_code TEXT,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS change_groups (
  id SERIAL PRIMARY KEY,
  group_id TEXT NOT NULL UNIQUE,
  tracked_product_id INTEGER NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  change_count INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_at TIMESTAMP,
  approved_by TEXT,
  rejected_at TIMESTAMP,
  rejected_by TEXT,
  applied_at TIMESTAMP,
  apply_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopify_apply_jobs (
  id SERIAL PRIMARY KEY,
  apply_job_id TEXT NOT NULL UNIQUE,
  change_group_id TEXT,
  tracked_product_id INTEGER REFERENCES tracked_products(id) ON DELETE SET NULL,
  import_job_id INTEGER REFERENCES import_jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  dry_run_result JSONB,
  apply_result JSONB,
  idempotency_key TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  request_id TEXT,
  ip_hint TEXT,
  user_agent_hint TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_code TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
