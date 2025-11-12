import { db } from './db';
import { shopifyMemoryProducts, urlTracking } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

interface CachedSnapshot {
  activeShopifyProductIds: Set<string>;
  timestamp: number;
  ttl: number;
}

export class ProductEligibilityService {
  private cache: CachedSnapshot | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    console.log('✅ ProductEligibilityService initialized');
  }

  async isShopifyActive(shopifyProductId: string | null | undefined): Promise<boolean> {
    if (!shopifyProductId) return false;

    const snapshot = await this.getActiveShopifyProductIds();
    return snapshot.has(shopifyProductId);
  }

  async isUrlTrackingEligible(urlTrackingRow: any): Promise<boolean> {
    if (!urlTrackingRow.shopifyProductId) {
      return false;
    }

    return await this.isShopifyActive(urlTrackingRow.shopifyProductId);
  }

  async listEligibleTrackers(): Promise<any[]> {
    const activeShopifyIds = await this.getActiveShopifyProductIds();
    
    if (activeShopifyIds.size === 0) {
      console.log('⚠️ No active Shopify products found - skipping tracking');
      return [];
    }

    const allTrackers = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.isTracking, true));

    const eligible = allTrackers.filter(tracker => 
      tracker.shopifyProductId && activeShopifyIds.has(tracker.shopifyProductId)
    );

    console.log(`🔍 Eligibility check: ${allTrackers.length} total trackers, ${eligible.length} eligible (Shopify-active)`);
    
    return eligible;
  }

  async getActiveShopifyProductIds(): Promise<Set<string>> {
    if (this.cache && (Date.now() - this.cache.timestamp < this.cache.ttl)) {
      return this.cache.activeShopifyProductIds;
    }

    const activeProducts = await db
      .select({ shopifyProductId: shopifyMemoryProducts.shopifyProductId })
      .from(shopifyMemoryProducts);

    const activeIds = new Set(
      activeProducts
        .map(p => p.shopifyProductId)
        .filter((id): id is string => id !== null && id !== undefined)
    );

    this.cache = {
      activeShopifyProductIds: activeIds,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL
    };

    console.log(`📊 Cached ${activeIds.size} active Shopify product IDs`);
    
    return activeIds;
  }

  invalidateCache(): void {
    this.cache = null;
    console.log('🗑️ ProductEligibilityService cache invalidated');
  }

  async disableIneligibleTrackers(): Promise<{ disabled: number; trackerIds: number[] }> {
    const activeShopifyIds = await this.getActiveShopifyProductIds();
    
    // 🛡️ SAFETY: Guard against empty Shopify snapshot
    if (activeShopifyIds.size === 0) {
      console.log('⚠️ Empty Shopify snapshot detected - skipping tracker disable to prevent data loss');
      return { disabled: 0, trackerIds: [] };
    }
    
    const allTrackers = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.isTracking, true));

    const ineligibleTrackers = allTrackers.filter(tracker => 
      !tracker.shopifyProductId || !activeShopifyIds.has(tracker.shopifyProductId)
    );

    if (ineligibleTrackers.length === 0) {
      console.log('✅ All active trackers are Shopify-eligible');
      return { disabled: 0, trackerIds: [] };
    }

    const trackerIds = ineligibleTrackers.map(t => t.id);

    await db
      .update(urlTracking)
      .set({ 
        isTracking: false,
        status: 'paused',
        updatedAt: new Date()
      })
      .where(inArray(urlTracking.id, trackerIds));

    console.log(`⏸️ Disabled ${ineligibleTrackers.length} ineligible trackers (not in Shopify)`);
    
    return { 
      disabled: ineligibleTrackers.length, 
      trackerIds 
    };
  }

  async reconcileTrackers(): Promise<{ reEnabled: number; trackerIds: number[] }> {
    const activeShopifyIds = await this.getActiveShopifyProductIds();
    
    if (activeShopifyIds.size === 0) {
      console.log('⚠️ Empty Shopify snapshot - skipping reconciliation');
      return { reEnabled: 0, trackerIds: [] };
    }
    
    // Find paused trackers that are now back in Shopify
    const pausedTrackers = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.isTracking, false));

    const eligibleForReEnable = pausedTrackers.filter(tracker => 
      tracker.shopifyProductId && activeShopifyIds.has(tracker.shopifyProductId)
    );

    if (eligibleForReEnable.length === 0) {
      console.log('✅ No paused trackers eligible for re-enabling');
      return { reEnabled: 0, trackerIds: [] };
    }

    const trackerIds = eligibleForReEnable.map(t => t.id);

    await db
      .update(urlTracking)
      .set({ 
        isTracking: true,
        status: 'active',
        updatedAt: new Date()
      })
      .where(inArray(urlTracking.id, trackerIds));

    console.log(`▶️ Re-enabled ${eligibleForReEnable.length} trackers (now in Shopify)`);
    
    return { 
      reEnabled: eligibleForReEnable.length, 
      trackerIds 
    };
  }
}

export const productEligibilityService = new ProductEligibilityService();
