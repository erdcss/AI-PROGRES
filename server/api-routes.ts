import { Router } from 'express';
import { memorySystem } from './memory-system';
import { shopifyIntegration } from './shopify-integration';
import { monitoringService } from './monitoring-service';
import { storage } from './storage-fixed';
import { telegramIntegration } from './telegram-integration';

const router = Router();

// Clean tag generation function for Shopify compatibility
function generateCleanTags(productData: any): string {
  const tags: string[] = [];
  
  // Add brand tag (cleaned)
  if (productData.brand) {
    const cleanBrand = productData.brand
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, '')
      .trim();
    if (cleanBrand && cleanBrand.length > 0) {
      tags.push(cleanBrand);
    }
  }
  
  // Add basic tags
  tags.push('trendyol', 'import');
  
  // Add feature-based tags (limited and cleaned)
  if (productData.features && productData.features.length > 0) {
    const featureTags = productData.features
      .slice(0, 5) // Limit to 5 features
      .map((f: any) => {
        if (f.key && typeof f.key === 'string') {
          const cleanKey = f.key
            .toLowerCase()
            .replace(/[^a-z0-9\s]/gi, '')
            .trim();
          
          // Skip unwanted keys
          if (cleanKey.includes('context') || cleanKey.includes('type') || 
              cleanKey.includes('url') || cleanKey.includes('http')) {
            return null;
          }
          
          return cleanKey;
        }
        return null;
      })
      .filter(Boolean)
      .filter((tag: string) => tag.length > 2 && tag.length < 20);
    
    tags.push(...featureTags);
  }
  
  // Remove duplicates and join
  const uniqueTags = [...new Set(tags)].slice(0, 10); // Shopify recommends max 250 chars
  return uniqueTags.join(', ');
}

