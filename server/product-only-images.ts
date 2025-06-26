/**
 * Product-Only Image Extractor
 * Extracts only genuine product images, no duplicates or resized versions
 */

import axios from 'axios';

export async function extractProductOnlyImages(url: string): Promise<string[]> {
  console.log('🎯 Extracting product-only images...');
  
  try {
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
    
    // Extract all CDN images
    const cdnPattern = /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g;
    const allImages = html.match(cdnPattern) || [];
    console.log(`🔍 Total CDN images found: ${allImages.length}`);
    
    // Filter to get only product images with proper path structure
    const productImages = allImages.filter(img => {
      // Must have product path structure: ty[number]/prod/QC/[date]/[hash]/[id]_org_zoom.jpg
      return /ty\d+\/prod\/QC\/\d{8}\/\d{2}\/[a-f0-9-]+\/\d+_org_zoom\.jpg/.test(img);
    });
    
    console.log(`🎯 Product images after filtering: ${productImages.length}`);
    
    // Remove resized versions (mnresize)
    const originalOnly = productImages.filter(img => !img.includes('mnresize/'));
    console.log(`🚫 Resized images filtered out: ${productImages.length - originalOnly.length}`);
    
    // Remove duplicates by extracting unique identifiers
    const uniqueImages = removeDuplicates(originalOnly);
    console.log(`✅ Final unique product images: ${uniqueImages.length}`);
    
    return uniqueImages.slice(0, 10); // Limit to max 10 images
    
  } catch (error: any) {
    console.error(`❌ Product image extraction error: ${error.message}`);
    return [];
  }
}

function removeDuplicates(images: string[]): string[] {
  const seenIdentifiers = new Set<string>();
  const uniqueImages: string[] = [];
  
  for (const img of images) {
    // Extract unique identifier: hash + image_id
    const match = img.match(/\/([a-f0-9-]+)\/(\d+)_org_zoom\.jpg/);
    if (match) {
      const identifier = `${match[1]}_${match[2]}`;
      
      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        uniqueImages.push(img);
      }
    }
  }
  
  return uniqueImages.sort(); // Sort for consistent ordering
}

/**
 * Main export function for integration
 */
export async function getProductOnlyImages(url: string): Promise<string[]> {
  const images = await extractProductOnlyImages(url);
  
  console.log(`🎯 Product-only extraction completed:`);
  console.log(`   📸 Authentic product images: ${images.length}`);
  
  // Log each image for verification
  images.forEach((img, index) => {
    console.log(`   ${index + 1}. ${img}`);
  });
  
  return images;
}