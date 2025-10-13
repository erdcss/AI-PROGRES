/**
 * Shopify CSV Generator V3
 * - Tüm görselleri ekler
 * - Ürün açıklaması içerir
 * - Variant desteği
 */

interface ProductData {
  title: string;
  brand: string;
  price: any;
  images: Array<string | { url: string; colorName?: string }>;
  variants?: {
    colors?: string[];
    sizes?: string[];
    stockMap?: Record<string, boolean>;
    allVariants?: Array<{
      color: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features?: Array<{ key: string; value: string }>;
  tags?: string[];
  category?: string;
  description?: string;
}

export function generateShopifyCSVV3(product: ProductData): string {
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Variant SKU', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Inventory Tracker',
    'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card',
    'SEO Title', 'SEO Description', 'Variant Image', 'Variant Weight Unit', 'Status',
    'Metafield: custom.repli_t_id [single_line_text_field]'
  ];

  const rows: string[][] = [headers];

  // Handle ve temel bilgiler
  const handle = product.title.toLowerCase()
    .replace(/[^a-z0-9ğüşıöçİ\s]/gi, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Fiyat bilgisi
  const price = typeof product.price === 'object' 
    ? (product.price.withProfit || product.price.profitFormatted || product.price.original || 0)
    : product.price || 0;
  
  const comparePrice = typeof product.price === 'object'
    ? (product.price.original || 0)
    : 0;

  // Body HTML - Ürün açıklaması
  let bodyHTML = `<div class="product-details">`;
  bodyHTML += `<p><strong>Marka:</strong> ${product.brand}</p>`;
  
  if (product.description) {
    bodyHTML += `<div class="product-description">`;
    bodyHTML += `<h4>Ürün Açıklaması:</h4>`;
    bodyHTML += `<p>${product.description}</p>`;
    bodyHTML += `</div>`;
  }
  
  if (product.features && product.features.length > 0) {
    bodyHTML += `<div class="product-features">`;
    bodyHTML += `<h4>Özellikler:</h4>`;
    bodyHTML += `<ul>`;
    product.features.forEach(f => {
      bodyHTML += `<li><strong>${f.key}:</strong> ${f.value}</li>`;
    });
    bodyHTML += `</ul></div>`;
  }
  bodyHTML += `</div>`;

  // Görselleri düzenle
  const images = product.images.map(img => 
    typeof img === 'string' ? img : img.url
  );

  // Tracking ID
  const trackingId = `trendyol_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Varyant veya tek ürün
  if (product.variants?.allVariants && product.variants.allVariants.length > 0) {
    // Varyantlı ürün
    product.variants.allVariants.forEach((variant, index) => {
      const isFirstVariant = index === 0;
      
      rows.push([
        handle,
        isFirstVariant ? product.title : '',
        isFirstVariant ? bodyHTML : '',
        isFirstVariant ? product.brand : '',
        isFirstVariant ? (product.category || 'Genel Ürünler') : '',
        isFirstVariant ? (product.tags?.join(', ') || '') : '',
        isFirstVariant ? 'TRUE' : '',
        'Renk',
        variant.color || '',
        'Beden',
        variant.size || '',
        `${handle}-${variant.color}-${variant.size}`.toLowerCase(),
        variant.inStock ? '100' : '0',
        'deny',
        '',
        price.toString(),
        comparePrice.toString(),
        'TRUE',
        'TRUE',
        isFirstVariant && images.length > 0 ? images[0] : '',
        isFirstVariant && images.length > 0 ? '1' : '',
        isFirstVariant && images.length > 0 ? product.title : '',
        'FALSE',
        isFirstVariant ? product.title.substring(0, 60) : '',
        isFirstVariant ? `${product.brand}, ${product.title.substring(0, 100)}` : '',
        '',
        'kg',
        'active',
        isFirstVariant ? trackingId : ''
      ]);
    });
  } else {
    // Tek ürün (varyant yok)
    rows.push([
      handle,
      product.title,
      bodyHTML,
      product.brand,
      product.category || 'Genel Ürünler',
      product.tags?.join(', ') || '',
      'TRUE',
      '',
      '',
      '',
      '',
      handle,
      '0',
      'continue',
      '',
      price.toString(),
      comparePrice.toString(),
      'TRUE',
      'TRUE',
      images.length > 0 ? images[0] : '',
      images.length > 0 ? '1' : '',
      images.length > 0 ? product.title : '',
      'FALSE',
      product.title.substring(0, 60),
      `${product.brand}, ${product.title.substring(0, 100)}`,
      '',
      'kg',
      'active',
      trackingId
    ]);
  }

  // Ek görseller için ayrı satırlar ekle
  if (images.length > 1) {
    images.slice(1).forEach((image, index) => {
      const position = index + 2;
      rows.push([
        handle,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        image,
        position.toString(),
        `${product.title} - Görsel ${position}`,
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ]);
    });
  }

  // CSV formatına çevir
  return rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}
