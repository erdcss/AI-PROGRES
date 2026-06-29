# Browser Worker Deploy (Production)

## Neden Browser Worker?

Railway gibi cloud ortamlarda Trendyol HTML, renk/beden ve sayfa içi JSON state verisi için gerçek bir tarayıcı gerekir. **Local Agent + Cloudflare quick tunnel** geçici bir geliştirme çözümüdür:

- Windows PC'nin sürekli açık kalması gerekir
- `trycloudflare.com` adresi her tunnel yeniden başlatıldığında değişir
- Üretim SLA'sına uygun değildir

**Browser Worker** bağımsız Playwright/Chromium servisidir; ayrı Railway servisi veya VPS üzerinde deploy edilir.

```text
Eski: Railway → Windows Local Agent → trycloudflare → Trendyol
Yeni: Railway → Browser Worker (Playwright) → Trendyol
```

## Deploy adımları (Railway ayrı servis)

### 1. Browser Worker servisini oluşturun

Railway'de yeni servis → repo kökünden `browser-worker/` klasörünü root directory olarak ayarlayın veya Dockerfile path: `browser-worker/Dockerfile`.

### 2. Worker env değişkenleri

```env
BROWSER_WORKER_TOKEN=güçlü-gizli-token
PORT=8080
NODE_ENV=production
```

### 3. Ana uygulama env değişkenleri

Ana Railway servisinde:

```env
BROWSER_WORKER_ENDPOINT=https://browser-worker-production.up.railway.app
BROWSER_WORKER_TOKEN=worker-ile-aynı-token
```

Deploy sonrası logda:

```text
🔧 Scrape ortam politikası: { preferBrowserWorker: true, preferLocalAgent: false, ... }
ℹ️ Browser Worker: erişilebilir (xxx.railway.app, 120ms, browserReady=true)
```

### 4. Health kontrolü

Worker (public):

```bash
curl https://browser-worker-domain.com/health
```

Ana uygulama:

```bash
curl https://main-app-domain.com/api/browser-worker/health
```

Beklenen:

```json
{
  "reachable": true,
  "browserReady": true,
  "endpointHost": "browser-worker-production.up.railway.app"
}
```

### 5. Manuel scrape testi

```bash
curl -X POST https://browser-worker-domain.com/scrape/trendyol \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://www.trendyol.com/thmany/fresh-keten-regular-erkek-gomlek-p-1142528932?boutiqueId=61&merchantId=367852\"}"
```

Scraper UI'dan aynı URL'yi **yeniden çekin** (eski cache değil).

## Test ürünleri

| Ürün | Beklenti |
|------|----------|
| THMANY gömlek | Çoklu renk/beden |
| Valiberta gömlek | 3+ renk, 5+ beden |

Log:

```text
✅ Browser Worker başarılı
✅ Varyant zenginleştirme: X renk, Y beden
```

## Sorun giderme

| Belirti | Kategori | Çözüm |
|---------|----------|--------|
| `token uyuşmuyor` | auth | `BROWSER_WORKER_TOKEN` ana app = worker |
| `DNS çözümlenemiyor` | dns | Worker URL güncel mi, redeploy |
| `yanıt vermiyor` | timeout | Worker RAM/CPU, Playwright image |
| `port kapalı` | connection | Worker servisi çalışıyor mu |
| `browserReady=false` | unknown | Worker logları, Chromium başlatma |
| Fiyat var, 0 varyant | partial | Worker health + yeniden scrape |

## Yerel geliştirme

```bash
cd browser-worker
npm install
npx playwright install chromium
export BROWSER_WORKER_TOKEN=dev-token
npm run dev
```

Ana uygulama `.env`:

```env
BROWSER_WORKER_ENDPOINT=http://localhost:8080
BROWSER_WORKER_TOKEN=dev-token
```

Root:

```bash
npm run browser-worker:dev
```
