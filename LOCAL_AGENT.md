# Local Scrape Agent

Railway gibi bulut ortamları Trendyol'a doğrudan erişemeyebilir. **Local Scrape Agent**, kendi bilgisayarınızda çalışır, Trendyol ürününü yerel ağınızdan çeker ve normalize edilmiş veriyi Railway uygulamasına döndürür.

Kullanıcı arayüzünde ayar yoktur — yalnızca sunucu tarafı env değişkenleri kullanılır.

## Hızlı başlangıç (Windows)

### 1. Agent'ı başlatın

PowerShell:

```powershell
cd C:\Users\Win\Desktop\AI-PROGRES-new
$env:LOCAL_AGENT_TOKEN="gizli-token-buraya"
npm run agent
```

Başarılı çıktı:

```txt
Local Scrape Agent running on http://localhost:3847
   GET  /health
   POST /scrape  (header: x-agent-token)
```

Geliştirme (dosya değişince yeniden başlar):

```powershell
npm run agent:dev
```

### 2. Agent'ı dışarı açın (Railway için)

Railway, localhost'a erişemez. **Cloudflare Tunnel** veya **ngrok** ile agent'ı public URL'e açın.

**Cloudflare Tunnel örneği:**

```powershell
cloudflared tunnel --url http://localhost:3847
```

Çıkan URL örneği: `https://abc-xyz.trycloudflare.com`

### 3. Railway env ayarları

Railway proje değişkenleri:

| Değişken | Değer |
|----------|--------|
| `INTERNAL_LOCAL_AGENT_ENDPOINT` | `https://abc-xyz.trycloudflare.com` |
| `INTERNAL_LOCAL_AGENT_TOKEN` | Agent'taki `LOCAL_AGENT_TOKEN` ile **aynı** |

Deploy sonrası logda şunu görmelisiniz:

```txt
ℹ️ Kaynak erişim internal seed: primary=local_agent, providers=local_agent
ℹ️ Local Scrape Agent: erişilebilir
```

## Endpoint'ler

### `GET /health`

Token gerekmez. Basit sağlık kontrolü:

```json
{ "ok": true, "service": "local-scrape-agent", "version": "1.0.0" }
```

### `POST /scrape`

Header:

```
x-agent-token: <LOCAL_AGENT_TOKEN>
Content-Type: application/json
```

Body:

```json
{ "url": "https://www.trendyol.com/..." }
```

Yanlış token → `401 Unauthorized`

## Güvenlik

- `LOCAL_AGENT_TOKEN` olmadan agent başlamaz.
- Token Railway'de `INTERNAL_LOCAL_AGENT_TOKEN` olarak saklanır; frontend'e dönmez.
- Sahte 100 TL, `title=trendyol.com`, bot sayfaları başarı sayılmaz.

## Admin test (Railway)

```bash
curl -X POST https://your-app.railway.app/api/source-access/self-test \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d '{"url":"https://www.trendyol.com/..."}'
```

Durum:

```bash
curl https://your-app.railway.app/api/source-access/status
```

## Sorun giderme

| Belirti | Çözüm |
|---------|--------|
| `primary=none, providers=none` | Railway'de `INTERNAL_LOCAL_AGENT_*` env eksik |
| `Local Scrape Agent: erişilemiyor` | Agent çalışmıyor veya tunnel kapalı |
| `local-agent-failed` | Token uyuşmuyor veya ürün verisi doğrulanamadı |
| `401` | `INTERNAL_LOCAL_AGENT_TOKEN` ≠ `LOCAL_AGENT_TOKEN` |

## Ortam değişkenleri

**Agent (yerel):**

| Değişken | Zorunlu | Varsayılan |
|----------|---------|------------|
| `LOCAL_AGENT_TOKEN` | Evet | — |
| `LOCAL_AGENT_PORT` | Hayır | `3847` |

**Railway:**

| Değişken | Zorunlu |
|----------|---------|
| `INTERNAL_LOCAL_AGENT_ENDPOINT` | Evet (agent kullanılacaksa) |
| `INTERNAL_LOCAL_AGENT_TOKEN` | Evet |
