import { db } from './db';
import { shopifyCredentials } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';
import {
  envShopDomain,
  getShopifyClientCredentials,
  hasUsableClientSecretForRefresh,
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

/**
 * Token çözümleme amacı:
 * - normalResolve   : normal istek — cache boş/az kaldıysa taze token çöz.
 * - proactiveRefresh : süresi dolmadan (≥60 dk) yapılan planlı yenileme.
 * - forceRefresh    : 401 sonrası veya manuel zorunlu yenileme.
 *
 * proactiveRefresh ve forceRefresh, client credentials mevcutken ENV/DB access
 * token adaylarını KULLANMAZ; doğrudan yeni bir client_credentials tokenı alır.
 */
export type TokenAcquireIntent = 'normalResolve' | 'proactiveRefresh' | 'forceRefresh';

const SHOPIFY_API_VERSION = '2024-01';
/** Süresi bitmeye bu kadar kala token yenilenir (en az 60 dk önce). */
const REFRESH_BUFFER_MS = 60 * 60 * 1000;
/** Kalıcı Admin/OAuth token için varsayılan (süresiz kabul edilen) ömür. */
const DEFAULT_LIFETIME_MS = 23 * 60 * 60 * 1000;
/** client_credentials tokenı için expires_in dönmezse uygulanan güvenli kısa ömür. */
const CLIENT_CREDENTIALS_FALLBACK_MS = 2 * 60 * 60 * 1000;

interface TokenCacheEntry {
  accessToken: string;
  shopDomain: string;
  source: ShopifyTokenSource;
  issuedAt: number;
  expiresAt: number;
}

let tokenCache: TokenCacheEntry | null = null;
let refreshInFlight: Promise<TokenCacheEntry> | null = null;
let lastSuccessfulRefreshAt = 0;
let lastRefreshAttemptAt = 0;
let lastRefreshError: string | null = null;

/* -------------------------------------------------------------------------- */
/* Test edilebilirlik: tüm dış etkiler (network/DB/env/creds) buradan geçer.  */
/* Böylece token yaşam döngüsü karar mantığı gerçek network olmadan sınanır.  */
/* -------------------------------------------------------------------------- */
interface ShopifyTokenManagerDeps {
  fetchImpl: typeof fetch;
  getShopDomain(): string;
  getClientCredentials(): { clientId: string; clientSecret: string; shopDomain: string } | null;
  getEnvAdminTokens(): Array<{ token?: string; source: ShopifyTokenSource }>;
  clearEnvAdminTokens(): void;
  readDbToken(shopDomain: string): Promise<string | null>;
  saveDbToken(shopDomain: string, accessToken: string): Promise<void>;
  invalidateDbToken(shopDomain: string, reason: string): Promise<void>;
}

const realDeps: ShopifyTokenManagerDeps = {
  fetchImpl: (input: any, init?: any) => fetch(input, init),
  getShopDomain: () => envShopDomain(),
  getClientCredentials: () => getShopifyClientCredentials(),
  getEnvAdminTokens: () => [
    { token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN, source: 'env' },
    { token: process.env.SHOPIFY_ACCESS_TOKEN, source: 'env' },
  ],
  clearEnvAdminTokens: () => {
    delete process.env.SHOPIFY_ACCESS_TOKEN;
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  },
  readDbToken: (shopDomain) => readDbRawTokenFromDatabase(shopDomain),
  saveDbToken: async (shopDomain, accessToken) => {
    const { saveDirectAccessToken } = await import('./shopify-credentials');
    await saveDirectAccessToken(shopDomain, accessToken);
  },
  invalidateDbToken: (shopDomain, reason) => invalidateDbTokenInDatabase(shopDomain, reason),
};

let deps: ShopifyTokenManagerDeps = realDeps;

/** Yalnızca testler için — dış bağımlılıkları enjekte eder ve runtime state'i sıfırlar. */
export function __setShopifyTokenManagerTestDeps(
  partial: Partial<ShopifyTokenManagerDeps>,
): void {
  deps = { ...realDeps, ...partial };
  tokenCache = null;
  refreshInFlight = null;
  lastRefreshError = null;
  lastSuccessfulRefreshAt = 0;
  lastRefreshAttemptAt = 0;
}

/** Yalnızca testler için — gerçek bağımlılıklara döner. */
export function __resetShopifyTokenManagerTestDeps(): void {
  deps = realDeps;
  tokenCache = null;
  refreshInFlight = null;
  lastRefreshError = null;
}

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
    return 'Geçersiz client_id/client_secret — Dev Dashboard → Settings sayfasındaki Client ID ve Client Secret değerlerini kontrol edin';
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
  const fallbackMs =
    input.source === 'client_credentials'
      ? CLIENT_CREDENTIALS_FALLBACK_MS
      : DEFAULT_LIFETIME_MS;
  const expiresAt =
    input.expiresAt ??
    Date.now() +
      (input.expiresInSeconds && input.expiresInSeconds > 0
        ? input.expiresInSeconds * 1000
        : fallbackMs);

  tokenCache = {
    accessToken: input.accessToken,
    shopDomain: normalizeShopDomain(input.shopDomain),
    source: input.source,
    issuedAt: Date.now(),
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

/** Önbellek + runtime ENV tokenlarını temizle (disconnect sonrası) */
export function clearShopifyRuntimeCredentials(): void {
  invalidateShopifyTokenCache();
  delete process.env.SHOPIFY_ACCESS_TOKEN;
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  lastRefreshError = null;
}

async function probeShopToken(shopDomain: string, accessToken: string): Promise<{
  ok: boolean;
  status: number;
  hint?: string;
}> {
  try {
    const response = await deps.fetchImpl(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      },
    );
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

async function invalidateDbTokenInDatabase(shopDomain: string, reason: string): Promise<void> {
  try {
    const cleanDomain = normalizeShopDomain(shopDomain);
    await db
      .update(shopifyCredentials)
      .set({ accessToken: null as any, updatedAt: new Date() } as any)
      .where(eq(shopifyCredentials.shopDomain, cleanDomain));
    console.warn(`[SHOPIFY_TOKEN] Geçersiz DB token temizlendi (${reason})`);
  } catch {
    /* optional */
  }
}

/** DB'deki aktif ham token değerini döndür (doğrulama yapmadan). */
async function readDbRawTokenFromDatabase(shopDomain: string): Promise<string | null> {
  try {
    const normalizedTarget = normalizeShopDomain(shopDomain);
    const rows = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.isActive, true))
      .orderBy(desc(shopifyCredentials.updatedAt));

    const cred = rows.find((row) => normalizeShopDomain(row.shopDomain || '') === normalizedTarget);
    const token = cred?.accessToken?.trim();
    return token || null;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== '42P01') {
      console.warn('[SHOPIFY_TOKEN] DB token read failed:', err);
    }
    return null;
  }
}

