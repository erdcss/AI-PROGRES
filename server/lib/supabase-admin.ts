/**
 * Supabase admin (service role) — yalnızca server.
 * Mobil bundle'a asla import edilmemeli.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
let lastMobileSyncAt: string | null = null;
let lastDashboardSyncAt: string | null = null;

export function markMobileSyncTime(): void {
  lastMobileSyncAt = new Date().toISOString();
}

export function markDashboardSyncTime(): void {
  lastDashboardSyncAt = new Date().toISOString();
}

export function getMobileSyncTimestamps(): {
  lastMobileSyncAt: string | null;
  lastDashboardSyncAt: string | null;
} {
  return { lastMobileSyncAt, lastDashboardSyncAt };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;
  const url = process.env.SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

/** Test / guard: service role asla client path'inden gelmemeli */
export function assertServerOnlySupabaseEnv(): { ok: boolean; reason?: string } {
  if (typeof process === "undefined") {
    return { ok: false, reason: "no process — not server" };
  }
  // Expo public env names must not hold service role
  const leaked =
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY;
  if (leaked) {
    return { ok: false, reason: "service role exposed via EXPO_PUBLIC_*" };
  }
  return { ok: true };
}

export function __resetSupabaseAdminForTests(): void {
  cached = null;
  lastMobileSyncAt = null;
  lastDashboardSyncAt = null;
}
