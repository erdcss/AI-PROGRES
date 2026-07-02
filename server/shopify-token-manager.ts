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
let lastSuccessfulRefreshAt = 0;
let lastRefreshError: string | null = null;

/** Token loglarda asla açık yazılmaz */
export function maskToken(token: string | null | undefined): string {
  if (!token || token.length < 9) return '****';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export async function parseShopifyAdminResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildAdminUrl(shopDomain: string, path: string, apiVersion = SHOPIFY_API_VERSION): string {
  if (path.startsWith('http')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.startsWith('/admin/oauth/')) {
    return `https://${shopDomain}${normalized}`;
  }
  return `https://${shopDomain}/admin/api/${apiVersion}${normalized}`;
}

export interface ShopifyScopeAnalysis {
  scopes: string[];
  scopesOk: boolean;
  canReadProducts: boolean;
  canWriteProducts: boolean;
  missingScopes: string[];
}

export function analyzeShopifyScopes(scopes: string[]): ShopifyScopeAnalysis {
  const normalized = scopes.map((s) => s.trim()).filter(Boolean);
  const canReadProducts = normalized.includes('read_products');
  const canWriteProducts = normalized.includes('write_products');
  const missingScopes: string[] = [];
  if (!canReadProducts) missingScopes.push('read_products');
  if (!canWriteProducts) missingScopes.push('write_products');
  return {
    scopes: normalized,
    scopesOk: canReadProducts && canWriteProducts,
    canReadProducts,
    canWriteProducts,
    missingScopes,
  };
}

export async function fetchShopifyAccessScopes(): Promise<ShopifyScopeAnalysis> {
  try {
    const { response } = await shopifyAdminFetch('/admin/oauth/access_scopes.json');
    if (!response.ok) {
      return analyzeShopifyScopes([]);
    }
    const body = (await parseShopifyAdminResponse(response)) as {
      access_scopes?: Array<{ handle?: string }>;
    } | null;
    const scopes = (body?.access_scopes || [])
      .map((s) => s.handle || '')
      .filter(Boolean);
    return analyzeShopifyScopes(scopes);
  } catch {
    return analyzeShopifyScopes([]);
  }
}

export function mapShopifyProbeError(status: number, bodyHint?: string): string {
  if (status === 401) return 'Token geçersiz veya süresi dolmuş';
  if (status === 403) {
    return 'Uygulama izinleri eksik — read_products ve write_products scope gerekli';
  }
  if (status === 402) {
    return (
      'Mağaza kullanılamıyor (HTTP 402) — Shopify planı ödenmemiş, mağaza donmuş, ' +
      'uygulama mağazaya yüklenmemiş veya yanlış *.myshopify.com domain kullanılıyor olabilir'
    );
  }
  if (status === 404) return 'Mağaza bulunamadı — SHOPIFY_SHOP_DOMAIN değerini kontrol edin';
  if (bodyHint) return bodyHint;
  return `Shopify API HTTP ${status}`;
}

function mapOAuthError(data: Record<string, unknown>, status: number): string {
  const raw = String(data.error_description || data.error || `HTTP ${status}`);
  const lower = raw.toLowerCase();
  if (lower.includes('unavailable') && lower.includes('shop')) {
    return (
      'Unavailable Shop — mağaza adresi hatalı, mağaza kapalı veya özel uygulama bu mağazaya ' +
      'yüklenmemiş. Dev Dashboard → uygulamayı hedef mağazaya kurun.'
    );
  }
  if (lower.includes('invalid') && lower.includes('client')) {
    return 'Geçersiz client_id/client_secret — Dev Dashboard Client Secret (shpsec_...) kullanın; shpss_ API secret değildir';
  }
  return raw;
}

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

  lastSuccessfulRefreshAt = Date.now();
  lastRefreshError = null;

  console.log('[SHOPIFY_TOKEN] refreshed', {
    source: input.source,
    expiresAt: new Date(expiresAt).toISOString(),
    token: maskToken(input.accessToken),
  });
}

export function invalidateShopifyTokenCache(): void {
  tokenCache = null;
}

async function probeShopToken(shopDomain: string, accessToken: string): Promise<{
  ok: boolean;
  status: number;
  hint?: string;
}> {
  try {
    const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 200) return { ok: true, status: 200 };
    const errBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const bodyHint =
      typeof errBody.errors === 'string'
        ? errBody.errors
        : Array.isArray(errBody.errors)
          ? errBody.errors.join(', ')
          : undefined;
    return {
      ok: false,
      status: response.status,
      hint: mapShopifyProbeError(response.status, bodyHint),
    };
  } catch {
    return { ok: false, status: 0, hint: 'Shopify API ağına ulaşılamadı' };
  }
}