// Hafıza sistemi API endpoints
router.get('/api/memory/stats', async (req, res) => {
  try {
    const stats = await storage.getMemoryStats();
    const monitoringStats = await monitoringService.getMonitoringStats();
    
    res.json({
      success: true,
      memory: stats,
      monitoring: monitoringStats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tüm ürünleri getir
router.get('/api/memory/products', async (req, res) => {
  try {
    const products = await memorySystem.getActiveProducts();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ürün detaylarını getir
router.get('/api/memory/product/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await memorySystem.getProduct(productId);
    const variants = await memorySystem.getProductVariants(productId);
    
    res.json({ 
      success: true, 
      product,
      variants
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ürün varyant geçmişi
router.get('/api/memory/variant/:id/history', async (req, res) => {
  try {
    const variantId = parseInt(req.params.id);
    const priceHistory = await memorySystem.getPriceHistory(variantId);
    const stockHistory = await memorySystem.getStockHistory(variantId);
    
    res.json({ 
      success: true, 
      priceHistory,
      stockHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Monitoring endpoints
router.post('/api/monitoring/start', async (req, res) => {
  try {
    monitoringService.start();
    res.json({ success: true, message: 'Monitoring başlatıldı' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/monitoring/stop', async (req, res) => {
  try {
    monitoringService.stop();
    res.json({ success: true, message: 'Monitoring durduruldu' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/monitoring/add', async (req, res) => {
  try {
    const { url } = req.body;
    const added = await monitoringService.addProductToMonitoring(url);
    
    if (added) {
      res.json({ success: true, message: 'Ürün izlemeye eklendi' });
    } else {
      res.status(400).json({ success: false, error: 'Ürün eklenemedi' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/monitoring/remove/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const removed = await monitoringService.removeProductFromMonitoring(productId);
    
    if (removed) {
      res.json({ success: true, message: 'Ürün izlemeden çıkarıldı' });
    } else {
      res.status(400).json({ success: false, error: 'Ürün çıkarılamadı' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Telegram integration endpoints
router.get('/api/telegram/status', async (req, res) => {
  try {
    const status = telegramIntegration.getStatus();
    const isConnected = await telegramIntegration.testConnection();
    
    res.json({
      success: true,
      status: {
        ...status,
        connectionTest: isConnected
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/telegram/test', async (req, res) => {
  try {
    await telegramIntegration.sendNotification(
      '🧪 TEST MESAJI\n\n' +
      '✅ Telegram entegrasyonu çalışıyor!\n' +
      '📱 Bildirimler bu chat\'e gelecek\n' +
      `🕐 Zaman: ${new Date().toLocaleString('tr-TR')}`
    );
    
    res.json({ success: true, message: 'Test mesajı gönderildi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shopify integration endpoints
router.get('/api/shopify/test', async (req, res) => {
  try {
    const shopify = new (await import('./shopify-integration')).ShopifyIntegration('turmarkt.com', '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');
    const connected = await shopify.testConnection();
    res.json({ success: connected, connected });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/shopify/sync/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    res.json({ 
      success: true, 
      message: 'Mock sync başarılı',
      productId,
      note: 'Memory system aktif olduktan sonra gerçek sync çalışacak'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Demo sync endpoint
router.post('/api/shopify/demo-sync', async (req, res) => {
  try {
    const { demoShopifySync } = await import('./demo-shopify-sync');
    const success = await demoShopifySync();
    
    res.json({ 
      success, 
      message: success ? 'Demo senkronizasyon başarılı' : 'Demo senkronizasyon başarısız'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Gerçek ürün Shopify'a ekleme endpoint - Tam template formatında
router.post('/api/shopify/add-product', async (req, res) => {
  try {
    const productData = req.body.productData || req.body;
    
    if (!productData || !productData.success) {
      return res.status(400).json({ success: false, error: 'Geçerli product data gerekli' });
    }

    // Shopify varyant fixer'ı kullan
    const { ShopifyVariantFixer } = await import('./shopify-variant-fixer');
    
    // Varyant verilerini temizle ve doğrula
    const rawVariants = productData.variants || [];
    const cleanVariants = ShopifyVariantFixer.cleanAndDeduplicateVariants(rawVariants);
    
    console.log(`🔧 Varyant temizleme: ${rawVariants.length} → ${cleanVariants.length} benzersiz varyant`);

    // Özellikler HTML formatında hazırla
    let featuresHtml = '';
    if (productData.features && productData.features.length > 0) {
      featuresHtml = '<h3>Ürün Özellikleri:</h3><ul>';
      productData.features.forEach(feature => {
        featuresHtml += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
      });
      featuresHtml += '</ul>';
    }

    // Detaylı HTML açıklama - template formatına uygun
    const bodyHtml = `${productData.brand || 'Marka'} ${productData.title || 'Ürün'}. ${featuresHtml}`;

    // Varyantları Shopify formatında hazırla
    const basePrice = productData.price?.withProfit || 100;
    const shopifyVariants = ShopifyVariantFixer.createShopifyVariants(cleanVariants, basePrice);
    const productOptions = ShopifyVariantFixer.createProductOptions(cleanVariants);

    // SEO başlık ve açıklama
    const seoTitle = `${productData.title} - ${productData.brand} | Turmarkt`;
    const seoDescription = `${productData.title} ürününü Turmarkt'tan satın alın. ${productData.brand} markası, kaliteli ve uygun fiyatlı ürünler.`;

    // Shopify product objesi - varyant fixer ile oluşturulan verilerle
    const shopifyProduct = {
      title: productData.title || 'Ürün',
      body_html: bodyHtml,
      vendor: productData.brand || 'Genel',
      product_type: 'Çay & Gıda',
      tags: generateCleanTags(productData),
      variants: shopifyVariants,
      options: productOptions,
      status: 'active',
      images: (productData.images || []).slice(0, 5).map((img, index) => ({ 
        src: img,
        position: index + 1,
        alt: `${productData.title} - Görsel ${index + 1}`
      })),
      metafields: [
        {
          namespace: 'custom',
          key: 'seo_title',
          value: seoTitle,
          type: 'single_line_text_field'
        },
        {
          namespace: 'custom', 
          key: 'seo_description',
          value: seoDescription,
          type: 'multi_line_text_field'
        }
      ]
    };

    // Shopify verilerini doğrula
    const validation = ShopifyVariantFixer.validateShopifyData(shopifyProduct);
    if (!validation.isValid) {
      console.error('❌ Shopify veri doğrulama hatası:', validation.errors);
      return res.status(400).json({ 
        success: false, 
        error: `Varyant hatası: ${validation.errors.join(', ')}` 
      });
    }

    console.log('Creating Shopify product:', shopifyProduct.title);
    
    const response = await fetch('https://kr5xdy-x7.myshopify.com/admin/api/2024-01/products.json', {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': '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',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product: shopifyProduct })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Shopify product created:', result.product.id);
      
      // Telegram bildirimi gönder
      const profitAmount = (productData.price?.withProfit || 0) - (productData.price?.original || 0);
      const profitPercentage = productData.price?.original ? ((profitAmount / productData.price.original) * 100).toFixed(1) : '15.0';
      
      const message = 
        `🛒 <b>SHOPIFY'A YÜKLENDİ</b>\n\n` +
        `📦 <b>Ürün:</b> ${productData.title || 'Bilinmeyen Ürün'}\n` +
        `🏢 <b>Marka:</b> ${productData.brand || 'Bilinmeyen Marka'}\n` +
        `🌐 <b>Kaynak Site:</b> Trendyol\n` +
        `💰 <b>Alış Fiyatı:</b> ${productData.price?.original?.toFixed(2) || '0.00'} TL\n` +
        `💵 <b>Satış Fiyatı:</b> ${productData.price?.withProfit?.toFixed(2) || '0.00'} TL\n` +
        `📈 <b>Kar Miktarı:</b> ${profitAmount.toFixed(2)} TL\n` +
        `📊 <b>Kar Oranı:</b> %${profitPercentage}\n\n` +
        `⚡ <b>Shopify'a başarıyla eklendi</b>\n` +
        `🆔 <b>Product ID:</b> ${result.product.id}\n` +
        `🔗 <b>Admin URL:</b> kr5xdy-x7.myshopify.com/admin/products/${result.product.id}`;
      
      // Telegram bildirimi gönder
      try {
        const telegramModule = await import('./telegram-integration');
        const telegramIntegration = telegramModule.telegramIntegration || telegramModule.default;
        await telegramIntegration.sendNotification(message);
        console.log('✅ Telegram notification sent successfully');
      } catch (telegramError) {
        console.error('Telegram notification error details:', telegramError);
      }
    
      res.json({
        success: true,
        shopifyProductId: result.product.id,
        adminUrl: `https://kr5xdy-x7.myshopify.com/admin/products/${result.product.id}`,
        storeUrl: `https://kr5xdy-x7.myshopify.com/products/${result.product.handle}`,
        message: 'Ürün başarıyla Shopify\'a eklendi',
        product: result.product
      });
    } else {
      const errorText = await response.text();
      console.log('❌ Shopify API error:', errorText);
      res.status(response.status).json({
        success: false,
        error: `Shopify API hatası: ${errorText}`,
        status: response.status
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk sync all products
router.post('/api/shopify/sync-all', async (req, res) => {
  try {
    const products = await memorySystem.getActiveProducts();
    let syncedCount = 0;
    let errors = 0;

    for (const product of products) {
      try {
        const variants = await memorySystem.getProductVariants(product.id);
        
        if (product.shopifyProductId) {
          // Güncelle
          for (const variant of variants) {
            await shopifyIntegration.updateProductPrice(product, variant);
            await shopifyIntegration.updateProductStock(product, variant);
          }
        } else {
          // Yeni oluştur
          await shopifyIntegration.createProduct(product, variants);
        }
        
        syncedCount++;
      } catch (error) {
        console.error(`Sync hatası - ${product.title}:`, error);
        errors++;
      }
    }

    res.json({ 
      success: true, 
      syncedCount,
      errors,
      message: `${syncedCount} ürün senkronize edildi, ${errors} hata`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CSV indirme bildirimi endpoint
router.post('/api/telegram/csv-download-notification', async (req, res) => {
  try {
    const { productData } = req.body;
    
    if (!productData) {
      return res.status(400).json({ success: false, error: 'Product data required' });
    }
    
    const profitAmount = (productData.price?.withProfit || 0) - (productData.price?.original || 0);
    const profitPercentage = productData.price?.original ? ((profitAmount / productData.price.original) * 100).toFixed(1) : '15.0';
    
    const message = 
      `📥 <b>CSV İNDİRİLDİ</b>\n\n` +
      `📦 <b>Ürün:</b> ${productData.title || 'Bilinmeyen Ürün'}\n` +
      `🏢 <b>Marka:</b> ${productData.brand || 'Bilinmeyen Marka'}\n` +
      `🌐 <b>Kaynak Site:</b> Trendyol\n` +
      `💰 <b>Alış Fiyatı:</b> ${productData.price?.original?.toFixed(2) || '0.00'} TL\n` +
      `💵 <b>Satış Fiyatı:</b> ${productData.price?.withProfit?.toFixed(2) || '0.00'} TL\n` +
      `📈 <b>Kar Miktarı:</b> ${profitAmount.toFixed(2)} TL\n` +
      `📊 <b>Kar Oranı:</b> %${profitPercentage}\n\n` +
      `📁 <b>CSV dosyası indirildi ve Shopify yüklemesi için hazır</b>`;
    
    try {
      const telegramModule = await import('./telegram-integration');
      const telegramIntegration = telegramModule.telegramIntegration || telegramModule.default;
      await telegramIntegration.sendNotification(message);
      console.log('✅ CSV Telegram notification sent successfully');
    } catch (telegramError) {
      console.error('CSV Telegram notification error:', telegramError);
    }
    
    res.json({ success: true, message: 'CSV download notification sent' });
  } catch (error) {
    console.error('CSV download notification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual Telegram price change test endpoint
router.post('/api/telegram/manual-price-test', async (req, res) => {
  try {
    const { productName, oldPrice, newPrice } = req.body;
    
    if (!productName || !oldPrice || !newPrice) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const telegramModule = await import('./telegram-integration');
    const telegramIntegration = telegramModule.telegramIntegration || telegramModule.default;
    
    await telegramIntegration.sendPriceChangeNotification(productName, oldPrice, newPrice);
    
    // %15 kar marjı hesaplama
    const oldShopifyPrice = Math.round(oldPrice * 1.15 * 100) / 100;
    const newShopifyPrice = Math.round(newPrice * 1.15 * 100) / 100;
    
    res.json({ 
      success: true, 
      message: 'Price change notification sent with 15% profit margin',
      change: {
        product: productName,
        oldPrice,
        newPrice,
        oldShopifyPrice,
        newShopifyPrice,
        difference: newPrice - oldPrice,
        shopifyDifference: newShopifyPrice - oldShopifyPrice,
        percentage: ((newPrice - oldPrice) / oldPrice * 100).toFixed(2),
        profitMargin: '15%'
      }
    });
  } catch (error) {
    console.error('Manual price test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;