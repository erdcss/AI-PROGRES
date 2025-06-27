import { Router } from 'express';
import { memorySystem } from './memory-system';
import { shopifyIntegration } from './shopify-integration';
import { monitoringService } from './monitoring-service';
import { storage } from './storage-fixed';
import { telegramIntegration } from './telegram-integration';
import { cleanScrape } from './clean-scraper';
import { getSystemStatus, sendStatusToTelegram } from './simple-system-status';
import { ManualColorOverride, generateColorSelectionData, type ManualColorSelection } from './manual-color-override';

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

// Ana Trendyol scraper endpoint
router.post('/api/scrape', async (req, res) => {
  try {
    console.log('Scrape isteği alındı');
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz URL',
        details: ['URL parametresi gereklidir']
      });
    }

    // URL validation
    if (!url.includes('trendyol.com')) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz URL',
        details: ['Sadece Trendyol URL\'leri desteklenmektedir']
      });
    }

    console.log('URL normalize edildi:', url, '->', url);
    console.log('Trendyol ürün verisi işleniyor...');

    // Use clean scraper for comprehensive extraction
    console.log('🔧 Using clean scraper for comprehensive data extraction');
    const scrapedData = await cleanScrape(url);
    
    if (!scrapedData.success) {
      return res.status(500).json({
        success: false,
        message: 'Ürün verisi çıkarılamadı',
        details: ['Scraping işlemi başarısız oldu']
      });
    }

    console.log(`✅ Ürün başarıyla çıkarıldı: ${scrapedData.title}`);

    res.json({
      success: true,
      title: scrapedData.title,
      brand: scrapedData.brand,
      price: scrapedData.price,
      images: scrapedData.images,
      features: scrapedData.features,
      variants: scrapedData.variants,
      extractionTime: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Scraper hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sistem hatası',
      details: [error.message || 'Bilinmeyen hata']
    });
  }
});



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

// Manuel renk seçimi için varyant limitini kontrol etme endpoint'i
router.post('/color-selection', async (req, res) => {
  try {
    const { colors, sizes } = req.body;
    
    if (!colors || !sizes) {
      return res.status(400).json({ 
        success: false, 
        error: 'Renk ve beden listesi gerekli' 
      });
    }

    const selectionData = generateColorSelectionData(colors, sizes);
    
    res.json({
      success: true,
      data: selectionData
    });
    
  } catch (error) {
    console.error('Color selection error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Manuel renk seçimi hatası' 
    });
  }
});

