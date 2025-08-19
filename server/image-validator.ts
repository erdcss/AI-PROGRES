/**
 * Image Validator - Ensures images are valid and accessible
 */

import axios from 'axios';

export interface ImageValidation {
  url: string;
  isValid: boolean;
  error?: string;
}

export async function validateImages(images: string[]): Promise<ImageValidation[]> {
  console.log(`🔍 Validating ${images.length} images...`);
  
  const validations = await Promise.all(
    images.map(async (url): Promise<ImageValidation> => {
      try {
        // Basic URL validation
        new URL(url);
        
        // Check if it's a Trendyol CDN image
        if (!url.includes('cdn.dsmcdn.com')) {
          return { url, isValid: false, error: 'Not a Trendyol CDN image' };
        }
        
        // Skip validation for obviously invalid URLs
        if (url.includes('static') || url.includes('logo') || url.length < 20) {
          return { url, isValid: false, error: 'Static or logo image' };
        }
        
        // Try HEAD request first, then GET if HEAD fails
        let response;
        try {
          response = await axios.head(url, {
            timeout: 8000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
              'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
              'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
              'Cache-Control': 'no-cache',
              'Referer': 'https://www.trendyol.com/'
            },
            validateStatus: (status) => status < 500 // Accept redirects
          });
        } catch (headError) {
          // Try GET request as fallback
          response = await axios.get(url, {
            timeout: 10000,
            responseType: 'stream',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.trendyol.com/'
            },
            maxRedirects: 3
          });
          
          // Close the stream immediately since we only need headers
          if (response.data && response.data.destroy) {
            response.data.destroy();
          }
        }
        
        // Check if it's actually an image
        const contentType = response.headers['content-type'];
        if (contentType && (contentType.startsWith('image/') || contentType.includes('image'))) {
          return { url, isValid: true };
        } else {
          return { url, isValid: false, error: `Invalid content type: ${contentType}` };
        }
        
      } catch (error) {
        // For 403/404 errors, still consider the image potentially valid for Shopify
        const status = error.response?.status;
        if (status === 403 || status === 404) {
          console.log(`⚠️ Image access restricted but may work in Shopify: ${url}`);
          return { url, isValid: true }; // Allow restricted images
        }
        
        return { 
          url, 
          isValid: false, 
          error: status ? `HTTP ${status}` : error.message 
        };
      }
    })
  );
  
  const validCount = validations.filter(v => v.isValid).length;
  console.log(`✅ ${validCount}/${images.length} images are valid`);
  
  return validations;
}

export function getValidImageUrls(validations: ImageValidation[]): string[] {
  return validations
    .filter(v => v.isValid)
    .map(v => v.url);
}

export function enhanceImageUrls(imageUrls: string[]): string[] {
  return imageUrls.map(url => {
    try {
      // Basic URL validation
      new URL(url);
      
      // Ensure high resolution with multiple enhancement methods
      let enhanced = url;
      
      if (!enhanced.includes('org_zoom')) {
        enhanced = enhanced
          .replace('_medium', '_org_zoom')
          .replace('_small', '_org_zoom')
          .replace('_thumb', '_org_zoom')
          .replace('_org.jpg', '_org_zoom.jpg')
          .replace('_org.png', '_org_zoom.png');
      }
      
      // Enhance image quality parameters
      enhanced = enhanced
        .replace(/\/ty\d+\//, '/ty1000/') // Use highest quality path
        .replace(/quality=\d+/, 'quality=100'); // Max quality
      
      // Add zoom suffix if missing
      if (enhanced.includes('cdn.dsmcdn.com') && 
          !enhanced.includes('org_zoom') && 
          (enhanced.includes('.jpg') || enhanced.includes('.png'))) {
        enhanced = enhanced.replace(/\.(jpg|png)/, '_org_zoom.$1');
      }
      
      return enhanced;
    } catch {
      return url; // Return original if enhancement fails
    }
  }).filter(url => url && url.length > 10);
}

export async function getValidatedImages(rawImages: string[]): Promise<string[]> {
  if (!rawImages || rawImages.length === 0) {
    console.log('⚠️ No images provided for validation');
    return [];
  }
  
  // First enhance to high resolution
  const enhancedImages = enhanceImageUrls(rawImages);
  
  // Then validate
  const validations = await validateImages(enhancedImages);
  
  // Return only valid images
  const validImages = getValidImageUrls(validations);
  
  // Log invalid images for debugging
  validations
    .filter(v => !v.isValid)
    .forEach(v => console.log(`❌ Invalid image: ${v.url} - ${v.error}`));
    
  return validImages;
}