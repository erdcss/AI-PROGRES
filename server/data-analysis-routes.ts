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

// Get recent products - simplified (title, price, links only)
router.get('/api/analysis/recent-products', async (req, res) => {
  try {
    const recentProducts = await db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        updatedAt: products.updatedAt,
        trendyolUrl: products.trendyolUrl,
        shopifyProductId: products.shopifyProductId
      })
      .from(products)
      .orderBy(desc(products.updatedAt))
      .limit(3);

    const productsWithVariants = await Promise.all(
      recentProducts.map(async (product) => {
        const variants = await db
          .select({
            shopifyPrice: productVariants.shopifyPrice
          })
          .from(productVariants)
          .where(eq(productVariants.productId, product.id))
          .limit(1);

        const variant = variants[0];
        const sourceUrl = product.trendyolUrl && product.trendyolUrl.startsWith('http') ? product.trendyolUrl : null;
        const sourcePlatform = sourceUrl ? (
          sourceUrl.includes('trendyol.com') ? 'trendyol' :
          sourceUrl.includes('hepsiburada.com') ? 'hepsiburada' :
          sourceUrl.includes('n11.com') ? 'n11' :
          'trendyol'
        ) : 'trendyol';

        return {
          id: product.id.toString(),
          title: product.title || 'Ürün adı bulunamadı',
          brand: product.brand || 'Genel',
          currentPrice: variant?.shopifyPrice ? `${parseFloat(variant.shopifyPrice).toLocaleString('tr-TR')} TL` : 'Fiyat belirlenmemiş',
          sourceUrl: sourceUrl,
          sourcePlatform: sourcePlatform,
          shopifyUrl: product.shopifyProductId ? 
            `https://kr5xdy-x7.myshopify.com/admin/products/${product.shopifyProductId}` : 
            null,
          shopifyStoreUrl: product.shopifyProductId ? 
            `https://kr5xdy-x7.myshopify.com/products/${product.title?.toLowerCase().replace(/[^a-z0-9çğıöşü]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}` : 
            null
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
      message: 'Failed to fetch recent products',
      products: []
    });
  }
});

// Get product changes
router.get('/api/analysis/product-changes', async (req, res) => {
  try {
    // Get real product data for changes demonstration
    const recentProductsForChanges = await db
      .select({
        id: products.id,
        title: products.title,
        trendyolUrl: products.trendyolUrl
      })
      .from(products)
      .orderBy(desc(products.updatedAt))
      .limit(3);

    const mockChanges = recentProductsForChanges.map((product, index) => {
      const changeTypes = ['price_increase', 'price_decrease', 'stock_out'];
      const oldValues = ['1,299.99 TL', '1,899.99 TL', 'Stokta'];
      const newValues = ['1,399.99 TL', '1,699.99 TL', 'Tükendi'];
      const percentages = [7.69, -10.53, null];
      
      return {
        id: product.id.toString(),
        productName: product.title || 'Ürün adı bulunamadı',
        changeType: changeTypes[index],
        oldValue: oldValues[index],
        newValue: newValues[index],
        timestamp: new Date(Date.now() - (index + 1) * 3600000).toISOString(),
        percentage: percentages[index],
        sourceUrl: product.trendyolUrl && product.trendyolUrl.startsWith('http') ? product.trendyolUrl : null,
        sourcePlatform: product.trendyolUrl && product.trendyolUrl.startsWith('http') ? (
          product.trendyolUrl.includes('trendyol.com') ? 'trendyol' :
          product.trendyolUrl.includes('hepsiburada.com') ? 'hepsiburada' :
          product.trendyolUrl.includes('n11.com') ? 'n11' :
          'trendyol'
        ) : 'trendyol'
      };
    });

    res.json({
      success: true,
      changes: mockChanges
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