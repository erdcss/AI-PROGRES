import { ShopifyApiService } from './shopify-api-service';
import { db } from './db';
import { products, productVariants, shopifyMemoryProducts } from '@shared/schema';
import { eq, sql, and, isNotNull, desc } from 'drizzle-orm';
import { webSocketService } from './websocket-service';
import { shopifyChangeTracker } from './shopify-change-tracker';

export interface ShopifyProductSyncResult {
  success: boolean;
  totalProducts: number;
  syncedProducts: number;
  categories: string[];
  error?: string;
}

export class ShopifyProductsSync {
  private shopifyService: ShopifyApiService;

  constructor() {
    this.shopifyService = new ShopifyApiService();
  }

  async syncAllShopifyProducts(): Promise<ShopifyProductSyncResult> {
    try {
      console.log('🔄 Starting comprehensive Shopify products sync...');

      const syncResult = await this.shopifyService.syncAllProducts();
      
      if (!syncResult.success) {
        throw new Error('Shopify sync failed');
      }

      const allMemoryProducts = await db
        .select()
        .from(shopifyMemoryProducts)
        .orderBy(desc(shopifyMemoryProducts.createdAt));

      const categories = new Set<string>();
      let newProductsCount = 0;
      let totalChanges = 0;
      
      for (const memProduct of allMemoryProducts) {
        const category = memProduct.productType || 'Kategorisiz';
        categories.add(category);

        // Track changes for this product
        try {
          // Check if this is a new product BEFORE tracking
          const cached = shopifyChangeTracker.getCachedProduct(memProduct.shopifyProductId);
          const isNewProduct = !cached;
          
          if (isNewProduct) {
            newProductsCount++;
          }

          // Track changes (this will add to cache if new)
          const changes = await shopifyChangeTracker.trackProduct(memProduct.shopifyProductId, {
            price: memProduct.price,
            inventoryQuantity: memProduct.inventoryQuantity,
            status: memProduct.status,
            title: memProduct.title
          });

          if (changes.length > 0) {
            totalChanges += changes.length;
          }
        } catch (err) {
          console.error(`❌ Change tracking error for ${memProduct.title}:`, err);
        }
      }

      console.log(`✅ Shopify sync completed: ${syncResult.totalProducts} total, ${allMemoryProducts.length} in memory`);
      console.log(`📁 Categories found: ${Array.from(categories).join(', ')}`);
      console.log(`🆕 New products: ${newProductsCount}, 📊 Total changes detected: ${totalChanges}`);

      // Broadcast sync completion
      webSocketService.broadcast('shopify:sync-complete', {
        totalProducts: syncResult.totalProducts,
        syncedProducts: allMemoryProducts.length,
        newProducts: newProductsCount,
        changes: totalChanges,
        categories: Array.from(categories).sort()
      });

      return {
        success: true,
        totalProducts: syncResult.totalProducts,
        syncedProducts: allMemoryProducts.length,
        categories: Array.from(categories).sort()
      };
    } catch (error) {
      console.error('❌ Shopify products sync error:', error);
      return {
        success: false,
        totalProducts: 0,
        syncedProducts: 0,
        categories: [],
        error: (error as Error).message
      };
    }
  }

