/**
 * Enhanced Variant Extractor with Hybrid Fallback System
 * 
 * Strategy:
 * 1. Try Puppeteer with wait logic (wait for client-side rendered size buttons)
 * 2. Extract JavaScript State (window.__PRODUCT_DETAIL_APP_INITIAL_STATE__)
 * 3. Fallback to Google Cache
 * 4. Graceful degradation (single variant)
 */

import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { execSync } from 'child_process';

interface VariantInfo {
  color: string;
  colorCode?: string;
  size: string;
  sku?: string;
  inStock: boolean;
  price?: number;
  stockCount?: number;
}

interface VariantExtractionResult {
  success: boolean;
  variants: VariantInfo[];
  method: string;
  extractedAt: Date;
}

export class EnhancedVariantExtractor {
  private readonly TIMEOUT = 30000; // 30 seconds
  private readonly WAIT_SELECTORS = [
    '.sp-itm', // Size buttons
    '[class*="size"]',
    '[class*="beden"]',
    '.variant-size',
    '.product-variants'
  ];

  /**
   * Main extraction method with hybrid fallback
   */
  async extractVariants(url: string, productId?: string): Promise<VariantExtractionResult> {
    console.log('🎯 HYBRID VARIANT EXTRACTION: Starting multi-layer extraction...');

    // Method 1: Enhanced Puppeteer with wait logic
    try {
      console.log('📌 Method 1: Enhanced Puppeteer with wait logic...');
      const puppeteerResult = await this.extractWithPuppeteer(url);
      if (puppeteerResult.success && puppeteerResult.variants.length > 0) {
        console.log(`✅ Puppeteer extracted ${puppeteerResult.variants.length} variants`);
        return puppeteerResult;
      }
    } catch (error) {
      console.log(`⚠️ Puppeteer method failed: ${error.message}`);
    }

    // Method 2: Google Cache fallback
    try {
      console.log('📌 Method 2: Google Cache fallback...');
      const cacheResult = await this.extractFromGoogleCache(url);
      if (cacheResult.success && cacheResult.variants.length > 0) {
        console.log(`✅ Google Cache extracted ${cacheResult.variants.length} variants`);
        return cacheResult;
      }
    } catch (error) {
      console.log(`⚠️ Google Cache method failed: ${error.message}`);
    }

    // Method 3: Graceful degradation (single variant)
    console.log('📌 Method 3: Graceful degradation - treating as single variant');
    return {
      success: true,
      variants: [],
      method: 'graceful_degradation',
      extractedAt: new Date()
    };
  }

  /**
   * Method 1: Enhanced Puppeteer with wait logic
   */
  private async extractWithPuppeteer(url: string): Promise<VariantExtractionResult> {
    let browser;
    
    try {
      console.log('🚀 Launching Puppeteer with enhanced configuration...');
      
      // Dynamically find chromium executable
      let executablePath;
      try {
        executablePath = execSync('which chromium-browser || which chromium || which google-chrome', { encoding: 'utf8' }).trim();
        console.log(`✅ Found chromium at: ${executablePath}`);
      } catch (error) {
        console.log('⚠️ Chromium not found, using Puppeteer default');
      }
      
      browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();

      // Set realistic viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      console.log(`🌐 Navigating to: ${url}`);
      
      // Navigate and wait for network idle
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: this.TIMEOUT 
      });

      console.log('⏳ Waiting for client-side content to render...');
      
      // Wait for any of the size selectors to appear
      try {
        await Promise.race(
          this.WAIT_SELECTORS.map(selector => 
            page.waitForSelector(selector, { timeout: 10000 }).catch(() => null)
          )
        );
        console.log('✅ Variant elements detected on page');
      } catch (waitError) {
        console.log('⚠️ No variant selectors found (might be single-variant product)');
      }

      // Additional wait for JavaScript execution
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('🔍 Extracting JavaScript State and DOM data...');

