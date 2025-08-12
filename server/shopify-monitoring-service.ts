/**
 * Shopify Monitoring Service - Anlık ürün değişiklik izleme ve bildirim sistemi
 */

import { shopifyTransferTracker } from './shopify-transfer-tracker';
import { sendFilteredTelegramNotification } from './filtered-telegram-notifier';
import cron from 'node-cron';

export class ShopifyMonitoringService {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Monitoring sistemini başlat
   */
  startMonitoring() {
    if (this.isRunning) {
      console.log('⚠️ Shopify monitoring zaten çalışıyor');
      return;
    }

    this.isRunning = true;
    console.log('🎯 Shopify monitoring service başlatılıyor...');

    // Her 5 dakikada bir kontrol et
    this.monitoringInterval = setInterval(async () => {
      await this.checkForChanges();
    }, 5 * 60 * 1000); // 5 dakika

    // Cron job ile saatlik kontroller
    cron.schedule('0 * * * *', async () => {
      console.log('🕐 Saatlik Shopify monitoring kontrolü...');
      await this.performHourlyCheck();
    });

    // Günlük rapor
    cron.schedule('0 23 * * *', async () => {
      console.log('📊 Günlük Shopify monitoring raporu...');
      await this.sendDailyReport();
    });

    console.log('✅ Shopify monitoring service başlatıldı');
  }

  /**
   * Monitoring sistemini durdur
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('⏹️ Shopify monitoring service durduruldu');
  }

  /**
   * Değişiklikleri kontrol et
   */
  private async checkForChanges() {
    try {
      console.log('🔍 Shopify ürün değişiklikleri kontrol ediliyor...');
      
      // Bekleyen bildirimleri al
      const pendingNotifications = await shopifyTransferTracker.getPendingNotifications();
      
      if (pendingNotifications.length > 0) {
        console.log(`📱 ${pendingNotifications.length} bekleyen bildirim bulundu`);
        
        for (const notification of pendingNotifications) {
          await this.sendChangeNotification(notification);
        }
      }

    } catch (error) {
      console.error('❌ Shopify monitoring kontrol hatası:', error);
    }
  }

  /**
   * Değişiklik bildirimi gönder
   */
  private async sendChangeNotification(notification: any) {
    try {
      const { change, product } = notification;
      
      if (!product || !change) {
        console.warn('⚠️ Eksik bildirim verisi');
        return;
      }

      const severityEmoji = this.getSeverityEmoji(change.severity);
      const changeTypeEmoji = this.getChangeTypeEmoji(change.changeType);
      
      const message = `
${severityEmoji} <b>SHOPIFY ÜRÜN DEĞİŞİKLİĞİ</b>

📦 <b>Ürün:</b> ${product.title}
🏢 <b>Marka:</b> ${product.brand || 'Bilinmeyen'}
${changeTypeEmoji} <b>Değişiklik Türü:</b> ${this.getChangeTypeText(change.changeType)}
📊 <b>Alan:</b> ${change.fieldName || 'Genel'}

🔸 <b>Eski Değer:</b> ${change.oldValue || 'Yok'}
🔹 <b>Yeni Değer:</b> ${change.newValue}

📈 <b>Önem Seviyesi:</b> ${this.getSeverityText(change.severity)}
🔗 <b>Kaynak URL:</b> ${product.sourceUrl}
⏰ <b>Tespit Zamanı:</b> ${new Date(change.detectedAt).toLocaleString('tr-TR')}

💰 <b>Mevcut Shopify Fiyatı:</b> ${product.shopifyPrice} TL
📊 <b>Kar Marjı:</b> %${product.profitMargin}
🎨 <b>Varyant Sayısı:</b> ${product.variantCount}
      `.trim();

      await sendFilteredTelegramNotification(message);
      
      // Bildirim gönderildi olarak işaretle
      await shopifyTransferTracker.markNotificationSent(change.id);
      
      console.log('📱 Shopify değişiklik bildirimi gönderildi:', change.changeType);
      
    } catch (error) {
      console.error('❌ Bildirim gönderme hatası:', error);
    }
  }

