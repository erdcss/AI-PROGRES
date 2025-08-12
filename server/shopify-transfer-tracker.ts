/**
 * Shopify Transfer Tracker - Shopify'a aktarılan ürünlerin takibi
 */

import { db } from './db';
import { shopifyTransferredProducts, shopifyProductChanges, urlTracking } from '../shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export class ShopifyTransferTracker {
  
  /**
   * Shopify'a aktarılan ürünü kayıt altına al
   */
  async registerTransferredProduct(productData: {
    sourceUrl: string;
    shopifyProductId?: string;
    shopifyHandle?: string;
    title: string;
    brand?: string;
    originalPrice: number;
    shopifyPrice: number;
    profitMargin?: number;
    variantCount?: number;
    imageCount?: number;
    sourceData?: any;
    shopifyData?: any;
  }) {
    try {
      console.log('📦 Shopify transfer kaydı oluşturuluyor:', productData.title);
      
      const [existingProduct] = await db
        .select()
        .from(shopifyTransferredProducts)
        .where(eq(shopifyTransferredProducts.sourceUrl, productData.sourceUrl))
        .limit(1);

      if (existingProduct) {
        // Mevcut kaydı güncelle
        const [updatedProduct] = await db
          .update(shopifyTransferredProducts)
          .set({
            shopifyProductId: productData.shopifyProductId,
            shopifyHandle: productData.shopifyHandle,
            title: productData.title,
            brand: productData.brand,
            originalPrice: productData.originalPrice.toString(),
            shopifyPrice: productData.shopifyPrice.toString(),
            profitMargin: (productData.profitMargin || 10).toString(),
            variantCount: productData.variantCount || 1,
            imageCount: productData.imageCount || 0,
            sourceData: productData.sourceData,
            shopifyData: productData.shopifyData,
            transferredAt: new Date(),
            currentStatus: 'active',
            trackingEnabled: true,
            updatedAt: new Date()
          })
          .where(eq(shopifyTransferredProducts.id, existingProduct.id))
          .returning();

        console.log('✅ Mevcut Shopify transfer kaydı güncellendi:', updatedProduct[0].id);
        return updatedProduct[0];
      } else {
        // Yeni kayıt oluştur
        const [newProduct] = await db
          .insert(shopifyTransferredProducts)
          .values({
            sourceUrl: productData.sourceUrl,
            shopifyProductId: productData.shopifyProductId,
            shopifyHandle: productData.shopifyHandle,
            title: productData.title,
            brand: productData.brand,
            originalPrice: productData.originalPrice.toString(),
            shopifyPrice: productData.shopifyPrice.toString(),
            profitMargin: (productData.profitMargin || 10).toString(),
            variantCount: productData.variantCount || 1,
            imageCount: productData.imageCount || 0,
            sourceData: productData.sourceData,
            shopifyData: productData.shopifyData,
            trackingEnabled: true,
            notificationSettings: {
              priceChanges: true,
              stockChanges: true,
              statusChanges: true,
              detailedReports: true
            }
          })
          .returning();

        console.log('✅ Yeni Shopify transfer kaydı oluşturuldu:', newProduct[0].id);
        
        // URL tracking sistemine de ekle
        try {
          await this.addToUrlTracking(productData.sourceUrl, productData.title, productData.originalPrice);
        } catch (trackingError) {
          console.warn('⚠️ URL tracking ekleme hatası (devam ediyor):', trackingError);
        }
        
        return newProduct[0];
      }
    } catch (error) {
      console.error('❌ Shopify transfer kaydı oluşturma hatası:', error);
      throw error;
    }
  }

  /**
   * URL tracking sistemine ekle
   */
  private async addToUrlTracking(url: string, title: string, price: number) {
    try {
      const [existing] = await db
        .select()
        .from(urlTracking)
        .where(eq(urlTracking.url, url))
        .limit(1);

      if (!existing) {
        await db
          .insert(urlTracking)
          .values({
            url,
            productTitle: title,
            currentPrice: price.toString(),
            originalPrice: price.toString(),
            currency: 'TL',
            status: 'active',
            isTracking: true,
            trackingInterval: 300, // 5 dakika
            priceChangeAlert: true,
            stockAlert: true
          });
        
        console.log('🎯 URL tracking eklendi:', title);
      }
    } catch (error) {
      console.warn('⚠️ URL tracking ekleme hatası:', error);
    }
  }

  /**
   * Ürün değişikliği kaydet
   */
  async recordProductChange(productId: number, changeData: {
    changeType: 'price' | 'stock' | 'status' | 'content' | 'variant';
    fieldName?: string;
    oldValue?: string;
    newValue: string;
    changeDetails?: any;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    sourceUrl?: string;
  }) {
    try {
      const [change] = await db
        .insert(shopifyProductChanges)
        .values({
          productId,
          ...changeData,
          severity: changeData.severity || 'medium'
        })
        .returning();

      // Change count'u artır
      await db
        .update(shopifyTransferredProducts)
        .set({
          changeCount: sql`${shopifyTransferredProducts.changeCount} + 1`,
          updatedAt: new Date()
        })
        .where(eq(shopifyTransferredProducts.id, productId));

      console.log('📝 Ürün değişikliği kaydedildi:', changeData.changeType);
      return change;
    } catch (error) {
      console.error('❌ Ürün değişikliği kaydetme hatası:', error);
      throw error;
    }
  }

  /**
   * Takip edilen tüm ürünleri getir
   */
  async getTrackedProducts(limit: number = 50) {
    try {
      const products = await db
        .select()
        .from(shopifyTransferredProducts)
        .where(eq(shopifyTransferredProducts.trackingEnabled, true))
        .orderBy(desc(shopifyTransferredProducts.transferredAt))
        .limit(limit);

      return products;
    } catch (error) {
      console.error('❌ Takip edilen ürünleri getirme hatası:', error);
      return [];
    }
  }

  /**
   * Ürün değişiklik geçmişini getir
   */
  async getProductChanges(productId: number, limit: number = 20) {
    try {
      const changes = await db
        .select()
        .from(shopifyProductChanges)
        .where(eq(shopifyProductChanges.productId, productId))
        .orderBy(desc(shopifyProductChanges.detectedAt))
        .limit(limit);

      return changes;
    } catch (error) {
      console.error('❌ Ürün değişiklik geçmişi getirme hatası:', error);
      return [];
    }
  }

  /**
   * Son değişiklikleri getir
   */
  async getRecentChanges(limit: number = 20) {
    try {
      const changes = await db
        .select({
          change: shopifyProductChanges,
          product: shopifyTransferredProducts
        })
        .from(shopifyProductChanges)
        .leftJoin(
          shopifyTransferredProducts,
          eq(shopifyProductChanges.productId, shopifyTransferredProducts.id)
        )
        .orderBy(desc(shopifyProductChanges.detectedAt))
        .limit(limit);

      return changes;
    } catch (error) {
      console.error('❌ Son değişiklikleri getirme hatası:', error);
      return [];
    }
  }

  /**
   * İstatistikleri getir
   */
  async getStats() {
    try {
      const [stats] = await db
        .select({
          totalProducts: sql<number>`count(*)`,
          activeProducts: sql<number>`count(*) filter (where ${shopifyTransferredProducts.currentStatus} = 'active')`,
          trackedProducts: sql<number>`count(*) filter (where ${shopifyTransferredProducts.trackingEnabled} = true)`,
          totalChanges: sql<number>`sum(${shopifyTransferredProducts.changeCount})`,
          avgPrice: sql<number>`avg(${shopifyTransferredProducts.shopifyPrice})`
        })
        .from(shopifyTransferredProducts);

      const [recentChanges] = await db
        .select({
          count: sql<number>`count(*)`
        })
        .from(shopifyProductChanges)
        .where(sql`${shopifyProductChanges.detectedAt} >= now() - interval '24 hours'`);

      return {
        totalProducts: stats.totalProducts || 0,
        activeProducts: stats.activeProducts || 0,
        trackedProducts: stats.trackedProducts || 0,
        totalChanges: stats.totalChanges || 0,
        averagePrice: stats.avgPrice || 0,
        recentChanges: recentChanges.count || 0
      };
    } catch (error) {
      console.error('❌ İstatistik getirme hatası:', error);
      return {
        totalProducts: 0,
        activeProducts: 0,
        trackedProducts: 0,
        totalChanges: 0,
        averagePrice: 0,
        recentChanges: 0
      };
    }
  }

  /**
   * Bildirim gönderilmemiş değişiklikleri getir
   */
  async getPendingNotifications() {
    try {
      const pendingChanges = await db
        .select({
          change: shopifyProductChanges,
          product: shopifyTransferredProducts
        })
        .from(shopifyProductChanges)
        .leftJoin(
          shopifyTransferredProducts,
          eq(shopifyProductChanges.productId, shopifyTransferredProducts.id)
        )
        .where(
          and(
            eq(shopifyProductChanges.notificationSent, false),
            eq(shopifyTransferredProducts.trackingEnabled, true)
          )
        )
        .orderBy(desc(shopifyProductChanges.detectedAt));

      return pendingChanges;
    } catch (error) {
      console.error('❌ Bekleyen bildirimleri getirme hatası:', error);
      return [];
    }
  }

  /**
   * Bildirim gönderildi olarak işaretle
   */
  async markNotificationSent(changeId: number, telegramMessageId?: string) {
    try {
      await db
        .update(shopifyProductChanges)
        .set({
          notificationSent: true,
          notificationSentAt: new Date(),
          telegramMessageId
        })
        .where(eq(shopifyProductChanges.id, changeId));

      console.log('✅ Bildirim gönderildi olarak işaretlendi:', changeId);
    } catch (error) {
      console.error('❌ Bildirim işaretleme hatası:', error);
    }
  }
}

export const shopifyTransferTracker = new ShopifyTransferTracker();