/**
 * Advanced Image Extractor - Enhanced image detection for Trendyol products
 * Kapsamlı görsel çıkarma sistemi
 */

import * as cheerio from 'cheerio';

export interface ExtractedImages {
  mainImages: string[];
  variantImages: string[];
  allImages: string[];
}

export function extractAllImages(html: string, url?: string): ExtractedImages {
  const $ = cheerio.load(html);
  const mainImages: string[] = [];
  const variantImages: string[] = [];
  const allImages: Set<string> = new Set();

  console.log('🔍 ADVANCED IMAGE EXTRACTION: Starting comprehensive image search...');

  // Method 1: Standard img tags with enhanced selectors
  const imgSelectors = [
    'img[src*="cdn.dsmcdn.com"]',
    'img[data-src*="cdn.dsmcdn.com"]',
    'img[data-original*="cdn.dsmcdn.com"]',
    'img[data-lazy*="cdn.dsmcdn.com"]',
    '.product-image img',
    '.gallery-image img',
    '.zoom-image img'
  ];

  imgSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('data-lazy');
      if (src && src.includes('cdn.dsmcdn.com') && !src.includes('static')) {
        const enhanced = enhanceImageUrl(src);
        if (enhanced) {
          allImages.add(enhanced);
          mainImages.push(enhanced);
        }
      }
    });
  });

  // Method 2: JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonContent = $(el).html();
      if (jsonContent) {
        const data = JSON.parse(jsonContent);
        extractImagesFromJSON(data, allImages);
      }
    } catch (error) {
      // Ignore JSON parsing errors
    }
  });

  // Method 3: JavaScript variables and objects
  $('script:not([src])').each((_, el) => {
    const scriptContent = $(el).html() || '';
    
    // Search for various image patterns in JavaScript
    const patterns = [
      // Standard image objects
      /"images?":\s*\[([^\]]*cdn\.dsmcdn\.com[^\]]*)\]/gi,
      /"url":\s*"([^"]*cdn\.dsmcdn\.com[^"]*)"/gi,
      /"src":\s*"([^"]*cdn\.dsmcdn\.com[^"]*)"/gi,
      
      // Trendyol specific patterns
      /productImages\s*[:=]\s*\[([^\]]*cdn\.dsmcdn\.com[^\]]*)\]/gi,
      /galleryImages\s*[:=]\s*\[([^\]]*cdn\.dsmcdn\.com[^\]]*)\]/gi,
      /variantImages\s*[:=]\s*\[([^\]]*cdn\.dsmcdn\.com[^\]]*)\]/gi,
      
      // Direct URL patterns
      /https?:\/\/cdn\.dsmcdn\.com\/[^\s"'<>)]+/gi,
      
      // Base64 or encoded patterns
      /"imageUrl[^"]*":\s*"([^"]*cdn\.dsmcdn\.com[^"]*)"/gi
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(scriptContent)) !== null) {
        let imageUrl = match[1] || match[0];
        
        // Clean up the URL
        imageUrl = imageUrl
          .replace(/\\"/g, '"')
          .replace(/\\\//g, '/')
          .replace(/^"/, '')
          .replace(/"$/, '');
        
        if (imageUrl.includes('cdn.dsmcdn.com') && !imageUrl.includes('static')) {
          const enhanced = enhanceImageUrl(imageUrl);
          if (enhanced) {
            allImages.add(enhanced);
            
            // Categorize as variant or main image
            if (imageUrl.includes('variant') || imageUrl.includes('color')) {
              variantImages.push(enhanced);
            } else {
              mainImages.push(enhanced);
            }
          }
        }
      }
    });
  });

  // Method 4: Meta tags
  const metaTags = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="product:image"]'
  ];

  metaTags.forEach(selector => {
    const content = $(selector).attr('content');
    if (content && content.includes('cdn.dsmcdn.com')) {
      const enhanced = enhanceImageUrl(content);
      if (enhanced) {
        allImages.add(enhanced);
        mainImages.unshift(enhanced); // Add to beginning as primary
      }
    }
  });

  // Method 5: CSS background images
  $('*').each((_, el) => {
    const style = $(el).attr('style');
    if (style && style.includes('cdn.dsmcdn.com')) {
      const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]*cdn\.dsmcdn\.com[^'")]*)/);
      if (bgMatch && bgMatch[1]) {
        const enhanced = enhanceImageUrl(bgMatch[1]);
        if (enhanced) {
          allImages.add(enhanced);
          mainImages.push(enhanced);
        }
      }
    }
  });

  // Method 6: Data attributes with image URLs
  $('[data-image*="cdn.dsmcdn.com"], [data-img*="cdn.dsmcdn.com"], [data-photo*="cdn.dsmcdn.com"]').each((_, el) => {
    const dataImg = $(el).attr('data-image') || $(el).attr('data-img') || $(el).attr('data-photo');
    if (dataImg && dataImg.includes('cdn.dsmcdn.com')) {
      const enhanced = enhanceImageUrl(dataImg);
      if (enhanced) {
        allImages.add(enhanced);
        mainImages.push(enhanced);
      }
    }
  });

  const finalMainImages = [...new Set(mainImages)];
  const finalVariantImages = [...new Set(variantImages)];
  const finalAllImages = Array.from(allImages);

  console.log(`🖼️ EXTRACTION RESULTS: ${finalMainImages.length} main, ${finalVariantImages.length} variant, ${finalAllImages.length} total`);

  return {
    mainImages: finalMainImages,
    variantImages: finalVariantImages,
    allImages: finalAllImages
  };
}