      // Extract all variant data using page.evaluate
      const variantData = await page.evaluate(() => {
        const result: any = {
          jsState: null,
          domSizes: [],
          domColors: [],
          domStock: []
        };

        // Try to extract JavaScript State
        try {
          if ((window as any).__PRODUCT_DETAIL_APP_INITIAL_STATE__) {
            result.jsState = (window as any).__PRODUCT_DETAIL_APP_INITIAL_STATE__;
            console.log('✅ JavaScript State found');
          }
        } catch (e) {
          console.log('⚠️ Cannot access JavaScript State');
        }

        // Extract sizes from DOM
        const sizeButtons = document.querySelectorAll('.sp-itm, [class*="size"], [class*="beden"]');
        sizeButtons.forEach((btn: any) => {
          const sizeText = btn.textContent?.trim();
          const isDisabled = btn.classList.contains('disabled') || btn.hasAttribute('disabled');
          if (sizeText) {
            result.domSizes.push({
              size: sizeText,
              inStock: !isDisabled,
              element: btn.className
            });
          }
        });

        // Extract colors from DOM
        const colorElements = document.querySelectorAll('[class*="color"], [class*="renk"], .variant-option');
        colorElements.forEach((el: any) => {
          const colorName = el.getAttribute('title') || el.getAttribute('data-color') || el.textContent?.trim();
          const colorCode = el.style.backgroundColor || el.getAttribute('data-color-code');
          if (colorName) {
            result.domColors.push({
              name: colorName,
              code: colorCode
            });
          }
        });

        return result;
      });

