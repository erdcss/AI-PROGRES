import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs/promises';
import { stringify } from 'csv-stringify/sync';

interface ProductData {
  title: string;
  price: string;
  id: number;
  url: string;
  description: string;
  basePrice: string;
  images: string[];
  video: string | null;
  brand: string | null;
  vendor: string;
  category: string | null;
  subcategory: string | null;
  productType: string | null;
  tags: string[];
  attributes: Record<string, string>;
  categories: string[] | null;
  variants: {
    colors: string[];
    sizes: string[];
    totalVariants: number;
    variantImages: any;
    colorImageMap: any;
    variantPricing: any;
    variantSpecificPricing: any;
    stockMap: any;
    outOfStockVariants?: string[];
  };
}

interface ShopifyVariant {
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
  'Option3 Name': string;
  'Option3 Value': string;
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
  'Google Shopping / Google Product Category': string;
  'Google Shopping / Gender': string;
  'Google Shopping / Age Group': string;
  'Google Shopping / MPN': string;
  'Google Shopping / AdWords Grouping': string;
  'Google Shopping / AdWords Labels': string;
  'Google Shopping / Condition': string;
  'Google Shopping / Custom Product': string;
  'Google Shopping / Custom Label 0': string;
  'Google Shopping / Custom Label 1': string;
  'Google Shopping / Custom Label 2': string;
  'Google Shopping / Custom Label 3': string;
  'Google Shopping / Custom Label 4': string;
  'Variant Image': string;
  'Variant Weight Unit': string;
  'Variant Tax Code': string;
  'Cost per item': string;
  'Included / France': string;
  'Price / France': string;
  'Compare At Price / France': string;
  'Included / Germany': string;
  'Price / Germany': string;
  'Compare At Price / Germany': string;
  'Included / UK': string;
  'Price / UK': string;
  'Compare At Price / UK': string;
  'Included / US': string;
  'Price / US': string;
  'Compare At Price / US': string;
}

function generateHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[çğıöşüÇĞIÖŞÜ]/g, (char) => {
      const charMap: { [key: string]: string } = {
        'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'Ç': 'c', 'Ğ': 'g', 'I': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
      };
      return charMap[char] || char;
    })
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isVariantInStock(color: string, size: string, stockMap: any, outOfStockVariants?: string[]): boolean {
  const variantKey = `${color.toLowerCase()}-${size}`;
  
  // Check if variant is explicitly marked as out of stock
  if (outOfStockVariants && outOfStockVariants.includes(variantKey)) {
    return false;
  }
  
  // Check stock map
  if (stockMap && stockMap[variantKey] !== undefined) {
    return stockMap[variantKey];
  }
  
  // Default to in stock if no information available
  return true;
}

