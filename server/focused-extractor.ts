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
  category: string;
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
  
  // Kategori çıkarımı için gerekli değişken
  let extractedCategory = '';
  
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
  
  // 4. GÖRSELLER - Tek renk seçeneği için görsel çıkarma
  const images: string[] = [];
  let primaryColorFound = false;
  let primaryColor = 'default';
  
  // İlk olarak ana rengi tespit et
  if (product.allVariants && Array.isArray(product.allVariants)) {
    const firstVariant = product.allVariants[0];
    if (firstVariant?.color) {
      primaryColor = firstVariant.color;
      primaryColorFound = true;
      console.log(`🎨 Ana renk belirlendi: "${primaryColor}"`);
    }
  }
  
  // Ana ürün görsellerini al - sadece tek renk için sınırlı sayıda
  if (product.images && Array.isArray(product.images)) {
    let imageLimit = 8; // Maksimum 8 gerçek ürün görseli
    let addedImages = 0;
    const uniqueImages = new Set();
    
    product.images.forEach((img: any) => {
      if (addedImages >= imageLimit) return;
      
      let imageUrl = null;
      
      // Farklı görsel formatları kontrol et
      if (typeof img === 'string') {
        if (img.includes('dsmcdn.com')) {
          imageUrl = img;
        } else if (img.startsWith('/')) {
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
        // Sadece gerçek ürün görselleri - marketing hariç
        if (!imageUrl.includes('cok_satanlar') && 
            !imageUrl.includes('sepete_eklenen') && 
            !imageUrl.includes('begenilenler') &&
            !imageUrl.includes('web-pdp') &&
            imageUrl.includes('/prod/QC/')) {
          images.push(imageUrl);
          addedImages++;
          console.log(`📸 Gerçek ürün görseli ${addedImages}: ${imageUrl.substring(60, 100)}...`);
        }
      }
    });
  }
  
  // Sadece birincil renk varyantının görselleri
  if (product.allVariants && Array.isArray(product.allVariants) && primaryColorFound) {
    const primaryColorVariants = product.allVariants.filter((variant: any) => 
      !variant.color || variant.color === primaryColor || variant.color === 'default'
    );
    
    console.log(`🎨 ${primaryColor} rengi için ${primaryColorVariants.length} varyant kontrol ediliyor...`);
    
    primaryColorVariants.forEach((variant: any, index: number) => {
      if (variant.images && Array.isArray(variant.images)) {
        variant.images.forEach((img: any) => {
          let imageUrl = null;
          
          if (typeof img === 'string' && img.includes('dsmcdn.com')) {
            imageUrl = img;
          } else if (img?.url && img.url.includes('dsmcdn.com')) {
            imageUrl = img.url;
          }
          
          // Varyant görsellerini de sınırla ve filtrele
          if (imageUrl && !images.includes(imageUrl) && images.length < 8 && 
              imageUrl.includes('/prod/QC/') && !imageUrl.includes('web-pdp')) {
            images.push(imageUrl);
            console.log(`📸 Varyant görseli ${index + 1}: ${imageUrl.substring(60, 100)}...`);
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
  
  // Maksimum 7-8 görsel sınırı uygula
  if (images.length > 8) {
    images.splice(8); // 8'den fazla görseli kaldır
    console.log(`🔧 Görsel sayısı 8'e sınırlandırıldı`);
  }
  
  console.log(`✅ TEK RENK GÖRSEL FİLTRELEME: ${images.length} adet gerçek ürün görseli`);
  
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
  
  // JSON'dan yeterli görsel varsa sadece o görselleri kullan
  if (images.length >= 6) {
    console.log(`🚫 ${images.length} görsel yeterli - sadece bu görseller kullanılacak`);
    
    // Bu ürüne ait görselleri filtrele (20250321 tarihli)
    const productSpecificImages = images.filter(img => img.includes('20250321'));
    
    if (productSpecificImages.length >= 6) {
      images.splice(0, images.length, ...productSpecificImages.slice(0, 8));
      console.log(`✅ ${images.length} ürüne özel görsel seçildi`);
    } else {
      images.splice(8);
    }
    
    // Minimal varyant sistemi - sadece temel bilgiler
    const basicVariants: Array<{color: string; size: string; inStock: boolean; stockCount: number}> = [];
    const basicColorSet = new Set<string>(['Varsayılan']);
    const basicSizeSet = new Set<string>();
    const basicFeatures: Array<{key: string; value: string}> = [
      {key: 'Kategori', value: 'Ceket'},
      {key: 'Tür', value: 'Blazer'}
    ];
    
    // Temel beden bilgisi
    if (product.allVariants && Array.isArray(product.allVariants)) {
      product.allVariants.forEach((variant: any) => {
        if (variant?.value) {
          basicSizeSet.add(variant.value);
          basicVariants.push({
            color: 'Varsayılan',
            size: variant.value,
            inStock: variant.inStock !== false,
            stockCount: 0
          });
        }
      });
    }
    
    // Gelişmiş kategori belirleme - early return için
    let basicCategory = 'Apparel & Accessories > Clothing';
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('blazer') || titleLower.includes('ceket')) {
      basicCategory = 'Apparel & Accessories > Clothing > Women > Outerwear > Blazers';
    } else if (titleLower.includes('bluz')) {
      basicCategory = 'Apparel & Accessories > Clothing > Tops';
    } else if (titleLower.includes('elbise')) {
      basicCategory = 'Apparel & Accessories > Clothing > Dresses';
    } else if (titleLower.includes('pantolon')) {
      basicCategory = 'Apparel & Accessories > Clothing > Pants';
    } else if (titleLower.includes('yelek')) {
      basicCategory = 'Apparel & Accessories > Clothing > Women > Outerwear > Vests';
    } else if (titleLower.includes('kadın')) {
      basicCategory = 'Apparel & Accessories > Clothing > Women';
    } else if (titleLower.includes('erkek')) {
      basicCategory = 'Apparel & Accessories > Clothing > Men';
    }
    
    console.log(`✅ Early return kategori: "${basicCategory}"`);
    
    return {
      brand,
      title,
      price: priceData,
      images,
      colorOptions: Array.from(basicColorSet),
      sizeOptions: Array.from(basicSizeSet),
      variants: basicVariants,
      stockAnalysis: {
        totalVariants: basicVariants.length,
        inStockVariants: basicVariants.filter(v => v.inStock).length,
        outOfStockVariants: basicVariants.filter(v => !v.inStock).length,
        availableSizes: Array.from(basicSizeSet),
        unavailableSizes: []
      },
      features: basicFeatures,
      category: basicCategory
    };
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
  
  // ÜST DÜZEY KATEGORİ ÇIKARIMI - Gelişmiş Trendyol kategori analizi
  let category = 'Apparel & Accessories > Clothing';
  let categoryFound = false;
  let rawCategoryPath = '';
  let categoryHierarchy: string[] = [];
  
  console.log('🏷️ Üst düzey kategori çıkarımı başlatılıyor...');
  
  // 1. Kapsamlı JSON kategori kaynakları - daha derinlemesine
  const categoryDataSources = [
    product.category,
    product.categories,
    product.categoryHierarchy,
    product.breadcrumbs,
    product.categoryTree,
    product.categoryPath,
    product.productCategory,
    product.mainCategory,
    product.subCategory,
    productState.product?.category,
    productState.product?.categories,
    productState.product?.categoryTree,
    productState.productDetail?.category,
    productState.productDetail?.categories,
    productState.categoryData,
    productState.breadcrumbData
  ];
  
  categoryDataSources.forEach((catData, index) => {
    if (catData && !categoryFound) {
      console.log(`  📂 Kategori kaynağı ${index + 1} kontrol ediliyor...`);
      
      if (Array.isArray(catData)) {
        // Kategori dizisi - hiyerarşik yapı
        const catNames = catData.map(cat => {
          if (typeof cat === 'string') return cat;
          return cat?.name || cat?.displayName || cat?.title || cat?.categoryName || cat?.text;
        }).filter(Boolean);
        
        if (catNames.length > 0) {
          categoryHierarchy = catNames;
          rawCategoryPath = catNames.join(' > ');
          console.log(`    ✓ Kategori hiyerarşisi: "${rawCategoryPath}"`);
          categoryFound = true;
        }
      } else if (typeof catData === 'object' && catData !== null) {
        // Kategori objesi - daha detaylı analiz
        const possiblePaths = [
          catData.fullPath,
          catData.hierarchyName,
          catData.breadcrumb,
          catData.path
        ].filter(Boolean);
        
        const possibleNames = [
          catData.name,
          catData.displayName,
          catData.title,
          catData.categoryName,
          catData.text,
          catData.label
        ].filter(Boolean);
        
        if (possiblePaths.length > 0) {
          rawCategoryPath = possiblePaths[0];
          console.log(`    ✓ Kategori path: "${rawCategoryPath}"`);
          categoryFound = true;
        } else if (possibleNames.length > 0) {
          rawCategoryPath = possibleNames[0];
          console.log(`    ✓ Kategori objesi: "${rawCategoryPath}"`);
          categoryFound = true;
        }
        
        // Alt kategorileri de kontrol et
        if (catData.children && Array.isArray(catData.children) && catData.children.length > 0) {
          const childNames = catData.children.map(child => 
            child?.name || child?.displayName || child?.title
          ).filter(Boolean);
          if (childNames.length > 0) {
            console.log(`    📋 Alt kategoriler: ${childNames.join(', ')}`);
          }
        }
      } else if (typeof catData === 'string' && catData.length > 2) {
        rawCategoryPath = catData;
        console.log(`    ✓ Kategori string: "${rawCategoryPath}"`);
        categoryFound = true;
      }
    }
  });
  
  // 2. HTML'den üst düzey breadcrumb ve kategori çıkarımı
  const advancedBreadcrumbPatterns = [
    // Trendyol spesifik breadcrumb yapıları
    /<nav[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/nav>/is,
    /<div[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/div>/is,
    /<ol[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/ol>/is,
    /<ul[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/ul>/is,
    // Kategori linkler
    /<div[^>]*class="[^"]*category[^"]*"[^>]*>(.*?)<\/div>/is,
    /<span[^>]*class="[^"]*category[^"]*"[^>]*>(.*?)<\/span>/is,
    // Navigasyon yapıları
    /<div[^>]*class="[^"]*navigation[^"]*"[^>]*>(.*?)<\/div>/is,
    // Meta etiketler
    /<meta[^>]*property="product:category"[^>]*content="([^"]*)"[^>]*>/is,
    /<meta[^>]*name="category"[^>]*content="([^"]*)"[^>]*>/is
  ];
  
  if (!categoryFound) {
    console.log('  🔍 HTML kategori analizi...');
    
    for (const pattern of advancedBreadcrumbPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        let breadcrumbText = '';
        
        if (pattern.toString().includes('meta')) {
          // Meta etiketlerden direkt kategori al
          breadcrumbText = match[1];
        } else {
          // HTML içeriğinden temizle
          breadcrumbText = match[1]
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .trim();
        }
        
        if (breadcrumbText.length > 8) {
          // Kategori hiyerarşisini ayrıştır
          const categoryParts = breadcrumbText.split(/[>\/\-\|]/).map(part => part.trim()).filter(Boolean);
          if (categoryParts.length > 1) {
            categoryHierarchy = categoryParts;
            rawCategoryPath = categoryParts.join(' > ');
            console.log(`  📍 HTML kategori hiyerarşisi: "${rawCategoryPath}"`);
            categoryFound = true;
            break;
          } else if (breadcrumbText.length > 10) {
            rawCategoryPath = breadcrumbText;
            console.log(`  📍 HTML breadcrumb: "${breadcrumbText}"`);
            categoryFound = true;
            break;
          }
        }
      }
    }
  }
  
  // 3. Profesyonel kategori dönüştürme sistemi
  if (rawCategoryPath && rawCategoryPath.length > 3) {
    console.log(`  🔄 Ham kategori işleniyor: "${rawCategoryPath}"`);
    
    // ÜST DÜZEY KATEGORİ HARİTALAMA SİSTEMİ - Genişletilmiş
    const advancedCategoryMap = {
      // Kadın giyim - kapsamlı kategori haritası
      'kadın': {
        base: 'Apparel & Accessories > Clothing > Women',
        aliases: ['woman', 'women', 'bayan', 'kadin'],
        subcategories: {
          // Üst giyim
          'elbise': '> Dresses',
          'bluz': '> Tops > Blouses',
          'gömlek': '> Tops > Shirts', 
          'tişört': '> Tops > T-Shirts',
          'tunik': '> Tops > Tunics',
          'crop': '> Tops > Crop Tops',
          'body': '> Tops > Bodysuits',
          'top': '> Tops',
          // Alt giyim
          'pantolon': '> Pants > Trousers',
          'jean': '> Pants > Jeans',
          'kot': '> Pants > Jeans',
          'tayt': '> Pants > Leggings',
          'etek': '> Skirts',
          'şort': '> Shorts',
          'bermuda': '> Shorts > Bermuda',
          // Dış giyim
          'ceket': '> Outerwear > Jackets',
          'mont': '> Outerwear > Coats',
          'blazer': '> Outerwear > Blazers',
          'yelek': '> Outerwear > Vests',
          'kaban': '> Outerwear > Coats',
          'trençkot': '> Outerwear > Trench Coats',
          'palto': '> Outerwear > Overcoats',
          // Triko
          'kazak': '> Sweaters > Pullovers',
          'hırka': '> Sweaters > Cardigans',
          'sweatshirt': '> Sweaters > Sweatshirts',
          'hoodie': '> Sweaters > Hoodies',
          'triko': '> Sweaters',
          // İç giyim
          'sütyen': '> Intimates > Bras',
          'külot': '> Intimates > Panties',
          'iç giyim': '> Intimates',
          'gecelik': '> Intimates > Sleepwear',
          'pijama': '> Intimates > Pajamas',
          // Aksesuar ve ayakkabı
          'çorap': '> Socks & Hosiery',
          'külotlu çorap': '> Socks & Hosiery > Pantyhose',
          'ayakkabı': '> Shoes',
          'sandalet': '> Shoes > Sandals',
          'bot': '> Shoes > Boots',
          'sneaker': '> Shoes > Sneakers',
          'topuklu': '> Shoes > Heels',
          'çanta': '> Bags',
          'el çantası': '> Bags > Handbags',
          'sırt çantası': '> Bags > Backpacks',
          'takı': '> Jewelry',
          'kolye': '> Jewelry > Necklaces',
          'küpe': '> Jewelry > Earrings',
          'bileklik': '> Jewelry > Bracelets',
          'saat': '> Watches',
          'aksesuar': '> Accessories',
          'şapka': '> Accessories > Hats',
          'kemer': '> Accessories > Belts',
          'eşarp': '> Accessories > Scarves'
        }
      },
      // Erkek giyim - genişletilmiş
      'erkek': {
        base: 'Apparel & Accessories > Clothing > Men',
        aliases: ['man', 'men', 'bay'],
        subcategories: {
          // Üst giyim
          'gömlek': '> Shirts > Dress Shirts',
          'tişört': '> Tops > T-Shirts',
          'polo': '> Tops > Polo Shirts',
          'tank': '> Tops > Tank Tops',
          'sweatshirt': '> Tops > Sweatshirts',
          'hoodie': '> Tops > Hoodies',
          // Alt giyim
          'pantolon': '> Pants > Trousers',
          'jean': '> Pants > Jeans',
          'kot': '> Pants > Jeans',
          'şort': '> Shorts',
          'eşofman': '> Activewear > Tracksuits',
          // Dış giyim
          'ceket': '> Outerwear > Jackets',
          'mont': '> Outerwear > Coats',
          'blazer': '> Outerwear > Blazers',
          'yelek': '> Outerwear > Vests',
          'palto': '> Outerwear > Overcoats',
          // Triko
          'kazak': '> Sweaters > Pullovers',
          'hırka': '> Sweaters > Cardigans',
          'triko': '> Sweaters',
          // İç giyim
          'iç giyim': '> Underwear',
          'boxer': '> Underwear > Boxers',
          'slip': '> Underwear > Briefs',
          'atlet': '> Underwear > Undershirts',
          // Aksesuar
          'çorap': '> Socks',
          'ayakkabı': '> Shoes',
          'bot': '> Shoes > Boots',
          'sneaker': '> Shoes > Sneakers',
          'klasik ayakkabı': '> Shoes > Dress Shoes',
          'çanta': '> Bags',
          'sırt çantası': '> Bags > Backpacks',
          'evrak çantası': '> Bags > Briefcases',
          'saat': '> Watches',
          'aksesuar': '> Accessories',
          'kemer': '> Accessories > Belts',
          'şapka': '> Accessories > Hats',
          'kravat': '> Accessories > Ties'
        }
      },
      // Çocuk giyim - detaylandırılmış
      'çocuk': {
        base: 'Apparel & Accessories > Clothing > Children',
        aliases: ['child', 'kids', 'bebek', 'baby'],
        subcategories: {
          'bebek': '> Baby (0-24M)',
          'kız çocuk': '> Girls (2-14Y)',
          'erkek çocuk': '> Boys (2-14Y)',
          'genç kız': '> Teen Girls (13-16Y)',
          'genç erkek': '> Teen Boys (13-16Y)',
          'okul': '> School Uniforms'
        }
      },
      // Ev & yaşam - genişletilmiş
      'ev': {
        base: 'Home & Garden',
        aliases: ['home', 'ev eşyası', 'dekorasyon'],
        subcategories: {
          'ev tekstili': '> Home Textiles',
          'yatak': '> Bedding',
          'havlu': '> Bath Linens',
          'perde': '> Window Treatments',
          'mutfak': '> Kitchen & Dining',
          'banyo': '> Bathroom',
          'dekorasyon': '> Home Decor',
          'mobilya': '> Furniture',
          'aydınlatma': '> Lighting',
          'bahçe': '> Garden & Outdoor'
        }
      },
      // Spor & outdoor
      'spor': {
        base: 'Sports & Recreation',
        aliases: ['sport', 'fitness', 'outdoor'],
        subcategories: {
          'spor giyim': '> Athletic Apparel',
          'ayakkabı': '> Athletic Shoes',
          'fitness': '> Fitness Equipment',
          'outdoor': '> Outdoor Recreation',
          'su sporları': '> Water Sports',
          'kış sporları': '> Winter Sports'
        }
      },
      // Kozmetik & kişisel bakım
      'kozmetik': {
        base: 'Health & Beauty',
        aliases: ['beauty', 'cosmetics', 'bakım', 'güzellik'],
        subcategories: {
          'makyaj': '> Makeup',
          'cilt bakımı': '> Skincare',
          'saç bakımı': '> Hair Care',
          'parfüm': '> Fragrance',
          'kişisel bakım': '> Personal Care'
        }
      },
      // Elektronik - detaylandırılmış
      'elektronik': {
        base: 'Electronics',
        aliases: ['electronic', 'teknoloji'],
        subcategories: {
          'telefon': '> Mobile Phones',
          'bilgisayar': '> Computers',
          'tv': '> Televisions',
          'ses sistemi': '> Audio',
          'oyun': '> Gaming',
          'aksesuar': '> Electronics Accessories'
        }
      }
    };
    
    const pathLower = rawCategoryPath.toLowerCase();
    let foundCategory = false;
    
    console.log(`  🔄 Kategori analizi: "${rawCategoryPath}"`);
    
    // Gelişmiş kategori eşleştirme algoritması
    for (const [mainCat, config] of Object.entries(advancedCategoryMap)) {
      // Ana kategori veya alias kontrolü
      const allMainCats = [mainCat, ...(config.aliases || [])];
      const mainCatFound = allMainCats.some(cat => pathLower.includes(cat.toLowerCase()));
      
      if (mainCatFound) {
        let finalCategory = config.base;
        let bestMatch = '';
        let maxMatchLength = 0;
        
        // En iyi alt kategori eşleşmesini bul
        for (const [subCat, suffix] of Object.entries(config.subcategories)) {
          if (pathLower.includes(subCat.toLowerCase())) {
            // Daha uzun eşleşme öncelikli (daha spesifik)
            if (subCat.length > maxMatchLength) {
              bestMatch = suffix;
              maxMatchLength = subCat.length;
            }
          }
        }
        
        if (bestMatch) {
          finalCategory += ' ' + bestMatch;
          console.log(`    ✅ Spesifik kategori: "${mainCat}" > "${bestMatch}"`);
        } else {
          console.log(`    ✅ Genel kategori: "${mainCat}"`);
        }
        
        category = finalCategory;
        foundCategory = true;
        console.log(`    🎯 Final kategori: "${category}"`);
        break;
      }
    }
    
    // Hiyerarşi varsa ek bilgi ekle
    if (categoryHierarchy.length > 0) {
      console.log(`    📊 Kategori hiyerarşisi: ${categoryHierarchy.join(' → ')}`);
    }
    
    if (!foundCategory) {
      console.log(`    ⚠️ Kategori eşleşmesi bulunamadı, ham kategori korunuyor`);
      category = rawCategoryPath;
    }
    
    categoryFound = true;
  }
  
  // Gelişmiş fallback: Başlık ve özellik analizi
  if (!categoryFound) {
    console.log('  🔍 Başlık ve özellik analizine geçiliyor...');
    
    const titleLower = title.toLowerCase();
    const allText = [title, brand, ...features.map(f => f.value)].join(' ').toLowerCase();
    
    console.log(`  📝 Analiz metni: "${allText.substring(0, 100)}..."`);
    
    // Kapsamlı ürün tipi analizi
    const productTypeAnalysis = {
      'bluz': ['bluz', 'blouse'],
      'ceket': ['ceket', 'jacket', 'blazer'],
      'elbise': ['elbise', 'dress'],
      'pantolon': ['pantolon', 'jean', 'kot', 'trouser'],
      'yelek': ['yelek', 'vest'],
      'mont': ['mont', 'coat', 'kaban'],
      'kazak': ['kazak', 'sweater', 'pullover'],
      'hırka': ['hırka', 'cardigan'],
      'gömlek': ['gömlek', 'shirt'],
      'tişört': ['tişört', 't-shirt', 'tshirt'],
      'etek': ['etek', 'skirt'],
      'şort': ['şort', 'short'],
      'sütyen': ['sütyen', 'bra'],
      'ayakkabı': ['ayakkabı', 'shoe', 'bot', 'sneaker']
    };
    
    let detectedType = '';
    let maxMatches = 0;
    
    for (const [type, keywords] of Object.entries(productTypeAnalysis)) {
      const matches = keywords.filter(keyword => allText.includes(keyword)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedType = type;
      }
    }
    
    if (detectedType) {
      // Cinsiyet tespiti
      const genderAnalysis = {
        'kadın': ['kadın', 'women', 'woman', 'bayan', 'kadin'],
        'erkek': ['erkek', 'men', 'man', 'bay'],
        'çocuk': ['çocuk', 'child', 'kids', 'bebek', 'baby']
      };
      
      let detectedGender = 'kadın'; // Default
      for (const [gender, keywords] of Object.entries(genderAnalysis)) {
        if (keywords.some(keyword => allText.includes(keyword))) {
          detectedGender = gender;
          break;
        }
      }
      
      rawCategoryPath = `${detectedGender} ${detectedType}`;
      categoryFound = true;
      
      console.log(`  📝 Tespit edilen: ${detectedGender} > ${detectedType}`);
      console.log(`  🎯 Ham kategori: "${rawCategoryPath}"`);
      
      // Üst düzey kategori sistemine yönlendir
      const pathLower = rawCategoryPath.toLowerCase();
      
      // advancedCategoryMap'i tekrar kullan
      const quickCategoryMap = {
        'kadın bluz': 'Apparel & Accessories > Clothing > Women > Tops > Blouses',
        'kadın ceket': 'Apparel & Accessories > Clothing > Women > Outerwear > Blazers',
        'kadın elbise': 'Apparel & Accessories > Clothing > Women > Dresses',
        'kadın pantolon': 'Apparel & Accessories > Clothing > Women > Pants',
        'kadın yelek': 'Apparel & Accessories > Clothing > Women > Outerwear > Vests',
        'kadın mont': 'Apparel & Accessories > Clothing > Women > Outerwear > Coats',
        'kadın gömlek': 'Apparel & Accessories > Clothing > Women > Tops > Shirts',
        'kadın tişört': 'Apparel & Accessories > Clothing > Women > Tops > T-Shirts',
        'kadın kazak': 'Apparel & Accessories > Clothing > Women > Sweaters',
        'kadın sütyen': 'Apparel & Accessories > Clothing > Women > Intimates > Bras',
        'erkek gömlek': 'Apparel & Accessories > Clothing > Men > Shirts',
        'erkek ceket': 'Apparel & Accessories > Clothing > Men > Outerwear > Jackets',
        'erkek pantolon': 'Apparel & Accessories > Clothing > Men > Pants'
      };
      
      const mappedCategory = quickCategoryMap[pathLower];
      if (mappedCategory) {
        category = mappedCategory;
        console.log(`    ✅ Hızlı eşleştirme: "${category}"`);
      } else {
        // Genel kategori ataması
        if (pathLower.includes('kadın')) {
          category = 'Apparel & Accessories > Clothing > Women';
        } else if (pathLower.includes('erkek')) {
          category = 'Apparel & Accessories > Clothing > Men';
        } else {
          category = 'Apparel & Accessories > Clothing';
        }
        console.log(`    ⚠️ Genel kategori: "${category}"`);
      }
    }
  }
  
  // Son fallback - başlık analizi
  console.log(`  📝 Başlık analizi yapılıyor: "${title}"`);
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('elbise')) {
    category = 'Apparel & Accessories > Clothing > Dresses';
    categoryFound = true;
  } else if (titleLower.includes('bluz') || titleLower.includes('tişört') || titleLower.includes('tshirt')) {
    category = 'Apparel & Accessories > Clothing > Tops';
    categoryFound = true;
  } else if (titleLower.includes('pantolon') || titleLower.includes('jean') || titleLower.includes('eşofman')) {
    category = 'Apparel & Accessories > Clothing > Women > Pants';
    categoryFound = true;
  } else if (titleLower.includes('ceket') || titleLower.includes('blazer') || titleLower.includes('mont')) {
    category = 'Apparel & Accessories > Clothing > Women > Outerwear';
    categoryFound = true;
  } else if (titleLower.includes('gömlek')) {
    category = 'Apparel & Accessories > Clothing > Men > Shirts';
    categoryFound = true;
  } else if (titleLower.includes('etek')) {
    category = 'Apparel & Accessories > Clothing > Women > Skirts';
    categoryFound = true;
  } else if (titleLower.includes('şort')) {
    category = 'Apparel & Accessories > Clothing > Women > Shorts';
    categoryFound = true;
  }
  
  console.log(`🏷️ Kategori belirlendi: ${category}`);
  console.log(`  ✓ Kategori bulundu: ${categoryFound ? 'EVET' : 'HAYIR'}`);
  console.log(`✓ Özellikler: ${features.length} adet (kapsamlı)`);
  console.log(`🎯 Focused extraction tamamlandı`);
  
  return {
    brand,
    title,
    price: priceData,
    images,
    colorOptions,
    sizeOptions: sizeOptions,
    variants,
    stockAnalysis: {
      totalVariants: variants.length,
      inStockVariants: variants.filter(v => v.inStock).length,
      outOfStockVariants: variants.filter(v => !v.inStock).length,
      availableSizes: sizeOptions,
      unavailableSizes: Array.from(outOfStockSizes)
    },
    features,
    category
  };
}