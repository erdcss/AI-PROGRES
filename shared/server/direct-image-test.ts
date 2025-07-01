/**
 * Direct image extraction test for debugging
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function testImageExtraction(url: string) {
  try {
    console.log(`🔍 Testing image extraction for: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    console.log(`📄 HTML length: ${html.length} characters`);
    
    // Test direct regex
    const directImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"']*\.jpg/g) || [];
    console.log(`📸 Direct regex found: ${directImages.length} images`);
    directImages.slice(0, 3).forEach((img, i) => console.log(`  ${i+1}. ${img}`));
    
    // Test cheerio selectors
    const cheerioImages: string[] = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('dsmcdn.com')) {
        cheerioImages.push(src);
      }
    });
    console.log(`📸 Cheerio found: ${cheerioImages.length} images`);
    
    // Test JSON state
    const jsonMatch = html.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[1]);
        console.log(`📦 JSON state keys: ${Object.keys(jsonData).join(', ')}`);
        
        if (jsonData.product) {
          console.log(`📦 Product keys: ${Object.keys(jsonData.product).join(', ')}`);
          if (jsonData.product.images) {
            console.log(`📸 JSON images found: ${jsonData.product.images.length}`);
            jsonData.product.images.slice(0, 3).forEach((img: any, i: number) => {
              console.log(`  ${i+1}. ${typeof img === 'string' ? img : JSON.stringify(img).slice(0, 100)}`);
            });
          }
        }
      } catch (e) {
        console.log(`⚠️ JSON parse error: ${e}`);
      }
    }
    
    return {
      directImages: directImages.slice(0, 10),
      cheerioImages: cheerioImages.slice(0, 10),
      htmlLength: html.length
    };
    
  } catch (error) {
    console.error(`❌ Test error: ${error}`);
    return { error: error.message };
  }
}