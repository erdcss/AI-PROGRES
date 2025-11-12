import { Router } from 'express';
import { db } from './db';
import { pendingChanges, productVariants, priceHistory, stockHistory, variantChanges, products, shopifyMemoryProducts } from '../shared/schema';
import { eq, and, desc, inArray, isNotNull, sql } from 'drizzle-orm';
import { pendingChangeProcessor } from './pending-change-processor';

const router = Router();

// Get all pending changes
router.get('/api/pending-changes', async (req, res) => {
  try {
    const { status = 'pending', productId, limit = '50', offset = '0' } = req.query;
    
    const conditions = [];
    if (status) conditions.push(eq(pendingChanges.status, status as string));
    if (productId) conditions.push(eq(pendingChanges.productId, parseInt(productId as string)));
    
    const changes = await db
      .select()
      .from(pendingChanges)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(pendingChanges.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    const total = await db
      .select()
      .from(pendingChanges)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    res.json({
      success: true,
      changes,
      pagination: {
        total: total.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching pending changes:', error);
    res.status(500).json({ error: 'Failed to fetch pending changes' });
  }
});

// Get pending changes summary
router.get('/api/pending-changes/summary', async (req, res) => {
  try {
    const allChanges = await db.select().from(pendingChanges);
    
    const summary = {
      total: allChanges.length,
      pending: allChanges.filter(c => c.status === 'pending').length,
      approved: allChanges.filter(c => c.status === 'approved').length,
      rejected: allChanges.filter(c => c.status === 'rejected').length,
      byType: {
        price_increase: allChanges.filter(c => c.changeType === 'price_increase').length,
        price_decrease: allChanges.filter(c => c.changeType === 'price_decrease').length,
        stock_out: allChanges.filter(c => c.changeType === 'stock_out').length,
        stock_in: allChanges.filter(c => c.changeType === 'stock_in').length,
        variant_added: allChanges.filter(c => c.changeType === 'variant_added').length,
        variant_removed: allChanges.filter(c => c.changeType === 'variant_removed').length
      }
    };
    
    res.json({ success: true, summary });
  } catch (error) {
    console.error('❌ Error fetching pending changes summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Approve a single change
router.post('/api/pending-changes/:id/approve', async (req, res) => {
  try {
    const { id} = req.params;
    const { approvedBy = 'admin' } = req.body;
    
    const [change] = await db
      .select()
      .from(pendingChanges)
      .where(eq(pendingChanges.id, parseInt(id)));
    
    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }
    
    if (change.status !== 'pending') {
      return res.status(400).json({ error: 'Change is not pending' });
    }
    
    // First, mark as processing to prevent double approval
    await db
      .update(pendingChanges)
      .set({
        status: 'processing',
        updatedAt: new Date()
      })
      .where(eq(pendingChanges.id, parseInt(id)));
    
    // Process the change (Shopify sync + Telegram notification)
    const processResult = await pendingChangeProcessor.processPendingChange(parseInt(id), approvedBy);
    
    if (!processResult.success) {
      // Rollback to pending on failure
      await db
        .update(pendingChanges)
        .set({
          status: 'pending',
          updatedAt: new Date()
        })
        .where(eq(pendingChanges.id, parseInt(id)));
      
      console.error('⚠️ Failed to process change:', processResult.errors);
      return res.status(500).json({ 
        error: 'Processing failed, change reverted to pending', 
        details: processResult.errors 
      });
    }
    
    // Success - mark as approved (processor already did this)
    res.json({ 
      success: true, 
      message: 'Change approved and processed successfully',
      shopifyUpdated: processResult.shopifyUpdated
    });
  } catch (error) {
    console.error('❌ Error approving change:', error);
    
    // Rollback to pending on error
    try {
      await db
        .update(pendingChanges)
        .set({
          status: 'pending',
          updatedAt: new Date()
        })
        .where(eq(pendingChanges.id, parseInt(req.params.id)));
    } catch (rollbackError) {
      console.error('❌ Rollback failed:', rollbackError);
    }
    
    res.status(500).json({ error: 'Failed to approve change' });
  }
});

// Approve multiple changes
router.post('/api/pending-changes/bulk-approve', async (req, res) => {
  try {
    const { ids, approvedBy = 'admin' } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }
    
    const changes = await db
      .select()
      .from(pendingChanges)
      .where(and(
        inArray(pendingChanges.id, ids),
        eq(pendingChanges.status, 'pending')
      ));
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ id: number; error: string }>
    };
    
    for (const change of changes) {
      try {
        // Mark as processing
        await db
          .update(pendingChanges)
          .set({
            status: 'processing',
            updatedAt: new Date()
          })
          .where(eq(pendingChanges.id, change.id));
        
        // Process the change (Shopify sync + Telegram notification)
        const processResult = await pendingChangeProcessor.processPendingChange(change.id, approvedBy);
        
        if (!processResult.success) {
          // Rollback to pending on failure
          await db
            .update(pendingChanges)
            .set({
              status: 'pending',
              updatedAt: new Date()
            })
            .where(eq(pendingChanges.id, change.id));
          
          results.failed++;
          results.errors.push({
            id: change.id,
            error: processResult.errors?.join(', ') || 'Processing failed'
          });
        } else {
          results.success++;
        }
      } catch (error) {
        // Rollback to pending on error
        try {
          await db
            .update(pendingChanges)
            .set({
              status: 'pending',
              updatedAt: new Date()
            })
            .where(eq(pendingChanges.id, change.id));
        } catch (rollbackError) {
          console.error('❌ Rollback failed:', rollbackError);
        }
        
        results.failed++;
        results.errors.push({
          id: change.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('❌ Error in bulk approve:', error);
    res.status(500).json({ error: 'Failed to bulk approve changes' });
  }
});

// Reject a change
router.post('/api/pending-changes/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectedBy = 'admin', rejectionReason } = req.body;
    
    await db
      .update(pendingChanges)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy,
        rejectionReason,
        updatedAt: new Date()
      })
      .where(eq(pendingChanges.id, parseInt(id)));
    
    res.json({ success: true, message: 'Change rejected' });
  } catch (error) {
    console.error('❌ Error rejecting change:', error);
    res.status(500).json({ error: 'Failed to reject change' });
  }
});

// Removed: sendApprovalNotification - now handled by PendingChangeProcessor

// Clean up orphaned pending changes (not in Shopify)
router.post('/api/pending-changes/cleanup-orphaned', async (req, res) => {
  try {
    console.log('🗑️ Starting orphaned pending changes cleanup...');
    
    // Transaction kullanarak güvenli silme
    const result = await db.transaction(async (tx) => {
      // 1. Önce silinecek kayıtları say
      const orphanedChanges = await tx
        .select({ id: pendingChanges.id })
        .from(pendingChanges)
        .where(
          and(
            eq(pendingChanges.status, 'pending'),
            isNotNull(pendingChanges.productId),
            sql`NOT EXISTS (
              SELECT 1 
              FROM ${products} p
              INNER JOIN ${shopifyMemoryProducts} smp 
                ON p.unique_tracking_id = smp.unique_tracking_id
              WHERE p.id = ${pendingChanges.productId}
                AND p.unique_tracking_id IS NOT NULL
                AND smp.unique_tracking_id IS NOT NULL
            )`
          )
        );
      
      const orphanedCount = orphanedChanges.length;
      console.log(`📊 Found ${orphanedCount} orphaned pending changes`);
      
      if (orphanedCount === 0) {
        return { deletedCount: 0 };
      }
      
      // 2. Şimdi sil (sadece pending olanları)
      await tx
        .delete(pendingChanges)
        .where(
          and(
            eq(pendingChanges.status, 'pending'),
            isNotNull(pendingChanges.productId),
            sql`NOT EXISTS (
              SELECT 1 
              FROM ${products} p
              INNER JOIN ${shopifyMemoryProducts} smp 
                ON p.unique_tracking_id = smp.unique_tracking_id
              WHERE p.id = ${pendingChanges.productId}
                AND p.unique_tracking_id IS NOT NULL
                AND smp.unique_tracking_id IS NOT NULL
            )`
          )
        );
      
      console.log(`✅ Deleted ${orphanedCount} orphaned pending changes`);
      return { deletedCount: orphanedCount };
    });
    
    res.json({
      success: true,
      message: `Successfully cleaned up ${result.deletedCount} orphaned pending changes`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error cleaning up orphaned changes:', error);
    res.status(500).json({ error: 'Failed to cleanup orphaned changes' });
  }
});

// Comprehensive cleanup: Delete all products NOT in Shopify
router.post('/api/pending-changes/comprehensive-cleanup', async (req, res) => {
  try {
    console.log('🗑️ Starting comprehensive cleanup (delete products not in Shopify)...');
    
    const result = await db.transaction(async (tx) => {
      // 1. Get all uniqueTrackingIds from Shopify
      const shopifyTrackingIds = await tx
        .select({ uniqueTrackingId: shopifyMemoryProducts.uniqueTrackingId })
        .from(shopifyMemoryProducts)
        .where(isNotNull(shopifyMemoryProducts.uniqueTrackingId));
      
      console.log(`📊 Found ${shopifyTrackingIds.length} products in Shopify memory`);
      
      if (shopifyTrackingIds.length === 0) {
        console.log('⚠️ No products in Shopify memory, aborting cleanup to prevent data loss');
        return {
          deletedProducts: 0,
          deletedVariants: 0,
          deletedPendingChanges: 0,
          deletedPriceHistory: 0,
          deletedStockHistory: 0,
          error: 'No products found in Shopify memory'
        };
      }
      
      const shopifyTrackingIdSet = new Set(
        shopifyTrackingIds
          .map(row => row.uniqueTrackingId)
          .filter(id => id !== null && id !== undefined)
      );
      
      // 2. Find products NOT in Shopify (orphaned products)
      const orphanedProducts = await tx
        .select({ 
          id: products.id,
          uniqueTrackingId: products.uniqueTrackingId,
          title: products.title
        })
        .from(products)
        .where(
          and(
            isNotNull(products.uniqueTrackingId),
            sql`${products.uniqueTrackingId} NOT IN (
              SELECT unique_tracking_id 
              FROM ${shopifyMemoryProducts} 
              WHERE unique_tracking_id IS NOT NULL
            )`
          )
        );
      
      console.log(`📊 Found ${orphanedProducts.length} orphaned products to delete`);
      
      if (orphanedProducts.length === 0) {
        return {
          deletedProducts: 0,
          deletedVariants: 0,
          deletedPendingChanges: 0,
          deletedPriceHistory: 0,
          deletedStockHistory: 0
        };
      }
      
      // 3. Count related records before deletion (for statistics)
      const orphanedProductIds = orphanedProducts.map(p => p.id);
      
      const variantsCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(productVariants)
        .where(inArray(productVariants.productId, orphanedProductIds));
      
      const pendingChangesCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(pendingChanges)
        .where(
          and(
            inArray(pendingChanges.productId, orphanedProductIds),
            eq(pendingChanges.status, 'pending')
          )
        );
      
      // Get variant IDs for price/stock history count
      const variantIds = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(inArray(productVariants.productId, orphanedProductIds));
      
      const variantIdList = variantIds.map(v => v.id);
      
      let priceHistoryCount = 0;
      let stockHistoryCount = 0;
      
      if (variantIdList.length > 0) {
        const priceHistoryRecords = await tx
          .select({ count: sql<number>`count(*)` })
          .from(priceHistory)
          .where(inArray(priceHistory.variantId, variantIdList));
        
        const stockHistoryRecords = await tx
          .select({ count: sql<number>`count(*)` })
          .from(stockHistory)
          .where(inArray(stockHistory.variantId, variantIdList));
        
        priceHistoryCount = Number(priceHistoryRecords[0]?.count || 0);
        stockHistoryCount = Number(stockHistoryRecords[0]?.count || 0);
      }
      
      // 4. Delete orphaned products (CASCADE will delete all related records)
      await tx
        .delete(products)
        .where(inArray(products.id, orphanedProductIds));
      
      console.log(`✅ Deleted ${orphanedProducts.length} products and all related records`);
      
      return {
        deletedProducts: orphanedProducts.length,
        deletedVariants: Number(variantsCount[0]?.count || 0),
        deletedPendingChanges: Number(pendingChangesCount[0]?.count || 0),
        deletedPriceHistory: priceHistoryCount,
        deletedStockHistory: stockHistoryCount,
        deletedProductTitles: orphanedProducts.slice(0, 10).map(p => p.title) // First 10 for reference
      };
    });
    
    res.json({
      success: true,
      message: `Comprehensive cleanup completed`,
      stats: result
    });
  } catch (error) {
    console.error('❌ Error in comprehensive cleanup:', error);
    res.status(500).json({ 
      error: 'Failed to perform comprehensive cleanup',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
