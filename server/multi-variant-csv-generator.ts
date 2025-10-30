interface CombinedProduct {
  id: string;
  title: string;
  brand: string;
  price: any;
  description: string;
  category: string;
  images: Array<{ url: string; alt?: string; colorName?: string }>;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features: Array<{ key: string; value: string }>;
  tags: string[];
}

export async function generateMultiVariantShopifyCSV(product: CombinedProduct): Promise<string> {
  // Apply brand sanitization to product before processing
  const brandSanitizer = await import('./brand-sanitizer');
  const sanitizedProduct = brandSanitizer.sanitizeProduct(product);
  console.log('🧹 CSV: Trendyol branding removed from product data');
  
  // Validate product before processing - Skip error responses
  if (!sanitizedProduct || !sanitizedProduct.title) {
    console.log('⚠️ Invalid product data, skipping CSV generation');
    return '';
  }
  
  // Ensure brand exists (fallback if empty)
  if (!sanitizedProduct.brand || sanitizedProduct.brand.trim() === '') {
    sanitizedProduct.brand = 'Generic';
    console.log('🔧 CSV: Empty brand detected, using fallback: Generic');
  }
  
  // ✅ MARKA DOĞRULAMA: Trendyol marka ismini engelle
  if (sanitizedProduct.brand && sanitizedProduct.brand.toLowerCase() === 'trendyol') {
    // Gerçek markayı title'dan çıkarmaya çalış
    const titleWords = sanitizedProduct.title.split(' ');
    const possibleBrand = titleWords[0];
    if (possibleBrand && possibleBrand.length > 2 && possibleBrand.toLowerCase() !== 'trendyol') {
      sanitizedProduct.brand = possibleBrand;
      console.log(`🏷️ CSV: Trendyol markası "${possibleBrand}" ile değiştirildi`);
    } else {
      sanitizedProduct.brand = 'Generic';
      console.log(`🏷️ CSV: Trendyol markası "Generic" ile değiştirildi`);
    }
  }
  
  // Enhanced check for blocked/error responses and poor quality data
  const errorIndicators = [
    'Sorry, you have been blocked', '429', '403', 'Access Denied', 'Erişim Engellendi', 
    'Rate limit', 'Blocked', 'Error', 'undefined', 'null', 'Product', 'Bilinmeyen Ürün'
  ];
  const titleLower = sanitizedProduct.title.toLowerCase();
  
  const isErrorContent = errorIndicators.some(indicator => titleLower.includes(indicator.toLowerCase())) ||
      sanitizedProduct.title.length < 3 ||
      sanitizedProduct.title === 'Product' ||
      sanitizedProduct.brand === 'Bilinmiyor' ||
      sanitizedProduct.brand === 'Lütfen bekleyin' ||
      sanitizedProduct.brand === 'Unknown';
      
  if (isErrorContent) {
    console.log(`⚠️ Poor quality/blocked product detected: "${product.title}" (brand: ${product.brand}), skipping CSV generation`);
    return '';
  }
  
  // Use fallback price if none available - DO NOT skip CSV generation
  let productPrice = 100; // Fallback price
  if (product.price) {
    if (typeof product.price === 'number' && product.price > 0) {
      productPrice = product.price;
    } else if (typeof product.price === 'object' && (product.price.original > 0 || product.price.withProfit > 0)) {
      productPrice = product.price.original || product.price.withProfit || 100;
    }
  }
  
  // Ensure product has price object for CSV generation
  if (!product.price || typeof product.price !== 'object') {
    product.price = {
      original: productPrice,
      withProfit: productPrice,
      formatted: `${productPrice} TL`,
      profitFormatted: `${productPrice} TL`
    };
  } else if (product.price.original <= 0) {
    product.price.original = productPrice;
    product.price.withProfit = productPrice;
    product.price.formatted = `${productPrice} TL`;
    product.price.profitFormatted = `${productPrice} TL`;
  }
  
  console.log(`✅ Using price ${productPrice} TL for CSV generation`);
  
  // HEADERS - Shopify import formatına uygun (Kategori ve Metafield dahil)
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
    'Variant SKU', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Inventory Tracker',
    'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 
    'SEO Title', 'SEO Description', 'Variant Image', 'Variant Weight Unit', 'Status',
    'Metafield: custom.repli_t_id [single_line_text_field]'
  ];

  const rows: string[][] = [];
  rows.push(headers);

  // Benzersiz takip ID'si oluştur veya mevcut olanı kullan
  const uniqueTrackingId = (product as any).uniqueTrackingId || 
    `trendyol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Handle oluştur (Türkçe karakter temizleme)
  const productHandle = product.title.toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Enhanced Body HTML with comprehensive product data
  let bodyHtml = `<div class="product-details">`;
  
  // ✅ MARKA BİLGİSİ: Sanitize edilmiş markayı kullan, Trendyol'u engelle
  if (sanitizedProduct.brand && 
      sanitizedProduct.brand.trim() !== '' && 
      sanitizedProduct.brand !== 'undefined' &&
      sanitizedProduct.brand.toLowerCase() !== 'trendyol') {
    bodyHtml += `<p><strong>Marka:</strong> ${sanitizedProduct.brand}</p>`;
    console.log(`🏷️ CSV: Marka HTML'e eklendi: ${sanitizedProduct.brand}`);
  } else {
    console.log('🚫 CSV: Trendyol markası HTML\'e eklenmedi - engellendi');
  }
  
  // Category information - SAFE NULL CHECK
  let categoryFeature = null;
  if (product.features && Array.isArray(product.features) && product.features.length > 0) {
    try {
      categoryFeature = product.features.find(f => 
        f && f.key && typeof f.key === 'string' &&
        (f.key.toLowerCase().includes('kategori') || 
         f.key.toLowerCase().includes('category') ||
         f.key.toLowerCase().includes('type'))
      );
    } catch (error) {
      console.log('⚠️ CSV: Category feature extraction error:', error.message);
      categoryFeature = null;
    }
  }
  // ✅ KATEGORİ BİLGİSİ: Gerçek kategoriyi kullan
  if (categoryFeature && categoryFeature.value && categoryFeature.value.trim() !== '' && categoryFeature.value !== 'Kategori') {
    bodyHtml += `<p><strong>Kategori:</strong> ${categoryFeature.value}</p>`;
    console.log(`🏷️ CSV: Kategori HTML'e eklendi: ${categoryFeature.value}`);
  } else if (sanitizedProduct.category && 
             sanitizedProduct.category.trim() !== '' && 
             sanitizedProduct.category !== 'Kategori' &&
             sanitizedProduct.category !== 'Genel Ürünler') {
    bodyHtml += `<p><strong>Kategori:</strong> ${sanitizedProduct.category}</p>`;
    console.log(`🏷️ CSV: Ürün kategorisi HTML'e eklendi: ${sanitizedProduct.category}`);
  } else {
    console.log('🚫 CSV: Geçersiz kategori HTML\'e eklenmedi');
  }
  
  // Product description
  if (product.description && product.description !== 'undefined' && product.description.trim() !== '') {
    bodyHtml += `<div class="description"><strong>Ürün Açıklaması:</strong><br/>${product.description}</div>`;
  }
  
  // Product features - comprehensive listing with SAFE NULL CHECK
  if (product.features && Array.isArray(product.features) && product.features.length > 0) {
    const validFeatures = product.features.filter(f => 
      f && f.key && f.value && 
      typeof f.key === 'string' && typeof f.value === 'string' &&
      f.key.trim() !== '' && 
      f.value.trim() !== '' &&
      !f.key.toLowerCase().includes('kategori') // Skip category as it's already added
    );
    
    if (validFeatures.length > 0) {
      bodyHtml += '<h3>Teknik Özellikler:</h3><ul>';
      validFeatures.forEach(feature => {
        bodyHtml += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
      });
      bodyHtml += '</ul>';
    }
  }
  
  // ❌ SAHTE VARIANT BİLGİLERİ ENGELLENDI - Sadece gerçek varyant varsa göster
  const htmlVariants = product.variants && product.variants.allVariants ? product.variants.allVariants.filter(v => v.color && v.color.trim() !== '') : [];
  
  if (htmlVariants.length > 0) {
    const realColors = [...new Set(htmlVariants.map(v => v.color).filter(c => c && c.trim() !== ''))];
    const realSizes = [...new Set(htmlVariants.map(v => v.size).filter(s => s && s.trim() !== ''))];
    
    if (realColors.length > 0) {
      bodyHtml += `<p><strong>Mevcut Renkler:</strong> ${realColors && Array.isArray(realColors) ? realColors.join(', ') : 'Çeşitli Renkler'}</p>`;
    }
    
    if (realSizes.length > 0) {
      bodyHtml += `<p><strong>Mevcut Bedenler:</strong> ${realSizes && Array.isArray(realSizes) ? realSizes.join(', ') : 'Çeşitli Bedenler'}</p>`;
    }
  }
  
  bodyHtml += `</div>`;

  // 🚨 CRITICAL FIX: GUARANTEED PROFIT MARGIN CALCULATION
  let basePrice = '0';
  let originalPrice = 0;
  let compareAtPrice = 0; // Original price for comparison
  
  console.log(`💰 CSV: Processing price data:`, product.price);
  
  // Extract original price first
  if (typeof product.price === 'object' && product.price !== null) {
    if (product.price.original) {
      originalPrice = parseFloat(product.price.original.toString());
      console.log(`💰 CSV: Found original price: ${originalPrice}`);
    } else if (product.price.value) {
      originalPrice = parseFloat(product.price.value.toString());
      console.log(`💰 CSV: Found price value: ${originalPrice}`);
    } else if (product.price.withProfit) {
      // If only withProfit exists, reverse calculate original
      const withProfitValue = parseFloat(product.price.withProfit.toString());
      originalPrice = Math.round((withProfitValue / 1.10) * 100) / 100;
      console.log(`💰 CSV: Reverse calculated from withProfit ${withProfitValue} -> original: ${originalPrice}`);
    }
  } else if (typeof product.price === 'number') {
    originalPrice = product.price;
    console.log(`💰 CSV: Using number price: ${originalPrice}`);
  } else if (typeof product.price === 'string') {
    const priceMatch = product.price.match(/[\d.,]+/);
    if (priceMatch) {
      originalPrice = parseFloat(priceMatch[0].replace(',', '.'));
      console.log(`💰 CSV: Parsed string price: ${originalPrice}`);
    }
  }
  
  // PRICE VALIDATION AND CORRECTION
  if (originalPrice > 0) {
    // Fix kuruş to TL conversion
    if (originalPrice > 10000) {
      console.log(`⚠️ CSV: Very high price detected (${originalPrice}), likely in kuruş - converting to TL`);
      originalPrice = originalPrice / 100;
    }
    
    // Set minimum price
    if (originalPrice < 1) {
      console.log(`⚠️ CSV: Very low price detected (${originalPrice}) - setting minimum price`);
      originalPrice = 10;
    }
    
    // Store original for compare at price
    compareAtPrice = originalPrice;
    
    // 🚨 ALWAYS CALCULATE 10% PROFIT - NEVER USE EXISTING withProfit
    const profitPrice = Math.round(originalPrice * 1.10 * 100) / 100;
    basePrice = profitPrice.toString();
    
    console.log(`💰 CSV: PROFIT CALCULATION: ${originalPrice} TL + 10% = ${basePrice} TL`);
    console.log(`💰 CSV: Compare At Price (original): ${compareAtPrice} TL`);
  }
  
  // Final fallback if no price found
  if (basePrice === '0' || parseFloat(basePrice) < 1) {
    basePrice = '29.90'; // Default with profit
    compareAtPrice = 27.18; // Default original (29.90 / 1.10)
    console.log(`💰 CSV: Using default prices: sale=${basePrice}, original=${compareAtPrice}`);
  }
  
  // Son kontrol - hala 0 ise varsayılan fiyat
  if (basePrice === '0' || parseFloat(basePrice) < 1) {
    basePrice = '29.90'; // Varsayılan fiyat
    console.log(`💰 CSV: Using default price: ${basePrice}`);
  }

  // ✅ TÜM GÖRSELLERİ KONTROL ET VE GRUPLA
  console.log(`📸 CSV: Processing ${product.images.length} total images`);
  
  // Handle both string arrays and object arrays
  let processedImages: Array<{url: string, colorName?: string}> = [];
  
  if (Array.isArray(product.images)) {
    product.images.forEach((img, idx) => {
      if (typeof img === 'string') {
        // String array - direct URLs
        processedImages.push({url: img, colorName: 'none'});
        console.log(`📸 CSV: Image ${idx + 1}: ${img} (string format)`);
      } else if (img && typeof img === 'object' && img.url) {
        // Object array with url property
        processedImages.push({url: img.url, colorName: img.colorName || 'none'});
        console.log(`📸 CSV: Image ${idx + 1}: ${img.url} (Color: ${img.colorName || 'none'})`);
      }
    });
  }

  const imagesByColor: { [color: string]: string[] } = {};
  const generalImages: string[] = [];
  
  processedImages.forEach(img => {
    if (img.url) { // URL varsa işle
      if (img.colorName && img.colorName !== '' && img.colorName !== 'none') {
        if (!imagesByColor[img.colorName]) {
          imagesByColor[img.colorName] = [];
        }
        imagesByColor[img.colorName].push(img.url);
        console.log(`📸 CSV: Added to ${img.colorName}: ${img.url}`);
      } else {
        generalImages.push(img.url);
        console.log(`📸 CSV: Added to general images: ${img.url}`);
      }
    }
  });

  console.log(`📸 CSV: Organized images - Colors: ${Object.keys(imagesByColor).length}, General: ${generalImages.length}`);

  // 🔧 SCHEMA NORMALIZATION: Support both flat array and nested structure
  console.log(`🔍 DEBUG: Raw product.variants:`, JSON.stringify(product.variants, null, 2));
  const inputVariants = Array.isArray(product.variants) ? product.variants : (product.variants?.allVariants || []);
  console.log(`🧩 CSV: Input variants structure:`, { 
    isArray: Array.isArray(product.variants),
    flatCount: Array.isArray(product.variants) ? product.variants.length : 0,
    nestedCount: product.variants?.allVariants?.length || 0,
    inputVariantsLength: inputVariants.length,
    firstVariant: inputVariants[0]
  });
  
  // ✅ REAL VARIANT DETECTION - Accept variants with color OR size
  let actualVariants = inputVariants;
  
  // Filter for real variants: must have either color or size (not both required)
  const realVariants = actualVariants.filter(v => 
    (v.color && v.color.trim() !== '' && v.color !== 'Tek Renk') || 
    (v.size && v.size.trim() !== '')
  );
  
  if (realVariants.length === 0) {
    // 🚫 SAHTE VARYANT ENGELLEMESİ - Tek ürün olarak işle
    console.log('🚫 SAHTE VARYANT ENGELLEMESİ: Gerçek varyant bulunamadı - tek ürün olarak işleniyor');
    actualVariants = [{
      color: '',
      colorCode: '',
      size: '',
      inStock: true
    }];
  } else {
    actualVariants = realVariants;
    console.log(`📦 Processing ${actualVariants.length} REAL variants (color-only or size-only accepted)`);
  }
  
  console.log(`📊 Processing ${actualVariants.length} actual variants (filtered from ${product.variants.allVariants?.length || 0} total)`);
  
  // 🚨 CRITICAL FIX: Deduplicate variants by color-size combination
  const uniqueVariants = new Map<string, typeof actualVariants[0]>();
  actualVariants.forEach(variant => {
    const colorKey = (variant.color || '').trim().toLowerCase();
    const sizeKey = (variant.size || '').trim().toLowerCase();
    const uniqueKey = `${colorKey}|${sizeKey}`;
    
    if (!uniqueVariants.has(uniqueKey)) {
      uniqueVariants.set(uniqueKey, variant);
      console.log(`✅ CSV: Added unique variant: ${variant.color || 'no-color'} / ${variant.size || 'no-size'}`);
    } else {
      console.log(`⚠️ CSV: Skipping duplicate variant: ${variant.color || 'no-color'} / ${variant.size || 'no-size'}`);
    }
  });
  
  const deduplicatedVariants = Array.from(uniqueVariants.values());
  console.log(`🔧 CSV: Deduplicated ${actualVariants.length} variants to ${deduplicatedVariants.length} unique combinations`);
  
  // 🎯 CRITICAL FIX: Filter ONLY in-stock variants for CSV
  const inStockVariants = deduplicatedVariants.filter(v => v.inStock !== false);
  console.log(`✅ STOCK FILTER: ${deduplicatedVariants.length} total → ${inStockVariants.length} in-stock (${deduplicatedVariants.length - inStockVariants.length} out-of-stock excluded)`);
  
  // Tüm varyantları işle - SADECE STOKTA OLANLAR
  let imagePosition = 1;
  let isFirstRow = true;
  
  inStockVariants.forEach((variant, index) => {
    const row: string[] = [];
    
    // İlk satır için ürün bilgileri
    if (isFirstRow) {
      row.push(productHandle); // Handle
      row.push(product.title); // Title
      row.push(bodyHtml); // Body (HTML)
      // ✅ VENDOR ALANI: Marka ismini doğrula ve Trendyol'u engelle
      const vendorName = (product.brand && product.brand.toLowerCase() !== 'trendyol') 
        ? product.brand 
        : (product.title.split(' ')[0] || 'Generic');
      row.push(vendorName); // Vendor
      
      // ✅ KATEGORİ ALANI: Product Type olarak sanitize edilmiş kategori ekle
      const productCategory = (sanitizedProduct.category && 
                              sanitizedProduct.category.trim() !== '' && 
                              sanitizedProduct.category !== 'Kategori' &&
                              sanitizedProduct.category !== 'Genel Ürünler') 
                              ? sanitizedProduct.category 
                              : (product.category && product.category !== 'Kategori') 
                              ? product.category 
                              : 'Genel Ürünler';
      row.push(productCategory); // Product Type
      console.log(`🏷️ CSV: Product Type eklendi: "${productCategory}"`);
      
      // Tags - CSV'ye tüm etiketler ekleniyor (ürün + kalıcı), #trendyol filtreleniyor
      const filteredTags = product.tags && Array.isArray(product.tags) 
        ? product.tags.filter(tag => tag.toLowerCase() !== 'trendyol' && tag.toLowerCase() !== '#trendyol')
        : [];
      const tagsForCSV = filteredTags.length > 0 ? filteredTags.join(', ') : '';
      console.log(`🏷️ CSV: Adding ${filteredTags.length} tags to CSV (filtered out #trendyol): [${tagsForCSV}]`);
      row.push(tagsForCSV); // Tags
      row.push('TRUE'); // Published
    } else {
      // Sonraki satırlarda sadece varyant bilgileri
      row.push(productHandle); // Handle
      row.push(''); // Title (boş)
      row.push(''); // Body (boş)
      row.push(''); // Vendor (boş)
      row.push(''); // Product Type (boş)
      row.push(''); // Tags (boş)
      row.push(''); // Published (boş)
    }
    
    // 🎯 FIX: Use actual variant color and size directly
    const variantHasColor = variant.color && variant.color.trim() !== '' && variant.color !== 'Tek Renk' && variant.color !== 'Standart';
    const variantHasSize = variant.size && variant.size.trim() !== '' && variant.size !== 'Tek Beden' && variant.size !== 'Standart';
    
    // Always use Option1 for Color (if exists), Option2 for Size (if exists)
    if (variantHasColor) {
      row.push('Renk'); // Option1 Name
      row.push(variant.color); // Option1 Value - Use actual variant color
      console.log(`📦 CSV Row ${index + 1}: Color = ${variant.color}`);
    } else {
      row.push(''); // Option1 Name
      row.push(''); // Option1 Value
    }
    
    if (variantHasSize) {
      row.push('Beden'); // Option2 Name
      row.push(variant.size); // Option2 Value - Use actual variant size
      console.log(`📦 CSV Row ${index + 1}: Size = ${variant.size}`);
    } else {
      row.push(''); // Option2 Name
      row.push(''); // Option2 Value
    }
    
    // Enhanced Variant SKU - more descriptive
    let variantSku = productHandle;
    if (variant.color && variant.color !== '' && variant.color !== 'Tek Renk') {
      variantSku += `-${variant.color.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    }
    if (variant.size && variant.size !== '' && variant.size !== 'Tek Beden') {
      variantSku += `-${variant.size.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    }
    if (variant.colorCode && variant.colorCode !== 'single') {
      variantSku += `-${variant.colorCode}`;
    }
    
    row.push(variantSku); // Variant SKU
    row.push('0'); // Variant Inventory Qty - ENVANTER TAKİBİ YOK (0 = sınırsız)
    row.push('continue'); // Variant Inventory Policy - Stok biterse de satmaya devam et
    row.push(''); // Variant Inventory Tracker - Boş = takip yok
    row.push(basePrice); // Variant Price (WITH 10% PROFIT)
    row.push(compareAtPrice.toString()); // Variant Compare At Price (ORIGINAL PRICE)
    row.push('TRUE'); // Variant Requires Shipping
    row.push('TRUE'); // Variant Taxable
    
    // ✅ GELİŞTİRİLMİŞ GÖRSEL SİSTEMİ - TÜM GÖRSELLERLE UYUMLU
    let selectedImage = '';
    let imagePosition = '1';
    
    if (processedImages && processedImages.length > 0) {
      if (isFirstRow) {
        // İlk satır - ana ürün görseli
        selectedImage = processedImages[0].url;
        imagePosition = '1';
        console.log(`📸 CSV: Adding main product image: ${selectedImage}`);
      } else {
        // Sonraki satırlar - renk bazında veya sıralı görsel seçimi
        const variantIndex = inStockVariants.indexOf(variant); // Use inStockVariants instead of actualVariants
        const colorBasedImage = variant.color && variant.color !== '' ? 
          processedImages.find(img => img.colorName === variant.color) : null;
          
        if (colorBasedImage) {
          selectedImage = colorBasedImage.url;
          imagePosition = (variantIndex + 1).toString();
          console.log(`📸 CSV: Using color-based image for ${variant.color}: ${selectedImage}`);
        } else if (variantIndex < processedImages.length) {
          selectedImage = processedImages[variantIndex].url;
          imagePosition = (variantIndex + 1).toString();
          console.log(`📸 CSV: Using sequential image ${variantIndex + 1}: ${selectedImage}`);
        } else {
          // Fallback - başka görsel varsa onları kullan
          const fallbackIndex = variantIndex % processedImages.length;
          selectedImage = processedImages[fallbackIndex].url;
          imagePosition = (fallbackIndex + 1).toString();
          console.log(`📸 CSV: Using fallback image: ${selectedImage}`);
        }
      }
    } else {
      console.log('⚠️ CSV: No images available for product');
    }
    
    row.push(selectedImage); // Image Src
    row.push(imagePosition); // Image Position
    row.push(product.title || 'Product Image'); // Image Alt Text
    
    row.push('FALSE'); // Gift Card
    
    // ✅ SEO TITLE: Sanitize edilmiş marka kullan, Trendyol'u engelle
    const safeBrand = (sanitizedProduct.brand && 
                       sanitizedProduct.brand.toLowerCase() !== 'trendyol' && 
                       sanitizedProduct.brand !== 'undefined') 
                       ? sanitizedProduct.brand 
                       : '';
    const seoTitle = safeBrand 
      ? `${safeBrand} ${product.title}`.substring(0, 70)
      : (product.title || '').substring(0, 70);
    row.push(seoTitle); // SEO Title
    console.log(`🏷️ CSV: SEO Title: "${seoTitle}"`);
    
    // ✅ SEO DESCRIPTION: Sanitize edilmiş marka ve kategori kullan
    let seoDescription = '';
    if (product.description && product.description !== 'undefined' && product.description.trim() !== '') {
      seoDescription = product.description.substring(0, 160);
    } else {
      // Create description from available data - NO TRENDYOL
      const parts = [];
      if (safeBrand) parts.push(safeBrand); // Sanitize edilmiş marka
      if (product.title) parts.push(product.title);
      if (sanitizedProduct.category && 
          sanitizedProduct.category !== 'Kategori' && 
          sanitizedProduct.category !== 'Genel Ürünler') {
        parts.push(sanitizedProduct.category);
      }
      if (product.variants && product.variants.colors && product.variants.colors.length > 0) {
        parts.push(`${product.variants.colors.length} renk seçeneği`);
      }
      if (product.variants && product.variants.sizes && product.variants.sizes.length > 0) {
        parts.push(`${product.variants.sizes.length} beden seçeneği`);
      }
      
      seoDescription = parts.join(', ').substring(0, 160);
    }
    row.push(seoDescription); // SEO Description
    console.log(`🏷️ CSV: SEO Description: "${seoDescription}"`);
    
    // Varyant görseli (renk bazında)
    const colorImages = imagesByColor[variant.color];
    if (colorImages && colorImages.length > 0) {
      row.push(colorImages[0]); // İlk görseli varyant görseli olarak kullan
    } else {
      row.push(''); // Varyant görseli yoksa boş
    }
    
    row.push('kg'); // Variant Weight Unit
    row.push('active'); // Status
    
    // Metafield: Benzersiz takip ID'si (sadece ilk satır için)
    if (actualVariants.indexOf(variant) === 0) {
      row.push(uniqueTrackingId); // İlk varyant için ID'yi ekle
    } else {
      row.push(''); // Diğer varyantlar için boş
    }

    rows.push(row);
    isFirstRow = false;
  });

  // ✅ TÜM GÖRSELLERI EKLE - Hem renk bazında hem genel görseller
  console.log(`📸 CSV: Processing additional images - Colors: ${Object.keys(imagesByColor).length}, General: ${generalImages.length}`);
  
  // Track which images have been added to avoid duplicates
  const addedImageUrls = new Set<string>();
  
  // İlk varyant satırında kullanılan görseli işaretle
  if (processedImages.length > 0) {
    addedImageUrls.add(processedImages[0].url);
  }
  
  // Kalan TÜM görselleri ekle - color-based images
  Object.entries(imagesByColor).forEach(([colorName, images]) => {
    console.log(`📸 CSV: Processing ${images.length} images for color: ${colorName}`);
    images.forEach((imageUrl, idx) => {
      if (!addedImageUrls.has(imageUrl)) {
        const imageRow = Array(headers.length).fill('');
        imageRow[0] = productHandle; // Handle (index 0)
        imageRow[19] = imageUrl; // Image Src (index 19)
        imageRow[20] = (imagePosition++).toString(); // Image Position (index 20)
        imageRow[21] = `${product.title} - ${colorName}`; // Image Alt Text (index 21)
        console.log(`📸 CSV: Added image row for ${colorName} - Position ${imageRow[20]}: ${imageUrl}`);
        rows.push(imageRow);
        addedImageUrls.add(imageUrl);
      }
    });
  });

  // Genel görselleri ekle (renk bazında olmayan)
  console.log(`📸 CSV: Processing ${generalImages.length} general images`);
  generalImages.forEach((imageUrl, idx) => {
    if (!addedImageUrls.has(imageUrl)) {
      const imageRow = Array(headers.length).fill('');
      imageRow[0] = productHandle; // Handle (index 0)
      imageRow[19] = imageUrl; // Image Src (index 19)
      imageRow[20] = (imagePosition++).toString(); // Image Position (index 20)
      imageRow[21] = `${product.title}`; // Image Alt Text (index 21)
      console.log(`📸 CSV: Added general image row - Position ${imageRow[20]}: ${imageUrl}`);
      rows.push(imageRow);
      addedImageUrls.add(imageUrl);
    }
  });

  // Eğer hiç görsel yoksa, product.images dizisinden doğrudan ekle
  if (addedImageUrls.size === 0 && product.images.length > 0) {
    console.log(`📸 CSV: No categorized images found, adding ALL from product.images array (${product.images.length} images)`);
    product.images.forEach((img, idx) => {
      const imgUrl = typeof img === 'string' ? img : img.url;
      if (imgUrl && !addedImageUrls.has(imgUrl)) {
        const imageRow = Array(headers.length).fill('');
        imageRow[0] = productHandle; // Handle (index 0)
        imageRow[19] = imgUrl; // Image Src (index 19)
        imageRow[20] = (imagePosition++).toString(); // Image Position (index 20)
        imageRow[21] = `${product.title}`; // Image Alt Text (index 21)
        console.log(`📸 CSV: Added direct image row - Position ${imageRow[20]}: ${imgUrl}`);
        rows.push(imageRow);
        addedImageUrls.add(imgUrl);
      }
    });
  }
  
  console.log(`📸 CSV: TOTAL IMAGES ADDED TO CSV: ${addedImageUrls.size} (including main image in variant row)`);

  // CSV formatına dönüştür
  return rows.map(row => 
    row.map(cell => {
      // CSV için özel karakterleri escape et
      const cellStr = cell !== null && cell !== undefined ? String(cell) : '';
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  ).join('\n');
}