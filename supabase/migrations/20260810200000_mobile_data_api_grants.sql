-- ORVIAN Monitor — Data API grants patch (idempotent)
-- Run in Supabase Dashboard → SQL Editor (migration zaten uygulanmış projeler için)
-- Automatically expose new tables = OFF → explicit GRANT gerekir
-- RLS politikalarına dokunmaz; anon/authenticated'a yazma vermez.

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
