import { writeFileSync } from 'fs';
import path from 'path';

interface VariantCSVRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Type': string;
  Tags: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Variant SKU': string;
  'Variant Grams': string;
  'Variant Inventory Tracker': string;
  'Variant Inventory Qty': string;
  'Variant Inventory Policy': string;
  'Variant Fulfillment Service': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant Requires Shipping': string;
  'Variant Taxable': string;
  'Variant Barcode': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'Gift Card': string;
  'SEO Title': string;
  'SEO Description': string;
  'Variant Image': string;
  'Variant Weight Unit': string;
  'Variant Tax Code': string;
  'Cost per item': string;
  'Google Shopping / Custom Label 0': string;
  'Google Shopping / Custom Label 1': string;
  'Google Shopping / Custom Label 2': string;
}

/**
 * Varyant bazlı CSV oluşturma
 */
export function generateVariantCSV(productData: any): { csvContent: string; filename: string; totalVariants: number; preview: any[] } {
  console.log('📊 Varyant bazlı CSV oluşturuluyor...');
  
  const handle = createHandle(productData.title);
  const htmlDescription = createHTMLDescription(productData);
  const tags = createTags(productData);
  const seoDescription = createSEODescription(productData);
  
  const baseProduct = {
    Handle: handle,
    Title: productData.title,
    'Body (HTML)': htmlDescription,
    Vendor: productData.brand || 'Bilinmeyen Marka',
    'Product Type': 'Giyim',
    Tags: tags,
    'Variant Grams': '',
    'Variant Inventory Tracker': 'shopify',
    'Variant Inventory Policy': 'continue',
    'Variant Fulfillment Service': 'manual',
    'Variant Requires Shipping': 'TRUE',
    'Variant Taxable': 'TRUE',
    'Variant Barcode': '',
    'Gift Card': 'FALSE',
    'SEO Title': productData.title,
    'SEO Description': seoDescription,
    'Variant Weight Unit': 'kg',
    'Variant Tax Code': ''
  };

  const rows: VariantCSVRow[] = [];
  let isFirstRow = true;

  // Stock matrix'ten varyantları işle
  if (productData.variants?.stockMatrix) {
    const stockMatrix = productData.variants.stockMatrix;
    
    Object.entries(stockMatrix).forEach(([combination, variant]: [string, any], index) => {
      if (!variant.inStock) return; // Sadece stokta olanlar
      
      const imageIndex = Math.min(index, (productData.images?.length || 1) - 1);
      const variantImage = productData.images?.[imageIndex] || '';
      
      // Varyant fiyatı hesaplama (originalPrice varsa onu kullan, yoksa default fiyat)
      const originalPrice = variant.originalPrice || productData.price;
      const basePrice = parseFloat(originalPrice.toString().replace(/[^\d.]/g, ''));
      const finalPrice = Math.round(basePrice * 1.10); // %10 kar
      const comparePrice = Math.round(basePrice * 1.25); // %25 yüksek karşılaştırma fiyatı
      const costPrice = Math.round(basePrice * 0.80); // %20 düşük maliyet fiyatı
      
      const row: VariantCSVRow = {
        ...baseProduct,
        'Option1 Name': 'Renk',
        'Option1 Value': variant.color || variant.colorName || 'Standart',
        'Option2 Name': 'Beden',
        'Option2 Value': variant.size || variant.sizeName || 'Standart',
        'Variant SKU': variant.sku || `${handle}-${combination}`,
        'Variant Inventory Qty': variant.stockCount?.toString() || '1',
        'Variant Price': finalPrice.toString(),
        'Variant Compare At Price': comparePrice.toString(),
        'Image Src': variantImage,
        'Image Position': (index + 1).toString(),
        'Image Alt Text': `${productData.title} - ${variant.color || variant.colorName}`,
        'Variant Image': index === 0 ? variantImage : '',
        'Cost per item': costPrice.toString(),
        'Google Shopping / Custom Label 0': `Orijinal: ${originalPrice}₺`,
        'Google Shopping / Custom Label 1': `Kar: %10`,
        'Google Shopping / Custom Label 2': `Stok: ${variant.stockCount || 1}`
      };

      // İlk satır dışındakiler için boş alanlar
      if (!isFirstRow) {
        row.Handle = '';
        row.Title = '';
        row['Body (HTML)'] = '';
        row.Vendor = '';
        row['Product Type'] = '';
        row.Tags = '';
        row['SEO Title'] = '';
        row['SEO Description'] = '';
      }
      
      rows.push(row);
      isFirstRow = false;
    });
  }

  // ❌ SAHTE VARYANT FALLBACK ENGELLENDI - Gerçek varyant yoksa tek ürün
  if (rows.length === 0) {
    const colors = productData.variants?.colors || [{ name: 'Standart' }];
    const sizes: string[] = []; // No fake size fallback
    
    colors.forEach((color: any) => {
      sizes.forEach((size: string, index: number) => {
        const basePrice = parseFloat(productData.price.toString().replace(/[^\d.]/g, ''));
        const finalPrice = Math.round(basePrice * 1.10);
        const comparePrice = Math.round(basePrice * 1.25);
        const costPrice = Math.round(basePrice * 0.80);
        
        const row: VariantCSVRow = {
          ...baseProduct,
          'Option1 Name': 'Renk',
          'Option1 Value': color.name,
          'Option2 Name': 'Beden',
          'Option2 Value': size,
          'Variant SKU': `${handle}-${color.name.toLowerCase()}-${size.toLowerCase()}`,
          'Variant Inventory Qty': '10',
          'Variant Price': finalPrice.toString(),
          'Variant Compare At Price': comparePrice.toString(),
          'Image Src': productData.images?.[0] || '',
          'Image Position': (index + 1).toString(),
          'Image Alt Text': `${productData.title} - ${color.name}`,
          'Variant Image': index === 0 ? productData.images?.[0] || '' : '',
          'Cost per item': costPrice.toString(),
          'Google Shopping / Custom Label 0': `Orijinal: ${basePrice}₺`,
          'Google Shopping / Custom Label 1': `Kar: %10`,
          'Google Shopping / Custom Label 2': `Stok: 10`
        };

        if (index > 0) {
          row.Handle = '';
          row.Title = '';
          row['Body (HTML)'] = '';
          row.Vendor = '';
          row['Product Type'] = '';
          row.Tags = '';
          row['SEO Title'] = '';
          row['SEO Description'] = '';
        }
        
        rows.push(row);
      });
    });
  }

  const csvContent = convertToCSV(rows);
  const filename = `shopify-variants-${handle}-${Date.now()}.csv`;
  const filePath = path.join(process.cwd(), 'exports', filename);

  try {
    writeFileSync(filePath, csvContent, 'utf8');
    console.log(`✅ Varyant CSV dosyası oluşturuldu: ${filename}`);
  } catch (error) {
    console.error('CSV kaydetme hatası:', error);
  }

  return {
    csvContent,
    filename,
    totalVariants: rows.length,
    preview: rows.slice(0, 3) // İlk 3 satırı önizleme için
  };
}

function createHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

function createHTMLDescription(productData: any): string {
  let html = `<div class="product-description">`;
  html += `<h2>${productData.title}</h2>`;
  html += `<p>${productData.description}</p>`;
  
  if (productData.features?.length > 0) {
    html += `<h3>Ürün Özellikleri:</h3><ul>`;
    productData.features.slice(0, 8).forEach((feature: any) => {
      html += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    html += `</ul>`;
  }
  
  html += `</div>`;
  return html;
}

function createTags(productData: any): string {
  const tags = [
    productData.brand,
    'Trendyol',
    'Giyim',
    'Moda'
  ];
  
  if (productData.variants?.colors?.length > 0) {
    productData.variants.colors.forEach((color: any) => {
      tags.push(color.name);
    });
  }
  
  return tags.filter(Boolean).join(', ');
}

function createSEODescription(productData: any): string {
  const desc = `${productData.title} - ${productData.brand} markasından kaliteli ürün. `;
  const features = productData.features?.slice(0, 2).map((f: any) => f.value).join(', ') || '';
  return (desc + features).substring(0, 160);
}

function convertToCSV(rows: VariantCSVRow[]): string {
  if (rows.length === 0) return '';
  
  const headers = Object.keys(rows[0]);
  const csvRows = [headers];
  
  rows.forEach(row => {
    const values = headers.map(header => {
      const value = row[header as keyof VariantCSVRow];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values);
  });
  
  return csvRows.map(row => row.join(',')).join('\n');
}