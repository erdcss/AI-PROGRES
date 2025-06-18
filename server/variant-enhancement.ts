import * as cheerio from 'cheerio';

interface EnhancedVariantDetection {
  hasMultipleColors: boolean;
  hasMultipleSizes: boolean;
  colorNames: string[];
  sizeNames: string[];
  materialOptions: string[];
  patternOptions: string[];
  actualVariantCount: number;
  variantCombinations: VariantCombination[];
}

interface VariantCombination {
  color: string;
  size: string;
  material?: string;
  pattern?: string;
  price: number;
  stock: boolean;
  images: string[];
  sku?: string;
}

export function enhanceVariantDetection(html: string, url: string): EnhancedVariantDetection {
  const $ = cheerio.load(html);
  
  console.log('🔬 Gelişmiş varyant tespiti başlatılıyor...');
  
  // 1. JSON-LD Schema.org verilerinden varyant tespiti
  const schemaVariants = extractSchemaVariants($);
  
  // 2. Trendyol API verilerinden varyant tespiti
  const apiVariants = extractAPIVariants(html);
  
  // 3. DOM elementlerinden detaylı varyant tespiti
  const domVariants = extractDOMVariants($);
  
  // 4. JavaScript değişkenlerinden varyant tespiti
  const jsVariants = extractJSVariants(html);
  
  // Tüm kaynakları birleştir
  const combinedResult = combineVariantSources(schemaVariants, apiVariants, domVariants, jsVariants);
  
  console.log(`🔬 Gelişmiş tespit: ${combinedResult.colorNames.length} renk, ${combinedResult.sizeNames.length} beden`);
  console.log(`🔬 Gerçek varyant sayısı: ${combinedResult.actualVariantCount}`);
  
  return combinedResult;
}

function extractSchemaVariants($: cheerio.CheerioAPI): Partial<EnhancedVariantDetection> {
  const result: Partial<EnhancedVariantDetection> = {
    colorNames: [],
    sizeNames: [],
    materialOptions: [],
    variantCombinations: []
  };
  
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}');
      
      // Schema.org Product with hasVariant
      if (data['@type'] === 'Product' && data.hasVariant) {
        data.hasVariant.forEach((variant: any) => {
          const combination: VariantCombination = {
            color: variant.color || 'default',
            size: variant.size || 'default', 
            price: parseFloat(variant.offers?.price || '0'),
            stock: variant.offers?.availability?.includes('InStock') || true,
            images: variant.image ? [variant.image] : []
          };
          
          if (variant.color && !result.colorNames!.includes(variant.color)) {
            result.colorNames!.push(variant.color);
          }
          
          if (variant.size && !result.sizeNames!.includes(variant.size)) {
            result.sizeNames!.push(variant.size);
          }
          
          if (variant.material && !result.materialOptions!.includes(variant.material)) {
            result.materialOptions!.push(variant.material);
          }
          
          result.variantCombinations!.push(combination);
        });
      }
      
      // Schema.org offers with itemOffered
      if (data.offers) {
        const offers = Array.isArray(data.offers) ? data.offers : [data.offers];
        offers.forEach((offer: any) => {
          if (offer.itemOffered) {
            const item = offer.itemOffered;
            
            if (item.color && !result.colorNames!.includes(item.color)) {
              result.colorNames!.push(item.color);
            }
            
            if (item.size && !result.sizeNames!.includes(item.size)) {
              result.sizeNames!.push(item.size);
            }
          }
        });
      }
    } catch (error) {
      // Ignore parse errors
    }
  });
  
  return result;
}

