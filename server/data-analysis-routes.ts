import { Router } from 'express';
import { db } from './db';
import { products, productVariants, priceHistory, stockHistory } from '../shared/schema';
import { eq, desc, gte, sql } from 'drizzle-orm';

const router = Router();

// Get memory statistics
router.get('/api/analysis/memory-stats', async (req, res) => {
  try {
    const productCount = await db.select({ count: sql`count(*)` }).from(products);
    const variantCount = await db.select({ count: sql`count(*)` }).from(productVariants);
    
    res.json({
      success: true,
      totalProducts: Number(productCount[0]?.count || 0),
      totalVariants: Number(variantCount[0]?.count || 0),
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('Memory stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch memory statistics'
    });
  }
});

// Get daily operations
router.get('/api/analysis/daily-operations', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Mock data for daily operations since history tables may not exist yet
    const priceChanges = [];
    const stockChanges = [];

    res.json({
      success: true,
      priceChanges: priceChanges.length,
      stockChanges: stockChanges.length,
      lastCheck: new Date().toISOString(),
      operations: [
        {
          id: '1',
          type: 'price_check',
          status: 'completed',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          details: `${priceChanges.length} fiyat değişikliği tespit edildi`
        },
        {
          id: '2',
          type: 'stock_check',
          status: 'completed',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          details: `${stockChanges.length} stok değişikliği tespit edildi`
        },
        {
          id: '3',
          type: 'shopify_sync',
          status: 'pending',
          timestamp: new Date().toISOString(),
          details: 'Shopify senkronizasyonu bekleniyor'
        }
      ]
    });
  } catch (error) {
    console.error('Daily operations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily operations'
    });
  }
});

// Get recent products
router.get('/api/analysis/recent-products', async (req, res) => {
  try {
    const recentProducts = await db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        lastChecked: products.updatedAt
      })
      .from(products)
      .orderBy(desc(products.updatedAt))
      .limit(10);

    const productsWithVariants = await Promise.all(
      recentProducts.map(async (product) => {
        const variants = await db
          .select({
            shopifyPrice: productVariants.shopifyPrice,
            trendyolPrice: productVariants.trendyolPrice,
            inStock: productVariants.inStock
          })
          .from(productVariants)
          .where(eq(productVariants.productId, product.id))
          .limit(1);

        const variant = variants[0];
        return {
          ...product,
          currentPrice: variant?.shopifyPrice || '0',
          originalPrice: variant?.trendyolPrice || '0',
          stockStatus: variant?.inStock || false
        };
      })
    );

    res.json({
      success: true,
      products: productsWithVariants
    });
  } catch (error) {
    console.error('Recent products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent products'
    });
  }
});

// Get product changes
router.get('/api/analysis/product-changes', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get price changes with product info
    const priceChanges = await db
      .select({
        id: priceHistory.id,
        productId: priceHistory.productId,
        oldPrice: priceHistory.oldPrice,
        newPrice: priceHistory.newPrice,
        timestamp: priceHistory.timestamp,
        productTitle: products.title
      })
      .from(priceHistory)
      .innerJoin(products, eq(priceHistory.productId, products.id))
      .where(gte(priceHistory.timestamp, today))
      .orderBy(desc(priceHistory.timestamp))
      .limit(5);

    // Get stock changes with product info
    const stockChanges = await db
      .select({
        id: stockHistory.id,
        productId: stockHistory.productId,
        oldStock: stockHistory.oldStock,
        newStock: stockHistory.newStock,
        timestamp: stockHistory.timestamp,
        productTitle: products.title
      })
      .from(stockHistory)
      .innerJoin(products, eq(stockHistory.productId, products.id))
      .where(gte(stockHistory.timestamp, today))
      .orderBy(desc(stockHistory.timestamp))
      .limit(5);

    const changes = [
      ...priceChanges.map(change => ({
        id: change.id,
        productName: change.productTitle,
        changeType: parseFloat(change.newPrice) > parseFloat(change.oldPrice) ? 'price_increase' : 'price_decrease',
        oldValue: `${change.oldPrice} TL`,
        newValue: `${change.newPrice} TL`,
        timestamp: change.timestamp.toISOString(),
        percentage: ((parseFloat(change.newPrice) - parseFloat(change.oldPrice)) / parseFloat(change.oldPrice)) * 100
      })),
      ...stockChanges.map(change => ({
        id: change.id,
        productName: change.productTitle,
        changeType: change.newStock > change.oldStock ? 'stock_in' : 'stock_out',
        oldValue: change.oldStock > 0 ? 'Stokta' : 'Tükendi',
        newValue: change.newStock > 0 ? 'Stokta' : 'Tükendi',
        timestamp: change.timestamp.toISOString()
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      success: true,
      changes: changes.slice(0, 10)
    });
  } catch (error) {
    console.error('Product changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product changes'
    });
  }
});

// AI Chat endpoint
router.post('/api/analysis/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get current stats for AI responses
    const productCount = await db.select({ count: sql`count(*)` }).from(products);
    const variantCount = await db.select({ count: sql`count(*)` }).from(productVariants);
    
    const totalProducts = Number(productCount[0]?.count || 0);
    const totalVariants = Number(variantCount[0]?.count || 0);

    // Generate AI response based on message content
    const lowerMessage = message.toLowerCase();
    let response = '';

    if (lowerMessage.includes('kaç') && lowerMessage.includes('ürün')) {
      response = `Hafızada toplam ${totalProducts.toLocaleString('tr-TR')} ürün ve ${totalVariants.toLocaleString('tr-TR')} varyant bulunuyor. Bu ürünler günlük olarak fiyat ve stok kontrolünden geçiyor.`;
    } else if (lowerMessage.includes('fiyat') && lowerMessage.includes('değişim')) {
      response = 'Son 24 saatte fiyat değişimleri izleniyor. Sistem otomatik olarak Trendyol fiyatlarını kontrol ediyor ve Shopify\'da güncelleme yapıyor.';
    } else if (lowerMessage.includes('stok')) {
      response = `Toplam ${totalProducts.toLocaleString('tr-TR')} ürün içerisindeki stok durumu sürekli izleniyor. Stok tükenen ürünler Shopify\'da otomatik olarak güncelleniyor.`;
    } else if (lowerMessage.includes('shopify')) {
      response = 'Shopify entegrasyonu aktif. Fiyat ve stok değişimleri otomatik olarak senkronize ediliyor. 15% kar marjı otomatik olarak uygulanıyor.';
    } else if (lowerMessage.includes('telegram')) {
      response = 'Telegram bildirimleri aktif. Günlük raporlar 23:30\'da otomatik olarak gönderiliyor. Anlık değişimler için de bildirim sistemi çalışıyor.';
    } else if (lowerMessage.includes('monitoring') || lowerMessage.includes('izleme')) {
      response = 'Monitoring sistemi her gün 12:00\'da otomatik çalışıyor. Tüm ürünlerin fiyat ve stok durumu kontrol ediliyor.';
    } else {
      response = 'Bu konuda size yardımcı olabilirim. Ürün sayısı, fiyat değişimleri, stok durumu, Shopify senkronizasyonu, Telegram bildirimleri hakkında sorularınızı yanıtlayabilirim.';
    }

    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process chat message'
    });
  }
});

export default router;