  async getAllShopifyProducts(params?: {
    limit?: number;
    offset?: number;
    category?: string;
    searchQuery?: string;
  }) {
    try {
      const { limit = 50, offset = 0, category, searchQuery } = params || {};

      console.log('📊 Fetching Shopify products from memory...', { limit, offset, category, searchQuery });

      let query = db
        .select({
          id: shopifyMemoryProducts.id,
          shopifyId: shopifyMemoryProducts.shopifyProductId,
          title: shopifyMemoryProducts.title,
          handle: shopifyMemoryProducts.handle,
          vendor: shopifyMemoryProducts.vendor,
          productType: shopifyMemoryProducts.productType,
          category: shopifyMemoryProducts.productType,
          tags: shopifyMemoryProducts.tags,
          status: shopifyMemoryProducts.status,
          totalVariants: sql<number>`COALESCE(jsonb_array_length(${shopifyMemoryProducts.variants}), 1)`,
          totalImages: sql<number>`COALESCE(jsonb_array_length(${shopifyMemoryProducts.images}), 0)`,
          minPrice: shopifyMemoryProducts.price,
          maxPrice: shopifyMemoryProducts.price,
          createdAt: shopifyMemoryProducts.createdAt,
          updatedAt: shopifyMemoryProducts.updatedAt
        })
        .from(shopifyMemoryProducts);

      const conditions = [];

      if (category && category !== 'all') {
        conditions.push(
          sql`${shopifyMemoryProducts.productType} = ${category}`
        );
      }

      if (searchQuery && searchQuery.trim()) {
        const searchTerm = `%${searchQuery.trim().toLowerCase()}%`;
        conditions.push(
          sql`(LOWER(${shopifyMemoryProducts.title}) LIKE ${searchTerm} OR LOWER(${shopifyMemoryProducts.vendor}) LIKE ${searchTerm} OR LOWER(${shopifyMemoryProducts.tags}) LIKE ${searchTerm})`
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const productsData = await query
        .orderBy(desc(shopifyMemoryProducts.createdAt))
        .limit(limit)
        .offset(offset);

      const totalCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(shopifyMemoryProducts)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const totalCount = Number(totalCountResult[0]?.count || 0);

      console.log(`✅ Retrieved ${productsData.length} products (total: ${totalCount})`);

      return {
        success: true,
        products: productsData,
        pagination: {
          total: totalCount,
          limit,
          offset,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: Math.floor(offset / limit) + 1
        }
      };
    } catch (error) {
      console.error('❌ Get Shopify products error:', error);
      return {
        success: false,
        products: [],
        pagination: { total: 0, limit: 50, offset: 0, totalPages: 0, currentPage: 1 },
        error: (error as Error).message
      };
    }
  }

  async getCategories() {
    try {
      const categoriesFromType = await db
        .selectDistinct({ category: shopifyMemoryProducts.productType })
        .from(shopifyMemoryProducts)
        .where(isNotNull(shopifyMemoryProducts.productType));

      const allCategories = new Set<string>();
      
      categoriesFromType.forEach(item => {
        if (item.category) allCategories.add(item.category);
      });

      const sortedCategories = Array.from(allCategories)
        .filter(cat => cat && cat.trim() !== '')
        .sort();

      console.log(`📁 Found ${sortedCategories.length} unique categories`);

      return {
        success: true,
        categories: sortedCategories
      };
    } catch (error) {
      console.error('❌ Get categories error:', error);
      return {
        success: false,
        categories: [],
        error: (error as Error).message
      };
    }
  }

  async getStatistics() {
    try {
      const totalProductsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(shopifyMemoryProducts);

      const totalProducts = Number(totalProductsResult[0]?.count || 0);

      const priceStats = await db
        .select({
          avgPrice: sql<number>`AVG(CAST(${shopifyMemoryProducts.price} AS DECIMAL))`,
          minPrice: sql<number>`MIN(CAST(${shopifyMemoryProducts.price} AS DECIMAL))`,
          maxPrice: sql<number>`MAX(CAST(${shopifyMemoryProducts.price} AS DECIMAL))`
        })
        .from(shopifyMemoryProducts);

      const categoryCounts = await db
        .select({
          category: shopifyMemoryProducts.productType,
          count: sql<number>`count(*)`
        })
        .from(shopifyMemoryProducts)
        .where(isNotNull(shopifyMemoryProducts.productType))
        .groupBy(shopifyMemoryProducts.productType)
        .orderBy(desc(sql<number>`count(*)`))
        .limit(10);

      const vendorCounts = await db
        .select({
          vendor: shopifyMemoryProducts.vendor,
          count: sql<number>`count(*)`
        })
        .from(shopifyMemoryProducts)
        .where(isNotNull(shopifyMemoryProducts.vendor))
        .groupBy(shopifyMemoryProducts.vendor)
        .orderBy(desc(sql<number>`count(*)`))
        .limit(5);

      console.log(`📊 Statistics generated: ${totalProducts} total products`);

      return {
        success: true,
        statistics: {
          totalProducts,
          averagePrice: Number(priceStats[0]?.avgPrice || 0).toFixed(2),
          minPrice: Number(priceStats[0]?.minPrice || 0).toFixed(2),
          maxPrice: Number(priceStats[0]?.maxPrice || 0).toFixed(2),
          topCategories: categoryCounts.map(c => ({
            category: c.category || 'Kategorisiz',
            count: Number(c.count)
          })),
          topVendors: vendorCounts.map(v => ({
            vendor: v.vendor || 'Bilinmeyen',
            count: Number(v.count)
          }))
        }
      };
    } catch (error) {
      console.error('❌ Get statistics error:', error);
      return {
        success: false,
        statistics: null,
        error: (error as Error).message
      };
    }
  }
}

export const shopifyProductsSync = new ShopifyProductsSync();
