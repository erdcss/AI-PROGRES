import crypto from 'crypto';
import { memoryManager } from './memory-manager';
import { productEligibilityService } from './product-eligibility-service';
import { db } from './db';
import { urlTracking } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface NotificationOptions {
  type: 'price_change' | 'product_upload' | 'error' | 'system';
  url?: string;
  payload: any;
  threshold?: number; // Minimum change percentage for price notifications
  priority?: 'low' | 'medium' | 'high';
}

interface NotificationBatch {
  count: number;
  items: NotificationOptions[];
  firstTimestamp: number;
  lastTimestamp: number;
}

class NotificationGateway {
  private readonly mode: 'off' | 'filtered' | 'full';
  private readonly idempotencyTTL = 60 * 60 * 1000; // 1 hour
  private readonly rateLimitTTL = 15 * 60 * 1000; // 15 minutes
  private readonly batchInterval = 10 * 60 * 1000; // 10 minutes
  private readonly maxNotificationsPerHour = 50;
  private readonly defaultPriceThreshold = 5; // 5% minimum change

  constructor() {
    this.mode = (process.env.TELEGRAM_MODE as any) || 'filtered';
    console.log(`📱 NotificationGateway initialized in ${this.mode} mode`);
    
    // Start batch processor
    this.startBatchProcessor();
  }

  async send(options: NotificationOptions): Promise<boolean> {
    if (this.mode === 'off') {
      console.log('📱 Notifications disabled (mode: off)');
      return false;
    }

    // ✅ SHOPIFY ELIGIBILITY CHECK: Block notifications for products not in Shopify
    // Only check for product-related notifications, allow system/error notifications
    if ((options.type === 'price_change' || options.type === 'product_upload') && options.url) {
      const isEligible = await this.isProductShopifyEligible(options.url);
      if (!isEligible) {
        console.log(`📱 Notification blocked: Product not in Shopify - ${options.url}`);
        return false;
      }
    }

    // Generate event key for idempotency
    const eventKey = this.generateEventKey(options);
    
    // Check idempotency
    if (this.isRecentDuplicate(eventKey)) {
      console.log(`📱 Duplicate notification blocked: ${eventKey}`);
      return false;
    }

    // Check rate limits
    if (!this.isWithinRateLimit(options.type, options.url)) {
      console.log(`📱 Rate limit exceeded for ${options.type}:${options.url}`);
      return false;
    }

    // Check thresholds for price changes
    if (options.type === 'price_change' && !this.meetsThreshold(options)) {
      console.log(`📱 Price change below threshold: ${options.threshold || this.defaultPriceThreshold}%`);
      return false;
    }

    // Mark as sent for idempotency
    this.markAsSent(eventKey);
    
    // Update rate limit counter
    this.updateRateLimit(options.type, options.url);

    if (this.mode === 'filtered') {
      // In filtered mode, batch non-urgent notifications
      if (options.priority !== 'high') {
        this.addToBatch(options);
        return true;
      }
    }

    // Send immediately for full mode or high priority
    return await this.sendTelegram(options);
  }

  private async isProductShopifyEligible(url: string): Promise<boolean> {
    try {
      const [tracker] = await db.select().from(urlTracking).where(eq(urlTracking.url, url));
      
      if (!tracker || !tracker.shopifyProductId) {
        console.log(`📱 No tracker or Shopify ID found for URL: ${url}`);
        return false;
      }

      return await productEligibilityService.isShopifyActive(tracker.shopifyProductId);
    } catch (error) {
      console.error('❌ Error checking Shopify eligibility:', error);
      // FAIL-CLOSED: Block notifications on error to prevent ineligible alerts
      return false;
    }
  }

  private generateEventKey(options: NotificationOptions): string {
    const payload = {
      type: options.type,
      url: options.url,
      hash: crypto.createHash('md5').update(JSON.stringify(options.payload)).digest('hex')
    };
    
    return crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex');
  }

  private isRecentDuplicate(eventKey: string): boolean {
    const cacheKey = `notification:sent:${eventKey}`;
    return memoryManager.has(cacheKey);
  }

  private markAsSent(eventKey: string): void {
    const cacheKey = `notification:sent:${eventKey}`;
    memoryManager.set(cacheKey, true, this.idempotencyTTL);
  }

  private isWithinRateLimit(type: string, url?: string): boolean {
    const rateKey = `notification:rate:${type}:${url || 'global'}`;
    const current = memoryManager.get(rateKey) || 0;
    return current < this.maxNotificationsPerHour;
  }

  private updateRateLimit(type: string, url?: string): void {
    const rateKey = `notification:rate:${type}:${url || 'global'}`;
    const current = memoryManager.get(rateKey) || 0;
    memoryManager.set(rateKey, current + 1, this.rateLimitTTL);
  }

  private meetsThreshold(options: NotificationOptions): boolean {
    if (options.type !== 'price_change') return true;
    
    const threshold = options.threshold || this.defaultPriceThreshold;
    const changePercent = options.payload.changePercent || 0;
    
    return Math.abs(changePercent) >= threshold;
  }

  private addToBatch(options: NotificationOptions): void {
    const batchKey = `notification:batch:${options.type}`;
    const batch: NotificationBatch = memoryManager.get(batchKey) || {
      count: 0,
      items: [],
      firstTimestamp: Date.now(),
      lastTimestamp: Date.now()
    };

    batch.count++;
    batch.items.push(options);
    batch.lastTimestamp = Date.now();

    memoryManager.set(batchKey, batch, this.batchInterval);
    console.log(`📱 Added to batch: ${options.type} (${batch.count} items)`);
  }

