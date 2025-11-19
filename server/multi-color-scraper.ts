/**
 * Multi-Color Scraper - Automatically finds and scrapes all color variants
 * 
 * Each color variant has a separate URL on Trendyol.
 * This service:
 * 1. Finds all color variant URLs from a given product page
 * 2. Scrapes each color variant separately
 * 3. Combines all results into a single comprehensive dataset
 */

import { enhancedVariantExtractor } from './enhanced-variant-extractor';
import { scenarioBasedScrape, ScenarioBasedResult } from './scenario-based-scraper';
import { extractColorFromUrl, extractColorFromTitle, getColorCode } from './color-recognition';

export interface MultiColorResult {
  success: boolean;
  totalColors: number;
  successfulColors: number;
  failedColors: number;
  colorResults: Array<{
    colorName: string;
    url: string;
    itemNumber: string;
    success: boolean;
    data?: ScenarioBasedResult;
    error?: string;
  }>;
  combinedData?: {
    title: string;
    brand: string;
    category?: string;
    description?: string;
    price: {
      original: number;
      currency: string;
      formatted: string;
      withProfit: number;
      profitFormatted: string;
    };
    allImages: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
      images: string[];
    }>;
    features: Array<{key: string, value: string}>;
    tags: string[];
  };
}

export class MultiColorScraper {
  /**
   * Extract all color variants of a product
   */
  async scrapeAllColors(url: string): Promise<MultiColorResult> {
    console.log('🌈 MULTI-COLOR SCRAPER: Starting extraction...');
    console.log(`📌 Base URL: ${url}`);

    try {
      // Step 1: Find all color variant URLs
      console.log('🎨 Step 1: Finding color variant URLs...');
      const colorVariants = await enhancedVariantExtractor.extractColorVariantUrls(url);
      
      if (colorVariants.length === 0) {
        console.log('⚠️ No color variants found, treating as single-color product');
        // Scrape the single URL
        const singleResult = await scenarioBasedScrape(url);
        
        // ✅ SMART COLOR EXTRACTION using new color recognition system
        let colorName = 'Default';
        
        // Try URL first
        const urlColor = extractColorFromUrl(url);
        if (urlColor) {
          colorName = urlColor;
          console.log(`✅ Color from URL: "${colorName}"`);
        } else if (singleResult && singleResult.title) {
          // Fallback to title
          const titleColor = extractColorFromTitle(singleResult.title);
          if (titleColor) {
            colorName = titleColor;
            console.log(`✅ Color from title: "${colorName}"`);
          } else {
            console.log('⚠️ No color detected, using "Default"');
          }
        }
        
        const colorResults = [{
          colorName: colorName,
          url: url,
          itemNumber: this.extractItemNumber(url),
          success: true,
          data: singleResult
        }];
        
        return {
          success: true,
          totalColors: 1,
          successfulColors: 1,
          failedColors: 0,
          colorResults,
          combinedData: this.createCombinedData(colorResults)
        };
      }

      console.log(`✅ Found ${colorVariants.length} color variants`);
      colorVariants.forEach((cv, idx) => {
        console.log(`  ${idx + 1}. ${cv.name} - ${cv.itemNumber}`);
      });

      // Step 2: Scrape each color variant (PARALLEL for SPEED)
      console.log('🔄 Step 2: Scraping each color variant in parallel...');
      console.log('⚡ SPEED MODE: Processing up to 5 colors simultaneously');
      
      const colorResults: MultiColorResult['colorResults'] = [];
      const successfulData: ScenarioBasedResult[] = [];
      
      // Process in batches of 5 for balanced speed and safety
      const BATCH_SIZE = 5;
      const batches: typeof colorVariants[] = [];
      
      for (let i = 0; i < colorVariants.length; i += BATCH_SIZE) {
        batches.push(colorVariants.slice(i, i + BATCH_SIZE));
      }
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`\n📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} colors)...`);
        
        // Add delay between batches for anti-blocking
        if (batchIndex > 0) {
          const delay = 500; // Safe 500ms delay (original setting)
          console.log(`⏳ Waiting ${delay}ms between batches...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Process batch in parallel
        const batchPromises = batch.map(async (variant) => {
          try {
            console.log(`🚀 Starting: ${variant.name}...`);
            const result = await scenarioBasedScrape(variant.url);
            
            if (result.success) {
              console.log(`✅ Completed: ${variant.name}`);
              return {
                colorName: variant.name,
                url: variant.url,
                itemNumber: variant.itemNumber,
                success: true,
                data: result
              };
            } else {
              console.log(`⚠️ Failed: ${variant.name}`);
              return {
                colorName: variant.name,
                url: variant.url,
                itemNumber: variant.itemNumber,
                success: false,
                error: 'Extraction failed'
              };
            }
          } catch (error) {
            console.error(`❌ Error scraping ${variant.name}: ${error.message}`);
            return {
              colorName: variant.name,
              url: variant.url,
              itemNumber: variant.itemNumber,
              success: false,
              error: error.message
            };
          }
        });
        
        // Wait for all promises in this batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Add results to our collections
        batchResults.forEach(result => {
          colorResults.push(result);
          if (result.success && result.data) {
            successfulData.push(result.data);
          }
        });
        
        console.log(`✅ Batch ${batchIndex + 1} completed: ${batchResults.filter(r => r.success).length}/${batchResults.length} successful`);
      }

      // Step 3: Combine results
      console.log('\n🔗 Step 3: Combining results...');
      const successfulColors = colorResults.filter(r => r.success).length;
      const failedColors = colorResults.filter(r => !r.success).length;

      console.log(`✅ Successful: ${successfulColors}/${colorVariants.length}`);
      console.log(`❌ Failed: ${failedColors}/${colorVariants.length}`);

      return {
        success: successfulColors > 0,
        totalColors: colorVariants.length,
        successfulColors,
        failedColors,
        colorResults,
        combinedData: colorResults.length > 0 ? this.createCombinedData(colorResults) : undefined
      };

    } catch (error) {
      console.error(`❌ Multi-color scraping failed: ${error.message}`);
      return {
        success: false,
        totalColors: 0,
        successfulColors: 0,
        failedColors: 1,
        colorResults: []
      };
    }
  }

  /**
   * Combine data from multiple color variants
   */
  private createCombinedData(colorResults: MultiColorResult['colorResults']): MultiColorResult['combinedData'] {
    const successfulResults = colorResults.filter(r => r.success && r.data);
    if (successfulResults.length === 0) return undefined;

    const firstResult = successfulResults[0].data!;
    const allImages: string[] = [];
    const allVariants: any[] = [];
    const allTags = new Set<string>();

    console.log(`🔗 Combining data from ${successfulResults.length} color variants...`);

    // Combine data from all colors - preserving color information
    successfulResults.forEach(colorResult => {
      const result = colorResult.data!;
      const colorName = colorResult.colorName;
      
      console.log(`🎨 Processing color: ${colorName}`);

      // Collect all images with color association
      if (result.images) {
        console.log(`  📸 Adding ${result.images.length} images for ${colorName}`);
        allImages.push(...result.images);
      }

      // Collect all tags
      if (result.tags) {
        result.tags.forEach(tag => allTags.add(tag));
      }

      // Collect all variants - PRESERVING COLOR INFO
      if (result.variants) {
        let variants: any[] = [];
        
        if (Array.isArray(result.variants)) {
          // If variants is already an array
          variants = result.variants;
        } else if (result.variants.allVariants) {
          // If variants is an object with allVariants
          variants = result.variants.allVariants;
        }

        console.log(`  🔧 Processing ${variants.length} variants for ${colorName}`);
        
        variants.forEach(variant => {
          // ✅ CRITICAL FIX: Use colorName from the scraped result
          // This ensures we get the actual color name (e.g., "Siyah", "Beyaz")
          // instead of a placeholder
          allVariants.push({
            color: colorName, // ✅ Use the actual color name from URL extraction
            colorCode: variant.colorCode || getColorCode(colorName),
            size: variant.size,
            inStock: variant.inStock,
            images: result.images || [] // ✅ Assign all images from this color to this variant
          });
        });
      }
    });

    console.log(`✅ Combined: ${allImages.length} images, ${allVariants.length} variants`);

    return {
      title: firstResult.title,
      brand: firstResult.brand,
      category: firstResult.category,
      description: firstResult.description,
      price: firstResult.price,
      allImages: [...new Set(allImages)], // Deduplicate
      allVariants,
      features: firstResult.features || [],
      tags: Array.from(allTags)
    };
  }


  /**
   * Extract item number from URL
   */
  private extractItemNumber(url: string): string {
    const match = url.match(/p-(\d+)/);
    return match ? match[1] : '';
  }
}

// Export singleton instance
export const multiColorScraper = new MultiColorScraper();
