/**
 * Debug Simple Extractor - Test amaçlı basit veri çıkarıcı
 */

export async function debugSimpleExtraction(url: string) {
  console.log(`🔍 DEBUG: Basit extraction başlatılıyor: ${url}`);
  
  try {
    // Test URL'i ile sayfa çek
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log(`📡 Response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`❌ HTTP Hatası: ${response.status}`);
      return { error: `HTTP ${response.status}` };
    }
    
    const htmlContent = await response.text();
    console.log(`📄 HTML length: ${htmlContent.length}`);
    
    // Product state regex testi
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
    
    if (!productStateMatch) {
      console.log(`❌ Product state bulunamadı`);
      return { error: 'Product state yok' };
    }
    
    console.log(`✅ Product state bulundu, parsing...`);
    
    try {
      const productState = JSON.parse(productStateMatch[1]);
      const product = productState.product;
      
      if (!product) {
        console.log(`❌ Product objesi yok`);
        return { error: 'Product objesi bulunamadı' };
      }
      
      // Temel veriler
      const brand = product.brand?.name || 'Bilinmiyor';
      const title = product.name || 'Başlık yok';
      
      console.log(`📦 Marka: ${brand}`);
      console.log(`📝 Başlık: ${title}`);
      
      // Görseller
      const images: string[] = [];
      if (product.images) {
        product.images.forEach((img: any) => {
          if (img?.url && img.url.includes('dsmcdn.com')) {
            images.push(img.url);
          }
        });
      }
      console.log(`🖼️ Ana görseller: ${images.length} adet`);
      
      // Varyantlar
      const variants: any[] = [];
      if (product.allVariants) {
        product.allVariants.forEach((variant: any) => {
          const attributes = variant.attributes || {};
          const color = attributes.RENK || attributes.Renk || variant.color || 'Varsayılan';
          const size = attributes.BEDEN || attributes.Beden || variant.size || 'Tek Beden';
          const stockCount = variant.stock || variant.stockCount || 0;
          const inStock = stockCount > 0;
          
          if (inStock) {
            variants.push({ color, size, inStock, stockCount });
          }
        });
      }
      console.log(`🎨 Varyantlar: ${variants.length} adet (stokta)`);
      
      // Özellikler
      const features: any[] = [];
      if (product.attributes) {
        Object.entries(product.attributes).forEach(([key, value]: [string, any]) => {
          if (key && value && typeof value === 'string' && key.length < 30 && value.length < 50) {
            features.push({ key, value });
          }
        });
      }
      console.log(`📋 Özellikler: ${features.length} adet`);
      
      const result = {
        success: true,
        brand,
        title,
        images,
        variants,
        features,
        summary: {
          imageCount: images.length,
          variantCount: variants.length,
          featureCount: features.length
        }
      };
      
      console.log(`✅ DEBUG extraction tamamlandı`);
      return result;
      
    } catch (parseError) {
      console.log(`❌ JSON parse hatası: ${parseError.message}`);
      return { error: 'JSON parse hatası' };
    }
    
  } catch (fetchError) {
    console.log(`❌ Fetch hatası: ${fetchError.message}`);
    return { error: 'Fetch hatası' };
  }
}