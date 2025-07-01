/**
 * Görsel Debug - Trendyol görsel çıkarma problemini tespit et
 */

export async function debugImageExtraction(url: string) {
  console.log(`🔍 Görsel debug başlatılıyor: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  const htmlContent = await response.text();
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
  
  if (!productStateMatch) {
    return { error: 'Product state bulunamadı' };
  }
  
  const productState = JSON.parse(productStateMatch[1]);
  const product = productState.product;
  
  console.log(`📦 Product objesi mevcut: ${!!product}`);
  console.log(`🖼️ Product.images mevcut: ${!!product?.images}`);
  console.log(`📸 Images array length: ${product?.images?.length || 0}`);
  
  if (product?.images?.length > 0) {
    console.log(`🔍 İlk görsel objesi:`, JSON.stringify(product.images[0], null, 2));
  }
  
  // Tüm olası görsel alanlarını kontrol et
  const imageFields = {
    'product.images': product?.images,
    'product.productImages': product?.productImages,
    'product.galleryImages': product?.galleryImages,
    'product.media': product?.media,
    'productState.gallery': productState?.gallery,
    'productState.productDetail': productState?.productDetail
  };
  
  console.log(`📊 Görsel alanları:`, Object.keys(imageFields).map(key => ({
    field: key,
    exists: !!imageFields[key],
    type: typeof imageFields[key],
    length: Array.isArray(imageFields[key]) ? imageFields[key].length : 'N/A'
  })));
  
  return {
    success: true,
    productExists: !!product,
    imageFields
  };
}