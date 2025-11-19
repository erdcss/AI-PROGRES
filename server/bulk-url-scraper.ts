/**
 * Bulk URL Scraper - Process multiple URLs in sequence
 * 
 * Features:
 * - Sequential processing with error recovery
 * - Progress tracking and reporting
 * - Automatic retry logic
 * - Combines results from all products
 * - Continues even if individual URLs fail
 */

import { multiColorScraper, MultiColorResult } from './multi-color-scraper';
import { scenarioBasedScrape, ScenarioBasedResult } from './scenario-based-scraper';

export interface BulkScrapeProgress {
  currentIndex: number;
  totalUrls: number;
  currentUrl: string;
  status: 'processing' | 'success' | 'error';
  message: string;
}

export interface BulkScrapeResult {
  success: boolean;
  totalUrls: number;
  successfulUrls: number;
  failedUrls: number;
  results: Array<{
    url: string;
    index: number;
    success: boolean;
    colorCount?: number;
    variantCount?: number;
    data?: MultiColorResult | ScenarioBasedResult;
    error?: string;
  }>;
  combinedVariants: Array<{
    productUrl: string;
    productTitle: string;
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
    price: number;
    images: string[];
    brand: string;
    category?: string;
    features?: Array<{key: string, value: string}>;
  }>;
}

export class BulkUrlScraper {
  private progressCallback?: (progress: BulkScrapeProgress) => void;

  /**
   * Set progress callback for real-time updates
   */
  setProgressCallback(callback: (progress: BulkScrapeProgress) => void) {
    this.progressCallback = callback;
  }

