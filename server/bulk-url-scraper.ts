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
   * Process multiple URLs in bulk
   * @param urls Array of URLs to scrape
   * @param extractAllColors Whether to extract all color variants for each URL
   */
  async scrapeMultipleUrls(
    urls: string[],
    extractAllColors: boolean = false
  ): Promise<BulkScrapeResult> {
    console.log('📦 BULK URL SCRAPER: Starting batch processing...');
    console.log(`📌 Total URLs: ${urls.length}`);
    console.log(`🎨 Extract all colors: ${extractAllColors ? 'YES' : 'NO'}`);

    const results: BulkScrapeResult['results'] = [];
    const combinedVariants: BulkScrapeResult['combinedVariants'] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();
      
      if (!url) {
        console.log(`⚠️ Skipping empty URL at index ${i + 1}`);
        continue;
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 Processing ${i + 1}/${urls.length}: ${url}`);
      console.log(`${'='.repeat(60)}\n`);

      // Notify progress
      this.notifyProgress({
        currentIndex: i,
        totalUrls: urls.length,
        currentUrl: url,
        status: 'processing',
        message: `Processing URL ${i + 1}/${urls.length}...`
      });

      try {
        // Add delay between requests to avoid rate limiting
        if (i > 0) {
          const delay = 1000 + Math.random() * 1000; // 1-2 seconds
          console.log(`⏳ Rate limiting: waiting ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        let scrapeResult: MultiColorResult | ScenarioBasedResult;
        let colorCount = 0;
        let variantCount = 0;

        if (extractAllColors) {
          // Extract all color variants
          scrapeResult = await multiColorScraper.scrapeAllColors(url);
          colorCount = (scrapeResult as MultiColorResult).totalColors || 0;
          
          // Extract combined variants
          if ((scrapeResult as MultiColorResult).combinedData) {
            const combined = (scrapeResult as MultiColorResult).combinedData!;
            combined.allVariants.forEach(variant => {
              combinedVariants.push({
                productUrl: url,
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
              });
            });
            variantCount = combined.allVariants.length;
          }
        } else {
          // Extract single URL (current color only)
          scrapeResult = await scenarioBasedScrape(url);
          colorCount = 1;
          
          // Extract variants from single result
          if ((scrapeResult as ScenarioBasedResult).success) {
            const singleResult = scrapeResult as ScenarioBasedResult;
            const variants = Array.isArray(singleResult.variants)
              ? singleResult.variants
              : singleResult.variants.allVariants || [];
            
            variants.forEach((variant: any) => {
              combinedVariants.push({
                productUrl: url,
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
              });
            });
            variantCount = variants.length;
          }
        }

        const isSuccess = extractAllColors
          ? (scrapeResult as MultiColorResult).success
          : (scrapeResult as ScenarioBasedResult).success;

        if (isSuccess) {
          console.log(`✅ Successfully processed URL ${i + 1}: ${colorCount} colors, ${variantCount} variants`);
          results.push({
            url,
            index: i,
            success: true,
            colorCount,
            variantCount,
            data: scrapeResult
          });

          this.notifyProgress({
            currentIndex: i,
            totalUrls: urls.length,
            currentUrl: url,
            status: 'success',
            message: `Extracted ${colorCount} colors, ${variantCount} variants`
          });
        } else {
          console.log(`⚠️ Failed to extract data from URL ${i + 1}`);
          results.push({
            url,
            index: i,
            success: false,
            error: 'Extraction failed'
          });

          this.notifyProgress({
            currentIndex: i,
            totalUrls: urls.length,
            currentUrl: url,
            status: 'error',
            message: 'Extraction failed'
          });
        }

      } catch (error) {
        console.error(`❌ Error processing URL ${i + 1}: ${error.message}`);
        results.push({
          url,
          index: i,
          success: false,
          error: error.message
        });

        this.notifyProgress({
          currentIndex: i,
          totalUrls: urls.length,
          currentUrl: url,
          status: 'error',
          message: error.message
        });
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