function extractAPIVariants(html: string): Partial<EnhancedVariantDetection> {
  const result: Partial<EnhancedVariantDetection> = {
    colorNames: [],
    sizeNames: [],
    materialOptions: [],
    variantCombinations: []
  };
  
  try {
    // Trendyol initial state pattern
    const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
    if (initialStateMatch) {
      const state = JSON.parse(initialStateMatch[1]);
      
      if (state.product) {
        // AllVariants array - most reliable source
        if (state.product.allVariants && Array.isArray(state.product.allVariants)) {
          state.product.allVariants.forEach((variant: any) => {
            const combination: VariantCombination = {
              color: 'default',
              size: 'default',
              price: variant.price || variant.originalPrice || 0,
              stock: variant.inStock !== false,
              images: variant.images || [],
              sku: variant.itemNumber?.toString()
            };
            
            // Extract attributes from attributeVariants
            if (variant.attributeVariants) {
              variant.attributeVariants.forEach((attr: any) => {
                const name = attr.attributeName?.toLowerCase();
                const value = attr.attributeValue;
                
                if (name === 'renk' || name === 'color') {
                  combination.color = value;
                  if (!result.colorNames!.includes(value)) {
                    result.colorNames!.push(value);
                  }
                } else if (name === 'beden' || name === 'size') {
                  combination.size = value;
                  if (!result.sizeNames!.includes(value)) {
                    result.sizeNames!.push(value);
                  }
                } else if (name === 'malzeme' || name === 'material') {
                  combination.material = value;
                  if (!result.materialOptions!.includes(value)) {
                    result.materialOptions!.push(value);
                  }
                }
              });
            }
            
            result.variantCombinations!.push(combination);
          });
        }
        
        // Variant attributes from product.variants
        if (state.product.variants) {
          Object.keys(state.product.variants).forEach(variantType => {
            const variants = state.product.variants[variantType];
            if (Array.isArray(variants)) {
              variants.forEach((variant: any) => {
                const value = variant.name || variant.value || variant.displayValue;
                
                if (variantType.toLowerCase().includes('color') || variantType.toLowerCase().includes('renk')) {
                  if (value && !result.colorNames!.includes(value)) {
                    result.colorNames!.push(value);
                  }
                } else if (variantType.toLowerCase().includes('size') || variantType.toLowerCase().includes('beden')) {
                  if (value && !result.sizeNames!.includes(value)) {
                    result.sizeNames!.push(value);
                  }
                }
              });
            }
          });
        }
      }
    }
  } catch (error) {
    console.log('API variant extraction error:', error);
  }
  
  return result;
}

function extractDOMVariants($: cheerio.CheerioAPI): Partial<EnhancedVariantDetection> {
  const result: Partial<EnhancedVariantDetection> = {
    colorNames: [],
    sizeNames: [],
    materialOptions: [],
    variantCombinations: []
  };
  
  // Gelişmiş renk seçici tespiti
  const colorSelectors = [
    '.pr-in-cn img[alt]',
    '[data-testid*="color"] img[alt]',
    '.color-variant img[alt]',
    '.variant-color img[alt]',
    '[class*="color"] img[alt]',
    '.pr-in-cn button[title]',
    '[data-color]'
  ];
  
  colorSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const $el = $(el);
      let colorName = '';
      
      if (el.name === 'img') {
        colorName = $el.attr('alt') || $el.attr('title') || '';
      } else {
        colorName = $el.attr('title') || $el.attr('data-color') || $el.text().trim();
      }
      
      if (colorName && colorName.length > 0) {
        const normalized = normalizeColorName(colorName);
        if (normalized && !result.colorNames!.includes(normalized)) {
          result.colorNames!.push(normalized);
        }
      }
    });
  });
  
  // Gelişmiş beden seçici tespiti
  const sizeSelectors = [
    '.pr-in-sz button',
    '[data-testid*="size"] button',
    '.size-variant button',
    '[class*="size"] button',
    '[data-size]'
  ];
  
  sizeSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const $el = $(el);
      const sizeText = $el.text().trim() || $el.attr('title') || $el.attr('data-size') || '';
      
      if (sizeText && sizeText.length > 0) {
        const normalized = normalizeSizeName(sizeText);
        if (normalized && !result.sizeNames!.includes(normalized)) {
          result.sizeNames!.push(normalized);
        }
      }
    });
  });
  
  return result;
}

