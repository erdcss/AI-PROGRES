/**
 * Basit Trendyol Extractor - Sadece temel ürün verilerini çıkarır
 */

export interface SimpleTrendyolData {
  brand: string;
  title: string;
  images: string[];
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
    stockCount: number;
  }>;
  features: Array<{
    key: string;
    value: string;
  }>;
}

export async function extractSimpleTrendyolData(url: string): Promise<{
  success: boolean;
  data?: SimpleTrendyolData;
  error?: string;
}> {
  try {
    console.log(`🔍 Basit Trendyol extraction başlatılıyor: ${url}`);
    
    // Sayfa içeriğini al
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const htmlContent = await response.text();
    
    // Product state JSON'ını çıkar
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
    if (!productStateMatch) {
      throw new Error('Ürün verisi bulunamadı');
    }
    
    const productState = JSON.parse(productStateMatch[1]);
    const product = productState.product;
    
    if (!product) {
      throw new Error('Ürün bilgisi bulunamadı');
    }
    
    // 1. Marka bilgisi
    const brand = product.brand?.name || 'Bilinmiyor';
    
    // 2. Ürün başlığı
    const title = product.name || 'Ürün başlığı bulunamadı';
    
    // 3. Ürün görselleri
    const images: string[] = [];
    if (product.images) {
      product.images.forEach((img: any) => {
        if (img?.url && img.url.includes('dsmcdn.com')) {
          images.push(img.url);
        }
      });
    }
    
    // Varyant görsellerini de ekle
    if (product.allVariants) {
      product.allVariants.forEach((variant: any) => {
        if (variant?.images) {
          variant.images.forEach((img: any) => {
            const url = typeof img === 'string' ? img : img?.url;
            if (url && url.includes('dsmcdn.com') && !images.includes(url)) {
              images.push(url);
            }
          });
        }
      });
    }
    
    // 4. Ürün varyantları
    const variants: Array<{
      color: string;
      size: string;
      inStock: boolean;
      stockCount: number;
    }> = [];
    
    if (product.allVariants) {
      product.allVariants.forEach((variant: any) => {
        const attributes = variant.attributes || {};
        const color = attributes.RENK || attributes.Renk || variant.color || 'Varsayılan';
        const size = attributes.BEDEN || attributes.Beden || variant.size || 'Tek Beden';
        const stockCount = variant.stock || variant.stockCount || 0;
        const inStock = stockCount > 0;
        
        variants.push({
          color,
          size,
          inStock,
          stockCount
        });
      });
    }
    
    // 5. Ürün özellikleri
    const features: Array<{
      key: string;
      value: string;
    }> = [];
    
    if (product.attributes) {
      Object.entries(product.attributes).forEach(([key, value]: [string, any]) => {
        if (key && value && typeof value === 'string' && 
            key.length < 30 && value.length < 50 &&
            !key.includes('"') && !value.includes('"')) {
          features.push({ key, value });
        }
      });
    }
    
    // HTML'den ek özellikler
    const cheerio = await import('cheerio');
    const $ = cheerio.load(htmlContent);
    
    $('.product-feature-list li, .detail-attr-item').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes(':') && text.length < 100) {
        const [key, ...valueParts] = text.split(':');
        const value = valueParts.join(':').trim();
        if (key && value && key.length < 30 && value.length < 50) {
          features.push({ 
            key: key.trim(), 
            value: value 
          });
        }
      }
    });
    
    const data: SimpleTrendyolData = {
      brand,
      title,
      images: images.slice(0, 10), // İlk 10 görsel
      variants: variants.filter(v => v.inStock), // Sadece stokta olanlar
      features: features.slice(0, 15) // İlk 15 özellik
    };
    
    console.log(`✅ Extraction tamamlandı: ${data.variants.length} varyant, ${data.images.length} görsel, ${data.features.length} özellik`);
    
    return {
      success: true,
      data
    };
    
  } catch (error) {
    console.error('❌ Extraction hatası:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}