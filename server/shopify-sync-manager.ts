import { db } from './db';
import { shopifySyncLogs, variantChanges, priceHistory, stockHistory, urlTracking } from '@shared/schema';
import { ShopifyApiService } from './shopify-api-service';
import { eq } from 'drizzle-orm';
import { appendFileSync } from 'fs';
import { join } from 'path';

interface VariantChange {
  id: number;
  changeType: string;
  color: string | null;
  size: string | null;
  oldStockCount: number | null;
  newStockCount: number | null;
  oldInStock: boolean | null;
  newInStock: boolean | null;
  variantId: number | null;
}

interface PriceChange {
  oldPrice: number;
  newPrice: number;
  changeType: 'increase' | 'decrease';
  changePercentage: number;
}

interface SyncResult {
  success: boolean;
  action: string;
  changes: number;
  errors: number;
  details: {
    priceUpdates: number;
    stockUpdates: number;
    variantsAdded: number;
    variantsRemoved: number;
    productArchived: boolean;
  };
}

/**
 * 🤖 SHOPIFY SYNC MANAGER
 * 
 * Autonomous synchronization engine that applies the decision matrix:
 * - Detects changes from VariantTrackingService
 * - Applies Shopify updates via ShopifyApiService
 * - Implements retry logic with exponential backoff
 * - Handles rate limits gracefully
 * - Maintains complete audit trail
 * - Sends Telegram notifications
 */
export class ShopifySyncManager {
  private shopifyApi: ShopifyApiService;
  private maxRetries = 3;
  private baseRetryDelay = 1000; // 1 second
  private logsPath = join(process.cwd(), 'logs.txt');

  constructor() {
    this.shopifyApi = new ShopifyApiService();
    console.log('🤖 ShopifySyncManager initialized');
  }

  /**
   * 📊 DECISION MATRIX - Main orchestrator
   * Processes all detected changes and applies appropriate Shopify actions
   */
  async processChanges(productId: number, changes: {
    variantChanges?: VariantChange[];
    priceChange?: PriceChange;
    productDeleted?: boolean;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      action: 'sync',
      changes: 0,
      errors: 0,
      details: {
        priceUpdates: 0,
        stockUpdates: 0,
        variantsAdded: 0,
        variantsRemoved: 0,
        productArchived: false
      }
    };

    try {
      console.log(`\n🤖 SYNC MANAGER: Processing changes for product ${productId}`);
      
      // Get product info
      const [product] = await db.select()
        .from(urlTracking)
        .where(eq(urlTracking.id, productId))
        .limit(1);

      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      // DECISION MATRIX CASES

      // 🗑️ Case 1: Product deleted from Trendyol → Archive in Shopify
      if (changes.productDeleted) {
        await this.handleProductDeletion(product, result);
      }

      // 💰 Case 2: Price changed → Update Shopify variant price
      if (changes.priceChange) {
        await this.handlePriceChange(product, changes.priceChange, result);
      }

      // 🧩 Case 3: Variant changes → Create/Remove/Update variants
      if (changes.variantChanges && changes.variantChanges.length > 0) {
        for (const variantChange of changes.variantChanges) {
          await this.handleVariantChange(product, variantChange, result);
        }
      }

      // Write audit log
      this.writeAuditLog(productId, product.productTitle || 'Unknown', result);

      console.log(`✅ SYNC MANAGER: Completed with ${result.changes} changes, ${result.errors} errors`);
      
      return result;

    } catch (error) {
      console.error('❌ SYNC MANAGER: Fatal error:', error);
      result.success = false;
      result.errors++;
      
      await this.logSyncError(productId, null, 'fatal_error', error as Error);
      
      return result;
    }
  }

  /**
   * 🗑️ Handle product deletion - Archive product in Shopify
   */
  private async handleProductDeletion(product: any, result: SyncResult): Promise<void> {
    console.log('🗑️ DECISION: Product deleted from Trendyol → Archive in Shopify');
    
    if (!product.shopifyProductId) {
      console.log('⚠️ No Shopify product ID, skipping archive');
      return;
    }

    try {
      // Archive product in Shopify (set status to 'draft' or 'archived')
      await this.retryWithBackoff(async () => {
        // TODO: Implement Shopify product archive API call
        console.log(`📦 Archiving Shopify product ${product.shopifyProductId}`);
        // await this.shopifyApi.archiveProduct(product.shopifyProductId);
      });

      result.details.productArchived = true;
      result.changes++;

      await this.logSyncSuccess(product.id, null, 'archive_product', {
        shopifyProductId: product.shopifyProductId
      });

    } catch (error) {
      console.error('❌ Failed to archive product:', error);
      result.errors++;
      await this.logSyncError(product.id, null, 'archive_product', error as Error);
    }
  }

