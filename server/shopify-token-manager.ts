import { db } from './db';
import { shopifyCredentials } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';
import {
  envShopDomain,
  getShopifyClientCredentials,
  normalizeShopDomain,
  resolveClientIdSource,
  resolveClientSecretSource,
} from './shopify-credentials';

export type ShopifyTokenSource =
  | 'env'
  | 'client_credentials'
  | 'cache'
  | 'db'
  | 'missing';

const SHOPIFY_API_VERSION = '2024-01';
const REFRESH_BUFFER_MS = 60 * 60 * 1000;
const DEFAULT_LIFETIME_MS = 23 * 60 * 60 * 1000;

interface TokenCacheEntry {
  accessToken: string;
  shopDomain: string;
  source: ShopifyTokenSource;
  expiresAt: number;
}

let tokenCache: TokenCacheEntry | null = null;
let refreshInFlight: Promise<TokenCacheEntry> | null = null;

function isDeprecatedToken(token: string): boolean {
  return token.startsWith('shpss_');
}

function cacheIsValid(): boolean {
  if (!tokenCache) return false;
  return tokenCache.expiresAt - Date.now() > REFRESH_BUFFER_MS;
}

export function setShopifyTokenCache(input: {
  accessToken: string;
  shopDomain: string;
  source: ShopifyTokenSource;
  expiresAt?: number;
  expiresInSeconds?: number;
}): void {
  const expiresAt =
    input.expiresAt ??
    Date.now() +
      (input.expiresInSeconds && input.expiresInSeconds > 0
        ? input.expiresInSeconds * 1000
        : DEFAULT_LIFETIME_MS);

  tokenCache = {
    accessToken: input.accessToken,
    shopDomain: normalizeShopDomain(input.shopDomain),
    source: input.source,
    expiresAt,
  };

  console.log('[SHOPIFY_TOKEN] refreshed', {
    source: input.source,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

export function invalidateShopifyTokenCache(): void {
  tokenCache = null;
}

async function probeShopToken(shopDomain: string, accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function readDbToken(shopDomain: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.isActive, true))
      .orderBy(desc(shopifyCredentials.updatedAt))
      .limit(1);

    const cred = rows[0];
    if (!cred?.accessToken || isDeprecatedToken(cred.accessToken)) return null;
    const domain = normalizeShopDomain(cred.shopDomain || shopDomain);
    if (await probeShopToken(domain, cred.accessToken)) {
      return cred.accessToken;
    }
    return null;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== '42P01') {
      console.warn('[SHOPIFY_TOKEN] DB token read failed:', err);
    }
    return null;
  }
}

async function exchangeClientCredentialsToken(
  shopDomain: string,
): Promise<{ accessToken: string; expiresInSeconds?: number } | null> {
  const creds = getShopifyClientCredentials();
  if (!creds) return null;

  const domain = normalizeShopDomain(shopDomain || creds.shopDomain);
  if (!domain.includes('.myshopify.com')) {
    console.warn(`[SHOPIFY_TOKEN] Invalid shop domain for client_credentials: ${domain}`);
    return null;
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== 'string') {
    console.warn('[SHOPIFY_TOKEN] client_credentials failed', {
      status: response.status,
      error: data.error_description || data.error || response.statusText,
    });
    return null;
  }

  const expiresInSeconds =
    typeof data.expires_in === 'number'
      ? data.expires_in
      : typeof data.expires_in === 'string'
        ? Number.parseInt(data.expires_in, 10)
        : undefined;

  return {
    accessToken: data.access_token,
    expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : undefined,
  };
}

async function persistTokenToRuntime(
  shopDomain: string,
  accessToken: string,
  source: ShopifyTokenSource,
  expiresInSeconds?: number,
): Promise<void> {
  setShopifyTokenCache({
    accessToken,
    shopDomain,
    source,
    expiresInSeconds,
  });

  process.env.SHOPIFY_ACCESS_TOKEN = accessToken;
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = accessToken;

  try {
    const { saveDirectAccessToken } = await import('./shopify-credentials');
    await saveDirectAccessToken(shopDomain, accessToken);
  } catch (err: unknown) {
    console.warn(
      '[SHOPIFY_TOKEN] DB persist skipped:',
      err instanceof Error ? err.message : err,
    );
  }

  try {
    const { invalidateShopifyCredentialCache } = await import('./shopify-api-service');
    invalidateShopifyCredentialCache();
  } catch {
    /* optional */
  }
}

