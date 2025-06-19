import fs from 'fs';
import path from 'path';
import { TrendyolVariant, VariantImageMap } from './trendyol-variant-extractor';

interface ShopifyVariantRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  Type: string;
  Tags: string;
  Published: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Variant SKU': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'Variant Inventory Tracker': string;
  'Variant Inventory Qty': string;
  'Variant Inventory Policy': string;
  'Variant Fulfillment Service': string;
  'Variant Requires Shipping': string;
  'Variant Taxable': string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function escapeCSVValue(value: string): string {
  if (!value) return '';
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

export async function generateSimpleShopifyCSV(
  variants: TrendyolVariant[],
  imageMap: VariantImageMap,
  productTitle: string,
  filename: string = 'shopify-variants.csv'
): Promise<void> {
  try {
    // Write directly to main directory as suggested
    const csvRows: string[] = [];
    
    // Simple CSV header as per user's Python code
    const headers = [
      'Handle', 'Title', 'Option1 Name', 'Option1 Value',
      'Option2 Name', 'Option2 Value', 'Variant Price', 'Image Src'
    ];
    
    csvRows.push(headers.map(h => escapeCSVValue(h)).join(','));

    const handle = slugify(productTitle);

    // Generate rows for each variant
    variants.forEach((variant) => {
      const color = variant.color || '-';
      const size = variant.size || '-';
      const price = variant.price || '0.00';
      
      // Get variant image
      const colorKey = color.toLowerCase();
      let imageUrl = '';
      if (imageMap[colorKey]) {
        const imagePath = Array.isArray(imageMap[colorKey]) ? imageMap[colorKey][0] : imageMap[colorKey];
        imageUrl = imagePath ? `https://cdn.dsmcdn.com${imagePath}` : '';
      }
      
      const row = [
        handle,
        `${productTitle} - ${color} ${size}`,
        'Renk',
        color,
        'Beden', 
        size,
        price,
        imageUrl
      ];
      
      csvRows.push(row.map(value => escapeCSVValue(String(value))).join(','));
    });

    // Write CSV with UTF-8 BOM directly to main directory
    const csvContent = '\uFEFF' + csvRows.join('\n');
    fs.writeFileSync(filename, csvContent, 'utf-8');
    
    console.log(`Shopify CSV başarıyla oluşturuldu: ${filename}`);
    
  } catch (error) {
    console.error('Shopify CSV oluşturma hatası:', error);
    throw error;
  }
}

// Keep the original function for backward compatibility
export async function generateShopifyVariantCSV(
  variants: TrendyolVariant[],
  imageMap: VariantImageMap,
  productTitle: string,
  productBrand: string,
  productDescription: string,
  filename: string = 'trendyol-shopify-variants.csv'
): Promise<void> {
  // Use the simple version for main directory
  await generateSimpleShopifyCSV(variants, imageMap, productTitle, filename);
}

export function generateVariantSKU(productHandle: string, color: string, size: string): string {
  return `${productHandle}-${slugify(color)}-${slugify(size)}`;
}

export function calculateMarkupPrice(originalPrice: number, markupPercent: number = 10): number {
  return parseFloat((originalPrice * (1 + markupPercent / 100)).toFixed(2));
}