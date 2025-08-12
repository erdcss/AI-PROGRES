import { db } from './db';
import { urlTracking, priceHistory } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { scenarioBasedScrape } from './scenario-based-scraper';

export class UrlTrackingService {
  private trackingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    console.log('🎯 URL Tracking Service başlatılıyor...');
    
    // Mevcut aktif tracking'leri yükle
    const activeTracking = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.isTracking, true));
    
    console.log(`📊 ${activeTracking.length} aktif URL takip sistemi yükleniyor...`);
    
    // Her aktif URL için tracking başlat
    for (const track of activeTracking) {
      this.startTracking(track.url, track.trackingInterval || 300);
    }
    
    this.isInitialized = true;
    console.log('✅ URL Tracking Service başlatıldı');
  }

  async addUrlToTracking(url: string, trackingInterval: number = 300, source: string = 'manual'): Promise<any> {
    try {
      console.log(`🎯 URL tracking'e ekleniyor: ${url} (source: ${source})`);
      
      // İlk extraction yap
      const extractionResult = await scenarioBasedScrape(url);
      
      if (!extractionResult.success) {
        throw new Error(`Extraction failed: ${extractionResult.error}`);
      }

      // Database'e kaydet
      const [trackedUrl] = await db
        .insert(urlTracking)
        .values({
          url,
          productTitle: extractionResult.title,
          currentPrice: extractionResult.price.original.toString(),
          originalPrice: extractionResult.price.original.toString(),
          currency: extractionResult.price.currency,
          status: 'active',
          lastChecked: new Date(),
          lastSuccessfulCheck: new Date(),
          checkCount: 1,
          isTracking: true,
          trackingInterval,
          extractedData: extractionResult
        })
        .returning()
        .onConflictDoUpdate({
          target: urlTracking.url,
          set: {
            productTitle: extractionResult.title,
            currentPrice: extractionResult.price.original.toString(),
            lastChecked: new Date(),
            lastSuccessfulCheck: new Date(),
            extractedData: extractionResult,
            status: 'active',
            isTracking: true,
            updatedAt: new Date()
          }
        });

      // Real-time tracking başlat
      this.startTracking(url, trackingInterval);
      
      console.log(`✅ URL tracking eklendi: ${extractionResult.title} - ${extractionResult.price.original} TL`);
      
      // İlk ekleme bildirimi gönder
      await this.sendTrackingStartedNotification(extractionResult, url);
      
      return {
        success: true,
        trackedUrl,
        extractionResult
      };
    } catch (error) {
      console.error(`❌ URL tracking eklenirken hata:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  startTracking(url: string, intervalSeconds: number = 300) {
    // Mevcut tracking'i durdur
    this.stopTracking(url);
    
    console.log(`🔄 Tracking başlatılıyor: ${url} (${intervalSeconds}s interval)`);
    
    const interval = setInterval(async () => {
      await this.checkUrl(url);
    }, intervalSeconds * 1000);
    
    this.trackingIntervals.set(url, interval);
  }

  stopTracking(url: string) {
    const interval = this.trackingIntervals.get(url);
    if (interval) {
      clearInterval(interval);
      this.trackingIntervals.delete(url);
      console.log(`⏹️ Tracking durduruldu: ${url}`);
    }
  }

  async checkUrl(url: string) {
    try {
      console.log(`🔍 URL kontrol ediliyor: ${url}`);
      
      // Mevcut kayıt
      const [existing] = await db
        .select()
        .from(urlTracking)
        .where(eq(urlTracking.url, url));
      
      if (!existing) {
        console.log(`❌ URL bulunamadı: ${url}`);
        return;
      }

      // Yeni extraction
      const extractionResult = await scenarioBasedScrape(url);
      
      if (!extractionResult.success) {
        console.log(`❌ Extraction failed for ${url}: ${extractionResult.error}`);
        
        // Error durumunu güncelle
        await db
          .update(urlTracking)
          .set({
            status: 'error',
            errorMessage: extractionResult.error,
            lastChecked: new Date(),
            checkCount: existing.checkCount + 1,
            updatedAt: new Date()
          })
          .where(eq(urlTracking.url, url));
        
        return;
      }

      const newPrice = extractionResult.price.original;
      const currentPrice = parseFloat(existing.currentPrice || '0');
      
      // Fiyat değişikliği var mı?
      const priceChanged = Math.abs(newPrice - currentPrice) > 0.01;
      
      if (priceChanged) {
        console.log(`💰 FIYAT DEĞİŞİKLİĞİ TESPIT EDİLDİ: ${currentPrice} TL → ${newPrice} TL`);
        
        const changePercent = currentPrice > 0 ? ((newPrice - currentPrice) / currentPrice) * 100 : 0;
        
        // Price history'ye kaydet
        await db.insert(priceHistory).values({
          variantId: existing.id, // Temporary foreign key
          oldPrice: currentPrice.toString(),
          newPrice: newPrice.toString(),
          changeType: newPrice > currentPrice ? 'increase' : 'decrease',
          changeAmount: Math.abs(newPrice - currentPrice).toString(),
          changePercentage: changePercent.toString()
        });

        // Telegram bildirimi gönder
        await this.sendPriceChangeNotification(existing, currentPrice, newPrice, changePercent);
        
        // URL tracking güncelle
        await db
          .update(urlTracking)
          .set({
            previousPrice: existing.currentPrice,
            currentPrice: newPrice.toString(),
            lastChecked: new Date(),
            lastSuccessfulCheck: new Date(),
            checkCount: existing.checkCount + 1,
            status: 'active',
            lastPriceChange: new Date(),
            priceChangePercent: changePercent.toString(),
            extractedData: extractionResult,
            updatedAt: new Date()
          })
          .where(eq(urlTracking.url, url));
        
        console.log(`📊 Fiyat güncellendi: ${existing.productTitle} - ${changePercent.toFixed(2)}% değişim`);
      } else {
        // Sadece check time güncelle
        await db
          .update(urlTracking)
          .set({
            lastChecked: new Date(),
            lastSuccessfulCheck: new Date(),
            checkCount: existing.checkCount + 1,
            status: 'active',
            extractedData: extractionResult,
            updatedAt: new Date()
          })
          .where(eq(urlTracking.url, url));
        
        console.log(`✅ URL kontrol edildi (fiyat değişmedi): ${existing.productTitle}`);
      }
      
    } catch (error) {
      console.error(`❌ URL check hatası (${url}):`, error);
      
      // Error durumunu güncelle
      await db
        .update(urlTracking)
        .set({
          status: 'error',
          errorMessage: error.message,
          lastChecked: new Date(),
          updatedAt: new Date()
        })
        .where(eq(urlTracking.url, url));
    }
  }

  async getAllTrackedUrls() {
    return await db
      .select()
      .from(urlTracking)
      .orderBy(desc(urlTracking.createdAt));
  }

  async removeUrlFromTracking(url: string) {
    this.stopTracking(url);
    
    await db
      .update(urlTracking)
      .set({
        isTracking: false,
        status: 'inactive',
        updatedAt: new Date()
      })
      .where(eq(urlTracking.url, url));
    
    console.log(`🗑️ URL tracking'den kaldırıldı: ${url}`);
  }

  async getTrackingStats() {
    const tracked = await db.select().from(urlTracking);
    
    return {
      totalUrls: tracked.length,
      activeTracking: tracked.filter(t => t.isTracking).length,
      errors: tracked.filter(t => t.status === 'error').length,
      lastHourChecks: tracked.filter(t => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return t.lastChecked && t.lastChecked > oneHourAgo;
      }).length
    };
  }

  async sendPriceChangeNotification(urlTrack: any, oldPrice: number, newPrice: number, changePercent: number) {
    try {
      const changeType = newPrice > oldPrice ? '📈 ARTIŞ' : '📉 DÜŞÜŞ';
      const changeIcon = newPrice > oldPrice ? '🔺' : '🔻';
      const priceDiff = Math.abs(newPrice - oldPrice);
      
      const message = `
🎯 <b>FİYAT DEĞİŞİKLİĞİ ALERTİ</b>

📦 <b>Ürün:</b> ${urlTrack.productTitle || 'Bilinmeyen Ürün'}

${changeIcon} <b>${changeType}</b>
💰 <b>Eski Fiyat:</b> ${oldPrice.toFixed(2)} TL
💰 <b>Yeni Fiyat:</b> ${newPrice.toFixed(2)} TL
📊 <b>Değişim:</b> ${changePercent.toFixed(2)}% (${priceDiff.toFixed(2)} TL)

🔗 <b>URL:</b> ${urlTrack.url}

⏰ <b>Tarih:</b> ${new Date().toLocaleString('tr-TR')}
      `.trim();

      // Filtered Telegram notifier kullan
      try {
        const { filteredNotifier } = await import('./filtered-telegram-notifier');
        await filteredNotifier.sendNotification(message);
        console.log('📱 Fiyat değişiklik bildirimi Telegram\'a gönderildi');
      } catch (importError) {
        console.log('📱 Telegram notifier import failed, using direct API method');
        
        // Direct API call as fallback
        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID || '1219880063';
        
        if (telegramBotToken) {
          const axios = await import('axios');
          await axios.default.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          });
          console.log('📱 Fiyat değişiklik bildirimi direkt API ile gönderildi');
        } else {
          console.log('⚠️ Telegram bot token bulunamadı, bildirim gönderilemedi');
        }
      }
      
    } catch (error) {
      console.error('❌ Telegram bildirim gönderimi hatası:', error);
    }
  }

  async sendTrackingStartedNotification(extractionResult: any, url: string) {
    try {
      const message = `
🎯 <b>YENİ ÜRÜN TAKİBE EKLENDİ</b>

📦 <b>Ürün:</b> ${extractionResult.title}
🏢 <b>Marka:</b> ${extractionResult.brand || 'Bilinmeyen Marka'}
💰 <b>Başlangıç Fiyatı:</b> ${extractionResult.price.original} TL
💵 <b>Kar Marjlı Fiyat:</b> ${extractionResult.price.withProfit} TL

🔄 <b>Takip Durumu:</b> Aktif (5 dakikada bir kontrol)
🔔 <b>Bildirimler:</b> Fiyat değişikliklerinde otomatik bildirim

🔗 <b>URL:</b> ${url}

⏰ <b>Başlangıç:</b> ${new Date().toLocaleString('tr-TR')}
      `.trim();

      try {
        const { sendFilteredTelegramNotification } = await import('./filtered-telegram-notifier');
        await sendFilteredTelegramNotification(message);
        console.log('📱 Tracking başlangıç bildirimi Telegram\'a gönderildi');
      } catch (importError) {
        console.log('📱 Telegram notifier import failed for tracking start notification');
      }
      
    } catch (error) {
      console.error('❌ Tracking başlangıç bildirimi hatası:', error);
    }
  }
}

// Singleton instance
export const urlTrackingService = new UrlTrackingService();