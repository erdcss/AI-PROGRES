/**
 * Shopify Manuel Yükleme Sistemi - Varyant Limitini Çözen Sistem
 * 112 varyant → 99 varyant limitine manuel kontrol ile çözüm
 */

import { ManualColorOverride, type ManualColorSelection } from './manual-color-override';

export interface ShopifyManualUploadRequest {
  productData: {
    success: boolean;
    title: string;
    brand: string;
    price: {
      original: number;
      withProfit: number;
    };
    images: string[];
    features: Array<{ key: string; value: string }>;
    variants: Array<{
      color: string;
      size: string;
      inStock: boolean;
      price?: number;
    }>;
  };
  manualSelection?: ManualColorSelection;
}

export interface ShopifyManualUploadResponse {
  success: boolean;
  shopifyProductId?: number;
  adminUrl?: string;
  storeUrl?: string;
  message: string;
  variantInfo?: {
    original: number;
    filtered: number;
    created: number;
  };
  error?: string;
}

export async function processManualShopifyUpload(
  requestData: ShopifyManualUploadRequest
): Promise<ShopifyManualUploadResponse> {
  try {
    const { productData, manualSelection } = requestData;
    
    if (!productData || !productData.success) {
      return {
        success: false,
        message: 'Geçerli product data gerekli',
        error: 'Invalid product data'
      };
    }

    // Manuel seçim varsayılan değerleri
    const defaultSelection: ManualColorSelection = {
      selectedColors: [],
      selectedSizes: [],
      maxVariants: 99
    };
    
    const selection = { ...defaultSelection, ...manualSelection };
    
    // Varyant verilerini çıkar
    const rawVariants = productData.variants || [];
    const extractedColors = [...new Set(rawVariants.map(v => v.color).filter(Boolean))];
    const extractedSizes = [...new Set(rawVariants.map(v => v.size).filter(Boolean))];
    
    console.log(`📊 Varyant analizi: ${extractedColors.length} renk x ${extractedSizes.length} beden = ${extractedColors.length * extractedSizes.length} toplam`);
    
    // Manuel filtre uygula
    const colorOverride = ManualColorOverride.filterVariants(
      extractedColors,
      extractedSizes,
      selection
    );
    
    console.log(`🎨 Manuel filtre: ${colorOverride.message}`);
    
    // Shopify limitini kontrol et
    if (colorOverride.variantCount > 99) {
      return {
        success: false,
        message: `Varyant sayısı Shopify limitini aşıyor: ${colorOverride.variantCount} > 99`,
        error: 'Variant limit exceeded',
        variantInfo: {
          original: extractedColors.length * extractedSizes.length,
          filtered: colorOverride.variantCount,
          created: 0
        }
      };
    }
    
    // Filtrelenmiş varyantları oluştur
    const filteredVariants = [];
    for (const color of colorOverride.filteredColors) {
      for (const size of colorOverride.filteredSizes) {
        const originalVariant = rawVariants.find(v => v.color === color && v.size === size);
        filteredVariants.push({
          color,
          size,
          inStock: originalVariant?.inStock ?? true,
          price: originalVariant?.price ?? productData.price.withProfit
        });
      }
    }
    
    // Shopify varyant fixer kullan
    const { ShopifyVariantFixer } = await import('./shopify-variant-fixer');
    const cleanVariants = ShopifyVariantFixer.cleanAndDeduplicateVariants(filteredVariants);
    
    console.log(`🔧 Temizlenmiş varyantlar: ${cleanVariants.length}`);
    
    // Shopify product objesi oluştur
    const shopifyVariants = ShopifyVariantFixer.createShopifyVariants(cleanVariants, productData.price.withProfit);
    const productOptions = ShopifyVariantFixer.createProductOptions(cleanVariants);
    
    // Özellikler HTML formatında
    let featuresHtml = '';
    if (productData.features && productData.features.length > 0) {
      featuresHtml = '<h3>Ürün Özellikleri:</h3><ul>';
      productData.features.forEach(feature => {
        featuresHtml += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
      });
      featuresHtml += '</ul>';
    }
    
    const bodyHtml = `${productData.brand} ${productData.title}. ${featuresHtml}`;
    
    // Shopify product payload
    const shopifyProduct = {
      title: productData.title,
      body_html: bodyHtml,
      vendor: productData.brand,
      product_type: "Giyim > Genel",
      status: "active",
      published: true,
      tags: "manuel-upload, varyant-kontrol",
      variants: shopifyVariants,
      options: productOptions,
      images: productData.images.map(url => ({ src: url }))
    };
    
    // Shopify API'ye gönder
    const { shopifyIntegration } = await import('./shopify-integration');
    const result = await shopifyIntegration.createProduct(shopifyProduct);
    
    if (result.success && result.product) {
      const productId = result.product.id;
      const handle = result.product.handle;
      
      return {
        success: true,
        shopifyProductId: productId,
        adminUrl: `https://kr5xdy-x7.myshopify.com/admin/products/${productId}`,
        storeUrl: `https://kr5xdy-x7.myshopify.com/products/${handle}`,
        message: `Ürün başarıyla oluşturuldu (${cleanVariants.length} varyant)`,
        variantInfo: {
          original: extractedColors.length * extractedSizes.length,
          filtered: colorOverride.variantCount,
          created: cleanVariants.length
        }
      };
    } else {
      return {
        success: false,
        message: 'Shopify ürün oluşturma başarısız',
        error: result.error || 'Unknown Shopify error'
      };
    }
    
  } catch (error) {
    console.error('Manuel Shopify upload hatası:', error);
    return {
      success: false,
      message: 'Manuel upload sistemi hatası',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}