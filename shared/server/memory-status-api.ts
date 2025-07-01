import { Router } from 'express';
import { db } from './db';
import { products, productVariants, stockHistory, priceHistory } from '@shared/schema';
import { eq, and, desc, sql, or } from 'drizzle-orm';
import { productUpdateEngine } from './product-update-engine';
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
        sourceUrl: products.trendyolUrl,
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
        sourceUrl: products.trendyolUrl,
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
        sourceUrl: products.trendyolUrl,
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

// Tek ürün güncelleme endpoint'i
router.post('/update-product/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz ürün ID'
      });
    }

    const result = await productUpdateEngine.processProductUpdate(productId);
    
    res.json({
      success: result.success,
      result: result
    });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({
      success: false,
      error: 'Ürün güncelleme hatası'
    });
  }
});

// Toplu ürün güncelleme endpoint'i
router.post('/bulk-update', async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Ürün ID listesi gerekli'
      });
    }

    const results = await productUpdateEngine.processBulkUpdates(productIds);
    const report = productUpdateEngine.generateUpdateReport(results);
    
    res.json({
      success: true,
      results: results,
      report: report,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        priceIncreased: results.filter(r => r.action === 'price_increased').length,
        archived: results.filter(r => r.action === 'archived').length
      }
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      error: 'Toplu güncelleme hatası'
    });
  }
});

// Tüm aktif ürünleri güncelle (12:00 zamanlanmış görev için)
router.post('/update-all-products', async (req, res) => {
  try {
    // Tüm aktif ürünleri al
    const activeProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.isActive, true));

    const productIds = activeProducts.map(p => p.id);
    
    if (productIds.length === 0) {
      return res.json({
        success: true,
        message: 'Güncellenecek aktif ürün bulunamadı',
        results: [],
        report: 'Hiç aktif ürün yok'
      });
    }

    const results = await productUpdateEngine.processBulkUpdates(productIds);
    const report = productUpdateEngine.generateUpdateReport(results);
    
    res.json({
      success: true,
      results: results,
      report: report,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        priceIncreased: results.filter(r => r.action === 'price_increased').length,
        archived: results.filter(r => r.action === 'archived').length
      }
    });
  } catch (error) {
    console.error('Update all products error:', error);
    res.status(500).json({
      success: false,
      error: 'Tüm ürün güncelleme hatası'
    });
  }
});

// Tüm ürünleri güncelle - Scheduler tarafından kullanılır
router.post('/update-all-products', async (req, res) => {
  try {
    console.log('🔄 Tüm ürünler için güncelleme işlemi başlatılıyor...');
    
    // Aktif ürünleri al
    const activeProducts = await db
      .select({
        id: products.id,
        title: products.title,
        trendyolUrl: products.trendyolUrl
      })
      .from(products)
      .where(eq(products.isActive, true));

    console.log(`📊 ${activeProducts.length} aktif ürün bulundu`);

    const results = [];
    let successful = 0;
    let failed = 0;
    let priceIncreased = 0;
    let archived = 0;

    // Her ürün için güncelleme işlemi
    for (const product of activeProducts) {
      try {
        const updateResult = await productUpdateEngine.processProductUpdate(product.id);
        results.push(updateResult);
        
        if (updateResult.success) {
          successful++;
          if (updateResult.action === 'price_increased') {
            priceIncreased++;
          } else if (updateResult.action === 'archived') {
            archived++;
          }
        } else {
          failed++;
        }
        
        // Rate limiting - her ürün arasında 2 saniye bekle
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Ürün güncelleme hatası (ID: ${product.id}):`, error);
        failed++;
        results.push({
          success: false,
          productId: product.id,
          productTitle: product.title,
          updatedFields: [],
          archivedVariants: [],
          errors: [(error as Error).message],
          action: 'error' as const
        });
      }
    }

    const summary = {
      total: activeProducts.length,
      successful,
      failed,
      priceIncreased,
      archived,
      timestamp: new Date().toISOString()
    };

    console.log('✅ Toplu güncelleme tamamlandı:', summary);

    res.json({
      success: true,
      summary,
      results: results.slice(0, 10) // Sadece ilk 10 sonucu döndür
    });

  } catch (error) {
    console.error('Toplu güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Toplu güncelleme işlemi başarısız',
      details: (error as Error).message
    });
  }
});

export default router;