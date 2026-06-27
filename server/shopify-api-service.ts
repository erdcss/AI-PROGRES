import axios from 'axios';
import { db } from './db';
import { shopifyMemoryProducts } from '@shared/schema';
import { eq, desc, count, max } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getShopifyConfig } from './shopify-credentials';
import {
  assertCoreTablesReady,
  isPgMissingRelationError,
  refreshDbFeatureState,
  warnDbFeatureSkipped,
} from './db-health';

// Credential cache — 60 saniye TTL, çok fazla DB sorgusu yapmamak için
let _credCache: { shopDomain: string; accessToken: string; cachedAt: number } | null = null;
async function getCredentials(): Promise<{ shopDomain: string; accessToken: string }> {
  const now = Date.now();
  if (_credCache && now - _credCache.cachedAt < 60_000) {
    return _credCache;
  }
  const config = await getShopifyConfig();
  if (!config) throw new Error('Shopify API credentials missing. Please set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN');
  _credCache = { shopDomain: config.shopDomain, accessToken: config.accessToken, cachedAt: now };
  return _credCache;
}
// Cache'i temizle (token güncellendikten sonra çağrılabilir)
export function invalidateShopifyCredentialCache() {
  _credCache = null;
}

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
  constructor() {
    // Credentials are now loaded dynamically via getCredentials() — no ENV reads at startup
    const rawDomain =
      process.env.SHOPIFY_SHOP_DOMAIN ||
      process.env.SHOPIFY_STORE_URL ||
      process.env.SHOPIFY_STORE_DOMAIN ||
      'unknown';
    const cleanStoreUrl = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    console.log(`🛍️ Shopify API Service initialized: ${cleanStoreUrl}`);
  }

  // Shopify API request helper — credentials loaded dynamically from DB (with ENV fallback)
  private async makeRequest(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: any) {
    try {
      const creds = await getCredentials();
      const cleanDomain = creds.shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const baseUrl = `https://${cleanDomain}/admin/api/2024-10/`;

      const config = {
        method,
        url: `${baseUrl}${endpoint}`,
        headers: {
          'X-Shopify-Access-Token': creds.accessToken,
          'Content-Type': 'application/json',
        },
        data
      };

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`❌ Shopify API error for ${endpoint}:`);
      console.error('Status:', error.response?.status);
      console.error('Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Original message:', error.message);
      throw error;
    }
  }

  // Tüm ürünleri çek ve hafızaya kaydet
  async syncAllProducts(): Promise<{ success: boolean; totalProducts: number; newProducts: number; updatedProducts: number; deletedProducts?: number }> {
    try {
      const dbReady = await assertCoreTablesReady(['shopify_memory_products']);
      if (!dbReady) {
        const status = await refreshDbFeatureState();
        warnDbFeatureSkipped('Shopify ürün senkronizasyonu', status.missingTables);
        return {
          success: false,
          totalProducts: 0,
          newProducts: 0,
          updatedProducts: 0,
          deletedProducts: 0,
        };
      }

      console.log('🔄 Shopify ürün senkronizasyonu başlatılıyor...');
      
      // Shopify maximum limit kullan
      const limit = 250;
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
      let deletedProducts = 0;

      // Shopify'dan çekilen ürün ID'lerini topla
      const shopifyProductIds = new Set(allProducts.map(p => p.id.toString()));
      console.log(`📋 Shopify ürün ID'leri: ${shopifyProductIds.size} adet`);

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
          if (isPgMissingRelationError(error)) {
            warnDbFeatureSkipped('Shopify ürün senkronizasyonu', ['shopify_memory_products']);
            break;
          }
          console.error(`❌ Ürün kaydetme hatası (ID: ${product.id}):`, error);
        }
      }

      // Shopify'da olmayan ürünleri database'den sil
      console.log('🗑️ Shopify\'da olmayan ürünleri kontrol ediliyor...');
      const memoryProducts = await db
        .select({ shopifyProductId: shopifyMemoryProducts.shopifyProductId, title: shopifyMemoryProducts.title })
        .from(shopifyMemoryProducts);
      
      for (const memProduct of memoryProducts) {
        if (!shopifyProductIds.has(memProduct.shopifyProductId)) {
          console.log(`🗑️ Silinen ürün tespit edildi: ${memProduct.title} (ID: ${memProduct.shopifyProductId})`);
          await db
            .delete(shopifyMemoryProducts)
            .where(eq(shopifyMemoryProducts.shopifyProductId, memProduct.shopifyProductId));
          deletedProducts++;
        }
      }

      console.log(`✅ Senkronizasyon tamamlandı: ${newProducts} yeni, ${updatedProducts} güncellenen, ${deletedProducts} silinen ürün`);

      return {
        success: true,
        totalProducts: allProducts.length,
        newProducts,
        updatedProducts,
        deletedProducts
      };

    } catch (error) {
      console.error('❌ Shopify ürün senkronizasyon hatası:', error);
      return {
        success: false,
        totalProducts: 0,
        newProducts: 0,
        updatedProducts: 0,
        deletedProducts: 0
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
        } as any)
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

  // ===============================
  // AUTO-UPDATE SYSTEM
  // ===============================

  // Ürün fiyat ve stok güncelleme sistemi
  async updateProductPricesAndStock(trackingId: string, newData: any, options: {
    enablePriceUpdates?: boolean;
    enableStockUpdates?: boolean;
    onlyPriceIncreases?: boolean;
    priceChangeThreshold?: number;
  } = {}) {
    try {
      console.log(`🔄 Auto-update başlatılıyor: ${trackingId}`);
      
      // Default options
      const updateOptions = {
        enablePriceUpdates: true,
        enableStockUpdates: true,
        onlyPriceIncreases: true, // Sadece fiyat artışlarını uygula
        priceChangeThreshold: 5, // %5'ten fazla değişiklikleri uygula
        ...options
      };

      // Mevcut ürünü database'den getir
      const productResult = await this.getProductByTrackingId(trackingId);
      if (!productResult.success || !productResult.product) {
        return {
          success: false,
          error: 'Ürün bulunamadı',
          changes: []
        };
      }

      const currentProduct = productResult.product;
      
      // Değişiklikleri tespit et
      const changes = await this.detectChanges(currentProduct, newData, updateOptions);
      
      if (changes.length === 0) {
        console.log(`📊 Güncelleme gerekmiyor: ${currentProduct.title}`);
        return {
          success: true,
          message: 'Güncelleme gerekmiyor',
          changes: []
        };
      }

      console.log(`🔍 ${changes.length} değişiklik tespit edildi:`, changes.map(c => c.type));

      // Güncellemeleri Shopify'a uygula
      const updateResult = await this.applyUpdatesToShopify(currentProduct, changes);
      
      if (updateResult.success) {
        // Database'deki kayıtları güncelle
        await this.updateLocalProductRecord(trackingId, newData);
        
        console.log(`✅ Auto-update tamamlandı: ${currentProduct.title}`);
        return {
          success: true,
          message: 'Güncelleme başarılı',
          changes,
          appliedChanges: updateResult.appliedChanges
        };
      } else {
        console.error(`❌ Auto-update hatası: ${updateResult.error}`);
        return {
          success: false,
          error: updateResult.error,
          changes
        };
      }

    } catch (error) {
      console.error(`❌ Auto-update sistem hatası:`, error);
      return {
        success: false,
        error: (error as Error).message,
        changes: []
      };
    }
  }

  // Değişiklikleri tespit et
  private async detectChanges(currentProduct: any, newData: any, options: any) {
    const changes: Array<{
      type: 'price' | 'stock' | 'variant_stock' | 'availability';
      field: string;
      oldValue: any;
      newValue: any;
      changePercentage?: number;
      shouldApply: boolean;
      reason: string;
    }> = [];

    try {
      // 1. Ana fiyat değişikliği kontrolü
      if (options.enablePriceUpdates && newData.price && currentProduct.price) {
        const oldPrice = parseFloat(currentProduct.price);
        const newPrice = parseFloat(newData.price);
        
        if (oldPrice !== newPrice) {
          const changePercentage = ((newPrice - oldPrice) / oldPrice) * 100;
          const isIncrease = newPrice > oldPrice;
          
          let shouldApply = false;
          let reason = '';
          
          if (options.onlyPriceIncreases && isIncrease) {
            shouldApply = Math.abs(changePercentage) >= options.priceChangeThreshold;
            reason = shouldApply ? 'Fiyat artışı politikası' : `Değişim %${changePercentage.toFixed(1)} < eşik %${options.priceChangeThreshold}`;
          } else if (!options.onlyPriceIncreases) {
            shouldApply = Math.abs(changePercentage) >= options.priceChangeThreshold;
            reason = shouldApply ? 'Tüm fiyat değişiklikleri' : `Değişim %${changePercentage.toFixed(1)} < eşik %${options.priceChangeThreshold}`;
          } else {
            reason = 'Fiyat düşüşü - politika gereği uygulanmıyor';
          }

          changes.push({
            type: 'price',
            field: 'price',
            oldValue: oldPrice,
            newValue: newPrice,
            changePercentage: Math.abs(changePercentage),
            shouldApply,
            reason
          });
        }
      }

      // 2. Ana stok durumu kontrolü
      if (options.enableStockUpdates && newData.stockStatus !== undefined) {
        if (currentProduct.stockStatus !== newData.stockStatus) {
          changes.push({
            type: 'availability',
            field: 'stockStatus',
            oldValue: currentProduct.stockStatus,
            newValue: newData.stockStatus,
            shouldApply: true,
            reason: 'Stok durumu değişikliği'
          });
        }
      }

      // 3. Varyant stok kontrolü (eğer varsa)
      if (options.enableStockUpdates && newData.variants && currentProduct.variants) {
        const oldVariants = JSON.parse(currentProduct.variants || '[]');
        const newVariants = newData.variants;

        for (const newVariant of newVariants) {
          const oldVariant = oldVariants.find((v: any) => 
            v.color === newVariant.color && v.size === newVariant.size
          );

          if (oldVariant && oldVariant.inStock !== newVariant.inStock) {
            changes.push({
              type: 'variant_stock',
              field: `variants.${newVariant.color}_${newVariant.size}`,
              oldValue: oldVariant.inStock,
              newValue: newVariant.inStock,
              shouldApply: true,
              reason: `Varyant stok değişikliği: ${newVariant.color} - ${newVariant.size}`
            });
          }
        }
      }

      return changes;

    } catch (error) {
      console.error('❌ Değişiklik tespiti hatası:', error);
      return changes;
    }
  }

  // Güncellemeleri Shopify'a uygula
  private async applyUpdatesToShopify(currentProduct: any, changes: any[]) {
    try {
      const applicableChanges = changes.filter(c => c.shouldApply);
      
      if (applicableChanges.length === 0) {
        return {
          success: true,
          message: 'Uygulanacak değişiklik yok',
          appliedChanges: []
        };
      }

      console.log(`🔄 Shopify'a ${applicableChanges.length} güncelleme uygulanıyor...`);

      const appliedChanges: any[] = [];

      // Shopify'dan mevcut ürün verisini çek
      const shopifyProductResult = await this.getDirectProductData(currentProduct.shopifyProductId);
      if (!shopifyProductResult.success) {
        throw new Error('Shopify ürün verisi alınamadı');
      }

      const shopifyProduct = shopifyProductResult.product;

      // Fiyat güncellemeleri
      const priceChanges = applicableChanges.filter(c => c.type === 'price');
      if (priceChanges.length > 0) {
        for (const change of priceChanges) {
          // Ana varyantın fiyatını güncelle (genelde ilk varyant)
          if (shopifyProduct.variants && shopifyProduct.variants.length > 0) {
            const mainVariant = shopifyProduct.variants[0];
            
            const updateData = {
              variant: {
                id: mainVariant.id,
                price: change.newValue.toString()
              }
            };

            const result = await this.makeRequest(`variants/${mainVariant.id}.json`, 'PUT', updateData);
            
            appliedChanges.push({
              type: 'price',
              variantId: mainVariant.id,
              oldPrice: change.oldValue,
              newPrice: change.newValue,
              result: 'success'
            });

            console.log(`✅ Fiyat güncellendi: ${change.oldValue} TL → ${change.newValue} TL`);
          }
        }
      }

      // Stok durumu güncellemeleri
      const stockChanges = applicableChanges.filter(c => c.type === 'availability');
      if (stockChanges.length > 0) {
        for (const change of stockChanges) {
          // Ürün durumunu güncelle (active/archived)
          const productStatus = change.newValue === 'in_stock' ? 'active' : 'archived';
          
          const updateData = {
            product: {
              id: shopifyProduct.id,
              status: productStatus
            }
          };

          const result = await this.makeRequest(`products/${shopifyProduct.id}.json`, 'PUT', updateData);
          
          appliedChanges.push({
            type: 'availability',
            productId: shopifyProduct.id,
            oldStatus: change.oldValue,
            newStatus: change.newValue,
            result: 'success'
          });

          console.log(`✅ Stok durumu güncellendi: ${change.oldValue} → ${change.newValue}`);
        }
      }

      return {
        success: true,
        message: `${appliedChanges.length} güncelleme uygulandı`,
        appliedChanges
      };

    } catch (error) {
      console.error('❌ Shopify güncelleme hatası:', error);
      return {
        success: false,
        error: (error as Error).message,
        appliedChanges: []
      };
    }
  }

  // Local database kaydını güncelle
  private async updateLocalProductRecord(trackingId: string, newData: any) {
    try {
      const updateData: any = {
        lastSyncAt: new Date()
      };

      if (newData.price) updateData.price = newData.price.toString();
      if (newData.stockStatus) updateData.stockStatus = newData.stockStatus;
      if (newData.variants) updateData.variants = JSON.stringify(newData.variants);

      await db
        .update(shopifyMemoryProducts)
        .set(updateData)
        .where(eq(shopifyMemoryProducts.uniqueTrackingId, trackingId));

      console.log(`✅ Local kayıt güncellendi: ${trackingId}`);
      
    } catch (error) {
      console.error('❌ Local kayıt güncelleme hatası:', error);
    }
  }

  // ========== AUTONOMOUS SYNC API METHODS ==========

  /**
   * 💰 Update variant price
   * Used by ShopifySyncManager for price changes
   */
  async updateVariantPrice(variantId: string, price: number, compareAtPrice?: number) {
    try {
      console.log(`💰 Updating Shopify variant ${variantId} price to ${price} TL`);
      
      const updateData: any = {
        variant: {
          id: parseInt(variantId),
          price: price.toFixed(2)
        }
      };

      if (compareAtPrice) {
        updateData.variant.compare_at_price = compareAtPrice.toFixed(2);
      }

      const result = await this.makeRequest(`variants/${variantId}.json`, 'PUT', updateData);
      
      console.log(`✅ Variant price updated successfully`);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`❌ Failed to update variant price:`, error.message);
      throw error;
    }
  }

  /**
   * 📦 Update inventory quantity
   * Used by ShopifySyncManager for stock changes
   */
  async updateInventory(variantId: string, quantity: number, locationId?: string) {
    try {
      console.log(`📦 Updating inventory for variant ${variantId} to ${quantity} units`);
      
      // First, get the variant to find its inventory_item_id
      const variantResponse = await this.makeRequest(`variants/${variantId}.json`, 'GET');
      const inventoryItemId = variantResponse.variant?.inventory_item_id;

      if (!inventoryItemId) {
        throw new Error('Inventory item ID not found for variant');
      }

      // Get available locations if not provided
      if (!locationId) {
        const locationsResponse = await this.makeRequest('locations.json', 'GET');
        locationId = locationsResponse.locations?.[0]?.id?.toString();
      }

      if (!locationId) {
        throw new Error('No location ID available');
      }

      // Update inventory level
      const updateData = {
        location_id: parseInt(locationId),
        inventory_item_id: inventoryItemId,
        available: quantity
      };

      const result = await this.makeRequest('inventory_levels/set.json', 'POST', updateData);
      
      console.log(`✅ Inventory updated successfully`);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`❌ Failed to update inventory:`, error.message);
      throw error;
    }
  }

  /**
   * ➕ Create new variant
   * Used by ShopifySyncManager when new variant is added
   */
  async createVariant(productId: string, variantData: {
    option1?: string;
    option2?: string;
    option3?: string;
    price: number;
    sku?: string;
    inventory_quantity?: number;
  }) {
    try {
      console.log(`➕ Creating new variant for product ${productId}`);
      
      const createData = {
        variant: {
          product_id: parseInt(productId),
          option1: variantData.option1,
          option2: variantData.option2,
          option3: variantData.option3,
          price: variantData.price.toFixed(2),
          sku: variantData.sku,
          inventory_quantity: variantData.inventory_quantity || 0,
          inventory_management: 'shopify',
          inventory_policy: 'deny'
        }
      };

      const result = await this.makeRequest(`products/${productId}/variants.json`, 'POST', createData);
      
      console.log(`✅ Variant created successfully: ${result.variant?.id}`);
      return { success: true, data: result, variantId: result.variant?.id };
    } catch (error: any) {
      console.error(`❌ Failed to create variant:`, error.message);
      throw error;
    }
  }

  /**
   * 🗑️ Archive (delete) variant
   * Used by ShopifySyncManager when variant is removed
   */
  async archiveVariant(variantId: string) {
    try {
      console.log(`🗑️ Archiving variant ${variantId}`);
      
      const result = await this.makeRequest(`variants/${variantId}.json`, 'DELETE');
      
      console.log(`✅ Variant archived successfully`);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`❌ Failed to archive variant:`, error.message);
      throw error;
    }
  }

  /**
   * 📦 Archive product
   * Used by ShopifySyncManager when product is deleted from Trendyol
   */
  async archiveProduct(productId: string) {
    try {
      console.log(`📦 Archiving product ${productId}`);
      
      const updateData = {
        product: {
          id: parseInt(productId),
          status: 'archived'
        }
      };

      const result = await this.makeRequest(`products/${productId}.json`, 'PUT', updateData);
      
      console.log(`✅ Product archived successfully`);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`❌ Failed to archive product:`, error.message);
      throw error;
    }
  }

  /**
   * 🏷️ Update product category (product_type)
   * Used by ShopifySyncManager when category changes
   */
  async updateProductCategory(productId: string, category: string) {
    try {
      console.log(`🏷️ Updating Shopify product ${productId} category to "${category}"`);
      
      const updateData = {
        product: {
          id: parseInt(productId),
          product_type: category
        }
      };

      const result = await this.makeRequest(`products/${productId}.json`, 'PUT', updateData);
      
      console.log(`✅ Product category updated successfully`);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`❌ Failed to update product category:`, error.message);
      throw error;
    }
  }

  /**
   * 🔍 Get variant by ID
   * Helper method to fetch variant details including inventory_item_id
   */
  async getVariantById(variantId: string) {
    try {
      const result = await this.makeRequest(`variants/${variantId}.json`, 'GET');
      return { success: true, variant: result.variant };
    } catch (error: any) {
      console.error(`❌ Failed to get variant:`, error.message);
      throw error;
    }
  }
}

// Singleton instance
export const shopifyApiService = new ShopifyApiService();