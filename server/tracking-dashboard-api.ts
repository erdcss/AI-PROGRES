import type { Express } from "express";
import { db } from './db';
import { 
  products, 
  productVariants, 
  priceHistory, 
  stockHistory, 
  variantChanges,
  urlTracking,
  monitoringSchedules
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

/**
 * Tracking Dashboard API Routes
 * Hafızadaki ürünleri gösterir ve değişim verilerini sağlar
 */
export function setupTrackingDashboardAPI(app: Express) {
  
  /**
   * GET /api/tracking/products-with-changes
   * Hafızadaki tüm ürünleri ve değişim bilgilerini getirir
   */
  app.get('/api/tracking/products-with-changes', async (req, res) => {
    try {
      // Tüm aktif ürünleri getir
      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.isActive, true))
        .orderBy(desc(products.updatedAt));

      const productsWithChanges = await Promise.all(
        allProducts.map(async (product) => {
          // Ürünün varyantlarını getir
          const variants = await db
            .select()
            .from(productVariants)
            .where(eq(productVariants.productId, product.id));

          // Fiyat değişimlerini getir (son 24 saat)
          const last24Hours = new Date();
          last24Hours.setHours(last24Hours.getHours() - 24);

          let recentPriceChanges: any[] = [];
          let recentStockChanges: any[] = [];
          let recentVariantChanges: any[] = [];

          if (variants.length > 0) {
            const variantIds = variants.map(v => v.id);

            // Fiyat değişimleri
            recentPriceChanges = await db
              .select()
              .from(priceHistory)
              .where(
                and(
                  sql`${priceHistory.variantId} = ANY(${variantIds})`,
                  gte(priceHistory.createdAt, last24Hours)
                )
              )
              .orderBy(desc(priceHistory.createdAt))
              .limit(10);

            // Stok değişimleri
            recentStockChanges = await db
              .select()
              .from(stockHistory)
              .where(
                and(
                  sql`${stockHistory.variantId} = ANY(${variantIds})`,
                  gte(stockHistory.createdAt, last24Hours)
                )
              )
              .orderBy(desc(stockHistory.createdAt))
              .limit(10);
          }

          // Varyant değişimleri (eklenen/çıkarılan varyantlar)
          recentVariantChanges = await db
            .select()
            .from(variantChanges)
            .where(
              and(
                eq(variantChanges.productId, product.id),
                gte(variantChanges.createdAt, last24Hours)
              )
            )
            .orderBy(desc(variantChanges.createdAt))
            .limit(10);

          // URL tracking bilgisi
          const trackingInfo = await db
            .select()
            .from(urlTracking)
            .where(eq(urlTracking.productId, product.id))
            .limit(1);

          // Monitoring schedule bilgisi
          const schedule = await db
            .select()
            .from(monitoringSchedules)
            .where(eq(monitoringSchedules.productId, product.id))
            .limit(1);

          // Değişim özeti hesapla
          const priceChange = recentPriceChanges.length > 0 ? {
            hasChanged: true,
            latestChange: recentPriceChanges[0],
            changeCount: recentPriceChanges.length,
            oldPrice: recentPriceChanges[0].oldPrice,
            newPrice: recentPriceChanges[0].newPrice,
            changeType: recentPriceChanges[0].changeType,
            changePercentage: recentPriceChanges[0].changePercentage
          } : null;

          const stockChange = recentStockChanges.length > 0 ? {
            hasChanged: true,
            latestChange: recentStockChanges[0],
            changeCount: recentStockChanges.length,
            oldStock: recentStockChanges[0].oldStock,
            newStock: recentStockChanges[0].newStock,
            changeType: recentStockChanges[0].changeType
          } : null;

          const variantChange = recentVariantChanges.length > 0 ? {
            hasChanged: true,
            changes: recentVariantChanges.map(vc => ({
              changeType: vc.changeType,
              color: vc.color,
              size: vc.size,
              oldStockCount: vc.oldStockCount,
              newStockCount: vc.newStockCount,
              createdAt: vc.createdAt
            })),
            addedCount: recentVariantChanges.filter(vc => vc.changeType === 'variant_added').length,
            removedCount: recentVariantChanges.filter(vc => vc.changeType === 'variant_removed').length,
            stockChangedCount: recentVariantChanges.filter(vc => vc.changeType === 'variant_stock_changed').length
          } : null;

          return {
            id: product.id,
            title: product.title,
            brand: product.brand,
            trendyolUrl: product.trendyolUrl,
            shopifyProductId: product.shopifyProductId,
            currentPrice: product.currentPrice,
            originalPrice: product.originalPrice,
            stockStatus: product.stockStatus,
            lastChecked: product.lastChecked,
            updatedAt: product.updatedAt,
            variants: variants.map(v => ({
              id: v.id,
              color: v.color,
              size: v.size,
              trendyolPrice: v.trendyolPrice,
              shopifyPrice: v.shopifyPrice,
              stockCount: v.stockCount,
              inStock: v.inStock
            })),
            variantCount: variants.length,
            tracking: trackingInfo[0] || null,
            schedule: schedule[0] || null,
            changes: {
              price: priceChange,
              stock: stockChange,
              variants: variantChange,
              hasAnyChanges: !!(priceChange || stockChange || variantChange)
            }
          };
        })
      );

      res.json({
        success: true,
        products: productsWithChanges,
        total: productsWithChanges.length,
        withChanges: productsWithChanges.filter(p => p.changes.hasAnyChanges).length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching products with changes:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /api/tracking/change-summary
   * Son 24 saatteki tüm değişikliklerin özeti
   */
  app.get('/api/tracking/change-summary', async (req, res) => {
    try {
      const last24Hours = new Date();
      last24Hours.setHours(last24Hours.getHours() - 24);

      // Fiyat değişim sayısı
      const priceChangesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(priceHistory)
        .where(gte(priceHistory.createdAt, last24Hours));

      // Stok değişim sayısı
      const stockChangesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(stockHistory)
        .where(gte(stockHistory.createdAt, last24Hours));

      // Varyant değişim sayısı
      const variantChangesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(variantChanges)
        .where(gte(variantChanges.createdAt, last24Hours));

      res.json({
        success: true,
        summary: {
          last24Hours: {
            priceChanges: Number(priceChangesResult[0]?.count || 0),
            stockChanges: Number(stockChangesResult[0]?.count || 0),
            variantChanges: Number(variantChangesResult[0]?.count || 0)
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error fetching change summary:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  console.log('✅ Tracking Dashboard API routes configured');
}
