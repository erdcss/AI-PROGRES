/**
 * Final Image Solution - Direct Regex Approach
 */
import axios from 'axios';

export async function extractImagesDirectly(url: string): Promise<string[]> {
  try {
    console.log(`🔍 Direct image extraction for: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });
    
    const html = response.data;
    console.log(`📄 HTML size: ${Math.round(html.length / 1024)}KB`);
    
    // Multiple comprehensive regex patterns
    const patterns = [
      /https:\/\/cdn\.dsmcdn\.com\/[^"'\s]*\.jpg/gi,
      /https:\/\/cdn\.dsmcdn\.com\/[^"'\s]*\.jpeg/gi,
      /https:\/\/cdn\.dsmcdn\.com\/[^"'\s]*\.png/gi,
      /https:\/\/cdn\.dsmcdn\.com\/[^"'\s]*\.webp/gi,
      /"(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png|webp))"/gi,
      /'(https:\/\/cdn\.dsmcdn\.com[^']*\.(?:jpg|jpeg|png|webp))'/gi,
      /url\((https:\/\/cdn\.dsmcdn\.com[^)]*\.(?:jpg|jpeg|png|webp))\)/gi,
      /src="(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png|webp))"/gi,
      /data-src="(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png|webp))"/gi,
      /data-original="(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png|webp))"/gi
    ];
    
    const allImages = new Set<string>();
    
    patterns.forEach((pattern, index) => {
      const matches = [...html.matchAll(pattern)];
      console.log(`📸 Pattern ${index + 1}: Found ${matches.length} matches`);
      
      matches.forEach(match => {
        const imageUrl = match[1] || match[0];
        if (imageUrl && imageUrl.includes('dsmcdn.com')) {
          // Filter out unwanted images
          if (!imageUrl.includes('icon') && 
              !imageUrl.includes('logo') && 
              !imageUrl.includes('badge') &&
              !imageUrl.includes('sprite') &&
              !imageUrl.includes('_thumb')) {
            allImages.add(imageUrl);
          }
        }
      });
    });
    
    // Also check for relative URLs and convert them
    const relativePatterns = [
      /"(\/[^"]*\.(?:jpg|jpeg|png|webp))"/gi,
      /'(\/[^']*\.(?:jpg|jpeg|png|webp))'/gi,
      /src="(\/[^"]*\.(?:jpg|jpeg|png|webp))"/gi,
      /data-src="(\/[^"]*\.(?:jpg|jpeg|png|webp))"/gi
    ];
    
    relativePatterns.forEach((pattern, index) => {
      const matches = [...html.matchAll(pattern)];
      console.log(`📸 Relative pattern ${index + 1}: Found ${matches.length} matches`);
      
      matches.forEach(match => {
        const relativePath = match[1];
        if (relativePath && relativePath.includes('prod/')) {
          const fullUrl = 'https://cdn.dsmcdn.com' + relativePath;
          allImages.add(fullUrl);
        }
      });
    });
    
    const imageArray = Array.from(allImages);
    console.log(`✅ Total unique images found: ${imageArray.length}`);
    
    // Log first few images for debugging
    imageArray.slice(0, 5).forEach((img, i) => {
      console.log(`  ${i+1}. ${img}`);
    });
    
    return imageArray;
    
  } catch (error: any) {
    console.error(`❌ Direct image extraction error: ${error.message}`);
    return [];
  }
}