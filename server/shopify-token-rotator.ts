/**
 * Shopify Token Auto-Rotator
 *
 * Shopify shpat tokenlerini otomatik yeniler.
 * İki yöntem:
 *   1. GraphQL tokenRotate mutasyonu (Partner Dashboard'da etkinleştirilmişse)
 *   2. SHOPIFY_API_KEY + SHOPIFY_APP_SHARED_SECRET ile Offline Access Token isteği
 *
 * Her 23 saatte bir çalışır; 401 alındığında da tetiklenir.
 */

import { getShopifyConfig, saveDirectAccessToken } from './shopify-credentials';

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // Shopify 24 saat verir
const REFRESH_BEFORE_MS  = 60 * 60 * 1000;      // Süresi dolmadan 1 saat önce yenile
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // Her 12 saatte bir yenile

let lastRefreshTime = 0;    // Unix timestamp (ms) — en son başarılı yenileme
let isRefreshing = false;   // Paralel istekleri engelle
let autoRefreshTimer: NodeJS.Timeout | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Token süresi dolmak üzereyse veya 401 alındıysa yeniler.
 * Çağrıyı BEKLEMEZ — arka planda çalışır.
 */
export function autoRefreshIfNeeded(force = false): void {
  const now = Date.now();
  const needsRefresh = force || (now - lastRefreshTime >= REFRESH_INTERVAL_MS);
  if (!needsRefresh || isRefreshing) return;
  rotateShopifyToken().catch(err =>
    console.error('❌ SHOPIFY TOKEN: Auto-refresh failed:', err.message)
  );
}

/**
 * 12 saatte bir otomatik token yenileme döngüsü başlatır.
 * Server başlangıcında bir kez çağrılmalı.
 * Bir önceki yenileme tamamlanmadan yeni döngü başlamaz (recursive setTimeout).
 */
export function startShopifyTokenAutoRefresh(): void {
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  console.log(`🔑 SHOPIFY TOKEN: Otomatik yenileme başlatıldı (her ${REFRESH_INTERVAL_MS / 3600000} saatte bir)`);

  const runCycle = async () => {
    console.log('🔄 SHOPIFY TOKEN: 12 saatlik yenileme döngüsü başlıyor...');
    const result = await rotateShopifyToken();
    if (result.success) {
      console.log(`✅ SHOPIFY TOKEN: Yenilendi (yöntem: ${result.method})`);
    } else {
      console.warn(`⚠️ SHOPIFY TOKEN: Yenileme başarısız — ${result.error}`);
      console.warn('⚠️ SHOPIFY TOKEN: Mevcut token kullanılmaya devam edecek');
    }
    // Yenileme tamamlandıktan sonra bir sonraki döngüyü planla
    autoRefreshTimer = setTimeout(runCycle, REFRESH_INTERVAL_MS);
  };

  // İlk çalışma: 30 saniye sonra (server tam ayağa kalksın)
  autoRefreshTimer = setTimeout(runCycle, 30 * 1000);
}

/**
 * Token'ı hemen yenile.
 * Önce GraphQL tokenRotate → başarısız olursa SHOPIFY_APP_SHARED_SECRET yöntemi.
 */
export async function rotateShopifyToken(): Promise<{
  success: boolean;
  newToken?: string;
  method?: string;
  error?: string;
}> {
  if (isRefreshing) {
    return { success: false, error: 'Token rotation already in progress' };
  }

  isRefreshing = true;
  console.log('🔄 SHOPIFY TOKEN ROTATOR: Yenileme başlatılıyor...');

  try {
    const config = await getShopifyConfig();
    if (!config) {
      return { success: false, error: 'Shopify yapılandırması bulunamadı' };
    }

    // ── Yöntem 1: GraphQL tokenRotate mutasyonu ─────────────────────────────
    const gql = await tryGraphQLRotation(config.shopDomain, config.accessToken);
    if (gql.success && gql.newToken) {
      await saveDirectAccessToken(config.shopDomain, gql.newToken);
      lastRefreshTime = Date.now();
      console.log('✅ SHOPIFY TOKEN: GraphQL tokenRotate ile yenilendi');
      return { success: true, newToken: gql.newToken, method: 'graphql-tokenRotate' };
    }
    console.log(`⚠️ SHOPIFY TOKEN: GraphQL yöntemi başarısız (${gql.error}), kimlik bilgileri deneniyor...`);

    // ── Yöntem 2: API Key + Shared Secret ile Offline Token ──────────────────
    const cred = await trySharedSecretExchange(config.shopDomain);
    if (cred.success && cred.newToken) {
      await saveDirectAccessToken(config.shopDomain, cred.newToken);
      lastRefreshTime = Date.now();
      console.log('✅ SHOPIFY TOKEN: Shared Secret yöntemi ile yenilendi');
      return { success: true, newToken: cred.newToken, method: 'shared-secret-exchange' };
    }
    console.log(`⚠️ SHOPIFY TOKEN: Shared Secret yöntemi de başarısız (${cred.error})`);

    // ── Yöntem 3: ENV yedek token doğrulama ──────────────────────────────────
    const fallback = await tryEnvFallbackToken(config.shopDomain);
    if (fallback.success && fallback.newToken) {
      await saveDirectAccessToken(config.shopDomain, fallback.newToken);
      lastRefreshTime = Date.now();
      console.log('✅ SHOPIFY TOKEN: ENV yedek token aktif edildi');
      return { success: true, newToken: fallback.newToken, method: 'env-fallback' };
    }

    return {
      success: false,
      error: `Tüm yöntemler başarısız. GraphQL: ${gql.error} | SharedSecret: ${cred.error} | EnvFallback: ${fallback.error}`
    };

  } catch (err: any) {
    console.error('❌ SHOPIFY TOKEN ROTATOR HATA:', err.message);
    return { success: false, error: err.message };
  } finally {
    isRefreshing = false;
  }
}

