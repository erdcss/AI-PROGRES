import { Router } from 'express';
import { db } from './db';
import { pendingChanges, productVariants, priceHistory, stockHistory, variantChanges, products, shopifyMemoryProducts } from '../shared/schema';
import { eq, and, desc, inArray, isNotNull, sql } from 'drizzle-orm';
import { pendingChangeProcessor } from './pending-change-processor';
import { productEligibilityService } from './product-eligibility-service';

const router = Router();

// Get all pending changes - ONLY for products in Shopify memory
router.get('/api/pending-changes', async (req, res) => {
  try {
    const { status = 'pending', productId, limit = '50', offset = '0' } = req.query;
    
    // ⚡ NEW: Join with products and shopifyMemoryProducts to filter Shopify-only changes
    const query = db
      .select({
        id: pendingChanges.id,
        productId: pendingChanges.productId,
        productTitle: pendingChanges.productTitle,
        changeType: pendingChanges.changeType,
        status: pendingChanges.status,
        color: pendingChanges.color,
        size: pendingChanges.size,
        oldPrice: pendingChanges.oldPrice,
        newPrice: pendingChanges.newPrice,
        priceChange: pendingChanges.priceChange,
        priceChangePercent: pendingChanges.priceChangePercent,
        oldStock: pendingChanges.oldStock,
        newStock: pendingChanges.newStock,
        stockChange: pendingChanges.stockChange,
        createdAt: pendingChanges.createdAt,
        url: pendingChanges.url,
        // Enrich with Shopify data
        shopifyProductId: shopifyMemoryProducts.shopifyProductId,
        shopifyVariantId: shopifyMemoryProducts.shopifyVariantId,
        uniqueTrackingId: products.uniqueTrackingId
      })
      .from(pendingChanges)
      .innerJoin(products, eq(pendingChanges.productId, products.id))
      .innerJoin(shopifyMemoryProducts, eq(products.uniqueTrackingId, shopifyMemoryProducts.uniqueTrackingId));
    
    const conditions = [];
    if (status) conditions.push(eq(pendingChanges.status, status as string));
    if (productId) conditions.push(eq(pendingChanges.productId, parseInt(productId as string)));
    
    const changes = await query
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(pendingChanges.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(pendingChanges)
      .innerJoin(products, eq(pendingChanges.productId, products.id))
      .innerJoin(shopifyMemoryProducts, eq(products.uniqueTrackingId, shopifyMemoryProducts.uniqueTrackingId))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    res.json({
      success: true,
      changes,
      pagination: {
        total: totalCount[0]?.count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching pending changes:', error);
    res.status(500).json({ error: 'Failed to fetch pending changes' });
  }
});

// Get pending changes summary - ONLY for Shopify products
router.get('/api/pending-changes/summary', async (req, res) => {
  try {
    // Only count changes for products in Shopify memory
    const shopifyChanges = await db
      .select({
        id: pendingChanges.id,
        status: pendingChanges.status,
        changeType: pendingChanges.changeType
      })
      .from(pendingChanges)
      .innerJoin(products, eq(pendingChanges.productId, products.id))
      .innerJoin(shopifyMemoryProducts, eq(products.uniqueTrackingId, shopifyMemoryProducts.uniqueTrackingId));
    
    const summary = {
      total: shopifyChanges.length,
      pending: shopifyChanges.filter(c => c.status === 'pending').length,
      approved: shopifyChanges.filter(c => c.status === 'approved').length,
      rejected: shopifyChanges.filter(c => c.status === 'rejected').length,
      byType: {
        price_increase: shopifyChanges.filter(c => c.changeType === 'price_increase').length,
        price_decrease: shopifyChanges.filter(c => c.changeType === 'price_decrease').length,
        stock_out: shopifyChanges.filter(c => c.changeType === 'stock_out').length,
        stock_in: shopifyChanges.filter(c => c.changeType === 'stock_in').length,
        variant_added: shopifyChanges.filter(c => c.changeType === 'variant_added').length,
        variant_removed: shopifyChanges.filter(c => c.changeType === 'variant_removed').length
      }
    };
    
    res.json({ success: true, summary });
  } catch (error) {
    console.error('❌ Error fetching pending changes summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Clean up old pending changes not in Shopify memory (ADMIN ONLY)
router.post('/api/pending-changes/cleanup', async (req, res) => {
  try {
    // ⚠️ ADMIN AUTHENTICATION REQUIRED
    const { adminSecret, dryRun = true } = req.body;
    
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }
    
    console.log(`🧹 Starting cleanup of old pending changes (dryRun: ${dryRun})...`);
    
    // SAFE: Only delete PENDING status changes with no Shopify product
    const orphanedChanges = await db
      .select({ 
        id: pendingChanges.id,
        productTitle: pendingChanges.productTitle,
        changeType: pendingChanges.changeType,
        status: pendingChanges.status,
        createdAt: pendingChanges.createdAt
      })
      .from(pendingChanges)
      .leftJoin(products, eq(pendingChanges.productId, products.id))
      .leftJoin(shopifyMemoryProducts, eq(products.uniqueTrackingId, shopifyMemoryProducts.uniqueTrackingId))
      .where(and(
        eq(pendingChanges.status, 'pending'), // ONLY pending status
        sql`${shopifyMemoryProducts.shopifyProductId} IS NULL` // No Shopify product
      ));
    
    console.log(`Found ${orphanedChanges.length} orphaned PENDING changes`);
    
    if (!dryRun && orphanedChanges.length > 0) {
      const orphanedIds = orphanedChanges.map(c => c.id);
      
      // ✅ SAFE DELETE: Only pending status, no Shopify product
      await db.delete(pendingChanges).where(inArray(pendingChanges.id, orphanedIds));
      
      console.log(`✅ Deleted ${orphanedChanges.length} orphaned pending changes`);
    }
    
    res.json({
      success: true,
      dryRun,
      found: orphanedChanges.length,
      deleted: dryRun ? 0 : orphanedChanges.length,
      sample: orphanedChanges.slice(0, 10), // Show first 10 for verification
      message: dryRun 
        ? `DRY RUN: Would delete ${orphanedChanges.length} orphaned pending changes`
        : `Deleted ${orphanedChanges.length} orphaned pending changes`
    });
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed' });
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

// ⚠️ REMOVED UNSAFE ENDPOINTS: cleanup-orphaned and comprehensive-cleanup
// Use the secure /api/pending-changes/cleanup endpoint with admin authentication instead


export default router;
