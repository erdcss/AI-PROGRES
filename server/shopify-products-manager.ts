import axios from 'axios';
import { db } from './db';
import { shopifyTransferredProducts } from '@shared/schema';
import { resolveShopifyCredentials, ShopifyCredentialsError } from './shopify-credentials';

interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  handle: string;
  status: string;
  created_at: string;
  updated_at: string;
  tags: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  inventory_management: string;
  compare_at_price?: string;
  option1?: string;
  option2?: string;
  option3?: string;
}

interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
  alt: string;
  position: number;
}

interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
}

export { ShopifyCredentialsError } from './shopify-credentials';

export class ShopifyProductsManager {
  private apiVersion: string = '2024-01';

  constructor() {
    const hasEnvToken = !!(
      process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN
    );
    const hasEnvDomain = !!(
      process.env.SHOPIFY_SHOP_DOMAIN ||
      process.env.SHOPIFY_STORE_URL ||
      process.env.SHOPIFY_STORE_DOMAIN
    );

    if (!hasEnvToken) {
      console.warn(
        '⚠️ Shopify Products Manager: SHOPIFY_ACCESS_TOKEN tanımlı değil — runtime\'da DB OAuth tokenı veya ENV kimlik bilgileri kullanılacak.'
      );
    }
    if (!hasEnvDomain) {
      console.warn(
        '⚠️ Shopify Products Manager: SHOPIFY_STORE_URL / SHOPIFY_SHOP_DOMAIN tanımlı değil — mağaza adresi DB veya ENV\'den alınacak.'
      );
    }
  }

  private static cleanDomain(domain: string): string {
    return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  private async resolveCredentials(): Promise<ShopifyCredentials> {
    const cred = await resolveShopifyCredentials();
    return {
      shopDomain: ShopifyProductsManager.cleanDomain(cred.shopDomain),
      accessToken: cred.accessToken,
    };
  }

  private baseUrl(shopDomain: string): string {
    return `https://${shopDomain}/admin/api/${this.apiVersion}`;
  }

  private headers(accessToken: string) {
    return {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    };
  }

  // Shopify'dan tüm ürünleri çek
  async fetchAllShopifyProducts(): Promise<ShopifyProduct[]> {
    let creds: ShopifyCredentials;
    try {
      creds = await this.resolveCredentials();
    } catch (error) {
      if (error instanceof ShopifyCredentialsError) throw error;
      throw new ShopifyCredentialsError();
    }

    try {
      console.log('🛍️ Shopify ürünleri çekiliyor...');

      let allProducts: ShopifyProduct[] = [];
      let pageInfo: string | null = null;
      let hasNextPage = true;
      let pageCount = 0;

      while (hasNextPage && pageCount < 50) {
        pageCount++;

        let url = `${this.baseUrl(creds.shopDomain)}/products.json?limit=250`;
        if (pageInfo) {
          url += `&page_info=${pageInfo}`;
        }

        const response = await axios.get(url, { headers: this.headers(creds.accessToken) });
        const products = response.data.products;

        allProducts.push(...products);

        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const nextPageMatch = linkHeader.match(/<[^>]*page_info=([^&>]*).*rel="next"/);
          pageInfo = nextPageMatch ? nextPageMatch[1] : null;
        } else {
          hasNextPage = false;
        }

        console.log(`📄 Sayfa ${pageCount}: ${products.length} ürün çekildi`);
      }

      console.log(`✅ Toplam ${allProducts.length} Shopify ürünü çekildi`);
      return allProducts;
    } catch (error: any) {
      console.error('❌ Shopify ürün çekme hatası:', error.response?.data || error.message);
      throw new Error(`Shopify API hatası: ${error.response?.data?.errors || error.message}`);
    }
  }

