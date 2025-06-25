import { Router } from 'express';
import { memorySystem } from './memory-system';
import { shopifyIntegration } from './shopify-integration';
import { monitoringService } from './monitoring-service';
import { storage } from './storage-fixed';
import { telegramIntegration } from './telegram-integration';

const router = Router();

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
    const bodyHtml = `${productData.brand || 'Marka'} ${productData.title || 'Ürün'}. ${featuresHtml}<p><em>Trendyol'dan aktarılmıştır. %15 kar marjı eklenmiştir.</em></p>`;

    // Varyantları işle
    const variants = [];
    const optionValues = new Set();
    
    if (productData.variants && productData.variants.length > 0) {
      productData.variants.forEach((variant, index) => {
        const optionValue = variant.size || variant.color || 'Standart';
        optionValues.add(optionValue);
        variants.push({
          option1: optionValue,
          price: productData.price?.withProfit?.toFixed(2) || '100.00',
          sku: `${productData.brand?.toUpperCase() || 'BRAND'}-${Date.now()}-${index}`,
          inventory_quantity: variant.stockCount || 20,
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          cost: productData.price?.original?.toFixed(2) || '85.00'
        });
      });
    } else {
      optionValues.add('Standart');
      variants.push({
        option1: 'Standart',
        price: productData.price?.withProfit?.toFixed(2) || '100.00',
        sku: `${productData.brand?.toUpperCase() || 'BRAND'}-${Date.now()}`,
        inventory_quantity: 20,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        cost: productData.price?.original?.toFixed(2) || '85.00'
      });
    }

    // SEO başlık ve açıklama
    const seoTitle = `${productData.title} - ${productData.brand} | Turmarkt`;
    const seoDescription = `${productData.title} ürününü Turmarkt'tan satın alın. ${productData.brand} markası, kaliteli ve uygun fiyatlı ürünler.`;

    // Shopify product objesi - tam template formatında
    const shopifyProduct = {
      title: productData.title || 'Ürün',
      body_html: bodyHtml,
      vendor: productData.brand || 'Genel',
      product_type: 'Çay & Gıda',
      tags: `${productData.brand?.toLowerCase() || 'genel'}, trendyol, import, ${productData.features?.map(f => f.value.toLowerCase()).join(', ') || ''}`,
      variants: variants,
      options: [{ name: 'Varyant', values: Array.from(optionValues) }],
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
      try {
        const TelegramBot = require('node-telegram-bot-api');
        const token = '7687164814:AAGw-Z0yBYuyfbkA-4bIWhJg_WxxWj14hxk';
        const bot = new TelegramBot(token, { polling: false });
        
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

export default router;