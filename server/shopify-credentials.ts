import { db } from './db';
import { shopifyCredentials } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  apiKey?: string;
  apiSecret?: string;
}

export type ShopifyCredentialSource = 'db' | 'env_admin' | 'env_access' | 'env_legacy' | 'client_credentials';

export interface ResolvedShopifyCredentials extends ShopifyConfig {
  source: ShopifyCredentialSource;
}

export class ShopifyCredentialsError extends Error {
  constructor(
    message = 'Shopify API kimlik bilgileri bulunamadı. OAuth bağlantısı yapın veya SHOPIFY_ADMIN_ACCESS_TOKEN / SHOPIFY_ACCESS_TOKEN tanımlayın.'
  ) {
    super(message);
    this.name = 'ShopifyCredentialsError';
  }
}

/** Strip protocol/trailing slash; prefer *.myshopify.com domain. */
export function normalizeShopDomain(domain: string): string {
  if (!domain) return '';
  let d = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
  d = d.split('/')[0];

  const envCandidates = [
    process.env.SHOPIFY_SHOP_DOMAIN,
    process.env.SHOPIFY_STORE_URL,
    process.env.SHOPIFY_STORE_DOMAIN,
  ]
    .filter(Boolean)
    .map((value) => value!.replace(/^https?:\/\//, '').replace(/\/$/, '').trim().split('/')[0]);

  const preferredMyshopify = envCandidates.find((value) => value.includes('.myshopify.com'));
  if (preferredMyshopify && !d.includes('.myshopify.com')) {
    d = preferredMyshopify;
  }

  return d;
}

export type ShopifyHealthTokenSource = 'env' | 'db_oauth' | 'client_credentials' | 'cache' | 'missing';

export interface ResolvedShopifyConfig {
  ok: boolean;
  shopDomain: string;
  accessToken?: string;
  hasAccessToken: boolean;
  hasClientCredentials: boolean;
  tokenSource: ShopifyHealthTokenSource;
  apiKey?: string;
  apiSecret?: string;
  scopesOk?: boolean;
  error?: string;
}

function mapCredentialSource(source: ShopifyCredentialSource): ShopifyHealthTokenSource {
  if (source === 'db') return 'db_oauth';
  if (source === 'client_credentials') return 'client_credentials';
  return 'env';
}

/** Tek merkezden Shopify config — token resolver dahil */
export async function resolveShopifyConfig(): Promise<ResolvedShopifyConfig> {
  const hasClientCredentials = Boolean(getShopifyClientCredentials());
  const shopDomain = envShopDomain();

  try {
    const { getValidShopifyAccessToken } = await import('./shopify-token-manager');
    const token = await getValidShopifyAccessToken();
    const clientCreds = getShopifyClientCredentials();

    const mappedSource: ShopifyHealthTokenSource =
      token.source === 'db'
        ? 'db_oauth'
        : token.source === 'cache'
          ? 'cache'
          : token.source === 'client_credentials'
            ? 'client_credentials'
            : token.source === 'env'
              ? 'env'
              : 'missing';

    return {
      ok: true,
      shopDomain: token.shopDomain,
      accessToken: token.accessToken,
      hasAccessToken: true,
      hasClientCredentials,
      tokenSource: mappedSource,
      apiKey: clientCreds?.clientId,
      apiSecret: clientCreds?.clientSecret,
    };
  } catch (err) {
    const message =
      err instanceof ShopifyCredentialsError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Shopify yapılandırması bulunamadı';

    return {
      ok: false,
      shopDomain: shopDomain,
      hasAccessToken: false,
      hasClientCredentials,
      tokenSource: 'missing',
      error: message,
    };
  }
}

/** Health endpoint — token asla dönmez */
export async function getShopifyHealthSnapshot() {
  const { getShopifyHealthResponse } = await import('./shopify-token-manager');
  return getShopifyHealthResponse();
}

function envShopDomain(): string {
  return normalizeShopDomain(
    process.env.SHOPIFY_SHOP_DOMAIN ||
      process.env.SHOPIFY_STORE_DOMAIN ||
      process.env.SHOPIFY_STORE_URL ||
      ''
  );
}

export { envShopDomain };

export function resolveClientIdSource():
  | 'SHOPIFY_CLIENT_ID'
  | 'SHOPIFY_API_KEY'
  | 'missing' {
  if (process.env.SHOPIFY_CLIENT_ID?.trim()) return 'SHOPIFY_CLIENT_ID';
  if (process.env.SHOPIFY_client_id?.trim()) return 'SHOPIFY_CLIENT_ID';
  if (process.env.SHOPIFY_API_KEY?.trim()) return 'SHOPIFY_API_KEY';
  return 'missing';
}

export function resolveClientSecretSource():
  | 'SHOPIFY_CLIENT_SECRET'
  | 'SHOPIFY_APP_SHARED_SECRET'
  | 'missing' {
  if (process.env.SHOPIFY_CLIENT_SECRET?.trim()) return 'SHOPIFY_CLIENT_SECRET';
  if (process.env.SHOPIFY_CLIENT_SECRET_KEY?.trim()) return 'SHOPIFY_CLIENT_SECRET';
  if (process.env.secret_key?.trim()) return 'SHOPIFY_APP_SHARED_SECRET';
  if (process.env.SHOPIFY_APP_SHARED_SECRET?.trim()) return 'SHOPIFY_APP_SHARED_SECRET';
  return 'missing';
}

/** ENV'den Shopify Client Credentials (Postman: client_id + client_secret + grant_type) */
export function getShopifyClientCredentials(): {
  clientId: string;
  clientSecret: string;
  shopDomain: string;
} | null {
  const clientId =
    process.env.SHOPIFY_CLIENT_ID ||
    process.env.SHOPIFY_client_id ||
    process.env.SHOPIFY_API_KEY ||
    '';
  const clientSecret =
    process.env.SHOPIFY_CLIENT_SECRET ||
    process.env.SHOPIFY_CLIENT_SECRET_KEY ||
    process.env.secret_key ||
    process.env.SHOPIFY_APP_SHARED_SECRET ||
    '';
  const shopDomain = envShopDomain();

  if (!clientId || !clientSecret || !shopDomain) return null;

  if (clientSecret.startsWith('shpss_')) {
    const fromExplicitSecret =
      process.env.SHOPIFY_CLIENT_SECRET?.trim() ||
      process.env.SHOPIFY_CLIENT_SECRET_KEY?.trim();
    if (!fromExplicitSecret) {
      console.warn(
        '[SHOPIFY] secret_key shpss_ ile başlıyor — client_credentials için Dev Dashboard Client Secret (shpsec_...) kullanın.',
      );
      return null;
    }
  }

  return { clientId, clientSecret, shopDomain };
}

function isDeprecatedToken(token: string): boolean {
  return token.startsWith('shpss_');
}

/**
 * Geriye dönük uyumluluk — getValidShopifyAccessToken() üzerinden çalışır.
 */
export async function resolveShopifyCredentials(): Promise<ResolvedShopifyCredentials> {
  const { getValidShopifyAccessToken } = await import('./shopify-token-manager');
  const token = await getValidShopifyAccessToken();
  const clientCreds = getShopifyClientCredentials();

  const source: ShopifyCredentialSource =
    token.source === 'db'
      ? 'db'
      : token.source === 'client_credentials' || token.source === 'cache'
        ? 'client_credentials'
        : token.source === 'env'
          ? 'env_access'
          : 'client_credentials';

  return {
    shopDomain: token.shopDomain,
    accessToken: token.accessToken,
    apiKey: clientCreds?.clientId,
    apiSecret: clientCreds?.clientSecret,
    source,
  };
}

/**
 * Geriye dönük uyumluluk — null döner, crash etmez.
 */
export async function getShopifyConfig(): Promise<ShopifyConfig | null> {
  try {
    const cred = await resolveShopifyCredentials();
    return {
      shopDomain: cred.shopDomain,
      accessToken: cred.accessToken,
      apiKey: cred.apiKey,
      apiSecret: cred.apiSecret,
    };
  } catch {
    return null;
  }
}

/**
 * Sunucu başlangıcında SHOPIFY_API_KEY + SHOPIFY_APP_SHARED_SECRET ENV değişkenlerini
 * DB'deki mağaza kaydına otomatik olarak yazar.
 */
export async function syncEnvApiKeyToDB(): Promise<void> {
  const creds = getShopifyClientCredentials();
  const apiKey = creds?.clientId || process.env.SHOPIFY_API_KEY;
  const apiSecret = creds?.clientSecret || process.env.SHOPIFY_APP_SHARED_SECRET;
  const shopDomain = creds?.shopDomain || envShopDomain();

  if (!apiKey || !shopDomain) return;

  try {
    const rows = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.shopDomain, shopDomain))
      .limit(1);

    if (rows.length > 0) {
      const current = rows[0];
      const needsUpdate = current.apiKey !== apiKey || (apiSecret && current.apiSecret !== apiSecret);
      if (needsUpdate) {
        await db
          .update(shopifyCredentials)
          .set({
            apiKey,
            ...(apiSecret ? { apiSecret } : {}),
            updatedAt: new Date(),
          } as any)
          .where(eq(shopifyCredentials.shopDomain, shopDomain));
        console.log(`✅ ENV API Key DB'ye senkronize edildi: ${shopDomain}`);
      }
    } else {
      await db.insert(shopifyCredentials).values({
        shopDomain,
        apiKey,
        apiSecret: apiSecret || '',
        accessToken: null as any,
        isActive: false,
      } as any);
      console.log(`✅ ENV kimlik bilgileri DB'ye kaydedildi: ${shopDomain}`);
    }
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      console.warn('syncEnvApiKeyToDB: shopify_credentials tablosu yok — ENV kullanılacak');
      return;
    }
    console.error('syncEnvApiKeyToDB error:', err);
  }
}

