import * as fs from 'fs';
import * as path from 'path';

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

// Strict RFC 4180 CSV field escaping
function escapeCSVField(field: string | number | null | undefined): string {
  if (field === null || field === undefined) {
    return '';
  }
  
  let str = String(field).trim();
  
  // Remove any control characters
  str = str.replace(/[\x00-\x1F\x7F]/g, '');
  
  // If field contains comma, quote, or newline, it must be quoted
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }
  
  return str;
}

// Generate CSV with strict formatting
function generateCSVContent(headers: string[], variants: ShopifyVariant[]): string {
  const lines: string[] = [];
  
  // Header line
  lines.push(headers.map(h => escapeCSVField(h)).join(','));
  
  // Data lines
  variants.forEach(variant => {
    const row = headers.map(header => {
      const value = variant[header as keyof ShopifyVariant];
      return escapeCSVField(value);
    });
    lines.push(row.join(','));
  });
  
  return lines.join('\n');
}

export async function generateStrictShopifyCSV(products: Product[]): Promise<{
  filename: string;
  csvPath: string;
  downloadUrl: string;
  success: boolean;
  message: string;
  totalRows: number;
}> {
  const filename = 'shopify-urunler.csv';
  const tempDir = path.join(process.cwd(), 'temp');
  const filePath = path.join(tempDir, filename);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card',
    'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
    'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
    'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
    'Google Shopping / Condition', 'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4', 'Variant Image', 'Variant Weight Unit',
    'Variant Tax Code', 'Cost per item', 'Included / France', 'Price / France',
    'Compare At Price / France', 'Included / Germany', 'Price / Germany',
    'Compare At Price / Germany', 'Included / UK', 'Price / UK',
    'Compare At Price / UK', 'Included / US', 'Price / US', 'Compare At Price / US'
  ];

  const shopifyVariants: ShopifyVariant[] = [];

  products.forEach(product => {
    const handle = product.title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const colors = product.variants.colors.length > 0 ? product.variants.colors : ['tek renk'];
    const sizes = product.variants.sizes.length > 0 ? product.variants.sizes : ['Standart'];

    const basePrice = parseFloat(product.price || '0');
    const markupPrice = (basePrice * 1.1).toFixed(2);
    const costPrice = (basePrice * 0.73).toFixed(2);

    colors.forEach(color => {
      sizes.forEach((size, sizeIndex) => {
        const isFirstVariant = shopifyVariants.length === 0;
        const variantSKU = `${product.id}-${color.toLowerCase().replace(/[^a-z0-9]/g, '')}-${size.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        const variant: ShopifyVariant = {
          Handle: handle,
          Title: isFirstVariant ? product.title : '',
          'Body (HTML)': isFirstVariant ? (product.description || 'Kaliteli urun') : '',
          Vendor: product.brand || 'Turmarkt',
          Type: 'Genel',
          Tags: isFirstVariant ? 'indirimli' : '',
          Published: 'TRUE',
          'Option1 Name': 'Renk',
          'Option1 Value': color,
          'Option2 Name': 'Beden',
          'Option2 Value': size,
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': variantSKU,
          'Variant Grams': '200',
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': '10',
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': markupPrice,
          'Variant Compare At Price': product.price,
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'TRUE',
          'Variant Barcode': '',
          'Image Src': isFirstVariant ? (product.images[0] || '') : '',
          'Image Position': isFirstVariant ? '1' : '',
          'Image Alt Text': isFirstVariant ? product.title : '',
          'Gift Card': 'FALSE',
          'SEO Title': isFirstVariant ? product.title : '',
          'SEO Description': isFirstVariant ? 'Kaliteli urun' : '',
          'Google Shopping / Google Product Category': 'Apparel & Accessories',
          'Google Shopping / Gender': 'unisex',
          'Google Shopping / Age Group': 'adult',
          'Google Shopping / MPN': variantSKU,
          'Google Shopping / AdWords Grouping': '',
          'Google Shopping / AdWords Labels': '',
          'Google Shopping / Condition': 'new',
          'Google Shopping / Custom Product': 'FALSE',
          'Google Shopping / Custom Label 0': '',
          'Google Shopping / Custom Label 1': '',
          'Google Shopping / Custom Label 2': '',
          'Google Shopping / Custom Label 3': '',
          'Google Shopping / Custom Label 4': '',
          'Variant Image': product.images[sizeIndex] || product.images[0] || '',
          'Variant Weight Unit': 'g',
          'Variant Tax Code': '',
          'Cost per item': costPrice,
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
  });

  const csvContent = generateCSVContent(headers, shopifyVariants);
  await fs.promises.writeFile(filePath, csvContent, { encoding: 'utf-8' });

  console.log(`✅ Strict Shopify CSV created: ${filename}`);
  console.log(`📊 ${shopifyVariants.length} variants, ${products.length} products`);

  return {
    filename,
    csvPath: filePath,
    downloadUrl: `/csv/${filename}`,
    success: true,
    message: "Strict CSV ready",
    totalRows: shopifyVariants.length + 1
  };
}