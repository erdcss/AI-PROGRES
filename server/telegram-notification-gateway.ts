// Telegram Notification Gateway - Deduplication & Smart Filtering
import { filteredNotifier } from './filtered-telegram-notifier';
import { db } from './db';
import { telegramNotificationHistory } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface NotificationCache {
  hash: string;
  timestamp: number;
  productId?: number;
  type: string;
}

export class TelegramNotificationGateway {
  private notificationCache: Map<string, NotificationCache> = new Map();
  private readonly DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly PRODUCT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes per product
  
  // 🚨 TELEGRAM API RATE LIMITING
  private messageTimestamps: number[] = [];
  private readonly TELEGRAM_RATE_LIMIT = 20; // Max 20 messages per minute (safe limit)
  private readonly TELEGRAM_WINDOW_MS = 60 * 1000; // 1 minute window
  
  // ✅ BLOCKED NOTIFICATION TYPES - Ne notification göndermeyeceğiz
  private readonly BLOCKED_TYPES = [
    'tracking_started',
    'product_added',
    'url_added',
    'extraction_success',
    'cache_clear',
    'system_init',
    'monitoring_started',
    'test_notification'
  ];

  // ✅ ALLOWED NOTIFICATION TYPES - Sadece bunlar için bildirim
  private readonly ALLOWED_TYPES = [
    'price_change',
    'price_increase',
    'price_decrease',
    'stock_change',
    'variant_added',
    'variant_removed',
    'variant_oos',
    'variant_back_in_stock',
    'product_deleted',
    'shopify_sync_error',
    'system_error',
    'daily_report'
  ];

