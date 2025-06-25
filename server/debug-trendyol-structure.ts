// Debug script to analyze current Trendyol DOM structure
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { execSync } from 'child_process';

export async function debugTrendyolStructure(url: string) {
  let browser = null;
  
  try {
    console.log('🔍 Analyzing Trendyol DOM structure...');
    
    let executablePath;
    try {
      executablePath = execSync('which chromium-browser || which chromium || which google-chrome', { encoding: 'utf8' }).trim();
    } catch (error) {
      console.log('Using default Chromium');
    }

    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);
    
    console.log('📊 DOM Analysis Results:');
    console.log(`Content length: ${content.length} bytes`);
    
    // Look for variant-related elements
    const variantSelectors = [
      '.pr-in-cn', '.color-variants', '[data-testid="color"]',
      '.pr-in-sz', '.size-variants', '[data-testid="size"]',
      '.variants-wrapper', '.product-variants',
      '.variant-attribute', '.attribute-list',
      '[class*="color"]', '[class*="size"]', '[class*="variant"]'
    ];
    
    console.log('\n🎨 Variant Elements Found:');
    variantSelectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`${selector}: ${elements.length} elements`);
        elements.each((i, el) => {
          if (i < 3) { // Show first 3 elements
            console.log(`  - ${$(el).prop('tagName')}: ${$(el).text().substring(0, 50)}`);
          }
        });
      }
    });
    
    // Look for JSON-LD scripts
    console.log('\n📋 JSON-LD Scripts:');
    $('script[type="application/ld+json"]').each((i, script) => {
      const content = $(script).html();
      if (content) {
        console.log(`Script ${i + 1}: ${content.substring(0, 200)}...`);
      }
    });
    
    // Look for product state scripts
    console.log('\n🔧 Product State Scripts:');
    $('script').each((i, script) => {
      const content = $(script).html() || '';
      if (content.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')) {
        console.log(`Found product state script: ${content.substring(0, 300)}...`);
      }
      if (content.includes('window.TYPageInfo')) {
        console.log(`Found TYPageInfo: ${content.substring(0, 300)}...`);
      }
    });
    
    // Look for all classes containing color/size/variant keywords
    console.log('\n🏷️ All Variant-Related Classes:');
    const allElements = $('*');
    const variantClasses = new Set<string>();
    
    allElements.each((_, el) => {
      const className = $(el).attr('class');
      if (className) {
        className.split(' ').forEach(cls => {
          if (cls.toLowerCase().includes('color') || 
              cls.toLowerCase().includes('size') || 
              cls.toLowerCase().includes('variant') ||
              cls.toLowerCase().includes('renk') ||
              cls.toLowerCase().includes('beden')) {
            variantClasses.add(cls);
          }
        });
      }
    });
    
    console.log('Found variant classes:', Array.from(variantClasses).slice(0, 20));
    
    return {
      contentLength: content.length,
      variantClasses: Array.from(variantClasses),
      hasJsonLD: $('script[type="application/ld+json"]').length > 0,
      hasProductState: content.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')
    };
    
  } catch (error) {
    console.error('Debug error:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}