  // Belirli bir Shopify ürününü ID ile çek
  async fetchShopifyProduct(productId: string): Promise<ShopifyProduct | null> {
    let creds: ShopifyCredentials;
    try {
      creds = await this.resolveCredentials();
    } catch (error) {
      if (error instanceof ShopifyCredentialsError) {
        console.error(`❌ Shopify ürün çekme hatası (ID: ${productId}):`, error.message);
        return null;
      }
      return null;
    }

    try {
      const response = await axios.get(
        `${this.baseUrl(creds.shopDomain)}/products/${productId}.json`,
        { headers: this.headers(creds.accessToken) }
      );
      return response.data.product;
    } catch (error: any) {
      console.error(
        `❌ Shopify ürün çekme hatası (ID: ${productId}):`,
        error.response?.data || error.message
      );
      return null;
    }
  }

  // Hafızadaki ürünler ile Shopify ürünlerini eşleştir
  async syncWithDatabase(): Promise<{
    matched: number;
    unmatched: number;
    orphaned: number;
    details: {
      matchedProducts: Array<{
        dbProduct: any;
        shopifyProduct: ShopifyProduct;
        matchType: 'exact' | 'fuzzy' | 'sku';
      }>;
      unmatchedDb: any[];
      orphanedShopify: ShopifyProduct[];
    };
  }> {
    try {
      console.log('🔄 Shopify ürünleri ile veritabanı eşleştirmesi başlatılıyor...');

      const shopifyProducts = await this.fetchAllShopifyProducts();

      const dbTransferredProducts = await db
        .select()
        .from(shopifyTransferredProducts)
        .orderBy(shopifyTransferredProducts.createdAt);

      console.log(
        `📊 Karşılaştırma: ${shopifyProducts.length} Shopify ürünü vs ${dbTransferredProducts.length} transfer kaydı`
      );

      const matchedProducts: Array<{
        dbProduct: any;
        shopifyProduct: ShopifyProduct;
        matchType: 'exact' | 'fuzzy' | 'sku';
      }> = [];

      const unmatchedDb: any[] = [];
      const orphanedShopify: ShopifyProduct[] = [];

      for (const dbProduct of dbTransferredProducts) {
        let matched = false;

        if (dbProduct.shopifyProductId) {
          const shopifyProduct = shopifyProducts.find(
            (sp) => sp.id.toString() === dbProduct.shopifyProductId
          );

          if (shopifyProduct) {
            matchedProducts.push({
              dbProduct,
              shopifyProduct,
              matchType: 'exact',
            });
            matched = true;
            continue;
          }
        }

        if (!matched) {
          const shopifyProduct = shopifyProducts.find((sp) => {
            const dbTitle = dbProduct.title?.toLowerCase() || '';
            const shopifyTitle = sp.title.toLowerCase();

            const dbWords = dbTitle.split(/\s+/).filter((w) => w.length > 2);
            const shopifyWords = shopifyTitle.split(/\s+/).filter((w) => w.length > 2);

            if (dbWords.length === 0 || shopifyWords.length === 0) return false;

            const matchedWords = dbWords.filter((dbWord) =>
              shopifyWords.some(
                (shopifyWord) => dbWord.includes(shopifyWord) || shopifyWord.includes(dbWord)
              )
            );

            return matchedWords.length / dbWords.length >= 0.7;
          });

          if (shopifyProduct) {
            matchedProducts.push({
              dbProduct,
              shopifyProduct,
              matchType: 'fuzzy',
            });
            matched = true;
          }
        }

        if (!matched) {
          unmatchedDb.push(dbProduct);
        }
      }

      const matchedShopifyIds = matchedProducts.map((mp) => mp.shopifyProduct.id.toString());
      const allDbShopifyIds = dbTransferredProducts
        .map((dp) => dp.shopifyProductId)
        .filter((id) => id !== null);

      for (const shopifyProduct of shopifyProducts) {
        if (
          !matchedShopifyIds.includes(shopifyProduct.id.toString()) &&
          !allDbShopifyIds.includes(shopifyProduct.id.toString())
        ) {
          orphanedShopify.push(shopifyProduct);
        }
      }

      console.log(`✅ Eşleştirme tamamlandı:`);
      console.log(`   📌 Eşleşen: ${matchedProducts.length}`);
      console.log(`   ❓ Eşleşmeyen DB: ${unmatchedDb.length}`);
      console.log(`   🏝️ Yalnız Shopify: ${orphanedShopify.length}`);

      return {
        matched: matchedProducts.length,
        unmatched: unmatchedDb.length,
        orphaned: orphanedShopify.length,
        details: {
          matchedProducts,
          unmatchedDb,
          orphanedShopify,
        },
      };
    } catch (error: any) {
      console.error('❌ Veritabanı eşleştirme hatası:', error);
      throw error;
    }
  }

