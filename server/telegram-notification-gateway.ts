// Telegram Notification Gateway - Deduplication & Smart Filtering
import { filteredNotifier } from './filtered-telegram-notifier';
import { db } from './db';
import { telegramNotificationHistory } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface NotificationCache {
  hash: string;
  timestamp: number;
  productId?: number;
  type: string;
}

interface ProductChangeBatch {
  productId: number;
  productTitle: string;
  changes: Array<{
    type: string;
    timestamp: number;
    data: any;
  }>;
  firstChange: number;
  lastChange: number;
}

export class TelegramNotificationGateway {
  private notificationCache: Map<string, NotificationCache> = new Map();
  private readonly DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly PRODUCT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes per product
  
  // 🚨 TELEGRAM API RATE LIMITING
  private messageTimestamps: number[] = [];
  private readonly TELEGRAM_RATE_LIMIT = 20; // Max 20 messages per minute (safe limit)
  private readonly TELEGRAM_WINDOW_MS = 60 * 1000; // 1 minute window
  
  // 🎯 SMART BATCHING - Group multiple changes for same product
  private productBatches: Map<number, ProductChangeBatch> = new Map();
  private readonly BATCH_WINDOW_MS = 2 * 60 * 1000; // 2 minutes batch window
  private batchProcessor: NodeJS.Timeout | null = null;
  
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

    // 🔥 NEW: TRIPLE-LAYER FAKE VARIANT PROTECTION
    // Extract color/size from metadata and block fake variants BEFORE database insertion
    if (metadata && (metadata.color || metadata.size)) {
      const color = metadata.color || 'Unknown';
      const size = metadata.size || 'Unknown';
      
      if (this.isFakeVariant(color, size)) {
        console.log(`🚫 ULTIMATE BLOCK: Fake variant notification blocked BEFORE database - ${color} / ${size} (${type})`);
        return false;
      }
    }

    // 3. Create unique hash for this notification
    const hash = this.createNotificationHash(message, type, productId);

    // 4. Check deduplication cache
    if (this.isDuplicate(hash)) {
      console.log(`🚫 Duplicate notification blocked: ${type} (within 5 min window)`);
      return false;
    }

    // 🎯 SMART BATCHING - Track all product changes (BEFORE throttle & rate limit)
    let currentBatch: ProductChangeBatch | undefined;
    if (productId && productTitle) {
      this.addToProductBatch(productId, productTitle, type, metadata);
      currentBatch = this.productBatches.get(productId);
      
      // Check if we should batch this notification
      if (currentBatch && currentBatch.changes.length >= 3) {
        // 3+ changes: batch and delay sending
        try {
          await db.insert(telegramNotificationHistory).values({
            notificationType: type,
            message,
            productId: productId,
            variantId: variantId || null,
            productTitle: productTitle,
            status: 'batched', // Will be sent as grouped message
            metadata: metadata || {},
          });
          console.log(`🎯 Change batched for later: Product ${productId} - ${type} (${currentBatch.changes.length} total)`);
        } catch (dbError) {
          console.error(`❌ Failed to log batched notification:`, dbError);
        }
        return true; // Don't send individually - will be batched
      }
      // 1-2 changes: continue to immediate send (fall through, skip throttle)
    }

    // 5. Check product-specific throttling (AFTER batching check, SKIP if batch exists)
    // Skip throttle for first 2 changes to allow "first 2 immediate" rule
    if (productId && !currentBatch && this.isProductThrottled(productId, type)) {
      console.log(`⏱️ Product throttled: ${productId} for ${type}`);
      return false;
    }

    // 6. Check Telegram API rate limit (AFTER batching)
    if (!await this.checkTelegramRateLimit()) {
      console.log(`🚨 Telegram API rate limit reached - message queued or dropped`);
      return false;
    }

    // 🔥 NEW: INTERCEPTION SYSTEM - Save to database before sending
    let notificationId: number | null = null;
    