async function readDbToken(shopDomain: string): Promise<string | null> {
  try {
    const normalizedTarget = normalizeShopDomain(shopDomain);
    const rows = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.isActive, true))
      .orderBy(desc(shopifyCredentials.updatedAt));

    const cred = rows.find((row) => normalizeShopDomain(row.shopDomain || '') === normalizedTarget);
    if (!cred?.accessToken || isDeprecatedToken(cred.accessToken)) return null;
    const domain = normalizeShopDomain(cred.shopDomain || shopDomain);
    const probe = await probeShopToken(domain, cred.accessToken);
    if (probe.ok) {
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
    const oauthError = mapOAuthError(data, response.status);
    lastRefreshError = oauthError;
    console.warn('[SHOPIFY_TOKEN] client_credentials failed', {
      status: response.status,
      error: oauthError,
    });
    return null;
  }

  const probe = await probeShopToken(domain, data.access_token);
  if (!probe.ok) {
    lastRefreshError = probe.hint || mapShopifyProbeError(probe.status);
    console.warn('[SHOPIFY_TOKEN] client_credentials token alındı ama shop.json doğrulanamadı', {
      status: probe.status,
      hint: probe.hint,
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
      const probe = await probeShopToken(normalizedDomain, token);
      if (probe.ok) {
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
    const hint =
      lastRefreshError ||
      'SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (Dev Dashboard shpsec_...) ve *.myshopify.com domain kontrol edin';
    throw new Error(`Shopify access token alınamadı veya doğrulanamadı — ${hint}`);
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
  apiVersion = SHOPIFY_API_VERSION,
): Promise<{ response: Response; shopDomain: string; tokenSource: ShopifyTokenSource }> {
  const token = await getValidShopifyAccessToken({ forceRefresh: retried });
  const url = buildAdminUrl(token.shopDomain, path, apiVersion);

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
    return shopifyAdminFetch(path, init, true, apiVersion);
  }

  return {
    response,
    shopDomain: token.shopDomain,
    tokenSource: token.source,
  };
}

export async function shopifyAdminGraphql<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
  retried = false,
  apiVersion = '2024-10',
): Promise<{
  response: Response;
  data: T | null;
  errors?: unknown;
  shopDomain: string;
  tokenSource: ShopifyTokenSource;
}> {
  const { response, shopDomain, tokenSource } = await shopifyAdminFetch(
    '/graphql.json',
    {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    },
    retried,
    apiVersion,
  );
  const parsed = (await parseShopifyAdminResponse(response)) as {
    data?: T;
    errors?: unknown;
  } | null;
  return {
    response,
    data: parsed?.data ?? null,
    errors: parsed?.errors,
    shopDomain,
    tokenSource,
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
  expiresAt: string | null;
  expiresInSeconds: number | null;
  scopesOk: boolean;
  scopes: string[];
  canReadProducts: boolean;
  canWriteProducts: boolean;
  canCreateProducts: boolean;
  error?: string;
}> {
  const shopDomain = envShopDomain();
  const hasClientCredentials = hasClientCredentialsConfigured();
  const clientIdSource = resolveClientIdSource();
  const clientSecretSource = resolveClientSecretSource();

  const baseFailure = {
    shopDomain: shopDomain ? normalizeShopDomain(shopDomain) : '',
    hasEnvAccessToken: hasEnvAccessToken(),
    hasClientCredentials,
    clientIdSource,
    clientSecretSource,
    tokenSource: 'missing' as ShopifyTokenSource,
    expiresAt: null as string | null,
    expiresInSeconds: null as number | null,
    scopesOk: false,
    scopes: [] as string[],
    canReadProducts: false,
    canWriteProducts: false,
    canCreateProducts: false,
  };

  if (!shopDomain) {
    return {
      ok: false,
      ...baseFailure,
      error: 'Shopify mağaza domain tanımlı değil (SHOPIFY_SHOP_DOMAIN)',
    };
  }

  try {
    const token = await getValidShopifyAccessToken();
    const expiresInSeconds = Math.max(0, Math.floor((token.expiresAt - Date.now()) / 1000));
    const { response: shopResponse } = await shopifyAdminFetch('/shop.json');
    const scopeInfo = await fetchShopifyAccessScopes();
    const shopOk = shopResponse.status === 200;
    const canCreateProducts = shopOk && scopeInfo.canWriteProducts;

    let error: string | undefined;
    if (!shopOk) {
      error = mapShopifyProbeError(shopResponse.status);
    } else if (!scopeInfo.scopesOk) {
      error =
        scopeInfo.missingScopes.length > 0
          ? `Eksik scope: ${scopeInfo.missingScopes.join(', ')}`
          : 'Scope bilgisi alınamadı';
    }

    return {
      ok: shopOk && scopeInfo.scopesOk,
      shopDomain: token.shopDomain,
      hasEnvAccessToken: hasEnvAccessToken(),
      hasClientCredentials,
      clientIdSource,
      clientSecretSource,
      tokenSource: token.source,
      expiresAt: new Date(token.expiresAt).toISOString(),
      expiresInSeconds,
      scopesOk: scopeInfo.scopesOk,
      scopes: scopeInfo.scopes,
      canReadProducts: scopeInfo.canReadProducts,
      canWriteProducts: scopeInfo.canWriteProducts,
      canCreateProducts,
      error,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      ...baseFailure,
      error: err instanceof Error ? err.message : 'Shopify token resolver hatası',
    };
  }
}

export function getTokenCacheStatus(): {
  cached: boolean;
  source: ShopifyTokenSource | null;
  shopDomain: string | null;
  expiresAt: number | null;
  expiresInMs: number | null;
  needsRefreshSoon: boolean;
} {
  if (!tokenCache) {
    return {
      cached: false,
      source: null,
      shopDomain: null,
      expiresAt: null,
      expiresInMs: null,
      needsRefreshSoon: true,
    };
  }
  const expiresInMs = tokenCache.expiresAt - Date.now();
  return {
    cached: true,
    source: tokenCache.source,
    shopDomain: tokenCache.shopDomain,
    expiresAt: tokenCache.expiresAt,
    expiresInMs,
    needsRefreshSoon: expiresInMs <= REFRESH_BUFFER_MS,
  };
}

export function getShopifyTokenLifecycleStatus(): {
  autoRefreshEnabled: boolean;
  lastRefreshTime: number;
  lastSuccessfulRefreshAt: number;
  isRefreshing: boolean;
  msUntilRefresh: number;
  hasClientCredentials: boolean;
  lastError: string | null;
  cache: ReturnType<typeof getTokenCacheStatus>;
} {
  const cache = getTokenCacheStatus();
  const msUntil =
    cache.expiresAt && cache.expiresAt > Date.now()
      ? Math.max(0, cache.expiresAt - REFRESH_BUFFER_MS - Date.now())
      : 0;

  return {
    autoRefreshEnabled: hasClientCredentialsConfigured() || hasEnvAccessToken(),
    lastRefreshTime: lastSuccessfulRefreshAt,
    lastSuccessfulRefreshAt,
    isRefreshing: Boolean(refreshInFlight),
    msUntilRefresh: msUntil,
    hasClientCredentials: hasClientCredentialsConfigured(),
    lastError: lastRefreshError,
    cache,
  };
}

/** İstek öncesi cache kontrolü — süresi dolmak üzereyse yenile */
export async function proactiveRefreshShopifyToken(force = false): Promise<{
  success: boolean;
  source?: ShopifyTokenSource;
  error?: string;
}> {
  const cache = getTokenCacheStatus();
  const shouldRefresh =
    force || !cache.cached || cache.needsRefreshSoon || cache.expiresInMs === null;

  if (!shouldRefresh) {
    return { success: true, source: cache.source || undefined };
  }

  try {
    if (force) invalidateShopifyTokenCache();
    const token = await getValidShopifyAccessToken({ forceRefresh: force });
    return { success: true, source: token.source };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Token yenileme başarısız';
    lastRefreshError = message;
    return { success: false, error: message };
  }
}

/** Sunucu başlangıcında non-blocking token warm-up */
export function warmUpShopifyToken(): void {
  getValidShopifyAccessToken().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ SHOPIFY TOKEN: Başlangıç warm-up atlandı — ${message}`);
  });
}

/** Upload öncesi bağlantıyı garanti et */
export async function ensureShopifyConnectionReady(requestId?: string): Promise<{
  connected: boolean;
  message: string;
  shopDomain?: string;
  tokenSource?: ShopifyTokenSource;
  scopesOk?: boolean;
}> {
  await proactiveRefreshShopifyToken(false);
  const { runShopifyConnectionTest } = await import('./connection-test');
  const test = await runShopifyConnectionTest(requestId);
  return {
    connected: test.connected,
    message: test.message,
    shopDomain: test.shopDomain,
    scopesOk: test.scopesOk,
    tokenSource:
      test.tokenSource === 'db'
        ? 'db'
        : test.tokenSource === 'env_access' || test.tokenSource === 'env_admin'
          ? 'env'
          : test.tokenSource === 'client_credentials'
            ? 'client_credentials'
            : undefined,
  };
}

/** @deprecated Scheduler kaldırıldı — warmUpShopifyToken kullanın */
export function startShopifyTokenLifecycle(): void {
  warmUpShopifyToken();
}
