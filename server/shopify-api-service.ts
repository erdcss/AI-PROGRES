import axios from 'axios';
import { db } from './db';
import { shopifyMemoryProducts } from '@shared/schema';
import { eq, desc, count, max } from 'drizzle-orm';
import { randomUUID } from 'crypto';

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string;
  status: string;
  created_at: string;
  updated_at: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options: ShopifyOption[];
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  compare_at_price?: string;
  sku?: string;
  barcode?: string;
  inventory_quantity: number;
  inventory_policy: string;
  weight: number;
  weight_unit: string;
  option1?: string;
  option2?: string;
  option3?: string;
}

interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
  alt?: string;
  position: number;
  variant_ids: number[];
}

interface ShopifyOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export class ShopifyApiService {
  private storeUrl: string;
  private accessToken: string;
  private baseUrl: string;

  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL || '';
    this.accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
    
    if (!this.storeUrl || !this.accessToken) {
      throw new Error('Shopify API credentials missing. Please set SHOPIFY_STORE_URL and SHOPIFY_ADMIN_ACCESS_TOKEN');
    }
    
    // .myshopify.com uzantısını temizle
    const cleanStoreUrl = this.storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.baseUrl = `https://${cleanStoreUrl}/admin/api/2024-10/`;
    
    console.log(`🛍️ Shopify API Service initialized: ${cleanStoreUrl}`);
  }

  // Shopify API request helper
  private async makeRequest(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: any) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        data
      };

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`❌ Shopify API error for ${endpoint}:`);
      console.error('Status:', error.response?.status);
      console.error('Headers:', error.response?.headers);
      console.error('Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Original message:', error.message);
      throw error;
    }
  }

  // Tüm ürünleri çek ve hafızaya kaydet
  async syncAllProducts(): Promise<{ success: boolean; totalProducts: number; newProducts: number; updatedProducts: number }> {
    try {
      console.log('🔄 Shopify ürün senkronizasyonu başlatılıyor...');
      
      // Basit tek istek ile ürünleri çek (maksimum 50 ürün)
      const limit = 50;
      console.log(`📄 Shopify'dan ${limit} ürün çekiliyor...`);
      
      const response = await this.makeRequest(`products.json?limit=${limit}&fields=id,title,handle,vendor,product_type,tags,status,created_at,updated_at,variants,images,options`);
      
      let allProducts: ShopifyProduct[] = [];
      if (response.products && Array.isArray(response.products)) {
        allProducts = response.products;
        console.log(`✅ ${allProducts.length} ürün başarıyla çekildi`);
      } else {
        console.log('⚠️ Shopify API\'dan ürün bulunamadı veya yanıt formatı beklenmeyen');
      }

      console.log(`📦 Toplam ${allProducts.length} ürün bulundu`);

      let newProducts = 0;
      let updatedProducts = 0;

      // Her ürünü hafızaya kaydet
      for (const product of allProducts) {
        try {
          // Benzersiz takip ID oluştur
          const uniqueTrackingId = `shopify_${product.id}_${randomUUID().split('-')[0]}`;
          
          // Ana varyant (ilk varyant) fiyatını al
          const mainVariant = product.variants[0];
          const price = mainVariant ? parseFloat(mainVariant.price) : 0;
          const compareAtPrice = mainVariant?.compare_at_price ? parseFloat(mainVariant.compare_at_price) : null;
          
          // Mevcut kaydı kontrol et
          const [existing] = await db
            .select()
            .from(shopifyMemoryProducts)
            .where(eq(shopifyMemoryProducts.shopifyProductId, product.id.toString()));

          const productData = {
            uniqueTrackingId: existing?.uniqueTrackingId || uniqueTrackingId,
            shopifyProductId: product.id.toString(),
            shopifyVariantId: mainVariant?.id.toString() || null,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor || null,
            productType: product.product_type || null,
            tags: product.tags ? product.tags.split(',').map(tag => tag.trim()) : [],
            status: product.status,
            price: price,
            compareAtPrice: compareAtPrice,
            inventoryQuantity: mainVariant?.inventory_quantity || 0,
            inventoryPolicy: mainVariant?.inventory_policy || 'deny',
            sku: mainVariant?.sku || null,
            barcode: mainVariant?.barcode || null,
            weight: mainVariant?.weight || null,
            weightUnit: mainVariant?.weight_unit || 'kg',
            images: product.images || [],
            options: product.options || [],
            variants: product.variants || [],
            shopifyCreatedAt: new Date(product.created_at),
            shopifyUpdatedAt: new Date(product.updated_at),
            lastSyncAt: new Date(),
            updatedAt: new Date()
          };

          if (existing) {
            // Güncelle
            await db
              .update(shopifyMemoryProducts)
              .set(productData)
              .where(eq(shopifyMemoryProducts.shopifyProductId, product.id.toString()));
            updatedProducts++;
          } else {
            // Yeni ekle
            await db
              .insert(shopifyMemoryProducts)
              .values(productData);
            newProducts++;
          }

        } catch (error) {
          console.error(`❌ Ürün kaydetme hatası (ID: ${product.id}):`, error);
        }
      }

      console.log(`✅ Senkronizasyon tamamlandı: ${newProducts} yeni, ${updatedProducts} güncellenen ürün`);

      return {
        success: true,
        totalProducts: allProducts.length,
        newProducts,
        updatedProducts
      };

    } catch (error) {
      console.error('❌ Shopify ürün senkronizasyon hatası:', error);
      return {
        success: false,
        totalProducts: 0,
        newProducts: 0,
        updatedProducts: 0
      };
    }
  }

  // Hafızadaki ürünleri listele
  async getMemoryProducts(limit: number = 50, offset: number = 0) {
    try {
      const products = await db
        .select()
        .from(shopifyMemoryProducts)
        .orderBy(desc(shopifyMemoryProducts.lastSyncAt))
        .limit(limit)
        .offset(offset);

      return {
        success: true,
        products,
        total: products.length
      };
    } catch (error) {
      console.error('❌ Hafızadaki ürünleri listeleme hatası:', error);
      return {
        success: false,
        error: error.message,
        products: [],
        total: 0
      };
    }
  }

  // Benzersiz ID ile ürün getir
  async getProductByTrackingId(trackingId: string) {
    try {
      const [product] = await db
        .select()
        .from(shopifyMemoryProducts)
        .where(eq(shopifyMemoryProducts.uniqueTrackingId, trackingId));

      if (!product) {
        return {
          success: false,
          error: 'Ürün bulunamadı',
          product: null
        };
      }

      return {
        success: true,
        product
      };
    } catch (error) {
      console.error(`❌ Ürün getirme hatası (ID: ${trackingId}):`, error);
      return {
        success: false,
        error: error.message,
        product: null
      };
    }
  }

  // Shopify ID ile ürün getir
  async getProductByShopifyId(shopifyProductId: string) {
    try {
      const [product] = await db
        .select()
        .from(shopifyMemoryProducts)
        .where(eq(shopifyMemoryProducts.shopifyProductId, shopifyProductId));

      return {
        success: true,
        product: product || null
      };
    } catch (error) {
      console.error(`❌ Shopify ID ile ürün getirme hatası (ID: ${shopifyProductId}):`, error);
      return {
        success: false,
        error: error.message,
        product: null
      };
    }
  }

  // Ürün takibini aktifleştir
  async enableProductTracking(trackingId: string, trackingInterval: number = 300) {
    try {
      await db
        .update(shopifyMemoryProducts)
        .set({
          isTracking: true,
          trackingInterval,
          updatedAt: new Date()
        })
        .where(eq(shopifyMemoryProducts.uniqueTrackingId, trackingId));

      console.log(`🎯 Ürün takibi aktifleştirildi: ${trackingId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Ürün takibi aktifleştirme hatası:`, error);
      return { success: false, error: error.message };
    }
  }

  // Hafıza istatistikleri
  async getMemoryStats() {
    try {
      // Toplam ürün sayısı
      const totalProducts = await db
        .select({ count: count() })
        .from(shopifyMemoryProducts);

      // Aktif ürünler (status = active)
      const activeProducts = await db
        .select({ count: count() })
        .from(shopifyMemoryProducts)
        .where(eq(shopifyMemoryProducts.status, 'active'));

      // Takip edilen ürünler
      const trackedProducts = await db
        .select({ count: count() })
        .from(shopifyMemoryProducts)
        .where(eq(shopifyMemoryProducts.isTracking, true));

      // Son senkronizasyon zamanı
      const lastSyncResult = await db
        .select({ lastSync: max(shopifyMemoryProducts.lastSyncAt) })
        .from(shopifyMemoryProducts);

      return {
        success: true,
        stats: {
          totalProducts: totalProducts[0]?.count || 0,
          activeProducts: activeProducts[0]?.count || 0,
          trackedProducts: trackedProducts[0]?.count || 0,
          lastSyncedAt: lastSyncResult[0]?.lastSync || null
        }
      };
    } catch (error) {
      console.error('❌ Hafıza istatistik hatası:', error);
      return {
        success: false,
        error: error.message,
        stats: {
          totalProducts: 0,
          activeProducts: 0,
          trackedProducts: 0,
          lastSyncedAt: null
        }
      };
    }
  }

  // Doğrudan Shopify'dan güncel ürün verisi çek
  async getDirectProductData(shopifyProductId: string) {
    try {
      const response = await this.makeRequest(`products/${shopifyProductId}.json`);
      return {
        success: true,
        product: response.product
      };
    } catch (error) {
      console.error(`❌ Doğrudan ürün verisi çekme hatası:`, error);
      return {
        success: false,
        error: error.message,
        product: null
      };
    }
  }
}

// Singleton instance
export const shopifyApiService = new ShopifyApiService();