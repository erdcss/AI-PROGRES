/**
 * Final Shopify CSV Export - Doğru format
 */

import { join } from "path";
import fs from "fs";

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

// Veri dönüştürme fonksiyonu
function convertToStrictFormat(data: FocusedProductData): any {
  const strictVariants = data.variants.map(variant => ({
    color: variant.color || 'Koyu Mavi',
    size: variant.size,
    stock: variant.inStock ? 25 : 0,
    price: data.price.original,
    images: data.images // Tüm görselleri her varyanta at
  }));

  return {
    title: data.title,
    brand: data.brand,
    variants: strictVariants
  };
}

export async function exportToShopifyCSV(data: FocusedProductData): Promise<{ success: boolean; csvPath?: string; error?: string }> {
  try {
    console.log('📊 Shopify CSV export başlatılıyor...');
    
    if (!data || !data.title) {
      throw new Error('Geçersiz ürün verisi');
    }

    const rows: string[][] = [];

    // Handle oluşturma
    const handle = data.title.toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    console.log(`📝 Handle: ${handle}`);

    // Ürün açıklaması
    let description = `<div class="product-description"><h2>${data.title}</h2>`;
    if (data.features && data.features.length > 0) {
      description += '<h3>Ürün Özellikleri</h3><ul>';
      data.features.forEach(feature => {
        description += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
      });
      description += '</ul>';
    }
    description += `<h3>Marka</h3><p><strong>${data.brand}</strong> kalitesi ile tasarlanmış ürün.</p>`;
    if (data.sizeOptions && data.sizeOptions.length > 0) {
      description += `<h3>Beden Seçenekleri</h3><p>Mevcut bedenler: <strong>${data.sizeOptions.join(', ')}</strong></p>`;
    }
    description += '<h3>Kargo ve İade</h3><ul><li>Ücretsiz kargo (150 TL üzeri)</li><li>30 gün iade garantisi</li></ul></div>';

    // SEO ve etiketler
    const seoTitle = `${data.title} | ${data.brand} | En İyi Fiyat`;
    const seoDescription = `${data.brand} ${data.title} - ${data.price.profitFormatted}. Ücretsiz kargo.`;
    const tags = [data.brand.toLowerCase(), 'giyim', 'moda', 'stil'].join(';');

    // Shopify CSV başlıkları
    const headers = [
      'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
      'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
      'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
      'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
      'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position',
      'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
      'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
      'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels', 'Google Shopping / Condition',
      'Google Shopping / Custom Product', 'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
      'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3', 'Google Shopping / Custom Label 4',
      'Variant Image', 'Variant Weight Unit', 'Variant Tax Code', 'Cost per item', 'Status'
    ];

    // Use strict CSV generator
    console.log(`🔄 Generating strict CSV with ${data.variants.length} variants...`);
    
    const { generateStrictCSV } = await import('./strict-csv-generator-final');
    const strictData = convertToStrictFormat(data);
    const result = generateStrictCSV(strictData);
    
    if (!result.success) {
      throw new Error(`Strict CSV generation failed: ${result.validationErrors.join(', ')}`);
    }
    
    console.log(`✅ Strict CSV generated: ${result.rowCount} rows`);
    
    // CSV dosyasını yazma
    const csvPath = join(process.cwd(), 'exports', result.filename);
    
    // Exports klasörünü oluştur
    const exportsDir = join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    fs.writeFileSync(csvPath, result.content, 'utf8');

    console.log(`✅ Shopify CSV created: ${csvPath}`);
    console.log(`📊 Total rows: ${result.rowCount + 1} (with header)`);
    console.log(`🎯 Option1 Name 'Renk' and Option2 Name 'Beden' in every row`);

    return { success: true, csvPath };


  } catch (error) {
    console.error('❌ Shopify CSV export hatası:', error);
    return { success: false, error: error.message };
  }
}