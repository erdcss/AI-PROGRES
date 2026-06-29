# Local Agent + Railway (Trendyol scraper)

> **Not:** Bu yöntem geçici/geliştirme çözümüdür. Production için [Browser Worker](browser-worker-deploy.md) önerilir (`BROWSER_WORKER_ENDPOINT`).

Railway üzerinde Trendyol scraper, renk/beden gibi HTML tabanlı veriler için **Windows PC'nizde çalışan Local Agent**'a ihtiyaç duyar. Agent kapalıysa veya Cloudflare Tunnel adresi güncel değilse fiyat/görsel gelebilir ancak varyantlar eksik kalır.

Doğrulama: `GET /api/local-agent/health` — `reachable: true` olmalı.

Eski önbellekli scrape sonuçları yerine ürünü **yeniden çekin** (aynı URL ile tekrar scrape).

## 1. Windows'ta Local Agent başlatma

PowerShell:

```powershell
cd "C:\Users\Win\Desktop\AI-PROGRES-new"
$env:LOCAL_AGENT_TOKEN="Railwaydeki_INTERNAL_LOCAL_AGENT_TOKEN_ile_aynı_token"
npm run agent
```

Beklenen çıktı:

```text
Local Scrape Agent running on http://localhost:3847
   GET  /health
   POST /scrape  (header: x-agent-token)
```

Port doluysa:

```powershell
netstat -ano | findstr :3847
taskkill /PID BURAYA_PID_YAZ /F
npm run agent
```

## 2. Cloudflare Tunnel başlatma

Ayrı bir PowerShell penceresinde:

```powershell
cloudflared tunnel --url http://localhost:3847
```

Çıkan URL örneği:

```text
https://xxxxx.trycloudflare.com
```

**Önemli:** Tunnel her kapanıp açıldığında bu adres değişir. Railway'deki `INTERNAL_LOCAL_AGENT_ENDPOINT` değerini güncelleyip redeploy edin.

## 3. Railway değişkenleri

Railway → **Variables**:

```env
INTERNAL_LOCAL_AGENT_ENDPOINT=https://xxxxx.trycloudflare.com
INTERNAL_LOCAL_AGENT_TOKEN=aynı-token
```

Sonra:

```text
Railway → Deployments → Redeploy
```

## 4. Doğrulama

### Health endpoint

Tarayıcı veya curl:

```text
GET https://SIZIN-RAILWAY-APP/api/local-agent/health
```

Beklenen (örnek):

```json
{
  "enabled": true,
  "endpointConfigured": true,
  "endpointHost": "xxxxx.trycloudflare.com",
  "tokenConfigured": true,
  "reachable": true,
  "latencyMs": 123,
  "error": null,
  "errorCategory": null
}
```

`reachable: false` ise `error` alanı nedeni açıklar (DNS, timeout, token, bağlantı).

### Scraper logları (Railway)

Başarılı agent:

```text
✅ Local Agent başarılı
✅ Varyant zenginleştirme: X renk, Y beden
```

Agent kapalı / eski tunnel:

```text
[LocalAgent] request failed category: dns
⚠️ Trendyol varyant sonucu eksik olabilir: Local Agent/HTML yok, API kısmi yanıt verdi.
```

### UI

Scraper sayfasında sarı uyarı:

> Local Agent bağlantısı kurulamadığı için Trendyol HTML verisi alınamadı. Renk/beden bilgisi eksik olabilir…

## 5. Test ürünleri

Tunnel ve agent güncel olduktan sonra aynı URL'yi **yeniden scrape** edin:

- THMANY: `https://www.trendyol.com/thmany/fresh-keten-regular-erkek-gomlek-p-1142528932?boutiqueId=61&merchantId=367852`
- Valiberta (çoklu renk): `https://www.trendyol.com/valiberta/...` (3+ renk beklenir)

## Sorun giderme

| Belirti | Olası neden | Çözüm |
|--------|-------------|--------|
| `ENOTFOUND ...trycloudflare.com` | Eski tunnel URL | Yeni tunnel URL → Railway env → redeploy |
| `token uyuşmuyor` | Token farklı | `LOCAL_AGENT_TOKEN` = `INTERNAL_LOCAL_AGENT_TOKEN` |
| `connection refused` | Agent kapalı | `npm run agent` |
| Fiyat var, 0 varyant | Agent/HTML yok | Tunnel + agent + yeniden scrape |

Daha fazla ayrıntı: [LOCAL_AGENT.md](../LOCAL_AGENT.md)
