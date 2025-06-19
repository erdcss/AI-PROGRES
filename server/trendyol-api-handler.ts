import axios from 'axios';
import * as cheerio from 'cheerio';

// Alternative approach: try to extract data from Trendyol API endpoints
export async function extractFromTrendyolAPI(productId: string): Promise<any> {
  try {
    // Try product detail API endpoint
    const apiUrl = `https://public.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`;
    
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.trendyol.com/'
      },
      timeout: 5000
    });
    
    if (response.data && response.data.result) {
      const product = response.data.result;
      
      return {
        success: true,
        variants: product.variants || [],
        images: product.images || [],
        attributes: product.attributes || {},
        price: product.price || {},
        name: product.name || '',
        brand: product.brand || {}
      };
    }
    
    return { success: false };
    
  } catch (error) {
    console.log(`API çağrısı başarısız: ${error.message}`);
    return { success: false };
  }
}

// Try to extract structured data from script tags
export function extractStructuredData(html: string): any {
  const $ = cheerio.load(html);
  
  // Look for JSON-LD structured data
  const jsonLdScripts = $('script[type="application/ld+json"]');
  
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonContent = $(jsonLdScripts[i]).html();
      if (jsonContent) {
        const data = JSON.parse(jsonContent);
        if (data['@type'] === 'Product' || data.product) {
          return { success: true, data };
        }
      }
    } catch (e) {
      // Continue to next script
    }
  }
  
  return { success: false };
}