/**
 * Authentic Product Image Extractor
 * Extracts only genuine product images, filtering out duplicates and irrelevant images
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

interface AuthenticImageData {
  mainImages: string[];
  totalFound: number;
  duplicatesRemoved: number;
  processingDetails: string[];
}

export async function extractAuthenticProductImages(url: string): Promise<AuthenticImageData> {
  console.log('🎯 Authentic product image extraction starting...');
  
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
    const $ = cheerio.load(html);
    
    console.log(`📄 HTML size: ${Math.round(html.length / 1024)}KB`);
    
    const processingDetails: string[] = [];
    
    // Extract all CDN images from HTML
    const allCdnImages = extractAllCdnImages(html);
    processingDetails.push(`Total CDN images found: ${allCdnImages.length}`);
    
    // Filter to get only authentic product images
    const authenticImages = filterAuthenticImages(allCdnImages, processingDetails);
    
    // Remove duplicates and resized versions
    const uniqueImages = removeDuplicatesAndResizes(authenticImages, processingDetails);
    
    console.log(`✅ Authentic image extraction completed:`);
    console.log(`   📸 Unique product images: ${uniqueImages.length}`);
    console.log(`   🔍 Total found: ${allCdnImages.length}`);
    console.log(`   ❌ Duplicates removed: ${allCdnImages.length - uniqueImages.length}`);
    
    return {
      mainImages: uniqueImages,
      totalFound: allCdnImages.length,
      duplicatesRemoved: allCdnImages.length - uniqueImages.length,
      processingDetails
    };
    
  } catch (error: any) {
    console.error(`❌ Authentic image extraction error: ${error.message}`);
    return {
      mainImages: [],
      totalFound: 0,
      duplicatesRemoved: 0,
      processingDetails: [`Error: ${error.message}`]
    };
  }
}

function extractAllCdnImages(html: string): string[] {
  // Comprehensive CDN pattern for Trendyol
  const cdnPattern = /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g;
  const matches = html.match(cdnPattern) || [];
  
  console.log(`🔍 Found ${matches.length} total CDN image URLs`);
  return matches;
}

function filterAuthenticImages(images: string[], details: string[]): string[] {
  const authentic: string[] = [];
  
  for (const img of images) {
    // Skip non-product images
    if (shouldSkipImage(img)) {
      continue;
    }
    
    // Only include product images with proper path structure
    if (isProductImage(img)) {
      authentic.push(img);
    }
  }
  
  details.push(`Authentic product images after filtering: ${authentic.length}`);
  console.log(`🎯 Filtered to ${authentic.length} authentic product images`);
  
  return authentic;
}

function shouldSkipImage(url: string): boolean {
  const skipPatterns = [
    'icon', 'logo', 'badge', 'banner', 'thumb', 'avatar',
    'sprite', 'button', 'bg_', 'background', 'header',
    'footer', 'nav', 'menu', 'search', 'filter',
    'social', 'payment', 'delivery', 'star', 'rating',
    'arrow', 'close', 'play', 'video', 'gif'
  ];
  
  return skipPatterns.some(pattern => url.toLowerCase().includes(pattern));
}

function isProductImage(url: string): boolean {
  // Trendyol product images have specific path structure
  // Format: https://cdn.dsmcdn.com/ty[number]/prod/QC/[date]/[hash]/[image_id]_org_zoom.jpg
  const productImagePattern = /ty\d+\/prod\/QC\/\d{8}\/\d{2}\/[a-f0-9-]+\/\d+_org_zoom\.jpg/;
  
  return productImagePattern.test(url);
}

function removeDuplicatesAndResizes(images: string[], details: string[]): string[] {
  const uniqueImageMap = new Map<string, string>();
  
  for (const img of images) {
    // Skip resized images (mnresize path)
    if (img.includes('mnresize/')) {
      continue;
    }
    
    // Extract unique identifier from image URL
    const identifier = extractImageIdentifier(img);
    
    if (identifier) {
      // Only keep org_zoom versions for highest quality
      if (img.includes('_org_zoom.jpg')) {
        uniqueImageMap.set(identifier, img);
      }
    }
  }
  
  const uniqueImages = Array.from(uniqueImageMap.values())
    .sort() // Sort for consistent ordering
    .slice(0, 10); // Limit to max 10 images for performance
  
  details.push(`Final unique images: ${uniqueImages.length}`);
  details.push(`Resized images filtered: ${images.filter(img => img.includes('mnresize/')).length}`);
  details.push(`Duplicates removed: ${images.length - uniqueImages.length}`);
  
  console.log(`🔧 Filtered to ${uniqueImages.length} unique original quality images`);
  console.log(`🚫 Removed ${images.filter(img => img.includes('mnresize/')).length} resized versions`);
  
  return uniqueImages;
}

function extractImageIdentifier(url: string): string | null {
  // Extract the unique hash part from the URL
  // Format: .../[hash]/[image_id]_org_zoom.jpg
  const match = url.match(/\/([a-f0-9-]+)\/(\d+)_/);
  return match ? `${match[1]}_${match[2]}` : null;
}

/**
 * Main export function for integration with existing scraper
 */
export async function getAuthenticProductImages(url: string): Promise<string[]> {
  const imageData = await extractAuthenticProductImages(url);
  
  console.log(`🎯 Authentic extraction summary:`);
  console.log(`   📸 Product images: ${imageData.mainImages.length}`);
  console.log(`   🔍 Total found: ${imageData.totalFound}`);
  console.log(`   ❌ Filtered out: ${imageData.duplicatesRemoved}`);
  
  return imageData.mainImages;
}