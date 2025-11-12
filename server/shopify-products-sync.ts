import { ShopifyApiService } from './shopify-api-service';
import { db } from './db';
import { products, productVariants, shopifyMemoryProducts, shopifyTransferredProducts, urlTracking } from '@shared/schema';
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
          tags: shopifyMemoryProducts.tags,
          status: shopifyMemoryProducts.status,
          price: shopifyMemoryProducts.price,
          variants: shopifyMemoryProducts.variants,
          images: shopifyMemoryProducts.images,
          createdAt: shopifyMemoryProducts.createdAt,
          updatedAt: shopifyMemoryProducts.updatedAt,
          sourceUrl: sql<string | null>`${shopifyTransferredProducts.sourceUrl}`.as('sourceUrl')
        })
        .from(shopifyMemoryProducts)
        .leftJoin(
          shopifyTransferredProducts,
          eq(shopifyMemoryProducts.shopifyProductId, shopifyTransferredProducts.shopifyProductId)
        );

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

      let totalCountQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(shopifyMemoryProducts);

      if (conditions.length > 0) {
        totalCountQuery = totalCountQuery.where(and(...conditions)) as any;
      }

      const totalCountResult = await totalCountQuery;
      const totalCount = Number(totalCountResult[0]?.count || 0);

      const enrichedProducts = productsData.map(product => {
        const variants = product.variants as any[] || [];
        const prices = variants
          .map(v => parseFloat(v.price || '0'))
          .filter(p => !isNaN(p) && p > 0);
        
        const minPrice = prices.length > 0 
          ? Math.min(...prices).toFixed(2) 
          : parseFloat(product.price || '0').toFixed(2);
        
        const maxPrice = prices.length > 0 
          ? Math.max(...prices).toFixed(2) 
          : parseFloat(product.price || '0').toFixed(2);
        
        const totalVariants = variants.length || 1;
        const totalImages = (product.images as any[] || []).length;
        const category = product.productType || 'Kategorisiz';

        // Extract unique colors and sizes from variants
        const colors = new Set<string>();
        const sizes = new Set<string>();
        
        variants.forEach(v => {
          if (v.option1 && v.option1 !== 'Default') colors.add(v.option1);
          if (v.option2 && v.option2 !== 'Tek Beden') sizes.add(v.option2);
        });

        const variantColors = Array.from(colors);
        const variantSizes = Array.from(sizes);

        return {
          id: product.id,
          shopifyId: product.shopifyId,
          title: product.title,
          handle: product.handle,
          vendor: product.vendor,
          productType: product.productType,
          category,
          tags: product.tags,
          status: product.status,
          minPrice,
          maxPrice,
          totalVariants,
          totalImages,
          colors: variantColors,
          sizes: variantSizes,
          sourceUrl: product.sourceUrl,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt
        };
      });

      console.log(`✅ Retrieved ${productsData.length} products (total: ${totalCount})`);

      return {
        success: true,
        products: enrichedProducts,
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

  async syncSingleProduct(shopifyProductId: string, sourceUrl?: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔄 Syncing single product to memory: ${shopifyProductId}`);
      
      const productResponse = await this.shopifyService.getDirectProductData(shopifyProductId);
      
      if (!productResponse.success || !productResponse.product) {
        console.warn(`⚠️ Product ${shopifyProductId} not found in Shopify - will sync on next bulk sync`);
        return {
          success: false,
          error: 'Product not found in Shopify yet - may still be processing'
        };
      }

      const product = productResponse.product;
      const mainVariant = product.variants[0];
      const price = mainVariant ? parseFloat(mainVariant.price) : 0;
      const compareAtPrice = mainVariant?.compare_at_price ? parseFloat(mainVariant.compare_at_price) : null;

      const [existing] = await db
        .select()
        .from(shopifyMemoryProducts)
        .where(eq(shopifyMemoryProducts.shopifyProductId, shopifyProductId));

      const productData = {
        uniqueTrackingId: existing?.uniqueTrackingId || `shopify_${product.id}_${Date.now()}`,
        shopifyProductId: product.id.toString(),
        shopifyVariantId: mainVariant?.id.toString() || null,
        title: product.title,
        handle: product.handle,
        vendor: product.vendor || null,
        productType: product.product_type || null,
        tags: product.tags ? product.tags.split(',').map(tag => tag.trim()) : [],
        status: product.status,
        price: price,
        compareAtPrice: compareAtPrice,
        inventoryQuantity: mainVariant?.inventory_quantity || 0,
        inventoryPolicy: mainVariant?.inventory_policy || 'deny',
        sku: mainVariant?.sku || null,
        barcode: mainVariant?.barcode || null,
        weight: mainVariant?.weight || null,
        weightUnit: mainVariant?.weight_unit || 'kg',
        images: product.images || [],
        options: product.options || [],
        variants: product.variants || [],
        shopifyCreatedAt: new Date(product.created_at),
        shopifyUpdatedAt: new Date(product.updated_at),
        lastSyncAt: new Date(),
        updatedAt: new Date()
      };

      if (existing) {
        await db
          .update(shopifyMemoryProducts)
          .set(productData)
          .where(eq(shopifyMemoryProducts.shopifyProductId, shopifyProductId));
        console.log(`✅ Product updated in memory: ${product.title}`);
      } else {
        await db
          .insert(shopifyMemoryProducts)
          .values(productData);
        console.log(`✅ Product added to memory: ${product.title}`);
      }

      if (sourceUrl) {
        // ✅ UPSERT: Insert or update based on sourceUrl (UNIQUE constraint)
        const transferData = {
          sourceUrl,
          shopifyProductId,
          title: product.title,
          brand: product.vendor || undefined,
          originalPrice: price ? price.toString() : undefined,
          shopifyPrice: price ? price.toString() : undefined,
          shopifyHandle: product.handle || undefined,
          variantCount: product.variants?.length || 1,
          currentStatus: product.status || 'active',
          lastChecked: new Date(),
          updatedAt: new Date()
        };
        
        await db
          .insert(shopifyTransferredProducts)
          .values(transferData as any) // Type assertion to bypass TypeScript cache issue
          .onConflictDoUpdate({
            target: shopifyTransferredProducts.sourceUrl,
            set: {
              shopifyProductId,
              title: product.title,
              brand: product.vendor || undefined,
              shopifyHandle: product.handle || undefined,
              currentStatus: product.status || 'active',
              lastChecked: new Date(),
              updatedAt: new Date()
            } as any
          });
        console.log(`✅ Source URL upserted to shopifyTransferredProducts: ${sourceUrl}`);
      }

      webSocketService.broadcast('shopify:product-synced', {
        shopifyProductId,
        title: product.title,
        category: product.product_type
      });

      return { success: true };
    } catch (error) {
      console.error(`❌ Single product sync error (${shopifyProductId}):`, error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}

export const shopifyProductsSync = new ShopifyProductsSync();
