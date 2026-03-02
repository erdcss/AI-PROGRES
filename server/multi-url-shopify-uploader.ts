// Multi-URL Product için özel Shopify uploader
// Bu dosya multi-URL product verilerini direkt Shopify API'ye doğru formatta gönderir

import { parse } from 'csv-parse/sync';
import { getShopifyConfig } from './shopify-credentials';

interface MultiUrlProductData {
  title: string;
  brand?: string;
  price: {
    original: number;
    withProfit: number;
  };
  images: string[] | Array<{
    url: string;
    alt?: string;
  }>;
  variants: {
    colors: string[];
    sizes?: string[];
    allVariants?: any[];
    stockMap?: Record<string, boolean>;
  };
}

// Renk extraction helper
function extractColorFromProductName(productName: string): string {
  const text = productName.toLowerCase();
  
  if (text.includes('beyaz') || text.includes('white')) return 'Beyaz';
  if (text.includes('siyah') || text.includes('black')) return 'Siyah';
  if (text.includes('yesil') || text.includes('yeşil') || text.includes('green')) return 'Yeşil';
  if (text.includes('mavi') || text.includes('blue')) return 'Mavi';
  if (text.includes('kirmizi') || text.includes('kırmızı') || text.includes('red')) return 'Kırmızı';
  if (text.includes('sari') || text.includes('sarı') || text.includes('yellow')) return 'Sarı';
  if (text.includes('pembe') || text.includes('pink')) return 'Pembe';
  if (text.includes('mor') || text.includes('purple')) return 'Mor';
  if (text.includes('turuncu') || text.includes('orange')) return 'Turuncu';
  if (text.includes('gri') || text.includes('gray') || text.includes('grey')) return 'Gri';
  
  return 'Çok Renkli';
}

// Duplicate prevention system
const recentUploads = new Map<string, { timestamp: number; productId: string }>();

function isDuplicateProduct(title: string, brand?: string): { isDuplicate: boolean; existingProductId?: string } {
  const key = `${title}-${brand || 'unknown'}`.toLowerCase();
  const existing = recentUploads.get(key);
  
  if (existing && Date.now() - existing.timestamp < 300000) { // 5 dakika
    return { isDuplicate: true, existingProductId: existing.productId };
  }
  
  return { isDuplicate: false };
}

function recordUpload(title: string, productId: string, brand?: string): void {
  const key = `${title}-${brand || 'unknown'}`.toLowerCase();
  recentUploads.set(key, { timestamp: Date.now(), productId });
}

