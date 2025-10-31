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
            page.waitForSelector(selector, { timeout: 8000 }).catch(() => null)
          )
        );
        console.log('✅ Variant elements detected on page');
      } catch (waitError) {
        console.log('⚠️ No variant selectors found (might be single-variant product)');
      }

      // 🎨 CRITICAL: Wait for color data to be populated by JavaScript
      console.log('🎨 Waiting for color variant data to load...');
      try {
        await page.waitForFunction(() => {
          // Check if color elements exist AND have valid title attributes (not "null")
          const colorButtons = document.querySelectorAll('.slicing-attributes button[title], .attribute-media.renk button[title]');
          const colorImages = document.querySelectorAll('.slicing-attributes img[alt], .attribute-media.renk img[alt]');
          
          // Count elements with valid (non-null, non-empty) titles
          let validColorElements = 0;
          colorButtons.forEach((btn: any) => {
            const title = btn.getAttribute('title');
            if (title && title !== 'null' && title.length > 0) {
              validColorElements++;
            }
          });
          colorImages.forEach((img: any) => {
            const alt = img.getAttribute('alt');
            if (alt && alt !== 'null' && alt.length > 0) {
              validColorElements++;
            }
          });
          
          // Return true if we found at least 2 valid color elements (multi-color product)
          return validColorElements >= 2;
        }, { timeout: 6000 }).catch(() => {
          console.log('⚠️ Color data timeout - proceeding with what we have');
        });
        console.log('✅ Color variant data loaded');
      } catch (colorWaitError) {
        console.log('⚠️ No color variants found or single-color product');
      }

      // Additional wait for JavaScript execution (reduced for faster response)
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.log('🔍 Extracting JavaScript State and DOM data...');

      // Extract all variant data using page.evaluate
      const variantData = await page.evaluate(() => {
        const result: any = {
          jsState: null,
          domSizes: [],
          domColors: [],
          domStock: []
        };

        // Try to extract JavaScript State - multiple possible locations
        try {
          // Try known state variables
          const stateVars = [
            '__PRODUCT_DETAIL_APP_INITIAL_STATE__',
            '__NEXT_DATA__',
            'productDetailData',
            'initialState'
          ];
          
          for (const varName of stateVars) {
            if ((window as any)[varName]) {
              result.jsState = (window as any)[varName];
              console.log(`✅ JavaScript State found: ${varName}`);
              break;
            }
          }
          
          // Also search all window properties for variant data
          if (!result.jsState) {
            const windowKeys = Object.keys(window);
            for (const key of windowKeys) {
              if (key.includes('product') || key.includes('variant') || key.includes('detail')) {
                const value = (window as any)[key];
                if (value && typeof value === 'object' && (value.variants || value.allVariants || value.colors)) {
                  result.jsState = value;
                  console.log(`✅ JavaScript State found in: window.${key}`);
                  break;
                }
              }
            }
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

        // Extract colors from DOM - ENHANCED with image-based color variants
        // Method 1: Color selector elements (comprehensive selectors)
        // 🎯 BERSHKA FIX: Önce slicing-attributes button'ları kontrol et (renk thumbnail'ları)
        const colorElements = document.querySelectorAll(`
          .slicing-attributes button[title],
          .slicing-attributes a[title],
          [class*="color"], [class*="renk"], [class*="variant"],
          [data-id*="color"], [data-id*="renk"],
          .styles_contentWrapper img, .variant-item,
          button[title]:not([class*="size"]):not([class*="beden"])
        `.trim());
        
        result.colorExtractionStats = {
          method1: colorElements.length,
          method2: 0,
          method3: 0
        };
        
        // Debug: Log what we found
        result.colorDebug = [];
        
        colorElements.forEach((el: any, index: number) => {
          // Try multiple attribute sources
          const colorName = 
            el.getAttribute('title') || 
            el.getAttribute('data-title') ||
            el.getAttribute('data-color') || 
            el.getAttribute('aria-label') ||
            el.textContent?.trim() ||
            el.alt;
            
          const colorCode = el.style.backgroundColor || el.getAttribute('data-color-code');
          
          // Debug info
          result.colorDebug.push({
            index,
            tag: el.tagName,
            className: el.className,
            title: el.getAttribute('title'),
            dataTitle: el.getAttribute('data-title'),
            ariaLabel: el.getAttribute('aria-label'),
            text: el.textContent?.trim()?.substring(0, 50),
            final: colorName
          });
          
          if (colorName && colorName.length > 0 && colorName.length < 100) {
            result.domColors.push({
              name: colorName,
              code: colorCode
            });
          }
        });
        
        // Method 2: Image-based color variants (Trendyol's slicing attributes)
        const colorImages = document.querySelectorAll('.slicing-attributes img, [class*="slicing"] img, .attribute-media img, .attribute-media.renk img');
        result.colorExtractionStats.method2 = colorImages.length;
        
        colorImages.forEach((img: any, index: number) => {
          const colorName = img.alt || img.title || img.getAttribute('data-title');
          const parent = img.closest('[title]');
          const parentTitle = parent?.getAttribute('title');
          const imgSrc = img.src || img.getAttribute('src');
          
          let finalColorName = colorName || parentTitle;
          
          // 🎯 CRITICAL FIX: If title/alt are null, check if this is a valid product variant image
          // and create a placeholder that we can later map to actual color data
          if (!finalColorName && imgSrc) {
            // Check if this is a product image (not washing instructions, icons, etc.)
            const isProductImage = imgSrc.includes('prod/') || imgSrc.includes('product/');
            const isNotInstructionImage = !imgSrc.includes('carelabel') && 
                                          !imgSrc.includes('wash_at') &&
                                          !imgSrc.includes('bleach') &&
                                          !imgSrc.includes('tumble') &&
                                          !imgSrc.includes('iron_');
            
            if (isProductImage && isNotInstructionImage) {
              // This is a valid color variant image - add URL for later processing
              result.domColors.push({
                name: `__COLOR_FROM_IMAGE_${index}__`,
                code: imgSrc  // Store the image URL in the code field temporarily
              });
            }
          } else if (finalColorName && finalColorName.length > 0 && finalColorName.length < 100) {
            result.domColors.push({
              name: finalColorName,
              code: null
            });
          }
        });
        
        // Method 3: Check parent containers with title attributes OR children of .renk containers
        const attributeContainers = document.querySelectorAll('.attribute-media[title], [class*="renk"][title]');
        result.colorExtractionStats.method3 = attributeContainers.length;
        
        attributeContainers.forEach((container: any) => {
          const colorName = container.getAttribute('title');
          if (colorName && colorName.length > 0 && colorName.length < 100) {
            result.domColors.push({
              name: colorName,
              code: null
            });
          }
        });
        
        // Method 3b: If .renk containers have no title, check their children (buttons, links, images)
        const renkContainers = document.querySelectorAll('.attribute-media.renk:not([title])');
        renkContainers.forEach((container: any, containerIndex: number) => {
          // Check buttons/links inside
          const buttons = container.querySelectorAll('button[title], a[title]');
          buttons.forEach((btn: any) => {
            const colorName = btn.getAttribute('title');
            if (colorName && colorName.length > 0 && colorName.length < 100) {
              result.domColors.push({
                name: colorName,
                code: null
              });
            }
          });
          
          // 🎯 BERSHKA FIX: If no title found, check for images inside the container
          // These are color variant thumbnails
          if (buttons.length === 0 || !buttons[0]?.getAttribute('title')) {
            const images = container.querySelectorAll('img');
            images.forEach((img: any) => {
              const imgSrc = img.src || img.getAttribute('src');
              if (imgSrc) {
                const isProductImage = imgSrc.includes('prod/') || imgSrc.includes('product/');
                const isNotInstructionImage = !imgSrc.includes('carelabel') && 
                                              !imgSrc.includes('wash_at') &&
                                              !imgSrc.includes('bleach') &&
                                              !imgSrc.includes('tumble') &&
                                              !imgSrc.includes('iron_');
                
                if (isProductImage && isNotInstructionImage) {
                  result.domColors.push({
                    name: `__COLOR_VARIANT_${containerIndex}__`,
                    code: imgSrc  // Store URL for later processing
                  });
                }
              }
            });
          }
        });

        return result;
      });

      console.log('📊 Extraction results:');
      console.log(`   - JavaScript State: ${variantData.jsState ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`   - DOM Sizes: ${variantData.domSizes.length}`);
      console.log(`   - DOM Colors: ${variantData.domColors.length}`);
      console.log('🎨 Color extraction methods:');
      console.log(`   - Method 1 (selectors): ${variantData.colorExtractionStats?.method1 || 0} elements`);
      console.log(`   - Method 2 (images): ${variantData.colorExtractionStats?.method2 || 0} images`);
      console.log(`   - Method 3 (containers): ${variantData.colorExtractionStats?.method3 || 0} containers`);
      
      // Debug: Show what we found in color elements
      if (variantData.colorDebug && variantData.colorDebug.length > 0) {
        console.log('🔍 Color element debug info:');
        variantData.colorDebug.forEach((dbg: any) => {
          console.log(`   [${dbg.index}] <${dbg.tag}> class="${dbg.className?.substring(0, 40)}" title="${dbg.title}" aria="${dbg.ariaLabel}" → "${dbg.final}"`);
        });
      }

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
   * Normalize size text by removing common prefixes
   */
  private normalizeSize(sizeText: string): string {
    let cleaned = sizeText.trim();
    
    // Handle "Beden: XS" format - extract just the size part
    const bedenMatch = cleaned.match(/^Beden:\s*(.+)$/i);
    if (bedenMatch) {
      cleaned = bedenMatch[1].trim();
    }
    
    return cleaned;
  }

  /**
   * Validate if a size string is a real size (not a product attribute)
   */
  private isValidSize(sizeText: string): boolean {
    // 🎯 CRITICAL FIX: Reject combined sizes like "373536373839404142"
    // Only accept sizes with max 4 digits (e.g., "37", "105", "42.5")
    const sizePattern = /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|\d{1,4}(\.\d+)?|Tek\s*Beden|One\s*Size|STD|Standard)$/i;
    
    // Normalize first
    const cleaned = this.normalizeSize(sizeText);
    
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
                  size: this.normalizeSize(sizeValue), // ✅ Use normalized value
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
      
      // Deduplicate and clean colors
      let uniqueColors = data.domColors.length > 0 ? this.deduplicateColors(data.domColors) : [];
      
      // ✅ FIX: Eğer renk bulunamadıysa ama bedenler varsa, fallback renk kullan
      if (uniqueColors.length === 0 && data.domSizes.length > 0) {
        console.log('⚠️ No valid colors found but sizes exist - using fallback color');
        uniqueColors = [{ name: 'Standart', code: null }];
      } else if (uniqueColors.length === 0) {
        // Hiç renk ve beden yoksa standart kullan
        uniqueColors = [{ name: 'Standart', code: null }];
      }
      
      console.log(`🎨 Deduplicated colors: ${data.domColors.length} → ${uniqueColors.length}`);
      
      // Filter DOM sizes - only keep valid sizes
      const validSizes = data.domSizes.filter((s: any) => this.isValidSize(s.size));
      const sizes = validSizes.length > 0 ? validSizes : [{ size: 'Tek Beden', inStock: true }];

      console.log(`🔍 Filtered sizes: ${data.domSizes.length} → ${validSizes.length} valid sizes`);

      uniqueColors.forEach((color: any) => {
        sizes.forEach((size: any) => {
          variants.push({
            color: color.name,
            colorCode: color.code,
            size: this.normalizeSize(size.size),
            inStock: size.inStock,
          });
        });
      });

      console.log(`✅ Created ${variants.length} variant combinations from DOM (${uniqueColors.length} colors × ${sizes.length} sizes)`);
    }

    return variants;
  }

  /**
   * Deduplicate colors and clean up invalid entries
   */
  private deduplicateColors(colors: Array<{ name: string; code: string | null }>): Array<{ name: string; code: string | null }> {
    console.log(`🎨 DEDUPLICATION INPUT: ${colors.length} colors`);
    colors.forEach((c, i) => console.log(`   ${i + 1}. "${c.name}"`));
    
    // First pass: extract placeholder color images
    const placeholderColors = colors.filter(c => 
      c.name.startsWith('__COLOR_FROM_IMAGE_') || c.name.startsWith('__COLOR_VARIANT_')
    );
    
    console.log(`🎯 Found ${placeholderColors.length} placeholder color images (images with no title/alt)`);
    
    const seen = new Set<string>();
    const result: Array<{ name: string; code: string | null }> = [];

    for (const color of colors) {
      // Clean up color name
      const cleaned = color.name.trim();
      const lowerCleaned = cleaned.toLowerCase();
      
      // Skip if empty, too long, or already seen
      if (!cleaned || cleaned.length === 0) {
        console.log(`🚫 Skipping empty color`);
        continue;
      }
      if (cleaned.length > 100) {
        console.log(`🚫 Skipping too long: "${cleaned.substring(0, 50)}..."`);
        continue;
      }
      if (seen.has(lowerCleaned)) {
        console.log(`🚫 Skipping duplicate: "${cleaned}"`);
        continue;
      }
      
      // Skip invalid color values
      const invalidValues = ['undefined', 'null', 'none', 'n/a'];
      if (invalidValues.includes(lowerCleaned)) {
        console.log(`🚫 Skipping invalid value: "${cleaned}"`);
        continue;
      }
      
      // Skip if it contains ":" (usually attributes like "Beden: XS")
      if (cleaned.includes(':')) {
        console.log(`🚫 Skipping attribute format: "${cleaned}"`);
        continue;
      }
      
      // Skip if it's a product attribute (not a color)
      const attributeKeywords = [
        'beden', 'size', 'kalıp', 'fit', 'materyal', 'material',
        'kumaş', 'fabric', 'desen', 'pattern', 'yaka', 'collar',
        'kol', 'sleeve', 'boy', 'length', 'sezon', 'season',
        'yıkama', 'talimat', 'wash', 'care', 'media', 'sepette',
        'indirim', 'discount', '%', 'tl'
      ];
      
      const isAttribute = attributeKeywords.some(keyword => 
        lowerCleaned.includes(keyword)
      );
      
      if (isAttribute) {
        console.log(`🚫 Skipping attribute: "${cleaned}"`);
        continue;
      }
      
      // Skip if it looks like a size (S, M, L, XL, XXL, 2XL, 36, 38, etc.)
      const sizePatterns = [
        /^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i,
        /^\d{1,2}(XL)?$/i,  // Matches: XL, 2XL, 3XL, etc.
        /^(36|38|40|42|44|46|48|50|52|54)$/,  // Shoe/clothing sizes
        /^Tek\s*Beden$/i
      ];
      
      const isSize = sizePatterns.some(pattern => pattern.test(cleaned));
      if (isSize) {
        console.log(`🚫 Skipping size as color: "${cleaned}"`);
        continue;
      }
      
      // Skip placeholder colors for now - we'll process them separately
      if (cleaned.startsWith('__COLOR_')) {
        continue;
      }
      
      console.log(`✅ Accepting color: "${cleaned}"`);
      seen.add(cleaned.toLowerCase());
      result.push({
        name: cleaned,
        code: color.code
      });
    }
    
    // 🎯 CRITICAL FIX: If we found NO valid colors but we have placeholder images,
    // convert them to numbered color variants
    if (result.length === 0 && placeholderColors.length > 0) {
      console.log(`🎯 No color names found, but ${placeholderColors.length} color images detected`);
      console.log(`🎯 Creating numbered color variants from images...`);
      
      // Deduplicate placeholder colors by their image URLs
      const uniqueImageUrls = new Set<string>();
      placeholderColors.forEach(pc => {
        if (pc.code) {
          uniqueImageUrls.add(pc.code);
        }
      });
      
      const uniquePlaceholders = Array.from(uniqueImageUrls);
      uniquePlaceholders.forEach((imageUrl, index) => {
        result.push({
          name: `Renk ${index + 1}`,
          code: imageUrl  // Store image URL for potential future use
        });
      });
      
      console.log(`✅ Created ${result.length} numbered color variants from images`);
    }

    console.log(`🎨 DEDUPLICATION OUTPUT: ${result.length} colors`);
    return result;
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
