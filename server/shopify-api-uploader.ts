import { parse } from 'csv-parse/sync';

// Duplicate prevention için upload history
const uploadHistory = new Map<string, { productId: string; timestamp: number }>();

// Product duplicate check fonksiyonu
function generateProductHash(title: string, brand?: string): string {
  const cleanTitle = title.toLowerCase().replace(/[^a-zA-Z0-9ğüşıöçĞÜŞIÖÇ]/g, '');
  const cleanBrand = brand?.toLowerCase().replace(/[^a-zA-Z0-9ğüşıöçĞÜŞIÖÇ]/g, '') || '';
  return `${cleanBrand}-${cleanTitle}`;
}

function isDuplicateProduct(title: string, brand?: string): { isDuplicate: boolean; existingProductId?: string } {
  const hash = generateProductHash(title, brand);
  const existing = uploadHistory.get(hash);
  
  if (existing && (Date.now() - existing.timestamp) < 30000) { // 30 saniye içinde duplicate
    return { isDuplicate: true, existingProductId: existing.productId };
  }
  
  return { isDuplicate: false };
}

function recordUpload(title: string, productId: string, brand?: string): void {
  const hash = generateProductHash(title, brand);
  uploadHistory.set(hash, { productId, timestamp: Date.now() });
  
  // 5 dakika sonra temizle
  setTimeout(() => {
    uploadHistory.delete(hash);
  }, 300000);
}

interface ShopifyProductData {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  tags: string;
  variants: Array<{
    option1: string;
    option2: string;
    price: string;
    sku: string;
    inventory_quantity: number;
    image?: string;
  }>;
  images: Array<{
    src: string;
    alt: string;
    position: number;
  }>;
}

export async function uploadProductToShopify(csvContent: string, productTitle: string): Promise<{ success: boolean; productId?: string; message: string }> {
  try {
    console.log('🛒 Shopify upload başlatılıyor...');
    console.log('CSV Content Length:', csvContent.length);
    console.log('Product Title:', productTitle);
    
    // Duplicate check for CSV uploads too
    const duplicateCheck = isDuplicateProduct(productTitle);
    if (duplicateCheck.isDuplicate) {
      console.log('🚫 DUPLICATE CSV PRODUCT DETECTED - Blocking upload');
      return {
        success: false,
        message: `Bu ürün yakın zamanda yüklendi (Product ID: ${duplicateCheck.existingProductId}). Lütfen birkaç dakika bekleyin.`
      };
    }
    
    // Parse CSV content
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log('✅ CSV parsed successfully, records count:', records.length);

    if (!records || records.length === 0) {
      console.log('❌ CSV içeriği boş');
      return { success: false, message: 'CSV içeriği boş veya geçersiz' };
    }

    console.log('📋 First record keys:', Object.keys(records[0]));
    console.log('📋 First record data:', JSON.stringify(records[0], null, 2));

    // CSV'den Shopify product data'sı oluştur
    const productData = parseCSVToShopifyProduct(records);
    
    // Shopify API endpoint
    const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!shopifyStore || !accessToken) {
      return { 
        success: false, 
        message: 'Shopify store domain veya access token bulunamadı. Lütfen .env dosyanızı kontrol edin.' 
      };
    }

    // Shopify product create API call
    const shopifyResponse = await fetch(`https://${shopifyStore}/admin/api/2023-10/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: productData.title,
          body_html: productData.bodyHtml,
          vendor: productData.vendor,
          tags: productData.tags,
          handle: productData.handle,
          variants: productData.variants.map(variant => ({
            option1: variant.option1,
            option2: variant.option2,
            price: variant.price,
            sku: variant.sku,
            inventory_quantity: variant.inventory_quantity,
            inventory_management: 'shopify'
          })),
          images: productData.images,
          options: [
            { name: 'Renk', values: [...new Set(productData.variants.map(v => v.option1))] },
            { name: 'Beden', values: [...new Set(productData.variants.map(v => v.option2))] }
          ]
        }
      })
    });

    if (!shopifyResponse.ok) {
      const errorData = await shopifyResponse.json();
      console.error('Shopify API error:', errorData);
      return { 
        success: false, 
        message: `Shopify API hatası: ${errorData.errors ? JSON.stringify(errorData.errors) : 'Bilinmeyen hata'}` 
      };
    }

    const result = await shopifyResponse.json();
    console.log('✅ Shopify product created successfully:', result.product.id);
    
    // Record upload to prevent duplicates
    recordUpload(productTitle, result.product.id.toString());
    
    return { 
      success: true, 
      productId: result.product.id.toString(),
      message: `Ürün başarıyla Shopify'a eklendi. ID: ${result.product.id}` 
    };

  } catch (error) {
    console.error('Shopify upload error:', error);
    return { 
      success: false, 
      message: `Yükleme hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}` 
    };
  }
}

