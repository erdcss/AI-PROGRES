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
 * Öncelik: DB (UI'dan girilmiş) > SHOPIFY_ACCESS_TOKEN > SHOPIFY_ADMIN_ACCESS_TOKEN > SHOPIFY_APP_SECRET_NEW
 */
export async function getShopifyConfig(): Promise<ShopifyConfig | null> {
  const shopDomainFromEnv =
    process.env.SHOPIFY_SHOP_DOMAIN ||
    process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
    process.env.SHOPIFY_STORE_DOMAIN;

  // 1. DB'yi önce kontrol et (kullanıcı UI'dan token girmiş olabilir)
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

  // 2. ENV token'larını kontrol et — en son güncellenen önce
  const envAccessToken =
    process.env.SHOPIFY_ACCESS_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_APP_SECRET_NEW;

  if (shopDomainFromEnv && envAccessToken) {
    return { shopDomain: shopDomainFromEnv, accessToken: envAccessToken };
  }

  return null;
}

/**
 * Sunucu başlangıcında SHOPIFY_API_KEY + SHOPIFY_APP_SHARED_SECRET ENV değişkenlerini
 * DB'deki mağaza kaydına otomatik olarak yazar.
 * Bu sayede OAuth formu önceden dolu gelir ve kullanıcı sadece "Yetkilendir" butonuna basar.
 */
export async function syncEnvApiKeyToDB(): Promise<void> {
  const apiKey    = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_APP_SHARED_SECRET;
  const shopDomain = (
    process.env.SHOPIFY_SHOP_DOMAIN ||
    process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
    (process.env as any).SHOPIFY_STORE_DOMAIN
  );

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
            updatedAt: new Date()
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
        isActive: false
      });
      console.log(`✅ ENV kimlik bilgileri DB'ye kaydedildi: ${shopDomain}`);
    }
  } catch (err) {
    console.error('syncEnvApiKeyToDB error:', err);
  }
}

/**
 * Sunucu başlangıcında SHOPIFY_APP_SECRET_NEW'ı DB'ye otomatik senkronize eder.
 * Bu sayede sistem yeniden başlatılınca yeni token hemen aktif olur.
 */
export async function syncNewTokenToDB(): Promise<void> {
  const newToken = process.env.SHOPIFY_APP_SECRET_NEW;
  const shopDomain = (
    process.env.SHOPIFY_SHOP_DOMAIN ||
    process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
    process.env.SHOPIFY_STORE_DOMAIN
  );

  if (!newToken || !shopDomain) return;

  try {
    const rows = await db.select().from(shopifyCredentials)
      .where(eq(shopifyCredentials.shopDomain, shopDomain))
      .limit(1);

    if (rows.length > 0) {
      if (rows[0].accessToken === newToken) return; // Zaten güncel
      await db.update(shopifyCredentials)
        .set({ accessToken: newToken, isActive: true, updatedAt: new Date() })
        .where(eq(shopifyCredentials.shopDomain, shopDomain));
    } else {
      await db.insert(shopifyCredentials).values({
        shopDomain,
        apiKey: '',
        apiSecret: '',
        accessToken: newToken,
        isActive: true
      });
    }
    console.log(`✅ SHOPIFY_APP_SECRET_NEW DB'ye senkronize edildi: ${shopDomain}`);
  } catch (err) {
    console.error('syncNewTokenToDB error:', err);
  }
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
  // Diğer tüm aktif kayıtları devre dışı bırak (tek aktif mağaza olsun)
  await db
    .update(shopifyCredentials)
    .set({ isActive: false, updatedAt: new Date() });

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
 * OAuth access token'ı DB'ye kaydeder ve kaydı aktif yapar.
 * isActive = true yapılmazsa getShopifyConfig() bu kaydı bulamaz!
 */
export async function saveShopifyAccessToken(shopDomain: string, accessToken: string): Promise<void> {
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
    // Kayıt yoksa oluştur (apiKey/apiSecret olmadan)
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
 * Tüm aktif kimlik bilgilerini siler
 */
export async function deleteShopifyCredentials(shopDomain: string): Promise<void> {
  await db
    .update(shopifyCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(shopifyCredentials.shopDomain, shopDomain));
}