  /**
   * Saatlik kontrol
   */
  private async performHourlyCheck() {
    try {
      const stats = await shopifyTransferTracker.getStats();
      const recentChanges = await shopifyTransferTracker.getRecentChanges(5);
      
      if (recentChanges.length > 0) {
        const message = `
🕐 <b>SAATLİK SHOPIFY RAPORU</b>

📊 <b>Genel İstatistikler:</b>
• Toplam Ürün: ${stats.totalProducts}
• Aktif Ürün: ${stats.activeProducts}
• Takip Edilen: ${stats.trackedProducts}
• Son 24s Değişiklik: ${stats.recentChanges}

📝 <b>Son Değişiklikler (${recentChanges.length}):</b>
${recentChanges.map((item, index) => 
  `${index + 1}. ${item.product?.title?.substring(0, 30)}... - ${this.getChangeTypeText(item.change.changeType)}`
).join('\n')}

⏰ <b>Rapor Zamanı:</b> ${new Date().toLocaleString('tr-TR')}
        `.trim();

        await sendFilteredTelegramNotification(message);
      }
      
    } catch (error) {
      console.error('❌ Saatlik kontrol hatası:', error);
    }
  }

  /**
   * Günlük rapor gönder
   */
  private async sendDailyReport() {
    try {
      const stats = await shopifyTransferTracker.getStats();
      const recentChanges = await shopifyTransferTracker.getRecentChanges(10);
      
      const message = `
🌙 <b>GÜNLÜK SHOPIFY RAPORU</b>

📊 <b>Genel Özet:</b>
• Toplam Ürün: ${stats.totalProducts}
• Aktif Ürün: ${stats.activeProducts}
• Takip Edilen: ${stats.trackedProducts}
• Toplam Değişiklik: ${stats.totalChanges}
• Ortalama Fiyat: ${stats.averagePrice.toFixed(2)} TL

📈 <b>Son 24 Saat:</b>
• Değişiklik Sayısı: ${stats.recentChanges}
• En Son Değişiklikler: ${recentChanges.length}

${recentChanges.length > 0 ? `
📋 <b>Değişiklik Detayları:</b>
${recentChanges.slice(0, 5).map((item, index) => 
  `${index + 1}. ${item.product?.title?.substring(0, 25)}... - ${this.getChangeTypeText(item.change.changeType)}`
).join('\n')}
` : '✅ Son 24 saatte değişiklik yok'}

🤖 <b>Sistem Durumu:</b> Aktif ve izliyor
⏰ <b>Rapor Tarihi:</b> ${new Date().toLocaleDateString('tr-TR')}
      `.trim();

      await sendFilteredTelegramNotification(message);
      console.log('📊 Günlük Shopify raporu gönderildi');
      
    } catch (error) {
      console.error('❌ Günlük rapor hatası:', error);
    }
  }

  /**
   * Önem seviyesi emojisi
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '🔵';
    }
  }

  /**
   * Değişiklik türü emojisi
   */
  private getChangeTypeEmoji(changeType: string): string {
    switch (changeType) {
      case 'price': return '💰';
      case 'stock': return '📦';
      case 'status': return '🔄';
      case 'content': return '📝';
      case 'variant': return '🎨';
      default: return '🔧';
    }
  }

  /**
   * Önem seviyesi metni
   */
  private getSeverityText(severity: string): string {
    switch (severity) {
      case 'critical': return 'Kritik';
      case 'high': return 'Yüksek';
      case 'medium': return 'Orta';
      case 'low': return 'Düşük';
      default: return 'Bilinmeyen';
    }
  }

  /**
   * Değişiklik türü metni
   */
  private getChangeTypeText(changeType: string): string {
    switch (changeType) {
      case 'price': return 'Fiyat Değişikliği';
      case 'stock': return 'Stok Değişikliği';
      case 'status': return 'Durum Değişikliği';
      case 'content': return 'İçerik Değişikliği';
      case 'variant': return 'Varyant Değişikliği';
      default: return 'Genel Değişiklik';
    }
  }

  /**
   * Manuel ürün kontrolü
   */
  async checkSpecificProduct(productId: number) {
    try {
      console.log(`🔍 Ürün ${productId} manuel kontrol ediliyor...`);
      
      const products = await shopifyTransferTracker.getTrackedProducts(100);
      const product = products.find(p => p.id === productId);
      
      if (!product) {
        console.warn('⚠️ Ürün bulunamadı:', productId);
        return;
      }

      // Burada gerçek Shopify API'si ile karşılaştırma yapılabilir
      // Şimdilik mock değişiklik kaydedelim
      await shopifyTransferTracker.recordProductChange(productId, {
        changeType: 'status',
        fieldName: 'manual_check',
        oldValue: 'unknown',
        newValue: 'checked',
        severity: 'low',
        sourceUrl: product.sourceUrl
      });

      console.log('✅ Manuel ürün kontrolü tamamlandı');
      
    } catch (error) {
      console.error('❌ Manuel ürün kontrolü hatası:', error);
    }
  }
}

export const shopifyMonitoringService = new ShopifyMonitoringService();