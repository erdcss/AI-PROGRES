# Ürün Takip + Telegram Bildirimleri

## Mimari

```text
tracked_products (DB)
       ↓
tracking.scheduler (60sn döngü, DB ayarı: scheduler_enabled)
       ↓
source-fetcher → runTrendyolScrapePipeline (Browser Worker öncelikli)
       ↓
product-diff → detected_changes
       ↓
Telegram (opsiyonel, env ile)
       ↓
Shopify güncelleme (manuel/onay — otomatik sync şu an kapalı)
```

## Mevcut durum

- **tracking.scheduler.ts** — resmi v2 scheduler (DB `tracking_settings`)
- **tracking.service.ts** — CRUD, snapshot, sync log
- **telegram-notifier.service.ts** — yeni ince katman (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
- **product-tracking-worker.ts** — env bayrağı log/bootstrap (`PRODUCT_TRACKING_ENABLED`)

## Env değişkenleri

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=-1001234567890
PRODUCT_TRACKING_ENABLED=false
PRODUCT_TRACKING_INTERVAL_MINUTES=30
```

`PRODUCT_TRACKING_INTERVAL_MINUTES` dokümantasyon/not amaçlıdır; ana interval DB'deki `tracking_settings` ile yönetilir (varsayılan 60sn döngü).

## Telegram bot kurulumu

1. [@BotFather](https://t.me/BotFather) → `/newbot` → token alın → `TELEGRAM_BOT_TOKEN`
2. Botu gruba/kanala ekleyin
3. Chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates` veya [@userinfobot](https://t.me/userinfobot)
4. `TELEGRAM_CHAT_ID` olarak kaydedin

## Mesaj formatı

```text
Ürün değişikliği tespit edildi
Başlık: ...
URL: ...
Fiyat: eski → yeni
Stok: eski → yeni
Varyant: eski → yeni
Shopify: güncellendi/güncellenmedi
```

Browser Worker yoksa:

```text
Durum: kısmi veri (Browser Worker/HTML eksik olabilir)
```

## Browser Worker ilişkisi

Cloud ortamda tam varyant/fiyat karşılaştırması için `BROWSER_WORKER_ENDPOINT` tanımlı olmalıdır. Worker kapalıyken takip çalışır ancak sonuçlar `partial` olabilir.

Health: `GET /api/browser-worker/health`

## Sonraki adımlar

1. `detected_changes` oluştuğunda otomatik `notifyProductChange()` çağrısı (product-diff hook)
2. Onaylı değişiklikler için Shopify `updateProductPricesAndStock` entegrasyonu
3. `PRODUCT_TRACKING_INTERVAL_MINUTES` → DB ayarına senkron opsiyonu
4. Telegram rate limit ve digest (toplu özet) modu

## API

- `GET /api/tracking/notifications` — bekleyen değişiklikler
- `POST /api/tracking/check/:id` — manuel kontrol
