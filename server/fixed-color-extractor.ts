/**
 * Fixed Color Extractor - Ürünün gerçek renk seçeneklerini doğru çıkarır
 */

import * as cheerio from 'cheerio';

export interface ColorVariant {
  color: string;
  colorCode?: string;
  available: boolean;
  imageUrl?: string;
}

export async function extractRealColors(html: string, url: string, productTitle?: string): Promise<ColorVariant[]> {
  console.log('🎨 Fixed color extraction starting...');
  
  const $ = cheerio.load(html);
  const colors: ColorVariant[] = [];
  
  try {
    // Method 1: Trendyol specific color selector elements
    console.log('🔍 Method 1: Trendyol color selectors...');
    
    // Primary color selector pattern
    const colorSelectors = [
      '.pr-in-dt-cl-wr .pr-in-dt-cl',
      '.product-detail-color-wrapper .color-option',
      '.color-variant-selector .color-item',
      '[data-testid="color-option"]'
    ];
    
    for (const selector of colorSelectors) {
      const colorElements = $(selector);
      console.log(`Checking selector: ${selector} - found ${colorElements.length} elements`);
      
      colorElements.each((index, element) => {
        const $el = $(element);
        const colorName = $el.attr('title') || $el.attr('data-color-name') || $el.text().trim();
        const isAvailable = !$el.hasClass('disabled') && !$el.hasClass('unavailable') && !$el.hasClass('sold-out');
        
        if (colorName && colorName.length > 1 && colorName.length < 50) {
          // Turkish color name validation
          const validTurkishColors = [
            'Siyah', 'Beyaz', 'Gri', 'Mavi', 'Lacivert', 'Kırmızı', 'Pembe', 'Mor', 
            'Yeşil', 'Sarı', 'Turuncu', 'Kahverengi', 'Bej', 'Bordo', 'Fuşya', 
            'Açık Mavi', 'Koyu Mavi', 'Açık Gri', 'Koyu Gri', 'Krem', 'Ekru',
            'Hardal', 'Haki', 'Vizon', 'Camel', 'Pudra', 'Mint', 'Taba'
          ];
          
          const isValidColor = validTurkishColors.some(validColor => 
            colorName.toLowerCase().includes(validColor.toLowerCase()) ||
            validColor.toLowerCase().includes(colorName.toLowerCase())
          );
          
          if (isValidColor && !colors.find(c => c.color === colorName)) {
            colors.push({
              color: colorName,
              available: isAvailable
            });
          }
        }
      });
      
      if (colors.length > 0) break;
    }
    
    // Method 2: JSON-LD product data
    if (colors.length === 0) {
      console.log('🔍 Method 2: JSON-LD product data...');
      
      const jsonLdScripts = $('script[type="application/ld+json"]');
      
      jsonLdScripts.each((index, script) => {
        try {
          const jsonData = JSON.parse($(script).html() || '{}');
          
          // Check for color variants in structured data
          if (jsonData.hasVariant || jsonData.variants) {
            const variants = jsonData.hasVariant || jsonData.variants || [];
            
            variants.forEach((variant: any) => {
              if (variant.color || variant.additionalProperty) {
                let colorName = variant.color;
                
                if (!colorName && variant.additionalProperty) {
                  const colorProp = variant.additionalProperty.find((prop: any) => 
                    prop.name === 'color' || prop.name === 'Color' || prop.name === 'Renk'
                  );
                  colorName = colorProp?.value;
                }
                
                if (colorName && typeof colorName === 'string' && !colors.find(c => c.color === colorName)) {
                  colors.push({
                    color: colorName,
                    available: true
                  });
                }
              }
            });
          }
        } catch (e) {
          console.log('JSON-LD parsing error:', e);
        }
      });
    }
    
    // Method 3: Script variable analysis for Trendyol specific patterns
    if (colors.length === 0) {
      console.log('🔍 Method 3: Trendyol script variables...');
      
      const scriptTags = $('script:not([src])').toArray();
      
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        
        // Look for Trendyol color variant patterns
        const patterns = [
          /colorVariants?\s*[=:]\s*\[(.*?)\]/s,
          /variants?\s*[=:]\s*\[(.*?)\]/s,
          /"options"?\s*[=:]\s*\[(.*?)\]/s
        ];
        
        for (const pattern of patterns) {
          const match = scriptContent.match(pattern);
          if (match) {
            try {
              const variantData = match[1];
              
              // Extract color names from variant data
              const colorMatches = variantData.match(/"(Siyah|Beyaz|Gri|Mavi|Lacivert|Kırmızı|Pembe|Mor|Yeşil|Sarı|Turuncu|Kahverengi|Bej|Bordo|Fuşya|Açık\s+\w+|Koyu\s+\w+|Krem|Ekru|Hardal|Haki|Vizon|Camel|Pudra|Mint|Taba)"/gi);
              
              if (colorMatches) {
                colorMatches.forEach(colorMatch => {
                  const colorName = colorMatch.replace(/"/g, '');
                  if (!colors.find(c => c.color === colorName)) {
                    colors.push({
                      color: colorName,
                      available: true
                    });
                  }
                });
              }
            } catch (e) {
              console.log('Script parsing error:', e);
            }
          }
        }
        
        if (colors.length > 0) break;
      }
    }
    
    // Method 4: Default color detection from product title
    if (colors.length === 0) {
      console.log('🔍 Method 4: Color detection from title...');
      
      if (productTitle) {
        const colorKeywords = [
          'Siyah', 'Beyaz', 'Gri', 'Mavi', 'Lacivert', 'Kırmızı', 'Pembe', 'Mor', 
          'Yeşil', 'Sarı', 'Turuncu', 'Kahverengi', 'Bej', 'Bordo', 'Fuşya',
          'Krem', 'Ekru', 'Hardal', 'Haki', 'Vizon', 'Camel', 'Pudra'
        ];
        
        colorKeywords.forEach(color => {
          if (productTitle.toLowerCase().includes(color.toLowerCase())) {
            colors.push({
              color: color,
              available: true
            });
          }
        });
      }
    }
    
    // If still no colors found, check if it's a single-color product
    if (colors.length === 0) {
      console.log('🔍 Single color product detected, using default...');
      
      // Check for single-color indicators in title
      const singleColorIndicators = ['tek renk', 'standart', 'klasik', 'natural', 'doğal'];
      const isSingleColor = productTitle && singleColorIndicators.some(indicator => 
        productTitle.toLowerCase().includes(indicator)
      );
      
      if (isSingleColor) {
        colors.push({
          color: 'Standart',
          available: true
        });
      }
    }
    
    console.log(`🎨 Fixed color extraction completed: ${colors.length} colors found`);
    colors.forEach(color => console.log(`  - ${color.color} (${color.available ? 'Available' : 'Unavailable'})`));
    
    return colors.slice(0, 20); // Limit to reasonable number
    
  } catch (error) {
    console.error('🎨 Fixed color extraction error:', error);
    return [];
  }
}

export default { extractRealColors };