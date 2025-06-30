import { Router } from 'express';
import { db } from './db';
import { products, productVariants, stockHistory, priceHistory } from '@shared/schema';
import { eq, and, desc, sql, or } from 'drizzle-orm';
// Platform detection will be handled in frontend

const router = Router();

// Stoğu tükenen ürünleri getir
router.get('/out-of-stock-products', async (req, res) => {
  try {
    const outOfStockProducts = await db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        sourceUrl: products.sourceUrl,
        sourcePlatform: products.sourcePlatform,
        shopifyUrl: products.shopifyUrl,
        shopifyStoreUrl: products.shopifyStoreUrl,
        stockStatus: products.stockStatus,
        lastChecked: products.lastChecked,
        currentPrice: products.currentPrice
      })
      .from(products)
      .where(
        or(
          eq(products.stockStatus, 'out_of_stock'),
          eq(products.stockStatus, 'low_stock')
        )
      )
      .orderBy(desc(products.lastChecked))
      .limit(10);

    res.json({
      success: true,
      products: outOfStockProducts.map(product => ({
        ...product,
        sourcePlatform: product.sourcePlatform || 'trendyol',
        sourceUrl: product.sourceUrl || product.sourceUrl // Trendyol linki
      }))
    });
  } catch (error) {
    console.error('Out of stock products error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Stoğu tükenen ürünler alınamadı' 
    });
  }
});

// Stoğu tükenen varyantları getir
router.get('/out-of-stock-variants', async (req, res) => {
  try {
    const outOfStockVariants = await db
      .select({
        variantId: productVariants.id,
        productId: productVariants.productId,
        color: productVariants.color,
        size: productVariants.size,
        stockCount: productVariants.stockCount,
        inStock: productVariants.inStock,
        trendyolPrice: productVariants.trendyolPrice,
        shopifyPrice: productVariants.shopifyPrice,
        productTitle: products.title,
        productBrand: products.brand,
        sourceUrl: products.sourceUrl,
        sourcePlatform: products.sourcePlatform,
        shopifyUrl: products.shopifyUrl,
        updatedAt: productVariants.updatedAt
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        or(
          eq(productVariants.inStock, false),
          eq(productVariants.stockCount, 0)
        )
      )
      .orderBy(desc(productVariants.updatedAt))
      .limit(15);

    res.json({
      success: true,
      variants: outOfStockVariants.map(variant => ({
        ...variant,
        sourcePlatform: variant.sourcePlatform || 'trendyol',
        sourceUrl: variant.sourceUrl || variant.sourceUrl
      }))
    });
  } catch (error) {
    console.error('Out of stock variants error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Stoğu tükenen varyantlar alınamadı' 
    });
  }
});

// Son yüklenen 3 ürünü getir
router.get('/recent-uploads', async (req, res) => {
  try {
    const recentUploads = await db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        sourceUrl: products.sourceUrl,
        sourcePlatform: products.sourcePlatform,
        shopifyUrl: products.shopifyUrl,
        shopifyStoreUrl: products.shopifyStoreUrl,
        currentPrice: products.currentPrice,
        originalPrice: products.originalPrice,
        stockStatus: products.stockStatus,
        createdAt: products.createdAt,
        shopifyProductId: products.shopifyProductId
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(desc(products.createdAt))
      .limit(3);

    res.json({
      success: true,
      products: recentUploads.map(product => ({
        ...product,
        sourcePlatform: product.sourcePlatform || 'trendyol',
        sourceUrl: product.sourceUrl || product.sourceUrl, // Trendyol linki
        hasShopifyId: !!product.shopifyProductId
      }))
    });
  } catch (error) {
    console.error('Recent uploads error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Son yüklenen ürünler alınamadı' 
    });
  }
});

// Fiyat değişiklik istatistikleri
router.get('/price-change-stats', async (req, res) => {
  try {
    const priceChanges = await db
      .select({
        count: sql<number>`count(*)`,
        changeType: priceHistory.changeType
      })
      .from(priceHistory)
      .where(sql`${priceHistory.createdAt} >= NOW() - INTERVAL '7 days'`)
      .groupBy(priceHistory.changeType);

    const stockChanges = await db
      .select({
        count: sql<number>`count(*)`,
        changeType: stockHistory.changeType
      })
      .from(stockHistory)
      .where(sql`${stockHistory.createdAt} >= NOW() - INTERVAL '7 days'`)
      .groupBy(stockHistory.changeType);

    res.json({
      success: true,
      stats: {
        priceChanges: priceChanges.map(pc => ({
          type: pc.changeType,
          count: Number(pc.count)
        })),
        stockChanges: stockChanges.map(sc => ({
          type: sc.changeType,
          count: Number(sc.count)
        }))
      }
    });
  } catch (error) {
    console.error('Price change stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Fiyat değişiklik istatistikleri alınamadı' 
    });
  }
});

// Toplam sistem hafıza istatistikleri
router.get('/memory-overview', async (req, res) => {
  try {
    const totalProducts = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.isActive, true));

    const totalVariants = await db
      .select({ count: sql<number>`count(*)` })
      .from(productVariants);

    const outOfStockCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          or(
            eq(products.stockStatus, 'out_of_stock'),
            eq(products.stockStatus, 'low_stock')
          )
        )
      );

    const outOfStockVariantsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(productVariants)
      .where(
        or(
          eq(productVariants.inStock, false),
          eq(productVariants.stockCount, 0)
        )
      );

    res.json({
      success: true,
      overview: {
        totalProducts: Number(totalProducts[0]?.count || 0),
        totalVariants: Number(totalVariants[0]?.count || 0),
        outOfStockProducts: Number(outOfStockCount[0]?.count || 0),
        outOfStockVariants: Number(outOfStockVariantsCount[0]?.count || 0)
      }
    });
  } catch (error) {
    console.error('Memory overview error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Sistem hafıza özeti alınamadı' 
    });
  }
});

export default router;