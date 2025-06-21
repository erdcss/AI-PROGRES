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

    if (data.variants && data.variants.length > 0) {
      console.log(`🔄 ${data.variants.length} varyant işleniyor...`);

      // İLK SATIR: Ana ürün + ilk varyant
      const firstVariant = data.variants[0];
      const firstSku = `${handle}-${firstVariant.color.toLowerCase().replace(/\s+/g, '-')}-${firstVariant.size}`;
      
      rows.push([
        handle, // Handle
        data.title, // Title
        description, // Body (HTML)
        data.brand, // Vendor
        data.category || 'Apparel & Accessories', // Product Category
        'Giyim', // Type
        tags, // Tags
        'TRUE', // Published
        'Renk', // Option1 Name
        firstVariant.color, // Option1 Value
        'Beden', // Option2 Name
        firstVariant.size, // Option2 Value
        '', // Option3 Name
        '', // Option3 Value
        firstSku, // Variant SKU
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
        data.images[0] || '', // Image Src
        '1', // Image Position
        data.title, // Image Alt Text
        'FALSE', // Gift Card
        seoTitle, // SEO Title
        seoDescription, // SEO Description
        data.category || 'Apparel & Accessories', // Google Shopping Category
        'Unisex', // Google Shopping Gender
        'Adult', // Google Shopping Age Group
        firstSku, // Google Shopping MPN
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

      // DİĞER VARYANTLAR: Sadece varyant bilgileri
      for (let i = 1; i < data.variants.length; i++) {
        const variant = data.variants[i];
        const variantSku = `${handle}-${variant.color.toLowerCase().replace(/\s+/g, '-')}-${variant.size}`;
        
        const variantRow = new Array(headers.length).fill('');
        variantRow[8] = 'Renk'; // Option1 Name
        variantRow[9] = variant.color; // Option1 Value
        variantRow[10] = 'Beden'; // Option2 Name
        variantRow[11] = variant.size; // Option2 Value
        variantRow[14] = variantSku; // Variant SKU
        variantRow[15] = '250'; // Variant Grams
        variantRow[16] = 'shopify'; // Variant Inventory Tracker
        variantRow[17] = variant.inStock ? '25' : '0'; // Variant Inventory Qty
        variantRow[18] = 'continue'; // Variant Inventory Policy
        variantRow[19] = 'manual'; // Variant Fulfillment Service
        variantRow[20] = data.price.withProfit.toString(); // Variant Price
        variantRow[21] = data.price.original.toString(); // Variant Compare At Price
        variantRow[22] = 'TRUE'; // Variant Requires Shipping
        variantRow[23] = 'TRUE'; // Variant Taxable
        variantRow[45] = 'kg'; // Variant Weight Unit
        variantRow[47] = 'active'; // Status
        
        rows.push(variantRow);
      }

      // EK GÖRSELLER: Sadece görsel satırları
      if (data.images && data.images.length > 1) {
        for (let i = 1; i < data.images.length; i++) {
          const imageRow = new Array(headers.length).fill('');
          imageRow[25] = data.images[i]; // Image Src
          imageRow[26] = (i + 1).toString(); // Image Position
          imageRow[27] = data.title; // Image Alt Text
          rows.push(imageRow);
        }
      }
    }

    // CSV dosyasını yazma
    const csvPath = join(process.cwd(), 'exports', `${handle}-shopify.csv`);
    
    // Exports klasörünü oluştur
    const exportsDir = join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // CSV content oluşturma
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    fs.writeFileSync(csvPath, csvContent, 'utf8');

    console.log(`✅ Shopify CSV dosyası oluşturuldu: ${csvPath}`);
    console.log(`📊 Toplam satır: ${rows.length + 1} (başlık dahil)`);
    console.log(`📸 Toplam görsel: ${data.images?.length || 0}`);
    console.log(`🎯 CSV yapısı: Ana ürün (1. satır) + ${data.variants.length - 1} varyant + ${(data.images?.length || 1) - 1} görsel`);

    return { success: true, csvPath };
  } catch (error) {
    console.error('❌ Shopify CSV export hatası:', error);
    return { success: false, error: error.message };
  }
}