import { ShopifyIntegration } from './shopify-integration';

export async function createProductInShopify(productData: any) {
  const shopify = new ShopifyIntegration('turmarkt.com', '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');
  
  console.log('🛒 Shopify\'a ürün ekleniyor...');
  console.log(`📦 Ürün: ${productData.title}`);
  console.log(`🏷️ Marka: ${productData.brand}`);
  console.log(`💰 Orijinal fiyat: ${productData.price?.formatted || 'N/A'}`);
  console.log(`💰 Kar marjlı fiyat: ${productData.price?.profitFormatted || 'N/A'}`);
  console.log(`📸 Görsel sayısı: ${productData.images?.length || 0}`);
  console.log(`👕 Varyant sayısı: ${productData.variants?.length || 0}`);

  try {
    // Bağlantıyı test et
    const connected = await shopify.testConnection();
    if (!connected) {
      throw new Error('Shopify API bağlantısı başarısız');
    }

    // Ürün verilerini Shopify formatına hazırla
    const shopifyProduct = {
      id: Date.now(),
      trendyolUrl: productData.url || '',
      trendyolProductId: productData.url?.match(/p-(\d+)/)?.[1] || '',
      shopifyProductId: null,
      title: productData.title || 'Ürün Başlığı',
      brand: productData.brand || 'Bilinmeyen Marka',
      description: generateDescription(productData),
      category: 'Gıda',
      images: productData.images || [],
      features: productData.features || {},
      colorOptions: productData.colorOptions || [],
      sizeOptions: productData.sizeOptions || [],
      isActive: true,
      profitMargin: '15.00',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSyncAt: null,
      syncStatus: 'pending'
    };

    // Varyantları hazırla
    const variants = prepareVariants(productData);

    console.log('🔄 Shopify API\'ye gönderiliyor...');
    
    // Shopify'a gönder
    const shopifyProductId = await shopify.createProduct(shopifyProduct, variants);

    if (shopifyProductId) {
      console.log('✅ Başarılı! Ürün Shopify\'a eklendi');
      console.log(`🆔 Shopify Product ID: ${shopifyProductId}`);
      console.log(`🔗 Admin URL: https://turmarkt.com/admin/products/${shopifyProductId}`);
      console.log(`🔗 Store URL: https://turmarkt.com/products/${generateHandle(productData.title)}`);
      
      return {
        success: true,
        shopifyProductId,
        adminUrl: `https://turmarkt.com/admin/products/${shopifyProductId}`,
        storeUrl: `https://turmarkt.com/products/${generateHandle(productData.title)}`,
        message: 'Ürün başarıyla Shopify\'a eklendi'
      };
    } else {
      throw new Error('Shopify\'a ürün eklenirken hata oluştu');
    }

  } catch (error) {
    console.error('❌ Hata:', error.message);
    return {
      success: false,
      error: error.message,
      message: 'Ürün Shopify\'a eklenirken hata oluştu'
    };
  }
}

function generateDescription(productData: any): string {
  let description = `<h2>${productData.title}</h2>`;
  description += `<p><strong>Marka:</strong> ${productData.brand}</p>`;
  
  if (productData.features && Array.isArray(productData.features)) {
    description += '<h3>Ürün Özellikleri:</h3><ul>';
    productData.features.forEach((feature: any) => {
      if (feature.key && feature.value) {
        description += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
      }
    });
    description += '</ul>';
  }
  
  description += '<p><em>Trendyol\'dan otomatik olarak aktarılmıştır. %15 kar marjı eklenmiştir.</em></p>';
  
  return description;
}

function prepareVariants(productData: any): any[] {
  const variants = [];
  const basePrice = productData.price?.original || 0;
  const shopifyPrice = productData.price?.withProfit || (basePrice * 1.15);

  if (productData.variants && productData.variants.length > 0) {
    // Mevcut varyantları kullan
    productData.variants.forEach((variant: any, index: number) => {
      variants.push({
        id: index + 1,
        productId: 1,
        shopifyVariantId: null,
        color: variant.color || 'Varsayılan',
        size: variant.size || 'Tek Beden',
        sku: generateSku(productData.brand, variant.color, variant.size, index),
        trendyolPrice: basePrice.toFixed(2),
        shopifyPrice: shopifyPrice.toFixed(2),
        stockCount: variant.stockCount || 10,
        inStock: variant.inStock !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });
  } else {
    // Varsayılan varyant
    variants.push({
      id: 1,
      productId: 1,
      shopifyVariantId: null,
      color: 'Varsayılan',
      size: 'Tek Beden',
      sku: generateSku(productData.brand, 'Varsayılan', 'Tek Beden', 0),
      trendyolPrice: basePrice.toFixed(2),
      shopifyPrice: shopifyPrice.toFixed(2),
      stockCount: 20,
      inStock: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  return variants;
}

function generateSku(brand: string, color: string, size: string, index: number): string {
  const brandCode = (brand || 'BRAND').substring(0, 4).toUpperCase();
  const colorCode = (color || 'DEF').substring(0, 3).toUpperCase();
  const sizeCode = (size || 'OS').substring(0, 2).toUpperCase();
  return `${brandCode}-${colorCode}-${sizeCode}-${index + 1}`;
}

function generateHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}