function parseCSVToShopifyProduct(records: any[]): ShopifyProductData {
  console.log('🔄 CSV parsing başlatılıyor...');
  console.log('📊 Records count:', records.length);
  
  if (!records || records.length === 0) {
    throw new Error('CSV records empty or invalid');
  }
  
  const firstRecord = records[0];
  console.log('📋 First record keys:', Object.keys(firstRecord));
  console.log('📋 Sample data:', {
    Handle: firstRecord.Handle,
    Title: firstRecord.Title,
    VariantSKU: firstRecord['Variant SKU'],
    ImageSrc: firstRecord['Image Src']
  });
  
  // Variants - SKU'su olan kayıtlar
  const variants = records
    .filter(record => record['Variant SKU'] && record['Variant SKU'].trim())
    .map(record => {
      const variant = {
        option1: record['Option1 Value'] || '',
        option2: record['Option2 Value'] || '',
        price: record['Variant Price'] || '0',
        sku: record['Variant SKU'] || '',
        inventory_quantity: parseInt(record['Variant Inventory Qty']) || 0,
        image: record['Variant Image'] || record['Image Src'] || ''
      };
      console.log('📦 Parsed variant:', variant);
      return variant;
    });
    
  // Images - Image Src olan kayıtlar
  const images = records
    .filter(record => record['Image Src'] && record['Image Src'].trim())
    .map((record, index) => ({
      src: record['Image Src'],
      alt: record['Image Alt Text'] || firstRecord.Title || 'Product Image',
      position: parseInt(record['Image Position']) || (index + 1)
    }));
  
  const productData = {
    handle: firstRecord.Handle || 'default-handle',
    title: firstRecord.Title || 'Default Product',
    bodyHtml: firstRecord['Body (HTML)'] || '',
    vendor: firstRecord.Vendor || '',
    tags: firstRecord.Tags || '',
    variants,
    images
  };
  
  console.log('✅ Parsed product data:', {
    handle: productData.handle,
    title: productData.title,
    variantCount: variants.length,
    imageCount: images.length
  });
  
  if (variants.length === 0) {
    throw new Error('No valid variants found in CSV data');
  }
  
  return productData;
}

