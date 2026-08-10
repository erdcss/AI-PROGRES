-- ORVIAN Monitor — Supabase mobile mirror (idempotent)
-- Run in Supabase SQL editor or via supabase db push

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- A) mobile_products
CREATE TABLE IF NOT EXISTS public.mobile_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id text NOT NULL,
  tracking_product_id bigint NULL,
  title text NOT NULL,
  image_url text NULL,
  source text NOT NULL,
  source_url text NULL,
  price numeric NULL,
  currency text NOT NULL DEFAULT 'TRY',
  variant_count integer NOT NULL DEFAULT 0,
  stock_status text NULL,
  shopify_status text NULL,
  tracking_enabled boolean NOT NULL DEFAULT false,
  scraped_at timestamptz NULL,
  last_checked_at timestamptz NULL,
  last_changed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_products_source_unique UNIQUE (source_product_id, source)
);

CREATE INDEX IF NOT EXISTS mobile_products_source_idx ON public.mobile_products (source);
CREATE INDEX IF NOT EXISTS mobile_products_tracking_product_id_idx ON public.mobile_products (tracking_product_id);
CREATE INDEX IF NOT EXISTS mobile_products_updated_at_idx ON public.mobile_products (updated_at);
CREATE INDEX IF NOT EXISTS mobile_products_tracking_enabled_idx ON public.mobile_products (tracking_enabled);

-- B) mobile_tracking_changes
CREATE TABLE IF NOT EXISTS public.mobile_tracking_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_change_id bigint NULL,
  event_id text NULL,
  tracking_product_id bigint NOT NULL,
  mobile_product_id uuid NULL REFERENCES public.mobile_products(id) ON DELETE SET NULL,
  change_type text NOT NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  severity text NULL,
  status text NULL,
  seen boolean NOT NULL DEFAULT false,
  detected_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_tracking_changes_source_change_uidx UNIQUE (source_change_id),
  CONSTRAINT mobile_tracking_changes_event_id_uidx UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS mobile_tracking_changes_tracking_product_id_idx
  ON public.mobile_tracking_changes (tracking_product_id);
CREATE INDEX IF NOT EXISTS mobile_tracking_changes_change_type_idx
  ON public.mobile_tracking_changes (change_type);
CREATE INDEX IF NOT EXISTS mobile_tracking_changes_seen_idx
  ON public.mobile_tracking_changes (seen);
CREATE INDEX IF NOT EXISTS mobile_tracking_changes_detected_at_idx
  ON public.mobile_tracking_changes (detected_at);

-- C) mobile_notifications
CREATE TABLE IF NOT EXISTS public.mobile_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  product_id uuid NULL REFERENCES public.mobile_products(id) ON DELETE SET NULL,
  tracking_product_id bigint NULL,
  change_id uuid NULL REFERENCES public.mobile_tracking_changes(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_notifications_event_id_uidx UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS mobile_notifications_read_idx ON public.mobile_notifications (read);
CREATE INDEX IF NOT EXISTS mobile_notifications_created_at_idx ON public.mobile_notifications (created_at);
CREATE INDEX IF NOT EXISTS mobile_notifications_type_idx ON public.mobile_notifications (type);

-- D) mobile_dashboard_stats (single active snapshot pattern)
CREATE TABLE IF NOT EXISTS public.mobile_dashboard_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_key text NOT NULL DEFAULT 'active',
  total_products integer NOT NULL DEFAULT 0,
  today_products integer NOT NULL DEFAULT 0,
  tracked_products integer NOT NULL DEFAULT 0,
  active_tracking integer NOT NULL DEFAULT 0,
  pending_changes integer NOT NULL DEFAULT 0,
  price_changes integer NOT NULL DEFAULT 0,
  stock_changes integer NOT NULL DEFAULT 0,
  variant_changes integer NOT NULL DEFAULT 0,
  system_health text NOT NULL DEFAULT 'unknown',
  last_sync_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_dashboard_stats_snapshot_key_uidx UNIQUE (snapshot_key)
);

-- Data API privileges (Automatically expose new tables = OFF → explicit GRANT gerekli)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.mobile_products,
  public.mobile_tracking_changes,
  public.mobile_notifications,
  public.mobile_dashboard_stats
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.mobile_products,
  public.mobile_tracking_changes,
  public.mobile_notifications,
  public.mobile_dashboard_stats
TO service_role;

-- RLS
ALTER TABLE public.mobile_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_tracking_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_dashboard_stats ENABLE ROW LEVEL SECURITY;

-- Drop+recreate SELECT policies (idempotent)
DROP POLICY IF EXISTS mobile_products_select_anon ON public.mobile_products;
CREATE POLICY mobile_products_select_anon ON public.mobile_products
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS mobile_tracking_changes_select_anon ON public.mobile_tracking_changes;
CREATE POLICY mobile_tracking_changes_select_anon ON public.mobile_tracking_changes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS mobile_notifications_select_anon ON public.mobile_notifications;
CREATE POLICY mobile_notifications_select_anon ON public.mobile_notifications
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS mobile_dashboard_stats_select_anon ON public.mobile_dashboard_stats;
CREATE POLICY mobile_dashboard_stats_select_anon ON public.mobile_dashboard_stats
  FOR SELECT TO anon, authenticated USING (true);

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mobile_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_products;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mobile_tracking_changes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_tracking_changes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mobile_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_notifications;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mobile_dashboard_stats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_dashboard_stats;
  END IF;
END $$;