    try {
      // Save notification to database with 'pending' status
      const result = await db.insert(telegramNotificationHistory).values({
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
   * Send price change notification (auto-formatted) - ENHANCED PRO VERSION
   */
  async sendPriceChange(
    productTitle: string,
    productId: number,
    oldPrice: number,
    newPrice: number,
    shopifyUpdated: boolean = false
  ): Promise<boolean> {
    const priceChange = ((newPrice - oldPrice) / oldPrice * 100).toFixed(2);
    const priceDiff = (newPrice - oldPrice).toFixed(2);
    const changeType = newPrice > oldPrice ? 'price_increase' : 'price_decrease';
    const emoji = newPrice > oldPrice ? '📈' : '📉';
    const trendEmoji = newPrice > oldPrice ? '🔺' : '🔻';
    
    // Determine urgency level
    const changePercent = Math.abs(parseFloat(priceChange));
    const urgencyEmoji = changePercent > 20 ? '🚨' : changePercent > 10 ? '⚠️' : 'ℹ️';

    const message = 
      `${emoji} ${urgencyEmoji} <b>FİYAT DEĞİŞİKLİĞİ</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n\n` +
      `💰 <b>Eski Fiyat:</b> <code>${oldPrice.toFixed(2)} TL</code>\n` +
      `💵 <b>Yeni Fiyat:</b> <code>${newPrice.toFixed(2)} TL</code>\n\n` +
      `${trendEmoji} <b>Değişim:</b> <code>${priceDiff} TL</code> <b>(${priceChange}%)</b>\n` +
      (changePercent > 20 ? `\n🔥 <b>BÜYÜK DEĞİŞİM!</b> Acil kontrol gerekli\n` : '') +
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      (shopifyUpdated ? `✅ Shopify otomatik güncellendi (%10 kar marjı)\n` : `⏳ Shopify güncellemesi bekleniyor\n`) +
      `\n<i>⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</i>`;

    return await this.sendNotification(message, changeType, productId, { 
      oldPrice, 
      newPrice, 
      priceChange: parseFloat(priceChange),
      urgency: changePercent > 20 ? 'high' : changePercent > 10 ? 'medium' : 'low'
    });
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
   * Send variant change notification - ENHANCED PRO VERSION
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
    let bgEmoji = '';
    let statusText = '';

    switch (changeType) {
      case 'variant_added':
        emoji = '➕';
        bgEmoji = '🆕';
        title = 'YENİ VARYANT EKLEND İ';
        statusText = 'Yeni varyant Trendyol\'da tespit edildi';
        break;
      case 'variant_removed':
        emoji = '➖';
        bgEmoji = '🗑️';
        title = 'VARYANT KALDIRILDI';
        statusText = 'Varyant Trendyol\'dan kaldırıldı';
        break;
      case 'variant_oos':
        emoji = '🚫';
        bgEmoji = '❌';
        title = 'STOK TÜKENDİ';
        statusText = 'Varyant stoktan düştü';
        break;
      case 'variant_back_in_stock':
        emoji = '✅';
        bgEmoji = '🎉';
        title = 'STOK YENİDEN MEVCUT';
        statusText = 'Varyant tekrar stoka girdi';
        break;
    }

    const message = 
      `${emoji} ${bgEmoji} <b>${title}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n\n` +
      `🎨 <b>Renk:</b> <code>${color}</code>\n` +
      `📏 <b>Beden:</b> <code>${size}</code>\n\n` +
      `📍 <b>Durum:</b> ${statusText}\n` +
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      (metadata?.shopifyUpdated ? `✅ Shopify otomatik güncellendi\n` : `⏳ Shopify güncellemesi bekleniyor\n`) +
      `\n<i>⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</i>`;

    return await this.sendNotification(message, changeType, productId, { ...metadata, color, size });
  }

  /**
   * Send stock change notification - ENHANCED PRO VERSION
   */
  async sendStockChange(
    productTitle: string,
    productId: number,
    oldStock: number,
    newStock: number,
    color?: string,
    size?: string
  ): Promise<boolean> {
    const stockDiff = newStock - oldStock;
    const emoji = newStock > oldStock ? '📈' : '📉';
    const statusEmoji = newStock === 0 ? '🚨' : newStock < 10 ? '⚠️' : '✅';
    const trendEmoji = stockDiff > 0 ? '🔺' : '🔻';
    
    let statusText = '';
    if (newStock === 0) {
      statusText = '❌ Stokta yok (TÜKENDİ)';
    } else if (newStock < 10) {
      statusText = '⚠️ Düşük stok (Acil takip)';
    } else {
      statusText = '✅ Stok durumu iyi';
    }

    const message = 
      `${emoji} ${statusEmoji} <b>STOK DEĞİŞİKLİĞİ</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n` +
      (color ? `🎨 <b>Renk:</b> <code>${color}</code>\n` : '') +
      (size ? `📏 <b>Beden:</b> <code>${size}</code>\n` : '') +
      `\n📊 <b>Eski Stok:</b> <code>${oldStock}</code>\n` +
      `📊 <b>Yeni Stok:</b> <code>${newStock}</code>\n` +
      `${trendEmoji} <b>Değişim:</b> <code>${stockDiff > 0 ? '+' : ''}${stockDiff}</code>\n\n` +
      `📍 <b>Durum:</b> ${statusText}\n` +
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Shopify otomatik güncellendi\n` +
      `\n<i>⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</i>`;

    return await this.sendNotification(message, 'stock_change', productId, { 
      oldStock, 
      newStock, 
      stockDiff,
      urgency: newStock === 0 ? 'high' : newStock < 10 ? 'medium' : 'low'
    });
  }

  /**
   * Send Shopify sync error notification - ENHANCED PRO VERSION
   */
  async sendShopifySyncError(
    productTitle: string,
    productId: number,
    operation: string,
    error: string
  ): Promise<boolean> {
    const message = 
      `❌ 🚨 <b>SHOPIFY SYNC HATASI</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Ürün:</b> ${productTitle}\n` +
      `⚙️ <b>İşlem:</b> <code>${operation}</code>\n\n` +
      `❌ <b>Hata Detayı:</b>\n<pre>${error.substring(0, 200)}</pre>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔄 Retry mekanizması otomatik devreye girdi\n` +
      `📝 Hata logları kaydedildi\n\n` +
      `<i>⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</i>`;

    return await this.sendNotification(message, 'shopify_sync_error', productId, { 
      operation, 
      error,
      urgency: 'high' 
    });
  }

  /**
   * Send daily summary report - PROFESSIONAL VERSION
   */
  async sendDailySummary(summary: {
    date: Date;
    totalProducts: number;
    activeTracking: number;
    priceChanges: number;
    variantChanges: number;
    stockChanges: number;
    shopifyUpdates: number;
    errors: number;
  }): Promise<boolean> {
    const date = summary.date.toLocaleDateString('tr-TR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Calculate health score
    const healthScore = summary.errors === 0 ? 100 : 
                        summary.errors < 3 ? 90 :
                        summary.errors < 10 ? 70 : 50;
    const healthEmoji = healthScore >= 90 ? '🟢' : healthScore >= 70 ? '🟡' : '🔴';

    const message = 
      `📊 💎 <b>GÜNLÜK ÖZET RAPORU</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📅 <b>Tarih:</b> ${date}\n` +
      `${healthEmoji} <b>Sistem Sağlığı:</b> %${healthScore}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>ÜRÜN İSTATİSTİKLERİ</b>\n` +
      `   • Toplam Ürün: <code>${summary.totalProducts}</code>\n` +
      `   • Aktif İzleme: <code>${summary.activeTracking}</code>\n\n` +
      `📈 <b>DEĞİŞİKLİKLER</b>\n` +
      `   💰 Fiyat: <code>${summary.priceChanges}</code> değişiklik\n` +
      `   🎨 Varyant: <code>${summary.variantChanges}</code> değişiklik\n` +
      `   📦 Stok: <code>${summary.stockChanges}</code> değişiklik\n\n` +
      `🔄 <b>SHOPIFY SENKRON</b>\n` +
      `   ✅ Başarılı: <code>${summary.shopifyUpdates}</code>\n` +
      `   ❌ Hata: <code>${summary.errors}</code>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      (summary.errors === 0 ? 
        `✨ <b>Mükemmel!</b> Bugün hiç hata yok\n` : 
        `⚠️ <b>Dikkat:</b> ${summary.errors} hata tespit edildi\n`) +
      `\n<i>⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</i>`;

    return await this.sendNotification(message, 'daily_report', undefined, summary);
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
   * 🎯 Check if product should be batched (has recent changes)
   */
  private shouldBatchProduct(productId: number): boolean {
    const batch = this.productBatches.get(productId);
    
    // If batch exists and has 2+ changes already, batch this one too
    if (batch && batch.changes.length >= 2) {
      return true;
    }
    
    return false;
  }

  /**
   * 🎯 SMART BATCHING - Add change to product batch
   */
  private addToProductBatch(productId: number, productTitle: string, type: string, data: any): void {
    const now = Date.now();
    
    let batch = this.productBatches.get(productId);
    
    if (!batch) {
      batch = {
        productId,
        productTitle,
        changes: [],
        firstChange: now,
        lastChange: now
      };
      this.productBatches.set(productId, batch);
      
      // Start batch processor if not running
      if (!this.batchProcessor) {
        this.startBatchProcessor();
      }
    }
    
    batch.changes.push({ type, timestamp: now, data });
    batch.lastChange = now;
    
    console.log(`🎯 Added to batch: Product ${productId} - ${type} (${batch.changes.length} changes)`);
  }

  /**
   * 🎯 Start batch processor
   */
  private startBatchProcessor(): void {
    this.batchProcessor = setInterval(() => {
      this.processBatches();
    }, 30 * 1000); // Check every 30 seconds
    
    console.log('🎯 Batch processor started');
  }

  /**
   * 🎯 Process batches - Send grouped notifications
   * Only sends batches with 3+ changes (first 2 are sent immediately)
   */
  private async processBatches(): Promise<void> {
    const now = Date.now();

    for (const [productId, batch] of this.productBatches.entries()) {
      const age = now - batch.lastChange;
      
      // ONLY send batch if it has 3+ changes AND is old enough
      // (First 2 changes are sent immediately, not batched)
      if (batch.changes.length >= 3 && age > this.BATCH_WINDOW_MS) {
        const sent = await this.sendBatchedNotificationWithCleanup(batch);
        
        // Only delete batch if successfully sent
        if (sent) {
          this.productBatches.delete(productId);
        }
      }
      // If batch has <3 changes, clean up old batches to free memory
      else if (age > this.BATCH_WINDOW_MS * 5) {
        console.log(`🧹 Cleaning up old batch with <3 changes: Product ${productId}`);
        this.productBatches.delete(productId);
      }
    }
  }

  /**
   * 🎯 Send batch and return success status
   */
  private async sendBatchedNotificationWithCleanup(batch: ProductChangeBatch): Promise<boolean> {
    // Check rate limit before sending batch
    if (!await this.checkTelegramRateLimit()) {
      console.log(`🚨 Telegram rate limit - batch delayed: Product ${batch.productId}`);
      // Keep batch in queue - will be sent in next cycle
      return false;
    }

    await this.sendBatchedNotification(batch);
    return true;
  }

  /**
   * 🎯 Send batched notification - Multiple changes in one message
   * Note: Rate limit already checked in sendBatchedNotificationWithCleanup()
   */
  private async sendBatchedNotification(batch: ProductChangeBatch): Promise<void> {
    const changeCount = batch.changes.length;
    const duration = Math.ceil((batch.lastChange - batch.firstChange) / 1000 / 60);
    
    let changesSummary = '';
    let priceChanges = 0;
    let variantChanges = 0;
    let stockChanges = 0;
    
    // Group changes by type
    for (const change of batch.changes) {
      if (change.type.includes('price')) priceChanges++;
      else if (change.type.includes('variant')) variantChanges++;
      else if (change.type.includes('stock')) stockChanges++;
    }

    if (priceChanges > 0) changesSummary += `💰 ${priceChanges} fiyat değişikliği\n`;
    if (variantChanges > 0) changesSummary += `🎨 ${variantChanges} varyant değişikliği\n`;
    if (stockChanges > 0) changesSummary += `📦 ${stockChanges} stok değişikliği\n`;

    const message = 
      `📦 🔄 <b>TOPLU DEĞİŞİKLİK</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>Ürün:</b> ${batch.productTitle}\n` +
      `📊 <b>Toplam Değişiklik:</b> <code>${changeCount}</code>\n` +
      `⏱️ <b>Süre:</b> ${duration} dakika\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `<b>DEĞİŞİKLİK ÖZETİ:</b>\n${changesSummary}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Tüm değişiklikler Shopify'da senkronize edildi\n\n` +
      `<i>💡 Birden fazla değişiklik tespit edildiği için toplu bildirim gönderildi</i>\n\n` +
      `<i>⏰ ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</i>`;

    try {
      await filteredNotifier.sendNotification(message);
      this.recordMessageSent(); // Track for rate limiting
      
      // Update database status from "batched" to "sent"
      try {
        const result = await db.update(telegramNotificationHistory)
          .set({ status: 'sent' })
          .where(
            and(
              eq(telegramNotificationHistory.productId, batch.productId),
              eq(telegramNotificationHistory.status, 'batched')
            )
          );
        console.log(`💾 Updated batched notifications to "sent" status for product ${batch.productId}`);
      } catch (dbError) {
        console.error(`❌ Failed to update batched notification status:`, dbError);
      }
      
      console.log(`🎯 Batched notification sent: Product ${batch.productId} - ${changeCount} changes`);
    } catch (error) {
      console.error(`❌ Failed to send batched notification:`, error);
    }
  }

  /**
   * Clear cache (for testing/debugging)
   */
  clearCache(): void {
    this.notificationCache.clear();
    this.productBatches.clear();
    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
      this.batchProcessor = null;
    }
    console.log('🗑️ Notification cache & batches cleared');
  }
}

// Singleton instance
export const telegramGateway = new TelegramNotificationGateway();
