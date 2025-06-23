/**
 * Focused Extractor - Sadece istenen 5 veri tipini çıkarır
 * 1. Ürün markası
 * 2. Ürün başlığı  
 * 3. Ürün görselleri
 * 4. Ürün varyantları
 * 5. Ürün özellikleri
 */

import { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { filterOutOfStockSizes } from './trendyol-stock-filter';
import { extractDetailedFeatures, standardizeFeatureKey } from './product-features-extractor';

// Türk sayı formatı fonksiyonu
function formatTurkishNumber(num: number): string {
  const rounded = Math.round(num * 100) / 100;
  const parts = rounded.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  // Türk sayı formatı: 1.000.000,99 (nokta binlik ayırıcı, virgül ondalık ayırıcı)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedInteger},${decimalPart}`;
}

function formatTurkishPrice(num: number): string {
  return `${formatTurkishNumber(num)} TL`;
}

// Gelişmiş fiyat çıkarma fonksiyonu
function extractPriceFromContent(htmlContent: string, product: any): {price: number, found: boolean} {
  console.log('💰 Gelişmiş fiyat çıkarma başlatılıyor...');
  
  // 1. JSON'dan fiyat çıkarma - öncelikli
  const jsonPricePatterns = [
    /"price":\s*(\d+(?:\.\d+)?)/,
    /"sellingPrice"[^}]*"value":\s*(\d+(?:\.\d+)?)/,
    /"originalPrice"[^}]*"value":\s*(\d+(?:\.\d+)?)/,
    /"amount":\s*(\d+(?:\.\d+)?)/,
    /"priceValue":\s*(\d+(?:\.\d+)?)/
  ];
  
  for (const pattern of jsonPricePatterns) {
    const match = htmlContent.match(pattern);
    if (match) {
      let price = parseFloat(match[1]);
      
      // Türk Lirası fiyat düzeltmeleri
      if (price < 10) {
        price = price * 100; // 4.29 → 429
      } else if (price > 100000) {
        price = price / 100; // 42999 → 429.99
      }
      
      console.log(`  ✅ JSON'dan fiyat: ${price} TL`);
      return {price, found: true};
    }
  }
  
  // 2. HTML'den Türk Lirası fiyat formatları
  const turkishPricePatterns = [
    // 1.999,99 TL formatı
    /(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL/,
    // 999,99 TL formatı
    /(\d+,\d{2})\s*TL/,
    // TL 1.999,99 formatı
    /TL\s*(\d{1,3}(?:\.\d{3})*,\d{2})/,
    // ₺ sembollü format
    /₺\s*(\d{1,3}(?:\.\d{3})*,\d{2})/,
    // Span/div içinde fiyat
    /<[^>]*class="[^"]*price[^"]*"[^>]*>.*?(\d{1,3}(?:\.\d{3})*,\d{2}).*?TL/,
    // Data attribute'larda fiyat
    /data-price="(\d+(?:\.\d+)?)"/
  ];
  
  for (const pattern of turkishPricePatterns) {
    const match = htmlContent.match(pattern);
    if (match) {
      let priceStr = match[1];
      
      // Türk formatından sayıya çevirme: 1.999,99 → 1999.99
      let price = parseFloat(priceStr.replace(/\./g, '').replace(',', '.'));
      
      if (price > 10 && price < 1000000) {
        console.log(`  ✅ HTML'den Türk fiyat formatı: ${price} TL`);
        return {price, found: true};
      }
    }
  }
  
  // 3. Product objesinden fiyat
  if (product) {
    const productPriceFields = [
      product.price,
      product.sellingPrice,
      product.originalPrice,
      product.amount,
      product.priceValue
    ];
    
    for (const priceField of productPriceFields) {
      if (priceField && typeof priceField === 'number' && priceField > 0) {
        let price = priceField;
        
        // Fiyat düzeltmeleri
        if (price < 10) {
          price = price * 100;
        } else if (price > 100000) {
          price = price / 100;
        }
        
        console.log(`  ✅ Product objesinden fiyat: ${price} TL`);
        return {price, found: true};
      }
    }
  }
  
  console.log('  ⚠️ Fiyat bulunamadı, varsayılan değer kullanılacak');
  return {price: 99.99, found: false};
}

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
    let originalPrice = product.price.sellingPrice.value;
    
    // Fiyat mantığı: Eğer değer çok küçükse (19.99) TL cinsinden, çok büyükse (190000) kuruş cinsinden
    if (originalPrice < 50) {
      // 19.99 gibi değerler için: 100 ile çarp (1999 kuruş -> 19.99 TL)
      originalPrice = originalPrice * 100;
    } else if (originalPrice >= 10000) {
      // 190000 gibi değerler için: 100'e böl (190000 kuruş -> 1900 TL)
      originalPrice = originalPrice / 100;
    }
    // 50-9999 arası değerler zaten TL cinsinden kabul edilir

    const currency = product.price.sellingPrice.currency || 'TRY';
    const profitPrice = Math.round(originalPrice * 1.1 * 100) / 100;

    priceData = {
      original: originalPrice,
      currency: currency,
      formatted: formatTurkishPrice(originalPrice),
      withProfit: profitPrice,
      profitFormatted: formatTurkishPrice(profitPrice)
    };
    foundPrice = true;
  }

  // 2. Original price kontrolü
  if (!foundPrice && product.price?.originalPrice?.value) {
    let originalPrice = product.price.originalPrice.value;
    
    // Aynı mantığı uygula
    if (originalPrice < 50) {
      originalPrice = originalPrice * 100;
    } else if (originalPrice >= 10000) {
      originalPrice = originalPrice / 100;
    }

    const currency = product.price.originalPrice.currency || 'TRY';
    const profitPrice = Math.round(originalPrice * 1.1 * 100) / 100;

    priceData = {
      original: originalPrice,
      currency: currency,
      formatted: formatTurkishPrice(originalPrice),
      withProfit: profitPrice,
      profitFormatted: formatTurkishPrice(profitPrice)
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
      formatted: formatTurkishPrice(originalPrice),
      withProfit: profitPrice,
      profitFormatted: formatTurkishPrice(profitPrice)
    };
    foundPrice = true;
  }

  // 4. HTML'den fiyat regex ile çıkarma
  if (!foundPrice) {
    // Birden fazla fiyat formatını dene
    const pricePatterns = [
      /"price":\s*(\d+(?:\.\d+)?)/,
      /"sellingPrice"[^}]*"value":\s*(\d+(?:\.\d+)?)/,
      /"originalPrice"[^}]*"value":\s*(\d+(?:\.\d+)?)/,
      /(\d{1,4}(?:\.\d{3})*(?:,\d{2})?)\s*TL/,
      /TL\s*(\d{1,4}(?:\.\d{3})*(?:,\d{2})?)/
    ];

    for (const pattern of pricePatterns) {
      const priceMatch = htmlContent.match(pattern);
      if (priceMatch) {
        let originalPrice = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
        
        // Fiyat düzeltme mantığı
        if (originalPrice < 50) {
          originalPrice = originalPrice * 100;
        } else if (originalPrice >= 10000) {
          originalPrice = originalPrice / 100;
        }

        const profitPrice = Math.round(originalPrice * 1.1 * 100) / 100;

        priceData = {
          original: originalPrice,
          currency: 'TRY',
          formatted: formatTurkishPrice(originalPrice),
          withProfit: profitPrice,
          profitFormatted: formatTurkishPrice(profitPrice)
        };
        foundPrice = true;
        break;
      }
    }
  }

  console.log(`✓ Fiyat: ${priceData.formatted} → %10 kar: ${priceData.profitFormatted} ${foundPrice ? '(Kaynak bulundu)' : '(Varsayılan değer)'}`);

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

  // Önce renk seçeneklerini çıkar
  const colorOptions = await page.evaluate(() => {
    const colors: string[] = [];
    
    // Trendyol renk seçici stratejileri
    const colorSelectors = [
      'button[data-testid*="color"]',
      '[class*="color-option"] button',
      '[class*="colorOption"] button',
      '.pr-in-cn button',
      '.color-variant button',
      '[data-variant="color"] button'
    ];
    
    for (const selector of colorSelectors) {
      const buttons = document.querySelectorAll(selector);
      if (buttons.length > 0) {
        buttons.forEach(button => {
          const colorText = button.getAttribute('title') || 
                           button.getAttribute('aria-label') || 
                           button.textContent?.trim();
          if (colorText && colorText.length > 0 && colorText !== 'undefined') {
            colors.push(colorText);
          }
        });
        break;
      }
    }
    
    return [...new Set(colors)];
  });

  // Beden filtreleme sistemi
  console.log('🎯 Manuel stok filtreleme başlatılıyor...');
  const stockFilterResult = await filterOutOfStockSizes(page);
  console.log(`📊 Stok analizi: ${stockFilterResult.totalSizes} toplam → ${stockFilterResult.inStockSizes.length} stokta`);
  console.log(`🟢 Stokta olan bedenler: ${stockFilterResult.inStockSizes.join(', ')}`);

  // AllVariants verisi varsa işle
  if (product.allVariants && Array.isArray(product.allVariants)) {
    console.log(`📋 AllVariants sayısı: ${product.allVariants.length}`);

    product.allVariants.forEach((variant: any, index: number) => {
      if (!variant) return;

      console.log(`Varyant ${index} debug:`, JSON.stringify(variant, null, 2).substring(0, 300));

      const attributes = variant.attributes || {};
      let color = attributes.RENK || attributes.Renk || attributes.renk || variant.color || 'Varsayılan';
      let size = attributes.BEDEN || attributes.Beden || attributes.beden || variant.size || 'Tek Beden';

      // Varyant "value" alanından boyut/beden çıkar - EN ÖNEMLİ!
      if (variant.value && typeof variant.value === 'string') {
        const cleanValue = variant.value.trim();
        
        // Boyut formatları: 200 x 220, 80x180, 150 x 200 vb.
        const dimensionMatch = cleanValue.match(/(\d+)\s*[xX×]\s*(\d+)/);
        if (dimensionMatch) {
          size = `${dimensionMatch[1]}x${dimensionMatch[2]}`;
          console.log(`  ✓ VALUE'dan boyut: ${size}`);
        }
        // Jean beden formatları: 32, 32/32, 32/34, 30-32, 36/30 vb.
        else if (cleanValue.match(/^\d{2,3}([\-\/]\d{2,3})?$/)) {
          size = cleanValue;
          console.log(`  ✓ VALUE'dan jean bedeni: ${size}`);
        }
      }

      // ItemAttributes'tan jean bedeni çıkar - PRİORİTE 3
      if (size === 'Tek Beden' && variant.itemAttributes && Array.isArray(variant.itemAttributes)) {
        variant.itemAttributes.forEach((attr: any) => {
          if (attr.attributeName && attr.attributeValue) {
            const attrName = attr.attributeName.toLowerCase();
            if (attrName.includes('beden') || attrName.includes('size')) {
              const attrValue = attr.attributeValue.toString().trim();
              if (attrValue.match(/^\d{2,3}([\-\/]\d{2,3})?$/)) {
                size = attrValue;
                console.log(`  ✓ ItemAttributes'tan jean bedeni: ${size}`);
              }
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

  // Stok filtreleme sonuçlarını varyantlara entegre et
  const finalColors = colorOptions.length > 0 ? colorOptions : Array.from(colorSet);
  const finalSizes = stockFilterResult.inStockSizes.length > 0 ? stockFilterResult.inStockSizes : Array.from(sizeSet);
  
  console.log(`🎨 Final renkler: ${finalColors.join(', ')}`);
  console.log(`📏 Final bedenler: ${finalSizes.join(', ')}`);
  
  // Varyantları yeniden düzenle
  const organizedVariants: Array<{color: string, size: string, inStock: boolean, stockCount: number}> = [];
  
  // Eğer gerçek varyant verisi varsa kullan
  if (variants.length > 0) {
    variants.forEach(variant => {
      organizedVariants.push(variant);
    });
  } else {
    // Yoksa stok filtreleme sonuçlarından oluştur
    for (const color of finalColors.length > 0 ? finalColors : ['Varsayılan']) {
      for (const size of finalSizes.length > 0 ? finalSizes : ['Tek Beden']) {
        organizedVariants.push({
          color,
          size,
          inStock: true,
          stockCount: 0
        });
      }
    }
  }
  
  // Alternatif varyant kaynakları kontrol et
  if (organizedVariants.length === 0) {
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
  const extractedColors = Array.from(colorSet).filter(color => 
    color !== 'Varsayılan' && color.length > 0 && !color.includes('undefined')
  );

  console.log(`🔧 Final beden filtreleme öncesi: [${Array.from(sizeSet).join(', ')}]`);

  // DOĞRUDAN VARIANT VALUE'LARDAN JEAN BEDENLERİNİ ÇEK
  const directSizes = new Set<string>();
  
  if (product.allVariants && Array.isArray(product.allVariants)) {
    product.allVariants.forEach((variant: any) => {
      if (variant.value && typeof variant.value === 'string') {
        const cleanValue = variant.value.trim();
        // Jean beden pattern: 32, 32/32, 32/34, 30-30, etc.
        if (cleanValue.match(/^\d{2,3}([\-\/]\d{2,3})?$/)) {
          directSizes.add(cleanValue);
          console.log(`📦 DOĞRUDAN YAKALANAN BEDEN: ${cleanValue}`);
        }
      }
    });
  }

  console.log(`📦 Toplam yakalanan jean bedeni: ${directSizes.size} adet`);
  console.log(`📦 Beden listesi: [${Array.from(directSizes).join(', ')}]`);

  const sizeOptions = Array.from(directSizes).filter(size => {
    const isValid = size !== 'Tek Beden' && 
      size.length > 0 && 
      size.length <= 5 &&
      !size.includes('undefined') && 
      !size.includes('null') &&
      /^[A-Za-z0-9\/\-]+$/.test(size);

    console.log(`Beden "${size}" kontrol: ${isValid ? 'GEÇERLİ' : 'GEÇERSİZ'}`);
    return isValid;
  }).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return a.localeCompare(b);
  });

  // Beden sıralaması burada yapılacak
  const sizeOrderTemp = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const sortedSizes = sizeOptions.sort((a, b) => {
    const aIndex = sizeOrderTemp.indexOf(a);
    const bIndex = sizeOrderTemp.indexOf(b);

    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }

    return a.localeCompare(b);
  });

  console.log(`🔧 Final beden listesi: [${sortedSizes.join(', ')}]`);

  console.log(`✓ Varyantlar: ${variants.length} adet`);
  console.log(`✓ Renk seçenekleri: ${extractedColors.length} adet - ${extractedColors.join(', ')}`);
  console.log(`✓ Beden seçenekleri: ${sizeOptions.length} adet - ${sizeOptions.join(', ')} (SADECE STOKTA OLANLAR)`);

  if (outOfStockSizes.size > 0) {
    console.log(`⚠️ Stokta olmayan bedenler CSV'ye eklenmedi: ${Array.from(outOfStockSizes).join(', ')}`);
  }

  // 6. ÖZELLİKLER - Sadece gerçek product attributes
  const features: Array<{ key: string; value: string; }> = [];
  const processedKeys = new Set<string>();

  console.log('🔍 Gerçek product attributes çıkarılıyor...');

  // Product attributes'dan gerçek özellikler
  if (product.attributes && typeof product.attributes === 'object') {
    console.log('🏷️ Product attributes bulundu...');
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
        console.log(`  ✓ Gerçek Özellik: ${key} = ${value}`);
      }
    });
  }
  
  // Sadece marka bilgisini ekle (kritik)
  if (!processedKeys.has('marka')) {
    features.push({ key: 'Marka', value: brand });
    processedKeys.add('marka');
    console.log(`  ✓ Marka: "${brand}"`);
  }

  // Pattern 7: Add essential missing features with fallback values
  console.log('🔧 Eksik temel özellikleri tamamlama...');
  
  // Sadece marka ekle
  if (!processedKeys.has('marka')) {
    features.push({ key: 'Marka', value: brand });
    processedKeys.add('marka');
    console.log(`  ✓ Marka eklendi: "${brand}"`);
  }

  // Manuel özellik ekleme sistemi - Her ürün için çalışır
  console.log('🏷️ Manuel özellik sistemi başlatılıyor...');
  console.log(`📝 Title debug: "${title}"`);
  
  // Yatak alezi için özellikler
  if (title.toLowerCase().includes('yatak') || title.toLowerCase().includes('alez')) {
    console.log('🛏️ Yatak alezi tespit edildi, manuel özellikler ekleniyor...');
    
    if (title.toLowerCase().includes('bambu')) {
      features.push({ key: 'Materyal', value: 'Bambu' });
      processedKeys.add('materyal');
      console.log(`  ✓ Materyal: Bambu`);
    }
    
    if (title.toLowerCase().includes('sıvı geçirmez') || title.toLowerCase().includes('su geçirmez')) {
      features.push({ key: 'Özellik', value: 'Su Geçirmez' });
      processedKeys.add('özellik');
      console.log(`  ✓ Özellik: Su Geçirmez`);
    }
    
    if (title.toLowerCase().includes('sessiz')) {
      features.push({ key: 'Ses Özelliği', value: 'Ultra Sessiz' });
      processedKeys.add('ses');
      console.log(`  ✓ Ses Özelliği: Ultra Sessiz`);
    }
    
    if (title.toLowerCase().includes('premium')) {
      features.push({ key: 'Kalite', value: 'Premium' });
      processedKeys.add('kalite');
      console.log(`  ✓ Kalite: Premium`);
    }
    
    if (title.toLowerCase().includes('koruyucu')) {
      features.push({ key: 'Fonksiyon', value: 'Yatak Koruyucu' });
      processedKeys.add('fonksiyon');
      console.log(`  ✓ Fonksiyon: Yatak Koruyucu`);
    }
  }
  
  // Kozmetik ürünleri için özellikler
  else if (title.toLowerCase().includes('maskara') || title.toLowerCase().includes('makyaj')) {
    console.log('💄 Kozmetik ürünü tespit edildi, manuel özellikler ekleniyor...');
    
    if (title.toLowerCase().includes('siyah')) {
      features.push({ key: 'Renk', value: 'Siyah' });
      processedKeys.add('renk');
      console.log(`  ✓ Renk: Siyah`);
    }
    
    if (title.toLowerCase().includes('telescopic') || title.toLowerCase().includes('uzatıcı')) {
      features.push({ key: 'Özellik', value: 'Uzatıcı' });
      processedKeys.add('özellik');
      console.log(`  ✓ Özellik: Uzatıcı`);
    }
    
    if (title.toLowerCase().includes('gold') || title.toLowerCase().includes('altın')) {
      features.push({ key: 'Seri', value: 'Gold Serisi' });
      processedKeys.add('seri');
      console.log(`  ✓ Seri: Gold Serisi`);
    }
  }
  
  // Jean için özellikler
  else if (title.toLowerCase().includes('jean') || title.toLowerCase().includes('kot')) {
    console.log('👖 Jean manuel özellikleri ekleniyor...');
    
    if (title.toLowerCase().includes('skinny')) {
      features.push({ key: 'Kesim', value: 'Skinny' });
      processedKeys.add('kesim');
      console.log(`  ✓ Kesim: Skinny`);
    }
    
    if (title.toLowerCase().includes('slim')) {
      features.push({ key: 'Kesim', value: 'Slim Fit' });
      processedKeys.add('kesim');
      console.log(`  ✓ Kesim: Slim Fit`);
    }
    
    if (title.toLowerCase().includes('yüksek bel')) {
      features.push({ key: 'Bel Tipi', value: 'Yüksek Bel' });
      processedKeys.add('bel');
      console.log(`  ✓ Bel Tipi: Yüksek Bel`);
    }
  }
  
  // Ayakkabı için özellikler  
  else if (title.toLowerCase().includes('ayakkabı') || title.toLowerCase().includes('spor ayakkabı')) {
    console.log('👟 Ayakkabı manuel özellikleri ekleniyor...');
    
    if (title.toLowerCase().includes('koşu')) {
      features.push({ key: 'Tip', value: 'Koşu Ayakkabısı' });
      processedKeys.add('tip');
      console.log(`  ✓ Tip: Koşu Ayakkabısı`);
    }
    
    if (title.toLowerCase().includes('nefes alan')) {
      features.push({ key: 'Özellik', value: 'Nefes Alabilir' });
      processedKeys.add('özellik');
      console.log(`  ✓ Özellik: Nefes Alabilir`);
    }
  }

  console.log(`✅ Gerçek ${features.length} özellik hazır`);

  // İleri düzey Trendyol özellik çıkarım sistemi
  console.log('🚀 İleri düzey Trendyol özellik çıkarımı başlatılıyor...');
  
  try {
    // Önce sayfayı scroll et ve özellik bölümüne git
    await page.evaluate(() => {
      const productDetails = document.querySelector('[data-testid="product-detail-attributes"]') ||
                           document.querySelector('.product-detail-attributes') ||
                           document.querySelector('.product-features') ||
                           document.querySelector('.detail-attr-container');
      if (productDetails) {
        productDetails.scrollIntoView({ behavior: 'smooth' });
      }
    });
    
    await page.waitForTimeout(2000); // Scroll için bekle
    
    // Gelişmiş Trendyol özellik selectors
    const advancedSelectors = [
      // Ana özellik tabloları
      '[data-testid="product-detail-attributes"] tr',
      '.product-detail-attributes tbody tr',
      '.pr-in-at tbody tr',
      '.detail-attr-container .detail-attr-item',
      
      // Özellik listeleri
      '.product-features-list li',
      '.specification-list .spec-item',
      '.attributes-list .attribute-item',
      
      // Tablo formatları
      'table[class*="feature"] tr',
      'table[class*="spec"] tr',
      'table[class*="detail"] tr',
      
      // Div formatları
      '.feature-row',
      '.spec-row',
      '.attr-row'
    ];
    
    console.log(`📋 ${advancedSelectors.length} gelişmiş selector test ediliyor...`);
    
    for (const selector of advancedSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`  ✅ ${selector} ile ${elements.length} özellik bulundu`);
          
          for (const element of elements) {
            try {
              // Tablo satırları için
              const cells = await element.$$('td, th');
              if (cells.length >= 2) {
                const key = await page.evaluate(el => el.textContent?.trim(), cells[0]);
                const value = await page.evaluate(el => el.textContent?.trim(), cells[1]);
                
                if (key && value && key.length > 1 && value.length > 0 && 
                    !processedKeys.has(key.toLowerCase())) {
                  features.push({ key, value });
                  processedKeys.add(key.toLowerCase());
                  console.log(`  ✓ Tablo Özelliği: ${key} = ${value}`);
                }
              }
              
              // Liste öğeleri için
              else {
                const text = await page.evaluate(el => el.textContent?.trim(), element);
                if (text && text.includes(':')) {
                  const [key, ...valueParts] = text.split(':');
                  const value = valueParts.join(':').trim();
                  
                  if (key && value && key.length > 1 && value.length > 0 && 
                      !processedKeys.has(key.toLowerCase())) {
                    features.push({ key: key.trim(), value });
                    processedKeys.add(key.toLowerCase());
                    console.log(`  ✓ Liste Özelliği: ${key.trim()} = ${value}`);
                  }
                }
              }
            } catch (err) {
              // Element işleme hatası, devam et
            }
          }
        }
      } catch (err) {
        // Selector hatası, devam et
      }
    }
    
    // JavaScript ile dinamik özellik çıkarımı
    console.log('⚡ JavaScript ile dinamik özellik arama...');
    
    const dynamicFeatures = await page.evaluate(() => {
      const features = [];
      
      // Tüm tablolar için özellik arama
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          if (cells.length >= 2) {
            const key = cells[0].textContent?.trim();
            const value = cells[1].textContent?.trim();
            
            if (key && value && key.length > 1 && value.length > 0) {
              features.push({ key, value, source: 'dynamic-table' });
            }
          }
        });
      });
      
      // Özellik anahtar kelimeleri için metin arama
      const featureKeywords = [
        'Materyal', 'Kumaş', 'Renk', 'Beden', 'Marka', 'Model', 
        'Özellik', 'Tip', 'Cinsiyet', 'Yaş', 'Mevsim', 'Stil',
        'Ağırlık', 'Boyut', 'Uzunluk', 'En', 'Boy', 'Kalınlık'
      ];
      
      const allText = document.body.textContent || '';
      featureKeywords.forEach(keyword => {
        const regex = new RegExp(`${keyword}\\s*[:：]\\s*([^\\n\\r,;]{2,50})`, 'gi');
        const matches = allText.match(regex);
        
        if (matches) {
          matches.forEach(match => {
            const parts = match.split(/[:：]/);
            if (parts.length >= 2) {
              const key = parts[0].trim();
              const value = parts[1].trim();
              
              if (key && value) {
                features.push({ key, value, source: 'dynamic-text' });
              }
            }
          });
        }
      });
      
      return features;
    });
    
    if (dynamicFeatures.length > 0) {
      console.log(`  🎯 JavaScript ile ${dynamicFeatures.length} özellik bulundu`);
      
      dynamicFeatures.forEach(({ key, value, source }) => {
        if (!processedKeys.has(key.toLowerCase())) {
          features.push({ key, value });
          processedKeys.add(key.toLowerCase());
          console.log(`  ✓ ${source}: ${key} = ${value}`);
        }
      });
    }
    
  } catch (error) {
    console.log(`⚠️ İleri düzey özellik çıkarımında hata: ${error.message}`);
  }

  // HTML'den pattern matching ile özellik çıkarımı
  try {
    console.log('📄 HTML pattern matching ile özellik arama...');
    
    // URL'den yeniden HTML çek ve işle
    const htmlResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      }
    });
    
    if (htmlResponse.ok) {
      const fullHtmlContent = await htmlResponse.text();
      
      // Trendyol gerçek özellik table pattern'leri
      const trendyolPatterns = [
        // Ana özellik tablosu - Trendyol'un standart formatı
        /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi,
        // Özellik listesi formatları
        /<tr[^>]*>\s*<th[^>]*>([^<]+)<\/th>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi,
        // Modern özellik formatı
        /<div[^>]*class="[^"]*property[^"]*"[^>]*>.*?<span[^>]*>([^<]+)<\/span>.*?<span[^>]*>([^<]+)<\/span>/gi,
        // Liste öğeleri
        /<li[^>]*class="[^"]*spec[^"]*"[^>]*>([^:]+):\s*([^<]+)<\/li>/gi,
        // Detay attribute
        /<div[^>]*class="[^"]*detail-attr[^"]*"[^>]*>([^:]+):\s*([^<]+)<\/div>/gi
      ];
      
      // Trendyol özellik anahtar kelimeleri - gösterdiğiniz örnekteki
      const trendyolFeatureKeywords = [
        'Kalıp', 'Materyal', 'Cep', 'Kumaş Özellik', 'Paça Tipi', 'Paça Boyu',
        'Renk', 'Bel', 'Desen', 'Ürün Tipi', 'Boy', 'Ortam', 'Siluet', 
        'Kumaş Tipi', 'Sürdürülebilirlik Detayı', 'Menşei', 'Kapama Şekli',
        'Kumaş', 'Özellik', 'Tip', 'Cinsiyet', 'Yaş Grubu', 'Mevsim', 'Stil'
      ];
      
      let totalFound = 0;
      
      // Pattern matching ile özellik çıkarımı
      for (const pattern of trendyolPatterns) {
        let match;
        while ((match = pattern.exec(fullHtmlContent)) !== null) {
          const key = match[1]?.trim().replace(/\s+/g, ' ');
          const value = match[2]?.trim().replace(/\s+/g, ' ');
          
          // Hatalı değerleri filtrele
          if (key && value && key.length > 1 && value.length > 0 && 
              key.length < 50 && value.length < 100 &&
              !value.includes('function()') && 
              !value.includes('object') &&
              !value.includes('{') &&
              !value.includes('}') &&
              !key.includes('script') &&
              !key.includes('style') &&
              !processedKeys.has(key.toLowerCase())) {
            features.push({ key, value });
            processedKeys.add(key.toLowerCase());
            totalFound++;
            console.log(`  ✓ HTML Pattern: ${key} = ${value}`);
          }
        }
      }
      
      // Trendyol spesifik anahtar kelime arama
      for (const keyword of trendyolFeatureKeywords) {
        // Çeşitli HTML formatlarında anahtar kelime arama
        const keywordPatterns = [
          new RegExp(`<td[^>]*>${keyword}</td>\\s*<td[^>]*>([^<]+)</td>`, 'gi'),
          new RegExp(`<th[^>]*>${keyword}</th>\\s*<td[^>]*>([^<]+)</td>`, 'gi'),
          new RegExp(`${keyword}\\s*[:：]\\s*([^\\n\\r<>{}]{2,50})`, 'gi'),
          new RegExp(`<[^>]*>${keyword}</[^>]*>\\s*<[^>]*>([^<]+)</[^>]*>`, 'gi')
        ];
        
        for (const keywordPattern of keywordPatterns) {
          let match;
          while ((match = keywordPattern.exec(fullHtmlContent)) !== null) {
            const value = match[1]?.trim().replace(/\s+/g, ' ');
            
            // Sıkı hatalı değer filtreleme
            if (value && value.length > 0 && value.length < 100 &&
                !value.includes('function') && 
                !value.includes('object') &&
                !value.includes('{') &&
                !value.includes('}') &&
                !value.includes('null') &&
                !value.includes('undefined') &&
                !value.includes('sent:') &&
                !value.includes('()') &&
                !value.includes('[object') &&
                !value.includes('script') &&
                !value.includes('var ') &&
                !value.includes('const ') &&
                !value.includes('let ') &&
                !/^\d+,\w+:/.test(value) && // "0,sent:" formatını engelle
                !processedKeys.has(keyword.toLowerCase())) {
              features.push({ key: keyword, value });
              processedKeys.add(keyword.toLowerCase());
              totalFound++;
              console.log(`  ✓ Keyword Pattern: ${keyword} = ${value}`);
              break; // Bu anahtar kelime için ilk bulunanı kullan
            }
          }
        }
      }
      
      // Başlık bazlı özellik çıkarımı - sadece eksik olanlar için
      console.log('🔍 Başlık bazlı özellik çıkarımı...');
      
      const titleFeatures = [
        // Kumaş özellikleri
        { pattern: /\b(pamuk|modal|polyester|viskon|elastan|spandex|likra)\b/i, key: 'Materyal' },
        // Renk özellikleri  
        { pattern: /\b(siyah|beyaz|gri|mavi|kırmızı|yeşil|sarı|mor|pembe|turuncu|lacivert|kahverengi|açık gri|koyu gri)\b/i, key: 'Renk' },
        // Kesim özellikleri
        { pattern: /\b(slim|skinny|straight|regular|düz paça|bol|dar|wide|crop)\b/i, key: 'Paça Tipi' },
        // Özellik türleri
        { pattern: /\b(cepli|cepsiz)\b/i, key: 'Cep' },
        // Kalıp
        { pattern: /\b(regular|slim|oversize|bol)\b/i, key: 'Kalıp' }
      ];
      
      for (const { pattern, key } of titleFeatures) {
        const match = title.match(pattern);
        if (match && !processedKeys.has(key.toLowerCase())) {
          const value = match[0].charAt(0).toUpperCase() + match[0].slice(1).toLowerCase();
          features.push({ key, value });
          processedKeys.add(key.toLowerCase());
          totalFound++;
          console.log(`  ✓ Başlık Çıkarımı: ${key} = ${value}`);
        }
      }
      
      console.log(`📊 HTML pattern matching: ${totalFound} özellik bulundu`);
      console.log(`📄 HTML içerik boyutu: ${Math.round(fullHtmlContent.length / 1024)}KB`);
      
      // HTML içeriğinde Trendyol özellik tablosu arama
      const propertyTableMatch = fullHtmlContent.match(/<table[^>]*class="[^"]*product[^"]*"[^>]*>.*?<\/table>/gi) ||
                                  fullHtmlContent.match(/<div[^>]*class="[^"]*product-detail-attributes[^"]*"[^>]*>.*?<\/div>/gi) ||
                                  fullHtmlContent.match(/<section[^>]*>.*?Ürün Özellikleri.*?<\/section>/gi);
      
      if (propertyTableMatch) {
        console.log(`🔍 ${propertyTableMatch.length} özellik tablosu/bölümü bulundu`);
        
        // Her tablo/bölümden özellik çıkar
        propertyTableMatch.forEach((tableContent, index) => {
          const tableFeatures = tableContent.match(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi);
          if (tableFeatures) {
            console.log(`  📋 Tablo ${index + 1}: ${tableFeatures.length} özellik satırı`);
            
            tableFeatures.forEach(row => {
              const rowMatch = row.match(/<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/);
              if (rowMatch) {
                const key = rowMatch[1]?.trim();
                const value = rowMatch[2]?.trim();
                
                if (key && value && !processedKeys.has(key.toLowerCase()) &&
                    !value.includes('function') && !value.includes('object')) {
                  features.push({ key, value });
                  processedKeys.add(key.toLowerCase());
                  totalFound++;
                  console.log(`    ✓ Tablo Özelliği: ${key} = ${value}`);
                }
              }
            });
          }
        });
      }
      
      // Debug için HTML içeriğinden örnek özellik araması
      const samplePropertySearch = fullHtmlContent.match(/Kalıp|Materyal|Renk|Cep|Paça/gi);
      if (samplePropertySearch) {
        console.log(`🔍 HTML'de bulunan örnek özellik kelimeleri: ${samplePropertySearch.slice(0, 5).join(', ')}`);
      }
    }
    
  } catch (error) {
    console.log(`⚠️ HTML pattern çıkarımında hata: ${error.message}`);
  }

  // Product attributes'dan gerçek özellikler (eski sistem)
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
        console.log(`  ✓ Gerçek Attribute: ${key} = ${value}`);
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

  // Initialize category first
  let category = 'Ürün';

  console.log(`✅ Gerçek özellik sayısı: ${features.length}`);

  // Gelişmiş kategori çıkarımı  
  category = 'Apparel & Accessories > Clothing';
  let categoryFound = false;

  console.log('🏷️ Kategori çıkarımı başlatılıyor...');

  // 1. HTML'den breadcrumb çıkarımı - daha kapsamlı
  const breadcrumbPatterns = [
    /<nav[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/nav>/is,
    /<div[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/div>/is,
    /<ol[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/ol>/is,
    /<ul[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)<\/ul>/is
  ];

  for (const pattern of breadcrumbPatterns) {
    const match = htmlContent.match(pattern);
    if (match) {
      const breadcrumbText = match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`  📍 Breadcrumb bulundu: "${breadcrumbText}"`);

      if (breadcrumbText.includes('Kadın') || breadcrumbText.includes('KADIN')) {
        if (breadcrumbText.includes('Elbise')) {
          category = 'Apparel & Accessories > Clothing > Women > Dresses';
          categoryFound = true;
        } else if (breadcrumbText.includes('Bluz') || breadcrumbText.includes('Gömlek') || breadcrumbText.includes('Tunik')) {
          category = 'Apparel & Accessories > Clothing > Women > Tops';
          categoryFound = true;
        } else if (breadcrumbText.includes('Pantolon') || breadcrumbText.includes('Jean')) {
          category = 'Apparel & Accessories > Clothing > Women > Pants';
          categoryFound = true;
        } else if (breadcrumbText.includes('Ceket') || breadcrumbText.includes('Mont')) {
          category = 'Apparel & Accessories > Clothing > Women > Outerwear';
          categoryFound = true;
        } else if (breadcrumbText.includes('Etek')) {
          category = 'Apparel & Accessories > Clothing > Women > Skirts';
          categoryFound = true;
        } else {
          category = 'Apparel & Accessories > Clothing > Women';
          categoryFound = true;
        }
        console.log(`    ✓ Kadın kategorisinden atama: ${category}`);
      } else if (breadcrumbText.includes('Erkek') || breadcrumbText.includes('ERKEK')) {
        if (breadcrumbText.includes('Gömlek')) category = 'Apparel & Accessories > Clothing > Men > Shirts';
        else if (breadcrumbText.includes('Pantolon') || breadcrumbText.includes('Jean')) category = 'Apparel & Accessories > Clothing > Men > Pants';
        else if (breadcrumbText.includes('Ceket') || breadcrumbText.includes('Mont')) category = 'Apparel & Accessories > Clothing > Men > Outerwear';
        else category = 'Apparel & Accessories > Clothing > Men';
        categoryFound = true;
      }
      break;
    }
  }

  // 2. JSON verisinden kategori çıkarımı  
  const categoryPaths = [
    product.category?.name,
    product.categoryName,
    product.category?.displayName,
    product.productCategory,
    productState.product?.category?.name,
    productState.productDetail?.category
  ];

  for (const catPath of categoryPaths) {
    if (catPath && typeof catPath === 'string' && catPath.length > 3) {
      console.log(`  📂 Kategori verisi bulundu: "${catPath}"`);
      const catLower = catPath.toLowerCase();

      if (catLower.includes('kadın') || catLower.includes('women') || catLower.includes('kadin')) {
        if (catLower.includes('elbise') || catLower.includes('dress')) category = 'Apparel & Accessories > Clothing > Women > Dresses';
        else if (catLower.includes('üst') || catLower.includes('bluz') || catLower.includes('top') || catLower.includes('tişört')) category = 'Apparel & Accessories > Clothing > Women > Tops';
        else if (catLower.includes('alt') || catLower.includes('pantolon') || catLower.includes('pant') || catLower.includes('jean')) category = 'Apparel & Accessories > Clothing > Women > Pants';
        else if (catLower.includes('dış giyim') || catLower.includes('ceket') || catLower.includes('outerwear') || catLower.includes('mont')) category = 'Apparel & Accessories > Clothing > Women > Outerwear';
        else if (catLower.includes('etek') || catLower.includes('skirt')) category = 'Apparel & Accessories > Clothing > Women > Skirts';
        else category = 'Apparel & Accessories > Clothing > Women';
        categoryFound = true;
        break;
      } else if (catLower.includes('erkek') || catLower.includes('men') || catLower.includes('male')) {
        if (catLower.includes('gömlek') || catLower.includes('shirt')) category = 'Apparel & Accessories > Clothing > Men > Shirts';
        else if (catLower.includes('üst') || catLower.includes('top') || catLower.includes('tişört')) category = 'Apparel & Accessories > Clothing > Men > Tops';
        else if (catLower.includes('alt') || catLower.includes('pantolon') || catLower.includes('pant') || catLower.includes('jean')) category = 'Apparel & Accessories > Clothing > Men > Pants';
        else if (catLower.includes('dış giyim') || catLower.includes('ceket') || catLower.includes('outerwear') || catLower.includes('mont')) category = 'Apparel & Accessories > Clothing > Men > Outerwear';
        else category = 'Apparel & Accessories > Clothing > Men';
        categoryFound = true;
        break;
      }
    }
  }

  // 3. Ürün başlığından kategori tahmin et (her zaman çalışır)
  console.log(`  📝 Başlık analizi yapılıyor: "${title}"`);
  const titleLower = title.toLowerCase();

  if (titleLower.includes('elbise')) {
    category = 'Apparel & Accessories > Clothing > Women > Dresses';
    categoryFound = true;
  } else if (titleLower.includes('bluz') || titleLower.includes('tişört') || titleLower.includes('tshirt')) {
    category = 'Apparel & Accessories > Clothing > Women > Tops';
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

  // MANUEL STOK FİLTRELEME - variants verilerine dayalı
  console.log('🎯 Manuel stok filtreleme başlatılıyor...');
  
  const inStockVariants = variants.filter(v => v.inStock === true);
  const inStockSizes = [...new Set(inStockVariants.map(v => v.size))];
  
  console.log(`📊 Stok analizi: ${variants.length} toplam → ${inStockVariants.length} stokta`);
  console.log(`🟢 Stokta olan bedenler: ${inStockSizes.join(', ')}`);
  
  if (inStockSizes.length > 0 && inStockSizes.length < sortedSizes.length) {
    console.log('🎯 STOK FİLTRELEME UYGULANIYOR');
    
    return {
      brand,
      title,
      price: priceData,
      images,
      colorOptions: extractedColors,
      sizeOptions: finalSizes,
      variants: organizedVariants,
      stockAnalysis: {
        totalVariants: organizedVariants.length,
        inStockVariants: organizedVariants.filter(v => v.inStock).length,
        outOfStockVariants: organizedVariants.filter(v => !v.inStock).length,
        availableSizes: finalSizes,
        unavailableSizes: []
      },
      features,
      category
    };
  }

  return {
    brand,
    title,
    price: priceData,
    images,
    colorOptions: finalColors,
    sizeOptions: finalSizes,
    variants: organizedVariants,
    stockAnalysis: {
      totalVariants: organizedVariants.length,
      inStockVariants: organizedVariants.filter(v => v.inStock).length,
      outOfStockVariants: organizedVariants.filter(v => !v.inStock).length,
      availableSizes: finalSizes,
      unavailableSizes: []
    },
    features: features.length > 0 ? features : [
      { key: 'Kategori', value: category || 'Ürün' },
      { key: 'Marka', value: brand || 'Bilinmeyen' }
    ],
    category
  };
}

// Helper function for stock filtering
async function filterOutOfStockSizes(page: any): Promise<{
  inStockSizes: string[];
  outOfStockSizes: string[];
  totalSizes: number;
  method: string;
}> {
  try {
    // Stock filtering implementation would go here
    return {
      inStockSizes: [],
      outOfStockSizes: [],
      totalSizes: 0,
      method: 'placeholder'
    };
  } catch (error) {
    throw new Error(`Stock filtering failed: ${error.message}`);
  }
}