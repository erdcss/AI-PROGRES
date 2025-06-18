import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs/promises';

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
  'Product Category': string;
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
              const colorList = product.variants.colors.filter((c: string) => c !== 'tek renk').join(', ');
              if (colorList) {
                description += `\n\nRenk Seçenekleri: ${colorList}`;
              }
            }
            
            // Add size options if available
            if (product.variants?.sizes && product.variants.sizes.length > 0) {
              description += `\n\nBeden Seçenekleri: ${product.variants.sizes.join(', ')}`;
            }
            
            // Add product attributes if available
            if (product.attributes && Object.keys(product.attributes).length > 0) {
              description += '\n\nÜrün Özellikleri:';
              Object.entries(product.attributes).forEach(([key, value]) => {
                description += `\n• ${key}: ${value}`;
              });
            }
            
            // Add categories if available
            if (product.categories && product.categories.length > 0) {
              description += `\n\nKategoriler: ${product.categories.join(' > ')}`;
            }
            
            return description.trim().replace(/\n/g, ' ').replace(/\r/g, '');
          };

          const variant: ShopifyVariant = {
            Handle: handle,
            Title: productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? product.title : '',
            'Body (HTML)': productIndex === 0 && colorIndex === 0 && sizeIndex === 0 ? buildProductDescription(product) : '',
            Vendor: product.brand || product.vendor || '',
            'Product Category': product.category || '',
            Type: product.productType || '',
            Tags: (product.tags || []).join(', '),
            Published: 'TRUE',
            'Option1 Name': hasColors ? 'Renk' : '',
            'Option1 Value': hasColors ? color : '',
            'Option2 Name': hasSizes ? 'Beden' : '',
            'Option2 Value': hasSizes ? size : '',
            'Option3 Name': '',
            'Option3 Value': '',
            'Variant SKU': `${product.id}-${color}-${size}`.replace(/[^a-zA-Z0-9-]/g, ''),
            'Variant Grams': '0',
            'Variant Inventory Tracker': 'shopify',
            'Variant Inventory Qty': isInStock ? '100' : '0',
            'Variant Inventory Policy': 'deny',
            'Variant Fulfillment Service': 'manual',
            'Variant Price': String(Math.ceil(parseFloat(product.price) * 1.1)),
            'Variant Compare At Price': product.basePrice !== product.price ? product.basePrice : '',
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
            'Cost per item': ''
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
            'Product Category': '',
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
            'Cost per item': ''
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
        'Product Category': product.category || '',
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
        'Cost per item': ''
      };

      shopifyVariants.push(variant);
    }
  });

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(shopifyVariants);

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

  // Generate filename with timestamp - CSV format
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `shopify-import-${timestamp}.csv`;
  const filePath = path.join(process.cwd(), 'temp', filename);

  // Ensure temp directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Use professional CSV library for RFC 4180 compliance
  const headers = Object.keys(shopifyVariants[0]);
  const csvData = shopifyVariants.map(variant => 
    headers.map(header => variant[header as keyof ShopifyVariant] || '')
  );
  
  const cleanCsvContent = stringify([headers, ...csvData], {
    quoted: true,
    quote: '"',
    escape: '"',
    delimiter: ',',
    record_delimiter: '\n',
    encoding: 'utf8'
  });
  
  // Write CSV file
  await fs.writeFile(filePath, cleanCsvContent, 'utf8');

  console.log(`✅ Shopify CSV oluşturuldu: ${filename}`);
  console.log(`📊 ${shopifyVariants.length} varyant, ${products.length} ürün`);
  console.log(`📁 Dosya yolu: ${filePath}`);

  return {
    filename,
    csvPath: filePath,
    totalRows: shopifyVariants.length + 1
  };
}