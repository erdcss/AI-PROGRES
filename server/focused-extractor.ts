/**
 * Focused Extractor - Sadece istenen 5 veri tipini çıkarır
 * 1. Ürün markası
 * 2. Ürün başlığı  
 * 3. Ürün görselleri
 * 4. Ürün varyantları
 * 5. Ürün özellikleri
 */

export interface FocusedProductData {
  brand: string;
  title: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
    withProfit: number;
    profitFormatted: string;
  };
  images: string[];
  colorOptions: string[];
  sizeOptions: string[];
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
    stockCount: number;
  }>;
  stockAnalysis: {
    totalVariants: number;
    inStockVariants: number;
    outOfStockVariants: number;
    availableSizes: string[];
    unavailableSizes: string[];
  };
  features: Array<{
    key: string;
    value: string;
  }>;
}

export async function extractFocusedData(url: string): Promise<FocusedProductData> {
  console.log(`🎯 Focused extraction başlatılıyor: ${url}`);
  
  // Sayfa içeriğini fetch et
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const htmlContent = await response.text();
  
  // Product state JSON çıkar
  const productStateRegex = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s;
  const match = htmlContent.match(productStateRegex);
  
  if (!match) {
    throw new Error('Ürün verisi bulunamadı');
  }
  
  const productState = JSON.parse(match[1]);
  const product = productState.product;
  
  if (!product) {
    throw new Error('Product data yok');
  }
  
  // 1. MARKA
  const brand = product.brand?.name || 'Bilinmiyor';
  console.log(`✓ Marka: ${brand}`);
  
  // 2. BAŞLIK
  const title = product.name || 'Başlık bulunamadı';
  console.log(`✓ Başlık: ${title}`);
  
  // 3. FİYAT - %10 kar marjı ile
  let priceData = {
    original: 0,
    currency: 'TRY',
    formatted: '0 TL',
    withProfit: 0,
    profitFormatted: '0 TL'
  };
  
  // Gelişmiş fiyat çıkarma - çoklu kaynak kontrolü
  let foundPrice = false;
  
  // 1. Selling price kontrolü
  if (product.price?.sellingPrice?.value) {
    // Fiyat değerini kontrol et - eğer çok küçükse kuruş cinsinden, büyükse TL cinsinden
    let originalPrice = product.price.sellingPrice.value;
    if (originalPrice > 1000) {
      originalPrice = originalPrice / 100; // Kuruş -> TL dönüşümü
    }
    
    const currency = product.price.sellingPrice.currency || 'TRY';
    const profitPrice = Math.round(originalPrice * 1.1 * 100) / 100;
    
    priceData = {
      original: originalPrice,
      currency: currency,
      formatted: `${originalPrice.toFixed(2)} TL`,
      withProfit: profitPrice,
      profitFormatted: `${profitPrice.toFixed(2)} TL`
    };
    foundPrice = true;
  }
  
  // 2. Original price kontrolü
  if (!foundPrice && product.price?.originalPrice?.value) {
    let originalPrice = product.price.originalPrice.value;
    if (originalPrice > 1000) {
      originalPrice = originalPrice / 100; // Kuruş -> TL dönüşümü
    }
    
    const currency = product.price.originalPrice.currency || 'TRY';
    const profitPrice = Math.round(originalPrice * 1.1 * 100) / 100;
    
    priceData = {
      original: originalPrice,
      currency: currency,
      formatted: `${originalPrice.toFixed(2)} TL`,
      withProfit: profitPrice,
      profitFormatted: `${profitPrice.toFixed(2)} TL`
    };
    foundPrice = true;
  }
  
  // 3. Direct price field kontrolü
  if (!foundPrice && product.price && typeof product.price === 'number') {
    const originalPrice = product.price;
    const profitPrice = Math.round(originalPrice * 1.1 * 100) / 100;
    
    priceData = {
      original: originalPrice,
      currency: 'TRY',
      formatted: `${originalPrice.toFixed(2)} TL`,
      withProfit: profitPrice,
      profitFormatted: `${profitPrice.toFixed(2)} TL`
    };
    foundPrice = true;
  }
  
  // 4. HTML'den fiyat regex ile çıkarma
  if (!foundPrice) {
    const priceRegex = /"price":\s*(\d+(?:\.\d+)?)/;
    const priceMatch = htmlContent.match(priceRegex);
    if (priceMatch) {
      const originalPrice = parseFloat(priceMatch[1]);
      const profitPrice = Math.round(originalPrice * 1.1 * 100) / 100;
      
      priceData = {
        original: originalPrice,
        currency: 'TRY',
        formatted: `${originalPrice.toFixed(2)} TL`,
        withProfit: profitPrice,
        profitFormatted: `${profitPrice.toFixed(2)} TL`
      };
      foundPrice = true;
    }
  }
  
  console.log(`✓ Fiyat: ${priceData.formatted} → %10 kar: ${priceData.profitFormatted} ${foundPrice ? '(Kaynak: JSON)' : '(Kaynak: HTML)'}`);
  
  // 4. GÖRSELLER - Gelişmiş görsel çıkarma
  const images: string[] = [];
  
  // Ana ürün görselleri
  if (product.images && Array.isArray(product.images)) {
    product.images.forEach((img: any) => {
      let imageUrl = null;
      
      // Farklı görsel formatları kontrol et
      if (typeof img === 'string') {
        if (img.includes('dsmcdn.com')) {
          imageUrl = img;
        } else if (img.startsWith('/')) {
          // Relative URL'i absolute'a çevir
          imageUrl = `https://cdn.dsmcdn.com${img}`;
        }
      } else if (img?.url && typeof img.url === 'string') {
        if (img.url.includes('dsmcdn.com')) {
          imageUrl = img.url;
        } else if (img.url.startsWith('/')) {
          imageUrl = `https://cdn.dsmcdn.com${img.url}`;
        }
      } else if (img?.link && typeof img.link === 'string') {
        if (img.link.includes('dsmcdn.com')) {
          imageUrl = img.link;
        } else if (img.link.startsWith('/')) {
          imageUrl = `https://cdn.dsmcdn.com${img.link}`;
        }
      }
      
      if (imageUrl && !images.includes(imageUrl)) {
        images.push(imageUrl);
        console.log(`📸 Ana görsel: ${imageUrl}`);
      }
    });
  }
  
  // Varyant görselleri
  if (product.allVariants && Array.isArray(product.allVariants)) {
    product.allVariants.forEach((variant: any) => {
      if (variant.images && Array.isArray(variant.images)) {
        variant.images.forEach((img: any) => {
          let imageUrl = null;
          
          if (typeof img === 'string' && img.includes('dsmcdn.com')) {
            imageUrl = img;
          } else if (img?.url && img.url.includes('dsmcdn.com')) {
            imageUrl = img.url;
          }
          
          if (imageUrl && !images.includes(imageUrl)) {
            images.push(imageUrl);
            console.log(`📸 Varyant görseli: ${imageUrl}`);
          }
        });
      }
    });
  }
  
  // Alternatif görsel kaynakları
  if (images.length === 0) {
    console.log(`⚠️ Ana kaynaklardan görsel bulunamadı, alternatif kaynaklar kontrol ediliyor...`);
    
    // Product detail içindeki diğer görsel alanları kontrol et
    const alternativeSources = [
      product.productImages,
      product.galleryImages,
      product.media?.images,
      productState.productDetail?.images,
      productState.gallery?.images
    ];
    
    alternativeSources.forEach((source, index) => {
      console.log(`🔍 Alternatif kaynak ${index + 1} kontrol ediliyor:`, !!source);
      
      if (source && Array.isArray(source)) {
        source.forEach((img: any) => {
          let imageUrl = null;
          
          if (typeof img === 'string' && img.includes('dsmcdn.com')) {
            imageUrl = img;
          } else if (img?.url && img.url.includes('dsmcdn.com')) {
            imageUrl = img.url;
          }
          
          if (imageUrl && !images.includes(imageUrl)) {
            images.push(imageUrl);
            console.log(`📸 Alternatif görsel: ${imageUrl}`);
          }
        });
      }
    });
  }
  
  // Son çare: HTML'den görsel URL'lerini regex ile çıkar
  if (images.length === 0) {
    console.log(`⚠️ JSON'dan görsel bulunamadı, HTML'den regex ile aranıyor...`);
    
    const imageRegexes = [
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/[^"'\s]+\.jpg/g,
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/[^"'\s]+\.jpeg/g,
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/[^"'\s]+\.webp/g,
      /"url":"(https:\/\/cdn\.dsmcdn\.com[^"]+)"/g
    ];
    
    imageRegexes.forEach(regex => {
      const matches = htmlContent.match(regex) || [];
      matches.forEach(match => {
        let imageUrl = match;
        if (match.includes('"url":"')) {
          imageUrl = match.replace('"url":"', '').replace('"', '');
        }
        
        if (imageUrl.includes('dsmcdn.com') && !images.includes(imageUrl)) {
          images.push(imageUrl);
          console.log(`📸 HTML'den görsel: ${imageUrl}`);
        }
      });
    });
  }
  
  // Manuel relative URL dönüştürme - tüm ürünler için
  if (images.length === 0 && product?.images && Array.isArray(product.images)) {
    product.images.forEach((img: any, index: number) => {
      if (typeof img === 'string' && img.startsWith('/')) {
        const fullUrl = `https://cdn.dsmcdn.com${img}`;
        images.push(fullUrl);
        console.log(`📸 Manuel dönüştürme ${index + 1}: ${fullUrl}`);
      }
    });
  }
  
  console.log(`✓ Görseller: ${images.length} adet`);
  
  // Debug: Görsel verilerini detaylı logla
  if (images.length === 0) {
    console.log(`❌ GÖRSEL BULUNAMADI - Debug bilgileri:`);
    console.log(`📦 Product var: ${!!product}`);
    console.log(`🖼️ Product.images var: ${!!product?.images}`);
    console.log(`📊 Product.images length: ${product?.images?.length || 0}`);
    
    if (product?.images && product.images.length > 0) {
      console.log(`🔍 İlk görsel objesi:`, JSON.stringify(product.images[0], null, 2));
      
      // Manuel relative URL dönüştürme
      product.images.forEach((img: any, index: number) => {
        if (typeof img === 'string' && img.startsWith('/')) {
          const fullUrl = `https://cdn.dsmcdn.com${img}`;
          images.push(fullUrl);
          console.log(`📸 Manuel dönüştürme ${index + 1}: ${fullUrl}`);
        }
      });
    }
  } else {
    console.log(`✅ İlk görsel: ${images[0]}`);
  }
  
  // 5. VARYANTLAR - Gelişmiş varyant çıkarma (stokta olan + olmayan)
  const variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
    stockCount: number;
  }> = [];
  
  const colorSet = new Set<string>();
  const sizeSet = new Set<string>();
  const outOfStockSizes = new Set<string>();
  
  console.log('🔍 AllVariants işleniyor...');
  
  if (product.allVariants && Array.isArray(product.allVariants)) {
    console.log(`📋 AllVariants sayısı: ${product.allVariants.length}`);
    
    product.allVariants.forEach((variant: any, index: number) => {
      if (!variant) return;
      
      console.log(`Varyant ${index} debug:`, JSON.stringify(variant, null, 2).substring(0, 300));
      
      const attributes = variant.attributes || {};
      let color = attributes.RENK || attributes.Renk || attributes.renk || variant.color || 'Varsayılan';
      let size = attributes.BEDEN || attributes.Beden || attributes.beden || variant.size || 'Tek Beden';
      
      // Varyant "value" alanından beden çıkar - EN ÖNEMLİ!
      if (variant.value && typeof variant.value === 'string') {
        const cleanValue = variant.value.trim();
        // S, M, L, XL, 2XL, 3XL gibi beden kontrolü
        if (cleanValue.match(/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|\d{2,3})$/i)) {
          size = cleanValue.toUpperCase();
          console.log(`  ✓ VARIANT VALUE'dan beden bulundu: ${size}`);
        }
      }

      // ItemAttributes'dan da kontrol et
      if (variant.itemAttributes && Array.isArray(variant.itemAttributes)) {
        variant.itemAttributes.forEach((attr: any) => {
          if (attr.attributeName && attr.attributeValue) {
            const attrName = attr.attributeName.toLowerCase();
            if (attrName.includes('beden') || attrName.includes('size')) {
              size = attr.attributeValue;
              console.log(`  ✓ ItemAttributes'dan beden bulundu: ${size}`);
            } else if (attrName.includes('renk') || attrName.includes('color')) {
              color = attr.attributeValue;
              console.log(`  ✓ ItemAttributes'dan renk bulundu: ${color}`);
            }
          }
        });
      }
      
      // Stok durumu kontrolü - daha detaylı
      let stockCount = 0;
      let inStock = false;
      
      if (variant.stock !== undefined) {
        stockCount = parseInt(variant.stock) || 0;
      } else if (variant.stockCount !== undefined) {
        stockCount = parseInt(variant.stockCount) || 0;
      } else if (variant.quantity !== undefined) {
        stockCount = parseInt(variant.quantity) || 0;
      }
      
      // inStock boolean kontrolü - RAW veriden al
      if (variant.inStock !== undefined) {
        inStock = Boolean(variant.inStock);
        console.log(`  📦 RAW inStock değeri: ${variant.inStock} → ${inStock}`);
      } else {
        inStock = stockCount > 0;
        console.log(`  📦 Stock count'tan hesaplanan: ${stockCount} → ${inStock}`);
      }
      
      console.log(`  📦 Stok Bilgisi: count=${stockCount}, inStock=${inStock}`);
      
      console.log(`  → Final: color="${color}", size="${size}"`);
      
      // Tüm renk ve beden seçeneklerini topla
      colorSet.add(String(color));
      sizeSet.add(String(size));
      
      // Debug: Gerçek beden tespit edildi mi?
      if (size !== 'Tek Beden' && size !== 'Varsayılan') {
        console.log(`🎯 GERÇEK BEDEN EKLENDI: "${size}"`);
      }
      
      console.log(`  → SizeSet güncellendi: [${Array.from(sizeSet).join(', ')}]`);
      
      // Eğer bu ürün için gerçek bedenleri görüyorsak bunları kaydet
      if (size !== 'Tek Beden' && size !== 'Varsayılan' && size.length > 0) {
        console.log(`🎯 GERÇEK BEDEN BULUNDU: "${size}" - Kaynak: ${variant.itemAttributes ? 'itemAttributes' : 'attributes'}`);
      };
      
      // Stokta olmayan bedenleri ayrı takip et
      if (!inStock && size !== 'Tek Beden') {
        outOfStockSizes.add(String(size));
      }
      
      // Tüm varyantları ekle
      variants.push({
        color: String(color),
        size: String(size),
        inStock: inStock,
        stockCount: stockCount
      });
    });
  }
  
  // Alternatif varyant kaynakları kontrol et
  if (variants.length === 0) {
    const alternativeVariantSources = [
      product.variants,
      product.options,
      productState.variants,
      productState.product?.variants
    ];
    
    alternativeVariantSources.forEach(source => {
      if (source && Array.isArray(source)) {
        source.forEach((variant: any) => {
          const color = variant.color || variant.renk || 'Varsayılan';
          const size = variant.size || variant.beden || 'Tek Beden';
          const stockCount = parseInt(variant.stock || variant.quantity || '0');
          const inStock = stockCount > 0;
          
          colorSet.add(String(color));
          sizeSet.add(String(size));
          
          // Stokta olmayan bedenleri kaydet
          if (!inStock && size !== 'Tek Beden') {
            outOfStockSizes.add(String(size));
          }
          
          variants.push({
            color: String(color),
            size: String(size),
            inStock: inStock,
            stockCount: stockCount
          });
        });
      }
    });
  }
  
  // Beden seçenekleri çıkarımı - iki adımda
  console.log('🔍 Beden seçenekleri çıkarılıyor...');
  
  // Adım 1: Variants'tan direkt beden çıkar
  variants.forEach((variant, index) => {
    if (variant.size && variant.size !== 'Tek Beden' && variant.size !== 'Varsayılan') {
      const cleanSize = variant.size.trim();
      if (cleanSize.match(/^(XS|S|M|L|XL|XXL|XXXL|3XL|4XL|\d{2,3})$/i)) {
        sizeSet.add(cleanSize.toUpperCase());
        console.log(`✓ Varyant'tan beden: ${cleanSize}`);
      }
    }
  });

  // Adım 2: Hiç beden bulunamadıysa HTML'den agresif arama
  if (sizeSet.size === 0) {
    console.log('Varyantlardan beden bulunamadı, HTML taranıyor...');
    
    // HTML'de yaygın beden formatlarını ara
    const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    for (let i = 34; i <= 54; i += 2) {
      commonSizes.push(i.toString());
    }
    
    commonSizes.forEach(size => {
      const patterns = [
        new RegExp(`"${size}"[^\\w]`, 'gi'),
        new RegExp(`'${size}'[^\\w]`, 'gi'),
        new RegExp(`>${size}<`, 'gi'),
        new RegExp(`\\b${size}\\b`, 'gi')
      ];
      
      if (patterns.some(pattern => pattern.test(htmlContent))) {
        sizeSet.add(size.toUpperCase());
        console.log(`✓ HTML'den beden: ${size}`);
      }
    });
  }

  // Debug: Ürün durumunu ve bulunan bedenleri detaylı logla
  console.log(`📏 Beden Set İçeriği: [${Array.from(sizeSet).join(', ')}]`);
  if (sizeSet.size === 0) {
    console.log('⚠️ Hiç beden seçeneği bulunamadı');
  } else {
    console.log(`✓ Toplam ${sizeSet.size} beden seçeneği bulundu: ${Array.from(sizeSet).join(', ')}`);
  }

  // Bu ürün için özel debug - HTML'de gerçekten beden var mı?
  console.log('🔍 Özel debug - HTML içeriği kontrol ediliyor...');
  
  // Farklı varyant yapıları kontrol et
  if (product.allVariants) {
    console.log(`📋 AllVariants sayısı: ${product.allVariants.length}`);
    product.allVariants.slice(0, 3).forEach((variant: any, index: number) => {
      console.log(`Varyant ${index}: ${JSON.stringify(variant, null, 2).substring(0, 200)}...`);
    });
  }

  // Variants yapısını kontrol et
  if (variants && variants.length > 0) {
    console.log(`📋 Variants sayısı: ${variants.length}`);
    variants.slice(0, 3).forEach((variant: any, index: number) => {
      console.log(`Parsed Variant ${index}: size="${variant.size}", color="${variant.color}", inStock=${variant.inStock}`);
    });
  }

  // Product allVariants'tan çıkar
  if (product.allVariants && Array.isArray(product.allVariants)) {
    product.allVariants.forEach((variant: any) => {
      if (variant.itemAttributes) {
        variant.itemAttributes.forEach((attr: any) => {
          if (attr.attributeValue && typeof attr.attributeValue === 'string') {
            const size = attr.attributeValue.trim();
            if (size.match(/^(XS|S|M|L|XL|XXL|XXXL|\d{2,3})$/i) && size !== 'STD') {
              sizeSet.add(size.toUpperCase());
            }
          }
        });
      }
    });
  }

  // Variants dizisinden beden çıkar
  if (product.variants && Array.isArray(product.variants)) {
    product.variants.forEach((variant: any) => {
      if (variant.attributes) {
        Object.values(variant.attributes).forEach((attr: any) => {
          if (attr && typeof attr === 'string') {
            const size = attr.trim();
            if (size.match(/^(XS|S|M|L|XL|XXL|XXXL|\d{2,3})$/i) && size !== 'STD') {
              sizeSet.add(size.toUpperCase());
            }
          }
        });
      }
    });
  }
  
  // HTML'den ek beden seçenekleri
  const htmlSizePattern = /(?:beden|size)["\s]*:["\s]*["']([^"']+)["']/gi;
  let htmlMatch;
  while ((htmlMatch = htmlSizePattern.exec(htmlContent)) !== null) {
    const size = htmlMatch[1].trim();
    if (size.match(/^(XS|S|M|L|XL|XXL|XXXL|\d{2,3})$/i)) {
      sizeSet.add(size.toUpperCase());
    }
  }
  
  // Renk ve beden seçeneklerini arraye çevir
  const colorOptions = Array.from(colorSet).filter(color => 
    color !== 'Varsayılan' && color.length > 0 && !color.includes('undefined')
  );
  
  console.log(`🔧 Final beden filtreleme öncesi: [${Array.from(sizeSet).join(', ')}]`);
  
  // Sadece stokta olan bedenleri al
  const inStockSizes = new Set<string>();
  variants.forEach(variant => {
    if (variant.inStock && variant.size !== 'Tek Beden') {
      inStockSizes.add(variant.size);
    }
  });
  
  console.log(`📦 Stokta olan bedenler: [${Array.from(inStockSizes).join(', ')}]`);
  console.log(`📦 Stokta olmayan bedenler: [${Array.from(outOfStockSizes).join(', ')}]`);
  
  const sizeOptions = Array.from(inStockSizes).filter(size => {
    const isValid = size !== 'Tek Beden' && 
      size.length > 0 && 
      size.length <= 5 &&
      !size.includes('undefined') && 
      !size.includes('null') &&
      /^[A-Za-z0-9\/\-]+$/.test(size);
    
    console.log(`Beden "${size}" kontrol: ${isValid ? 'GEÇERLİ' : 'GEÇERSİZ'} (Stokta: VAR)`);
    return isValid;
  }).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return a.localeCompare(b);
  });
  
  console.log(`🔧 Final beden listesi: [${sizeOptions.join(', ')}]`);
  
  console.log(`✓ Varyantlar: ${variants.length} adet`);
  console.log(`✓ Renk seçenekleri: ${colorOptions.length} adet - ${colorOptions.join(', ')}`);
  console.log(`✓ Beden seçenekleri: ${sizeOptions.length} adet - ${sizeOptions.join(', ')} (SADECE STOKTA OLANLAR)`);
  
  if (outOfStockSizes.size > 0) {
    console.log(`⚠️ Stokta olmayan bedenler CSV'ye eklenmedi: ${Array.from(outOfStockSizes).join(', ')}`);
  }
  
  // 6. ÖZELLİKLER - Tüm ürün özelliklerini çıkar
  const features: Array<{
    key: string;
    value: string;
  }> = [];
  
  const processedKeys = new Set<string>();
  
  console.log('🔍 Ürün özellikleri detaylı çıkarım başlatılıyor...');
  
  // HTML'den ürün özellikleri tablosu çıkar - ÖNCE BUNU YAP
  console.log('📋 HTML tablosundan detaylı özellikler çıkarılıyor...');
  
  // Ürün özellikleri tablosu için farklı pattern'ler dene
  const featurePatterns = [
    // Trendyol ürün özellikleri tablosu
    /<tr[^>]*>\s*<td[^>]*class="[^"]*feature[^"]*"[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi,
    // Genel tablo yapısı
    /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi,
    // Başka bir pattern
    /<div[^>]*class="[^"]*property[^"]*"[^>]*>.*?<span[^>]*>([^<]+)<\/span>.*?<span[^>]*>([^<]+)<\/span>.*?<\/div>/gi
  ];
  
  featurePatterns.forEach((pattern, index) => {
    console.log(`  Pattern ${index + 1} deneniyor...`);
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const key = match[1].trim().replace(/[:\s]+$/, '');
      const value = match[2].trim();
      
      if (key && value && key.length > 1 && value.length > 0 && 
          !processedKeys.has(key.toLowerCase()) &&
          !key.includes('script') && !value.includes('script')) {
        features.push({ key, value });
        processedKeys.add(key.toLowerCase());
        console.log(`    ✓ Tablo'dan özellik: ${key} = ${value}`);
      }
    }
  });
  
  // Product attributes'dan - temel özellikler
  if (product.attributes && typeof product.attributes === 'object') {
    console.log('🏷️ Product attributes çıkarılıyor...');
    Object.entries(product.attributes).forEach(([key, value]) => {
      if (key && value && 
          typeof key === 'string' && typeof value === 'string' &&
          key.length > 1 && key.length < 100 &&
          value.length > 0 && value.length < 200 &&
          !processedKeys.has(key.toLowerCase())) {
        
        features.push({
          key: key.trim(),
          value: value.trim()
        });
        processedKeys.add(key.toLowerCase());
        console.log(`  ✓ Attribute: ${key} = ${value}`);
      }
    });
  }
  
  // Product contentDescriptions - detaylı açıklamalar
  if (product.contentDescriptions && Array.isArray(product.contentDescriptions)) {
    product.contentDescriptions.forEach((desc: any) => {
      if (desc?.description && typeof desc.description === 'string') {
        const cleanDesc = desc.description.replace(/<[^>]*>/g, '').trim();
        if (cleanDesc.length > 10 && cleanDesc.length < 500) {
          features.push({
            key: 'Ürün Açıklaması',
            value: cleanDesc
          });
        }
      }
    });
  }
  
  // Product properties - teknik özellikler
  if (product.properties && Array.isArray(product.properties)) {
    product.properties.forEach((prop: any) => {
      if (prop?.name && prop?.value && 
          !processedKeys.has(prop.name.toLowerCase())) {
        features.push({
          key: prop.name,
          value: prop.value
        });
        processedKeys.add(prop.name.toLowerCase());
      }
    });
  }
  
  // Alternatif özellik kaynakları - kapsamlı arama
  const alternativeFeatureSources = [
    product.productAttributes,
    product.specifications,
    product.details,
    product.productDetail,
    productState.productDetail?.attributes,
    productState.product?.specifications,
    productState.product?.properties
  ];
  
  alternativeFeatureSources.forEach(source => {
    if (source && typeof source === 'object') {
      Object.entries(source).forEach(([key, value]) => {
        if (key && value && 
            typeof key === 'string' && typeof value === 'string' &&
            key.length > 1 && key.length < 100 &&
            value.length > 0 && value.length < 200 &&
            !processedKeys.has(key.toLowerCase())) {
          
          features.push({
            key: key.trim(),
            value: value.trim()
          });
          processedKeys.add(key.toLowerCase());
        }
      });
    }
  });
  
  // Temel ürün bilgilerini özellik olarak ekle
  const basicFeatures = [
    { key: 'Kategori', value: product.category?.name || product.categoryName },
    { key: 'Satıcı', value: product.merchant?.name },
    { key: 'Model', value: product.model },
    { key: 'SKU', value: product.sku },
    { key: 'Barkod', value: product.barcode }
  ];
  
  basicFeatures.forEach(({ key, value }) => {
    if (value && !processedKeys.has(key.toLowerCase())) {
      features.push({ key, value: String(value) });
      processedKeys.add(key.toLowerCase());
    }
  });
  
  console.log(`✓ Özellikler: ${features.length} adet (kapsamlı)`);
  
  // Stokta olmayan ürün kontrolü
  const isOutOfStock = variants.every(v => !v.inStock) || variants.length === 0;
  
  const result: FocusedProductData = {
    brand,
    title,
    price: priceData,
    images: images.slice(0, 10), // İlk 10 görsel
    colorOptions,
    sizeOptions,
    variants: variants.slice(0, 30), // İlk 30 varyant
    isOutOfStock,
    features // Tüm özellikler tam liste
  };
  
  console.log(`🎯 Focused extraction tamamlandı`);
  
  return result;
}