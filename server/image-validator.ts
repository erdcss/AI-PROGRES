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
        
        // Make HEAD request to check if image exists
        const response = await axios.head(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        // Check if it's actually an image
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
          return { url, isValid: false, error: 'Not an image file' };
        }
        
        return { url, isValid: true };
        
      } catch (error) {
        return { 
          url, 
          isValid: false, 
          error: error.response?.status ? `HTTP ${error.response.status}` : error.message 
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
    // Ensure high resolution
    if (!url.includes('org_zoom')) {
      return url
        .replace('_medium', '_org_zoom')
        .replace('_small', '_org_zoom') 
        .replace('_thumb', '_org_zoom');
    }
    return url;
  });
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