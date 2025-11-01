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
        return {
          success: true,
          totalColors: 1,
          successfulColors: 1,
          failedColors: 0,
          colorResults: [{
            colorName: 'Default',
            url: url,
            itemNumber: this.extractItemNumber(url),
            success: true,
            data: singleResult
          }],
          combinedData: this.createCombinedData([singleResult])
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
      
      // Process in batches of 5 for optimal speed without overwhelming the server
      const BATCH_SIZE = 5;
      const batches: typeof colorVariants[] = [];
      
      for (let i = 0; i < colorVariants.length; i += BATCH_SIZE) {
        batches.push(colorVariants.slice(i, i + BATCH_SIZE));
      }
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`\n📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} colors)...`);
        
        // Add delay between batches (but not before first batch)
        if (batchIndex > 0) {
          const delay = 300; // Reduced from 500ms to 300ms
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
        combinedData: successfulData.length > 0 ? this.createCombinedData(successfulData) : undefined
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
  private createCombinedData(results: ScenarioBasedResult[]): MultiColorResult['combinedData'] {
    if (results.length === 0) return undefined;

    const firstResult = results[0];
    const allImages: string[] = [];
    const allVariants: any[] = [];
    const allTags = new Set<string>();

    // Combine data from all colors
    results.forEach(result => {
      // Collect all images
      if (result.images) {
        allImages.push(...result.images);
      }

      // Collect all tags
      if (result.tags) {
        result.tags.forEach(tag => allTags.add(tag));
      }

      // Collect all variants
      if (result.variants) {
        if (Array.isArray(result.variants)) {
          // If variants is already an array
          result.variants.forEach(variant => {
            allVariants.push({
              ...variant,
              images: result.images || []
            });
          });
        } else if (result.variants.allVariants) {
          // If variants is an object with allVariants
          result.variants.allVariants.forEach(variant => {
            allVariants.push({
              ...variant,
              images: result.images || []
            });
          });
        }
      }
    });

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