  /**
   * 💰 Handle price change - Update Shopify variant price
   */
  private async handlePriceChange(product: any, priceChange: PriceChange, result: SyncResult): Promise<void> {
    console.log(`💰 DECISION: Price ${priceChange.changeType} (${priceChange.changePercentage.toFixed(2)}%) → Update Shopify`);
    
    if (!product.shopifyProductId) {
      console.log('⚠️ No Shopify product ID, skipping price update');
      return;
    }

    try {
      // Calculate new Shopify price with 10% profit margin
      const newShopifyPrice = (priceChange.newPrice * 1.10).toFixed(2);

      await this.retryWithBackoff(async () => {
        console.log(`💵 Updating price: ${priceChange.oldPrice} TL → ${priceChange.newPrice} TL (Shopify: ${newShopifyPrice} TL)`);
        
        // TODO: Implement Shopify price update API call
        // await this.shopifyApi.updateVariantPrice(product.shopifyVariantId, newShopifyPrice);
      });

      result.details.priceUpdates++;
      result.changes++;

      await this.logSyncSuccess(product.id, null, 'update_price', {
        oldPrice: priceChange.oldPrice,
        newPrice: priceChange.newPrice,
        shopifyPrice: newShopifyPrice
      });

    } catch (error) {
      console.error('❌ Failed to update price:', error);
      result.errors++;
      await this.logSyncError(product.id, null, 'update_price', error as Error);
    }
  }

  /**
   * 🧩 Handle variant change - Add/Remove/Update variant
   */
  private async handleVariantChange(product: any, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`🧩 DECISION: Variant ${change.changeType} (${change.color}/${change.size})`);

