# Supabase — ORVIAN Monitor (mobil canlı veri)

AI-PROGRES ana backend otorite kalır. Supabase yalnızca mobil mirror + Realtime katmanıdır.

## Manuel adımlar

1. [supabase.com](https://supabase.com) üzerinde proje oluştur  
2. **Project URL** al (`https://xxxx.supabase.co`)  
3. **Publishable / anon key** al (Settings → API)  
4. **Service role key** al (yalnızca sunucu; asla mobil APK’ya koyma)  
5. Backend `.env`:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
6. Mobile `mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=https://your-backend
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...anon...
   ```
7. Migration SQL çalıştır:  
   Supabase Dashboard → SQL Editor → `migrations/20260810120000_mobile_monitor.sql` içeriğini çalıştır  
   (veya `supabase db push` CLI)
8. Realtime: Database → Publications → `supabase_realtime` içinde  
   `mobile_products`, `mobile_tracking_changes`, `mobile_notifications`, `mobile_dashboard_stats` aktif olmalı  
9. Backfill:
   ```bash
   npm run mobile:supabase:backfill
   ```
10. Health:
    ```bash
    curl https://your-backend/api/mobile/health
    ```

## Güvenlik

| Key | Nerede |
|-----|--------|
| Service role | Yalnızca sunucu `SUPABASE_SERVICE_ROLE_KEY` |
| Publishable/anon | Mobil `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| DATABASE_URL | Mobilde yok |

Mobil client RLS ile yalnızca SELECT + Realtime subscribe yapar. Yazma (device register, mark-read) backend API üzerinden gider.
