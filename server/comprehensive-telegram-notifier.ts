/**
 * Comprehensive Telegram Notification System
 * Handles all system notifications through Telegram
 */

import TelegramBot from 'node-telegram-bot-api';

interface TelegramNotificationData {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  productInfo?: {
    title?: string;
    brand?: string;
    price?: string;
    url?: string;
  };
  systemInfo?: {
    timestamp: string;
    source: string;
    details?: any;
  };
}

class ComprehensiveTelegramNotifier {
  private bot: TelegramBot;
  private chatId: string;
  private isEnabled: boolean = true;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn('⚠️ Telegram credentials not found, notifications disabled');
      this.isEnabled = false;
      return;
    }

    this.bot = new TelegramBot(token);
    this.chatId = chatId;
    
    console.log('🤖 Comprehensive Telegram Notifier initialized');
  }

  /**
   * Send notification with rich formatting
   */
  async sendNotification(data: TelegramNotificationData): Promise<void> {
    if (!this.isEnabled) {
      console.log('📢 Telegram notification (disabled):', data.title);
      return;
    }

    try {
      const message = this.formatMessage(data);
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      
      console.log('📢 Telegram notification sent:', data.title);
    } catch (error) {
      console.error('❌ Telegram notification failed:', error);
    }
  }

  /**
   * Format message with rich HTML styling
   */
  private formatMessage(data: TelegramNotificationData): string {
    const emoji = this.getEmojiForType(data.type);
    const timestamp = new Date().toLocaleString('tr-TR');
    
    let message = `${emoji} <b>${data.title}</b>\n\n`;
    message += `${data.message}\n\n`;
    
    if (data.productInfo) {
      message += `📦 <b>Ürün Bilgileri:</b>\n`;
      if (data.productInfo.title) message += `• Başlık: ${data.productInfo.title}\n`;
      if (data.productInfo.brand) message += `• Marka: ${data.productInfo.brand}\n`;
      if (data.productInfo.price) message += `• Fiyat: ${data.productInfo.price}\n`;
      if (data.productInfo.url) message += `• URL: ${data.productInfo.url}\n`;
      message += `\n`;
    }
    
    if (data.systemInfo) {
      message += `🔧 <b>Sistem Bilgileri:</b>\n`;
      message += `• Kaynak: ${data.systemInfo.source}\n`;
      message += `• Zaman: ${timestamp}\n`;
      if (data.systemInfo.details) {
        message += `• Detaylar: ${JSON.stringify(data.systemInfo.details).substring(0, 200)}...\n`;
      }
    }
    
    return message;
  }

  /**
   * Get emoji for notification type
   */
  private getEmojiForType(type: string): string {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  }

  /**
   * Product extraction started
   */
  async notifyExtractionStarted(url: string): Promise<void> {
    await this.sendNotification({
      type: 'info',
      title: 'Ürün Çıkarma Başlatıldı',
      message: 'Yeni ürün çıkarma işlemi başlatıldı.',
      productInfo: { url },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Product Extraction System'
      }
    });
  }

  /**
   * Product extraction completed
   */
  async notifyExtractionCompleted(productData: any): Promise<void> {
    await this.sendNotification({
      type: 'success',
      title: 'Ürün Çıkarma Tamamlandı',
      message: `${productData.variants?.length || 0} varyant ile ürün başarıyla çıkarıldı.`,
      productInfo: {
        title: productData.title,
        brand: productData.brand,
        price: productData.price?.formatted || productData.price,
        url: productData.url
      },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Scenario-Based Scraper',
        details: {
          scenario: productData.scenario,
          confidence: productData.confidence,
          variants: productData.variants?.length || 0
        }
      }
    });
  }

  /**
   * Product extraction failed
   */
  async notifyExtractionFailed(url: string, error: any): Promise<void> {
    await this.sendNotification({
      type: 'error',
      title: 'Ürün Çıkarma Başarısız',
      message: `Ürün çıkarma işlemi başarısız oldu: ${error.message}`,
      productInfo: { url },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Product Extraction System',
        details: {
          error: error.message,
          stack: error.stack?.substring(0, 200)
        }
      }
    });
  }

  /**
   * Shopify sync completed
   */
  async notifyShopifySync(productData: any, shopifyId: string): Promise<void> {
    await this.sendNotification({
      type: 'success',
      title: 'Shopify Senkronizasyonu Tamamlandı',
      message: `Ürün başarıyla Shopify'a aktarıldı.`,
      productInfo: {
        title: productData.title,
        brand: productData.brand,
        price: productData.price?.formatted || productData.price
      },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Shopify Integration',
        details: {
          shopifyId,
          variants: productData.variants?.length || 0
        }
      }
    });
  }

  /**
   * Database operation completed
   */
  async notifyDatabaseOperation(operation: string, productData: any): Promise<void> {
    await this.sendNotification({
      type: 'success',
      title: 'Veritabanı İşlemi Tamamlandı',
      message: `${operation} işlemi başarıyla tamamlandı.`,
      productInfo: {
        title: productData.title,
        brand: productData.brand
      },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Database System',
        details: { operation }
      }
    });
  }

  /**
   * Complete workflow finished
   */
  async notifyCompleteWorkflow(result: any): Promise<void> {
    await this.sendNotification({
      type: 'success',
      title: 'Entegre İşlem Tamamlandı',
      message: `Tam iş akışı başarıyla tamamlandı: çıkarma → Shopify → veritabanı → izleme`,
      productInfo: {
        title: result.title || `Ürün ID: ${result.productId}`
      },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Complete Workflow System',
        details: {
          productId: result.productId,
          shopifyProductId: result.shopifyProductId,
          reviewsCount: result.reviewsCount,
          csvGenerated: result.csvGenerated,
          monitoring: result.monitoring
        }
      }
    });
  }

  /**
   * System error occurred
   */
  async notifySystemError(error: any, context: string): Promise<void> {
    await this.sendNotification({
      type: 'error',
      title: 'Sistem Hatası',
      message: `Sistem hatası oluştu: ${error.message}`,
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: context,
        details: {
          error: error.message,
          stack: error.stack?.substring(0, 200)
        }
      }
    });
  }

  /**
   * Daily statistics report
   */
  async notifyDailyStats(stats: any): Promise<void> {
    await this.sendNotification({
      type: 'info',
      title: 'Günlük İstatistik Raporu',
      message: `Bugünün özeti hazır.`,
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Daily Statistics System',
        details: {
          totalProducts: stats.totalProducts,
          successRate: stats.successRate,
          activeMonitors: stats.activeMonitors,
          dailyExtractions: stats.dailyExtractions
        }
      }
    });
  }

  /**
   * CSV generation completed
   */
  async notifyCSVGenerated(productData: any, csvPath: string): Promise<void> {
    await this.sendNotification({
      type: 'success',
      title: 'CSV Dosyası Oluşturuldu',
      message: `Shopify uyumlu CSV dosyası başarıyla oluşturuldu.`,
      productInfo: {
        title: productData.title,
        brand: productData.brand
      },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'CSV Generator',
        details: { csvPath }
      }
    });
  }

  /**
   * Monitoring setup completed
   */
  async notifyMonitoringSetup(productId: number, url: string): Promise<void> {
    await this.sendNotification({
      type: 'info',
      title: 'İzleme Sistemi Kuruldu',
      message: `Ürün izleme sistemi aktif hale getirildi.`,
      productInfo: { url },
      systemInfo: {
        timestamp: new Date().toISOString(),
        source: 'Monitoring System',
        details: { productId }
      }
    });
  }
}

// Export singleton instance
export const telegramNotifier = new ComprehensiveTelegramNotifier();

// Export notification methods for easy access
export const TelegramNotifications = {
  extractionStarted: (url: string) => telegramNotifier.notifyExtractionStarted(url),
  extractionCompleted: (productData: any) => telegramNotifier.notifyExtractionCompleted(productData),
  extractionFailed: (url: string, error: any) => telegramNotifier.notifyExtractionFailed(url, error),
  shopifySync: (productData: any, shopifyId: string) => telegramNotifier.notifyShopifySync(productData, shopifyId),
  databaseOperation: (operation: string, productData: any) => telegramNotifier.notifyDatabaseOperation(operation, productData),
  completeWorkflow: (result: any) => telegramNotifier.notifyCompleteWorkflow(result),
  systemError: (error: any, context: string) => telegramNotifier.notifySystemError(error, context),
  dailyStats: (stats: any) => telegramNotifier.notifyDailyStats(stats),
  csvGenerated: (productData: any, csvPath: string) => telegramNotifier.notifyCSVGenerated(productData, csvPath),
  monitoringSetup: (productId: number, url: string) => telegramNotifier.notifyMonitoringSetup(productId, url)
};