export async function syncNewTokenToDB(): Promise<void> {
  const newToken =
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_ACCESS_TOKEN ||
    process.env.SHOPIFY_APP_SECRET_NEW;
  const shopDomain = envShopDomain();

  if (!newToken || !shopDomain) return;

  if (process.env.SHOPIFY_APP_SECRET_NEW && !process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && !process.env.SHOPIFY_ACCESS_TOKEN) {
    console.warn(
      '[SHOPIFY] SHOPIFY_APP_SECRET_NEW kullanılıyor — bu isim yanıltıcı. SHOPIFY_ADMIN_ACCESS_TOKEN kullanın.',
    );
  }

  try {
    const rows = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.shopDomain, shopDomain))
      .limit(1);

    if (rows.length > 0) {
      if (rows[0].accessToken === newToken) return;
      await db
        .update(shopifyCredentials)
        .set({ accessToken: newToken, isActive: true, updatedAt: new Date() } as any)
        .where(eq(shopifyCredentials.shopDomain, shopDomain));
    } else {
      await db.insert(shopifyCredentials).values({
        shopDomain,
        apiKey: '',
        apiSecret: '',
        accessToken: newToken,
        isActive: true,
      } as any);
    }
    console.log(`✅ Admin access token DB'ye senkronize edildi: ${shopDomain}`);
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      console.warn('syncNewTokenToDB: shopify_credentials tablosu yok — atlandı');
      return;
    }
    console.error('syncNewTokenToDB error:', err);
  }
}

