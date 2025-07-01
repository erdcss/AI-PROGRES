/**
 * Scrapy benzeri JSON extraction sistemi
 * Trendyol ürün verilerini Scrapy spider yaklaşımıyla çıkarır
 */

export interface ScrapyProductData {
  product_title: string;
  brand: string;
  price: number;
  variant_name?: string;
  variant_price: number;
  color?: string;
  size?: string;
  image_urls: string[];
  inStock: boolean;
  stockCount: number;
}

/**
 * Scrapy spider parse fonksiyonu benzeri extraction
 */
export function parseScrapyStyle(htmlContent: string): ScrapyProductData[] {
  const results: ScrapyProductData[] = [];
  
  // Scrapy'deki xpath yaklaşımı benzeri
  const scriptDataMatches = htmlContent.match(/<script[^>]*>.*?window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__.*?<\/script>/gs);
  
  if (!scriptDataMatches || scriptDataMatches.length === 0) {
    console.warn("Ürün bilgisi alınamadı - Scrapy style");
    return results;
  }
  
  for (const scriptContent of scriptDataMatches) {
    if (!scriptContent.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')) continue;
    
    try {
      // Scrapy'deki split işlemi
      const splitContent = scriptContent.split("window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ =");
      if (splitContent.length < 2) continue;
      
      let jsonText = splitContent[1].trim();
      
      // Diğer window objelerini temizle
      jsonText = jsonText.split("window.__OTHER_REDUX_STATE__")[0].trim();
      jsonText = jsonText.split("window.__")[0].trim();
      jsonText = jsonText.replace(/;$/, '');
      
      const data = JSON.parse(jsonText);
      const product = data.product;
      
      if (!product) continue;
      
      // Ana ürün bilgileri
      const productTitle = product.name || product.title || 'Ürün';
      const brand = product.brand?.name || 'Bilinmiyor';
      const mainPrice = product.price?.sellingPrice?.value ? product.price.sellingPrice.value / 100 : 0;
      
      // Ana ürün görselleri - Scrapy benzeri
      const mainImages = (product.images || []).map((img: any) => img.url || img).filter(Boolean);
      
      // Varyantlar - Scrapy yield benzeri
      const variants = product.allVariants || product.variants || [];
      
      if (variants.length === 0) {
        // Tek ürün
        results.push({
          product_title: productTitle,
          brand,
          price: mainPrice,
          variant_price: Math.round(mainPrice * 1.10), // %10 kar
          image_urls: mainImages,
          inStock: true,
          stockCount: 1
        });
      } else {
        // Varyantlı ürün
        variants.forEach((variant: any) => {
          const attributes = variant.attributes || {};
          const color = attributes.RENK || attributes.Renk || variant.color;
          const size = attributes.BEDEN || attributes.Beden || variant.size;
          
          // Scrapy'deki fiyat yapısı
          let variantPrice = mainPrice;
          if (variant.price?.sellingPrice?.value) {
            variantPrice = variant.price.sellingPrice.value / 100;
          }
          
          const stockCount = variant.stock || variant.stockCount || 0;
          const inStock = stockCount > 0;
          
          // Varyant görselleri
          const variantImages = variant.images?.map((img: any) => img.url || img) || mainImages;
          
          if (inStock) { // Sadece stokta olanları yield et
            results.push({
              product_title: productTitle,
              brand,
              price: variantPrice,
              variant_name: variant.name || `${color || ''} ${size || ''}`.trim(),
              variant_price: Math.round(variantPrice * 1.10),
              color,
              size,
              image_urls: variantImages,
              inStock,
              stockCount
            });
          }
        });
      }
      
      break; // İlk başarılı parse'dan sonra çık
      
    } catch (error) {
      console.error(`JSON ayrıştırılamadı: ${error.message}`);
      continue;
    }
  }
  
  return results;
}

/**
 * Scrapy spider benzeri ana fonksiyon
 */
export async function scrapyEnhancedExtraction(url: string): Promise<{
  success: boolean;
  products: ScrapyProductData[];
  totalVariants: number;
  inStockVariants: number;
}> {
  try {
    // Scrapy'deki response.text() benzeri
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const htmlContent = await response.text();
    
    // Scrapy parse fonksiyonu
    const products = parseScrapyStyle(htmlContent);
    const inStockProducts = products.filter(p => p.inStock);
    
    return {
      success: true,
      products: inStockProducts,
      totalVariants: products.length,
      inStockVariants: inStockProducts.length
    };
    
  } catch (error) {
    console.error('Scrapy extraction hatası:', error.message);
    return {
      success: false,
      products: [],
      totalVariants: 0,
      inStockVariants: 0
    };
  }
}