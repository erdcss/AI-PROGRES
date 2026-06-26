/**
 * Shopify Token Auto-Rotator
 *
 * Shopify access token'ı otomatik yeniler (24 saat geçerlilik → 22 saatte bir yenile).
 * Öncelik sırası:
 *   1. client_credentials (client_id + client_secret — Postman ile aynı akış)
 *   2. GraphQL tokenRotate (mevcut token varsa)
 *   3. ENV yedek token doğrulama
 */

import {
  getShopifyClientCredentials,
  normalizeShopDomain,
  saveDirectAccessToken,
} from './shopify-credentials';

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 22 * 60 * 60 * 1000; // 22 saat (24 saatlik token süresinden önce)

let lastRefreshTime = 0;
let isRefreshing = false;
let autoRefreshTimer: NodeJS.Timeout | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function autoRefreshIfNeeded(force = false): void {
  const now = Date.now();
  const needsRefresh = force || lastRefreshTime === 0 || now - lastRefreshTime >= REFRESH_INTERVAL_MS;
  if (!needsRefresh || isRefreshing) return;
  rotateShopifyToken().catch((err) =>
    console.error('❌ SHOPIFY TOKEN: Auto-refresh failed:', err.message)
  );
}

/**
 * 22 saatte bir otomatik token yenileme. Sunucu başlangıcında bir kez çağrılmalı.
 * İlk çalışma: client credentials varsa hemen token alır.
 */
export function startShopifyTokenAutoRefresh(): void {
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  const hours = REFRESH_INTERVAL_MS / 3600000;
  console.log(`🔑 SHOPIFY TOKEN: Otomatik yenileme başlatıldı (her ${hours} saatte bir)`);

  const runCycle = async () => {
    console.log('🔄 SHOPIFY TOKEN: Yenileme döngüsü başlıyor...');
    const result = await rotateShopifyToken();
    if (result.success) {
      console.log(`✅ SHOPIFY TOKEN: Yenilendi (yöntem: ${result.method})`);
    } else {
      console.warn(`⚠️ SHOPIFY TOKEN: Yenileme başarısız — ${result.error}`);
      console.warn('⚠️ SHOPIFY TOKEN: Mevcut token kullanılmaya devam edecek');
    }
    autoRefreshTimer = setTimeout(runCycle, REFRESH_INTERVAL_MS);
  };

  const creds = getShopifyClientCredentials();
  if (creds) {
    console.log(`🔑 SHOPIFY TOKEN: Client credentials bulundu (${creds.shopDomain}) — ilk token alınıyor...`);
    setTimeout(runCycle, 5 * 1000);
  } else {
    autoRefreshTimer = setTimeout(runCycle, 30 * 1000);
  }
}

/**
 * Postman client_credentials akışı — resolve döngüsü olmadan doğrudan token alır.
 */
export async function fetchAccessTokenViaClientCredentials(): Promise<string | null> {
  const creds = getShopifyClientCredentials();
  if (!creds) return null;
  const domain = normalizeShopDomain(creds.shopDomain);
  const result = await tryClientCredentialsExchange(domain);
  if (result.success && result.newToken) {
    await persistToken(domain, result.newToken);
    return result.newToken;
  }
  console.warn('client_credentials başarısız:', result.error);
  return null;
}