      console.log('📊 Extraction results:');
      console.log(`   - JavaScript State: ${variantData.jsState ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`   - DOM Sizes: ${variantData.domSizes.length}`);
      console.log(`   - DOM Colors: ${variantData.domColors.length}`);

      // Parse variants from extracted data
      const variants = this.parseVariantsFromData(variantData);

      await browser.close();

      return {
        success: variants.length > 0,
        variants,
        method: 'enhanced_puppeteer',
        extractedAt: new Date()
      };

    } catch (error) {
      console.error('❌ Puppeteer extraction failed:', error);
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Method 2: Google Cache fallback
   */
  private async extractFromGoogleCache(url: string): Promise<VariantExtractionResult> {
    try {
      console.log('🔍 Attempting Google Cache extraction...');
      
      const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
      
      const response = await axios.get(cacheUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      if (!response.data) {
        throw new Error('No data from Google Cache');
      }

      console.log('✅ Google Cache data retrieved');
      
      const $ = cheerio.load(response.data);
      const variants = this.parseVariantsFromHTML($, response.data);

      return {
        success: variants.length > 0,
        variants,
        method: 'google_cache',
        extractedAt: new Date()
      };

    } catch (error) {
      console.error('❌ Google Cache extraction failed:', error);
      throw error;
    }
  }

  /**
   * Validate if a size string is a real size (not a product attribute)
   */
  private isValidSize(sizeText: string): boolean {
    // Strict size pattern - only accept real clothing/product sizes
    const sizePattern = /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|\d+(\.\d+)?|Tek\s*Beden|One\s*Size|STD|Standard)$/i;
    
    let cleaned = sizeText.trim();
    
    // ✅ FIRST: Handle "Beden: XS" format - extract just the size part
    const bedenMatch = cleaned.match(/^Beden:\s*(.+)$/i);
    if (bedenMatch) {
      cleaned = bedenMatch[1].trim();
      console.log(`🔄 Stripped prefix: "${sizeText}" → "${cleaned}"`);
    }
    
    // Product attribute patterns to REJECT (after prefix stripping)
    const attributePatterns = [
      /^(Materyal|Material|Kumaş|Fabric)/i,
      /^(Hacim|Volume|Kapasite|Capacity)/i,
      /^(Renk|Color|Colour)/i,
      /^(Kullanım|Usage|Kullanim)/i,
      /^(Menşei|Origin|Mensei)/i,
      /^(Kalıp|Fit|Kalip)/i,
      /^(Yaka|Collar|Neck)/i,
      /^(Paket|Package|Pack)/i,
      /^(Koleksiyon|Collection)/i,
      /^(Desen|Pattern)/i,
      /^(Kol|Sleeve)/i,
      /^(Cep|Pocket)/i,
      /^(Boy|Length)/i,
      /^(Ortam|Environment)/i,
      /^(Ek\s*Özellik|Extra|Additional)/i,
      /^(Sürdürülebilirlik|Sustainability)/i,
      /^(Dokuma|Weave|Woven)/i,
      /^(Siluet|Silhouette)/i,
      /^(Kutu|Box)/i,
      /^(Yıkama|Wash|Care)/i,
      /^(Ürün\s*Güvenliği|Product\s*Safety)/i,
      /^(Boyut\/Ebat|Dimension|Size\/Dimension)/i,
    ];
    
    // Check if it's a product attribute
    for (const pattern of attributePatterns) {
      if (pattern.test(cleaned)) {
        console.log(`❌ REJECTED ATTRIBUTE: "${cleaned}"`);
        return false;
      }
    }
    
    // Check if it matches valid size pattern
    if (sizePattern.test(cleaned)) {
      console.log(`✅ VALID SIZE: "${cleaned}"`);
      return true;
    }
    
    console.log(`❌ REJECTED INVALID: "${cleaned}" (doesn't match size pattern)`);
    return false;
  }

  /**
   * Parse variants from Puppeteer extracted data
   */
  private parseVariantsFromData(data: any): VariantInfo[] {
    const variants: VariantInfo[] = [];

    // Priority 1: JavaScript State
    if (data.jsState) {
      console.log('🎯 Parsing from JavaScript State...');
      
      try {
        const state = data.jsState;
        
        // Try to find variants in different possible structures
        const possiblePaths = [
          state.product?.variants,
          state.productDetail?.variants,
          state.variants,
          state.allVariants
        ];

        for (const variantData of possiblePaths) {
          if (variantData && Array.isArray(variantData) && variantData.length > 0) {
            variantData.forEach((v: any) => {
              const sizeValue = v.size || v.value || 'Tek Beden';
              
              // Validate size before adding
              if (this.isValidSize(sizeValue)) {
                variants.push({
                  color: v.color || v.attributeValue || 'Standart',
                  colorCode: v.colorCode || v.colorHex,
                  size: sizeValue,
                  sku: v.sku || v.barcode,
                  inStock: v.inStock !== false,
                  price: v.price || v.salePrice,
                  stockCount: v.stock || v.quantity
                });
              }
            });
            
            if (variants.length > 0) {
              console.log(`✅ Extracted ${variants.length} valid variants from JS State`);
              return variants;
            }
          }
        }
      } catch (parseError) {
        console.log('⚠️ Failed to parse JavaScript State:', parseError);
      }
    }

    // Priority 2: DOM data
    if (data.domSizes.length > 0 || data.domColors.length > 0) {
      console.log('🎯 Parsing from DOM data...');
      
      const colors = data.domColors.length > 0 ? data.domColors : [{ name: 'Standart', code: null }];
      
      // Filter DOM sizes - only keep valid sizes
      const validSizes = data.domSizes.filter((s: any) => this.isValidSize(s.size));
      const sizes = validSizes.length > 0 ? validSizes : [{ size: 'Tek Beden', inStock: true }];

      console.log(`🔍 Filtered sizes: ${data.domSizes.length} → ${validSizes.length} valid sizes`);

      colors.forEach((color: any) => {
        sizes.forEach((size: any) => {
          variants.push({
            color: color.name,
            colorCode: color.code,
            size: size.size,
            inStock: size.inStock,
          });
        });
      });

      console.log(`✅ Created ${variants.length} variant combinations from DOM`);
    }

    return variants;
  }

  /**
   * Parse variants from HTML (for Google Cache)
   */
  private parseVariantsFromHTML($: cheerio.CheerioAPI, html: string): VariantInfo[] {
    const variants: VariantInfo[] = [];

    // Try to extract from script tags
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const scriptContent = $(script).html() || '';
      
      // Look for variant data in JSON
      if (scriptContent.includes('variants') || scriptContent.includes('allVariants')) {
        try {
          const jsonMatch = scriptContent.match(/\{[\s\S]*"variants"[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            // Parse variants from JSON...
          }
        } catch (e) {
          // Continue to next script
        }
      }
    }

    return variants;
  }
}

// Export singleton instance
export const enhancedVariantExtractor = new EnhancedVariantExtractor();
