import { db } from './db';
import { urlTracking, priceHistory } from '@shared/schema';
import { eq, desc, and, isNotNull } from 'drizzle-orm';
import { notificationGateway } from './notification-gateway';

interface ShopifyTransferRecord {
  sourceUrl: string;
  shopifyProductId?: string;
  shopifyVariantIds?: string[];
  transferStatus: 'pending' | 'synced' | 'failed' | 'retry';
  transferredAt: Date;
  lastSyncAt?: Date;
  syncErrors?: string[];
  productData: {
    title: string;
    brand: string;
    originalPrice: number;
    shopifyPrice: number;
    variantCount: number;
    imageCount: number;
  };
}

class ShopifySyncTracker {
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    console.log('📦 ShopifySyncTracker initialized');
  }

  // Register a product as transferred to Shopify
  async registerTransfer(data: {
    sourceUrl: string;
    title: string;
    brand: string;
    originalPrice: number;
    shopifyPrice: number;
    variantCount: number;
    imageCount: number;
    shopifyProductId?: string;
    shopifyVariantIds?: string[];
  }): Promise<void> {
    try {
      console.log(`📦 Registering Shopify transfer: ${data.title}`);

      // Update the urlTracking table with Shopify information
      await db
        .update(urlTracking)
        .set({
          shopifyProductId: data.shopifyProductId,
          shopifyVariantIds: data.shopifyVariantIds?.join(','),
          lastShopifySyncAt: new Date(),
          syncStatus: data.shopifyProductId ? 'synced' : 'pending',
          transferredAt: new Date()
        })
        .where(eq(urlTracking.url, data.sourceUrl));

      // Send notification via gateway (filtered mode will batch non-urgent ones)
      await notificationGateway.send({
        type: 'product_upload',
        url: data.sourceUrl,
        payload: {
          title: data.title,
          brand: data.brand,
          price: data.shopifyPrice,
          shopifyId: data.shopifyProductId,
          variants: data.variantCount,
          images: data.imageCount
        },
        priority: 'medium'
      });

      console.log(`✅ Shopify transfer registered: ${data.title}`);
      
    } catch (error) {
      console.error('❌ Shopify transfer registration failed:', error);
      
      // Send error notification
      await notificationGateway.send({
        type: 'error',
        url: data.sourceUrl,
        payload: {
          error: 'Transfer registration failed',
          location: 'ShopifySyncTracker.registerTransfer',
          details: (error as Error).message
        },
        priority: 'high'
      });
    }
  }

  // Get list of transferred products
  async getTransferredProducts(limit: number = 50): Promise<any[]> {
    try {
      const products = await db
        .select({
          url: urlTracking.url,
          productTitle: urlTracking.productTitle,
          currentPrice: urlTracking.currentPrice,
          shopifyProductId: urlTracking.shopifyProductId,
          syncStatus: urlTracking.syncStatus,
          transferredAt: urlTracking.transferredAt,
          lastShopifySyncAt: urlTracking.lastShopifySyncAt
        })
        .from(urlTracking)
        .where(isNotNull(urlTracking.transferredAt))
        .orderBy(desc(urlTracking.transferredAt))
        .limit(limit);

      return products;
    } catch (error) {
      console.error('❌ Failed to get transferred products:', error);
      return [];
    }
  }

  // Get transfer statistics
  async getTransferStats(): Promise<any> {
    try {
      const total = await db
        .select()
        .from(urlTracking)
        .where(isNotNull(urlTracking.transferredAt));

      const synced = total.filter(item => item.syncStatus === 'synced');
      const pending = total.filter(item => item.syncStatus === 'pending');
      const failed = total.filter(item => item.syncStatus === 'failed');

      return {
        total: total.length,
        synced: synced.length,
        pending: pending.length,
        failed: failed.length,
        successRate: total.length > 0 ? (synced.length / total.length * 100).toFixed(1) : 0
      };
    } catch (error) {
      console.error('❌ Failed to get transfer stats:', error);
      return {
        total: 0,
        synced: 0,
        pending: 0,
        failed: 0,
        successRate: 0
      };
    }
  }

  // Update sync status for a product
  async updateSyncStatus(sourceUrl: string, status: 'synced' | 'failed' | 'retry', shopifyData?: {
    productId?: string;
    variantIds?: string[];
    error?: string;
  }): Promise<void> {
    try {
      const updateData: any = {
        syncStatus: status,
        lastShopifySyncAt: new Date()
      };

      if (shopifyData?.productId) {
        updateData.shopifyProductId = shopifyData.productId;
      }

      if (shopifyData?.variantIds) {
        updateData.shopifyVariantIds = shopifyData.variantIds.join(',');
      }

      if (shopifyData?.error) {
        updateData.syncErrors = shopifyData.error;
      }

      await db
        .update(urlTracking)
        .set(updateData)
        .where(eq(urlTracking.url, sourceUrl));

      console.log(`📦 Sync status updated: ${sourceUrl} -> ${status}`);

      // Send notification for failed syncs
      if (status === 'failed') {
        await notificationGateway.send({
          type: 'error',
          url: sourceUrl,
          payload: {
            error: 'Shopify sync failed',
            location: 'ShopifySyncTracker.updateSyncStatus',
            details: shopifyData?.error || 'Unknown sync error'
          },
          priority: 'high'
        });
      }

    } catch (error) {
      console.error('❌ Failed to update sync status:', error);
    }
  }

  // Monitor price changes for transferred products
  async monitorTransferredProducts(): Promise<void> {
    try {
      const transferredProducts = await db
        .select()
        .from(urlTracking)
        .where(and(
          isNotNull(urlTracking.transferredAt),
          eq(urlTracking.isTracking, true)
        ));

      console.log(`📊 Monitoring ${transferredProducts.length} transferred products`);

      for (const product of transferredProducts) {
        // Check if price monitoring is already active
        if (!this.syncIntervals.has(product.url)) {
          this.startPriceMonitoring(product.url);
        }
      }

    } catch (error) {
      console.error('❌ Failed to monitor transferred products:', error);
    }
  }

  // Start price monitoring for a specific transferred product
  private startPriceMonitoring(url: string): void {
    const interval = setInterval(async () => {
      try {
        await this.checkProductChanges(url);
      } catch (error) {
        console.error(`❌ Price monitoring error for ${url}:`, error);
      }
    }, 10 * 60 * 1000); // Check every 10 minutes

    this.syncIntervals.set(url, interval);
    console.log(`📊 Price monitoring started for: ${url}`);
  }

  // Check for product changes (price, stock, status)
  private async checkProductChanges(url: string): Promise<void> {
    try {
      // Get current product data from tracking
      const currentProduct = await db
        .select()
        .from(urlTracking)
        .where(eq(urlTracking.url, url))
        .limit(1);

      if (currentProduct.length === 0) return;

      const product = currentProduct[0];
      
      // Here you would integrate with your price checking logic
      // For now, we'll simulate change detection
      
      // Note: In a real implementation, you'd call the price extraction service here
      // const newPrice = await ultimatePriceExtract(url);
      
      // For now, let's just check if the product needs attention
      const lastCheck = product.lastChecked ? new Date(product.lastChecked) : new Date(0);
      const hoursSinceLastCheck = (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastCheck > 1) { // If more than 1 hour since last check
        console.log(`🔍 Checking transferred product: ${product.productTitle}`);
        
        // Update last checked time
        await db
          .update(urlTracking)
          .set({ lastChecked: new Date() })
          .where(eq(urlTracking.url, url));
      }

    } catch (error) {
      console.error(`❌ Product change check failed for ${url}:`, error);
    }
  }

  // Stop monitoring for a specific product
  stopMonitoring(url: string): void {
    const interval = this.syncIntervals.get(url);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(url);
      console.log(`📊 Price monitoring stopped for: ${url}`);
    }
  }

  // Get recent changes for transferred products
  async getRecentChanges(limit: number = 20): Promise<any[]> {
    try {
      const recentChanges = await db
        .select({
          url: priceHistory.url,
          productTitle: priceHistory.productTitle,
          oldPrice: priceHistory.oldPrice,
          newPrice: priceHistory.newPrice,
          changePercent: priceHistory.changePercent,
          changedAt: priceHistory.changedAt
        })
        .from(priceHistory)
        .orderBy(desc(priceHistory.changedAt))
        .limit(limit);

      return recentChanges;
    } catch (error) {
      console.error('❌ Failed to get recent changes:', error);
      return [];
    }
  }

  // Clean up monitoring intervals
  shutdown(): void {
    for (const [url, interval] of this.syncIntervals) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();
    console.log('📦 ShopifySyncTracker shutdown complete');
  }
}

// Singleton instance
export const shopifySyncTracker = new ShopifySyncTracker();

// Export class for testing
export { ShopifySyncTracker };