// Filtered Telegram Notification System - Only Important Reports
import TelegramBot from 'node-telegram-bot-api';

export class FilteredTelegramNotifier {
  private bot: TelegramBot | null = null;
  private chatId: string = '1219880063';
  private isConnected: boolean = false;

  constructor() {
    this.initializeBot();
  }

  private initializeBot() {
    const token = '7687164814:AAGw-Z0yBYuyfbkA-4bIWhJg_WxxWj14hxk';
    
    if (!token) {
      console.log('Telegram bot token not found');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { 
        polling: false // Sadece mesaj gönderimi için
      });
      this.isConnected = true;
      console.log('Filtered Telegram notifier initialized');
    } catch (error) {
      console.error('Failed to initialize filtered Telegram notifier:', error);
    }
  }

  // SADECE önemli raporlar için
  async sendTaskCompletionReport(taskName: string, status: 'success' | 'error', details: string) {
    if (!this.shouldNotify() || !this.bot) return;

    const statusIcon = status === 'success' ? '✅' : '❌';
    const taskDisplayName = this.getTaskDisplayName(taskName);
    
    const message = 
      `${statusIcon} **GÖREV TAMAMLANDI**\n\n` +
      `📋 **Görev:** ${taskDisplayName}\n` +
      `🕐 **Zaman:** ${new Date().toLocaleString('tr-TR')}\n` +
      `📊 **Durum:** ${status === 'success' ? 'Başarılı' : 'Hata'}\n\n` +
      `📝 **Detaylar:**\n${details}`;

    await this.sendMessage(message);
  }

  // 23:00 Günlük Z Raporu
  async sendDailyZReport(reportData: any) {
    if (!this.shouldNotify() || !this.bot) return;

    const message = 
      `📊 **GÜNLÜK Z RAPORU**\n` +
      `📅 **Tarih:** ${new Date().toLocaleDateString('tr-TR')}\n\n` +
      `📦 **Ürün İstatistikleri:**\n` +
      `• Toplam ürün: ${reportData.totalProducts || 0}\n` +
      `• Aktif izleme: ${reportData.activeProducts || 0}\n` +
      `• Fiyat değişimi: ${reportData.priceChanges || 0}\n` +
      `• Stok değişimi: ${reportData.stockChanges || 0}\n\n` +
      `💰 **Finansal Özet:**\n` +
      `• Toplam kar marjı: ${reportData.totalProfit || '0'} TL\n` +
      `• Ortalama kar oranı: %15\n\n` +
      `⚠️ **Önemli Durumlar:**\n` +
      `• Stoğu tükenen: ${reportData.outOfStock || 0}\n` +
      `• Fiyat artışı: ${reportData.priceIncreases || 0}\n` +
      `• Sistem hataları: ${reportData.errors || 0}`;

    await this.sendMessage(message);
  }

  // Sistem Hata Raporları
  async sendSystemError(error: Error, context: string) {
    if (!this.shouldNotify() || !this.bot) return;

    const message = 
      `🚨 **SİSTEM HATASI**\n\n` +
      `📍 **Konum:** ${context}\n` +
      `🕐 **Zaman:** ${new Date().toLocaleString('tr-TR')}\n` +
      `❌ **Hata:** ${error.message}\n\n` +
      `🔧 **Otomatik düzeltme deneniyor...**`;

    await this.sendMessage(message);
  }

  // Sistem Analiz Raporları
  async sendSystemAnalysis(analysisData: any) {
    if (!this.shouldNotify() || !this.bot) return;

    const message = 
      `📈 **SİSTEM ANALİZİ**\n\n` +
      `⚡ **Performans:**\n` +
      `• CPU kullanımı: ${analysisData.cpuUsage || '0'}%\n` +
      `• Hafıza kullanımı: ${analysisData.memoryUsage || '0'}%\n` +
      `• Aktif bağlantılar: ${analysisData.connections || 0}\n\n` +
      `📊 **İşlem İstatistikleri:**\n` +
      `• Başarılı işlemler: ${analysisData.successfulOperations || 0}\n` +
      `• Başarısız işlemler: ${analysisData.failedOperations || 0}\n` +
      `• Ortalama yanıt süresi: ${analysisData.avgResponseTime || '0'}ms`;

    await this.sendMessage(message);
  }

  private async sendMessage(message: string) {
    try {
      await this.bot!.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      console.log('Filtered notification sent');
    } catch (error) {
      console.error('Failed to send filtered notification:', error);
    }
  }

  private shouldNotify(): boolean {
    return this.isConnected && this.bot !== null;
  }

  private getTaskDisplayName(taskName: string): string {
    const taskNames: {[key: string]: string} = {
      'daily-monitoring': 'Günlük İzleme (12:00)',
      'daily-summary': 'Günlük Z Raporu (23:00)',
      'health-check': 'Sistem Sağlık Kontrolü (06:00)',
      'price-update': 'Fiyat Güncelleme',
      'stock-update': 'Stok Güncelleme',
      'shopify-sync': 'Shopify Senkronizasyonu'
    };
    
    return taskNames[taskName] || taskName;
  }
}

export const filteredNotifier = new FilteredTelegramNotifier();