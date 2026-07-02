# Shopify Bağlantı ve Token Sistemi

Tüm Shopify Admin API istekleri `server/shopify-token-manager.ts` üzerinden gider.

## Ortam değişkenleri

```env
SHOPIFY_SHOP_DOMAIN=magaza.myshopify.com
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=shpsec_...
```

Opsiyonel manuel token:

```env
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
```

## Manuel test

Sunucu çalışırken:

```powershell
curl.exe -i http://localhost:5000/api/shopify/health

curl.exe -i -X POST http://localhost:5000/api/shopify/connection-test `
  -H "Content-Type: application/json" `
  -d "{}"
```

veya:

```powershell
npm run shopify:health
npm run shopify:connection-test
```

## Token akışı

1. `getValidShopifyAccessToken()` — cache → env token → DB token → `client_credentials`
2. Token süresi dolmadan 1 saat önce cache geçersiz sayılır
3. `shopifyAdminFetch()` 401 alırsa cache temizlenir, yeni token alınır, istek 1 kez tekrarlanır
4. Health ve connection-test `/shop.json` + `/admin/oauth/access_scopes.json` kontrol eder

## Sorun giderme

| Belirti | Çözüm |
|--------|--------|
| HTTP 402 / Unavailable Shop | Uygulamayı mağazaya yükleyin, planı kontrol edin |
| `shpss_` secret | `SHOPIFY_CLIENT_SECRET` (shpsec_) kullanın |
| `write_products eksik` | Dev Dashboard → API scopes |
