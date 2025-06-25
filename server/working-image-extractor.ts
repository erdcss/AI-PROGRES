/**
 * Working Image Extractor for Trendyol Products
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function extractProductImages(url: string): Promise<string[]> {
  try {
    console.log(`🔍 Starting robust image extraction for: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    const images = new Set<string>();
    
    console.log(`📄 HTML size: ${Math.round(html.length / 1024)}KB`);
    
    // Method 1: Direct CDN URL extraction with regex
    const cdnRegex = /https:\/\/cdn\.dsmcdn\.com\/[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi;
    const cdnMatches = html.match(cdnRegex) || [];
    console.log(`📸 Method 1 - CDN regex: Found ${cdnMatches.length} URLs`);
    
    cdnMatches.forEach(url => {
      if (url.includes('_org_zoom') || url.includes('_large') || url.includes('/prod/')) {
        images.add(url);
      }
    });
    
    // Method 2: Cheerio img tag extraction
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
      if (src && src.includes('dsmcdn.com')) {
        let imageUrl = src;
        if (!imageUrl.startsWith('http')) {
          imageUrl = 'https://cdn.dsmcdn.com' + imageUrl;
        }
        if (imageUrl.includes('_org_zoom') || imageUrl.includes('_large') || imageUrl.includes('/prod/')) {
          images.add(imageUrl);
        }
      }
    });
    console.log(`📸 Method 2 - Cheerio img tags: Found additional images`);
    
    // Method 3: JSON-LD structured data
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const jsonData = JSON.parse($(el).text());
        if (jsonData.image) {
          if (Array.isArray(jsonData.image)) {
            jsonData.image.forEach((img: any) => {
              const imageUrl = typeof img === 'string' ? img : img.url;
              if (imageUrl && imageUrl.includes('dsmcdn.com')) {
                images.add(imageUrl);
              }
            });
          } else if (typeof jsonData.image === 'string' && jsonData.image.includes('dsmcdn.com')) {
            images.add(jsonData.image);
          }
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });
    console.log(`📸 Method 3 - JSON-LD: Checked structured data`);
    
    // Method 4: Look for image data in script tags
    $('script').each((i, el) => {
      const scriptContent = $(el).text();
      if (scriptContent.includes('dsmcdn.com') && scriptContent.includes('.jpg')) {
        const matches = scriptContent.match(/https:\/\/cdn\.dsmcdn\.com\/[^"'\s]*\.(?:jpg|jpeg|png)/g) || [];
        matches.forEach(url => {
          if (url.includes('_org_zoom') || url.includes('_large') || url.includes('/prod/')) {
            images.add(url);
          }
        });
      }
    });
    console.log(`📸 Method 4 - Script tags: Checked inline scripts`);
    
    // Convert to array and filter quality images
    const imageArray = Array.from(images).filter(url => 
      !url.includes('icon') && 
      !url.includes('logo') && 
      !url.includes('badge') &&
      !url.includes('_thumb') &&
      (url.includes('_org_zoom') || url.includes('_large') || url.includes('/prod/'))
    );
    
    console.log(`✅ Total unique quality images found: ${imageArray.length}`);
    imageArray.slice(0, 5).forEach((img, i) => {
      console.log(`  ${i+1}. ${img.substring(0, 80)}...`);
    });
    
    return imageArray;
    
  } catch (error) {
    console.error(`❌ Image extraction error: ${error.message}`);
    return [];
  }
}

// Test function for specific URL
export async function testImageExtractionForUrl(testUrl: string) {
  console.log(`🧪 Testing image extraction for: ${testUrl}`);
  const images = await extractProductImages(testUrl);
  return {
    success: true,
    imageCount: images.length,
    images: images.slice(0, 10),
    sampleUrls: images.slice(0, 3)
  };
}