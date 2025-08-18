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

export function generateMultiVariantShopifyCSV(product: CombinedProduct): string {
  // Validate product before processing - Skip error responses
  if (!product || !product.title || !product.brand) {
    console.log('⚠️ Invalid product data, skipping CSV generation');
    return '';
  }
  
  // Enhanced check for blocked/error responses and poor quality data
  const errorIndicators = [
    'Sorry, you have been blocked', '429', '403', 'Access Denied', 'Erişim Engellendi', 
    'Rate limit', 'Blocked', 'Error', 'undefined', 'null', 'Product', 'Bilinmeyen Ürün'
  ];
  const titleLower = product.title.toLowerCase();
  
  const isErrorContent = errorIndicators.some(indicator => titleLower.includes(indicator.toLowerCase())) ||
      product.title.length < 3 ||
      product.title === 'Product' ||
      product.brand === 'Bilinmiyor' ||
      product.brand === 'Lütfen bekleyin' ||
      product.brand === 'Unknown';
      
  if (isErrorContent) {
    console.log(`⚠️ Poor quality/blocked product detected: "${product.title}" (brand: ${product.brand}), skipping CSV generation`);
    return '';
  }
  
  // Check for valid price
  const hasValidPrice = product.price && (
    (typeof product.price === 'number' && product.price > 0) ||
    (typeof product.price === 'object' && (product.price.original > 0 || product.price.withProfit > 0))
  );
  
  if (!hasValidPrice) {
    console.log('⚠️ Product has no valid price, skipping CSV generation');
    return '';
  }
  
  // HEADERS - Shopify import formatına uygun (Metafield dahil)
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Tags', 'Published',
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
  
  // Brand information
  if (product.brand && product.brand.trim() !== '' && product.brand !== 'undefined') {
    bodyHtml += `<p><strong>Marka:</strong> ${product.brand}</p>`;
  }
  
  // Category information
  const categoryFeature = product.features.find(f => 
    f.key.toLowerCase().includes('kategori') || 
    f.key.toLowerCase().includes('category') ||
    f.key.toLowerCase().includes('type')
  );
  if (categoryFeature && categoryFeature.value.trim() !== '') {
    bodyHtml += `<p><strong>Kategori:</strong> ${categoryFeature.value}</p>`;
  } else if (product.category && product.category.trim() !== '') {
    bodyHtml += `<p><strong>Kategori:</strong> ${product.category}</p>`;
  }
  
  // Product description
  if (product.description && product.description !== 'undefined' && product.description.trim() !== '') {
    bodyHtml += `<div class="description"><strong>Ürün Açıklaması:</strong><br/>${product.description}</div>`;
  }
  
  // Product features - comprehensive listing
  if (product.features && product.features.length > 0) {
    const validFeatures = product.features.filter(f => 
      f.key && f.value && 
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
  
  // Variant information summary
  if (product.variants && product.variants.colors && product.variants.colors.length > 0) {
    bodyHtml += `<p><strong>Mevcut Renkler:</strong> ${product.variants.colors.join(', ')}</p>`;
  }
  
  if (product.variants && product.variants.sizes && product.variants.sizes.length > 0) {
    bodyHtml += `<p><strong>Mevcut Bedenler:</strong> ${product.variants.sizes.join(', ')}</p>`;
  }
  
  bodyHtml += `</div>`;

  // ✅ GELİŞMİŞ FİYAT HESAPLAMA - Kuruş/TL dönüşümü dahil
  let basePrice = '0';
  let originalPrice = 0;
  
  console.log(`💰 CSV: Processing price data:`, product.price);
  
  if (typeof product.price === 'object' && product.price !== null) {
    if (product.price.withProfit) {
      basePrice = product.price.withProfit.toString();
      console.log(`💰 CSV: Using withProfit: ${basePrice}`);
    } else if (product.price.original) {
      originalPrice = parseFloat(product.price.original.toString());
      console.log(`💰 CSV: Using original price: ${originalPrice}`);
    } else if (product.price.value) {
      originalPrice = parseFloat(product.price.value.toString());
      console.log(`💰 CSV: Using price value: ${originalPrice}`);
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
  
  // FİYAT ARAL KONTROLÜ VE DÜZELTME
  if (originalPrice > 0 && basePrice === '0') {
    // Fiyat çok yüksekse (>1000 TL), muhtemelen kuruş cinsinden gelmiş
    if (originalPrice > 1000) {
      console.log(`⚠️ CSV: High price detected (${originalPrice}), likely in kuruş - converting to TL`);
      originalPrice = originalPrice / 100; // Kuruştan TL'ye çevir
    }
    
    // Fiyat çok düşükse (<1 TL), muhtemelen hatalı
    if (originalPrice < 1) {
      console.log(`⚠️ CSV: Very low price detected (${originalPrice}) - setting minimum price`);
      originalPrice = 10; // Minimum 10 TL
    }
    
    // %10 kar marjı ekle
    const finalPrice = Math.round(originalPrice * 1.10 * 100) / 100; // 2 ondalık basamak
    basePrice = finalPrice.toString();
    console.log(`💰 CSV: Final calculated price: ${originalPrice} -> ${basePrice} (with 10% profit)`);
  }
  
  // Son kontrol - hala 0 ise varsayılan fiyat
  if (basePrice === '0' || parseFloat(basePrice) < 1) {
    basePrice = '29.90'; // Varsayılan fiyat
    console.log(`💰 CSV: Using default price: ${basePrice}`);
  }

  // ✅ TÜM GÖRSELLERİ KONTROL ET VE GRUPLA
  console.log(`📸 CSV: Processing ${product.images.length} total images`);
  product.images.forEach((img, idx) => {
    console.log(`📸 CSV: Image ${idx + 1}: ${img.url} (Color: ${img.colorName || 'none'})`);
  });

  const imagesByColor: { [color: string]: string[] } = {};
  const generalImages: string[] = [];
  
  product.images.forEach(img => {
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

  // ❌ SAHTE VARYANT ENGELLEME - Sadece gerçek varyantlar kullanılır
  let actualVariants = product.variants.allVariants || [];
  
  // Gerçek varyant kontrolü - eğer hiçbir gerçek varyant yoksa tek ürün
  if (actualVariants.length === 0) {
    // Varyant yok - tek ürün olarak işle
    actualVariants = [{
      color: '',
      colorCode: 'single',
      size: '',
      inStock: true
    }];
    console.log('📦 No real variants found - processing as single product');
  } else {
    console.log(`📦 Processing ${actualVariants.length} real variants`);
  }
  
  console.log(`📊 Processing ${actualVariants.length} actual variants (filtered from ${product.variants.allVariants?.length || 0} total)`);
  
  // Tüm varyantları işle
  let imagePosition = 1;
  let isFirstRow = true;
  
  actualVariants.forEach((variant, index) => {
    const row: string[] = [];
    
    // İlk satır için ürün bilgileri
    if (isFirstRow) {
      row.push(productHandle); // Handle
      row.push(product.title); // Title
      row.push(bodyHtml); // Body (HTML)
      row.push(product.brand || ''); // Vendor
      row.push(product.tags.join(', ')); // Tags
      row.push('TRUE'); // Published
    } else {
      // Sonraki satırlarda sadece varyant bilgileri
      row.push(productHandle); // Handle
      row.push(''); // Title (boş)
      row.push(''); // Body (boş)
      row.push(''); // Vendor (boş)
      row.push(''); // Tags (boş)
      row.push(''); // Published (boş)
    }
    
    // Option bilgileri - sadece gerçek varyantlar için
    if (actualVariants.length > 1 && variant.color !== 'Tek Renk') {
      row.push('Renk'); // Option1 Name
      row.push(variant.color); // Option1 Value
      if (variant.size !== 'Tek Beden') {
        row.push('Beden'); // Option2 Name
        row.push(variant.size); // Option2 Value
      } else {
        row.push(''); // Option2 Name
        row.push(''); // Option2 Value
      }
    } else {
      // Tek ürün - option yok
      row.push(''); // Option1 Name
      row.push(''); // Option1 Value
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
    row.push(basePrice); // Variant Price
    
    // ✅ DOĞRU KARŞILAŞTIRMA FİYATI - corrected original price kullan
    let comparePrice = '';
    if (typeof product.price === 'object' && product.price.original) {
      // DOĞRUDAN corrected original price'ı kullan - kuruş conversion yapılmış
      const origPrice = parseFloat(product.price.original.toString());
      comparePrice = origPrice.toString();
      console.log(`💰 CSV: Compare price from CORRECTED original: ${comparePrice}`);
      console.log(`💰 CSV: NO ADDITIONAL CONVERSION - Using corrected price directly`);
    } else if (basePrice !== '0' && originalPrice > 0) {
      // Kar marjı öncesi fiyatı karşılaştırma fiyatı olarak göster
      comparePrice = (Math.round(originalPrice * 100) / 100).toString();
      console.log(`💰 CSV: Compare price calculated: ${comparePrice}`);
    }
    row.push(comparePrice); // Variant Compare At Price
    row.push('TRUE'); // Variant Requires Shipping
    row.push('TRUE'); // Variant Taxable
    
    // ✅ GELİŞTİRİLMİŞ GÖRSEL SİSTEMİ - TÜM GÖRSELLERLE UYUMLU
    if (product.images && product.images.length > 0) {
      // Variant için uygun görseli seç
      let selectedImage = '';
      let imagePosition = '1';
      
      if (isFirstRow) {
        // İlk satır - ana ürün görseli
        selectedImage = product.images[0]?.url || '';
        imagePosition = '1';
        console.log(`📸 CSV: Adding main product image: ${selectedImage}`);
      } else {
        // Sonraki satırlar - renk bazında veya sıralı görsel seçimi
        const variantIndex = actualVariants.indexOf(variant);
        const colorBasedImage = variant.color && variant.color !== '' ? 
          product.images.find(img => img.colorName === variant.color) : null;
          
        if (colorBasedImage) {
          selectedImage = colorBasedImage.url;
          imagePosition = ((colorBasedImage as any).position || variantIndex + 1).toString();
          console.log(`📸 CSV: Using color-based image for ${variant.color}: ${selectedImage}`);
        } else if (variantIndex < product.images.length) {
          selectedImage = product.images[variantIndex]?.url || '';
          imagePosition = (variantIndex + 1).toString();
          console.log(`📸 CSV: Using sequential image ${variantIndex + 1}: ${selectedImage}`);
        } else {
          // Fallback - başka görsel varsa onları kullan
          const fallbackIndex = variantIndex % product.images.length;
          selectedImage = product.images[fallbackIndex]?.url || '';
          imagePosition = (fallbackIndex + 1).toString();
          console.log(`📸 CSV: Using fallback image: ${selectedImage}`);
        }
      }
      
      row.push(selectedImage); // Image Src
      row.push(imagePosition); // Image Position
      row.push(product.title || 'Product Image'); // Image Alt Text
    } else {
      // Hiç görsel yok
      console.log('⚠️ CSV: No images available for product');
      row.push(''); // Image Src
      row.push(''); // Image Position  
      row.push(''); // Image Alt Text
    }
    
    row.push('FALSE'); // Gift Card
    
    // Enhanced SEO Title - brand + product name
    const seoTitle = product.brand && product.brand !== 'undefined' 
      ? `${product.brand} ${product.title}`.substring(0, 70)
      : (product.title || '').substring(0, 70);
    row.push(seoTitle); // SEO Title
    
    // Enhanced SEO Description - comprehensive product summary
    let seoDescription = '';
    if (product.description && product.description !== 'undefined' && product.description.trim() !== '') {
      seoDescription = product.description.substring(0, 160);
    } else {
      // Create description from available data
      const parts = [];
      if (product.brand && product.brand !== 'undefined') parts.push(product.brand);
      if (product.title) parts.push(product.title);
      if (product.category) parts.push(product.category);
      if (product.variants && product.variants.colors && product.variants.colors.length > 0) {
        parts.push(`${product.variants.colors.length} renk seçeneği`);
      }
      if (product.variants && product.variants.sizes && product.variants.sizes.length > 0) {
        parts.push(`${product.variants.sizes.length} beden seçeneği`);
      }
      
      seoDescription = parts.join(', ').substring(0, 160);
    }
    row.push(seoDescription); // SEO Description
    
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
  
  // Kalan renk bazlı görselleri ekle
  Object.entries(imagesByColor).forEach(([colorName, images]) => {
    console.log(`📸 CSV: Adding ${images.length - 1} additional images for color: ${colorName}`);
    images.slice(1).forEach((imageUrl, idx) => { // İlk görsel zaten varyant görseli olarak kullanıldı
      const imageRow = Array(headers.length).fill('');
      imageRow[0] = productHandle; // Handle
      imageRow[18] = imageUrl; // Image Src (18. index)
      imageRow[19] = imagePosition.toString(); // Image Position (19. index)
      imageRow[20] = `${product.title} - ${colorName} ${idx + 2}`; // Image Alt Text (20. index)
      console.log(`📸 CSV: Added image row for ${colorName} - Position ${imagePosition}: ${imageUrl}`);
      rows.push(imageRow);
      imagePosition++;
    });
  });

  // Genel görselleri ekle (renk bazında olmayan)
  console.log(`📸 CSV: Adding ${generalImages.length - 1} general images`);
  generalImages.slice(1).forEach((imageUrl, idx) => {
    const imageRow = Array(headers.length).fill('');
    imageRow[0] = productHandle; // Handle
    imageRow[18] = imageUrl; // Image Src (18. index)
    imageRow[19] = imagePosition.toString(); // Image Position (19. index)
    imageRow[20] = `${product.title} - Image ${idx + 2}`; // Image Alt Text (20. index)
    console.log(`📸 CSV: Added general image row - Position ${imagePosition}: ${imageUrl}`);
    rows.push(imageRow);
    imagePosition++;
  });

  // Eğer hiç görsel yoksa, product.images dizisinden doğrudan ekle
  if (generalImages.length === 0 && Object.keys(imagesByColor).length === 0 && product.images.length > 1) {
    console.log(`📸 CSV: No categorized images found, adding from product.images array`);
    product.images.slice(1).forEach((img, idx) => {
      if (img.url) {
        const imageRow = Array(headers.length).fill('');
        imageRow[0] = productHandle; // Handle
        imageRow[18] = img.url; // Image Src
        imageRow[19] = imagePosition.toString(); // Image Position
        imageRow[20] = `${product.title} - Additional Image ${idx + 2}`; // Image Alt Text
        console.log(`📸 CSV: Added direct image row - Position ${imagePosition}: ${img.url}`);
        rows.push(imageRow);
        imagePosition++;
      }
    });
  }

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