import { Router } from 'express';
import { memorySystem } from './memory-system';
import { shopifyIntegration } from './shopify-integration';
import { monitoringService } from './monitoring-service';
import { storage } from './storage-fixed';
import { telegramIntegration } from './telegram-integration';

// Dynamic product category determination
function determineProductCategory(productData: any): string {
  const title = (productData.title || '').toLowerCase();
  const features = productData.features || [];
  
  // Extract feature values for analysis
  const featureValues = features.map((f: any) => f.value?.toLowerCase() || '').join(' ');
  const featureKeys = features.map((f: any) => f.key?.toLowerCase() || '').join(' ');
  const allText = `${title} ${featureValues} ${featureKeys}`.toLowerCase();
  
  // Clothing and fashion categories
  if (allText.includes('ceket') || allText.includes('blazer') || allText.includes('mont')) {
    return 'Giyim > Kadın > Ceket & Mont';
  }
  if (allText.includes('pijama') || allText.includes('gecelik') || allText.includes('iç giyim')) {
    return 'Giyim > Kadın > İç Giyim & Pijama';
  }
  if (allText.includes('elbise') || allText.includes('dress')) {
    return 'Giyim > Kadın > Elbise';
  }
  if (allText.includes('pantolon') || allText.includes('jean') || allText.includes('şort')) {
    return 'Giyim > Kadın > Pantolon';
  }
  if (allText.includes('bluz') || allText.includes('gömlek') || allText.includes('tişört')) {
    return 'Giyim > Kadın > Bluz & Gömlek';
  }
  if (allText.includes('ayakkabı') || allText.includes('bot') || allText.includes('sandalet')) {
    return 'Ayakkabı & Aksesuar > Ayakkabı';
  }
  if (allText.includes('çanta') || allText.includes('bag')) {
    return 'Ayakkabı & Aksesuar > Çanta';
  }
  
  // Home and furniture categories
  if (allText.includes('yatak') || allText.includes('nevresim') || allText.includes('çarşaf')) {
    return 'Ev & Yaşam > Yatak Odası > Yatak & Nevresim';
  }
  if (allText.includes('mobilya') || allText.includes('masa') || allText.includes('sandalye') || allText.includes('dolap')) {
    return 'Ev & Yaşam > Mobilya';
  }
  if (allText.includes('mutfak') || allText.includes('tencere') || allText.includes('tabak')) {
    return 'Ev & Yaşam > Mutfak';
  }
  if (allText.includes('halı') || allText.includes('perde') || allText.includes('dekorasyon')) {
    return 'Ev & Yaşam > Dekorasyon';
  }
  
  // Electronics categories
  if (allText.includes('telefon') || allText.includes('phone') || allText.includes('mobil')) {
    return 'Elektronik > Telefon & Aksesuar';
  }
  if (allText.includes('bilgisayar') || allText.includes('laptop') || allText.includes('computer')) {
    return 'Elektronik > Bilgisayar';
  }
  if (allText.includes('kulaklık') || allText.includes('hoparlör') || allText.includes('ses')) {
    return 'Elektronik > Ses & Görüntü';
  }
  
  // Beauty and personal care
  if (allText.includes('kozmetik') || allText.includes('makyaj') || allText.includes('parfüm')) {
    return 'Kozmetik & Kişisel Bakım > Makyaj';
  }
  if (allText.includes('cilt bakım') || allText.includes('krem') || allText.includes('serum')) {
    return 'Kozmetik & Kişisel Bakım > Cilt Bakımı';
  }
  if (allText.includes('saç') || allText.includes('şampuan') || allText.includes('hair')) {
    return 'Kozmetik & Kişisel Bakım > Saç Bakımı';
  }
  
  // Food and beverages
  if (allText.includes('çay') || allText.includes('tea') || allText.includes('kahve')) {
    return 'Gıda & İçecek > İçecek > Çay & Kahve';
  }
  if (allText.includes('gıda') || allText.includes('yiyecek') || allText.includes('food')) {
    return 'Gıda & İçecek > Temel Gıda';
  }
  
  // Sports and outdoor
  if (allText.includes('spor') || allText.includes('fitness') || allText.includes('egzersiz')) {
    return 'Spor & Outdoor > Spor Malzemeleri';
  }
  
  // Books and media
  if (allText.includes('kitap') || allText.includes('book') || allText.includes('dergi')) {
    return 'Kitap & Müzik & Film > Kitap';
  }
  
  // Default category based on general product type detection
  if (allText.includes('giyim') || features.some((f: any) => 
    ['beden', 'kalıp', 'kol tipi', 'yaka tipi'].includes(f.key?.toLowerCase()))) {
    return 'Giyim > Genel';
  }
  
  // Final fallback
  return 'Genel Ürünler';
}

