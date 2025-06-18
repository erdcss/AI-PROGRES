import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

/**
 * Debug Trendyol color variant extraction
 */
export async function debugTrendyolColors(url: string) {
  try {
    console.log('🔍 Debugging color variants for:', url);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const htmlContent = await response.text();
    const $ = cheerio.load(htmlContent);
    
    // Look for all possible color-related patterns
    console.log('\n🎨 SEARCHING FOR COLOR PATTERNS:');
    
    // Pattern 1: productColors in JavaScript
    const productColorsPattern = /"productColors":\s*\[(.*?)\]/;
    const productColorsMatch = htmlContent.match(productColorsPattern);
    if (productColorsMatch) {
      console.log('✅ Found productColors pattern');
      console.log('Raw match:', productColorsMatch[0].substring(0, 200) + '...');
    } else {
      console.log('❌ No productColors pattern found');
    }
    
    // Pattern 2: Color variant elements
    const colorElements = $('[class*="color"], [data-color], [class*="variant"]');
    console.log(`\n🔍 Found ${colorElements.length} potential color elements`);
    
    colorElements.each((index, elem) => {
      const $elem = $(elem);
      console.log(`Element ${index + 1}:`);
      console.log('  Class:', $elem.attr('class'));
      console.log('  Style:', $elem.attr('style'));
      console.log('  Data attributes:', Object.keys($elem.get()[0]?.attribs || {}).filter(k => k.startsWith('data-')));
      console.log('  Text:', $elem.text().trim().substring(0, 50));
      if (index >= 5) return false; // Limit output
    });
    
    // Pattern 3: Script tags with variant data
    console.log('\n📜 SEARCHING SCRIPT TAGS:');
    const scripts = $('script');
    let foundVariantData = false;
    
    scripts.each((index, script) => {
      const content = $(script).html() || '';
      
      if (content.includes('productColors') || content.includes('variants') || content.includes('color')) {
        console.log(`Script ${index + 1} contains variant data`);
        const relevantPart = content.substring(
          Math.max(0, content.indexOf('productColors') - 100),
          Math.min(content.length, content.indexOf('productColors') + 500)
        );
        console.log('Relevant part:', relevantPart);
        foundVariantData = true;
        if (index >= 2) return false; // Limit output
      }
    });
    
    if (!foundVariantData) {
      console.log('❌ No variant data found in script tags');
    }
    
    // Pattern 4: Look for specific Trendyol color picker structure
    console.log('\n🎯 SEARCHING FOR TRENDYOL COLOR PICKER:');
    const colorPickerSelectors = [
      '.variants', '.variant-group', '.color-variants', '.product-variants',
      '[data-testid*="color"]', '[class*="ColorVariant"]', '[class*="variant"]'
    ];
    
    colorPickerSelectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
        elements.each((index, elem) => {
          const $elem = $(elem);
          console.log(`  Element ${index + 1}: ${$elem.attr('class')} - ${$elem.text().trim().substring(0, 100)}`);
          if (index >= 2) return false;
        });
      }
    });
    
    // Pattern 5: Search for price variations
    console.log('\n💰 SEARCHING FOR PRICE PATTERNS:');
    const pricePatterns = [
      /"price":\s*"?(\d+)"?/g,
      /"discountedPrice":\s*"?(\d+)"?/g,
      /data-price="([^"]+)"/g
    ];
    
    pricePatterns.forEach((pattern, index) => {
      const matches = [...htmlContent.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`✅ Pattern ${index + 1} found ${matches.length} price matches`);
        matches.slice(0, 3).forEach((match, i) => {
          console.log(`  Match ${i + 1}: ${match[0]}`);
        });
      }
    });
    
    return {
      hasProductColors: !!productColorsMatch,
      colorElementsCount: colorElements.length,
      hasVariantScripts: foundVariantData
    };
    
  } catch (error) {
    console.error('Debug error:', error);
    return null;
  }
}