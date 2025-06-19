import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Product {
  title: string;
  price: string;
  id: number;
  description: string;
  brand: string | null;
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
    totalVariants: number;
  };
  url: string;
  basePrice: string;
}

// Enhanced CSV escape function - Shopify compatible
function escapeCSVValue(value: string): string {
  if (!value) return '';
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`; // Çift tırnakla sar ve iç tırnakları çiftle
}

function sanitizeCSVValue(value: string): string {
  if (!value) return '';
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/"/g, "'")
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Remove control characters
    .trim()
    .substring(0, 500);
}

function optimizeTitle(title: string): string {
  const cleaned = sanitizeCSVValue(title);
  return cleaned.length > 70 ? cleaned.substring(0, 67) + '...' : cleaned;
}

function optimizeVariantName(color: string, size: string): string {
  const colorClean = color.replace(/[^a-zA-ZçğıöşüÇĞIÖŞÜ0-9\s]/g, '').trim();
  const sizeClean = size.replace(/[^a-zA-Z0-9]/g, '').trim();
  return `${colorClean}-${sizeClean}`.substring(0, 30);
}

function createSafeHandle(title: string, id: number): string {
  const handle = title
    .toLowerCase()
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıI]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .trim();
  
  return handle || `urun-${id}`;
}

export async function generateStrictShopifyCSV(products: Product[]): Promise<string> {
  console.log('🔧 Shopify Uyumlu CSV oluşturuluyor...');
  
  if (!products || products.length === 0) {
    throw new Error('Ürün verisi bulunamadı');
  }

  // Shopify headers - complete format
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
    'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
    'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position',
    'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
    'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
    'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels', 'Google Shopping / Condition',
    'Google Shopping / Custom Product', 'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3', 'Google Shopping / Custom Label 4',
    'Variant Image', 'Variant Weight Unit', 'Variant Tax Code', 'Cost per item', 'Included / France',
    'Price / France', 'Compare At Price / France', 'Included / Germany', 'Price / Germany',
    'Compare At Price / Germany', 'Included / UK', 'Price / UK', 'Compare At Price / UK',
    'Included / US', 'Price / US', 'Compare At Price / US'
  ];

  const csvRows: string[] = [];
  csvRows.push(headers.map(h => escapeCSVValue(h)).join(','));

  let totalVariants = 0;

  products.forEach((product, productIndex) => {
    console.log(`📦 ${productIndex + 1}. ${product.title} (ID: ${product.id})`);
    
    const handle = createSafeHandle(product.title, product.id);
    const optimizedTitle = optimizeTitle(product.title);
    const optimizedDescription = sanitizeCSVValue(product.description || '');
    
    const basePrice = parseFloat(product.basePrice || product.price);
    const finalPrice = (basePrice * 1.1).toFixed(2); // 10% markup
    const costPrice = (basePrice * 0.75).toFixed(2); // 75% cost ratio
    
    const colors = product.variants.colors && product.variants.colors.length > 0 ? 
                  product.variants.colors : ['tek renk'];
    const sizes = product.variants.sizes && product.variants.sizes.length > 0 ? 
                 product.variants.sizes : ['tek beden'];
    
    colors.forEach((color, colorIndex) => {
      sizes.forEach((size, sizeIndex) => {
        const isFirstVariant = colorIndex === 0 && sizeIndex === 0;
        const variantName = optimizeVariantName(color, size);
        const sku = `${product.id}-${color.replace(/\s+/g, '').toLowerCase()}-${size.replace(/\s+/g, '').toLowerCase()}`;
        
        // Image selection logic
        const imageIndex = (colorIndex * sizes.length + sizeIndex) % Math.max(product.images.length, 1);
        const mainImage = product.images[imageIndex] || product.images[0] || '';
        const variantImage = product.images[(imageIndex + 1) % Math.max(product.images.length, 1)] || mainImage;
        
        // Product category from title
        const productType = getProductType(product.title);
        
        const row = [
          handle,                                           // Handle
          isFirstVariant ? optimizedTitle : '',            // Title
          isFirstVariant ? optimizedDescription : '',      // Body (HTML)
          isFirstVariant ? (product.brand || 'Unknown') : '', // Vendor
          isFirstVariant ? productType : '',               // Type
          isFirstVariant ? 'premium, moda, trend, kaliteli' : '', // Tags
          'TRUE',                                           // Published
          isFirstVariant ? 'Renk' : '', color,            // Option1
          isFirstVariant ? 'Beden' : '', size,            // Option2
          '', '',                                          // Option3
          sku, '200', 'shopify', '10', 'deny', 'manual',  // Variant details
          finalPrice, product.price,                       // Prices
          'TRUE', 'TRUE', '',                             // Shipping/Tax/Barcode
          isFirstVariant ? mainImage : '',                // Image Src
          isFirstVariant ? (imageIndex + 1).toString() : '', // Image Position
          isFirstVariant ? `${optimizedTitle} - ${color}` : '', // Image Alt
          'FALSE',                                        // Gift Card
          isFirstVariant ? optimizedTitle : '',          // SEO Title
          isFirstVariant ? `${optimizedTitle} - Yüksek kaliteli ürün` : '', // SEO Description
          'Apparel & Accessories > Clothing',            // Google Product Category
          'unisex', 'adult', sku,                        // Google Shopping details
          '', '', 'new', 'FALSE', '', '', '', '', '',    // Google custom labels
          variantImage, 'g', '', costPrice,              // Variant image and cost
          '', '', '', '', '', '', '', '', '', '', '', '' // International pricing (empty)
        ];
        
        csvRows.push(row.map(value => escapeCSVValue(String(value))).join(','));
        totalVariants++;
      });
    });
  });

  console.log(`✅ CSV tamamlandı: ${totalVariants} varyant oluşturuldu`);

  // Validate CSV before writing
  const sampleRow = csvRows[1];
  if (sampleRow) {
    const columns = sampleRow.split(',');
    console.log(`✓ İlk satır kontrol: ${columns.length} kolon`);
    console.log(`✓ Handle: ${columns[0] ? 'OK' : 'BOŞ'}`);
    console.log(`✓ Title: ${columns[1] ? 'OK' : 'BOŞ'}`);
  }

  // Write CSV with UTF-8 BOM for Shopify compatibility
  const BOM = '\uFEFF';
  const csvContent = csvRows.join('\n');
  const filename = 'shopify-urunler.csv';
  const finalPath = path.join(process.cwd(), filename);
  
  await fs.promises.writeFile(finalPath, BOM + csvContent, { encoding: 'utf-8' });
  console.log(`💾 CSV dosyası kaydedildi: ${finalPath}`);
  
  // Final validation
  const fileStats = await fs.promises.stat(finalPath);
  console.log(`📊 Dosya boyutu: ${(fileStats.size / 1024).toFixed(2)} KB`);

  return BOM + csvContent;
}

function getProductType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('tshirt') || lower.includes('t-shirt')) return 'T-Shirt';
  if (lower.includes('jean')) return 'Jean';
  if (lower.includes('ayakkabı') || lower.includes('sneaker')) return 'Ayakkabı';
  if (lower.includes('elbise')) return 'Elbise';
  if (lower.includes('gömlek')) return 'Gömlek';
  if (lower.includes('pantolon')) return 'Pantolon';
  if (lower.includes('sweatshirt')) return 'Sweatshirt';
  if (lower.includes('takım')) return 'Takım';
  return 'Giyim';
}