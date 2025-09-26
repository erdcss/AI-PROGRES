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
  
  // Sanitize brand - if it's "Trendyol", replace with actual brand or fallback
  if (sanitized.brand && sanitized.brand.toLowerCase() === 'trendyol') {
    // Try to extract actual brand from title (case insensitive)
    const brandMatch = sanitized.title?.match(/^([A-Za-z][a-zA-Z0-9]+)\s/) || 
                      sanitized.title?.match(/([A-Za-z][a-zA-Z0-9]+)/);
    
    if (brandMatch) {
      // Capitalize first letter
      sanitized.brand = brandMatch[1].charAt(0).toUpperCase() + brandMatch[1].slice(1).toLowerCase();
    } else {
      // Fallback: Use a generic brand name instead of empty string
      sanitized.brand = 'Generic';
    }
    console.log(`🧹 BRAND SANITIZER: "Trendyol" → "${sanitized.brand}"`);
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