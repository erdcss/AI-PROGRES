import * as fs from 'fs';
import * as path from 'path';

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
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  // Trendyol CDN URLs are reliable
  if (url.includes('cdn.dsmcdn.com')) return true;
  // Basic URL validation
  return url.startsWith('http') && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp'));
}

export async function generateShopifyCSV(products: ProductData[]): Promise<{filename: string, csvPath: string, downloadUrl: string, success: true, message: string, totalRows: number}> {
  console.log(`🔄 CSV oluşturma başlıyor: ${products.length} ürün`);
  
  // Kullanıcının verdiği Python template exact headers - 53 field
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
    'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
    'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position',
    'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description',
    'Google Shopping / Google Product Category', 'Google Shopping / Gender', 'Google Shopping / Age Group',
    'Google Shopping / MPN', 'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
    'Google Shopping / Condition', 'Google Shopping / Custom Product', 'Google Shopping / Custom Label 0',
    'Google Shopping / Custom Label 1', 'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4', 'Variant Image', 'Variant Weight Unit', 'Variant Tax Code',
    'Cost per item', 'Included / France', 'Price / France', 'Compare At Price / France',
    'Included / Germany', 'Price / Germany', 'Compare At Price / Germany',
    'Included / UK', 'Price / UK', 'Compare At Price / UK',
    'Included / US', 'Price / US', 'Compare At Price / US'
  ];

  const shopifyVariants: ShopifyVariant[] = [];

  for (const product of products) {
    console.log(`🔧 ${products.indexOf(product) + 1}/${products.length} ürün işleniyor: ${product.title}`);
    
    const handle = generateHandle(product.title);
    const colors = product.variants.colors || ['tek renk'];
    const sizes = product.variants.sizes || ['Standart'];
    
    console.log(`🔧 Varyant bilgileri: {
  colors: ${JSON.stringify(colors)},
  sizes: ${JSON.stringify(sizes)},
  totalVariants: ${colors.length * sizes.length}
}`);

    // Calculate 10% markup price
    const originalPriceNum = parseFloat(product.price) || 0;
    const markupPrice = Math.round(originalPriceNum * 1.1 * 100) / 100;
    const finalPrice = markupPrice.toFixed(2);
    const comparePrice = originalPriceNum > 0 ? originalPriceNum.toFixed(2) : '';

    // Get valid image URL
    const validImages = product.images.filter(img => isValidImageUrl(img));
    const primaryImage = validImages.length > 0 ? validImages[0] : '';

    console.log(`🔧 Varyantlar oluşturuluyor...`);
    
    // Generate variants
    colors.forEach((color, colorIndex) => {
      sizes.forEach((size, sizeIndex) => {
        const isFirstVariant = colorIndex === 0 && sizeIndex === 0;
        const variantSKU = `${product.id}-${color.toLowerCase()}-${size.toLowerCase()}`.replace(/[^a-z0-9-]/g, '');
        
        console.log(`🔧 Varyant: ${color}-${size}`);

        const variant: ShopifyVariant = {
          Handle: handle,
          Title: isFirstVariant ? product.title : '',
          'Body (HTML)': isFirstVariant ? `<p>${product.description || '%100 kaliteli ürün, rahat kesim'}</p>` : '',
          Vendor: product.brand || 'Turmarkt',
          Type: product.productType || 'Tişört',
          Tags: isFirstVariant ? (product.tags?.join(',') || 'indirimli') : '',
          Published: 'TRUE',
          'Option1 Name': isFirstVariant ? 'Renk' : '',
          'Option1 Value': color,
          'Option2 Name': isFirstVariant ? 'Beden' : '',
          'Option2 Value': size,
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': variantSKU,
          'Variant Grams': '200',
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': '10',
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': finalPrice,
          'Variant Compare At Price': comparePrice,
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'TRUE',
          'Variant Barcode': '',
          'Image Src': isFirstVariant ? primaryImage : '',
          'Image Position': isFirstVariant ? '1' : '',
          'Image Alt Text': isFirstVariant ? product.title : '',
          'Gift Card': 'FALSE',
          'SEO Title': isFirstVariant ? product.title : '',
          'SEO Description': isFirstVariant ? (product.description || 'Rahat ve sade tasarım') : '',
          'Google Shopping / Google Product Category': isFirstVariant ? 'Apparel & Accessories > Clothing > Shirts & Tops' : '',
          'Google Shopping / Gender': isFirstVariant ? 'unisex' : '',
          'Google Shopping / Age Group': isFirstVariant ? 'adult' : '',
          'Google Shopping / MPN': isFirstVariant ? variantSKU : '',
          'Google Shopping / AdWords Grouping': '',
          'Google Shopping / AdWords Labels': '',
          'Google Shopping / Condition': isFirstVariant ? 'new' : '',
          'Google Shopping / Custom Product': isFirstVariant ? 'FALSE' : '',
          'Google Shopping / Custom Label 0': '',
          'Google Shopping / Custom Label 1': '',
          'Google Shopping / Custom Label 2': '',
          'Google Shopping / Custom Label 3': '',
          'Google Shopping / Custom Label 4': '',
          'Variant Image': primaryImage,
          'Variant Weight Unit': isFirstVariant ? 'g' : '',
          'Variant Tax Code': '',
          'Cost per item': comparePrice ? (parseFloat(comparePrice) * 0.8).toFixed(2) : '',
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
  }

  // Generate filename as requested: shopify-urunler.csv
  const filename = 'shopify-urunler.csv';
  const filePath = path.join(process.cwd(), 'temp', filename);

  // Ensure temp directory exists
  const tempDir = path.dirname(filePath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  function escapeCSVField(field: string): string {
    if (!field) return '';
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
      const escapedField = stringField.replace(/"/g, '""');
      return '"' + escapedField + '"';
    }
    return stringField;
  }
  
  // Build CSV content
  const csvLines = [];
  csvLines.push(headers.join(','));
  
  shopifyVariants.forEach(variant => {
    const row = headers.map(header => {
      const value = variant[header as keyof ShopifyVariant];
      return escapeCSVField(value || '');
    });
    csvLines.push(row.join(','));
  });
  
  const csvContent = csvLines.join('\n');
  await fs.promises.writeFile(filePath, csvContent, { encoding: 'utf-8' });

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