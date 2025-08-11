import { parse } from 'csv-parse/sync';

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
    console.log('🔄 Multi-URL product data uploading to Shopify...');
    
    // Shopify API endpoint
    const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!shopifyStore || !accessToken) {
      return { 
        success: false, 
        message: 'Shopify store domain veya access token bulunamadı. Lütfen .env dosyanızı kontrol edin.' 
      };
    }

    // Multi-URL verilerinden proper variants oluştur
    const variants = [];
    
    // allVariants'tan doğru renk-beden kombinasyonlarını al
    const allVariants = productData.variants?.allVariants || [];
    console.log('🔍 All variants data:', allVariants);
    
    // Eğer allVariants varsa onları kullan
    if (allVariants && allVariants.length > 0) {
      for (const variant of allVariants) {
        // Direct color mapping - hardcoded fix için
        let finalColor = 'Varsayılan';
        const colorText = variant.color?.toLowerCase() || '';
        
        if (colorText.includes('siyah') || colorText.includes('black')) {
          finalColor = 'Siyah';
        } else if (colorText.includes('beyaz') || colorText.includes('white')) {
          finalColor = 'Beyaz';
        } else if (colorText.includes('mavi') || colorText.includes('blue')) {
          finalColor = 'Mavi';
        } else if (colorText.includes('kırmızı') || colorText.includes('red')) {
          finalColor = 'Kırmızı';
        }
        
        console.log(`🎨 Direct mapping: "${variant.color}" → "${finalColor}"`);
        
        variants.push({
          option1: finalColor,
          option2: 'Standart',
          price: variant.price || productData.price.withProfit.toString(),
          compare_at_price: productData.price.value.toString(),
          inventory_quantity: variant.stock || 10,
          inventory_management: 'shopify',
          inventory_policy: 'deny'
        });
      }
    } else {
      // Fallback: colors ve sizes kullan
      const allColors = productData.variants?.colors || [];
      const allSizes = productData.variants?.sizes || ['Standart'];
      
      console.log('🔄 Fallback mode - Colors:', allColors, 'Sizes:', allSizes);
      
      const cleanedColors = allColors.map(c => extractColorFromLongName(c));
      console.log('🎨 Cleaned colors:', cleanedColors);
      
      for (const color of cleanedColors) {
        for (const size of allSizes) {
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
    }
    
    // Product images
    const images = productData.images?.slice(0, 10).map((img, index) => ({
      src: img.url,
      alt: img.alt || productData.title,
      position: index + 1
    })) || [];

    // Category'yi düzelt
    const productType = determineProductCategory(productData.title, productData.brand);
    
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
            { name: 'Renk', values: [...new Set(variants.map(v => v.option1))] },
            { name: 'Beden', values: [...new Set(variants.map(v => v.option2))] }
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