/**
 * Token'ı hemen yenile.
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
    const creds = getShopifyClientCredentials();
    const envToken =
      process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
    const shopDomain =
      normalizeShopDomain(
        process.env.SHOPIFY_SHOP_DOMAIN ||
          process.env.SHOPIFY_STORE_URL ||
          process.env.SHOPIFY_STORE_DOMAIN ||
          ''
      ) ||
      creds?.shopDomain ||
      '';

    if (!shopDomain) {
      return { success: false, error: 'Shopify mağaza domain bulunamadı (SHOPIFY_SHOP_DOMAIN)' };
    }

    // ── Yöntem 1: client_credentials (Postman akışı) ─────────────────────────
    const clientCred = await tryClientCredentialsExchange(shopDomain);
    if (clientCred.success && clientCred.newToken) {
      await persistToken(shopDomain, clientCred.newToken);
      console.log('✅ SHOPIFY TOKEN: client_credentials ile alındı');
      return { success: true, newToken: clientCred.newToken, method: 'client_credentials' };
    }
    if (creds) {
      console.log(`⚠️ SHOPIFY TOKEN: client_credentials başarısız (${clientCred.error})`);
    }

    // ── Yöntem 2: GraphQL tokenRotate ────────────────────────────────────────
    if (envToken && !envToken.startsWith('shpss_')) {
      const gql = await tryGraphQLRotation(shopDomain, envToken);
      if (gql.success && gql.newToken) {
        await persistToken(shopDomain, gql.newToken);
        console.log('✅ SHOPIFY TOKEN: GraphQL tokenRotate ile yenilendi');
        return { success: true, newToken: gql.newToken, method: 'graphql-tokenRotate' };
      }
      console.log(`⚠️ SHOPIFY TOKEN: GraphQL yöntemi başarısız (${gql.error})`);
    }

    // ── Yöntem 3: ENV yedek token ──────────────────────────────────────────
    const fallback = await tryEnvFallbackToken(shopDomain);
    if (fallback.success && fallback.newToken) {
      await persistToken(shopDomain, fallback.newToken);
      console.log('✅ SHOPIFY TOKEN: ENV yedek token aktif edildi');
      return { success: true, newToken: fallback.newToken, method: 'env-fallback' };
    }

    return {
      success: false,
      error: `Tüm yöntemler başarısız. ClientCredentials: ${clientCred.error} | EnvFallback: ${fallback.error}`,
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
  refreshIntervalHours: number;
  hasClientCredentials: boolean;
} {
  const next = lastRefreshTime > 0 ? lastRefreshTime + REFRESH_INTERVAL_MS : 0;
  return {
    lastRefreshTime,
    nextRefreshTime: next,
    isRefreshing,
    msUntilRefresh: next > 0 ? Math.max(0, next - Date.now()) : 0,
    refreshIntervalHours: REFRESH_INTERVAL_MS / 3600000,
    hasClientCredentials: !!getShopifyClientCredentials(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE
// ─────────────────────────────────────────────────────────────────────────────

async function persistToken(shopDomain: string, accessToken: string): Promise<void> {
  process.env.SHOPIFY_ACCESS_TOKEN = accessToken;
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = accessToken;
  lastRefreshTime = Date.now();
  try {
    const { invalidateShopifyCredentialCache } = await import('./shopify-api-service');
    invalidateShopifyCredentialCache();
  } catch {
    /* optional */
  }
  try {
    await saveDirectAccessToken(shopDomain, accessToken);
  } catch (err: any) {
    console.warn(`⚠️ SHOPIFY TOKEN: DB kaydı başarısız (${err.message}) — ENV'de token aktif`);
  }
}

/**
 * POST /admin/oauth/access_token
 * Body: client_id, client_secret, grant_type=client_credentials
 */
async function tryClientCredentialsExchange(
  shopDomain: string
): Promise<{ success: boolean; newToken?: string; error?: string }> {
  const creds = getShopifyClientCredentials();
  if (!creds) {
    return {
      success: false,
      error: 'SHOPIFY_CLIENT_ID / secret_key (veya SHOPIFY_CLIENT_SECRET) ayarlanmamış',
    };
  }

  const domain = normalizeShopDomain(shopDomain || creds.shopDomain);
  if (!domain.includes('.myshopify.com')) {
    return {
      success: false,
      error: `Geçersiz shop domain: "${domain}" — *.myshopify.com olmalı (örn. rmwtdn-dj.myshopify.com)`,
    };
  }

  try {
    const body = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'client_credentials',
    });

    const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, string>;

    if (!res.ok) {
      return {
        success: false,
        error: data.error_description || data.error || `HTTP ${res.status}`,
      };
    }

    if (data.access_token) {
      return { success: true, newToken: data.access_token };
    }

    return { success: false, error: 'access_token yanıtta dönmedi' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function tryGraphQLRotation(
  shopDomain: string,
  currentToken: string
): Promise<{ success: boolean; newToken?: string; error?: string }> {
  try {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': currentToken,
      },
      body: JSON.stringify({
        query: `mutation { tokenRotate { userErrors { field message } shopAccessToken } }`,
      }),
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
        error: result.userErrors.map((e: any) => e.message).join(', '),
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

async function tryEnvFallbackToken(
  shopDomain: string
): Promise<{ success: boolean; newToken?: string; error?: string }> {
  const candidates = [
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    process.env.SHOPIFY_ACCESS_TOKEN,
    process.env.SHOPIFY_APP_SECRET_NEW,
  ].filter((t) => t && !t.startsWith('shpss_')) as string[];

  for (const token of candidates) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
        headers: { 'X-Shopify-Access-Token': token },
      });
      if (res.ok) {
        return { success: true, newToken: token };
      }
    } catch {
      /* next */
    }
  }

  return { success: false, error: 'Hiçbir ENV yedek token geçerli değil' };
}
