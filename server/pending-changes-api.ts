import { Router } from 'express';
import { db } from './db';
import { pendingChanges, productVariants, priceHistory, stockHistory, variantChanges } from '../shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
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

export default router;
