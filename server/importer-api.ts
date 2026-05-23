/**
 * Replit Importer API
 * POST /api/import  → CSV yükle, Shopify'a create/update et
 * GET  /api/health  → Servis canlılık kontrolü
 *
 * Güvenlik: IMPORT_KEY header veya query param ile kimlik doğrulama
 * Token:    Shopify access token otomatik doğrulama + yenileme
 */

import { Request, Response, NextFunction, Router } from 'express';
import { parse } from 'csv-parse/sync';
import { getShopifyConfig, saveShopifyAccessToken } from './shopify-credentials';
import { uploadProductToShopify } from './shopify-api-uploader';
import { rotateShopifyToken } from './shopify-token-rotator';

const router = Router();

// ── Token yönetimi ────────────────────────────────────────────────────────────

interface TokenStatus {
  valid: boolean;
  shopDomain?: string;
  lastChecked: Date;
  expiresAt?: Date;    // Shopify token süresi dolmuyor ama yine de takip edelim
  checkCount: number;
}

let tokenStatus: TokenStatus = {
  valid: false,
  lastChecked: new Date(0),
  checkCount: 0,
};

const TOKEN_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 dakikada bir kontrol

/**
 * Shopify token'ının geçerliliğini test eder.
 * 5 dakikada bir otomatik olarak çağrılır.
 */