  /**
   * Send notification with deduplication and filtering
   */
  async sendNotification(
    message: string, 
    type: string,
    productId?: number,
    metadata?: any,
    variantId?: number,
    productTitle?: string
  ): Promise<boolean> {
    // 1. Check if notification type is blocked
    if (this.BLOCKED_TYPES.includes(type)) {
      console.log(`🚫 Blocked notification type: ${type}`);
      return false;
    }

    // 2. Check if notification type is allowed
    if (!this.ALLOWED_TYPES.includes(type)) {
      console.log(`⚠️ Unknown notification type: ${type} - blocking for safety`);
      return false;
    }

    // 3. Create unique hash for this notification
    const hash = this.createNotificationHash(message, type, productId);

    // 4. Check deduplication cache
    if (this.isDuplicate(hash)) {
      console.log(`🚫 Duplicate notification blocked: ${type} (within 5 min window)`);
      return false;
    }

    // 5. Check product-specific throttling
    if (productId && this.isProductThrottled(productId, type)) {
      console.log(`⏱️ Product throttled: ${productId} for ${type}`);
      return false;
    }

    // 6. Check Telegram API rate limit
    if (!await this.checkTelegramRateLimit()) {
      console.log(`🚨 Telegram API rate limit reached - message queued or dropped`);
      return false;
    }

    // 🔥 NEW: INTERCEPTION SYSTEM - Save to database before sending
    let notificationId: number | null = null;
    
    try {
      // Save notification to database with 'pending' status
      const result = await db.insert(telegramNotificationHistory).values({
        userId: 'default',
        notificationType: type,
        message,
        productId: productId || null,
        variantId: variantId || null,
        productTitle: productTitle || null,
        status: 'pending',
        metadata: metadata || {},
      }).returning({ id: telegramNotificationHistory.id });
      
      notificationId = result[0]?.id || null;
      console.log(`💾 Notification saved to database (ID: ${notificationId}) with status: pending`);
    } catch (dbError) {
      console.error(`❌ Failed to save notification to database:`, dbError);
      // Continue anyway - don't block telegram sending if database fails
    }

    // 7. Send notification to Telegram
    try {
      await filteredNotifier.sendNotification(message);
      
      // Record message timestamp for rate limiting
      this.recordMessageSent();
      
      // Cache this notification
      this.cacheNotification(hash, type, productId);
      
      // Update database status to 'sent'
      if (notificationId) {
        try {
          await db.update(telegramNotificationHistory)
            .set({ 
              status: 'sent',
              sentAt: new Date()
            } as any)
            .where(eq(telegramNotificationHistory.id, notificationId));
          
          console.log(`✅ Notification sent & database updated (ID: ${notificationId}): ${type} ${productId ? `(Product ${productId})` : ''}`);
        } catch (updateError) {
          console.error(`⚠️ Failed to update notification status in database:`, updateError);
        }
      } else {
        console.log(`✅ Notification sent: ${type} ${productId ? `(Product ${productId})` : ''}`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to send notification to Telegram:`, error);
      
      // Update database status to 'failed'
      if (notificationId) {
        try {
          await db.update(telegramNotificationHistory)
            .set({ 
              status: 'failed',
              failedAt: new Date(),
              errorMessage: error instanceof Error ? error.message : String(error),
              retryCount: 0
            } as any)
            .where(eq(telegramNotificationHistory.id, notificationId));
          
          console.log(`❌ Notification failed & database updated (ID: ${notificationId})`);
        } catch (updateError) {
          console.error(`⚠️ Failed to update notification failure in database:`, updateError);
        }
      }
      
      return false;
    }
  }

  /**
   * Send price change notification (auto-formatted)
   */
  async sendPriceChange(
    productTitle: string,
    productId: number,
    oldPrice: number,
    newPrice: number,
    shopifyUpdated: boolean = false
  ): Promise<boolean> {
    const priceChange = ((newPrice - oldPrice) / oldPrice * 100).toFixed(2);
    const changeType = newPrice > oldPrice ? 'price_increase' : 'price_decrease';
    const emoji = newPrice > oldPrice ? '📈' : '📉';

    const message = 
      `${emoji} <b>FİYAT DEĞİŞİKLİĞİ</b>\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n` +
      `💰 <b>Eski Fiyat:</b> ${oldPrice.toFixed(2)} TL\n` +
      `💵 <b>Yeni Fiyat:</b> ${newPrice.toFixed(2)} TL\n` +
      `📊 <b>Değişim:</b> ${priceChange}%\n` +
      (shopifyUpdated ? `\n✅ Shopify otomatik güncellendi (10% kar marjı)` : '');

    return await this.sendNotification(message, changeType, productId);
  }

  /**
   * Sahte varyant kontrolü - Telegram gateway seviyesinde de kontrol et
   */
  private isFakeVariant(color: string, size: string): boolean {
    const FAKE_SIZES = ['Tek Beden', 'One Size', 'Standart', 'Standard', 'Tek', 'Universal', 'Boyutsuz', 'Genel'];
    const FAKE_COLORS = ['Standart', 'Standard', 'Renksiz', 'Default'];
    
    const normalizedSize = size?.trim() || '';
    const normalizedColor = color?.trim() || '';
    
    const isFakeSize = FAKE_SIZES.some(fake => normalizedSize.toLowerCase() === fake.toLowerCase());
    const isFakeColor = FAKE_COLORS.some(fake => normalizedColor.toLowerCase() === fake.toLowerCase());
    
    // Beden VEYA renk sahte ise -> bildirim gönderme
    return isFakeSize || isFakeColor;
  }

  /**
   * Send variant change notification
   * ÇİFT GÜVENLİK: Hem servis hem gateway seviyesinde sahte varyant kontrolü
   */
  async sendVariantChange(
    productTitle: string,
    productId: number,
    changeType: 'variant_added' | 'variant_removed' | 'variant_oos' | 'variant_back_in_stock',
    color: string,
    size: string,
    metadata?: any
  ): Promise<boolean> {
    // 🚫 ÇİFT GÜVENLİK: Gateway seviyesinde sahte varyant kontrolü
    if (this.isFakeVariant(color, size)) {
      console.log(`🚫 GATEWAY BLOCK: Fake variant notification blocked - ${color} / ${size} (${changeType})`);
      return false;
    }
    
    let emoji = '';
    let title = '';

    switch (changeType) {
      case 'variant_added':
        emoji = '➕';
        title = 'YENİ VARYANT';
        break;
      case 'variant_removed':
        emoji = '➖';
        title = 'VARYANT KALDIRILDI';
        break;
      case 'variant_oos':
        emoji = '🚫';
        title = 'STOK TÜKENDİ';
        break;
      case 'variant_back_in_stock':
        emoji = '✅';
        title = 'STOK GELDİ';
        break;
    }

    const message = 
      `${emoji} <b>${title}</b>\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n` +
      `🎨 <b>Renk:</b> ${color}\n` +
      `📏 <b>Beden:</b> ${size}\n` +
      (metadata?.shopifyUpdated ? `\n✅ Shopify otomatik güncellendi` : '');

    return await this.sendNotification(message, changeType, productId, metadata);
  }

  /**
   * Send stock change notification
   */
  async sendStockChange(
    productTitle: string,
    productId: number,
    oldStock: number,
    newStock: number,
    color?: string,
    size?: string
  ): Promise<boolean> {
    const emoji = newStock > oldStock ? '📈' : '📉';
    
    const message = 
      `${emoji} <b>STOK DEĞİŞİKLİĞİ</b>\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n` +
      (color ? `🎨 <b>Renk:</b> ${color}\n` : '') +
      (size ? `📏 <b>Beden:</b> ${size}\n` : '') +
      `📊 <b>Eski Stok:</b> ${oldStock}\n` +
      `📊 <b>Yeni Stok:</b> ${newStock}\n` +
      `\n✅ Shopify otomatik güncellendi`;

    return await this.sendNotification(message, 'stock_change', productId);
  }

  /**
   * Send Shopify sync error notification
   */
  async sendShopifySyncError(
    productTitle: string,
    productId: number,
    operation: string,
    error: string
  ): Promise<boolean> {
    const message = 
      `❌ <b>SHOPIFY SYNC HATASI</b>\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n` +
      `⚙️ <b>İşlem:</b> ${operation}\n` +
      `❌ <b>Hata:</b> ${error}\n` +
      `\n🔄 Retry mekanizması devreye girdi`;

    return await this.sendNotification(message, 'shopify_sync_error', productId);
  }

  /**
   * Create unique hash for notification
   */
  private createNotificationHash(message: string, type: string, productId?: number): string {
    const key = `${type}:${productId || 'global'}:${message.substring(0, 100)}`;
    return Buffer.from(key).toString('base64');
  }

  /**
   * Check if notification is duplicate (within dedup window)
   */
  private isDuplicate(hash: string): boolean {
    const cached = this.notificationCache.get(hash);
    
    if (!cached) return false;

    const now = Date.now();
    const age = now - cached.timestamp;

    // Clean up old cache entries
    if (age > this.DEDUP_WINDOW_MS) {
      this.notificationCache.delete(hash);
      return false;
    }

    return true;
  }

  /**
   * Check if product is throttled
   */
  private isProductThrottled(productId: number, type: string): boolean {
    const now = Date.now();

    // Check if this product has any recent notifications
    for (const [hash, cached] of this.notificationCache.entries()) {
      if (cached.productId === productId) {
        const age = now - cached.timestamp;
        
        if (age < this.PRODUCT_THROTTLE_MS) {
          return true; // Product throttled
        }
      }
    }

    return false;
  }

  /**
   * Check Telegram API rate limit (20 messages per minute)
   */
  private async checkTelegramRateLimit(): Promise<boolean> {
    const now = Date.now();
    
    // Clean old timestamps (older than 1 minute)
    this.messageTimestamps = this.messageTimestamps.filter(
      ts => now - ts < this.TELEGRAM_WINDOW_MS
    );
    
    // Check if we're at the limit
    if (this.messageTimestamps.length >= this.TELEGRAM_RATE_LIMIT) {
      const oldestMessage = this.messageTimestamps[0];
      const waitTime = this.TELEGRAM_WINDOW_MS - (now - oldestMessage);
      
      console.log(`⏰ Telegram rate limit: ${this.messageTimestamps.length}/${this.TELEGRAM_RATE_LIMIT} messages sent`);
      console.log(`⏰ Need to wait ${Math.ceil(waitTime / 1000)}s before sending next message`);
      
      // Optional: Wait for the window to reset (uncomment to enable auto-wait)
      // await new Promise(resolve => setTimeout(resolve, waitTime));
      // this.messageTimestamps.shift(); // Remove oldest
      // return true;
      
      return false; // Drop message to prevent rate limit
    }
    
    return true;
  }

  /**
   * Record message sent timestamp
   */
  private recordMessageSent(): void {
    this.messageTimestamps.push(Date.now());
    
    // Keep max 100 timestamps in memory
    if (this.messageTimestamps.length > 100) {
      this.messageTimestamps = this.messageTimestamps.slice(-50);
    }
  }

  /**
   * Cache notification
   */
  private cacheNotification(hash: string, type: string, productId?: number): void {
    this.notificationCache.set(hash, {
      hash,
      timestamp: Date.now(),
      productId,
      type
    });

    // Clean up old entries (older than 10 minutes)
    const cutoff = Date.now() - (10 * 60 * 1000);
    for (const [key, value] of this.notificationCache.entries()) {
      if (value.timestamp < cutoff) {
        this.notificationCache.delete(key);
      }
    }
  }

  /**
   * Clear cache (for testing/debugging)
   */
  clearCache(): void {
    this.notificationCache.clear();
    console.log('🗑️ Notification cache cleared');
  }
}

// Singleton instance
export const telegramGateway = new TelegramNotificationGateway();