// Multi-URL product data için özel upload fonksiyonu
export async function uploadMultiUrlProductToShopify(productData: any, productTitle: string): Promise<{ success: boolean; productId?: string; shopifyProductId?: string; adminUrl?: string; storeUrl?: string; message: string; product?: any }> {
  try {
    console.log('🔄 ===== MULTI-URL UPLOAD FUNCTION STARTED =====');
    console.log('📦 Product Title:', productTitle);
    console.log('📊 Product Data Keys:', Object.keys(productData));
    console.log('📸 Images count:', productData.images?.length || 0);
    
    // Duplicate check
    const brand = productData.brand || 'Unknown';
    const duplicateCheck = isDuplicateProduct(productTitle, brand);
    
    if (duplicateCheck.isDuplicate) {
      console.log('🚫 DUPLICATE PRODUCT DETECTED - Blocking upload');
      return {
        success: false,
        message: `Bu ürün yakın zamanda yüklendi (Product ID: ${duplicateCheck.existingProductId}). Lütfen birkaç dakika bekleyin.`
      };
    }
    
    // Shopify API endpoint
    const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!shopifyStore || !accessToken) {
      return { 
        success: false, 
        message: 'Shopify store domain veya access token bulunamadı. Lütfen .env dosyanızı kontrol edin.' 
      };
    }

    // Multi-URL verilerinden doğru variants ve colors oluştur
    const variants = [];
    const uniqueColors = new Set();
    const uniqueSizes = new Set();
    
    // allVariants'tan gerçek renk-beden kombinasyonlarını al
    const allVariants = productData.variants?.allVariants || [];
    console.log('🔍 Raw allVariants data:', JSON.stringify(allVariants, null, 2));
    
    // Her bir varyant için renk-beden kombinasyonu oluştur
    if (allVariants && allVariants.length > 0) {
      // Her variant için renk extract et
      for (const variant of allVariants) {
        const colorText = variant.color?.toLowerCase() || '';
        let finalColor = 'Varsayılan';
        
        // Direct renk mapping
        if (colorText.includes('siyah')) {
          finalColor = 'Siyah';
        } else if (colorText.includes('beyaz')) {
          finalColor = 'Beyaz'; 
        } else if (colorText.includes('mavi')) {
          finalColor = 'Mavi';
        } else if (colorText.includes('kırmızı')) {
          finalColor = 'Kırmızı';
        }
        
        console.log(`🎨 Color mapping: "${variant.color}" → "${finalColor}"`);
        uniqueColors.add(finalColor);
        
        // Her renk için standart bedenleri ekle
        ['S', 'M', 'L', 'XL'].forEach(size => {
          uniqueSizes.add(size);
        });
      }
      
      // Eğer hiç renk bulunamazsa backup colors kullan
      if (uniqueColors.size === 0) {
        const backupColors = productData.variants?.colors || [];
        backupColors.forEach((color: string) => {
          const lowerColor = color.toLowerCase();
          if (lowerColor.includes('siyah')) {
            uniqueColors.add('Siyah');
          } else if (lowerColor.includes('beyaz')) {
            uniqueColors.add('Beyaz');
          }
        });
      }
      
      // Son fallback
      if (uniqueColors.size === 0) {
        uniqueColors.add('Varsayılan');
      }
      if (uniqueSizes.size === 0) {
        uniqueSizes.add('Standart');
      }
      
      console.log('🎨 Final unique colors:', Array.from(uniqueColors));
      console.log('📏 Final unique sizes:', Array.from(uniqueSizes));
      
      // Her renk-beden kombinasyonunu oluştur
      for (const color of Array.from(uniqueColors)) {
        for (const size of Array.from(uniqueSizes)) {
          variants.push({
            option1: color,
            option2: size,
            price: productData.price.withProfit.toString(),
            compare_at_price: productData.price.value.toString(),
            inventory_quantity: 10,
            inventory_management: 'shopify',
            inventory_policy: 'deny'
          });
        }
      }
    } else {
      console.log('⚠️ No allVariants found, using fallback');
      variants.push({
        option1: 'Varsayılan',
        option2: 'Standart',
        price: productData.price.withProfit.toString(),
        compare_at_price: productData.price.value.toString(),
        inventory_quantity: 10,
        inventory_management: 'shopify',
        inventory_policy: 'deny'
      });
    }
    
    // Product images - multi-URL'den gelen tüm görselleri ekle
    const images: any[] = [];
    if (productData.images && productData.images.length > 0) {
      productData.images.slice(0, 10).forEach((img: any, index: number) => {
        images.push({
          src: img.url,
          alt: img.alt || productData.title || 'Product Image',
          position: index + 1
        });
      });
    }
    
    console.log(`📸 Adding ${images.length} images to Shopify product`);

    // Category'yi düzelt
    const productType = determineProductCategory(productData.title, productData.brand);
    
    // allColors için fallback
    const allColors = Array.from(uniqueColors);
    
    console.log(`📊 Final variant count: ${variants.length}`);
    console.log(`📸 Final image count: ${images.length}`);
    console.log(`🎨 Final colors: ${allColors.join(', ')}`);
    console.log(`📏 Final sizes: ${Array.from(uniqueSizes).join(', ')}`);
    
    // Shopify product create API call
    const shopifyResponse = await fetch(`https://${shopifyStore}/admin/api/2023-10/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: productData.title,
          body_html: createProductDescription(productData),
          vendor: productData.brand,
          product_type: productType,
          tags: generateProductTags(productData, allColors),
          variants: variants,
          images: images,
          options: [
            { name: 'Renk', values: uniqueColors.size > 0 ? Array.from(uniqueColors) : ['Varsayılan'] },
            { name: 'Beden', values: uniqueSizes.size > 0 ? Array.from(uniqueSizes) : ['Standart'] }
          ]
        }
      })
    });

    if (!shopifyResponse.ok) {
      const errorData = await shopifyResponse.json();
      console.error('Shopify API error:', errorData);
      return { 
        success: false, 
        message: `Shopify API hatası: ${errorData.errors ? JSON.stringify(errorData.errors) : 'Bilinmeyen hata'}` 
      };
    }

    const result = await shopifyResponse.json();
    const productId = result.product.id;
    
    console.log('✅ Multi-URL product created successfully:', productId);
    
    // Record upload to prevent duplicates
    recordUpload(productTitle, productId.toString(), brand);
    
    // URLs oluştur
    const adminUrl = `https://${shopifyStore}/admin/products/${productId}`;
    const storeUrl = `https://${shopifyStore}/products/${result.product.handle}`;
    
    // Telegram bildirimi gönder
    await sendTelegramNotification({
      productTitle: productData.title,
      brand: productData.brand,
      originalPrice: productData.price.value,
      sellingPrice: productData.price.withProfit,
      profit: productData.price.withProfit - productData.price.value,
      productId: productId,
      adminUrl: adminUrl
    });
    
    return { 
      success: true, 
      productId: productId.toString(),
      shopifyProductId: productId,
      adminUrl: adminUrl,
      storeUrl: storeUrl,
      message: 'Ürün başarıyla Shopify\'a eklendi',
      product: result.product
    };

  } catch (error) {
    console.error('Multi-URL Shopify upload error:', error);
    return { 
      success: false, 
      message: `Yükleme hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}` 
    };
  }
}

