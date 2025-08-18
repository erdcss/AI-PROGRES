/**
 * Comprehensive CSV Generator with Full Feature Integration
 * Includes all extracted product features in organized format
 */

export interface ComprehensiveProductData {
  title: string;
  brand: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
    withProfit: number;
    profitFormatted: string;
  };
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
  }>;
  description?: string;
  category?: string;
  sku?: string;
}

export function generateComprehensiveShopifyCSV(product: ComprehensiveProductData): string {
  // Enhanced headers with feature columns
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
    'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 
    'SEO Title', 'SEO Description', 'Variant Image', 'Variant Weight Unit', 'Status',
    'Product Features', 'Product Category', 'Product Material', 'Product Color',
    'Product Size', 'Product Brand', 'Product Model', 'Product SKU',
    'Product Description', 'Additional Properties', 'Meta Keywords', 'Product Type'
  ];

  const rows: string[][] = [];
  rows.push(headers);

  // Create handle from title
  const productHandle = product.title.toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Extract specific features for CSV columns
  const featureMap = new Map<string, string>();
  product.features.forEach(feature => {
    featureMap.set(feature.key.toLowerCase(), feature.value);
  });

  // Feature mapping for CSV columns
  const getFeatureValue = (keys: string[]): string => {
    for (const key of keys) {
      if (featureMap.has(key.toLowerCase())) {
        return featureMap.get(key.toLowerCase()) || '';
      }
    }
    return '';
  };

  // Extract categorized features
  const productCategory = getFeatureValue(['kategori', 'category', 'product type', 'ürün tipi']);
  const productMaterial = getFeatureValue(['malzeme', 'material', 'fabric', 'kumaş']);
  const productColor = getFeatureValue(['renk', 'color', 'colour']);
  const productSize = getFeatureValue(['beden', 'size', 'boyut']);
  const productModel = getFeatureValue(['model', 'model no', 'model numarası']);
  const productSku = getFeatureValue(['sku', 'product code', 'ürün kodu']);

  // Create comprehensive features text
  const featuresText = product.features.length > 0 ? 
    product.features.map(f => `${f.key}: ${f.value}`).join(' | ') : 'Özellik bilgisi mevcut değil';

  // Create additional properties (less common features)
  const mainFeatureKeys = ['kategori', 'malzeme', 'renk', 'beden', 'model', 'sku', 'marka', 'açıklama'];
  const additionalFeatures = product.features.filter(f => 
    !mainFeatureKeys.some(key => f.key.toLowerCase().includes(key))
  );
  const additionalProperties = additionalFeatures.length > 0 ?
    additionalFeatures.map(f => `${f.key}: ${f.value}`).join(' | ') : '';

  // Generate meta keywords from features
  const metaKeywords = product.features
    .filter(f => f.key.toLowerCase().includes('anahtar') || f.key.toLowerCase().includes('keyword'))
    .map(f => f.value)
    .join(', ') || 
    [product.brand, productCategory, productMaterial, productColor].filter(Boolean).join(', ');

  // Create comprehensive HTML body
  let bodyHTML = `<div class="product-info">
    <h3>${product.title}</h3>
    <p><strong>Marka:</strong> ${product.brand}</p>
    <p><strong>Fiyat:</strong> ${product.price.formatted}</p>
  `;

  if (product.description) {
    bodyHTML += `<div class="product-description">
      <h4>Ürün Açıklaması:</h4>
      <p>${product.description}</p>
    </div>`;
  }

  if (product.features.length > 0) {
    bodyHTML += '<div class="product-features"><h4>Ürün Özellikleri:</h4><ul>';
    product.features.forEach(feature => {
      bodyHTML += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    bodyHTML += '</ul></div>';
  }

  bodyHTML += '</div>';

  // Generate variants or default entries
  const variants = product.variants.length > 0 ? product.variants : [
    { color: 'Varsayılan', colorCode: '#CCCCCC', size: 'Standart', inStock: true }
  ];

  // Generate CSV rows - Handle empty images array with fallback
  if (product.images.length === 0) {
    console.log('⚠️ No images found - adding default product row without images');
    // Create a single row for the product without images
    variants.forEach((variant, index) => {
      const isFirstVariant = index === 0;
      
      rows.push([
        productHandle,                                    // Handle
        isFirstVariant ? product.title : '',             // Title
        isFirstVariant ? bodyHTML : '',                  // Body (HTML)
        isFirstVariant ? product.brand : '',             // Vendor
        isFirstVariant ? `${product.brand.toLowerCase()}, ${productCategory.toLowerCase()}, ${productMaterial.toLowerCase()}`.replace(/,\s*,/g, ',').replace(/^,|,$/g, '') : '', // Tags
        isFirstVariant ? 'TRUE' : '',                    // Published
        isFirstVariant ? 'Renk' : '',                    // Option1 Name
        variant.color,                                   // Option1 Value
        isFirstVariant ? 'Beden' : '',                   // Option2 Name
        variant.size,                                    // Option2 Value
        `${productHandle}-${variant.color}-${variant.size}`.toLowerCase(), // Variant SKU
        variant.inStock ? '10' : '0',                    // Variant Inventory Qty
        product.price.withProfit.toString(),             // Variant Price
        product.price.original.toString(),               // Variant Compare At Price
        '',                                              // Image Src (empty for no images)
        '',                                              // Image Position
        `${product.title} - ${variant.color}`,          // Image Alt Text
        'FALSE',                                         // Gift Card
        isFirstVariant ? product.title : '',            // SEO Title
        isFirstVariant ? featuresText.substring(0, 160) : '', // SEO Description
        '',                                              // Variant Image
        'kg',                                            // Variant Weight Unit
        'active',                                        // Status
        isFirstVariant ? featuresText : '',             // Product Features
        isFirstVariant ? productCategory : '',          // Product Category
        isFirstVariant ? productMaterial : '',          // Product Material
        isFirstVariant ? productColor : '',             // Product Color
        isFirstVariant ? productSize : '',              // Product Size
        isFirstVariant ? product.brand : '',            // Product Brand
        isFirstVariant ? productModel : '',             // Product Model
        isFirstVariant ? productSku : '',               // Product SKU
        isFirstVariant ? product.description || '' : '', // Product Description
        isFirstVariant ? additionalProperties : '',     // Additional Properties
        isFirstVariant ? metaKeywords : '',             // Meta Keywords
        isFirstVariant ? productCategory : ''           // Product Type
      ]);
    });
  } else {
    // 🖼️ FIXED IMAGE PROCESSING: Proper handling for products with images
    console.log(`📸 COMPREHENSIVE CSV: Processing ${product.images.length} images for ${variants.length} variants`);
    
    variants.forEach((variant, index) => {
      // Only process each variant once, then add images separately
      const isFirstVariant = index === 0;
      
      // Add main variant row with first image
      rows.push([
        productHandle,                                    // Handle
        isFirstVariant ? product.title : '',             // Title
        isFirstVariant ? bodyHTML : '',                  // Body (HTML)
        isFirstVariant ? product.brand : '',             // Vendor
        isFirstVariant ? `${product.brand.toLowerCase()}, ${productCategory.toLowerCase()}, ${productMaterial.toLowerCase()}`.replace(/,\s*,/g, ',').replace(/^,|,$/g, '') : '', // Tags
        isFirstVariant ? 'TRUE' : '',                    // Published
        isFirstVariant ? 'Renk' : '',                    // Option1 Name
        variant.color,                                   // Option1 Value
        isFirstVariant ? 'Beden' : '',                   // Option2 Name
        variant.size,                                    // Option2 Value
        `${productHandle}-${variant.color}-${variant.size}`.toLowerCase(), // Variant SKU
        variant.inStock ? '10' : '0',                    // Variant Inventory Qty
        product.price.withProfit.toString(),             // Variant Price
        product.price.original.toString(),               // Variant Compare At Price
        isFirstVariant && product.images.length > 0 ? product.images[0] : '', // Image Src - First image only for first variant
        isFirstVariant && product.images.length > 0 ? '1' : '',              // Image Position
        isFirstVariant && product.images.length > 0 ? `${product.title} - ${variant.color}` : '', // Image Alt Text
        'FALSE',                                         // Gift Card
        isFirstVariant ? product.title : '',            // SEO Title
        isFirstVariant ? featuresText.substring(0, 160) : '', // SEO Description
        isFirstVariant && product.images.length > 0 ? product.images[0] : '', // Variant Image
        'kg',                                            // Variant Weight Unit
        'active',                                        // Status
        isFirstVariant ? featuresText : '',             // Product Features
        isFirstVariant ? productCategory : '',          // Product Category
        isFirstVariant ? productMaterial : '',          // Product Material
        isFirstVariant ? productColor : '',             // Product Color
        isFirstVariant ? productSize : '',              // Product Size
        isFirstVariant ? product.brand : '',            // Product Brand
        isFirstVariant ? productModel : '',             // Product Model
        isFirstVariant ? productSku : '',               // Product SKU
        isFirstVariant ? product.description || '' : '', // Product Description
        isFirstVariant ? additionalProperties : '',     // Additional Properties
        isFirstVariant ? metaKeywords : '',             // Meta Keywords
        isFirstVariant ? productCategory : ''           // Product Type
      ]);
    });

    // 🖼️ Now add all additional images as separate rows (skip first image since it's already used)
    if (product.images.length > 1) {
      console.log(`📸 Adding ${product.images.length - 1} additional image rows`);
      
      product.images.slice(1).forEach((image, imgIndex) => {
        const imagePosition = imgIndex + 2; // +2 because first image is position 1
        console.log(`📸 Adding image ${imagePosition}: ${image}`);
        
        rows.push([
          productHandle,                                    // Handle
          '',                                              // Title
          '',                                              // Body (HTML)
          '',                                              // Vendor
          '',                                              // Tags
          '',                                              // Published
          '',                                              // Option1 Name
          '',                                              // Option1 Value
          '',                                              // Option2 Name
          '',                                              // Option2 Value
          '',                                              // Variant SKU
          '',                                              // Variant Inventory Qty
          '',                                              // Variant Price
          '',                                              // Variant Compare At Price
          image,                                           // Image Src
          imagePosition.toString(),                        // Image Position
          `${product.title} - Görsel ${imagePosition}`,    // Image Alt Text
          '',                                              // Gift Card
          '',                                              // SEO Title
          '',                                              // SEO Description
          '',                                              // Variant Image
          '',                                              // Variant Weight Unit
          '',                                              // Status
          '',                                              // Product Features
          '',                                              // Product Category
          '',                                              // Product Material
          '',                                              // Product Color
          '',                                              // Product Size
          '',                                              // Product Brand
          '',                                              // Product Model
          '',                                              // Product SKU
          '',                                              // Product Description
          '',                                              // Additional Properties
          '',                                              // Meta Keywords
          ''                                               // Product Type
        ]);
      });
    }
    
  }

  // Convert to CSV format
  const csvContent = rows.map(row => 
    row.map(cell => {
      // Ensure cell is string before calling replace
      const cellStr = cell !== null && cell !== undefined ? String(cell) : '';
      return `"${cellStr.replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');

  return csvContent;
}

export function generateFeatureSummary(product: ComprehensiveProductData): string {
  let summary = `\n=== ÜRÜN ÖZELLİKLERİ ÖZETİ ===\n`;
  summary += `Ürün: ${product.title}\n`;
  summary += `Marka: ${product.brand}\n`;
  summary += `Fiyat: ${product.price.formatted}\n`;
  summary += `Toplam Özellik: ${product.features.length}\n`;
  summary += `Toplam Görsel: ${product.images.length}\n`;
  summary += `Toplam Varyant: ${product.variants.length}\n\n`;

  if (product.features.length > 0) {
    summary += `=== ÇIKARILAN ÖZELLİKLER ===\n`;
    product.features.forEach((feature, index) => {
      summary += `${index + 1}. ${feature.key}: ${feature.value}\n`;
    });
  }

  return summary;
}