/**
 * DB'deki KALICI admin/OAuth tokenını çöz (yalnızca client credentials yokken kullanılır).
 * shpss_ ve tanınmayan formatlar reddedilir; 401/403 alan token DB'den temizlenir.
 */
async function resolveDbAdminToken(shopDomain: string): Promise<string | null> {
  const normalized = normalizeShopDomain(shopDomain);
  const token = await deps.readDbToken(normalized);
  if (!token || isDeprecatedToken(token)) return null;
  if (!token.startsWith('shpat_') && !token.startsWith('shpua_')) {
    console.warn('[SHOPIFY_TOKEN] DB token formatı tanınmıyor — OAuth yenilemesi gerekli');
    return null;
  }

  const probe = await probeShopToken(normalized, token);
  if (probe.ok) return token;

  if (probe.status === 401 || probe.status === 403) {
    await deps.invalidateDbToken(normalized, `HTTP ${probe.status}`);
  }
  lastRefreshError = probe.hint || mapShopifyProbeError(probe.status);
  return null;
}

async function exchangeClientCredentialsToken(
  shopDomain: string,
): Promise<{ accessToken: string; expiresInSeconds?: number } | null> {
  const creds = deps.getClientCredentials();
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

  const response = await deps.fetchImpl(`https://${domain}/admin/oauth/access_token`, {
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

async function invalidateApiServiceCredCache(): Promise<void> {
  try {
    const { invalidateShopifyCredentialCache } = await import('./shopify-api-service');
    invalidateShopifyCredentialCache();
  } catch {
    /* optional */
  }
}

/**
 * Dışarıdan (OAuth callback / manuel Admin Token) alınan KALICI token'ı etkinleştirir.
 * Bu yol client_credentials değildir; ENV + DB'ye kalıcı yazılır.
 */
export async function activateShopifyAccessToken(
  shopDomain: string,
  accessToken: string,
  source: ShopifyTokenSource = 'db',
  expiresInSeconds?: number,
): Promise<void> {
  await persistTokenToRuntime(shopDomain, accessToken, source, expiresInSeconds);
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

  // client_credentials tokenı GEÇİCİDİR: yalnızca memory cache'te tutulur.
  // ENV veya DB'ye YAZILMAZ — aksi halde sonraki döngüde kalıcı 'env'/'db' token
  // sanılıp gerçek yenileme geciker (kritik hatanın kök nedeni). Kalıcı kaynak:
  // client_id + client_secret + shop domain.
  if (source === 'client_credentials') {
    await invalidateApiServiceCredCache();
    return;
  }

  // Kalıcı admin/OAuth token — ENV + DB'ye yaz.
  process.env.SHOPIFY_ACCESS_TOKEN = accessToken;
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = accessToken;

  try {
    await deps.saveDbToken(shopDomain, accessToken);
  } catch (err: unknown) {
    console.warn(
      '[SHOPIFY_TOKEN] DB persist skipped:',
      err instanceof Error ? err.message : err,
    );
  }

  await invalidateApiServiceCredCache();
}

async function acquireFreshToken(intent: TokenAcquireIntent): Promise<TokenCacheEntry> {
  lastRefreshAttemptAt = Date.now();

  const shopDomain = deps.getShopDomain();
  if (!shopDomain) {
    throw new Error(
      'Shopify mağaza domain bulunamadı — SHOPIFY_SHOP_DOMAIN / SHOPIFY_STORE_DOMAIN / SHOPIFY_STORE_URL tanımlayın',
    );
  }

  const normalizedDomain = normalizeShopDomain(shopDomain);
  const isRefresh = intent !== 'normalResolve';
  if (intent === 'forceRefresh') {
    invalidateShopifyTokenCache();
  }

  const clientCreds = deps.getClientCredentials();

  // (1) Kullanılabilir client credentials → HER ZAMAN taze exchange (yalnızca memory).
  //     proactiveRefresh / forceRefresh: ENV & DB access token adayları KULLANILMAZ,
  //     böylece Shopify tarafında hâlâ geçerli olan bayat token yeniden seçilmez.
  if (clientCreds) {
    const exchanged = await exchangeClientCredentialsToken(normalizedDomain);
    if (exchanged) {
      await persistTokenToRuntime(
        normalizedDomain,
        exchanged.accessToken,
        'client_credentials',
        exchanged.expiresInSeconds,
      );
      return tokenCache!;
    }
    if (isRefresh) {
      throw new Error(
        `Shopify access token yenilenemedi — ${lastRefreshError || 'client_credentials exchange başarısız'}`,
      );
    }
    // normalResolve + exchange başarısız: aşağıda kalıcı admin/OAuth fallback denenir.
  }

  // (2) Kalıcı ENV admin token (client credentials yoksa veya normalResolve fallback).
  for (const candidate of deps.getEnvAdminTokens()) {
    const token = candidate.token?.trim();
    if (!token || isDeprecatedToken(token)) continue;
    const probe = await probeShopToken(normalizedDomain, token);
    if (probe.ok) {
      await persistTokenToRuntime(normalizedDomain, token, candidate.source);
      return tokenCache!;
    }
    deps.clearEnvAdminTokens();
    if (!isRefresh) {
      console.warn('[SHOPIFY_TOKEN] ENV token geçersiz, sonraki kaynak deneniyor', {
        source: candidate.source,
        status: probe.status,
        hint: probe.hint,
      });
    }
  }

  // (3) Kalıcı DB admin/OAuth token.
  const dbToken = await resolveDbAdminToken(normalizedDomain);
  if (dbToken) {
    await persistTokenToRuntime(normalizedDomain, dbToken, 'db');
    return tokenCache!;
  }

  // (4) Hiç kalıcı token yok — client credentials da yoksa son bir kez exchange denenir
  //     (bu durumda creds null olduğu için no-op'tur; sadece netlik için).
  const { resolveOAuthShopifyCredentials } = await import('./shopify-credentials');
  const oauth = await resolveOAuthShopifyCredentials().catch(() => null);
  const hint =
    lastRefreshError ||
    (oauth
      ? 'OAuth ile yetkilendirin (Ayarlar → Shopify → OAuth) veya Admin Token (shpat_...) kaydedin'
      : 'SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (Dev Dashboard → Settings) veya Admin Token tanımlayın');
  throw new Error(`Shopify access token alınamadı veya doğrulanamadı — ${hint}`);
}

/** Tek merkezi token resolver — cache, client_credentials, env, DB */
export async function getValidShopifyAccessToken(options: {
  forceRefresh?: boolean;
  intent?: TokenAcquireIntent;
} = {}): Promise<{
  accessToken: string;
  shopDomain: string;
  source: ShopifyTokenSource;
  expiresAt: number;
}> {
  const forceRefresh = options.forceRefresh === true;
  const intent: TokenAcquireIntent =
    options.intent ?? (forceRefresh ? 'forceRefresh' : 'normalResolve');

  // Cache tokenın bitmesine 1 saatten fazla varsa cache kullan.
  if (!forceRefresh && cacheIsValid() && tokenCache) {
    return {
      accessToken: tokenCache.accessToken,
      shopDomain: tokenCache.shopDomain,
      source: 'cache',
      expiresAt: tokenCache.expiresAt,
    };
  }

  // Devam eden bir yenileme varsa paralel çağrılar onu paylaşır (tek exchange).
  if (refreshInFlight && !forceRefresh) {
    const entry = await refreshInFlight;
    return {
      accessToken: entry.accessToken,
      shopDomain: entry.shopDomain,
      source: entry.source,
      expiresAt: entry.expiresAt,
    };
  }

  if (forceRefresh) invalidateShopifyTokenCache();

  const inflight = acquireFreshToken(intent);
  refreshInFlight = inflight;
  try {
    const entry = await inflight;
    return {
      accessToken: entry.accessToken,
      shopDomain: entry.shopDomain,
      source: entry.source,
      expiresAt: entry.expiresAt,
    };
  } finally {
    if (refreshInFlight === inflight) refreshInFlight = null;
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

  const response = await deps.fetchImpl(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
      'X-Shopify-Access-Token': token.accessToken,
    },
  });

  // 401 → tek sefer yeni token alıp isteği tekrar et (sonsuz döngü yok).
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
  return Boolean(deps.getClientCredentials());
}

/**
 * @deprecated Prefix tabanlı (shpss_) reddetme kaldırıldı — Client Secret'ın
 * belirli bir prefix'i olması gerekmez. Geriye dönük uyumluluk için korunur,
 * her zaman false döner.
 */
export function secretLooksLikeSharedSecretOnly(): boolean {
  return false;
}

/** ENV, önbellek veya DB'de geçerli token var mı */
export async function hasStoredShopifyToken(): Promise<boolean> {
  if (getTokenCacheStatus().cached) return true;

  const shopDomain = deps.getShopDomain();
  if (!shopDomain) return false;
  const normalizedDomain = normalizeShopDomain(shopDomain);

  for (const candidate of deps.getEnvAdminTokens()) {
    const token = candidate.token?.trim();
    if (token && !isDeprecatedToken(token)) {
      const probe = await probeShopToken(normalizedDomain, token);
      if (probe.ok) return true;
      deps.clearEnvAdminTokens();
    }
  }

  const dbToken = await resolveDbAdminToken(normalizedDomain);
  return Boolean(dbToken);
}

export async function getShopifyHealthResponse(): Promise<{
  ok: boolean;
  shopDomain: string;
  hasEnvAccessToken: boolean;
  hasClientCredentials: boolean;
  clientIdSource: ReturnType<typeof resolveClientIdSource>;
  clientSecretSource: ReturnType<typeof resolveClientSecretSource>;
  secretLooksLikeSharedSecret: boolean;
  tokenSource: ShopifyTokenSource;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  scopesOk: boolean;
  scopes: string[];
  canReadProducts: boolean;
  canWriteProducts: boolean;
  canCreateProducts: boolean;
  productCountCheck: { ok: boolean; count: number | null; error?: string };
  error?: string;
}> {
  const shopDomain = envShopDomain();
  const hasClientCredentials = hasClientCredentialsConfigured();
  const clientIdSource = resolveClientIdSource();
  const clientSecretSource = resolveClientSecretSource();
  // Prefix tabanlı reddetme kaldırıldı — Client Secret geçerliliği yalnızca
  // gerçek token exchange sonucuyla belirlenir.
  const secretLooksLikeSharedSecret = false;

  const baseFailure = {
    shopDomain: shopDomain ? normalizeShopDomain(shopDomain) : '',
    hasEnvAccessToken: hasEnvAccessToken(),
    hasClientCredentials,
    clientIdSource,
    clientSecretSource,
    secretLooksLikeSharedSecret,
    tokenSource: 'missing' as ShopifyTokenSource,
    expiresAt: null as string | null,
    expiresInSeconds: null as number | null,
    scopesOk: false,
    scopes: [] as string[],
    canReadProducts: false,
    canWriteProducts: false,
    canCreateProducts: false,
    productCountCheck: { ok: false, count: null as number | null },
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

    let productCountCheck: { ok: boolean; count: number | null; error?: string } = {
      ok: false,
      count: null,
    };
    if (shopOk && scopeInfo.canReadProducts) {
      try {
        const { response: countResponse } = await shopifyAdminFetch('/products/count.json');
        if (countResponse.ok) {
          const countBody = (await countResponse.json()) as { count?: number };
          productCountCheck = { ok: true, count: countBody.count ?? 0 };
        } else {
          productCountCheck = {
            ok: false,
            count: null,
            error: `HTTP ${countResponse.status}`,
          };
        }
      } catch (countErr: unknown) {
        productCountCheck = {
          ok: false,
          count: null,
          error: countErr instanceof Error ? countErr.message : 'count fetch failed',
        };
      }
    }

    return {
      ok: shopOk && scopeInfo.scopesOk,
      shopDomain: token.shopDomain,
      hasEnvAccessToken: hasEnvAccessToken(),
      hasClientCredentials,
      clientIdSource,
      clientSecretSource,
      secretLooksLikeSharedSecret,
      tokenSource: token.source,
      expiresAt: new Date(token.expiresAt).toISOString(),
      expiresInSeconds,
      scopesOk: scopeInfo.scopesOk,
      scopes: scopeInfo.scopes,
      canReadProducts: scopeInfo.canReadProducts,
      canWriteProducts: scopeInfo.canWriteProducts,
      canCreateProducts,
      productCountCheck,
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
  issuedAt: number | null;
  expiresAt: number | null;
  expiresInMs: number | null;
  refreshAt: number | null;
  needsRefreshSoon: boolean;
} {
  if (!tokenCache) {
    return {
      cached: false,
      source: null,
      shopDomain: null,
      issuedAt: null,
      expiresAt: null,
      expiresInMs: null,
      refreshAt: null,
      needsRefreshSoon: true,
    };
  }
  const expiresInMs = tokenCache.expiresAt - Date.now();
  return {
    cached: true,
    source: tokenCache.source,
    shopDomain: tokenCache.shopDomain,
    issuedAt: tokenCache.issuedAt,
    expiresAt: tokenCache.expiresAt,
    expiresInMs,
    refreshAt: tokenCache.expiresAt - REFRESH_BUFFER_MS,
    needsRefreshSoon: expiresInMs <= REFRESH_BUFFER_MS,
  };
}

export function getShopifyTokenLifecycleStatus(overrides?: {
  hasStoredToken?: boolean;
}): {
  autoRefreshEnabled: boolean;
  tokenSource: ShopifyTokenSource | null;
  issuedAt: number | null;
  expiresAt: number | null;
  expiresInSeconds: number | null;
  refreshAt: number | null;
  lastRefreshTime: number;
  lastSuccessfulRefreshAt: number;
  lastRefreshAttemptAt: number;
  lastRefreshError: string | null;
  isRefreshing: boolean;
  msUntilRefresh: number;
  hasClientCredentials: boolean;
  clientCredentialsReady: boolean;
  secretLooksLikeSharedSecret: boolean;
  hasStoredToken: boolean;
  lastError: string | null;
  cache: ReturnType<typeof getTokenCacheStatus>;
} {
  const cache = getTokenCacheStatus();
  const msUntil =
    cache.expiresAt && cache.expiresAt > Date.now()
      ? Math.max(0, cache.expiresAt - REFRESH_BUFFER_MS - Date.now())
      : 0;
  const clientCredentialsReady = hasClientCredentialsConfigured();
  const hasStoredToken = overrides?.hasStoredToken ?? cache.cached;

  return {
    autoRefreshEnabled:
      clientCredentialsReady || hasEnvAccessToken() || hasStoredToken || cache.cached,
    tokenSource: cache.source,
    issuedAt: cache.issuedAt,
    expiresAt: cache.expiresAt,
    expiresInSeconds:
      cache.expiresInMs != null ? Math.max(0, Math.floor(cache.expiresInMs / 1000)) : null,
    refreshAt: cache.refreshAt,
    lastRefreshTime: lastSuccessfulRefreshAt,
    lastSuccessfulRefreshAt,
    lastRefreshAttemptAt,
    lastRefreshError,
    isRefreshing: Boolean(refreshInFlight),
    msUntilRefresh: msUntil,
    hasClientCredentials: clientCredentialsReady,
    clientCredentialsReady,
    secretLooksLikeSharedSecret: secretLooksLikeSharedSecretOnly(),
    hasStoredToken,
    lastError: lastRefreshError,
    cache,
  };
}

export async function buildShopifyTokenStatusPayload(): Promise<{
  status: ReturnType<typeof getShopifyTokenLifecycleStatus>;
  tokenSource: ShopifyTokenSource;
  issuedAt: string | null;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  refreshAt: string | null;
  msUntilRefresh: number;
  lastSuccessfulRefreshAt: number;
  lastRefreshAttemptAt: number;
  lastRefreshError: string | null;
  autoRefreshEnabled: boolean;
  hasActiveToken: boolean;
  hasDbToken: boolean;
  clientCredentialsReady: boolean;
  secretLooksLikeSharedSecret: boolean;
  clientSecretUsableForRefresh: boolean;
  shopDomain: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
  liveConnected: boolean;
}> {
  const dbHasToken = await hasStoredShopifyToken();
  const lifecycle = getShopifyTokenLifecycleStatus({ hasStoredToken: dbHasToken });
  const shopDomain = lifecycle.cache.shopDomain || envShopDomain() || null;

  let liveConnected = false;
  if (lifecycle.cache.cached || dbHasToken) {
    try {
      const health = await getShopifyHealthResponse();
      liveConnected = health.ok;
    } catch {
      liveConnected = false;
    }
  }

  const { hasUsableClientSecretForRefresh } = await import('./shopify-credentials');

  return {
    status: lifecycle,
    tokenSource: lifecycle.tokenSource ?? 'missing',
    issuedAt: lifecycle.issuedAt ? new Date(lifecycle.issuedAt).toISOString() : null,
    expiresAt: lifecycle.expiresAt ? new Date(lifecycle.expiresAt).toISOString() : null,
    expiresInSeconds: lifecycle.expiresInSeconds,
    refreshAt: lifecycle.refreshAt ? new Date(lifecycle.refreshAt).toISOString() : null,
    msUntilRefresh: lifecycle.msUntilRefresh,
    lastSuccessfulRefreshAt: lifecycle.lastSuccessfulRefreshAt,
    lastRefreshAttemptAt: lifecycle.lastRefreshAttemptAt,
    lastRefreshError: lifecycle.lastRefreshError,
    autoRefreshEnabled: lifecycle.autoRefreshEnabled,
    hasActiveToken: liveConnected,
    hasDbToken: dbHasToken,
    clientCredentialsReady: lifecycle.clientCredentialsReady,
    secretLooksLikeSharedSecret: lifecycle.secretLooksLikeSharedSecret,
    clientSecretUsableForRefresh: hasUsableClientSecretForRefresh(),
    shopDomain,
    tokenExpiresAt: lifecycle.expiresAt ? new Date(lifecycle.expiresAt).toISOString() : null,
    lastError: lifecycle.lastError,
    liveConnected,
  };
}

/** İstek öncesi cache kontrolü — süresi dolmak üzereyse gerçekten yeni token al */
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

  const oldExpiresAt = cache.expiresAt ? new Date(cache.expiresAt).toISOString() : null;
  console.log('[SHOPIFY_TOKEN] proactive refresh started', {
    force,
    source: cache.source,
    oldExpiresAt,
  });

  try {
    // forceRefresh:true → cache atlanır ve (client credentials varsa) gerçek exchange yapılır.
    const token = await getValidShopifyAccessToken({
      forceRefresh: true,
      intent: force ? 'forceRefresh' : 'proactiveRefresh',
    });
    console.log('[SHOPIFY_TOKEN] proactive refresh completed', {
      source: token.source,
      oldExpiresAt,
      newExpiresAt: new Date(token.expiresAt).toISOString(),
      token: maskToken(token.accessToken),
    });
    return { success: true, source: token.source };
  } catch (err: unknown) {
    let message = err instanceof Error ? err.message : 'Token yenileme başarısız';
    // Client credentials tanımlı değilse ve kalıcı token da yoksa yönlendir.
    if (!hasUsableClientSecretForRefresh() && !hasEnvAccessToken()) {
      message =
        'Otomatik yenileme için SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (Dev Dashboard → Settings) ' +
        'tanımlayın veya Admin Token (shpat_...) kaydedin.';
    }
    lastRefreshError = message;
    console.warn('[SHOPIFY_TOKEN] proactive refresh failed', { error: message });
    return { success: false, error: message };
  }
}

/** Sunucu başlangıcında non-blocking token warm-up + periyodik yenileme */
let tokenRefreshIntervalStarted = false;

/** Sunucu başlangıcında DB'deki aktif token'ı önbelleğe al */
export async function hydrateShopifyTokenFromDatabase(): Promise<boolean> {
  const { bootstrapShopifyConnectionFromEnv } = await import('./shopify-credentials');
  const boot = await bootstrapShopifyConnectionFromEnv();
  if (boot.hasAccessToken) {
    console.log('[SHOPIFY_TOKEN] Bağlantı hazır', {
      shopDomain: boot.shopDomain,
      tokenSource: boot.tokenSource,
    });
    return true;
  }
  console.warn(`[SHOPIFY_TOKEN] ${boot.message}`);
  return false;
}

export function warmUpShopifyToken(): void {
  void (async () => {
    const hydrated = await hydrateShopifyTokenFromDatabase().catch(() => false);
    // Warm-up sonrası hâlâ token yoksa ve client credentials varsa gerçek token al.
    if (!hydrated && !getTokenCacheStatus().cached && hasClientCredentialsConfigured()) {
      const res = await proactiveRefreshShopifyToken(true).catch(() => null);
      if (res && !res.success) {
        console.warn(`[SHOPIFY_TOKEN] Başlangıç token exchange başarısız: ${res.error}`);
      }
    }
  })();

  if (tokenRefreshIntervalStarted) return;
  tokenRefreshIntervalStarted = true;

  const REFRESH_CHECK_MS = 15 * 60 * 1000;
  const interval = setInterval(() => {
    proactiveRefreshShopifyToken(false).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[SHOPIFY_TOKEN] Periyodik yenileme atlandı: ${message}`);
    });
  }, REFRESH_CHECK_MS);
  // Interval process kapanmasını engellemesin.
  if (typeof (interval as { unref?: () => void }).unref === 'function') {
    (interval as { unref: () => void }).unref();
  }

  console.log('[SHOPIFY_TOKEN] Periyodik yenileme aktif (15 dk aralık, unref)');
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
