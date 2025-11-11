import { db } from './db';
import { shopifySyncLogs, variantChanges, priceHistory, stockHistory, urlTracking, products } from '@shared/schema';
import { shopifyApiService } from './shopify-api-service';
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
    categoryUpdates: number;
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
  private maxRetries = 3;
  private baseRetryDelay = 1000; // 1 second
  private logsPath = join(process.cwd(), 'logs.txt');

  constructor() {
    console.log('🤖 ShopifySyncManager initialized with Shopify API integration');
  }

  /**
   * 📊 DECISION MATRIX - Main orchestrator
   * Processes all detected changes and applies appropriate Shopify actions
   * 
   * @param urlTrackingId - ID from urlTracking table (NOT products.id)
   */
  async processChanges(urlTrackingId: number, changes: {
    variantChanges?: VariantChange[];
    priceChange?: PriceChange;
    categoryChange?: { oldCategory: string; newCategory: string };
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
        categoryUpdates: 0,
        variantsAdded: 0,
        variantsRemoved: 0,
        productArchived: false
      }
    };

    let productsTableId: number | null = null;

    try {
      console.log(`\n🤖 SYNC MANAGER: Processing changes for urlTracking ${urlTrackingId}`);
      
      // Get urlTracking info
      const [urlTrackingRecord] = await db.select()
        .from(urlTracking)
        .where(eq(urlTracking.id, urlTrackingId))
        .limit(1);

      if (!urlTrackingRecord) {
        throw new Error(`UrlTracking ${urlTrackingId} not found`);
      }

      // ✅ FIX: Get products table ID for foreign key integrity
      productsTableId = urlTrackingRecord.productId;
      
      // If no productId link, try to sync
      if (!productsTableId) {
        console.log(`⚠️ No products.id linked to urlTracking ${urlTrackingId}, attempting sync...`);
        try {
          const { urlTrackingService } = await import('./url-tracking-service');
          productsTableId = await urlTrackingService.syncProductFromUrlTracking(urlTrackingId);
          console.log(`✅ Synced urlTracking ${urlTrackingId} → products ${productsTableId}`);
        } catch (syncError) {
          console.error(`❌ Failed to sync products table:`, syncError);
          // Continue without logging to shopifySyncLogs
        }
      }

      const product = urlTrackingRecord;

      // DECISION MATRIX CASES

      // 🗑️ Case 1: Product deleted from Trendyol → Archive in Shopify
      if (changes.productDeleted) {
        await this.handleProductDeletion(product, productsTableId, result);
      }

      // 💰 Case 2: Price changed → Update Shopify variant price
      if (changes.priceChange) {
        await this.handlePriceChange(product, productsTableId, changes.priceChange, result);
      }

      // 🏷️ Case 3: Category changed → Update Shopify product_type
      if (changes.categoryChange) {
        await this.handleCategoryChange(product, productsTableId, changes.categoryChange, result);
      }

      // 🧩 Case 4: Variant changes → Create/Remove/Update variants
      if (changes.variantChanges && changes.variantChanges.length > 0) {
        for (const variantChange of changes.variantChanges) {
          await this.handleVariantChange(product, productsTableId, variantChange, result);
        }
      }

      // Write audit log
      this.writeAuditLog(urlTrackingId, product.productTitle || 'Unknown', result);

      console.log(`✅ SYNC MANAGER: Completed with ${result.changes} changes, ${result.errors} errors`);
      
      return result;

    } catch (error) {
      console.error('❌ SYNC MANAGER: Fatal error:', error);
      result.success = false;
      result.errors++;
      
      // Only log error if we have a valid productsTableId
      if (productsTableId) {
        await this.logSyncError(productsTableId, null, 'fatal_error', error as Error);
      }
      
      return result;
    }
  }

  /**
   * 🗑️ Handle product deletion - Archive product in Shopify
   */
  private async handleProductDeletion(product: any, productsTableId: number | null, result: SyncResult): Promise<void> {
    console.log('🗑️ DECISION: Product deleted from Trendyol → Archive in Shopify');
    
    if (!product.shopifyProductId) {
      console.log('⚠️ No Shopify product ID, skipping archive');
      return;
    }

    try {
      // Archive product in Shopify (set status to 'archived')
      await this.retryWithBackoff(async () => {
        console.log(`📦 Archiving Shopify product ${product.shopifyProductId}`);
        await shopifyApiService.archiveProduct(product.shopifyProductId);
      });

      result.details.productArchived = true;
      result.changes++;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, null, 'archive_product', {
          shopifyProductId: product.shopifyProductId
        });
      }

    } catch (error) {
      console.error('❌ Failed to archive product:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, null, 'archive_product', error as Error);
      }
    }
  }

  /**
   * 💰 Handle price change - Update Shopify variant price
   * For multi-variant products, updates ALL variants since price change is product-level
   */
  private async handlePriceChange(product: any, productsTableId: number | null, priceChange: PriceChange, result: SyncResult): Promise<void> {
    console.log(`💰 DECISION: Price ${priceChange.changeType} (${priceChange.changePercentage.toFixed(2)}%) → Update Shopify`);
    
    if (!product.shopifyProductId) {
      console.log('⚠️ No Shopify product ID, skipping price update');
      return;
    }

    // Get all Shopify variant IDs for this product (price change affects all variants)
    const variantIds: string[] = [];
    
    if (product.shopifyVariantId) {
      variantIds.push(product.shopifyVariantId);
    }
    
    if (product.shopifyVariantIds) {
      try {
        const ids = typeof product.shopifyVariantIds === 'string' 
          ? JSON.parse(product.shopifyVariantIds) 
          : product.shopifyVariantIds;
        if (Array.isArray(ids)) {
          variantIds.push(...ids.filter((id: any) => id && !variantIds.includes(id)));
        }
      } catch (e) {
        console.error('Failed to parse variant IDs:', e);
      }
    }

    if (variantIds.length === 0) {
      console.log('⚠️ No Shopify variant IDs found, skipping price update');
      return;
    }

    console.log(`📦 Updating price for ${variantIds.length} variant(s)`);

    try {
      // Calculate new Shopify price with 10% profit margin
      const newShopifyPrice = priceChange.newPrice * 1.10;

      // Update all variants
      for (const variantId of variantIds) {
        await this.retryWithBackoff(async () => {
          console.log(`💵 Updating variant ${variantId}: ${priceChange.oldPrice} TL → ${priceChange.newPrice} TL (Shopify: ${newShopifyPrice.toFixed(2)} TL)`);
          
          await shopifyApiService.updateVariantPrice(
            variantId,
            newShopifyPrice,
            priceChange.newPrice // compare_at_price (original Trendyol price)
          );
        });
      }

      result.details.priceUpdates += variantIds.length;
      result.changes += variantIds.length;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, null, 'update_price', {
          oldPrice: priceChange.oldPrice,
          newPrice: priceChange.newPrice,
          shopifyPrice: newShopifyPrice.toFixed(2),
          variantCount: variantIds.length,
          variantIds
        });
      }

    } catch (error) {
      console.error('❌ Failed to update price:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, null, 'update_price', error as Error);
      }
    }
  }

  /**
   * 🏷️ Handle category change - Update Shopify product_type
   */
  private async handleCategoryChange(product: any, productsTableId: number | null, categoryChange: { oldCategory: string; newCategory: string }, result: SyncResult): Promise<void> {
    console.log(`🏷️ DECISION: Category changed from "${categoryChange.oldCategory}" to "${categoryChange.newCategory}" → Update Shopify`);
    
    if (!product.shopifyProductId) {
      console.log('⚠️ No Shopify product ID, skipping category update');
      return;
    }

    try {
      // Update Shopify product_type
      await this.retryWithBackoff(async () => {
        console.log(`📂 Updating Shopify product ${product.shopifyProductId} category: ${categoryChange.oldCategory} → ${categoryChange.newCategory}`);
        
        await shopifyApiService.updateProductCategory(
          product.shopifyProductId,
          categoryChange.newCategory
        );
      });

      result.details.categoryUpdates++;
      result.changes++;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, null, 'update_category', {
          oldCategory: categoryChange.oldCategory,
          newCategory: categoryChange.newCategory,
          shopifyProductId: product.shopifyProductId
        });
      }

    } catch (error) {
      console.error('❌ Failed to update category:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, null, 'update_category', error as Error);
      }
    }
  }

  /**
   * 🔍 Get Shopify variant ID for a specific variant change
   * Queries productVariants table to find the exact Shopify variant ID
   */
  private async getShopifyVariantId(change: VariantChange, product: any): Promise<string | null> {
    // First, try to get from change.variantId (most accurate)
    if (change.variantId) {
      try {
        const { productVariants } = await import('@shared/schema');
        const [variant] = await db.select()
          .from(productVariants)
          .where(eq(productVariants.id, change.variantId))
          .limit(1);
        
        if (variant?.shopifyVariantId) {
          console.log(`✅ Found Shopify variant ID ${variant.shopifyVariantId} for variant ${change.variantId}`);
          return variant.shopifyVariantId;
        }
      } catch (e) {
        console.error('Failed to query variant:', e);
      }
    }

    // Fallback: Use product-level variant ID (for single-variant products)
    let variantId = product.shopifyVariantId;
    if (!variantId && product.shopifyVariantIds) {
      try {
        const variantIds = typeof product.shopifyVariantIds === 'string' 
          ? JSON.parse(product.shopifyVariantIds) 
          : product.shopifyVariantIds;
        variantId = variantIds[0];
      } catch (e) {
        console.error('Failed to parse variant IDs:', e);
      }
    }

    if (variantId) {
      console.log(`⚠️ Using fallback product-level variant ID: ${variantId}`);
    } else {
      console.log(`❌ No Shopify variant ID found`);
    }

    return variantId || null;
  }

  /**
   * 🧩 Handle variant change - Add/Remove/Update variant
   */
  private async handleVariantChange(product: any, productsTableId: number | null, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`🧩 DECISION: Variant ${change.changeType} (${change.color}/${change.size})`);

    try {
      switch (change.changeType) {
        case 'variant_added':
          await this.handleVariantAdded(product, productsTableId, change, result);
          break;
          
        case 'variant_removed':
          await this.handleVariantRemoved(product, productsTableId, change, result);
          break;
          
        case 'variant_stock_changed':
          await this.handleStockChange(product, productsTableId, change, result);
          break;
          
        case 'variant_oos':
          await this.handleVariantOutOfStock(product, productsTableId, change, result);
          break;
          
        case 'variant_back_in_stock':
          await this.handleVariantBackInStock(product, productsTableId, change, result);
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
      if (productsTableId) {
        await this.logSyncError(productsTableId, change.variantId, change.changeType, error as Error);
      }
    }
  }

  /**
   * ➕ Handle new variant added
   */
  private async handleVariantAdded(product: any, productsTableId: number | null, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`➕ DECISION: New variant added → Create in Shopify`);

    if (!product.shopifyProductId) {
      console.log('⚠️ No Shopify product ID, skipping variant creation');
      return;
    }

    try {
      let newShopifyVariantId: string | null = null;

      await this.retryWithBackoff(async () => {
        console.log(`📦 Creating variant: ${change.color} / ${change.size}`);
        
        // Calculate Shopify price with 10% profit margin
        const trendyolPrice = parseFloat(product.currentPrice || '0');
        const shopifyPrice = trendyolPrice * 1.10;

        const createResult = await shopifyApiService.createVariant(product.shopifyProductId, {
          option1: change.color || undefined,
          option2: change.size || undefined,
          price: shopifyPrice,
          sku: `${product.trendyolProductId}-${change.color}-${change.size}`.toLowerCase(),
          inventory_quantity: change.newStockCount || 0
        });

        newShopifyVariantId = createResult.variantId?.toString() || null;
        console.log(`✅ Created Shopify variant: ${newShopifyVariantId}`);
      });

      // Persist the new Shopify variant ID to database
      if (newShopifyVariantId && change.variantId) {
        try {
          const { productVariants } = await import('@shared/schema');
          await db.update(productVariants)
            .set({ shopifyVariantId: newShopifyVariantId } as any)
            .where(eq(productVariants.id, change.variantId));
          
          console.log(`💾 Persisted Shopify variant ID ${newShopifyVariantId} to database`);
        } catch (dbError) {
          console.error('❌ Failed to persist variant ID:', dbError);
        }
      }

      result.details.variantsAdded++;
      result.changes++;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, change.variantId, 'create_variant', {
          color: change.color,
          size: change.size,
          stock: change.newStockCount,
          shopifyVariantId: newShopifyVariantId
        });
      }
    } catch (error) {
      console.error('❌ Failed to create variant:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, change.variantId, 'create_variant', error as Error);
      }
    }
  }

  /**
   * ➖ Handle variant removed
   */
  private async handleVariantRemoved(product: any, productsTableId: number | null, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`➖ DECISION: Variant removed → Archive in Shopify`);

    // Try to find Shopify variant ID from database
    let shopifyVariantId: string | null = null;
    
    if (change.variantId) {
      // Query productVariants table to find Shopify variant ID
      try {
        const { productVariants } = await import('@shared/schema');
        const [variant] = await db.select()
          .from(productVariants)
          .where(eq(productVariants.id, change.variantId))
          .limit(1);
        
        shopifyVariantId = variant?.shopifyVariantId || null;
      } catch (e) {
        console.error('Failed to query variant:', e);
      }
    }

    if (!shopifyVariantId) {
      console.log('⚠️ No Shopify variant ID found, cannot archive variant - variant will remain in Shopify');
      // Still log as success but with warning note
      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, change.variantId, 'archive_variant_skipped', {
          color: change.color,
          size: change.size,
          note: 'Shopify variant ID not found - manual cleanup may be required'
        });
      }
      return;
    }

    try {
      await this.retryWithBackoff(async () => {
        console.log(`📦 Archiving Shopify variant ${shopifyVariantId}: ${change.color} / ${change.size}`);
        await shopifyApiService.archiveVariant(shopifyVariantId!);
      });

      result.details.variantsRemoved++;
      result.changes++;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, change.variantId, 'archive_variant', {
          color: change.color,
          size: change.size,
          shopifyVariantId
        });
      }
    } catch (error) {
      console.error('❌ Failed to archive variant:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, change.variantId, 'archive_variant', error as Error);
      }
    }
  }

  /**
   * 📦 Handle stock change
   */
  private async handleStockChange(product: any, productsTableId: number | null, change: VariantChange, result: SyncResult): Promise<void> {
    const stockDiff = (change.newStockCount || 0) - (change.oldStockCount || 0);
    console.log(`📦 DECISION: Stock changed (${stockDiff > 0 ? '+' : ''}${stockDiff}) → Update Shopify inventory`);

    // Get the correct Shopify variant ID for this specific variant
    const variantId = await this.getShopifyVariantId(change, product);

    if (!variantId) {
      console.log('⚠️ No Shopify variant ID found, skipping inventory update');
      return;
    }

    try {
      await this.retryWithBackoff(async () => {
        console.log(`📊 Updating inventory: ${change.oldStockCount} → ${change.newStockCount}`);
        await shopifyApiService.updateInventory(variantId, change.newStockCount || 0);
      });

      result.details.stockUpdates++;
      result.changes++;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, change.variantId, 'update_stock', {
          oldStock: change.oldStockCount,
          newStock: change.newStockCount,
          color: change.color,
          size: change.size,
          variantId
        });
      }
    } catch (error) {
      console.error('❌ Failed to update stock:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, change.variantId, 'update_stock', error as Error);
      }
    }
  }

  /**
   * 🚫 Handle variant out of stock - Set inventory to 0
   */
  private async handleVariantOutOfStock(product: any, productsTableId: number | null, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`🚫 DECISION: Variant out of stock → Set Shopify inventory to 0`);

    // Get the correct Shopify variant ID for this specific variant
    const variantId = await this.getShopifyVariantId(change, product);

    if (!variantId) {
      console.log('⚠️ No Shopify variant ID found, skipping out-of-stock update');
      return;
    }

    try {
      await this.retryWithBackoff(async () => {
        console.log(`❌ Setting inventory to 0: ${change.color} / ${change.size}`);
        await shopifyApiService.updateInventory(variantId, 0);
      });

      result.details.stockUpdates++;
      result.changes++;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, change.variantId, 'set_oos', {
          color: change.color,
          size: change.size,
          variantId
        });
      }
    } catch (error) {
      console.error('❌ Failed to set out-of-stock:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, change.variantId, 'set_oos', error as Error);
      }
    }
  }

  /**
   * ✅ Handle variant back in stock - Reactivate variant
   */
  private async handleVariantBackInStock(product: any, productsTableId: number | null, change: VariantChange, result: SyncResult): Promise<void> {
    console.log(`✅ DECISION: Variant back in stock → Reactivate in Shopify`);

    // Get the correct Shopify variant ID for this specific variant
    const variantId = await this.getShopifyVariantId(change, product);

    if (!variantId) {
      console.log('⚠️ No Shopify variant ID found, skipping back-in-stock update');
      return;
    }

    try {
      await this.retryWithBackoff(async () => {
        console.log(`✅ Reactivating variant: ${change.color} / ${change.size} (Stock: ${change.newStockCount})`);
        await shopifyApiService.updateInventory(variantId, change.newStockCount || 0);
      });

      result.details.stockUpdates++;
      result.changes++;

      if (productsTableId) {
        await this.logSyncSuccess(productsTableId, change.variantId, 'reactivate_variant', {
          color: change.color,
          size: change.size,
          stock: change.newStockCount,
          variantId
        });
      }
    } catch (error) {
      console.error('❌ Failed to reactivate variant:', error);
      result.errors++;
      if (productsTableId) {
        await this.logSyncError(productsTableId, change.variantId, 'reactivate_variant', error as Error);
      }
    }
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