async function validateShopifyToken(): Promise<boolean> {
  try {
    const config = await getShopifyConfig();
    if (!config) {
      tokenStatus = { ...tokenStatus, valid: false, lastChecked: new Date() };
      return false;
    }

    const res = await fetch(
      `https://${config.shopDomain}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': config.accessToken,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const isValid = res.status === 200;
    tokenStatus = {
      valid: isValid,
      shopDomain: config.shopDomain,
      lastChecked: new Date(),
      checkCount: tokenStatus.checkCount + 1,
    };
    if (isValid) {
      console.log(`✅ [Importer] Shopify token geçerli: ${config.shopDomain}`);
    } else {
      console.warn(`⚠️ [Importer] Shopify token geçersiz (${res.status}): ${config.shopDomain} — token yenileme tetikleniyor...`);
      rotateShopifyToken().then(result => {
        if (result.success) {
          console.log(`✅ [Importer] Token yenilendi (${result.method})`);
          tokenStatus.valid = true;
        } else {
          console.error(`❌ [Importer] Token yenileme başarısız: ${result.error}`);
        }
      }).catch(err => console.error('[Importer] Token yenileme hatası:', err));
    }
    return isValid;
  } catch (err) {
    console.error('[Importer] Token doğrulama hatası:', err);
    tokenStatus = { ...tokenStatus, valid: false, lastChecked: new Date() };
    return false;
  }
}

/** Token kontrol döngüsü – sunucu başlangıcında başlar */
export function startTokenRefreshScheduler(): void {
  console.log('🔑 [Importer] Token yenileme zamanlayıcısı başlatıldı');
  validateShopifyToken(); // hemen bir kere çalıştır
  setInterval(validateShopifyToken, TOKEN_CHECK_INTERVAL_MS);
}

// ── IMPORT_KEY middleware ─────────────────────────────────────────────────────

function requireImportKey(req: Request, res: Response, next: NextFunction): void {
  const importKey = process.env.IMPORT_KEY;
  if (!importKey) {
    res.status(503).json({ error: 'Sunucu IMPORT_KEY yapılandırılmamış.' });
    return;
  }

  // Header: Authorization: Bearer <key>  veya  X-Import-Key: <key>
  // Query:  ?key=<key>
  const provided =
    req.headers['x-import-key'] as string ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
    (req.query.key as string);

  if (!provided || provided !== importKey) {
    res.status(401).json({ error: 'Geçersiz veya eksik IMPORT_KEY.' });
    return;
  }
  next();
}

// ── GET /api/health ───────────────────────────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
  const shopifyOk = tokenStatus.valid;
  const shopifyConfig = await getShopifyConfig().catch(() => null);

  res.status(shopifyOk ? 200 : 503).json({
    status: shopifyOk ? 'ok' : 'degraded',
    service: 'Replit Importer API',
    shopify: {
      connected: shopifyOk,
      shopDomain: shopifyConfig?.shopDomain || tokenStatus.shopDomain || null,
      lastChecked: tokenStatus.lastChecked,
      checkCount: tokenStatus.checkCount,
    },
    importKey: !!process.env.IMPORT_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ── POST /api/import ──────────────────────────────────────────────────────────

interface ImportResult {
  success: boolean;
  productTitle?: string;
  productId?: string;
  message: string;
  variants?: any[];
}

router.post('/import', requireImportKey, async (req: Request, res: Response) => {
  try {
    const contentType = req.headers['content-type'] || '';

    let csvContent: string;
    let productTitle: string;

    // İki mod desteklenir:
    // 1. application/json  → { csv: "...", title: "..." }
    // 2. text/csv veya text/plain → ham CSV body, title header'dan gelir
    if (contentType.includes('application/json')) {
      const body = req.body as { csv?: string; title?: string };
      if (!body.csv) {
        res.status(400).json({ error: 'JSON body\'de "csv" alanı zorunludur.' });
        return;
      }
      csvContent = body.csv;
      productTitle = body.title || 'İçe Aktarılan Ürün';
    } else {
      // Raw CSV body
      csvContent = typeof req.body === 'string' ? req.body : req.body?.toString?.() || '';
      productTitle =
        (req.headers['x-product-title'] as string) ||
        (req.headers['x-title'] as string) ||
        'İçe Aktarılan Ürün';
    }

    if (!csvContent || csvContent.trim().length === 0) {
      res.status(400).json({ error: 'CSV içeriği boş.' });
      return;
    }

    // CSV formatını hızlıca doğrula
    let records: any[];
    try {
      records = parse(csvContent, { columns: true, skip_empty_lines: true });
    } catch (parseErr) {
      res.status(400).json({ error: `CSV parse hatası: ${parseErr}` });
      return;
    }

    if (!records.length) {
      res.status(400).json({ error: 'CSV\'de kayıt bulunamadı.' });
      return;
    }

    // Başlık CSV'den al (Handle sütunundan türet)
    const firstRow = records[0] as Record<string, string>;
    if (!productTitle || productTitle === 'İçe Aktarılan Ürün') {
      productTitle = firstRow['Title'] || firstRow['title'] || 'İçe Aktarılan Ürün';
    }

    console.log(`📥 [Importer] İçe aktarma başlıyor: "${productTitle}" (${records.length} satır)`);

    // Token geçerliyse devam et, değilse son bir kontrol yap
    if (!tokenStatus.valid) {
      const ok = await validateShopifyToken();
      if (!ok) {
        res.status(503).json({
          error: 'Shopify bağlantısı yok. Lütfen Shopify kimlik bilgilerini yapılandırın.',
        });
        return;
      }
    }

    // Shopify'a yükle
    const result = await uploadProductToShopify(csvContent, productTitle);

    const response: ImportResult = {
      success: result.success,
      productTitle,
      productId: result.productId,
      message: result.message,
      variants: result.variants,
    };

    console.log(
      result.success
        ? `✅ [Importer] Yükleme başarılı: ${productTitle} (ID: ${result.productId})`
        : `❌ [Importer] Yükleme başarısız: ${result.message}`
    );

    res.status(result.success ? 200 : 500).json(response);
  } catch (err: any) {
    console.error('[Importer] /import hatası:', err);
    res.status(500).json({ error: err.message || 'Beklenmeyen hata' });
  }
});

// ── POST /api/import/validate-token ──────────────────────────────────────────
// Zorla token doğrulama tetikler (IMPORT_KEY korumalı)

router.post('/import/validate-token', requireImportKey, async (_req: Request, res: Response) => {
  const valid = await validateShopifyToken();
  res.json({
    valid,
    shopDomain: tokenStatus.shopDomain,
    lastChecked: tokenStatus.lastChecked,
    checkCount: tokenStatus.checkCount,
  });
});

export { router as importerRouter };
