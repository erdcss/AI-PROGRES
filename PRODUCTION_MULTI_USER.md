# Çok Kullanıcılı Production Mimarisi

## Amaç
Ürün veri programını tek kullanıcı/local araç mantığından, birden fazla kullanıcının aynı canlı servisi güvenli biçimde kullanabildiği çalışma alanı (tenant/workspace) mimarisine geçirmek.

## Production bileşenleri
- Web + API: mevcut `AI-PROGRES` Railway servisi
- PostgreSQL: kullanıcılar, workspace üyelikleri, sessionlar, tenant scrape jobları ve audit log
- Scrape worker: PostgreSQL kuyruğundan `FOR UPDATE SKIP LOCKED` ile güvenli job claim
- Browser worker: mevcut Railway browser-worker
- Trendyol scraper: mevcut `scenarioBasedScrape` motoru

## Kullanıcı izolasyonu
Normal kullanıcı istekleri `/api/workspace/*` altında çalışır. Bütün tenant verileri `workspace_id` ile filtrelenir. Kullanıcı başka bir workspace job kimliği bilse dahi sorgu workspace filtresi nedeniyle kayda erişemez.

Admin kullanıcı mevcut gelişmiş yönetim ekranını kullanmaya devam eder. Production'da hassas legacy API prefixleri admin oturumu veya geçerli internal service token olmadan çağrılamaz.

## Kimlik doğrulama
- Şifre: Node `crypto.scrypt`, kullanıcı başına rastgele salt
- Session: 32-byte rastgele token
- DB'de tokenın kendisi değil SHA-256 hash'i saklanır
- Cookie: HttpOnly, SameSite=Lax; production'da Secure
- Session süresi `SESSION_DAYS` ile ayarlanır
- İlk yönetici `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` ile oluşturulur

## Queue
`tenant_scrape_jobs` durumları:
- queued
- processing
- completed
- failed

Aynı PostgreSQL üzerinde birden fazla worker instance güvenli şekilde çalışabilir. Job claim transaction + `FOR UPDATE SKIP LOCKED` kullanır.

Varsayılanlar:
- concurrency: 2
- max attempts: 3
- retry: artan backoff
- workspace aktif queue limiti: 200
- tek bulk request: en fazla 100 URL

## API
### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Workspace
- `GET /api/workspace/summary`
- `GET /api/workspace/jobs`
- `GET /api/workspace/jobs/:id`
- `POST /api/workspace/scrape`
- `POST /api/workspace/scrape-bulk`
- `POST /api/workspace/jobs/:id/retry`
- `DELETE /api/workspace/jobs/:id`
- `GET /api/workspace/audit`

## Güvenlik
- Sadece HTTPS Trendyol ürün URL'leri tenant scrape endpointine kabul edilir.
- `localhost`, private network veya rastgele domain URL'leri kabul edilmez.
- Auth endpointlerinde temel IP rate-limit vardır.
- Workspace aktif queue limiti vardır.
- Hassas legacy admin API'leri production'da admin auth/internal service token kontrolünden geçer.
- Hardcoded `4434` fallback kaldırılmıştır.
- Request ID ve temel güvenlik headerları eklenmiştir.

## Environment
Production'da gerekli/yeni değişkenler:

```env
NODE_ENV=production
DATABASE_URL=...
BOOTSTRAP_ADMIN_EMAIL=...
BOOTSTRAP_ADMIN_PASSWORD=...
ALLOW_PUBLIC_REGISTRATION=true
SESSION_DAYS=7
TENANT_SCRAPE_WORKER_ENABLED=true
TENANT_SCRAPE_CONCURRENCY=2
TENANT_SCRAPE_POLL_MS=1500
```

Secret değerleri Git'e yazılmaz.

## CI / Deploy
Runtime Node 22 olarak sabitlenmiştir. GitHub Actions production kontrolü:
1. `npm ci`
2. `npm run build` — deploy'u durduran zorunlu kontrol
3. `npm run check` — legacy TypeScript borcu görünür rapor; geçici olarak non-blocking
4. production dependency audit — görünür rapor

Tam `tsc` kontrolü bu branch öncesinde de eski/ölü kodlarda çok sayıda hata verdiği için production build'den ayrı takip edilir. Amaç bu borcu dosya dosya temizleyerek ileride tekrar blocking hale getirmektir.

## Sonraki ölçekleme
İlk aşamada PostgreSQL job queue yeterlidir. Job hacmi/worker sayısı büyüdüğünde queue katmanı Redis/BullMQ veya ayrı queue servisine geçirilebilir; API sözleşmesi ve workspace modeli değişmek zorunda değildir.
