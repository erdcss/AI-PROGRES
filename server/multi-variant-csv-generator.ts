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
  // HEADERS - Shopify import formatına uygun
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
    'Variant SKU', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Inventory Tracker',
    'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 
    'SEO Title', 'SEO Description', 'Variant Image', 'Variant Weight Unit', 'Status'
  ];

  const rows: string[][] = [];
  rows.push(headers);

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

  // Fiyat hesapla - %10 kar marjı ile
  let basePrice = '0';
  if (typeof product.price === 'object') {
    if (product.price.withProfit) {
      basePrice = product.price.withProfit.toString();
    } else if (product.price.value) {
      const originalPrice = parseFloat(product.price.value.toString());
      const finalPrice = Math.round(originalPrice * 1.10); // 10% profit
      basePrice = finalPrice.toString();
    }
  } else if (typeof product.price === 'number') {
    const finalPrice = Math.round(product.price * 1.10); // 10% profit
    basePrice = finalPrice.toString();
  } else if (typeof product.price === 'string') {
    const priceMatch = product.price.match(/[\d.,]+/);
    if (priceMatch) {
      const originalPrice = parseFloat(priceMatch[0].replace(',', '.'));
      const finalPrice = Math.round(originalPrice * 1.10); // 10% profit
      basePrice = finalPrice.toString();
    } else {
      basePrice = '0';
    }
  }

  // Görselleri renklerine göre grupla
  const imagesByColor: { [color: string]: string[] } = {};
  const generalImages: string[] = [];
  
  product.images.forEach(img => {
    if (img.colorName) {
      if (!imagesByColor[img.colorName]) {
        imagesByColor[img.colorName] = [];
      }
      imagesByColor[img.colorName].push(img.url);
    } else {
      generalImages.push(img.url);
    }
  });

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
    
    // Enhanced Compare At Price - show original price if profit was added
    let comparePrice = '';
    if (typeof product.price === 'object' && product.price.original) {
      comparePrice = product.price.original.toString();
    } else if (basePrice !== '0') {
      // Calculate original from profit price (reverse calculation)
      const profitPrice = parseFloat(basePrice);
      const originalPrice = Math.round(profitPrice / 1.10).toString();
      comparePrice = originalPrice;
    }
    row.push(comparePrice); // Variant Compare At Price
    row.push('TRUE'); // Variant Requires Shipping
    row.push('TRUE'); // Variant Taxable
    
    // ✅ GÖRSELLER - TÜM SATIRLARDA GÖRSELLERI EKLE
    if (isFirstRow && product.images && product.images.length > 0) {
      // İlk görsel için - Ana ürün görseli
      const firstImage = product.images[0]?.url || '';
      console.log(`📸 CSV: Adding main product image: ${firstImage}`);
      row.push(firstImage); // Image Src
      row.push('1'); // Image Position
      row.push(product.title || 'Product Image'); // Image Alt Text
    } else if (isFirstRow) {
      // İlk satır ama görsel yok
      console.log('⚠️ CSV: No images available for main product');
      row.push(''); // Image Src
      row.push(''); // Image Position  
      row.push(''); // Image Alt Text
    } else {
      // Sonraki satırlar - ek görseller ekleyebiliriz
      const additionalImageIndex = actualVariants.indexOf(variant);
      if (additionalImageIndex < product.images.length && product.images[additionalImageIndex]) {
        const additionalImage = product.images[additionalImageIndex].url;
        console.log(`📸 CSV: Adding additional image ${additionalImageIndex + 1}: ${additionalImage}`);
        row.push(additionalImage); // Image Src
        row.push((additionalImageIndex + 1).toString()); // Image Position
        row.push(`${product.title} - Image ${additionalImageIndex + 1}`); // Image Alt Text
      } else {
        row.push(''); // Image Src
        row.push(''); // Image Position
        row.push(''); // Image Alt Text
      }
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
      if (product.variants.colors.length > 0) parts.push(`${product.variants.colors.length} renk seçeneği`);
      if (product.variants.sizes.length > 0) parts.push(`${product.variants.sizes.length} beden seçeneği`);
      
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

    rows.push(row);
    isFirstRow = false;
  });

  // Kalan görselleri ekle (renk bazında)
  Object.entries(imagesByColor).forEach(([colorName, images]) => {
    images.slice(1).forEach(imageUrl => { // İlk görsel zaten varyant görseli olarak kullanıldı
      const imageRow = Array(headers.length).fill('');
      imageRow[0] = productHandle; // Handle
      imageRow[14] = imageUrl; // Image Src
      imageRow[15] = imagePosition.toString(); // Image Position
      imageRow[16] = `${product.title} - ${colorName}`; // Image Alt Text
      rows.push(imageRow);
      imagePosition++;
    });
  });

  // Genel görselleri ekle (renk bazında olmayan)
  generalImages.slice(1).forEach(imageUrl => {
    const imageRow = Array(headers.length).fill('');
    imageRow[0] = productHandle; // Handle
    imageRow[14] = imageUrl; // Image Src
    imageRow[15] = imagePosition.toString(); // Image Position
    imageRow[16] = product.title; // Image Alt Text
    rows.push(imageRow);
    imagePosition++;
  });

  // CSV formatına dönüştür
  return rows.map(row => 
    row.map(cell => {
      // CSV için özel karakterleri escape et
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');
}