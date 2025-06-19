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

export async function generateShopifyVariantCSV(
  variants: TrendyolVariant[],
  imageMap: VariantImageMap,
  productTitle: string,
  productBrand: string,
  productDescription: string,
  filename: string = 'shopify-variants.csv'
): Promise<void> {
  try {
    const outputDir = path.dirname(filename);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const handle = slugify(productTitle);
    const csvRows: string[] = [];
    
    // CSV Header
    const headers = [
      'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
      'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
      'Variant SKU', 'Variant Price', 'Variant Compare At Price',
      'Image Src', 'Image Position', 'Image Alt Text',
      'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
      'Variant Fulfillment Service', 'Variant Requires Shipping', 'Variant Taxable'
    ];
    
    csvRows.push(headers.map(h => escapeCSVValue(h)).join(','));

    // Generate rows for each variant
    variants.forEach((variant, index) => {
      const color = variant.color || 'tek renk';
      const size = variant.size || 'tek beden';
      const price = variant.price ? parseFloat(variant.price.toString()) * 1.1 : 0; // 10% markup
      const comparePrice = variant.price ? parseFloat(variant.price.toString()) : 0;
      
      // Get variant image
      const colorKey = color.toLowerCase();
      let imageUrl = '';
      if (imageMap[colorKey]) {
        const imagePath = Array.isArray(imageMap[colorKey]) ? imageMap[colorKey][0] : imageMap[colorKey];
        imageUrl = imagePath ? `https://cdn.dsmcdn.com${imagePath}` : '';
      }
      
      const isFirstVariant = index === 0;
      const sku = `${handle}-${slugify(color)}-${slugify(size)}`;
      const variantTitle = `${productTitle} - ${color} ${size}`;
      
      const row = [
        handle,
        isFirstVariant ? productTitle : '',
        isFirstVariant ? productDescription : '',
        isFirstVariant ? productBrand : '',
        isFirstVariant ? 'Giyim' : '',
        isFirstVariant ? 'moda, trend, kaliteli' : '',
        'TRUE',
        isFirstVariant ? 'Renk' : '',
        color,
        isFirstVariant ? 'Beden' : '',
        size,
        sku,
        price.toFixed(2),
        comparePrice.toFixed(2),
        imageUrl,
        isFirstVariant ? '1' : '',
        variantTitle,
        'shopify',
        variant.stock ? '10' : '0',
        'deny',
        'manual',
        'TRUE',
        'TRUE'
      ];
      
      csvRows.push(row.map(value => escapeCSVValue(String(value))).join(','));
    });

    // Write CSV with UTF-8 BOM
    const csvContent = '\uFEFF' + csvRows.join('\n');
    fs.writeFileSync(filename, csvContent, 'utf-8');
    
    console.log(`✅ Shopify CSV kaydedildi: ${filename}`);
    console.log(`📊 ${variants.length} varyant işlendi`);
    
  } catch (error) {
    console.error('❌ Shopify CSV oluşturma hatası:', error);
    throw error;
  }
}

export function generateVariantSKU(productHandle: string, color: string, size: string): string {
  return `${productHandle}-${slugify(color)}-${slugify(size)}`;
}

export function calculateMarkupPrice(originalPrice: number, markupPercent: number = 10): number {
  return parseFloat((originalPrice * (1 + markupPercent / 100)).toFixed(2));
}