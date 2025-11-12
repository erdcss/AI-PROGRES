import { db } from './db';
import { pendingChanges } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { telegramGateway } from './telegram-notification-gateway';
import { shopifySyncManager } from './shopify-sync-manager';

interface ProcessResult {
  success: boolean;
  shopifyUpdated: boolean;
  errors?: string[];
}

export class PendingChangeProcessor {
  /**
   * Process an approved pending change - apply to Shopify and send notifications
   */
  async processPendingChange(changeId: number, approvedBy: string = 'admin'): Promise<ProcessResult> {
    const [change] = await db
      .select()
      .from(pendingChanges)
      .where(eq(pendingChanges.id, changeId));
    
    if (!change) {
      return { success: false, shopifyUpdated: false, errors: ['Change not found'] };
    }
    
    // Accept both 'processing' and 'approved' statuses
    if (change.status !== 'processing' && change.status !== 'approved') {
      return { success: false, shopifyUpdated: false, errors: [`Change status is ${change.status}, expected processing or approved`] };
    }
    
    const result: ProcessResult = {
      success: true,
      shopifyUpdated: false,
      errors: []
    };
    
    try {
      // Apply change to Shopify if needed
      const payload = change.changePayload as any;
      
      if (change.changeType === 'price_increase' || change.changeType === 'price_decrease') {
        // Price change - sync to Shopify
        if (payload?.shopifyProductId) {
          try {
            console.log(`🔄 Syncing price change to Shopify: ${change.productTitle}`);
            
            // Calculate safe price change percentage
            const oldPrice = change.oldPrice || 0;
            const newPrice = change.newPrice || 0;
            const changePercentage = oldPrice > 0 
              ? ((newPrice - oldPrice) / oldPrice) * 100 
              : 0;
            
            // Use productId from change record (FK to products table)
            const syncResult = await shopifySyncManager.processChanges(change.productId, {
              priceChange: {
                oldPrice,
                newPrice,
                changeType: change.changeType === 'price_increase' ? 'increase' : 'decrease',
                changePercentage
              }
            });
            
            if (syncResult.success) {
              result.shopifyUpdated = true;
              console.log(`✅ Shopify price sync completed: ${syncResult.changes} changes applied`);
            } else {
              result.errors?.push(`Shopify sync failed with ${syncResult.errors} errors`);
              result.success = false;
            }
          } catch (shopifyError) {
            console.error('❌ Shopify sync error:', shopifyError);
            result.errors?.push(shopifyError instanceof Error ? shopifyError.message : 'Shopify sync failed');
            result.success = false;
          }
        } else {
          console.log('ℹ️ No Shopify product ID, skipping Shopify sync');
        }
      }
      
      // Additional change types: variant_added, variant_removed, stock_in, stock_out
      if (change.changeType === 'variant_added' || 
          change.changeType === 'variant_removed' || 
          change.changeType === 'stock_in' || 
          change.changeType === 'stock_out') {
        // NOT IMPLEMENTED: Variant and stock changes require Shopify variant management
        result.success = false;
        result.errors = ['Variant and stock change approvals are not yet implemented. Price changes only.'];
        console.error(`⚠️ Attempted to approve unsupported change type: ${change.changeType}`);
      }
      
      // Send Telegram notification and mark as approved only if processing succeeded
      if (result.success) {
        await this.sendApprovalNotification(change);
        
        // Mark as approved, notified, and record approval metadata
        await db
          .update(pendingChanges)
          .set({
            status: 'approved',
            approvedAt: new Date(),
            approvedBy,
            telegramNotified: true,
            telegramNotifiedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(pendingChanges.id, changeId));
      }
      
    } catch (error) {
      console.error(`❌ Failed to process pending change ${changeId}:`, error);
      result.success = false;
      result.errors = [error instanceof Error ? error.message : 'Unknown error'];
    }
    
    return result;
  }

  /**
   * Send approval notification via Telegram
   */
  private async sendApprovalNotification(change: any) {
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
    
    await telegramGateway.sendNotification({
      productTitle: change.productTitle,
      changeType: 'change_approved',
      message,
      color: change.color,
      size: change.size
    });
  }
}

export const pendingChangeProcessor = new PendingChangeProcessor();