export async function saveShopifyCredentials(data: {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
}): Promise<void> {
  const cleanDomain = normalizeShopDomain(data.shopDomain);
  const existing = await db
    .select()
    .from(shopifyCredentials)
    .where(eq(shopifyCredentials.shopDomain, cleanDomain))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(shopifyCredentials)
      .set({
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        ...(data.accessToken ? { accessToken: data.accessToken } : {}),
        updatedAt: new Date(),
      } as any)
      .where(eq(shopifyCredentials.shopDomain, cleanDomain));
  } else {
    await db.insert(shopifyCredentials).values({
      shopDomain: cleanDomain,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      accessToken: data.accessToken || null,
      isActive: true,
    } as any);
  }
}

export async function saveDirectAccessToken(shopDomain: string, accessToken: string): Promise<void> {
  const cleanDomain = normalizeShopDomain(shopDomain);
  await db.update(shopifyCredentials).set({ isActive: false, updatedAt: new Date() } as any);

  const existing = await db
    .select()
    .from(shopifyCredentials)
    .where(eq(shopifyCredentials.shopDomain, cleanDomain))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(shopifyCredentials)
      .set({ accessToken, isActive: true, updatedAt: new Date() } as any)
      .where(eq(shopifyCredentials.shopDomain, cleanDomain));
  } else {
    await db.insert(shopifyCredentials).values({
      shopDomain: cleanDomain,
      apiKey: '',
      apiSecret: '',
      accessToken,
      isActive: true,
    } as any);
  }
}

export async function saveShopifyAccessToken(shopDomain: string, accessToken: string): Promise<void> {
  const cleanDomain = normalizeShopDomain(shopDomain);
  const existing = await db
    .select()
    .from(shopifyCredentials)
    .where(eq(shopifyCredentials.shopDomain, cleanDomain))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(shopifyCredentials)
      .set({ accessToken, isActive: true, updatedAt: new Date() } as any)
      .where(eq(shopifyCredentials.shopDomain, cleanDomain));
  } else {
    await db.insert(shopifyCredentials).values({
      shopDomain: cleanDomain,
      apiKey: '',
      apiSecret: '',
      accessToken,
      isActive: true,
    } as any);
  }
}

export async function deleteShopifyCredentials(shopDomain: string): Promise<void> {
  const cleanDomain = normalizeShopDomain(shopDomain);
  await db
    .update(shopifyCredentials)
    .set({ isActive: false, updatedAt: new Date() } as any)
    .where(eq(shopifyCredentials.shopDomain, cleanDomain));
}