// AI-powered tag generation based on product data
function generateAITags(productData: any): string[] {
  const title = (productData.title || '').toLowerCase();
  const features = productData.features || [];
  const category = determineProductCategory(productData);
  
  const tags: Set<string> = new Set();
  
  // Category-based tags
  const categoryParts = category.split(' > ');
  categoryParts.forEach(part => {
    if (part.trim()) {
      tags.add(part.trim().toLowerCase());
    }
  });
  
  // Feature-based intelligent tags
  features.forEach((feature: any) => {
    const key = feature.key?.toLowerCase() || '';
    const value = feature.value?.toLowerCase() || '';
    
    // Material and fabric tags
    if (key.includes('materyal') || key.includes('kumaş')) {
      if (value.includes('pamuk')) tags.add('pamuk');
      if (value.includes('polyester')) tags.add('polyester');
      if (value.includes('viscose')) tags.add('viscose');
      if (value.includes('elastan')) tags.add('elastan');
      if (value.includes('denim')) tags.add('denim');
      if (value.includes('dokuma')) tags.add('dokuma');
    }
    
    // Color tags
    if (key.includes('renk') || value.includes('renk')) {
      if (value.includes('siyah')) tags.add('siyah');
      if (value.includes('beyaz')) tags.add('beyaz');
      if (value.includes('mavi')) tags.add('mavi');
      if (value.includes('kırmızı')) tags.add('kırmızı');
      if (value.includes('yeşil')) tags.add('yeşil');
      if (value.includes('sarı')) tags.add('sarı');
      if (value.includes('pembe')) tags.add('pembe');
      if (value.includes('mor')) tags.add('mor');
      if (value.includes('bej')) tags.add('bej');
      if (value.includes('gri')) tags.add('gri');
    }
    
    // Pattern tags
    if (key.includes('desen')) {
      if (value.includes('çizgili')) tags.add('çizgili');
      if (value.includes('puantiyeli')) tags.add('puantiyeli');
      if (value.includes('desenli')) tags.add('desenli');
      if (value.includes('düz')) tags.add('düz');
      if (value.includes('kareli')) tags.add('kareli');
    }
    
    // Style and fit tags
    if (key.includes('kalıp')) {
      if (value.includes('slim')) tags.add('slim-fit');
      if (value.includes('regular')) tags.add('regular-fit');
      if (value.includes('oversize')) tags.add('oversize');
      if (value.includes('bol')) tags.add('bol-kesim');
    }
    
    // Sleeve type tags
    if (key.includes('kol')) {
      if (value.includes('uzun')) tags.add('uzun-kol');
      if (value.includes('kısa')) tags.add('kısa-kol');
      if (value.includes('askılı')) tags.add('askılı');
    }
    
    // Season tags
    if (key.includes('sezon')) {
      if (value.includes('yaz')) tags.add('yaz');
      if (value.includes('kış')) tags.add('kış');
      if (value.includes('sonbahar')) tags.add('sonbahar');
      if (value.includes('ilkbahar')) tags.add('ilkbahar');
      if (value.includes('tüm sezon')) tags.add('tüm-mevsim');
    }
    
    // Occasion tags
    if (key.includes('ortam') || key.includes('kullanım')) {
      if (value.includes('günlük')) tags.add('günlük');
      if (value.includes('casual')) tags.add('casual');
      if (value.includes('şık')) tags.add('şık');
      if (value.includes('spor')) tags.add('spor');
      if (value.includes('iş')) tags.add('iş');
      if (value.includes('gece')) tags.add('gece');
    }
  });
  
  // Title-based intelligent tags
  if (title.includes('basic') || title.includes('temel')) tags.add('basic');
  if (title.includes('premium') || title.includes('lüks')) tags.add('premium');
  if (title.includes('organik')) tags.add('organik');
  if (title.includes('doğal')) tags.add('doğal');
  if (title.includes('comfort') || title.includes('rahat')) tags.add('rahat');
  if (title.includes('soft') || title.includes('yumuşak')) tags.add('yumuşak');
  
  // Product type specific tags
  if (title.includes('blazer') || title.includes('ceket')) {
    tags.add('dış-giyim');
    tags.add('ceket');
  }
  if (title.includes('pijama')) {
    tags.add('iç-giyim');
    tags.add('ev-giyim');
    tags.add('uyku');
  }
  if (title.includes('elbise')) {
    tags.add('elbise');
    tags.add('kadın-giyim');
  }
  if (title.includes('pantolon')) {
    tags.add('alt-giyim');
    tags.add('pantolon');
  }
  if (title.includes('gömlek') || title.includes('bluz')) {
    tags.add('üst-giyim');
  }
  
  // Brand and quality indicators
  if (productData.brand) {
    tags.add(productData.brand.toLowerCase());
  }
  
  // Size availability tags
  if (productData.variants && productData.variants.length > 0) {
    const hasSmallSizes = productData.variants.some((v: any) => 
      ['xs', 's', '34', '36'].includes(v.size?.toLowerCase()));
    const hasLargeSizes = productData.variants.some((v: any) => 
      ['xl', 'xxl', '44', '46', '48'].includes(v.size?.toLowerCase()));
    
    if (hasSmallSizes) tags.add('küçük-beden');
    if (hasLargeSizes) tags.add('büyük-beden');
  }
  
  // Price-based tags
  if (productData.price?.original) {
    const price = parseFloat(productData.price.original);
    if (price < 100) tags.add('ekonomik');
    else if (price < 300) tags.add('orta-segment');
    else tags.add('premium-fiyat');
  }
  
  // Remove generic tags and limit to 15 most relevant
  const filteredTags = Array.from(tags)
    .filter(tag => tag.length > 2 && !['genel', 'ürün', 'giyim'].includes(tag))
    .slice(0, 15);
  
  return filteredTags;
}

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
      product_type: determineProductCategory(productData),
      tags: generateAITags(productData).join(', '),
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

