// Telegram Notification Gateway - Deduplication & Smart Filtering
import { filteredNotifier } from './filtered-telegram-notifier';

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
    metadata?: any
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

    // 6. Send notification
    try {
      await filteredNotifier.sendNotification(message);
      
      // 7. Cache this notification
      this.cacheNotification(hash, type, productId);
      
      console.log(`✅ Notification sent: ${type} ${productId ? `(Product ${productId})` : ''}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send notification:`, error);
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
   * Send variant change notification
   */
  async sendVariantChange(
    productTitle: string,
    productId: number,
    changeType: 'variant_added' | 'variant_removed' | 'variant_oos' | 'variant_back_in_stock',
    color: string,
    size: string,
    metadata?: any
  ): Promise<boolean> {
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