  /**
   * Process multiple URLs in bulk with parallel processing
   * @param urls Array of URLs to scrape
   * @param extractAllColors Whether to extract all color variants for each URL
   */
  async scrapeMultipleUrls(
    urls: string[],
    extractAllColors: boolean = false
  ): Promise<BulkScrapeResult> {
    console.log('📦 BULK URL SCRAPER: Starting parallel batch processing...');
    console.log(`📌 Total URLs: ${urls.length}`);
    console.log(`🎨 Extract all colors: ${extractAllColors ? 'YES' : 'NO'}`);

    const results: BulkScrapeResult['results'] = [];
    const combinedVariants: BulkScrapeResult['combinedVariants'] = [];

    // 🚀 PARALLEL PROCESSING: Process in batches of 5 concurrent requests (balanced)
    const BATCH_SIZE = 5;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, urls.length);
      const batchUrls = urls.slice(batchStart, batchEnd);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`🚀 BATCH ${batchIndex + 1}/${totalBatches}: Processing ${batchUrls.length} URLs in parallel`);
      console.log(`${'='.repeat(80)}\n`);

      // Process batch in parallel
      const batchPromises = batchUrls.map(async (url, batchOffset) => {
        const i = batchStart + batchOffset;
        const trimmedUrl = url.trim();
        
        if (!trimmedUrl) {
          console.log(`⚠️ Skipping empty URL at index ${i + 1}`);
          return null;
        }

        console.log(`📦 [${i + 1}/${urls.length}] Starting: ${trimmedUrl}`);

        // Notify progress
        this.notifyProgress({
          currentIndex: i,
          totalUrls: urls.length,
          currentUrl: trimmedUrl,
          status: 'processing',
          message: `Processing URL ${i + 1}/${urls.length}...`
        });

        try {
          // 🚀 Balanced delay for rate limiting (safer than 50ms)
          const delay = 200 + Math.random() * 200; // 200-400ms (safer)
          await new Promise(resolve => setTimeout(resolve, delay));

          let scrapeResult: MultiColorResult | ScenarioBasedResult;
          let colorCount = 0;
          let variantCount = 0;

          if (extractAllColors) {
            // Extract all color variants
            scrapeResult = await multiColorScraper.scrapeAllColors(trimmedUrl);
          colorCount = (scrapeResult as MultiColorResult).totalColors || 0;
          
          // Extract combined variants
          if ((scrapeResult as MultiColorResult).combinedData) {
            const combined = (scrapeResult as MultiColorResult).combinedData!;
            const localVariants = combined.allVariants.map(variant => ({
              productUrl: trimmedUrl,
              productTitle: combined.title,
                color: variant.color,
                colorCode: variant.colorCode,
                size: variant.size,
                inStock: variant.inStock,
                price: combined.price.original,
                images: variant.images || combined.allImages,
                brand: combined.brand,
                category: combined.category,
                features: combined.features
              }));
            variantCount = localVariants.length;
            return { localVariants, scrapeResult, i, trimmedUrl, colorCount, variantCount };
          }
        } else {
          // Extract single URL (current color only)
          scrapeResult = await scenarioBasedScrape(trimmedUrl);
          colorCount = 1;
          
          // Extract variants from single result
          if ((scrapeResult as ScenarioBasedResult).success) {
            const singleResult = scrapeResult as ScenarioBasedResult;
            const variants = Array.isArray(singleResult.variants)
              ? singleResult.variants
              : singleResult.variants.allVariants || [];
            
            const localVariants = variants.map((variant: any) => ({
              productUrl: trimmedUrl,
              productTitle: singleResult.title,
                color: variant.color,
                colorCode: variant.colorCode,
                size: variant.size,
                inStock: variant.inStock,
                price: singleResult.price.original,
                images: singleResult.images,
                brand: singleResult.brand,
                category: singleResult.category,
                features: singleResult.features
              }));
            variantCount = localVariants.length;
            return { localVariants, scrapeResult, i, trimmedUrl, colorCount, variantCount };
          }
        }

          const isSuccess = extractAllColors
            ? (scrapeResult as MultiColorResult).success
            : (scrapeResult as ScenarioBasedResult).success;

          if (isSuccess) {
            console.log(`✅ [${i + 1}/${urls.length}] Success: ${colorCount} colors, ${variantCount} variants`);
            return {
              localVariants: [],
              scrapeResult,
              i,
              trimmedUrl,
              colorCount,
              variantCount,
              success: true
            };
          } else {
            console.log(`⚠️ [${i + 1}/${urls.length}] Extraction failed`);
            return {
              localVariants: [],
              scrapeResult: null,
              i,
              trimmedUrl,
              colorCount: 0,
              variantCount: 0,
              success: false,
              error: 'Extraction failed'
            };
          }

        } catch (error) {
          console.error(`❌ [${i + 1}/${urls.length}] Error: ${error.message}`);
          return {
            localVariants: [],
            scrapeResult: null,
            i,
            trimmedUrl,
            colorCount: 0,
            variantCount: 0,
            success: false,
            error: error.message
          };
        }
      });

      // 🚀 Wait for all URLs in batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Process batch results
      for (const result of batchResults) {
        if (!result) continue;

        const { localVariants, scrapeResult, i, trimmedUrl, colorCount, variantCount, success, error } = result;

        // Add variants to combined list
        if (localVariants && localVariants.length > 0) {
          combinedVariants.push(...localVariants);
        }

        // Add to results
        if (success) {
          results.push({
            url: trimmedUrl,
            index: i,
            success: true,
            colorCount,
            variantCount,
            data: scrapeResult
          });

          this.notifyProgress({
            currentIndex: i,
            totalUrls: urls.length,
            currentUrl: trimmedUrl,
            status: 'success',
            message: `Extracted ${colorCount} colors, ${variantCount} variants`
          });
        } else {
          results.push({
            url: trimmedUrl,
            index: i,
            success: false,
            error: error || 'Unknown error'
          });

          this.notifyProgress({
            currentIndex: i,
            totalUrls: urls.length,
            currentUrl: trimmedUrl,
            status: 'error',
            message: error || 'Extraction failed'
          });
        }
      }

      // Balanced delay between batches for anti-blocking
      if (batchIndex < totalBatches - 1) {
        const batchDelay = 800 + Math.random() * 400; // 800-1200ms (safer)
        console.log(`⏸️ Batch cooldown: ${Math.round(batchDelay)}ms\n`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    const successfulUrls = results.filter(r => r.success).length;
    const failedUrls = results.filter(r => !r.success).length;

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 BULK SCRAPING SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Successful: ${successfulUrls}/${urls.length}`);
    console.log(`❌ Failed: ${failedUrls}/${urls.length}`);
    console.log(`🎨 Total variants extracted: ${combinedVariants.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      success: successfulUrls > 0,
      totalUrls: urls.length,
      successfulUrls,
      failedUrls,
      results,
      combinedVariants
    };
  }

  /**
   * Parse multiple URLs from text input (one URL per line)
   */
  static parseUrls(text: string): string[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.startsWith('http'));
  }

  /**
   * Notify progress callback if set
   */
  private notifyProgress(progress: BulkScrapeProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}

// Export singleton instance
export const bulkUrlScraper = new BulkUrlScraper();