function extractJSVariants(html: string): Partial<EnhancedVariantDetection> {
  const result: Partial<EnhancedVariantDetection> = {
    colorNames: [],
    sizeNames: [],
    materialOptions: [],
    variantCombinations: []
  };
  
  // JavaScript değişkenlerinden varyant bilgilerini çıkar
  const jsPatterns = [
    /var\s+variants\s*=\s*(\[.+?\]);/gs,
    /const\s+variants\s*=\s*(\[.+?\]);/gs,
    /let\s+variants\s*=\s*(\[.+?\]);/gs,
    /"variants":\s*(\[.+?\])/gs,
    /"allVariants":\s*(\[.+?\])/gs
  ];
  
  jsPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        try {
          const jsonMatch = match.match(/(\[.+?\])/s);
          if (jsonMatch) {
            const variants = JSON.parse(jsonMatch[1]);
            if (Array.isArray(variants)) {
              variants.forEach((variant: any) => {
                if (variant.color && !result.colorNames!.includes(variant.color)) {
                  result.colorNames!.push(variant.color);
                }
                if (variant.size && !result.sizeNames!.includes(variant.size)) {
                  result.sizeNames!.push(variant.size);
                }
              });
            }
          }
        } catch (error) {
          // Ignore parse errors
        }
      });
    }
  });
  
  return result;
}

function combineVariantSources(...sources: Partial<EnhancedVariantDetection>[]): EnhancedVariantDetection {
  const combined: EnhancedVariantDetection = {
    hasMultipleColors: false,
    hasMultipleSizes: false,
    colorNames: [],
    sizeNames: [],
    materialOptions: [],
    patternOptions: [],
    actualVariantCount: 0,
    variantCombinations: []
  };
  
  // Combine all color names
  sources.forEach(source => {
    if (source.colorNames) {
      source.colorNames.forEach(color => {
        if (!combined.colorNames.includes(color)) {
          combined.colorNames.push(color);
        }
      });
    }
  });
  
  // Combine all size names
  sources.forEach(source => {
    if (source.sizeNames) {
      source.sizeNames.forEach(size => {
        if (!combined.sizeNames.includes(size)) {
          combined.sizeNames.push(size);
        }
      });
    }
  });
  
  // Combine variant combinations (prefer most detailed source)
  const detailedSource = sources.find(s => s.variantCombinations && s.variantCombinations.length > 0);
  if (detailedSource && detailedSource.variantCombinations) {
    combined.variantCombinations = detailedSource.variantCombinations;
  }
  
  // Determine if there are multiple variants
  combined.hasMultipleColors = combined.colorNames.length > 1;
  combined.hasMultipleSizes = combined.sizeNames.length > 1;
  
  // Calculate actual variant count
  combined.actualVariantCount = combined.variantCombinations.length || 
                               (combined.colorNames.length * combined.sizeNames.length);
  
  // If no colors found, default to single color
  if (combined.colorNames.length === 0) {
    combined.colorNames = ['tek renk'];
  }
  
  return combined;
}

function normalizeColorName(color: string): string {
  if (!color || typeof color !== 'string') return '';
  
  const normalized = color.toLowerCase().trim();
  
  // Turkish color mappings
  const colorMappings: Record<string, string> = {
    'siyah': 'Siyah',
    'beyaz': 'Beyaz', 
    'kırmızı': 'Kırmızı',
    'mavi': 'Mavi',
    'yeşil': 'Yeşil',
    'sarı': 'Sarı',
    'pembe': 'Pembe',
    'mor': 'Mor',
    'turuncu': 'Turuncu',
    'gri': 'Gri',
    'kahverengi': 'Kahverengi',
    'lacivert': 'Lacivert',
    'bordo': 'Bordo',
    'bej': 'Bej',
    'krem': 'Krem',
    'navy': 'Lacivert',
    'black': 'Siyah',
    'white': 'Beyaz',
    'red': 'Kırmızı',
    'blue': 'Mavi',
    'green': 'Yeşil'
  };
  
  return colorMappings[normalized] || color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}

function normalizeSizeName(size: string): string {
  if (!size || typeof size !== 'string') return '';
  
  const normalized = size.toUpperCase().trim();
  
  // Remove non-alphanumeric characters
  const cleaned = normalized.replace(/[^A-Z0-9]/g, '');
  
  return cleaned;
}