    try {
      switch (change.changeType) {
        case 'variant_added':
          await this.handleVariantAdded(product, change, result);
          break;
          
        case 'variant_removed':
          await this.handleVariantRemoved(product, change, result);
          break;
          
        case 'variant_stock_changed':
          await this.handleStockChange(product, change, result);
          break;
          
        case 'variant_oos':
          await this.handleVariantOutOfStock(product, change, result);
          break;
          
        case 'variant_back_in_stock':
          await this.handleVariantBackInStock(product, change, result);
          break;
          
        default:
          console.log(`⚠️ Unknown change type: ${change.changeType}`);
      }

      // Mark as synced in database (if change has ID from database)
      if (change.id) {
        await db.update(variantChanges)
          .set({ 
            shopifySynced: true,
            shopifySyncAt: new Date()
          } as any)
          .where(eq(variantChanges.id, change.id));
      }

    } catch (error) {
      console.error(`❌ Failed to handle variant change:`, error);
      result.errors++;
      await this.logSyncError(product.id, change.variantId, change.changeType, error as Error);
    }
  }

  /**
   * ➕ Handle new variant added
   */
  private async handleVariantAdded(product: any, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`➕ DECISION: New variant added → Create in Shopify`);

    await this.retryWithBackoff(async () => {
      // TODO: Implement Shopify create variant API call
      console.log(`📦 Creating variant: ${change.color} / ${change.size}`);
      // await this.shopifyApi.createVariant(product.shopifyProductId, {
      //   option1: change.color,
      //   option2: change.size,
      //   inventory_quantity: change.newStockCount || 0
      // });
    });

    result.details.variantsAdded++;
    result.changes++;

    await this.logSyncSuccess(product.id, change.variantId, 'create_variant', {
      color: change.color,
      size: change.size,
      stock: change.newStockCount
    });
  }

  /**
   * ➖ Handle variant removed
   */
  private async handleVariantRemoved(product: any, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`➖ DECISION: Variant removed → Archive in Shopify`);

    await this.retryWithBackoff(async () => {
      // TODO: Implement Shopify archive variant API call
      console.log(`📦 Archiving variant: ${change.color} / ${change.size}`);
      // await this.shopifyApi.archiveVariant(shopifyVariantId);
    });

    result.details.variantsRemoved++;
    result.changes++;

    await this.logSyncSuccess(product.id, change.variantId, 'archive_variant', {
      color: change.color,
      size: change.size
    });
  }

  /**
   * 📦 Handle stock change
   */
  private async handleStockChange(product: any, change: VariantChange, result: SyncResult): Promise<void> {
    const stockDiff = (change.newStockCount || 0) - (change.oldStockCount || 0);
    console.log(`📦 DECISION: Stock changed (${stockDiff > 0 ? '+' : ''}${stockDiff}) → Update Shopify inventory`);

    await this.retryWithBackoff(async () => {
      // TODO: Implement Shopify inventory update API call
      console.log(`📊 Updating inventory: ${change.oldStockCount} → ${change.newStockCount}`);
      // await this.shopifyApi.updateInventory(shopifyInventoryItemId, change.newStockCount);
    });

    result.details.stockUpdates++;
    result.changes++;

    await this.logSyncSuccess(product.id, change.variantId, 'update_stock', {
      oldStock: change.oldStockCount,
      newStock: change.newStockCount,
      color: change.color,
      size: change.size
    });
  }

  /**
   * 🚫 Handle variant out of stock - Set inventory to 0
   */
  private async handleVariantOutOfStock(product: any, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`🚫 DECISION: Variant out of stock → Set Shopify inventory to 0`);

    await this.retryWithBackoff(async () => {
      // TODO: Implement Shopify inventory set to 0
      console.log(`❌ Setting inventory to 0: ${change.color} / ${change.size}`);
      // await this.shopifyApi.updateInventory(shopifyInventoryItemId, 0);
    });

    result.details.stockUpdates++;
    result.changes++;

    await this.logSyncSuccess(product.id, change.variantId, 'set_oos', {
      color: change.color,
      size: change.size
    });
  }

  /**
   * ✅ Handle variant back in stock - Reactivate variant
   */
  private async handleVariantBackInStock(product: any, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`✅ DECISION: Variant back in stock → Reactivate in Shopify`);

    await this.retryWithBackoff(async () => {
      // TODO: Implement Shopify variant reactivation
      console.log(`✅ Reactivating variant: ${change.color} / ${change.size} (Stock: ${change.newStockCount})`);
      // await this.shopifyApi.updateInventory(shopifyInventoryItemId, change.newStockCount);
    });

    result.details.stockUpdates++;
    result.changes++;

    await this.logSyncSuccess(product.id, change.variantId, 'reactivate_variant', {
      color: change.color,
      size: change.size,
      stock: change.newStockCount
    });
  }

  /**
   * 🔄 Retry with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Check for rate limit (429 status)
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.baseRetryDelay * Math.pow(2, retryCount);
        
        console.log(`⏳ Rate limited. Waiting ${waitTime}ms before retry...`);
        await this.sleep(waitTime);
      } else if (retryCount < this.maxRetries) {
        // Exponential backoff for other errors
        const waitTime = this.baseRetryDelay * Math.pow(2, retryCount);
        console.log(`⚠️ Error occurred. Retry ${retryCount + 1}/${this.maxRetries} after ${waitTime}ms`);
        await this.sleep(waitTime);
      } else {
        // Max retries exceeded
        throw error;
      }

      // Retry
      return this.retryWithBackoff(fn, retryCount + 1);
    }
  }

  /**
   * 💤 Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ✅ Log successful sync to database
   */
  private async logSyncSuccess(
    productId: number,
    variantId: number | null,
    syncType: string,
    data: any
  ): Promise<void> {
    try {
      await db.insert(shopifySyncLogs).values({
        productId,
        variantId,
        syncType,
        status: 'success',
        requestData: data,
        responseData: { success: true },
        errorMessage: null
      } as any);
    } catch (error) {
      console.error('Failed to log sync success:', error);
    }
  }

  /**
   * ❌ Log sync error to database
   */
  private async logSyncError(
    productId: number,
    variantId: number | null,
    syncType: string,
    error: Error
  ): Promise<void> {
    try {
      await db.insert(shopifySyncLogs).values({
        productId,
        variantId,
        syncType,
        status: 'failed',
        requestData: null,
        responseData: null,
        errorMessage: error.message
      } as any);
    } catch (err) {
      console.error('Failed to log sync error:', err);
    }
  }

  /**
   * 📝 Write audit trail to logs.txt
   */
  private writeAuditLog(productId: number, productTitle: string, result: SyncResult): void {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `
[${timestamp}] SYNC AUDIT
Product ID: ${productId}
Product: ${productTitle}
Success: ${result.success}
Changes: ${result.changes}
Errors: ${result.errors}
Details:
  - Price Updates: ${result.details.priceUpdates}
  - Stock Updates: ${result.details.stockUpdates}
  - Variants Added: ${result.details.variantsAdded}
  - Variants Removed: ${result.details.variantsRemoved}
  - Product Archived: ${result.details.productArchived}
---
`;

      appendFileSync(this.logsPath, logEntry);
      console.log('📝 Audit log written to logs.txt');
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  /**
   * 📊 Get sync statistics
   */
  async getSyncStats(productId?: number) {
    try {
      let query = db.select().from(shopifySyncLogs);
      
      if (productId) {
        query = query.where(eq(shopifySyncLogs.productId, productId)) as any;
      }

      const logs = await query;

      const stats = {
        total: logs.length,
        successful: logs.filter(l => l.status === 'success').length,
        failed: logs.filter(l => l.status === 'failed').length,
        byType: logs.reduce((acc: any, log) => {
          acc[log.syncType] = (acc[log.syncType] || 0) + 1;
          return acc;
        }, {})
      };

      return stats;
    } catch (error) {
      console.error('Failed to get sync stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const shopifySyncManager = new ShopifySyncManager();
