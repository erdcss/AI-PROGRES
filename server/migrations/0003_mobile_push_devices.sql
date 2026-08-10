-- ORVIAN Monitor mobile push devices
-- Idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS mobile_push_devices (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  push_token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  app_version TEXT,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_push_devices_device_id_uidx
  ON mobile_push_devices (device_id);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_push_devices_push_token_uidx
  ON mobile_push_devices (push_token);

CREATE INDEX IF NOT EXISTS mobile_push_devices_enabled_idx
  ON mobile_push_devices (enabled)
  WHERE enabled = TRUE;
