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
  const filePath = path.join('/home/runner/workspace', filename);

  // Ensure workspace directory exists
  const workspaceDir = '/home/runner/workspace';
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
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

  products.forEach((product, productIndex) => {
    console.log(`🔧 ${productIndex + 1}/${products.length} ürün işleniyor: ${product.title}`);
    
    const handle = slugify(product.title, { lower: true, remove: /[*+~.()'"!:@]/g });
    const basePrice = parseFloat(product.basePrice) || parseFloat(product.price);
    const markupPrice = (basePrice * 1.1).toFixed(2);
    const costPrice = (basePrice * 0.73).toFixed(2);

    console.log(`🔧 Otantik varyant bilgileri: ${JSON.stringify(product.variants)}`);
    
    // Otantik renk ve beden bilgilerini kullan
    const colors = product.variants.colors.length > 0 ? product.variants.colors : ['tek renk'];
    const sizes = product.variants.sizes.length > 0 ? product.variants.sizes : ['tek beden'];
    
    console.log(`🔧 ${colors.length} renk x ${sizes.length} beden = ${colors.length * sizes.length} varyant`);

    colors.forEach((color, colorIndex) => {
      sizes.forEach((size, sizeIndex) => {
        const isFirstVariant = colorIndex === 0 && sizeIndex === 0;
        const variantSku = `${product.id}-${color.replace(/\s+/g, '').toLowerCase()}-${size.replace(/\s+/g, '').toLowerCase()}`;
        
        // Akıllı görsel dağılımı - her varyant farklı görsel alsın
        const totalVariants = colors.length * sizes.length;
        const variantIndex = colorIndex * sizes.length + sizeIndex;
        
        // Ana görsel: her 2 varyanttan bir görsel değiştir
        const mainImageIndex = Math.floor(variantIndex / 2) % Math.max(product.images.length, 1);
        const imageSrc = product.images[mainImageIndex] || product.images[0] || '';
        
        // Varyant görseli: her varyant için farklı görsel
        let variantImageIndex = variantIndex % Math.max(product.images.length, 1);
        
        // Eğer aynı görsel geliyorsa, bir sonrakini al
        if (variantImageIndex === mainImageIndex && product.images.length > 1) {
          variantImageIndex = (variantImageIndex + 1) % product.images.length;
        }
        
        const variantImageSrc = product.images[variantImageIndex] || product.images[0] || '';

        console.log(`🔧 Varyant: ${color}-${size} (Ana görsel: ${mainImageIndex + 1}, Varyant görsel: ${variantImageIndex + 1})`);

        // Generate authentic product description
        const authenticDescription = isFirstVariant ? generateProductDescription(product) : '';
        console.log(`🔍 Varyant açıklama: "${authenticDescription.substring(0, 50)}..." (${authenticDescription.length} karakter)`);

        const variant: ShopifyVariant = {
          Handle: handle,
          Title: isFirstVariant ? product.title : '',
          'Body (HTML)': authenticDescription,
          Vendor: isFirstVariant ? (product.brand || extractBrandFromTitle(product.title)) : '',
          Type: isFirstVariant ? categorizeProduct(product.title) : '',
          Tags: isFirstVariant ? generateTags(product.title, product.price) : '',
          Published: isFirstVariant ? 'TRUE' : 'TRUE',
          'Option1 Name': isFirstVariant ? 'Renk' : '',
          'Option1 Value': color,
          'Option2 Name': isFirstVariant ? 'Beden' : '',
          'Option2 Value': size,
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': variantSku,
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
          'Image Src': isFirstVariant ? imageSrc : '',
          'Image Position': isFirstVariant ? (imageIndex + 1).toString() : '',
          'Image Alt Text': isFirstVariant ? `${product.title} - ${color}` : '',
          'Gift Card': 'FALSE',
          'SEO Title': isFirstVariant ? product.title : '',
          'SEO Description': isFirstVariant ? generateSEODescription(product) : '',
          'Google Shopping / Google Product Category': getCategoryForGoogle(product.title),
          'Google Shopping / Gender': getGenderFromTitle(product.title),
          'Google Shopping / Age Group': 'adult',
          'Google Shopping / MPN': variantSku,
          'Google Shopping / AdWords Grouping': '',
          'Google Shopping / AdWords Labels': '',
          'Google Shopping / Condition': 'new',
          'Google Shopping / Custom Product': 'FALSE',
          'Google Shopping / Custom Label 0': '',
          'Google Shopping / Custom Label 1': '',
          'Google Shopping / Custom Label 2': '',
          'Google Shopping / Custom Label 3': '',
          'Google Shopping / Custom Label 4': '',
          'Variant Image': variantImageSrc,
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

  // Python csv.writer equivalent with exact format
  const createPythonStyleCSV = () => {
    const csvLines: string[] = [];
    
    // Headers - quote every field exactly like Python csv.QUOTE_ALL
    csvLines.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    
    // Data rows - quote every field exactly like Python csv.QUOTE_ALL
    shopifyVariants.forEach(variant => {
      const row = headers.map(header => {
        const value = (variant as any)[header] || '';
        const stringValue = String(value).replace(/"/g, '""');
        return `"${stringValue}"`;
      });
      csvLines.push(row.join(','));
    });
    
    return csvLines.join('\n');
  };
  
  const csvContent = createPythonStyleCSV();
  await fs.promises.writeFile(tempPath, csvContent, { encoding: 'utf-8' });
  await fs.promises.writeFile(finalPath, csvContent, { encoding: 'utf-8' });
  
  console.log(`📁 Temp dosya: ${tempPath}`);
  console.log(`📁 Final dosya: ${finalPath}`);

  console.log(`✅ Strict Shopify CSV created: ${filename}`);
  console.log(`📊 ${shopifyVariants.length} variants, ${products.length} products`);

  return {
    filename,
    csvPath: finalPath,
    downloadUrl: `/${filename}`,
    success: true,
    message: "Strict CSV ready",
    totalRows: shopifyVariants.length + 1
  };
}

function generateProductDescription(product: any): string {
  console.log(`🔧 Açıklama oluşturuluyor: ${product.description ? product.description.length : 0} karakter mevcut`);
  
  // Otantik ürün açıklaması öncelikli kullan - threshold lowered to catch more authentic data
  if (product.description && product.description.trim() && product.description.length > 20) {
    console.log(`✅ Otantik açıklama kullanılıyor: ${product.description.length} karakter`);
    return product.description.trim().substring(0, 1200);
  } else {
    // Enhanced premium fallback
    const features = [];
    const brand = product.brand || extractBrandFromTitle(product.title);
    
    features.push(`${product.title} - ${brand} kalitesiyle üretilmiş premium kalite ürün`);
    features.push('Günlük kullanım için ideal, rahat kesim ve kaliteli malzeme ile özenle tasarlanmıştır');
    features.push('Modern ve şık tasarımıyla her ortamda rahatlıkla kullanabilirsiniz');
    features.push('Yüksek kalite standartlarında üretilmiş, dayanıklı ve uzun ömürlü kullanım sağlar');
    
    // Varyant bilgilerini dahil et
    if (product.variants.colors.length > 1) {
      features.push(`${product.variants.colors.length} farklı renk seçeneği ile kişisel tarzınıza uygun alternatifler sunar`);
    }
    
    if (product.variants.sizes.length > 1) {
      features.push(`${product.variants.sizes.length} farklı beden seçeneği ile mükemmel uyum ve konfor sağlar`);
    }
    
    // Ek kalite bilgileri
    features.push('Detaylı kalite kontrol süreçlerinden geçmiş güvenilir ürün');
    features.push('Kolay bakım talimatları ile pratik günlük kullanım');
    features.push('Ürün kalitesi ve müşteri memnuniyeti garantili');
    features.push('Hızlı ve güvenli teslimat imkanı');
    
    console.log(`⚠️ Enhanced premium fallback açıklama kullanılıyor`);
    return features.join('. ').substring(0, 1200);
  }
}

function extractBrandFromTitle(title: string): string {
  return title.split(' ')[0] || 'Genel Markalar';
}

function categorizeProduct(title: string): string {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('elbise') || lowerTitle.includes('dress')) return 'Elbise';
  if (lowerTitle.includes('pantolon') || lowerTitle.includes('pants')) return 'Pantolon';
  if (lowerTitle.includes('gömlek') || lowerTitle.includes('shirt')) return 'Gömlek';
  if (lowerTitle.includes('kazak') || lowerTitle.includes('sweater')) return 'Kazak';
  if (lowerTitle.includes('mont') || lowerTitle.includes('jacket')) return 'Mont';
  if (lowerTitle.includes('ayakkabı') || lowerTitle.includes('shoe')) return 'Ayakkabı';
  if (lowerTitle.includes('çanta') || lowerTitle.includes('bag')) return 'Çanta';
  
  return 'Genel';
}

function generateTags(title: string, price: string): string {
  const tags = [];
  const lowerTitle = title.toLowerCase();
  
  // Kategori tabanlı tag'ler
  if (lowerTitle.includes('kadın')) tags.push('kadın');
  if (lowerTitle.includes('erkek')) tags.push('erkek');
  if (lowerTitle.includes('yazlık')) tags.push('yazlık');
  if (lowerTitle.includes('kışlık')) tags.push('kışlık');
  if (lowerTitle.includes('spor')) tags.push('spor');
  if (lowerTitle.includes('casual')) tags.push('günlük');
  
  // Fiyat tabanlı tag'ler
  const priceNum = parseFloat(price);
  if (priceNum < 100) tags.push('ekonomik');
  else if (priceNum > 500) tags.push('premium');
  
  // Genel tag'ler
  tags.push('moda', 'trend', 'kaliteli');
  
  return tags.join(', ');
}

function generateSEODescription(title: string): string {
  return `${title} - Yüksek kaliteli, şık ve modern tasarım. Hızlı teslimat ve güvenli alışveriş imkanı.`;
}

function getCategoryForGoogle(title: string): string {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('elbise')) return 'Apparel & Accessories > Clothing > Dresses';
  if (lowerTitle.includes('pantolon')) return 'Apparel & Accessories > Clothing > Pants';
  if (lowerTitle.includes('gömlek')) return 'Apparel & Accessories > Clothing > Shirts & Tops';
  if (lowerTitle.includes('ayakkabı')) return 'Apparel & Accessories > Shoes';
  if (lowerTitle.includes('çanta')) return 'Apparel & Accessories > Handbags, Wallets & Cases';
  
  return 'Apparel & Accessories > Clothing';
}

function getGenderFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('kadın') || lowerTitle.includes('bayan')) return 'female';
  if (lowerTitle.includes('erkek')) return 'male';
  
  return 'unisex';
}