  private async sendTelegram(options: NotificationOptions): Promise<boolean> {
    try {
      // Use filtered telegram notifier if available
      const { sendFilteredTelegramNotification } = await import('./filtered-telegram-notifier');
      
      let message = '';
      
      switch (options.type) {
        case 'price_change':
          message = this.formatPriceChangeMessage(options.payload);
          break;
        case 'product_upload':
          message = this.formatProductUploadMessage(options.payload);
          break;
        case 'error':
          message = this.formatErrorMessage(options.payload);
          break;
        case 'system':
          message = this.formatSystemMessage(options.payload);
          break;
      }

      await sendFilteredTelegramNotification(message);
      console.log(`📱 Telegram notification sent: ${options.type}`);
      return true;
      
    } catch (error) {
      console.error('📱 Telegram notification failed:', error);
      return false;
    }
  }

  private formatPriceChangeMessage(payload: any): string {
    const changePercent = payload.changePercent || 0;
    const emoji = changePercent > 0 ? '📈' : '📉';
    const priority = Math.abs(changePercent) > 20 ? 'YÜKSEK ÖNCELİK' : 'NORMAL';
    
    // Calculate suggested Shopify price with profit margin (default 10%)
    const profitMargin = payload.profitMargin || 10;
    const newPrice = parseFloat(payload.newPrice) || 0;
    const suggestedPrice = (newPrice * (1 + profitMargin / 100)).toFixed(2);
    
    return `
${emoji} <b>FİYAT DEĞİŞİKLİĞİ - ${priority}</b>

📦 <b>Ürün:</b> ${payload.title}

💰 <b>Trendyol Fiyat Değişimi:</b>
   ${payload.oldPrice} TL → ${payload.newPrice} TL
   
💵 <b>Önerilen Shopify Fiyatı:</b>
   <b>${suggestedPrice} TL</b> (+${profitMargin}% kar marjı)

📊 <b>Değişim Oranı:</b> ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%

🔗 <b>Değişiklik Onay Paneli:</b>
   Onaylamak için web arayüzüne gidin

⏰ <i>${new Date().toLocaleString('tr-TR')}</i>
    `.trim();
  }

  private formatProductUploadMessage(payload: any): string {
    return `
🛒 <b>SHOPIFY YÜKLEME BAŞARILI</b>

📦 <b>Ürün:</b> ${payload.title}
🏢 <b>Marka:</b> ${payload.brand}
💰 <b>Fiyat:</b> ${payload.price} TL
🆔 <b>Shopify ID:</b> ${payload.shopifyId}

✅ <b>Shopify'da aktif</b>
    `.trim();
  }

  private formatErrorMessage(payload: any): string {
    return `
❌ <b>SİSTEM HATASI</b>

🔍 <b>Hata:</b> ${payload.error}
📍 <b>Konum:</b> ${payload.location}
🔗 <b>URL:</b> ${payload.url}

⏰ <i>${new Date().toLocaleString('tr-TR')}</i>
    `.trim();
  }

  private formatSystemMessage(payload: any): string {
    return `
ℹ️ <b>SİSTEM BİLGİSİ</b>

📋 <b>Mesaj:</b> ${payload.message}
⏰ <i>${new Date().toLocaleString('tr-TR')}</i>
    `.trim();
  }

  private startBatchProcessor(): void {
    setInterval(() => {
      this.processBatches();
    }, this.batchInterval);
  }

  private async processBatches(): Promise<void> {
    const batchKeys = memoryManager.keys().filter(key => key.startsWith('notification:batch:'));
    
    for (const batchKey of batchKeys) {
      const batch: NotificationBatch = memoryManager.get(batchKey);
      if (!batch || batch.items.length === 0) continue;

      console.log(`📱 Processing batch: ${batchKey} (${batch.count} items)`);
      
      // Create digest message
      const digestMessage = this.createBatchDigest(batch);
      await this.sendTelegram({
        type: 'system',
        payload: { message: digestMessage },
        priority: 'low'
      });

      // Clear batch
      memoryManager.delete(batchKey);
    }
  }

  private createBatchDigest(batch: NotificationBatch): string {
    const duration = Math.round((batch.lastTimestamp - batch.firstTimestamp) / 1000 / 60);
    
    return `
📊 <b>TOPLU BİLDİRİM ÖZETİ</b>

📈 <b>Toplam:</b> ${batch.count} bildirim
⏱️ <b>Süre:</b> ${duration} dakika
📅 <b>Tarih:</b> ${new Date(batch.firstTimestamp).toLocaleString('tr-TR')}

<i>Detaylar web arayüzünde görüntülenebilir</i>
    `.trim();
  }

  // Get notification statistics
  getStats() {
    const allKeys = memoryManager.keys();
    const sentKeys = allKeys.filter(key => key.startsWith('notification:sent:'));
    const rateKeys = allKeys.filter(key => key.startsWith('notification:rate:'));
    const batchKeys = allKeys.filter(key => key.startsWith('notification:batch:'));

    return {
      mode: this.mode,
      totalSent: sentKeys.length,
      activeRateLimits: rateKeys.length,
      pendingBatches: batchKeys.length,
      idempotencyTTL: this.idempotencyTTL,
      rateLimitTTL: this.rateLimitTTL,
      maxNotificationsPerHour: this.maxNotificationsPerHour
    };
  }

  // Clear all notification-related cache
  clearNotificationCache(): void {
    const cleared = memoryManager.invalidatePattern('^notification:');
    console.log(`📱 Cleared ${cleared} notification cache entries`);
  }
}

// Singleton instance
export const notificationGateway = new NotificationGateway();

// Export class for testing
export { NotificationGateway };