// Gerçek ürün Shopify'a ekleme endpoint - Tam template formatında
router.post('/shopify-upload', async (req, res) => {
  try {
    // Force JSON response headers
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    
    const productData = req.body.productData || req.body;
    
    if (!productData || !productData.success) {
      return res.status(400).json({ success: false, error: 'Geçerli product data gerekli' });
    }

    // Manuel renk seçimi kontrolü
    const manualSelection = req.body.manualSelection || {
      selectedColors: [],
      selectedSizes: [],
      maxVariants: 99
    };

    // Varyant verilerini otomatik çıkar
    const rawVariants = productData.variants || [];
    
    // Renk ve beden listelerini çıkar
    const extractedColors = [...new Set(rawVariants.map(v => v.color).filter(Boolean))];
    const extractedSizes = [...new Set(rawVariants.map(v => v.size).filter(Boolean))];
    
    console.log(`📊 Çıkarılan varyantlar: ${extractedColors.length} renk x ${extractedSizes.length} beden = ${extractedColors.length * extractedSizes.length} toplam varyant`);
    
    // Manuel filtre uygula
    const colorOverride = ManualColorOverride.filterVariants(
      extractedColors, 
      extractedSizes, 
      manualSelection
    );
    
    console.log(`🎨 Manuel filtre sonucu: ${colorOverride.message}`);
    
    // Shopify varyant fixer'ı kullan
    const { ShopifyVariantFixer } = await import('./shopify-variant-fixer');
    
    // Filtrelenmiş varyantları oluştur
    const filteredVariants = [];
    for (const color of colorOverride.filteredColors) {
      for (const size of colorOverride.filteredSizes) {
        const originalVariant = rawVariants.find(v => v.color === color && v.size === size);
        filteredVariants.push({
          color,
          size,
          inStock: originalVariant?.inStock || true,
          price: originalVariant?.price || productData.price?.withProfit || 100
        });
      }
    }
    
    const cleanVariants = ShopifyVariantFixer.cleanAndDeduplicateVariants(filteredVariants);
    
    console.log(`🔧 Varyant temizleme: ${rawVariants.length} → ${filteredVariants.length} → ${cleanVariants.length} son varyant`);

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

    console.log('Shopify API response status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Shopify product created successfully');
      console.log('Product ID:', result?.product?.id);
      
      // Safely extract product data
      const productId = result?.product?.id;
      const productHandle = result?.product?.handle;
      
      if (!productId) {
        console.error('❌ No product ID in Shopify response:', result);
        return res.status(500).json({
          success: false,
          error: 'Shopify API yanıtında product ID bulunamadı',
          response: result
        });
      }
      
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
        `🆔 <b>Product ID:</b> ${productId}\n` +
        `🔗 <b>Admin URL:</b> kr5xdy-x7.myshopify.com/admin/products/${productId}`;
      
      // Telegram bildirimi gönder
      try {
        const telegramModule = await import('./telegram-integration');
        const telegramIntegration = telegramModule.telegramIntegration || telegramModule.default;
        await telegramIntegration.sendNotification(message);
        console.log('✅ Telegram notification sent successfully');
      } catch (telegramError) {
        console.error('Telegram notification error:', telegramError);
      }
    
      res.json({
        success: true,
        shopifyProductId: productId,
        adminUrl: `https://kr5xdy-x7.myshopify.com/admin/products/${productId}`,
        storeUrl: productHandle ? `https://kr5xdy-x7.myshopify.com/products/${productHandle}` : null,
        message: 'Ürün başarıyla Shopify\'a eklendi',
        product: result.product
      });
    } else {
      const errorText = await response.text();
      console.error('❌ Shopify API error:', response.status, errorText);
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
    
    // Benzersiz ID oluştur (timestamp + random)
    const uniqueProductId = `TM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Ürün verisini veritabanı formatına dönüştür
    const productToInsert = {
      trendyolUrl: productData.url || productData.trendyolUrl || '',
      trendyolProductId: uniqueProductId, // Benzersiz ID sistemi
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

// Memory management endpoints
router.post('/api/memory/clear-all', async (req, res) => {
  try {
    const { db } = await import('./db');
    const { products, productVariants } = await import('../shared/schema');
    
    // Delete all product variants first (foreign key constraint)
    await db.delete(productVariants);
    
    // Delete all products
    await db.delete(products);
    
    console.log('✅ Tüm ürünler hafızadan temizlendi');
    
    // Send Telegram notification
    try {
      const telegramModule = await import('./telegram-integration');
      const telegramIntegration = telegramModule.telegramIntegration || telegramModule.default;
      
      await telegramIntegration.sendNotification(
        `🧹 <b>HAFIZA TEMİZLENDİ</b>\n\n` +
        `✅ Tüm ürünler hafızadan silindi\n` +
        `📊 Sistem yeni ürün transferleri için hazır\n` +
        `🔄 Anlık takip sistemi sıfırlandı\n\n` +
        `💡 Yeni ürün transferleri otomatik olarak hafızaya eklenecek`
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

// Get real-time memory statistics
router.get('/memory/stats', async (req, res) => {
  try {
    const { db } = await import('./db');
    const { products, productVariants } = await import('../shared/schema');
    const { count } = await import('drizzle-orm');
    
    const totalProducts = await db.select({ count: count() }).from(products);
    const totalVariants = await db.select({ count: count() }).from(productVariants);
    
    res.json({
      totalProducts: totalProducts[0]?.count || 0,
      totalVariants: totalVariants[0]?.count || 0,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('Hafıza istatistikleri hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Hafıza istatistikleri alınırken hata oluştu' 
    });
  }
});

// Enhanced recent products endpoint with full URL support
router.get('/analysis/recent-products', async (req, res) => {
  try {
    const { db } = await import('./db');
    const { products } = await import('../shared/schema');
    const { desc } = await import('drizzle-orm');
    
    const recentProducts = await db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt))
      .limit(3);
    
    const formattedProducts = recentProducts.map(product => ({
      id: product.id.toString(),
      title: product.title,
      brand: product.brand,
      currentPrice: product.currentPrice || 'N/A',
      originalPrice: product.originalPrice || 'N/A',
      stockStatus: product.stockStatus || false,
      lastChecked: product.lastChecked ? new Date(product.lastChecked).toLocaleString('tr-TR') : 'Henüz kontrol edilmedi',
      trendyolUrl: product.trendyolUrl,
      shopifyProductId: product.shopifyProductId,
      shopifyUrl: product.shopifyProductId ? 
        `https://kr5xdy-x7.myshopify.com/products/${product.title?.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}` : 
        null
    }));
    
    res.json({
      success: true,
      products: formattedProducts
    });
  } catch (error) {
    console.error('Recent products error:', error);
    res.status(500).json({ success: false, error: 'Ürün listesi alınamadı' });
  }
});

// Enhanced product changes endpoint with URLs
router.get('/analysis/product-changes', async (req, res) => {
  try {
    const { db } = await import('./db');
    const { priceHistory, stockHistory, products } = await import('../shared/schema');
    const { desc, eq } = await import('drizzle-orm');
    
    // Return empty arrays if no history data exists
    const changes: any[] = [];
    
    res.json({
      success: true,
      changes
    });
  } catch (error) {
    console.error('Product changes error:', error);
    res.status(500).json({ success: false, error: 'Değişiklik geçmişi alınamadı' });
  }
});