export async function uploadMultiUrlProductToShopify(
  productData: MultiUrlProductData, 
  productTitle: string,
  customTags: string[] = []
): Promise<{ 
  success: boolean; 
  productId?: string; 
  message: string; 
  product?: any;
  adminUrl?: string;
}> {
  try {
    console.log('🚀 MULTI-URL UPLOADER BAŞLATILIYOR');
    console.log('📦 Product Title:', productTitle);
    console.log('🏷️ Custom Tags:', customTags);
    console.log('🎨 Colors data:', productData.variants?.colors);
    
    // Duplicate check
    const brand = productData.brand || 'Unknown';
    const duplicateCheck = isDuplicateProduct(productTitle, brand);
    
    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        message: `Bu ürün yakın zamanda yüklendi (Product ID: ${duplicateCheck.existingProductId}). Lütfen birkaç dakika bekleyin.`
      };
    }

    // Shopify credentials
    const shopifyConfigMu = await getShopifyConfig();
    if (!shopifyConfigMu) {
      return { 
        success: false, 
        message: 'Shopify kimlik bilgileri bulunamadı. Lütfen Shopify bağlantı ayarlarını yapın.' 
      };
    }
    const shopifyStore = shopifyConfigMu.shopDomain;
    const accessToken = shopifyConfigMu.accessToken;

    // Extract real variant data
    const allVariants = productData.variants?.allVariants || [];
    const colors = productData.variants?.colors || [];
    const sizes = productData.variants?.sizes || [];
    
    console.log('🎨 Real variant data:', { 
      totalVariants: allVariants.length, 
      colors: colors.length, 
      sizes: sizes.length 
    });

    // Create Shopify variants from real data
    let variants = [];
    
    if (allVariants.length > 0) {
      // Use real variants with actual color and size combinations
      variants = allVariants.map((v: any) => ({
        option1: v.color || 'Default',
        option2: v.size || 'Tek Beden',
        price: productData.price.withProfit.toFixed(2),
        compare_at_price: productData.price.original.toFixed(2),
        inventory_quantity: 0,
        inventory_management: null,
        inventory_policy: 'continue',
        requires_shipping: true,
        taxable: true,
        fulfillment_service: 'manual'
      }));
      console.log(`✅ Created ${variants.length} real variants from extracted data`);
    } else {
      // Fallback: single variant with Default values
      variants = [{
        option1: 'Default',
        option2: 'Tek Beden',
        price: productData.price.withProfit.toFixed(2),
        compare_at_price: productData.price.original.toFixed(2),
        inventory_quantity: 0,
        inventory_management: null,
        inventory_policy: 'continue',
        requires_shipping: true,
        taxable: true,
        fulfillment_service: 'manual'
      }];
      console.log('⚠️ No variants found - created single default variant');
    }

    console.log(`📊 Total variants: ${variants.length}`);

    // Prepare images - Support both string[] and object[] formats
    let imageUrls: string[] = [];
    
    if (Array.isArray(productData.images)) {
      imageUrls = productData.images.map(img => {
        // Handle both string[] and {url: string}[] formats
        if (typeof img === 'string') {
          return img;
        } else if (img && typeof img === 'object' && img.url) {
          return img.url;
        }
        return '';
      }).filter(url => url && url.startsWith('http'));
    }
    
    console.log(`📸 Processing ${imageUrls.length} image URLs for Shopify upload`);
    imageUrls.forEach((url, index) => {
      console.log(`📸 Image ${index + 1}: ${url}`);
    });
    
    const images = imageUrls.map((imageUrl, index) => ({
      src: imageUrl,
      alt: `${productTitle} - Image ${index + 1}`,
      position: index + 1
    }));

    console.log(`📸 Validated ${images.length} images for upload`);
    if (images.length > 0) {
      console.log('📸 First image URL:', images[0].src);
    }

    // Create Shopify product with proper options for variants
    const hasMultipleVariants = variants.length > 1 || 
                                (variants[0].option1 !== 'Default' || variants[0].option2 !== 'Tek Beden');
    
    // Combine automatic and custom tags
    const automaticTags = ['multi-url', 'auto-generated'];
    const allTags = [...automaticTags, ...customTags].filter(tag => tag && tag.trim().length > 0);
    const tagsString = allTags.join(', ');
    
    console.log('🏷️ Final tags for Shopify:', tagsString);
    
    const productPayload: any = {
      product: {
        title: productTitle,
        body_html: `<p>${productTitle}</p>`,
        vendor: brand,
        product_type: 'Apparel & Accessories > Clothing',
        tags: tagsString,
        handle: productTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
        status: 'active',
        published: true,
        variants: variants,
        images: images
      }
    };

    // Add options if we have real variant data
    if (hasMultipleVariants) {
      productPayload.product.options = [
        { name: 'Renk', values: colors.length > 0 ? colors : ['Default'] },
        { name: 'Beden', values: sizes.length > 0 ? sizes : ['Tek Beden'] }
      ];
      console.log('✅ Added options to product payload:', productPayload.product.options);
    }

    console.log('📤 Shopify API request payload hazırlandı');
    console.log('🔍 First variant:', JSON.stringify(variants[0], null, 2));

    const shopifyResponse = await fetch(`https://${shopifyStore}/admin/api/2023-10/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(productPayload)
    });

    const responseText = await shopifyResponse.text();
    
    if (!shopifyResponse.ok) {
      console.error('❌ Shopify API Error:', responseText);
      return { 
        success: false, 
        message: `Shopify API hatası: ${responseText}` 
      };
    }

    const result = JSON.parse(responseText);
    const productId = result.product.id;
    
    console.log('✅ Product created with ID:', productId);
    console.log('📸 Created product images count:', result.product.images?.length || 0);
    if (result.product.images && result.product.images.length > 0) {
      console.log('📸 First created image URL:', result.product.images[0].src);
    } else {
      console.log('❌ NO IMAGES WERE UPLOADED TO SHOPIFY!');
      console.log('📸 Sent images to API:', images.length);
    }
    
    // Record upload
    recordUpload(productTitle, productId.toString(), brand);
    
    // Admin URL
    const adminUrl = `${shopifyStore}/admin/products/${productId}`;

    return {
      success: true,
      productId: productId.toString(),
      message: 'Ürün başarıyla Shopify\'a yüklendi',
      product: result.product,
      adminUrl: adminUrl
    };

  } catch (error) {
    console.error('❌ Multi-URL upload error:', error);
    return {
      success: false,
      message: `Upload hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`
    };
  }
}