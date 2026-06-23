import { db } from './db';
import { shopifyCredentials } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  apiKey?: string;
  apiSecret?: string;
}

export type ShopifyCredentialSource = 'db' | 'env_admin' | 'env_access' | 'env_legacy';

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

/** Strip protocol/trailing slash; prefer myshopify.com when SHOPIFY_SHOP_DOMAIN is set. */
export function normalizeShopDomain(domain: string): string {
  if (!domain) return '';
  let d = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();

  const preferredMyshopify =
    process.env.SHOPIFY_SHOP_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '';
  if (preferredMyshopify.includes('.myshopify.com') && !d.includes('.myshopify.com')) {
    d = preferredMyshopify;
  }

  return d;
}

function envShopDomain(): string {
  return normalizeShopDomain(
    process.env.SHOPIFY_SHOP_DOMAIN ||
      process.env.SHOPIFY_STORE_URL ||
      process.env.SHOPIFY_STORE_DOMAIN ||
      ''
  );
}

function isDeprecatedToken(token: string): boolean {
  return token.startsWith('shpss_');
}

/**
 * Tek credential resolver — tüm Shopify API çağrıları bunu kullanmalı.
 * Öncelik: DB aktif token → SHOPIFY_ADMIN_ACCESS_TOKEN → SHOPIFY_ACCESS_TOKEN → SHOPIFY_APP_SECRET_NEW
 */
export async function resolveShopifyCredentials(): Promise<ResolvedShopifyCredentials> {
  // 1. DB — aktif OAuth / Admin token
  try {
    const rows = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.isActive, true))
      .orderBy(desc(shopifyCredentials.updatedAt))
      .limit(1);

    const cred = rows[0];
    if (cred?.shopDomain && cred.accessToken && !isDeprecatedToken(cred.accessToken)) {
      return {
        shopDomain: normalizeShopDomain(cred.shopDomain),
        accessToken: cred.accessToken,
        apiKey: cred.apiKey,
        apiSecret: cred.apiSecret,
        source: 'db',
      };
    }
  } catch (err) {
    console.error('resolveShopifyCredentials DB error:', err);
  }

  const shopDomain = envShopDomain();
  const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const legacyToken = process.env.SHOPIFY_APP_SECRET_NEW;

  if (shopDomain && adminToken && !isDeprecatedToken(adminToken)) {
    return { shopDomain, accessToken: adminToken, source: 'env_admin' };
  }
  if (shopDomain && accessToken && !isDeprecatedToken(accessToken)) {
    return { shopDomain, accessToken, source: 'env_access' };
  }
  if (shopDomain && legacyToken && !isDeprecatedToken(legacyToken)) {
    return { shopDomain, accessToken: legacyToken, source: 'env_legacy' };
  }

  throw new ShopifyCredentialsError();
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
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_APP_SHARED_SECRET;
  const shopDomain = envShopDomain();

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
          })
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
      });
      console.log(`✅ ENV kimlik bilgileri DB'ye kaydedildi: ${shopDomain}`);
    }
  } catch (err) {
    console.error('syncEnvApiKeyToDB error:', err);
  }
}

export async function syncNewTokenToDB(): Promise<void> {
  const newToken = process.env.SHOPIFY_APP_SECRET_NEW;
  const shopDomain = envShopDomain();

  if (!newToken || !shopDomain) return;

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
        .set({ accessToken: newToken, isActive: true, updatedAt: new Date() })
        .where(eq(shopifyCredentials.shopDomain, shopDomain));
    } else {
      await db.insert(shopifyCredentials).values({
        shopDomain,
        apiKey: '',
        apiSecret: '',
        accessToken: newToken,
        isActive: true,
      });
    }
    console.log(`✅ SHOPIFY_APP_SECRET_NEW DB'ye senkronize edildi: ${shopDomain}`);
  } catch (err) {
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
      })
      .where(eq(shopifyCredentials.shopDomain, cleanDomain));
  } else {
    await db.insert(shopifyCredentials).values({
      shopDomain: cleanDomain,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      accessToken: data.accessToken || null,
      isActive: true,
    });
  }
}

export async function saveDirectAccessToken(shopDomain: string, accessToken: string): Promise<void> {
  const cleanDomain = normalizeShopDomain(shopDomain);
  await db.update(shopifyCredentials).set({ isActive: false, updatedAt: new Date() });

  const existing = await db
    .select()
    .from(shopifyCredentials)
    .where(eq(shopifyCredentials.shopDomain, cleanDomain))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(shopifyCredentials)
      .set({ accessToken, isActive: true, updatedAt: new Date() })
      .where(eq(shopifyCredentials.shopDomain, cleanDomain));
  } else {
    await db.insert(shopifyCredentials).values({
      shopDomain: cleanDomain,
      apiKey: '',
      apiSecret: '',
      accessToken,
      isActive: true,
    });
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
      .set({ accessToken, isActive: true, updatedAt: new Date() })
      .where(eq(shopifyCredentials.shopDomain, cleanDomain));
  } else {
    await db.insert(shopifyCredentials).values({
      shopDomain: cleanDomain,
      apiKey: '',
      apiSecret: '',
      accessToken,
      isActive: true,
    });
  }
}

export async function deleteShopifyCredentials(shopDomain: string): Promise<void> {
  const cleanDomain = normalizeShopDomain(shopDomain);
  await db
    .update(shopifyCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(shopifyCredentials.shopDomain, cleanDomain));
}
