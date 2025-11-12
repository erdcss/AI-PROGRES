import { Router } from 'express';
import { db } from './db';
import { pendingChanges, products, productVariants, priceHistory, stockHistory, variantChanges, shopifySyncLogs } from '../shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { sendTelegramNotification } from './telegram-notification-gateway';

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
    const { id } = req.params;
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
    
    // Update status to processing
    await db
      .update(pendingChanges)
      .set({ status: 'processing' })
      .where(eq(pendingChanges.id, parseInt(id)));
    
    try {
      // Apply change based on type
      await applyChange(change);
      
      // Update status to approved
      await db
        .update(pendingChanges)
        .set({
          status: 'approved',
          approvedAt: new Date(),
          approvedBy,
          updatedAt: new Date()
        })
        .where(eq(pendingChanges.id, parseInt(id)));
      
      // Send Telegram notification
      await sendApprovalNotification(change);
      
      res.json({ success: true, message: 'Change approved and applied successfully' });
    } catch (error) {
      // Rollback to pending if error
      await db
        .update(pendingChanges)
        .set({ status: 'pending' })
        .where(eq(pendingChanges.id, parseInt(id)));
      throw error;
    }
  } catch (error) {
    console.error('❌ Error approving change:', error);
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
        await db
          .update(pendingChanges)
          .set({ status: 'processing' })
          .where(eq(pendingChanges.id, change.id));
        
        await applyChange(change);
        
        await db
          .update(pendingChanges)
          .set({
            status: 'approved',
            approvedAt: new Date(),
            approvedBy,
            updatedAt: new Date()
          })
          .where(eq(pendingChanges.id, change.id));
        
        await sendApprovalNotification(change);
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          id: change.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        await db
          .update(pendingChanges)
          .set({ status: 'pending' })
          .where(eq(pendingChanges.id, change.id));
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

// Apply change to Shopify and database
async function applyChange(change: any) {
  console.log(`📝 Applying change ${change.id}: ${change.changeType}`);
  
  switch (change.changeType) {
    case 'price_increase':
    case 'price_decrease':
    case 'variant_price_change':
      await applyPriceChange(change);
      break;
    case 'stock_out':
    case 'stock_in':
      await applyStockChange(change);
      break;
    case 'variant_added':
      await applyVariantAdded(change);
      break;
    case 'variant_removed':
      await applyVariantRemoved(change);
      break;
    default:
      console.log(`⚠️ Unknown change type: ${change.changeType}`);
  }
}

async function applyPriceChange(change: any) {
  if (!change.variantId) return;
  
  // Update variant price in database
  await db
    .update(productVariants)
    .set({
      trendyolPrice: change.newPrice,
      shopifyPrice: change.newPrice,
      updatedAt: new Date()
    })
    .where(eq(productVariants.id, change.variantId));
  
  // Record price history
  const [historyRecord] = await db
    .insert(priceHistory)
    .values({
      variantId: change.variantId,
      oldPrice: change.oldPrice,
      newPrice: change.newPrice,
      changeType: change.changeType.includes('increase') ? 'increase' : 'decrease',
      changeAmount: change.priceChange,
      changePercentage: change.priceChangePercent
    })
    .returning();
  
  // Link history record to pending change
  await db
    .update(pendingChanges)
    .set({ priceHistoryId: historyRecord.id })
    .where(eq(pendingChanges.id, change.id));
  
  console.log(`✅ Price change applied: ${change.oldPrice} → ${change.newPrice}`);
}

async function applyStockChange(change: any) {
  if (!change.variantId) return;
  
  // Update variant stock in database
  await db
    .update(productVariants)
    .set({
      inStock: change.newStock > 0,
      stockCount: change.newStock,
      updatedAt: new Date()
    })
    .where(eq(productVariants.id, change.variantId));
  
  // Record stock history
  const [historyRecord] = await db
    .insert(stockHistory)
    .values({
      variantId: change.variantId,
      oldStock: change.oldStock,
      newStock: change.newStock,
      changeType: change.changeType,
      changeAmount: change.stockChange
    })
    .returning();
  
  // Link history record to pending change
  await db
    .update(pendingChanges)
    .set({ stockHistoryId: historyRecord.id })
    .where(eq(pendingChanges.id, change.id));
  
  console.log(`✅ Stock change applied: ${change.oldStock} → ${change.newStock}`);
}

async function applyVariantAdded(change: any) {
  if (!change.productId) return;
  
  // Record variant change
  const [variantChangeRecord] = await db
    .insert(variantChanges)
    .values({
      productId: change.productId,
      variantId: change.variantId,
      changeType: 'variant_added',
      color: change.color,
      size: change.size,
      newInStock: true,
      shopifySynced: false
    })
    .returning();
  
  // Link to pending change
  await db
    .update(pendingChanges)
    .set({ variantChangeId: variantChangeRecord.id })
    .where(eq(pendingChanges.id, change.id));
  
  console.log(`✅ Variant added: ${change.color} - ${change.size}`);
}

async function applyVariantRemoved(change: any) {
  if (!change.productId) return;
  
  // Record variant change
  const [variantChangeRecord] = await db
    .insert(variantChanges)
    .values({
      productId: change.productId,
      variantId: change.variantId,
      changeType: 'variant_removed',
      color: change.color,
      size: change.size,
      oldInStock: true,
      newInStock: false,
      shopifySynced: false
    })
    .returning();
  
  // Link to pending change
  await db
    .update(pendingChanges)
    .set({ variantChangeId: variantChangeRecord.id })
    .where(eq(pendingChanges.id, change.id));
  
  console.log(`✅ Variant removed: ${change.color} - ${change.size}`);
}

async function sendApprovalNotification(change: any) {
  try {
    let message = `✅ <b>DEĞİŞİKLİK ONAYLANDI</b>\n\n`;
    message += `📦 Ürün: ${change.productTitle}\n`;
    
    if (change.color || change.size) {
      message += `🎨 Varyant: ${change.color || ''} - ${change.size || ''}\n`;
    }
    
    switch (change.changeType) {
      case 'price_increase':
        message += `💰 Fiyat artışı: ${change.oldPrice} TL → ${change.newPrice} TL (+${change.priceChange} TL)\n`;
        break;
      case 'price_decrease':
        message += `💸 Fiyat düşüşü: ${change.oldPrice} TL → ${change.newPrice} TL (${change.priceChange} TL)\n`;
        break;
      case 'stock_out':
        message += `❌ Stok tükendi\n`;
        break;
      case 'stock_in':
        message += `✅ Stoka girdi (${change.newStock} adet)\n`;
        break;
      case 'variant_added':
        message += `➕ Yeni varyant eklendi\n`;
        break;
      case 'variant_removed':
        message += `➖ Varyant kaldırıldı\n`;
        break;
    }
    
    message += `\n🔗 Değişiklik onaylandı ve uygulandı`;
    
    await sendTelegramNotification({
      productTitle: change.productTitle,
      changeType: 'change_approved',
      message
    });
    
    // Mark as notified
    await db
      .update(pendingChanges)
      .set({
        telegramNotified: true,
        telegramNotifiedAt: new Date()
      })
      .where(eq(pendingChanges.id, change.id));
  } catch (error) {
    console.error('⚠️ Failed to send approval notification:', error);
  }
}

export default router;