async function acquireFreshToken(forceRefresh = false): Promise<TokenCacheEntry> {
  const shopDomain = envShopDomain();
  if (!shopDomain) {
    throw new Error(
      'Shopify mağaza domain bulunamadı — SHOPIFY_SHOP_DOMAIN / SHOPIFY_STORE_DOMAIN / SHOPIFY_STORE_URL tanımlayın',
    );
  }

  const normalizedDomain = normalizeShopDomain(shopDomain);

  if (!forceRefresh) {
    const envCandidates: Array<{ token?: string; source: ShopifyTokenSource }> = [
      { token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN, source: 'env' },
      { token: process.env.SHOPIFY_ACCESS_TOKEN, source: 'env' },
    ];

    for (const candidate of envCandidates) {
      const token = candidate.token?.trim();
      if (!token || isDeprecatedToken(token)) continue;
      if (await probeShopToken(normalizedDomain, token)) {
        await persistTokenToRuntime(normalizedDomain, token, candidate.source);
        return tokenCache!;
      }
    }

    const dbToken = await readDbToken(normalizedDomain);
    if (dbToken) {
      await persistTokenToRuntime(normalizedDomain, dbToken, 'db');
      return tokenCache!;
    }
  }

  const exchanged = await exchangeClientCredentialsToken(normalizedDomain);
  if (!exchanged) {
    throw new Error(
      'Shopify access token alınamadı — SHOPIFY_API_KEY + SHOPIFY_APP_SHARED_SECRET ve *.myshopify.com domain kontrol edin',
    );
  }

  await persistTokenToRuntime(
    normalizedDomain,
    exchanged.accessToken,
    'client_credentials',
    exchanged.expiresInSeconds,
  );
  return tokenCache!;
}

/** Tek merkezi token resolver — cache, env (opsiyonel), DB, client_credentials */
export async function getValidShopifyAccessToken(options: {
  forceRefresh?: boolean;
} = {}): Promise<{
  accessToken: string;
  shopDomain: string;
  source: ShopifyTokenSource;
  expiresAt: number;
}> {
  if (!options.forceRefresh && cacheIsValid() && tokenCache) {
    return {
      accessToken: tokenCache.accessToken,
      shopDomain: tokenCache.shopDomain,
      source: 'cache',
      expiresAt: tokenCache.expiresAt,
    };
  }

  if (refreshInFlight && !options.forceRefresh) {
    const entry = await refreshInFlight;
    return {
      accessToken: entry.accessToken,
      shopDomain: entry.shopDomain,
      source: entry.source,
      expiresAt: entry.expiresAt,
    };
  }

  refreshInFlight = acquireFreshToken(options.forceRefresh === true);
  try {
    const entry = await refreshInFlight;
    return {
      accessToken: entry.accessToken,
      shopDomain: entry.shopDomain,
      source: entry.source,
      expiresAt: entry.expiresAt,
    };
  } finally {
    refreshInFlight = null;
  }
}

export async function shopifyAdminFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<{ response: Response; shopDomain: string; tokenSource: ShopifyTokenSource }> {
  const token = await getValidShopifyAccessToken({ forceRefresh: retried });
  const url = path.startsWith('http')
    ? path
    : `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
      'X-Shopify-Access-Token': token.accessToken,
    },
  });

  if (response.status === 401 && !retried) {
    invalidateShopifyTokenCache();
    return shopifyAdminFetch(path, init, true);
  }

  return {
    response,
    shopDomain: token.shopDomain,
    tokenSource: token.source,
  };
}

export function hasEnvAccessToken(): boolean {
  const candidates = [
    process.env.SHOPIFY_ACCESS_TOKEN,
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  ];
  return candidates.some((token) => Boolean(token?.trim()) && !isDeprecatedToken(token!.trim()));
}

export function hasClientCredentialsConfigured(): boolean {
  return Boolean(getShopifyClientCredentials());
}

export async function getShopifyHealthResponse(): Promise<{
  ok: boolean;
  shopDomain: string;
  hasEnvAccessToken: boolean;
  hasClientCredentials: boolean;
  clientIdSource: ReturnType<typeof resolveClientIdSource>;
  clientSecretSource: ReturnType<typeof resolveClientSecretSource>;
  tokenSource: ShopifyTokenSource;
  canCreateProducts: boolean;
  error?: string;
}> {
  const shopDomain = envShopDomain();
  const hasClientCredentials = hasClientCredentialsConfigured();
  const clientIdSource = resolveClientIdSource();
  const clientSecretSource = resolveClientSecretSource();

  if (!shopDomain) {
    return {
      ok: false,
      shopDomain: '',
      hasEnvAccessToken: hasEnvAccessToken(),
      hasClientCredentials,
      clientIdSource,
      clientSecretSource,
      tokenSource: 'missing',
      canCreateProducts: false,
      error: 'Shopify mağaza domain tanımlı değil',
    };
  }

  try {
    const token = await getValidShopifyAccessToken();
    const probe = await fetch(
      `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': token.accessToken,
          'Content-Type': 'application/json',
        },
      },
    );

    const canCreateProducts = probe.status === 200;

    return {
      ok: canCreateProducts,
      shopDomain: token.shopDomain,
      hasEnvAccessToken: hasEnvAccessToken(),
      hasClientCredentials,
      clientIdSource,
      clientSecretSource,
      tokenSource: token.source,
      canCreateProducts,
      error: canCreateProducts
        ? undefined
        : probe.status === 401
          ? 'Token geçersiz veya süresi dolmuş'
          : probe.status === 403
            ? 'Yetki/scope eksik — write_products iznini kontrol edin'
            : `Shopify API yanıtı: HTTP ${probe.status}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      shopDomain: normalizeShopDomain(shopDomain),
      hasEnvAccessToken: hasEnvAccessToken(),
      hasClientCredentials,
      clientIdSource,
      clientSecretSource,
      tokenSource: 'missing',
      canCreateProducts: false,
      error: err instanceof Error ? err.message : 'Shopify token resolver hatası',
    };
  }
}