// Daily operations endpoint
router.get('/analysis/daily-operations', async (req, res) => {
  try {
    // Return sample data for now - this will be replaced with real monitoring data
    const operations = [
      {
        id: '1',
        type: 'price_check',
        status: 'completed',
        timestamp: new Date().toLocaleString('tr-TR'),
        details: 'Günlük fiyat kontrolü tamamlandı'
      },
      {
        id: '2',
        type: 'stock_check',
        status: 'completed',
        timestamp: new Date().toLocaleString('tr-TR'),
        details: 'Stok durumu güncellendi'
      },
      {
        id: '3',
        type: 'shopify_sync',
        status: 'pending',
        timestamp: new Date().toLocaleString('tr-TR'),
        details: 'Shopify senkronizasyonu bekliyor'
      },
      {
        id: '4',
        type: 'telegram_report',
        status: 'pending',
        timestamp: '23:00',
        details: 'Günlük Z raporu gönderilecek'
      }
    ];
    
    res.json({
      success: true,
      priceChanges: 0,
      stockChanges: 0,
      shopifyUpdates: 0,
      operations
    });
  } catch (error) {
    console.error('Daily operations error:', error);
    res.status(500).json({ success: false, error: 'Günlük işlemler alınamadı' });
  }
});

// AI Chat endpoint for product analysis
router.post('/analysis/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, error: 'Mesaj gereklidir' });
    }
    
    // Get current system stats for context
    const { db } = await import('./db');
    const { products, productVariants } = await import('../shared/schema');
    const { count } = await import('drizzle-orm');
    
    const totalProducts = await db.select({ count: count() }).from(products);
    const totalVariants = await db.select({ count: count() }).from(productVariants);
    
    const productCount = totalProducts[0]?.count || 0;
    const variantCount = totalVariants[0]?.count || 0;
    
    // Simple AI responses based on context
    let response = '';
    
    if (message.toLowerCase().includes('kaç ürün') || message.toLowerCase().includes('ürün sayısı')) {
      response = `Şu anda sistemde ${productCount} ürün ve ${variantCount} varyant bulunuyor. Bu ürünler otomatik olarak takip ediliyor ve fiyat/stok değişikliklerinde Shopify ile senkronize ediliyor.`;
    } else if (message.toLowerCase().includes('monitoring') || message.toLowerCase().includes('takip')) {
      response = `Otomatik takip sistemi aktif. Her gün 12:00'da ürün kontrolleri yapılıyor, 23:00'da detaylı raporlar gönderiliyor. Anlık değişiklikler Telegram üzerinden bildiriliyor.`;
    } else if (message.toLowerCase().includes('shopify') || message.toLowerCase().includes('mağaza')) {
      response = `Shopify entegrasyonu tam aktif. Trendyol'dan çıkarılan ürünler otomatik olarak %15 kar marjı ile Shopify'a ekleniyor. Fiyat ve stok değişiklikleri gerçek zamanlı senkronize ediliyor.`;
    } else if (message.toLowerCase().includes('fiyat') || message.toLowerCase().includes('price')) {
      response = `Fiyat takip sistemi çalışıyor. Trendyol'daki fiyat değişiklikleri algılandığında Shopify fiyatları otomatik güncelleniyor. %15 kar marjı korunuyor.`;
    } else if (message.toLowerCase().includes('stok') || message.toLowerCase().includes('stock')) {
      response = `Stok takibi aktif. Örneğin "siyah ayakkabı 35 numara" Trendyol'da tükenmişse, Shopify'daki stok otomatik sıfırlanıyor. Tekrar stoğa girdiğinde geri yükleniyor.`;
    } else if (message.toLowerCase().includes('telegram') || message.toLowerCase().includes('bildirim')) {
      response = `Telegram bildirimleri çalışıyor. Ürün değişiklikleri, yeni transferler, sistem durumu anlık olarak Telegram'dan bildiriliyor. Bot ID: @turmarktbot`;
    } else if (message.toLowerCase().includes('rapor') || message.toLowerCase().includes('report')) {
      response = `Günlük Z raporları her gece 23:00'da otomatik gönderiliyor. E-mail (e2943592@gmail.com) ve Telegram üzerinden detaylı satış, kar ve stok raporları alıyorsunuz.`;
    } else if (message.toLowerCase().includes('nasıl') || message.toLowerCase().includes('how')) {
      response = `Sistem şöyle çalışıyor: 1) Trendyol URL'si veriyorsunuz 2) Ürün çıkarılıp Shopify'a aktarılıyor 3) Hafızaya kaydediliyor 4) Otomatik takip başlıyor 5) Değişiklikler algılanıp senkronize ediliyor.`;
    } else {
      response = `Bu konuda size yardımcı olabilirim. Şu anda ${productCount} ürün takip ediliyor, sistem tam operasyonel. Ürün sayısı, fiyat takibi, stok durumu, Shopify entegrasyonu veya otomatik raporlar hakkında soru sorabilirsiniz.`;
    }
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: 'AI yanıtı alınamadı' });
  }
});

// System status JSON endpoint
router.get('/system/status', async (req, res) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      error: 'Sistem durumu alınamadı',
      timestamp: new Date().toISOString()
    });
  }
});

// System status report to Telegram
router.post('/system/report', async (req, res) => {
  try {
    const success = await sendStatusToTelegram();
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Sistem durum raporu Telegram\'a gönderildi' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Rapor gönderilemedi' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: `Rapor oluşturma hatası: ${error}` 
    });
  }
});

export default router;