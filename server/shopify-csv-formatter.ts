/**
 * Shopify CSV Formatter - Doğru CSV yapısı için
 * Ana ürün satırında tüm bilgiler, varyantlar ayrı satırlarda
 */

export interface FocusedProductData {
  brand: string;
  title: string;
  price: {
    original: number;
    withProfit: number;
    formatted: string;
    profitFormatted: string;
  };
  images: string[];
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
  features: Array<{
    key: string;
    value: string;
  }>;
  category: string;
  sizeOptions: string[];
  colorOptions: string[];
}

export function formatShopifyCSV(data: FocusedProductData): string[][] {
  // Handle oluşturma
  const handle = data.title.toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Ürün açıklaması
  const description = createProductDescription(data);
  
  // SEO ve etiketler
  const seoTitle = `${data.title} | ${data.brand} | En İyi Fiyat`;
  const seoDescription = `${data.brand} ${data.title} - ${data.price.profitFormatted}. Ücretsiz kargo. ${data.sizeOptions.length} beden seçeneği.`;
  const tags = createProductTags(data);
  
  const rows: string[][] = [];
  
  // Ana ürün satırı - ilk varyant ile birlikte
  if (data.variants && data.variants.length > 0) {
    const firstVariant = data.variants[0];
    const variantSku = `${handle}-${firstVariant.color.toLowerCase().replace(/\s+/g, '-')}-${firstVariant.size}`;
    
    rows.push([
      handle, // Handle
      data.title, // Title
      description, // Body (HTML)
      data.brand, // Vendor
      data.category, // Product Category
      'Giyim', // Type
      tags, // Tags
      'TRUE', // Published
      'Renk', // Option1 Name
      firstVariant.color, // Option1 Value
      'Beden', // Option2 Name
      firstVariant.size, // Option2 Value
      '', // Option3 Name
      '', // Option3 Value
      variantSku, // Variant SKU
      '250', // Variant Grams
      'shopify', // Variant Inventory Tracker
      firstVariant.inStock ? '25' : '0', // Variant Inventory Qty
      'continue', // Variant Inventory Policy
      'manual', // Variant Fulfillment Service
      data.price.withProfit.toString(), // Variant Price
      data.price.original.toString(), // Variant Compare At Price
      'TRUE', // Variant Requires Shipping
      'TRUE', // Variant Taxable
      '', // Variant Barcode
      data.images[0] || '', // Image Src - İlk görsel
      '1', // Image Position
      data.title, // Image Alt Text
      'FALSE', // Gift Card
      seoTitle, // SEO Title
      seoDescription, // SEO Description
      data.category, // Google Shopping Category
      'Unisex', // Google Shopping Gender
      'Adult', // Google Shopping Age Group
      variantSku, // Google Shopping MPN
      data.brand, // Google Shopping AdWords Grouping
      tags.split(';').slice(0, 3).join(','), // Google Shopping AdWords Labels
      'New', // Google Shopping Condition
      'FALSE', // Google Shopping Custom Product
      data.brand, // Google Shopping Custom Label 0
      'Giyim', // Google Shopping Custom Label 1
      data.price.profitFormatted, // Google Shopping Custom Label 2
      'Trendyol', // Google Shopping Custom Label 3
      new Date().getFullYear().toString(), // Google Shopping Custom Label 4
      '', // Variant Image
      'kg', // Variant Weight Unit
      '', // Variant Tax Code
      data.price.original.toString(), // Cost per item
      'active' // Status
    ]);
  }
  
  // Kalan varyantlar - sadece varyant bilgileri
  if (data.variants && data.variants.length > 1) {
    data.variants.slice(1).forEach((variant) => {
      const variantSku = `${handle}-${variant.color.toLowerCase().replace(/\s+/g, '-')}-${variant.size}`;
      
      rows.push([
        '', // Handle - boş
        '', // Title - boş
        '', // Body - boş
        '', // Vendor - boş
        '', // Product Category - boş
        '', // Type - boş
        '', // Tags - boş
        '', // Published - boş
        'Renk', // Option1 Name
        variant.color, // Option1 Value
        'Beden', // Option2 Name
        variant.size, // Option2 Value
        '', // Option3 Name
        '', // Option3 Value
        variantSku, // Variant SKU
        '250', // Variant Grams
        'shopify', // Variant Inventory Tracker
        variant.inStock ? '25' : '0', // Variant Inventory Qty
        'continue', // Variant Inventory Policy
        'manual', // Variant Fulfillment Service
        data.price.withProfit.toString(), // Variant Price
        data.price.original.toString(), // Variant Compare At Price
        'TRUE', // Variant Requires Shipping
        'TRUE', // Variant Taxable
        '', // Variant Barcode
        '', // Image Src - boş
        '', // Image Position - boş
        '', // Image Alt Text - boş
        '', // Gift Card - boş
        '', // SEO Title - boş
        '', // SEO Description - boş
        '', // Google Shopping Category - boş
        '', // Google Shopping Gender - boş
        '', // Google Shopping Age Group - boş
        '', // Google Shopping MPN - boş
        '', // Google Shopping AdWords Grouping - boş
        '', // Google Shopping AdWords Labels - boş
        '', // Google Shopping Condition - boş
        '', // Google Shopping Custom Product - boş
        '', // Google Shopping Custom Label 0 - boş
        '', // Google Shopping Custom Label 1 - boş
        '', // Google Shopping Custom Label 2 - boş
        '', // Google Shopping Custom Label 3 - boş
        '', // Google Shopping Custom Label 4 - boş
        '', // Variant Image - boş
        '', // Variant Weight Unit - boş
        '', // Variant Tax Code - boş
        '', // Cost per item - boş
        '' // Status - boş
      ]);
    });
  }
  
  // Ek görseller - sadece görsel satırları
  if (data.images && data.images.length > 1) {
    data.images.slice(1).forEach((imageUrl, index) => {
      rows.push([
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', // 25 boş alan
        imageUrl, // Image Src
        (index + 2).toString(), // Image Position
        data.title, // Image Alt Text
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '' // Kalan alanlar boş
      ]);
    });
  }
  
  return rows;
}

function createProductDescription(data: FocusedProductData): string {
  let description = `<div class="product-description">`;
  description += `<h2>${data.title}</h2>`;
  
  if (data.features && data.features.length > 0) {
    description += '<h3>Ürün Özellikleri</h3><ul>';
    data.features.forEach(feature => {
      description += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    description += '</ul>';
  }
  
  description += `<h3>Marka</h3><p><strong>${data.brand}</strong> kalitesi ile tasarlanmış ürün.</p>`;
  
  if (data.sizeOptions && data.sizeOptions.length > 0) {
    description += '<h3>Beden Seçenekleri</h3>';
    description += `<p>Mevcut bedenler: <strong>${data.sizeOptions.join(', ')}</strong></p>`;
  }
  
  description += '<h3>Kargo ve İade</h3>';
  description += '<ul><li>Ücretsiz kargo (150 TL üzeri)</li><li>30 gün iade garantisi</li></ul>';
  description += '</div>';
  
  return description;
}

function createProductTags(data: FocusedProductData): string {
  const tags = [
    data.brand.toLowerCase(),
    'giyim', 'moda', 'stil', 'kalite',
    data.category.split(' > ').pop()?.toLowerCase(),
    'yeni sezon', 'trend'
  ].filter(Boolean);
  
  return [...new Set(tags)].join(';');
}