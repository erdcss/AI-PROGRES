/**
 * ⚡ ULTRA-FAST BROWSER POOL SYSTEM
 * Reuses Puppeteer browser instances for maximum performance
 * Prevents expensive browser creation/destruction overhead
 */

import puppeteer, { Browser, Page } from 'puppeteer';

interface PooledBrowser {
  browser: Browser;
  lastUsed: number;
  inUse: boolean;
}

class BrowserPool {
  private pool: PooledBrowser[] = [];
  private readonly maxPoolSize = 5; // Maximum 5 concurrent browsers
  private readonly maxIdleTime = 5 * 60 * 1000; // 5 minutes idle before cleanup
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Get or create a browser instance from the pool
   */
  async acquire(): Promise<Browser> {
    // Try to find an available browser in the pool
    const available = this.pool.find(pb => !pb.inUse);
    
    if (available) {
      console.log('♻️ Reusing existing browser from pool');
      available.inUse = true;
      available.lastUsed = Date.now();
      return available.browser;
    }

    // Create new browser if pool is not full
    if (this.pool.length < this.maxPoolSize) {
      console.log('🚀 Creating new browser instance (pool size:', this.pool.length + 1, ')');
      const browser = await this.createBrowser();
      const pooledBrowser: PooledBrowser = {
        browser,
        lastUsed: Date.now(),
        inUse: true
      };
      this.pool.push(pooledBrowser);
      return browser;
    }

    // Pool is full, wait for an available browser
    console.log('⏳ Pool is full, waiting for available browser...');
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const available = this.pool.find(pb => !pb.inUse);
        if (available) {
          clearInterval(checkInterval);
          available.inUse = true;
          available.lastUsed = Date.now();
          resolve(available.browser);
        }
      }, 100);
    });
  }

  /**
   * Release a browser back to the pool
   */
  release(browser: Browser): void {
    const pooledBrowser = this.pool.find(pb => pb.browser === browser);
    if (pooledBrowser) {
      pooledBrowser.inUse = false;
      pooledBrowser.lastUsed = Date.now();
      console.log('✅ Browser released back to pool');
    }
  }

  /**
   * Create a new browser with optimal settings
   */
  private async createBrowser(): Promise<Browser> {
    return await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });
  }

  /**
   * Start periodic cleanup of idle browsers
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000); // Run every minute
  }

  /**
   * Cleanup idle browsers
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.pool.length; i++) {
      const pb = this.pool[i];
      const idleTime = now - pb.lastUsed;
      
      if (!pb.inUse && idleTime > this.maxIdleTime) {
        console.log('🧹 Closing idle browser (idle for', Math.round(idleTime / 1000), 'seconds)');
        try {
          await pb.browser.close();
          toRemove.push(i);
        } catch (error) {
          console.error('❌ Error closing browser:', error);
        }
      }
    }

    // Remove closed browsers from pool
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.pool.splice(toRemove[i], 1);
    }

    if (toRemove.length > 0) {
      console.log('📊 Browser pool size after cleanup:', this.pool.length);
    }
  }

  /**
   * Shutdown the entire pool
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    console.log('🛑 Shutting down browser pool...');
    for (const pb of this.pool) {
      try {
        await pb.browser.close();
      } catch (error) {
        console.error('❌ Error closing browser during shutdown:', error);
      }
    }
    this.pool = [];
    console.log('✅ Browser pool shutdown complete');
  }

  /**
   * Get current pool statistics
   */
  getStats() {
    return {
      total: this.pool.length,
      inUse: this.pool.filter(pb => pb.inUse).length,
      available: this.pool.filter(pb => !pb.inUse).length,
      maxSize: this.maxPoolSize
    };
  }
}

// Singleton instance
export const browserPool = new BrowserPool();

// Graceful shutdown on process termination
process.on('SIGINT', async () => {
  await browserPool.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserPool.shutdown();
  process.exit(0);
});