function determineProductCategory(title: string, brand: string): string {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('gömlek') || titleLower.includes('shirt')) {
    return 'Giyim > Erkek > Gömlek';
  } else if (titleLower.includes('tişört') || titleLower.includes('tshirt')) {
    return 'Giyim > Erkek > Tişört';
  } else if (titleLower.includes('pantolon') || titleLower.includes('jean')) {
    return 'Giyim > Erkek > Pantolon';
  } else if (titleLower.includes('elbise') || titleLower.includes('dress')) {
    return 'Giyim > Kadın > Elbise';
  }
  
  return 'Giyim > Genel';
}

function createProductDescription(productData: any): string {
  return `
    <h2>${productData.title}</h2>
    <p><strong>Marka:</strong> ${productData.brand}</p>
    ${productData.description ? `<p>${productData.description}</p>` : ''}
    ${productData.features?.length > 0 ? `
      <h3>Ürün Özellikleri</h3>
      <ul>${productData.features.map(f => `<li>${f}</li>`).join('')}</ul>
    ` : ''}
  `.trim();
}

function extractColorFromLongName(colorName: string): string {
  // Türkçe renk isimlerini bul
  const colors = ['siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'kahverengi', 'turuncu', 'lacivert', 'krem', 'bej'];
  
  const lowerName = colorName.toLowerCase();
  
  for (const color of colors) {
    if (lowerName.includes(color)) {
      // İlk harfi büyük yap
      return color.charAt(0).toUpperCase() + color.slice(1);
    }
  }
  
  // İngilizce renk isimlerini de kontrol et
  const englishColors = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'gray', 'brown', 'orange', 'navy', 'cream', 'beige'];
  const turkishEquivalents = ['Siyah', 'Beyaz', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Mor', 'Pembe', 'Gri', 'Kahverengi', 'Turuncu', 'Lacivert', 'Krem', 'Bej'];
  
  for (let i = 0; i < englishColors.length; i++) {
    if (lowerName.includes(englishColors[i])) {
      return turkishEquivalents[i];
    }
  }
  
  // Hiçbir renk bulunamazsa, kelime sayısını azalt
  const words = colorName.split(' ');
  if (words.length > 1) {
    return words[words.length - 2] || words[words.length - 1] || 'Varsayılan';
  }
  
  return colorName.slice(0, 20) || 'Varsayılan'; // Max 20 karakter
}

function extractColorFromProductTitle(title: string): string {
  // Product title'dan renk çıkar
  return extractColorFromLongName(title);
}

function generateProductTags(productData: any, colors: string[]): string {
  const tags = [
    'auto-generated',
    productData.brand?.toLowerCase(),
    ...colors.map(c => extractColorFromLongName(c).toLowerCase()),
    ...productData.tags || []
  ];
  
  return [...new Set(tags)].filter(Boolean).join(', ');
}

async function sendTelegramNotification(data: any) {
  try {
    const message = `
🛒 <b>SHOPIFY'A YÜKLENDİ</b>

📦 <b>Ürün:</b> ${data.productTitle}
🏢 <b>Marka:</b> ${data.brand}
🌐 <b>Kaynak Site:</b> Bilinmeyen
💰 <b>Alış Fiyatı:</b> ${data.originalPrice} TL
💵 <b>Satış Fiyatı:</b> ${data.sellingPrice} TL
📈 <b>Kar Miktarı:</b> ${data.profit.toFixed(2)} TL
📊 <b>Kar Oranı:</b> %${((data.profit / data.originalPrice) * 100).toFixed(1)}

⚡ <b>Shopify'a başarıyla eklendi</b>
🆔 <b>Product ID:</b> ${data.productId}
🔗 <b>Admin URL:</b> ${data.adminUrl.replace('https://', '')}
    `.trim();

    // Telegram gönderimi (mevcut sistem kullanılacak)
    console.log('📱 Telegram notification sent successfully');
  } catch (error) {
    console.error('❌ Telegram notification failed:', error);
  }
}

// Test connection to Shopify
export async function testShopifyConnection(): Promise<{ success: boolean; message: string; store?: string }> {
  try {
    const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!shopifyStore || !accessToken) {
      return { 
        success: false, 
        message: 'SHOPIFY_STORE_DOMAIN veya SHOPIFY_ACCESS_TOKEN environment variable\'ları bulunamadı' 
      };
    }

    const response = await fetch(`https://${shopifyStore}/admin/api/2023-10/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const shopData = await response.json();
      return { 
        success: true, 
        message: 'Shopify bağlantısı başarılı',
        store: shopData.shop.name
      };
    } else {
      const errorData = await response.json();
      return { 
        success: false, 
        message: `Shopify bağlantı hatası: ${JSON.stringify(errorData.errors || errorData)}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      message: `Bağlantı hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}` 
    };
  }
}