// Scheduled tasks API endpoints
router.get('/api/scheduler/status', async (req, res) => {
  try {
    const schedulerModule = await import('./simple-scheduler');
    const status = schedulerModule.getSchedulerStatus ? schedulerModule.getSchedulerStatus() : [];
    res.json(status);
  } catch (error) {
    console.error('Scheduler status error:', error);
    res.status(500).json({
      success: false,
      message: 'Zamanlı görev durumu alınamadı'
    });
  }
});

router.post('/api/scheduler/execute/:taskName', async (req, res) => {
  try {
    const { executeTaskManually } = require('./simple-scheduler');
    const { taskName } = req.params;
    const result = await executeTaskManually(taskName);
    
    if (result) {
      res.json({
        success: true,
        message: `Görev başarıyla çalıştırıldı: ${taskName}`
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Görev çalıştırılamadı: ${taskName}`
      });
    }
  } catch (error) {
    console.error('Manual task execution error:', error);
    res.status(500).json({
      success: false,
      message: 'Görev çalıştırılırken hata oluştu'
    });
  }
});

// Scheduler API endpoints
router.get('/api/scheduler/status', (req, res) => {
  res.json({
    success: true,
    data: {
      totalTasks: 3,
      activeTasks: 3,
      status: [
        {
          name: 'daily-monitoring',
          description: 'Ürün fiyatları ve stok durumlarını kontrol eder',
          time: '12:00',
          isActive: true,
          nextRun: 'Yarın 12:00'
        },
        {
          name: 'daily-summary',
          description: 'Günlük Z raporu hazırlar ve Telegram\'a gönderir',
          time: '23:00',
          isActive: true,
          nextRun: 'Bu gün 23:00'
        },
        {
          name: 'health-check',
          description: 'Sistem bileşenlerinin sağlığını kontrol eder',
          time: '06:00',
          isActive: true,
          nextRun: 'Yarın 06:00'
        }
      ]
    }
  });
});

router.post('/api/scheduler/execute/:taskName', async (req, res) => {
  try {
    const { taskName } = req.params;
    
    // Import and execute task manually
    const { executeTaskManually } = await import('./simple-scheduler');
    const result = await executeTaskManually(taskName);
    
    if (result) {
      res.json({
        success: true,
        message: `${taskName} görevi başarıyla çalıştırıldı`
      });
    } else {
      res.status(400).json({
        success: false,
        message: `${taskName} görevi çalıştırılamadı`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Görev çalıştırılırken hata oluştu'
    });
  }
});

// Memory Management API Endpoints
// Hafızadaki tüm ürünleri temizle
router.post('/api/memory/clear-all', async (req, res) => {
  try {
    const db = (await import('./db')).db;
    const { products, productVariants, priceHistory, stockHistory, shopifySyncLogs, monitoringSchedules } = await import('@shared/schema');
    
    // Tüm tabloları temizle (foreign key kısıtlamaları nedeniyle sırayla)
    await db.delete(priceHistory);
    await db.delete(stockHistory); 
    await db.delete(shopifySyncLogs);
    await db.delete(monitoringSchedules);
    await db.delete(productVariants);
    await db.delete(products);
    
    console.log('🗑️ Hafızadaki tüm ürünler temizlendi');
    
    // Telegram bildirimi gönder
    try {
      const telegramModule = await import('./telegram-integration');
      const telegramIntegration = telegramModule.telegramIntegration || telegramModule.default;
      await telegramIntegration.sendNotification(
        `🗑️ <b>HAFIZA TEMİZLENDİ</b>\n\n` +
        `✅ Tüm ürünler hafızadan silindi\n` +
        `📊 Sistem yeni ürün transferleri için hazır\n\n` +
        `📝 <i>Artık başarılı veri aktarımları otomatik olarak hafızaya eklenecek</i>`
      );
    } catch (telegramError) {
      console.error('Telegram bildirim hatası:', telegramError);
    }
    
    res.json({ 
      success: true, 
      message: 'Hafızadaki tüm ürünler başarıyla temizlendi'
    });
  } catch (error) {
    console.error('Hafıza temizleme hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Hafıza temizlenirken hata oluştu: ' + error.message 
    });
  }
});

// Başarılı transfer sonrası ürünü hafızaya ekle
router.post('/api/memory/add-product', async (req, res) => {
  try {
    const { productData, transferType } = req.body; // transferType: 'csv' veya 'shopify'
    
    if (!productData || !transferType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Product data ve transfer type gerekli' 
      });
    }
    
    const db = (await import('./db')).db;
    const { products, productVariants, insertProductSchema, insertProductVariantSchema } = await import('@shared/schema');
    
    // Ürün verisini veritabanı formatına dönüştür
    const productToInsert = {
      trendyolUrl: productData.url || '',
      trendyolProductId: productData.productId || '',
      shopifyProductId: productData.shopifyProductId || null,
      title: productData.title || '',
      brand: productData.brand || '',
      description: productData.description || '',
      category: productData.category || '',
      images: productData.images || [],
      features: productData.features || {},
      colorOptions: productData.variants?.map(v => v.color).filter(Boolean) || [],
      sizeOptions: productData.variants?.map(v => v.size).filter(Boolean) || [],
      isActive: true,
      profitMargin: '15.00',
      syncStatus: transferType === 'shopify' ? 'synced' : 'pending'
    };
    
    // Ürünü veritabanına ekle
    const [insertedProduct] = await db.insert(products).values(productToInsert).returning();
    
    // Varyantları ekle
    if (productData.variants && productData.variants.length > 0) {
      for (const variant of productData.variants) {
        const variantToInsert = {
          productId: insertedProduct.id,
          shopifyVariantId: variant.shopifyVariantId || null,
          color: variant.color || 'Varsayılan',
          size: variant.size || 'Tek Beden',
          sku: variant.sku || '',
          trendyolPrice: variant.originalPrice || 0,
          shopifyPrice: variant.salePrice || 0,
          stockCount: variant.stock || 0,
          inStock: (variant.stock || 0) > 0
        };
        
        await db.insert(productVariants).values(variantToInsert);
      }
    }
    
    console.log(`✅ Ürün hafızaya eklendi: ${productData.title} (${transferType})`);
    
    // Telegram bildirimi gönder
    try {
      const telegramModule = await import('./telegram-integration');
      const telegramIntegration = telegramModule.telegramIntegration || telegramModule.default;
      
      const transferTypeText = transferType === 'csv' ? 'CSV İNDİRİLDİ' : 'SHOPIFY YÜKLEME';
      const profitAmount = (productData.price?.withProfit || 0) - (productData.price?.original || 0);
      
      await telegramIntegration.sendNotification(
        `💾 <b>${transferTypeText} - HAFIZAYA EKLENDİ</b>\n\n` +
        `📦 <b>Ürün:</b> ${productData.title}\n` +
        `🏢 <b>Marka:</b> ${productData.brand}\n` +
        `💰 <b>Alış:</b> ${productData.price?.original?.toFixed(2)} TL\n` +
        `💵 <b>Satış:</b> ${productData.price?.withProfit?.toFixed(2)} TL\n` +
        `📈 <b>Kar:</b> ${profitAmount.toFixed(2)} TL\n` +
        `📊 <b>Varyant:</b> ${productData.variants?.length || 0} adet\n\n` +
        `🔍 <b>Artık bu ürün anlık takip edilecek!</b>\n` +
        `📱 Ürün analiz sayfasında değişimleri izleyebilirsiniz`
      );
    } catch (telegramError) {
      console.error('Telegram bildirim hatası:', telegramError);
    }
    
    res.json({ 
      success: true, 
      message: 'Ürün başarıyla hafızaya eklendi',
      productId: insertedProduct.id,
      transferType
    });
  } catch (error) {
    console.error('Hafızaya ürün ekleme hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ürün hafızaya eklenirken hata oluştu: ' + error.message 
    });
  }
});

export default router;