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

  async addUrlToTracking(url: string, trackingInterval: number = 300): Promise<any> {
    try {
      console.log(`🎯 URL tracking'e ekleniyor: ${url}`);
      
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
}

// Singleton instance
export const urlTrackingService = new UrlTrackingService();