function extractImagesFromJSON(obj: any, imageSet: Set<string>) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => extractImagesFromJSON(item, imageSet));
    return;
  }

  // Check for image properties
  const imageKeys = ['image', 'images', 'url', 'src', 'photo', 'picture'];
  
  for (const key of imageKeys) {
    if (obj[key]) {
      if (typeof obj[key] === 'string' && obj[key].includes('cdn.dsmcdn.com')) {
        const enhanced = enhanceImageUrl(obj[key]);
        if (enhanced) imageSet.add(enhanced);
      } else if (Array.isArray(obj[key])) {
        obj[key].forEach((item: any) => {
          if (typeof item === 'string' && item.includes('cdn.dsmcdn.com')) {
            const enhanced = enhanceImageUrl(item);
            if (enhanced) imageSet.add(enhanced);
          } else if (item && item.url && item.url.includes('cdn.dsmcdn.com')) {
            const enhanced = enhanceImageUrl(item.url);
            if (enhanced) imageSet.add(enhanced);
          }
        });
      }
    }
  }

  // Recursively search in nested objects
  Object.values(obj).forEach(value => {
    if (value && typeof value === 'object') {
      extractImagesFromJSON(value, imageSet);
    }
  });
}

function enhanceImageUrl(url: string): string | null {
  if (!url || !url.includes('cdn.dsmcdn.com') || url.includes('static') || url.length < 20) {
    return null;
  }

  try {
    // Validate URL
    new URL(url);
    
    // Enhance to highest quality
    let enhanced = url
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace('_medium', '_org_zoom')
      .replace('_small', '_org_zoom')
      .replace('_thumb', '_org_zoom')
      .replace('/ty100/', '/ty1000/')
      .replace('/ty200/', '/ty1000/')
      .replace('/ty300/', '/ty1000/')
      .replace('/ty400/', '/ty1000/')
      .replace('/ty500/', '/ty1000/')
      .replace('/ty600/', '/ty1000/')
      .replace('/ty700/', '/ty1000/')
      .replace('/ty800/', '/ty1000/')
      .replace('/ty900/', '/ty1000/');

    // Ensure _org_zoom suffix for main product images
    if (!enhanced.includes('org_zoom') && (enhanced.includes('.jpg') || enhanced.includes('.png'))) {
      enhanced = enhanced.replace(/\.(jpg|png)$/, '_org_zoom.$1');
    }

    return enhanced;
  } catch {
    return null;
  }
}