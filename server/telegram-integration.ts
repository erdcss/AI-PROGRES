// Telegram Bot Integration for Product Monitoring
import TelegramBot from 'node-telegram-bot-api';

export class TelegramIntegration {
  private bot: TelegramBot | null = null;
  private chatId: string | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.initializeBot();
  }

  private initializeBot() {
    const token = '7687164814:AAGw-Z0yBYuyfbkA-4bIWhJg_WxxWj14hxk';
    this.chatId = '1219880063'; // User chat ID
    
    if (!token) {
      console.log('Telegram bot token not found');
      return;
    }
    
    console.log('Initializing Telegram bot with new token and chat ID...');

    try {
      // Çakışmayı önlemek için önceki instance'ları temizle
      if (this.bot) {
        this.bot.stopPolling();
      }
      
      this.bot = new TelegramBot(token, { 
        polling: {
          interval: 3000,
          autoStart: false
        }
      });
      this.setupEventHandlers();
      
      // Telegram bot'u direkt başlat
      this.isConnected = true;
      console.log('Telegram bot initialized with user token');
      
    } catch (error) {
      console.error('Failed to initialize Telegram bot:', error);
    }
  }

  private setupEventHandlers() {
    if (!this.bot) return;

    // Handle /start command
    this.bot.onText(/\/start/, (msg) => {
      this.chatId = msg.chat.id.toString();
      console.log(`Telegram chat ID set: ${this.chatId}`);
      
      this.bot!.sendMessage(msg.chat.id, 
        '🤖 Turmarkt Monitoring Bot aktif!\n\n' +
        '✅ Bu chat\'e product monitoring bildirimleri gelecek\n' +
        '📊 Stok ve fiyat değişiklikleri anlık takip edilecek\n\n' +
        'Komutlar:\n' +
        '/status - Bot durumunu kontrol et\n' +
        '/products - İzlenen ürünleri listele\n' +
        '/help - Yardım menüsü'
      );
    });

    // Handle /status command
    this.bot.onText(/\/status/, (msg) => {
      const statusMessage = this.isConnected ? 
        '✅ Bot aktif ve çalışıyor\n📱 Bildirimler bu chat\'e gelecek' :
        '❌ Bot bağlantısında sorun var';
      
      this.bot!.sendMessage(msg.chat.id, statusMessage);
    });

    // Handle /products command
    this.bot.onText(/\/products/, async (msg) => {
      try {
        // Get active products from memory system
        const { memorySystem } = await import('./memory-system');
        const products = await memorySystem.getActiveProducts();
        
        if (products.length === 0) {
          this.bot!.sendMessage(msg.chat.id, '📦 Henüz izlenen ürün yok');
          return;
        }

        let message = '📊 İzlenen Ürünler:\n\n';
        products.slice(0, 10).forEach((product, index) => {
          message += `${index + 1}. ${product.title}\n`;
          message += `   💰 ${product.currentPrice} TL\n`;
          message += `   📦 Stok: ${product.isInStock ? 'Var' : 'Yok'}\n\n`;
        });

        if (products.length > 10) {
          message += `...ve ${products.length - 10} ürün daha`;
        }

        this.bot!.sendMessage(msg.chat.id, message);
      } catch (error) {
        this.bot!.sendMessage(msg.chat.id, '❌ Ürün listesi alınamadı');
      }
    });

    // Handle /help command
    this.bot.onText(/\/help/, (msg) => {
      const helpMessage = 
        '🤖 Turmarkt Monitoring Bot Yardım\n\n' +
        '📋 Komutlar:\n' +
        '/start - Bot\'u başlat\n' +
        '/status - Bot durumunu kontrol et\n' +
        '/products - İzlenen ürünleri listele\n' +
        '/help - Bu yardım menüsü\n\n' +
        '🔔 Otomatik Bildirimler:\n' +
        '• Ürün stoktan çıktığında\n' +
        '• Fiyat değiştiğinde\n' +
        '• Shopify senkronizasyonu tamamlandığında';

      this.bot!.sendMessage(msg.chat.id, helpMessage);
    });

    console.log('Telegram event handlers set up');
  }

  private restartBot() {
    if (this.bot) {
      this.bot.stopPolling();
      setTimeout(() => {
        if (this.bot) {
          this.bot.startPolling({ restart: true });
        }
      }, 3000);
    }
  }

  // Send stock out notification
  async sendStockOutNotification(productName: string, variant: string) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for stock notification');
      return;
    }

    const message = 
      `🚨 STOK TÜKENDİ\n\n` +
      `📦 Ürün: ${productName}\n` +
      `🎯 Varyant: ${variant}\n` +
      `❌ Durum: Trendyol'da stoktan çıktı\n` +
      `📦 Shopify Stok: 0 (otomatik sıfırlandı)\n\n` +
      `⚡ Sistem otomatik güncelleme yaptı`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Stock out notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }

  // Send stock restore notification
  async sendStockRestoreNotification(productName: string, variant: string) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for stock restore notification');
      return;
    }

    const message = 
      `✅ STOK YENİDEN MEVCUT\n\n` +
      `📦 Ürün: ${productName}\n` +
      `🎯 Varyant: ${variant}\n` +
      `✅ Durum: Trendyol'da tekrar stoka girdi\n` +
      `📦 Shopify Stok: Restore edildi\n\n` +
      `⚡ Sistem otomatik güncelleme yaptı`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Stock restore notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }

  // Send price change notification
  async sendPriceChangeNotification(productName: string, oldPrice: number, newPrice: number) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for price notification');
      return;
    }

    const direction = newPrice > oldPrice ? '📈 ARTTI' : '📉 DÜŞTÜ';
    const difference = Math.abs(newPrice - oldPrice).toFixed(2);
    const percentage = (Math.abs(newPrice - oldPrice) / oldPrice * 100).toFixed(1);

    const message = 
      `💰 FİYAT DEĞİŞİKLİĞİ\n\n` +
      `📦 Ürün: ${productName}\n` +
      `${direction}\n` +
      `💵 Eski fiyat: ${oldPrice.toFixed(2)} TL\n` +
      `💵 Yeni fiyat: ${newPrice.toFixed(2)} TL\n` +
      `📊 Fark: ${difference} TL (${percentage}%)\n\n` +
      `⚡ Shopify fiyatı güncelleniyor...`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Price change notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }

  // Send new product upload notification with detailed info
  async sendNewProductNotification(product: any, variants: any[]) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for new product notification');
      return;
    }

    const firstVariant = variants[0] || {};
    const totalVariants = variants.length;
    const inStockVariants = variants.filter(v => v.inStock).length;
    const originalPrice = parseFloat(firstVariant.trendyolPrice || 0);
    const sellingPrice = originalPrice * 1.15;
    const profitAmount = sellingPrice - originalPrice;
    const profitMargin = '15%';

    let variantList = '';
    variants.slice(0, 5).forEach((variant, index) => {
      const stockStatus = variant.inStock ? '✅' : '❌';
      variantList += `${stockStatus} ${variant.color || 'Renk Yok'} - ${variant.size || 'Beden Yok'}\n`;
    });
    if (totalVariants > 5) {
      variantList += `...ve ${totalVariants - 5} varyant daha`;
    }

    const message = 
      `🆕 YENİ ÜRÜN YÜKLENDİ\n\n` +
      `📦 Ürün: ${product.title}\n` +
      `🌐 Kaynak Site: Trendyol\n` +
      `💰 Alış Fiyatı: ${originalPrice.toFixed(2)} TL\n` +
      `💵 Satış Fiyatı: ${sellingPrice.toFixed(2)} TL\n` +
      `📈 Kar Miktarı: ${profitAmount.toFixed(2)} TL\n` +
      `📊 Kar Oranı: ${profitMargin}\n` +
      `🎯 Toplam Varyant: ${totalVariants}\n` +
      `✅ Stokta Olan: ${inStockVariants}\n\n` +
      `📋 Varyantlar:\n${variantList}\n\n` +
      `⚡ Shopify'a otomatik yüklendi`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('New product notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send new product notification:', error);
    }
  }

  // Send detailed price change notification
  async sendDetailedPriceChangeNotification(productName: string, variant: any, oldPrice: number, newPrice: number) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for price change notification');
      return;
    }

    const direction = newPrice > oldPrice ? '📈 ARTTI' : '📉 DÜŞTÜ';
    const difference = Math.abs(newPrice - oldPrice).toFixed(2);
    const percentage = (Math.abs(newPrice - oldPrice) / oldPrice * 100).toFixed(1);
    
    const oldSellingPrice = Math.round(oldPrice * 1.15 * 100) / 100;
    const newSellingPrice = Math.round(newPrice * 1.15 * 100) / 100;
    const oldProfit = Math.round((oldSellingPrice - oldPrice) * 100) / 100;
    const newProfit = Math.round((newSellingPrice - newPrice) * 100) / 100;

    const message = 
      `💰 FİYAT DEĞİŞİKLİĞİ ${direction}\n\n` +
      `📦 Ürün: ${productName}\n` +
      `🎯 Varyant: ${variant.color || 'Renk Yok'} - ${variant.size || 'Beden Yok'}\n` +
      `🌐 Kaynak: Trendyol\n\n` +
      `💵 ESKİ FİYATLAR:\n` +
      `   Alış: ${oldPrice.toFixed(2)} TL\n` +
      `   Satış: ${oldSellingPrice.toFixed(2)} TL\n` +
      `   Kar: ${oldProfit.toFixed(2)} TL (%15)\n\n` +
      `💵 YENİ FİYATLAR:\n` +
      `   Alış: ${newPrice.toFixed(2)} TL\n` +
      `   Satış: ${newSellingPrice.toFixed(2)} TL\n` +
      `   Kar: ${newProfit.toFixed(2)} TL (%15)\n\n` +
      `📊 Değişim: ${difference} TL (${percentage}%)\n` +
      `⚡ Shopify otomatik %15 kar marjı ile güncellendi`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Detailed price change notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send detailed price change notification:', error);
    }
  }

  // Send detailed stock change notification
  async sendDetailedStockNotification(productName: string, variant: any, stockChange: 'out' | 'back') {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for stock notification');
      return;
    }

    const originalPrice = parseFloat(variant.trendyolPrice || 0);
    const sellingPrice = originalPrice * 1.15;
    const profitAmount = sellingPrice - originalPrice;

    const statusIcon = stockChange === 'out' ? '🚨' : '✅';
    const statusText = stockChange === 'out' ? 'STOKTAN ÇIKTI' : 'STOK GERİ GELDİ';
    const stockStatus = stockChange === 'out' ? 'Tükendi' : 'Mevcut';

    const message = 
      `${statusIcon} ${statusText}\n\n` +
      `📦 Ürün: ${productName}\n` +
      `🎯 Varyant: ${variant.color || 'Renk Yok'} - ${variant.size || 'Beden Yok'}\n` +
      `🌐 Kaynak Site: Trendyol\n` +
      `📦 Stok Durumu: ${stockStatus}\n\n` +
      `💰 Fiyat Bilgileri:\n` +
      `   Alış: ${originalPrice.toFixed(2)} TL\n` +
      `   Satış: ${sellingPrice.toFixed(2)} TL\n` +
      `   Kar: ${profitAmount.toFixed(2)} TL (%15)\n\n` +
      `⚡ Shopify otomatik güncellendi`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Detailed stock notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send detailed stock notification:', error);
    }
  }

  // Send system activity notification
  async sendSystemActivity(activity: string, details?: any) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for system activity');
      return;
    }

    const timestamp = new Date().toLocaleString('tr-TR');
    let message = `🔄 SİSTEM AKTİVİTESİ\n\n${activity}\n\n🕐 Zaman: ${timestamp}`;

    if (details) {
      message += `\n\n📋 Detaylar: ${JSON.stringify(details, null, 2)}`;
    }

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('System activity notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send system activity notification:', error);
    }
  }

  // Send monitoring summary
  async sendMonitoringSummary(summary: any) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for monitoring summary');
      return;
    }

    const message = 
      `📊 İZLEME ÖZETİ\n\n` +
      `📦 Toplam Ürün: ${summary.totalProducts || 0}\n` +
      `✅ Stokta Olan: ${summary.inStockProducts || 0}\n` +
      `❌ Stokta Olmayan: ${summary.outOfStockProducts || 0}\n` +
      `💰 Fiyat Değişimi: ${summary.priceChanges || 0}\n` +
      `🔄 Son Kontrol: ${new Date().toLocaleString('tr-TR')}\n\n` +
      `⚡ Sistem aktif olarak çalışıyor`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Monitoring summary sent via Telegram');
    } catch (error) {
      console.error('Failed to send monitoring summary:', error);
    }
  }

  // Send general notification
  async sendNotification(message: string) {
    console.log('📱 Telegram notification attempt - bot:', !!this.bot, 'chatId:', !!this.chatId);
    
    if (!this.bot || !this.chatId) {
      console.log('❌ Telegram not configured - Bot token:', !!this.bot, 'Chat ID:', !!this.chatId);
      console.log('💡 Kullanıcı botla /start komutu göndermeli');
      return;
    }

    try {
      await this.bot.sendMessage(this.chatId, message, { 
        parse_mode: 'HTML',
        disable_web_page_preview: true 
      });
      console.log('✅ General notification sent via Telegram');
    } catch (error) {
      console.error('❌ Failed to send Telegram notification:', error);
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    if (!this.bot) {
      console.log('Bot not initialized');
      return false;
    }

    try {
      const me = await this.bot.getMe();
      console.log('Telegram bot test successful:', me.username);
      return true;
    } catch (error) {
      console.error('Telegram bot test failed:', error.message);
      return false;
    }
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      chatId: this.chatId,
      botConfigured: !!this.bot
    };
  }
}

// Export singleton instance
export const telegramIntegration = new TelegramIntegration();