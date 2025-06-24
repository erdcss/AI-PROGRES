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
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      console.log('Telegram bot token not found in environment variables');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.setupEventHandlers();
      this.isConnected = true;
      console.log('Telegram bot initialized successfully');
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

  // Send stock out notification
  async sendStockOutNotification(productName: string, variant: string) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for stock notification');
      return;
    }

    const message = 
      `🚨 STOK UYARISI\n\n` +
      `📦 Ürün: ${productName}\n` +
      `🎯 Varyant: ${variant}\n` +
      `❌ Stok durumu: Tükendi\n\n` +
      `⚡ Shopify otomatik güncellendi`;

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Stock out notification sent via Telegram');
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

  // Send general notification
  async sendNotification(message: string) {
    if (!this.bot || !this.chatId) {
      console.log('Telegram not configured for general notification');
      return;
    }

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('General notification sent via Telegram');
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    if (!this.bot) {
      return false;
    }

    try {
      const me = await this.bot.getMe();
      console.log('Telegram bot test successful:', me.username);
      return true;
    } catch (error) {
      console.error('Telegram bot test failed:', error);
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