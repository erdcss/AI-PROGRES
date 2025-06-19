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

// Enhanced CSV escape fonksiyonu - Shopify uyumlu
function escapeCSVValue(value: string): string {
  if (!value) return '""';
  const escaped = value
    .replace(/[\r\n]/g, ' ')  // Newline temizle
    .replace(/\t/g, ' ')      // Tab temizle
    .replace(/"/g, '""')      // Quote escape
    .trim()
    .substring(0, 1000);      // Max length
  return `"${escaped}"`;
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
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
    
  return handle || `product-${id}`;
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

export async function generateStrictShopifyCSV(products: Product[]): Promise<string> {
  console.log('🔧 Shopify Uyumlu CSV oluşturuluyor...');
  
  if (!products || products.length === 0) {
    throw new Error('Ürün verisi bulunamadı');
  }

  // Shopify headers - tam format
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
    'Variant Image', 'Variant Weight Unit', 'Variant Tax Code', 'Cost per item',
    'Included / France', 'Price / France', 'Compare At Price / France',
    'Included / Germany', 'Price / Germany', 'Compare At Price / Germany',
    'Included / UK', 'Price / UK', 'Compare At Price / UK',
    'Included / US', 'Price / US', 'Compare At Price / US'
  ];

  // Varyantları oluştur
  const variants: any[] = [];

  products.forEach((product, productIndex) => {
    console.log(`🔧 ${productIndex + 1}/${products.length} ürün işleniyor: ${product.title}`);
    
    const handle = createSafeHandle(product.title, product.id);
    const optimizedTitle = optimizeTitle(product.title);
    const colors = product.variants.colors || ['tek renk'];
    const sizes = product.variants.sizes || ['tek beden'];

    let variantIndex = 0;
    colors.forEach((color) => {
      sizes.forEach((size) => {
        variantIndex++;
        const isFirstVariant = variantIndex === 1;
        
        let description = '';
        if (product.description && product.description.length > 10) {
          description = product.description.substring(0, 500);
        } else if (isFirstVariant) {
          description = `${optimizedTitle} - Yüksek kaliteli, şık ve modern tasarım. Hızlı teslimat ve güvenli alışveriş imkanı.`;
        }

        const variantName = optimizeVariantName(color, size);
        const sku = `${product.id}-${variantName}`;
        const basePrice = parseFloat(product.basePrice || product.price);
        const finalPrice = (basePrice * 1.1).toFixed(2);

        const variant = {
          'Handle': handle,
          'Title': isFirstVariant ? optimizedTitle : '',
          'Body (HTML)': isFirstVariant ? description : '',
          'Vendor': isFirstVariant ? product.brand || 'Unknown' : '',
          'Type': isFirstVariant ? getProductType(product.title) : '',
          'Tags': isFirstVariant ? generateTags(product) : '',
          'Published': 'TRUE',
          'Option1 Name': 'Renk',
          'Option1 Value': color,
          'Option2 Name': 'Beden', 
          'Option2 Value': size,
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': sku,
          'Variant Grams': '200',
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': '10',
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': finalPrice,
          'Variant Compare At Price': product.price,
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'TRUE',
          'Variant Barcode': '',
          'Image Src': isFirstVariant && product.images[0] ? product.images[0] : '',
          'Image Position': isFirstVariant ? '1' : '',
          'Image Alt Text': isFirstVariant ? `${optimizedTitle} - ${color}` : '',
          'Gift Card': 'FALSE',
          'SEO Title': isFirstVariant ? optimizedTitle : '',
          'SEO Description': isFirstVariant ? `${optimizedTitle} - Yüksek kaliteli, şık ve modern tasarım. Hızlı teslimat ve güvenli alışveriş imkanı.` : '',
          'Google Shopping / Google Product Category': isFirstVariant ? 'Apparel & Accessories > Clothing > Dresses' : '',
          'Google Shopping / Gender': isFirstVariant ? 'unisex' : '',
          'Google Shopping / Age Group': isFirstVariant ? 'adult' : '',
          'Google Shopping / MPN': sku,
          'Google Shopping / AdWords Grouping': '',
          'Google Shopping / AdWords Labels': '',
          'Google Shopping / Condition': isFirstVariant ? 'new' : '',
          'Google Shopping / Custom Product': 'FALSE',
          'Google Shopping / Custom Label 0': '',
          'Google Shopping / Custom Label 1': '',
          'Google Shopping / Custom Label 2': '',
          'Google Shopping / Custom Label 3': '',
          'Google Shopping / Custom Label 4': '',
          'Variant Image': product.images[variantIndex - 1] ? product.images[variantIndex - 1] : '',
          'Variant Weight Unit': 'g',
          'Variant Tax Code': '',
          'Cost per item': (basePrice * 0.75).toFixed(2),
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

        variants.push(variant);
      });
    });
  });

  // CSV satırlarını oluştur - her alan escape edilecek şekilde düzenlendi
  const csvRows = variants.map(variant => {
    const row = headers.map(header => {
      const value = variant[header] || '';
      return escapeCSVValue(String(value));
    });
    return row.join(',');
  });

  // Header row
  const headerRow = headers.map(header => escapeCSVValue(header)).join(',');

  // CSV içerik oluştur
  const csvContent = [headerRow, ...csvRows].join('\n');
  
  // Dosya yolu hazırlama
  const finalFilePath = path.join('/home/runner/workspace', 'shopify-urunler.csv');
  
  // UTF-8 BOM ile kaydet - byte düzeyinde
  const utf8BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
  const contentBuffer = Buffer.from(csvContent, 'utf8');
  const finalBuffer = Buffer.concat([utf8BOM, contentBuffer]);
  
  fs.writeFileSync(finalFilePath, finalBuffer);
  console.log(`📁 UTF-8 BOM ile Shopify CSV kaydedildi: ${finalFilePath}`);
  
  // Python CSV quote fixer entegrasyonu
  try {
    console.log('🔧 Python CSV quote fixer çalıştırılıyor...');
    const fixCommand = `cd /home/runner/workspace && python3 fix_csv_quotes.py "${finalFilePath}" "${finalFilePath}_fixed"`;
    await execAsync(fixCommand);
    
    // Fixed dosyayı asıl dosyanın üzerine kopyala
    if (fs.existsSync(`${finalFilePath}_fixed`)) {
      fs.copyFileSync(`${finalFilePath}_fixed`, finalFilePath);
      fs.unlinkSync(`${finalFilePath}_fixed`);
      console.log('✅ CSV quote fixing ve güncelleme tamamlandı');
    }
  } catch (error) {
    console.log('⚠️ CSV quote fixing atlandı:', error.message);
  }
  
  console.log(`✅ Shopify CSV oluşturuldu: shopify-urunler.csv`);
  console.log(`📊 ${csvRows.length} varyant, ${products.length} ürün`);
  
  return finalFilePath;
}

// Helper functions for product categorization
function getProductType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('elbise')) return 'Elbise';
  if (lower.includes('gömlek')) return 'Gömlek';
  if (lower.includes('pantolon')) return 'Pantolon';
  if (lower.includes('sweatshirt')) return 'Sweatshirt';
  if (lower.includes('takım')) return 'Takım';
  return 'Giyim';
}

function generateTags(product: any): string {
  return 'premium, moda, trend, kaliteli';
}
  const filename = 'shopify-urunler.csv';
  const tempPath = path.join(process.cwd(), 'temp', filename);
  const finalPath = path.join(process.cwd(), filename);

  // Ensure temp directory exists
  await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
  
  console.log(`🔧 CSV oluşturuluyor - ${products.length} ürün`);
  console.log(`📝 İlk ürün: "${products[0]?.title}"`);
  console.log(`📝 İlk açıklama: "${products[0]?.description}"`);

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
    
    const handle = product.title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
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
          'Image Src': isFirstVariant ? (product.images[mainImageIndex] || product.images[0] || '') : '',
          'Image Position': isFirstVariant ? (mainImageIndex + 1).toString() : '',
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
    
    // Add newline at end for proper file formatting
    return csvLines.join('\n') + '\n';
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

function generateSEODescription(product: any): string {
  const title = typeof product === 'string' ? product : (product.title || '');
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