export function getTokenStatus(): {
  lastRefreshTime: number;
  nextRefreshTime: number;
  isRefreshing: boolean;
  msUntilRefresh: number;
} {
  const next = lastRefreshTime + REFRESH_INTERVAL_MS;
  return {
    lastRefreshTime,
    nextRefreshTime: next,
    isRefreshing,
    msUntilRefresh: Math.max(0, next - Date.now())
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE – token yenileme yöntemleri
// ─────────────────────────────────────────────────────────────────────────────

/** Shopify GraphQL tokenRotate mutasyonu (Partner Dashboard'da etkinleştirme gerekir) */
async function tryGraphQLRotation(
  shopDomain: string,
  currentToken: string
): Promise<{ success: boolean; newToken?: string; error?: string }> {
  try {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': currentToken
      },
      body: JSON.stringify({
        query: `mutation { tokenRotate { userErrors { field message } shopAccessToken } }`
      })
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    const result = data?.data?.tokenRotate;

    if (!result) {
      return { success: false, error: 'tokenRotate alanı yanıtta yok' };
    }

    if (result.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors.map((e: any) => e.message).join(', ')
      };
    }

    if (result.shopAccessToken) {
      return { success: true, newToken: result.shopAccessToken };
    }

    return { success: false, error: 'shopAccessToken yanıtta dönmedi' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * SHOPIFY_API_KEY + SHOPIFY_APP_SHARED_SECRET kullanarak
 * Offline Access Token isteği gönderir (Shopify OAuth offline flow).
 *
 * NOT: Bu yöntem yalnızca daha önce OAuth yetkilendirmesi yapılmış ve
 * `code` parametre olmaksızın exchange desteklenen uygulamalarda çalışır.
 * Standart Custom App tokenları (shpat_) bu akışı gerektirmez.
 */
async function trySharedSecretExchange(
  shopDomain: string
): Promise<{ success: boolean; newToken?: string; error?: string }> {
  const apiKey    = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_APP_SHARED_SECRET;

  if (!apiKey || !apiSecret) {
    return {
      success: false,
      error: 'SHOPIFY_API_KEY veya SHOPIFY_APP_SHARED_SECRET ayarlanmamış'
    };
  }

  try {
    // Shopify Admin OAuth — client_credentials tarzı token alma
    // (Shopify Partner apps için offline token exchange)
    const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        grant_type: 'client_credentials'
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${errBody}` };
    }

    const data = await res.json();
    if (data.access_token) {
      return { success: true, newToken: data.access_token };
    }

    return { success: false, error: JSON.stringify(data) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * ENV değişkenlerindeki yedek token'ları sırayla test eder.
 * Geçerli olan ilkini döndürür.
 */
async function tryEnvFallbackToken(
  shopDomain: string
): Promise<{ success: boolean; newToken?: string; error?: string }> {
  const candidates = [
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    process.env.SHOPIFY_ACCESS_TOKEN,
    process.env.SHOPIFY_APP_SECRET_NEW
  ].filter(Boolean) as string[];

  for (const token of candidates) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
        headers: { 'X-Shopify-Access-Token': token }
      });
      if (res.ok) {
        return { success: true, newToken: token };
      }
    } catch {}
  }

  return { success: false, error: 'Hiçbir ENV yedek token geçerli değil' };
}
