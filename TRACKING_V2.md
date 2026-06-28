# Ürün Takip Sistemi v2

Tek resmi takip modülü. Eski `url-tracking`, `monitoring-service`, `hourly-price-monitoring` ve env flag'leri kaldırıldı.

## Kullanım

1. **Shopify aktarımı** — Başarılı upload sonrası ürün otomatik `tracked_products` tablosuna eklenir (takip açıksa).
2. **Admin panel** — `/urun-takip`
   - **Takip Edilen Ürünler** — liste, manuel kontrol, aç/kapat
   - **Değişiklikler** — fiyat/stok/varyant diff, görüldü/ignore
   - **Ayarlar** — aralık, batch, scheduler (Shopify auto-sync kapalı)
3. **Kaynak erişim** — `/kaynak-erisim` — Railway'de Trendyol timeout için proxy veya scraping API
4. **API** — `GET /api/tracking/scheduler-status`, `GET /api/tracking/notifications`

## Varsayılan ayarlar

- `tracking_enabled=true`
- `scheduler_enabled=true` (60 dk aralık, batch 5)
- `auto_shopify_sync_enabled=false` (değiştirilemez)

## Temizlik

`POST /api/tracking/cleanup-invalid` + `adminSecret` — sahte `trendyol.com` / price=100 kayıtlarını devre dışı bırakır.
