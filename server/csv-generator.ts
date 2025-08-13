/**
 * Profesyonel CSV Oluşturucu
 * AI-enhanced verilerden Shopify uyumlu CSV dosyaları oluşturur
 */

import { writeFileSync } from 'fs';
import * as path from 'path';

export interface CSVRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Type': string;
  Tags: string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant SKU': string;
  'Variant Inventory Qty': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'Variant Image': string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'SEO Title': string;
  'SEO Description': string;
  'Metafield: custom.repli_t_id [single_line_text_field]': string;
}

/**
 * AI-enhanced ürün verisinden profesyonel CSV oluştur
 */
export function generateProfessionalCSV(productData: any): string {
  const rows: CSVRow[] = [];
  
  // Benzersiz takip ID'si oluştur veya mevcut olanı kullan
  const uniqueTrackingId = productData.uniqueTrackingId || 
    `trendyol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Ana ürün bilgileri
  const baseProduct = {
    Handle: createHandle(productData.title),
    Title: productData.title,
    'Body (HTML)': createHTMLDescription(productData),
    Vendor: productData.brand || 'Unknown',
    'Product Type': productData.aiAnalysis?.category || 'General',
    Tags: createTags(productData),
    'SEO Title': `${productData.title} | ${productData.brand}`,
    'SEO Description': createSEODescription(productData),
    'Metafield: custom.repli_t_id [single_line_text_field]': uniqueTrackingId
  };
  
  // Her renk varyantı için satır oluştur
  productData.colors.forEach((color: any, colorIndex: number) => {
    color.images.slice(0, 5).forEach((image: string, imageIndex: number) => {
      const isMainImage = colorIndex === 0 && imageIndex === 0;
      
      rows.push({
        ...baseProduct,
        'Variant Price': calculateSalePrice(color.price || productData.price),
        'Variant Compare At Price': calculateComparePrice(color.price || productData.price),
        'Variant SKU': `${createHandle(productData.title)}-${color.name}-${Date.now()}`,
        'Variant Inventory Qty': '100',
        'Image Src': image,
        'Image Position': (imageIndex + 1).toString(),
        'Image Alt Text': `${productData.title} ${color.name} görsel ${imageIndex + 1}`,
        'Variant Image': imageIndex === 0 ? image : '',
        'Option1 Name': 'Renk',
        'Option1 Value': color.name,
        'Option2 Name': 'Beden',
        'Option2 Value': 'Standart',
        ...(isMainImage ? baseProduct : {
          Handle: '',
          Title: '',
          'Body (HTML)': '',
          Vendor: '',
          'Product Type': '',
          Tags: '',
          'SEO Title': '',
          'SEO Description': '',
          'Metafield: custom.repli_t_id [single_line_text_field]': ''
        })
      });
    });
  });
  
  // CSV formatına dönüştür
  const csvContent = convertToCSV(rows);
  
  // Dosyaya kaydet
  const filename = `shopify-${createHandle(productData.title)}-${Date.now()}.csv`;
  const filePath = path.join(process.cwd(), 'exports', filename);
  
  try {
    writeFileSync(filePath, csvContent, 'utf8');
    console.log(`✅ CSV dosyası oluşturuldu: ${filename}`);
  } catch (error) {
    console.error('CSV kaydetme hatası:', error);
  }
  
  return csvContent;
}

/**
 * URL-friendly handle oluştur
 */
function createHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

/**
 * HTML açıklama oluştur
 */
function createHTMLDescription(productData: any): string {
  let html = `<div class="product-description">`;
  html += `<h2>${productData.title}</h2>`;
  html += `<p>${productData.description}</p>`;
  
  if (productData.features && productData.features.length > 0) {
    html += `<h3>Ürün Özellikleri:</h3><ul>`;
    productData.features.forEach((feature: any) => {
      html += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    html += `</ul>`;
  }
  
  if (productData.aiAnalysis) {
    html += `<h3>Ürün Detayları:</h3><ul>`;
    html += `<li><strong>Kategori:</strong> ${productData.aiAnalysis.category}</li>`;
    html += `<li><strong>Hedef Kitle:</strong> ${productData.aiAnalysis.targetAudience}</li>`;
    html += `<li><strong>Stil:</strong> ${productData.aiAnalysis.style}</li>`;
    html += `</ul>`;
  }
  
  html += `</div>`;
  return html;
}

/**
 * Etiketler oluştur
 */
function createTags(productData: any): string {
  const tags = [];
  
  if (productData.aiAnalysis) {
    tags.push(productData.aiAnalysis.category);
    tags.push(productData.aiAnalysis.targetAudience);
    tags.push(productData.aiAnalysis.style);
    tags.push(productData.aiAnalysis.season);
  }
  
  tags.push(productData.brand);
  tags.push('Trendyol');
  
  return tags.filter(Boolean).join(', ');
}

/**
 * SEO açıklama oluştur
 */
function createSEODescription(productData: any): string {
  const desc = `${productData.title} - ${productData.brand} markasından kaliteli ürün. `;
  const features = productData.features?.slice(0, 2).map((f: any) => f.value).join(', ') || '';
  return (desc + features).substring(0, 160);
}

/**
 * %10 kar ekleyerek satış fiyatı hesapla
 */
function calculateSalePrice(price: string): string {
  const numPrice = parseFloat(price.replace(',', '.'));
  return (numPrice * 1.10).toFixed(2); // %10 kar eklendi
}

/**
 * Karşılaştırma fiyatı hesapla (%20 daha yüksek)
 */
function calculateComparePrice(price: string): string {
  const numPrice = parseFloat(price.replace(',', '.'));
  return (numPrice * 1.2).toFixed(2);
}

/**
 * Array'i CSV formatına dönüştür
 */
function convertToCSV(rows: CSVRow[]): string {
  if (rows.length === 0) return '';
  
  const headers = Object.keys(rows[0]);
  const csvRows = [headers];
  
  rows.forEach(row => {
    const values = headers.map(header => {
      const value = row[header as keyof CSVRow];
      // CSV için değerleri escape et
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values);
  });
  
  return csvRows.map(row => row.join(',')).join('\n');
}