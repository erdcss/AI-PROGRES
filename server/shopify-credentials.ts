import { db } from './db';
import { shopifyCredentials } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  apiKey?: string;
  apiSecret?: string;
}

/**
 * Aktif Shopify kimlik bilgilerini alır.
 * Öncelik: DB (kullanıcının UI'dan girdiği güncel token) > ENV değişkenleri
 * Bu sayede kullanıcı ayarlar diyaloğundan yeni token girebilir ve hemen geçerli olur.
 */
export async function getShopifyConfig(): Promise<ShopifyConfig | null> {
  // 1. DB'yi önce kontrol et (kullanıcı UI'dan güncel token girmiş olabilir)
  try {
    const rows = await db
      .select()
      .from(shopifyCredentials)
      .where(eq(shopifyCredentials.isActive, true))
      .orderBy(desc(shopifyCredentials.updatedAt))
      .limit(1);

    const cred = rows[0];
    if (cred && cred.shopDomain && cred.accessToken) {
      return {
        shopDomain: cred.shopDomain,
        accessToken: cred.accessToken,
        apiKey: cred.apiKey,
        apiSecret: cred.apiSecret
      };
    }
  } catch (err) {
    console.error('getShopifyConfig DB error:', err);
  }

  // 2. DB'de yoksa ENV değişkenlerine bak
  const envShopDomain =
    process.env.SHOPIFY_SHOP_DOMAIN ||
    process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '') ||
    process.env.SHOPIFY_STORE_DOMAIN;
  const envAccessToken =
    process.env.SHOPIFY_ACCESS_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (envShopDomain && envAccessToken) {
    return { shopDomain: envShopDomain, accessToken: envAccessToken };
  }

  return null;
}

/**
 * Kimlik bilgilerini DB'ye kaydeder (upsert benzeri - var olanı günceller)
 */
export async function saveShopifyCredentials(data: {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
}): Promise<void> {
  const existing = await db
    .select()
    .from(shopifyCredentials)
    .where(eq(shopifyCredentials.shopDomain, data.shopDomain))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(shopifyCredentials)
      .set({
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        ...(data.accessToken ? { accessToken: data.accessToken } : {}),
        updatedAt: new Date()
      })
      .where(eq(shopifyCredentials.shopDomain, data.shopDomain));
  } else {
    await db.insert(shopifyCredentials).values({
      shopDomain: data.shopDomain,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      accessToken: data.accessToken || null,
      isActive: true
    });
  }
}

/**
 * Doğrudan Admin API access token'ı kaydeder (OAuth olmadan)
 * UI'dan kullanıcı token'ı paste edebilir.
 */
export async function saveDirectAccessToken(shopDomain: string, accessToken: string): Promise<void> {
  const existing = await db
    .select()
    .from(shopifyCredentials)
    .where(eq(shopifyCredentials.shopDomain, shopDomain))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(shopifyCredentials)
      .set({ accessToken, isActive: true, updatedAt: new Date() })
      .where(eq(shopifyCredentials.shopDomain, shopDomain));
  } else {
    // Yeni kayıt oluştur (API key/secret olmadan sadece domain + token)
    await db.insert(shopifyCredentials).values({
      shopDomain,
      apiKey: '',
      apiSecret: '',
      accessToken,
      isActive: true
    });
  }
}

/**
 * OAuth access token'ı DB'ye kaydeder
 */
export async function saveShopifyAccessToken(shopDomain: string, accessToken: string): Promise<void> {
  await db
    .update(shopifyCredentials)
    .set({ accessToken, updatedAt: new Date() })
    .where(eq(shopifyCredentials.shopDomain, shopDomain));
}

/**
 * Tüm aktif kimlik bilgilerini siler
 */
export async function deleteShopifyCredentials(shopDomain: string): Promise<void> {
  await db
    .update(shopifyCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(shopifyCredentials.shopDomain, shopDomain));
}
