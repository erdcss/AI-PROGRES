/**
 * BRAND SANITIZER - Centralized Trendyol Branding Removal
 * Removes all "Trendyol" references from product data
 */

/**
 * Sanitize branding from any object recursively
 */
export function sanitizeBranding(obj: any): any {
  if (!obj) return obj;
  
  if (typeof obj === 'string') {
    return obj
      .replace(/\btrendyol\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeBranding(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeBranding(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Sanitize product data specifically for Trendyol removal
 */
export function sanitizeProduct(productData: any): any {
  if (!productData) return productData;
  
  const sanitized = { ...productData };
  
  // Sanitize title
  if (sanitized.title) {
    sanitized.title = sanitized.title
      .replace(/\btrendyol\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Sanitize brand - if it's "Trendyol", replace with actual brand or empty
  if (sanitized.brand && sanitized.brand.toLowerCase() === 'trendyol') {
    // Try to extract actual brand from title
    const brandMatch = sanitized.title?.match(/^([A-Z][a-zA-Z]+)\s/);
    sanitized.brand = brandMatch ? brandMatch[1] : '';
  }
  
  // Sanitize description
  if (sanitized.description) {
    sanitized.description = sanitized.description
      .replace(/\btrendyol\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Sanitize tags
  if (sanitized.tags && Array.isArray(sanitized.tags)) {
    sanitized.tags = sanitized.tags
      .map((tag: string) => tag.replace(/\btrendyol\b/gi, '').trim())
      .filter((tag: string) => tag.length > 0);
  }
  
  // Sanitize features
  if (sanitized.features && Array.isArray(sanitized.features)) {
    sanitized.features = sanitized.features.map((feature: any) => ({
      ...feature,
      key: feature.key ? feature.key.replace(/\btrendyol\b/gi, '').trim() : feature.key,
      value: feature.value ? feature.value.replace(/\btrendyol\b/gi, '').trim() : feature.value
    }));
  }
  
  console.log('🧹 BRAND SANITIZER: Trendyol references removed');
  return sanitized;
}