  // Eşleşen ürünlerin kaynak sitelerinden güncel fiyat/stok bilgisi çek
  async refreshMatchedProducts(
    matchedProducts: Array<{
      dbProduct: any;
      shopifyProduct: ShopifyProduct;
      matchType: string;
    }>
  ): Promise<{
    updated: number;
    errors: number;
    details: Array<{
      product: any;
      success: boolean;
      oldPrice?: number;
      newPrice?: number;
      priceChange?: number;
      stockStatus?: string;
      error?: string;
    }>;
  }> {
    console.log(
      `🔄 ${matchedProducts.length} eşleşen ürün için kaynak sitelerden güncel bilgi çekiliyor...`
    );

    const updateDetails: Array<{
      product: any;
      success: boolean;
      oldPrice?: number;
      newPrice?: number;
      priceChange?: number;
      stockStatus?: string;
      error?: string;
    }> = [];

    let updated = 0;
    let errors = 0;

    for (const { dbProduct, shopifyProduct } of matchedProducts) {
      try {
        console.log(`🔍 Güncelleniyor: ${dbProduct.productTitle}`);

        const sourceUrl = dbProduct.sourceUrl;
        if (!sourceUrl) {
          updateDetails.push({
            product: dbProduct,
            success: false,
            error: 'Kaynak URL bulunamadı',
          });
          errors++;
          continue;
        }

        const { fixedAuthenticScrape } = await import('./fixed-authentic-scraper');
        const extractionResult = await fixedAuthenticScrape(sourceUrl);

        if (!extractionResult.success) {
          updateDetails.push({
            product: dbProduct,
            success: false,
            error: 'Ürün bilgisi çekilemedi',
          });
          errors++;
          continue;
        }

        const oldPrice = parseFloat(dbProduct.originalPrice || '0');
        const newPrice =
          typeof extractionResult.price === 'number'
            ? extractionResult.price
            : (extractionResult.price as any)?.original || 0;
        const priceChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

        const stockStatus = extractionResult.variants?.some((v) => v.inStock)
          ? 'in_stock'
          : 'out_of_stock';

        updateDetails.push({
          product: dbProduct,
          success: true,
          oldPrice,
          newPrice,
          priceChange,
          stockStatus,
        });

        updated++;

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`❌ Ürün güncelleme hatası (${dbProduct.productTitle}):`, error.message);
        updateDetails.push({
          product: dbProduct,
          success: false,
          error: error.message,
        });
        errors++;
      }
    }

    console.log(`✅ Güncelleme tamamlandı: ${updated} başarılı, ${errors} hata`);

    return {
      updated,
      errors,
      details: updateDetails,
    };
  }

  // Test bağlantısı
  async testConnection(): Promise<boolean> {
    let creds: ShopifyCredentials;
    try {
      creds = await this.resolveCredentials();
    } catch (error) {
      if (error instanceof ShopifyCredentialsError) {
        console.warn('⚠️ Shopify bağlantı testi atlandı:', error.message);
      }
      return false;
    }

    try {
      const response = await axios.get(`${this.baseUrl(creds.shopDomain)}/shop.json`, {
        headers: this.headers(creds.accessToken),
      });

      console.log(`✅ Shopify bağlantı testi başarılı: ${response.data.shop.name}`);
      return true;
    } catch (error: any) {
      console.error('❌ Shopify bağlantı testi başarısız:', error.response?.data || error.message);
      return false;
    }
  }
}

export const shopifyProductsManager = new ShopifyProductsManager();
