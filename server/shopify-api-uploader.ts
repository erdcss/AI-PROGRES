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
  const firstRecord = records[0];
  
  console.log('🔍 Parsing CSV to Shopify product...');
  console.log('Handle:', firstRecord.Handle);
  console.log('Title:', firstRecord.Title);
  console.log('Body HTML:', firstRecord['Body (HTML)']?.substring(0, 100) + '...');
  console.log('Vendor:', firstRecord.Vendor);
  
  const productData: ShopifyProductData = {
    handle: firstRecord.Handle || 'default-handle',
    title: firstRecord.Title || 'Untitled Product',
    bodyHtml: firstRecord['Body (HTML)'] || '',
    vendor: firstRecord.Vendor || 'Unknown',
    tags: firstRecord.Tags || '',
    variants: [],
    images: []
  };

  // Variants'ları parse et
  const variantRecords = records.filter(record => 
    record['Option1 Value'] && record['Option2 Value']
  );

  variantRecords.forEach(record => {
    productData.variants.push({
      option1: record['Option1 Value'], // Renk
      option2: record['Option2 Value'], // Beden
      price: record['Variant Price'],
      sku: record['Variant SKU'],
      inventory_quantity: parseInt(record['Variant Inventory Qty']) || 0,
      image: record['Variant Image']
    });
  });

  // Images'ları parse et
  const imageRecords = records.filter(record => 
    record['Image Src'] && record['Image Position']
  );

  imageRecords.forEach(record => {
    productData.images.push({
      src: record['Image Src'],
      alt: record['Image Alt Text'] || productData.title,
      position: parseInt(record['Image Position']) || 1
    });
  });

  return productData;
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