import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

/** Guard: service role asla mobil EXPO_PUBLIC env'de olmamalı */
export function assertNoServiceRoleInMobileEnv(): boolean {
  const banned = [
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY,
  ];
  return banned.every((v) => !v);
}

export function isMobileSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey && assertNoServiceRoleInMobileEnv());
}

export const supabase = isMobileSupabaseConfigured()
  ? createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;