export async function generateShopifyCSV(products: ProductData[]): Promise<{filename: string, csvPath: string, totalRows: number}> {
  console.log('🔄 CSV oluşturma başlıyor:', products.length, 'ürün');
  const shopifyVariants: ShopifyVariant[] = [];

  products.forEach((product, productIndex) => {
    console.log(`🔧 ${productIndex + 1}/${products.length} ürün işleniyor: ${product.title}`);
    console.log('🔧 Varyant bilgileri:', {
      colors: product.variants?.colors,
      sizes: product.variants?.sizes,
      totalVariants: product.variants?.totalVariants
    });
    
    const handle = generateHandle(product.title);
    const hasColors = product.variants?.colors?.length > 1 || 
                     (product.variants?.colors?.length === 1 && product.variants.colors[0] !== 'tek renk');
    const hasSizes = product.variants?.sizes?.length > 0;

    // If product has variants, create one row per variant
    if (hasColors || hasSizes) {
      console.log('🔧 Varyantlar oluşturuluyor...');
      (product.variants?.colors || ['tek renk']).forEach((color, colorIndex) => {
        (product.variants?.sizes || ['Tek Beden']).forEach((size, sizeIndex) => {
          console.log(`🔧 Varyant: ${color}-${size}`);
          const isInStock = isVariantInStock(color, size, product.variants?.stockMap, product.variants?.outOfStockVariants);
          const variantIndex = colorIndex * (product.variants?.sizes?.length || 1) + sizeIndex;
          
          // Build product description with attributes and features
          const buildProductDescription = (product: any) => {
            let description = product.description || '';
            
            // Add color options if available
            if (product.variants?.colors && product.variants.colors.length > 1) {
              const colorList = product.variants.colors.filter((c: string) => c !== 'tek renk').join(' - ');
              if (colorList) {
                description += `\n\nRenk Seçenekleri: ${colorList}`;
              }
            }
            
            // Add size options if available
            if (product.variants?.sizes && product.variants.sizes.length > 0) {
              description += `\n\nBeden Seçenekleri: ${product.variants.sizes.join(' - ')}`;
            }
            
            // Add product attributes if available
            if (product.attributes && Object.keys(product.attributes).length > 0) {
              description += '\n\nÜrün Özellikleri:';
              Object.entries(product.attributes).forEach(([key, value]) => {
                // Remove any commas and quotes from attribute values
                const cleanKey = String(key).replace(/[",]/g, ' ').trim();
                const cleanValue = String(value).replace(/[",]/g, ' ').trim();
                description += `\n• ${cleanKey}: ${cleanValue}`;
              });
            }
            
            // Add categories if available
            if (product.categories && product.categories.length > 0) {
              const cleanCategories = product.categories.map(cat => 
                String(cat).replace(/[",]/g, ' ').trim()
              );
              description += `\n\nKategoriler: ${cleanCategories.join(' > ')}`;
            }
            
            // Shopify-compliant description cleaning
            return description.trim()
              .replace(/[\r\n]+/g, ' ')     // Replace line breaks with spaces
              .replace(/\s+/g, ' ')         // Normalize multiple spaces
              .replace(/[""'']/g, '"')      // Normalize smart quotes to regular quotes
              .replace(/[–—]/g, '-')        // Normalize dashes
              .trim();                      // Final trim
          };

          const variant: ShopifyVariant = {
            Handle: handle,
            Title: productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? product.title : '',
            'Body (HTML)': productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? buildProductDescription(product) : '',
            Vendor: product.brand || product.vendor || '',
            Type: product.productType || '',
            Tags: (product.tags || []).join(', '),
            Published: 'TRUE',
            'Option1 Name': hasColors ? 'Renk' : '',
            'Option1 Value': hasColors ? color : '',
            'Option2 Name': hasSizes ? 'Beden' : '',
            'Option2 Value': hasSizes ? size : '',
            'Option3 Name': '',
            'Option3 Value': '',
            'Variant SKU': `${product.id}-${color.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${size.toLowerCase().replace(/[^a-z0-9]/g, '-')}`.replace(/-+/g, '-'),
            'Variant Grams': '0',
            'Variant Inventory Tracker': 'shopify',
            'Variant Inventory Qty': isInStock ? '10' : '0',
            'Variant Inventory Policy': 'deny',
            'Variant Fulfillment Service': 'manual',
            'Variant Price': (parseFloat(product.price) * 1.1).toFixed(2),
            'Variant Compare At Price': product.basePrice !== product.price ? parseFloat(product.basePrice).toFixed(2) : '',
            'Variant Requires Shipping': 'TRUE',
            'Variant Taxable': 'TRUE',
            'Variant Barcode': '',
            'Image Src': productIndex === 0 && colorIndex === 0 && sizeIndex === 0 && product.images[0] ? product.images[0] : '',
            'Image Position': productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? '1' : '',
            'Image Alt Text': productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? product.title : '',
            'Gift Card': 'FALSE',
            'SEO Title': productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? product.title : '',
            'SEO Description': productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? product.description : '',
            'Google Shopping / Google Product Category': '',
            'Google Shopping / Gender': '',
            'Google Shopping / Age Group': '',
            'Google Shopping / MPN': '',
            'Google Shopping / AdWords Grouping': '',
            'Google Shopping / AdWords Labels': '',
            'Google Shopping / Condition': 'new',
            'Google Shopping / Custom Product': 'FALSE',
            'Google Shopping / Custom Label 0': '',
            'Google Shopping / Custom Label 1': '',
            'Google Shopping / Custom Label 2': '',
            'Google Shopping / Custom Label 3': '',
            'Google Shopping / Custom Label 4': '',
            'Variant Image': product.variants.variantImages?.[`${color}-${size}`] || '',
            'Variant Weight Unit': 'kg',
            'Variant Tax Code': '',
            'Cost per item': '',
            'Included / France': '',
            'Price / France': '',
            'Compare At Price / France': '',
            'Included / Germany': '',
            'Price / Germany': '',
            'Compare At Price / Germany': '',
            'Included / UK': '',
            'Price / UK': '',
            'Compare At Price / UK': '',
            'Included / US': '',
            'Price / US': '',
            'Compare At Price / US': ''
          };

          shopifyVariants.push(variant);
        });
      });

      // Add additional images as separate rows
      if (product.images.length > 1) {
        product.images.slice(1).forEach((imageUrl, imageIndex) => {
          const imageVariant: ShopifyVariant = {
            Handle: handle,
            Title: '',
            'Body (HTML)': '',
            Vendor: '',
            Type: '',
            Tags: '',
            Published: '',
            'Option1 Name': '',
            'Option1 Value': '',
            'Option2 Name': '',
            'Option2 Value': '',
            'Option3 Name': '',
            'Option3 Value': '',
            'Variant SKU': '',
            'Variant Grams': '',
            'Variant Inventory Tracker': '',
            'Variant Inventory Qty': '',
            'Variant Inventory Policy': '',
            'Variant Fulfillment Service': '',
            'Variant Price': '',
            'Variant Compare At Price': '',
            'Variant Requires Shipping': '',
            'Variant Taxable': '',
            'Variant Barcode': '',
            'Image Src': imageUrl,
            'Image Position': (imageIndex + 2).toString(),
            'Image Alt Text': product.title,
            'Gift Card': '',
            'SEO Title': '',
            'SEO Description': '',
            'Google Shopping / Google Product Category': '',
            'Google Shopping / Gender': '',
            'Google Shopping / Age Group': '',
            'Google Shopping / MPN': '',
            'Google Shopping / AdWords Grouping': '',
            'Google Shopping / AdWords Labels': '',
            'Google Shopping / Condition': '',
            'Google Shopping / Custom Product': '',
            'Google Shopping / Custom Label 0': '',
            'Google Shopping / Custom Label 1': '',
            'Google Shopping / Custom Label 2': '',
            'Google Shopping / Custom Label 3': '',
            'Google Shopping / Custom Label 4': '',
            'Variant Image': '',
            'Variant Weight Unit': '',
            'Variant Tax Code': '',
            'Cost per item': '',
            'Included / France': '',
            'Price / France': '',
            'Compare At Price / France': '',
            'Included / Germany': '',
            'Price / Germany': '',
            'Compare At Price / Germany': '',
            'Included / UK': '',
            'Price / UK': '',
            'Compare At Price / UK': '',
            'Included / US': '',
            'Price / US': '',
            'Compare At Price / US': ''
          };

          shopifyVariants.push(imageVariant);
        });
      }
    } else {
      // Product without variants
      const variant: ShopifyVariant = {
        Handle: handle,
        Title: product.title,
        'Body (HTML)': product.description,
        Vendor: product.brand || product.vendor,
        Type: product.productType || '',
        Tags: product.tags.join(', '),
        Published: 'TRUE',
        'Option1 Name': '',
        'Option1 Value': '',
        'Option2 Name': '',
        'Option2 Value': '',
        'Option3 Name': '',
        'Option3 Value': '',
        'Variant SKU': product.id.toString(),
        'Variant Grams': '0',
        'Variant Inventory Tracker': 'shopify',
        'Variant Inventory Qty': '100',
        'Variant Inventory Policy': 'deny',
        'Variant Fulfillment Service': 'manual',
        'Variant Price': product.price,
        'Variant Compare At Price': product.basePrice !== product.price ? product.basePrice : '',
        'Variant Requires Shipping': 'TRUE',
        'Variant Taxable': 'TRUE',
        'Variant Barcode': '',
        'Image Src': product.images[0] || '',
        'Image Position': '1',
        'Image Alt Text': product.title,
        'Gift Card': 'FALSE',
        'SEO Title': product.title,
        'SEO Description': product.description,
        'Google Shopping / Google Product Category': '',
        'Google Shopping / Gender': '',
        'Google Shopping / Age Group': '',
        'Google Shopping / MPN': '',
        'Google Shopping / AdWords Grouping': '',
        'Google Shopping / AdWords Labels': '',
        'Google Shopping / Condition': 'new',
        'Google Shopping / Custom Product': 'FALSE',
        'Google Shopping / Custom Label 0': '',
        'Google Shopping / Custom Label 1': '',
        'Google Shopping / Custom Label 2': '',
        'Google Shopping / Custom Label 3': '',
        'Google Shopping / Custom Label 4': '',
        'Variant Image': '',
        'Variant Weight Unit': 'kg',
        'Variant Tax Code': '',
        'Cost per item': '',
        'Included / France': '',
        'Price / France': '',
        'Compare At Price / France': '',
        'Included / Germany': '',
        'Price / Germany': '',
        'Compare At Price / Germany': '',
        'Included / UK': '',
        'Price / UK': '',
        'Compare At Price / UK': '',
        'Included / US': '',
        'Price / US': '',
        'Compare At Price / US': ''
      };

      shopifyVariants.push(variant);
    }
  });

  // CSV formatında dosya oluştur (Excel değil)
  const csvData = stringify(shopifyVariants, {
    header: true,
    delimiter: ',',
    quoted: true,
    quoted_empty: true,
    quoted_string: true,
    record_delimiter: '\n',
    encoding: 'utf8',
    bom: false
  });

  // Generate filename with timestamp - CSV format
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `shopify-import-${timestamp}.csv`;
  const filePath = path.join(process.cwd(), 'temp', filename);

  // Ensure temp directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Manual CSV generation with strict RFC 4180 compliance
  const headers = Object.keys(shopifyVariants[0]);
  
  // Shopify-compliant CSV field escaping based on official requirements
  function escapeCSVField(field: string): string {
    if (!field && field !== 0) return '';
    
    let stringField = String(field);
    
    // Clean field according to Shopify requirements
    stringField = stringField
      .replace(/[\r\n]+/g, ' ')  // Replace line breaks with spaces
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();                   // Remove leading/trailing spaces
    
    // Shopify requirement: Always quote fields containing special chars
    const needsQuoting = stringField.includes('"') || 
                        stringField.includes(',') || 
                        stringField.includes('\n') || 
                        stringField.includes('\r') ||
                        stringField.startsWith(' ') ||
                        stringField.endsWith(' ');
    
    if (needsQuoting) {
      // Shopify requirement: Escape internal quotes by doubling them
      const escapedField = stringField.replace(/"/g, '""');
      return '"' + escapedField + '"';
    }
    
    return stringField;
  }
  
  // Build CSV content with Shopify compliance
  const csvLines = [];
  
  // Add header row (headers should not be quoted per Shopify requirements)
  csvLines.push(headers.join(','));
  
  // Add data rows with proper field escaping
  shopifyVariants.forEach(variant => {
    const row = headers.map(header => {
      const value = variant[header as keyof ShopifyVariant];
      return escapeCSVField(value || '');
    });
    csvLines.push(row.join(','));
  });
  
  // Use LF line endings as preferred by Shopify
  const cleanCsvContent = csvLines.join('\n');
  
  // Write CSV file with UTF-8 encoding (no BOM) as required by Shopify
  await fs.writeFile(filePath, cleanCsvContent, { encoding: 'utf8' });

  console.log(`✅ Shopify CSV oluşturuldu: ${filename}`);
  console.log(`📊 ${shopifyVariants.length} varyant, ${products.length} ürün`);
  console.log(`📁 Dosya yolu: ${filePath}`);

  return {
    filename,
    csvPath: filePath,
    downloadUrl: `/csv/${filename}`,
    success: true,
    message: "CSV hazır",
    totalRows: shopifyVariants.length + 1
  };
}