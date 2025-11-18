import axios from 'axios';
import { db } from './db';
import { products, productVariants, shopifyTransferredProducts } from '@shared/schema';
import { eq, or } from 'drizzle-orm';

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

export class ShopifyProductsManager {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string = '2024-01';

  constructor() {
    this.shopDomain = process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '') || '';
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN || '';
    
    if (!this.shopDomain || !this.accessToken) {
      throw new Error('Shopify API bilgileri eksik: SHOPIFY_STORE_URL ve SHOPIFY_ACCESS_TOKEN gerekli');
    }
  }

  private get baseUrl(): string {
    return `https://${this.shopDomain}/admin/api/${this.apiVersion}`;
  }

  private get headers() {
    return {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json'
    };
  }

  // Shopify'dan tüm ürünleri çek
  async fetchAllShopifyProducts(): Promise<ShopifyProduct[]> {
    try {
      console.log('🛍️ Shopify ürünleri çekiliyor...');
      
      let allProducts: ShopifyProduct[] = [];
      let pageInfo = null;
      let hasNextPage = true;
      let pageCount = 0;

      while (hasNextPage && pageCount < 50) { // Güvenlik için maksimum 50 sayfa
        pageCount++;
        
        let url = `${this.baseUrl}/products.json?limit=250`;
        if (pageInfo) {
          url += `&page_info=${pageInfo}`;
        }

        const response = await axios.get(url, { headers: this.headers });
        const products = response.data.products;
        
        allProducts.push(...products);
        
        // Pagination kontrolü
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
    try {
      const response = await axios.get(`${this.baseUrl}/products/${productId}.json`, { 
        headers: this.headers 
      });
      return response.data.product;
    } catch (error: any) {
      console.error(`❌ Shopify ürün çekme hatası (ID: ${productId}):`, error.response?.data || error.message);
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
    }
  }> {
    try {
      console.log('🔄 Shopify ürünleri ile veritabanı eşleştirmesi başlatılıyor...');
      
      // 1. Shopify ürünlerini çek
      const shopifyProducts = await this.fetchAllShopifyProducts();
      
      // 2. Veritabanından transferred products listesini çek
      const dbTransferredProducts = await db
        .select()
        .from(shopifyTransferredProducts)
        .orderBy(shopifyTransferredProducts.createdAt);
      
      // 3. Veritabanından takip edilen URL'leri çek
      const dbProducts = await db
        .select()
        .from(products)
        .orderBy(products.createdAt);

      console.log(`📊 Karşılaştırma: ${shopifyProducts.length} Shopify ürünü vs ${dbTransferredProducts.length} transfer kaydı`);

      const matchedProducts: Array<{
        dbProduct: any;
        shopifyProduct: ShopifyProduct;
        matchType: 'exact' | 'fuzzy' | 'sku';
      }> = [];
      
      const unmatchedDb: any[] = [];
      const orphanedShopify: ShopifyProduct[] = [];

      // 4. Eşleştirme algoritması
      for (const dbProduct of dbTransferredProducts) {
        let matched = false;
        
        // Exact match: Shopify Product ID ile
        if (dbProduct.shopifyProductId) {
          const shopifyProduct = shopifyProducts.find(sp => 
            sp.id.toString() === dbProduct.shopifyProductId
          );
          
          if (shopifyProduct) {
            matchedProducts.push({
              dbProduct,
              shopifyProduct,
              matchType: 'exact'
            });
            matched = true;
            continue;
          }
        }

        // Fuzzy match: Title benzerliği ile
        if (!matched) {
          const shopifyProduct = shopifyProducts.find(sp => {
            const dbTitle = dbProduct.title?.toLowerCase() || '';
            const shopifyTitle = sp.title.toLowerCase();
            
            // Basit benzerlik kontrolü - kelimelerin %70'i eşleşiyorsa match
            const dbWords = dbTitle.split(/\s+/).filter(w => w.length > 2);
            const shopifyWords = shopifyTitle.split(/\s+/).filter(w => w.length > 2);
            
            if (dbWords.length === 0 || shopifyWords.length === 0) return false;
            
            const matchedWords = dbWords.filter(dbWord => 
              shopifyWords.some(shopifyWord => 
                dbWord.includes(shopifyWord) || shopifyWord.includes(dbWord)
              )
            );
            
            return matchedWords.length / dbWords.length >= 0.7;
          });

          if (shopifyProduct) {
            matchedProducts.push({
              dbProduct,
              shopifyProduct,
              matchType: 'fuzzy'
            });
            matched = true;
          }
        }

        if (!matched) {
          unmatchedDb.push(dbProduct);
        }
      }

      // 5. Orphaned Shopify ürünlerini bul (veritabanında karşılığı olmayan)
      const matchedShopifyIds = matchedProducts.map(mp => mp.shopifyProduct.id.toString());
      const allDbShopifyIds = dbTransferredProducts
        .map(dp => dp.shopifyProductId)
        .filter(id => id !== null);

      for (const shopifyProduct of shopifyProducts) {
        if (!matchedShopifyIds.includes(shopifyProduct.id.toString()) && 
            !allDbShopifyIds.includes(shopifyProduct.id.toString())) {
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
          orphanedShopify
        }
      };

    } catch (error: any) {
      console.error('❌ Veritabanı eşleştirme hatası:', error);
      throw error;
    }
  }

  // Eşleşen ürünlerin kaynak sitelerinden güncel fiyat/stok bilgisi çek
  async refreshMatchedProducts(matchedProducts: Array<{
    dbProduct: any;
    shopifyProduct: ShopifyProduct;
    matchType: string;
  }>): Promise<{
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
    }>
  }> {
    console.log(`🔄 ${matchedProducts.length} eşleşen ürün için kaynak sitelerden güncel bilgi çekiliyor...`);
    
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
        
        // Kaynak URL'den güncel bilgi çek
        const sourceUrl = dbProduct.sourceUrl;
        if (!sourceUrl) {
          updateDetails.push({
            product: dbProduct,
            success: false,
            error: 'Kaynak URL bulunamadı'
          });
          errors++;
          continue;
        }

        // Ürün extraction işlemi
        const { fixedAuthenticScrape } = await import('./fixed-authentic-scraper');
        const extractionResult = await fixedAuthenticScrape(sourceUrl);

        if (!extractionResult.success) {
          updateDetails.push({
            product: dbProduct,
            success: false,
            error: 'Ürün bilgisi çekilemedi'
          });
          errors++;
          continue;
        }

        const oldPrice = parseFloat(dbProduct.originalPrice || '0');
        const newPrice = typeof extractionResult.price === 'number' 
          ? extractionResult.price 
          : (extractionResult.price as any)?.original || 0;
        const priceChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

        // Stok durumu kontrolü
        const stockStatus = extractionResult.variants?.some(v => v.inStock) ? 'in_stock' : 'out_of_stock';

        updateDetails.push({
          product: dbProduct,
          success: true,
          oldPrice,
          newPrice,
          priceChange,
          stockStatus
        });

        updated++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        console.error(`❌ Ürün güncelleme hatası (${dbProduct.productTitle}):`, error.message);
        updateDetails.push({
          product: dbProduct,
          success: false,
          error: error.message
        });
        errors++;
      }
    }

    console.log(`✅ Güncelleme tamamlandı: ${updated} başarılı, ${errors} hata`);
    
    return {
      updated,
      errors,
      details: updateDetails
    };
  }

  // Test bağlantısı
  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/shop.json`, { 
        headers: this.headers 
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