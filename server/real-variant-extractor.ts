// Real Variant Extractor - Works with current Trendyol structure
import * as cheerio from 'cheerio';

export interface VariantData {
  colors: string[];
  sizes: string[];
  stockMap: Record<string, boolean>;
}

module.exports = { extractRealVariants };

function extractRealVariants(html: string): VariantData {
  const $ = cheerio.load(html);
  const colors: string[] = [];
  const sizes: string[] = [];
  const stockMap: Record<string, boolean> = {};

  console.log('🔍 Starting real variant extraction...');

  // Method 1: Extract from script data (most reliable)
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // Look for product data in various script formats
    const patterns = [
      /__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/,
      /window\.TYPageInfo\s*=\s*({.*?});/,
      /"variants"\s*:\s*\[([^\]]*)\]/,
      /"allVariants"\s*:\s*\[([^\]]*)\]/
    ];

    patterns.forEach(pattern => {
      const match = scriptContent.match(pattern);
      if (match) {
        try {
          let data;
          if (pattern.source.includes('variants')) {
            data = { variants: JSON.parse('[' + match[1] + ']') };
          } else {
            data = JSON.parse(match[1]);
          }
          
          // Extract variants from parsed data
          extractFromData(data, colors, sizes);
        } catch (e) {
          // Continue to next pattern
        }
      }
    });
  });

  // Method 2: Direct DOM extraction with enhanced selectors
  const colorSelectors = [
    'button[data-testid="variant-color"]',
    '.variant-item[data-variant-type="color"]',
    '.color-variant-item',
    'div[class*="color"] button',
    'div[class*="Color"] button',
    '[data-variant="color"] button'
  ];

  const sizeSelectors = [
    'button[data-testid="variant-size"]',
    '.variant-item[data-variant-type="size"]',
    '.size-variant-item', 
    'div[class*="size"] button',
    'div[class*="Size"] button',
    '[data-variant="size"] button'
  ];

  colorSelectors.forEach(selector => {
    $(selector).each((_, btn) => {
      const colorText = $(btn).attr('title') || $(btn).attr('data-value') || $(btn).text().trim();
      if (colorText && !colorText.toLowerCase().includes('varsayılan') && !colors.includes(colorText)) {
        colors.push(colorText);
        console.log(`Color found via DOM: ${colorText}`);
      }
    });
  });

  sizeSelectors.forEach(selector => {
    $(selector).each((_, btn) => {
      const sizeText = $(btn).attr('title') || $(btn).attr('data-value') || $(btn).text().trim();
      if (sizeText && !sizeText.toLowerCase().includes('standart') && !sizes.includes(sizeText)) {
        sizes.push(sizeText);
        console.log(`Size found via DOM: ${sizeText}`);
      }
    });
  });

  // Method 3: Extract from meta tags and data attributes
  $('meta[property*="product"]').each((_, meta) => {
    const content = $(meta).attr('content') || '';
    const property = $(meta).attr('property') || '';
    
    if (property.includes('color') && content) {
      const colorValue = content.trim();
      if (!colors.includes(colorValue)) {
        colors.push(colorValue);
        console.log(`Color found via meta: ${colorValue}`);
      }
    }
  });

  // Method 4: Look for variant information in data attributes
  $('[data-color], [data-size], [data-variant-color], [data-variant-size]').each((_, el) => {
    const colorAttr = $(el).attr('data-color') || $(el).attr('data-variant-color');
    const sizeAttr = $(el).attr('data-size') || $(el).attr('data-variant-size');
    
    if (colorAttr && !colors.includes(colorAttr)) {
      colors.push(colorAttr);
      console.log(`Color found via data attr: ${colorAttr}`);
    }
    
    if (sizeAttr && !sizes.includes(sizeAttr)) {
      sizes.push(sizeAttr);
      console.log(`Size found via data attr: ${sizeAttr}`);
    }
  });

  // Create stock map
  if (colors.length > 0 || sizes.length > 0) {
    if (colors.length > 0 && sizes.length > 0) {
      colors.forEach(color => {
        sizes.forEach(size => {
          stockMap[`${color}-${size}`] = true;
        });
      });
    } else if (colors.length > 0) {
      colors.forEach(color => {
        stockMap[color] = true;
      });
    } else {
      sizes.forEach(size => {
        stockMap[size] = true;
      });
    }
  }

  console.log(`✅ Variant extraction complete: ${colors.length} colors, ${sizes.length} sizes`);
  console.log('Colors:', colors);
  console.log('Sizes:', sizes);

  return { colors, sizes, stockMap };
}

function extractFromData(data: any, colors: string[], sizes: string[]): void {
  if (!data) return;

  // Handle different data structures
  const extractFromVariants = (variants: any[]) => {
    variants.forEach((variant: any) => {
      if (variant.attributeType === 'renk' || variant.attributeType === 'color') {
        const color = variant.attributeValue || variant.value || variant.name;
        if (color && !colors.includes(color)) {
          colors.push(color);
          console.log(`Color found via script: ${color}`);
        }
      }
      
      if (variant.attributeType === 'beden' || variant.attributeType === 'size') {
        const size = variant.attributeValue || variant.value || variant.name;
        if (size && !sizes.includes(size)) {
          sizes.push(size);  
          console.log(`Size found via script: ${size}`);
        }
      }
    });
  };

  // Look for variants in different possible locations
  if (data.product && data.product.variants) {
    extractFromVariants(data.product.variants);
  }
  
  if (data.variants) {
    extractFromVariants(data.variants);
  }
  
  if (data.allVariants) {
    extractFromVariants(data.allVariants);
  }

  // Look for variant attributes
  if (data.product && data.product.attributes) {
    data.product.attributes.forEach((attr: any) => {
      if (attr.key === 'renk' || attr.key === 'color') {
        const color = attr.value;
        if (color && !colors.includes(color)) {
          colors.push(color);
          console.log(`Color found via attributes: ${color}`);
        }
      }
      
      if (attr.key === 'beden' || attr.key === 'size') {
        const size = attr.value;
        if (size && !sizes.includes(size)) {
          sizes.push(size);
          console.log(`Size found via attributes: ${size}`);
        }
      }
    });
  }
}