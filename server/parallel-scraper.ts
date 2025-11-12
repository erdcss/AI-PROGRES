/**
 * ⚡ PARALLEL SCRAPING SYSTEM
 * Process multiple URLs simultaneously for maximum performance
 */

import { scrapeProductScenarioBased } from './scenario-based-scraper';

interface ScrapeTask {
  url: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class ParallelScraperQueue {
  private queue: ScrapeTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrent = 5; // Process 5 URLs simultaneously
  
  /**
   * Add a URL to the scraping queue
   */
  async scrape(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the queue with parallel execution
   */
  private async processQueue(): Promise<void> {
    // Don't start more tasks if we're at max concurrency
    if (this.activeCount >= this.maxConcurrent) {
      return;
    }

    // Get next task from queue
    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.activeCount++;
    console.log(`🚀 Starting scrape (${this.activeCount}/${this.maxConcurrent} active, ${this.queue.length} in queue)`);

    try {
      const startTime = Date.now();
      const result = await scrapeProductScenarioBased(task.url);
      const duration = Date.now() - startTime;
      console.log(`✅ Scrape completed in ${duration}ms`);
      task.resolve(result);
    } catch (error) {
      console.error('❌ Scrape failed:', error);
      task.reject(error);
    } finally {
      this.activeCount--;
      
      // Process next task in queue
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Scrape multiple URLs in parallel
   */
  async scrapeMultiple(urls: string[]): Promise<any[]> {
    console.log(`🎯 Starting parallel scrape of ${urls.length} URLs`);
    const startTime = Date.now();
    
    const promises = urls.map(url => this.scrape(url));
    const results = await Promise.all(promises);
    
    const duration = Date.now() - startTime;
    const avgTime = duration / urls.length;
    console.log(`⚡ Completed ${urls.length} scrapes in ${duration}ms (avg ${Math.round(avgTime)}ms per URL)`);
    
    return results;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

// Singleton instance
export const parallelScraper = new ParallelScraperQueue();
