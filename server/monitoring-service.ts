import { db } from './db';
import { urlTracking, urlPriceHistory } from '@shared/schema';
import { eq, desc, and, isNotNull, gte } from 'drizzle-orm';
import { telegramIntegration } from './telegram-integration';
import { scenarioBasedScrape } from './scenario-based-scraper';
import { ShopifyApiService } from './shopify-api-service';

export class MonitoringService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private shopifyService: ShopifyApiService | null = null;

  constructor(private checkInterval: number = 300000) {
    // Initialize Shopify service
    try {
      this.shopifyService = new ShopifyApiService();
      console.log('✅ Shopify API Service initialized for monitoring');
    } catch (error) {
      console.log('⚠️ Shopify API Service initialization failed - auto-updates disabled');
      this.shopifyService = null;
    }
  }

  // Monitoring service başlat
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Monitoring service zaten çalışıyor');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkProducts();
    }, this.checkInterval);

    console.log(`🔄 Monitoring service başlatıldı (${this.checkInterval/1000}s aralıklarla)`);
    
    // İlk kontrolü hemen başlat
    this.checkProducts();
  }

  // Monitoring service durdur
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ Monitoring service durduruldu');
  }

  // İzlenmesi gereken ürünleri kontrol et
  private async checkProducts(): Promise<void> {
    try {
      console.log('🔍 Product schedules kontrol ediliyor...');
      
      // URL tracking tablosundan tracking aktif ürünleri al
      const trackedProducts = await db
        .select()
        .from(urlTracking)
        .where(and(
          eq(urlTracking.isTracking, true),
          isNotNull(urlTracking.url)
        ))
        .limit(10);

      console.log(`🔎 DEBUG: Query returned ${trackedProducts.length} products`);
      if (trackedProducts.length > 0) {
        console.log(`🔎 DEBUG: First product - ID: ${trackedProducts[0].id}, Title: ${trackedProducts[0].productTitle}`);
      }

      if (trackedProducts.length === 0) {
        console.log('📊 No products scheduled for monitoring at this time');
        return;
      }

      console.log(`🔍 ${trackedProducts.length} ürün kontrol ediliyor...`);

      for (const product of trackedProducts) {
        await this.checkSingleProduct(product);
        
        // Rate limiting
        await this.sleep(2000);
      }

    } catch (error) {
      console.error('❌ Monitoring kontrol hatası:', error);
    }
  }

  // Tekil ürün kontrolü
  private async checkSingleProduct(trackedProduct: any): Promise<void> {
    try {
      console.log(`🔍 Kontrol ediliyor: ${trackedProduct.productTitle}`);

      const oldPrice = parseFloat(trackedProduct.currentPrice || '0');
      
      // Trendyol'dan güncel verileri çek
      const freshData = await this.scrapeProductData(trackedProduct.url);
      
      if (!freshData || !freshData.success) {
        console.log(`❌ Veri çekilemedi: ${trackedProduct.productTitle}`);
        return;
      }

      // Yeni fiyatı al
      const newPrice = parseFloat(freshData.price?.toString() || '0');
      
      // Fiyat değişikliği kontrolü
      if (oldPrice > 0 && newPrice > 0 && Math.abs(oldPrice - newPrice) > 0.01) {
        console.log(`💰 Fiyat değişikliği tespit edildi: ${trackedProduct.productTitle}`);
        console.log(`   Eski: ${oldPrice} TL → Yeni: ${newPrice} TL`);
        
        // Fiyat değişikliği hesapla
        const changePercentage = ((newPrice - oldPrice) / oldPrice) * 100;
        const isIncrease = newPrice > oldPrice;
        
        // URL tracking güncelle
        await db.update(urlTracking)
          .set({
            currentPrice: newPrice.toString(),
            lastChecked: new Date(),
            lastPriceChange: new Date(),
            priceChangePercent: changePercentage.toFixed(2)
          })
          .where(eq(urlTracking.id, trackedProduct.id));

        // Fiyat geçmişine kaydet
        await db.insert(urlPriceHistory).values({
          url: trackedProduct.url,
          price: newPrice.toString(),
          previousPrice: oldPrice.toString(),
          changeAmount: (newPrice - oldPrice).toFixed(2),
          changePercentage: changePercentage.toFixed(2),
          productTitle: trackedProduct.productTitle,
          currency: trackedProduct.currency || 'TL',
          recordedAt: new Date()
        });

        // 🔄 SHOPIFY OTOMATIK GÜNCELLEME
        if (this.shopifyService && trackedProduct.shopifyProductId) {
          try {
            console.log(`🛒 Shopify fiyat güncelleniyor: ${trackedProduct.productTitle}`);
            
            // Yeni satış fiyatı hesapla (%10 kar marjı)
            const newSellingPrice = Math.round(newPrice * 1.10 * 100) / 100;
            const oldSellingPrice = Math.round(oldPrice * 1.10 * 100) / 100;
            
            // Shopify'ı güncelle
            const updateResult = await this.updateShopifyPrice(
              trackedProduct.shopifyProductId,
              trackedProduct.shopifyVariantIds,
              newSellingPrice,
              newPrice // compare_at_price (Trendyol orijinal fiyat)
            );
            
            if (updateResult.success) {
              console.log(`✅ Shopify fiyat güncellendi: ${oldSellingPrice} TL → ${newSellingPrice} TL`);
              
              // Shopify sync bilgisi kaydet
              await db.update(urlTracking)
                .set({
                  lastShopifySyncAt: new Date(),
                  syncStatus: 'synced'
                })
                .where(eq(urlTracking.id, trackedProduct.id));
            } else {
              console.error(`❌ Shopify fiyat güncelleme hatası: ${updateResult.error}`);
              await db.update(urlTracking)
                .set({
                  syncStatus: 'failed',
                  syncErrors: updateResult.error
                })
                .where(eq(urlTracking.id, trackedProduct.id));
            }
          } catch (shopifyError) {
            console.error(`❌ Shopify güncelleme hatası:`, shopifyError);
          }
        }

        // Telegram bildirimi gönder
        await telegramIntegration.sendPriceChangeNotification(
          trackedProduct.productTitle,
          oldPrice,
          newPrice
        );
      } else {
        // Fiyat değişmedi, sadece lastChecked güncelle
        await db.update(urlTracking)
          .set({
            lastChecked: new Date()
          })
          .where(eq(urlTracking.id, trackedProduct.id));
        
        console.log(`✅ URL kontrol edildi (fiyat değişmedi): ${trackedProduct.productTitle}`);
      }

    } catch (error) {
      console.error(`❌ ${trackedProduct.productTitle} kontrol hatası:`, error);
    }
  }

  // Trendyol'dan ürün verilerini çek
  private async scrapeProductData(url: string): Promise<any> {
    try {
      return await scenarioBasedScrape(url);
    } catch (error) {
      console.error('Scraping hatası:', error);
      return null;
    }
  }

  // Yeni ürün izlemeye ekle
  async addProductToMonitoring(productUrl: string): Promise<boolean> {
    try {
      console.log(`📥 URL monitoring'e ekleniyor: ${productUrl}`);
      
      // Önce ürünü scrape et
      const productData = await this.scrapeProductData(productUrl);
      if (!productData || !productData.success) {
        console.log('❌ Ürün verisi alınamadı, izlemeye eklenemedi');
        return false;
      }

      const currentPrice = parseFloat(productData.price?.toString() || '0');

      // URL tracking tablosuna ekle
      const existing = await db.select()
        .from(urlTracking)
        .where(eq(urlTracking.url, productUrl))
        .limit(1);

      if (existing.length > 0) {
        // Güncelle - tracking aktif yap
        await db.update(urlTracking)
          .set({
            isTracking: true,
            lastChecked: new Date()
          })
          .where(eq(urlTracking.id, existing[0].id));
        
        console.log(`✅ URL tracking güncellendi: ${productData.title}`);
      } else {
        // Yeni kayıt
        await db.insert(urlTracking).values({
          url: productUrl,
          productTitle: productData.title || 'Unknown',
          brand: productData.brand || '',
          currentPrice: currentPrice.toString(),
          originalPrice: currentPrice.toString(),
          currency: 'TL',
          isTracking: true,
          trackingInterval: 300, // 5 dakika
          lastChecked: new Date(),
          status: 'active'
        });
        
        console.log(`✅ URL monitoring'e eklendi: ${productData.title}`);
      }

      return true;

    } catch (error) {
      console.error('Ürün izlemeye ekleme hatası:', error);
      return false;
    }
  }

  // Ürünü izlemeden çıkar
  async removeProductFromMonitoring(productId: number): Promise<boolean> {
    try {
      await db.update(urlTracking)
        .set({ isTracking: false })
        .where(eq(urlTracking.id, productId));
      
      console.log(`⏹️ Ürün izlemeden çıkarıldı (ID: ${productId})`);
      return true;
    } catch (error) {
      console.error('Ürün izlemeden çıkarma hatası:', error);
      return false;
    }
  }

  // Monitoring istatistikleri
  async getMonitoringStats(): Promise<any> {
    try {
      const allTracked = await db.select()
        .from(urlTracking)
        .where(isNotNull(urlTracking.url));

      const activeMonitored = await db.select()
        .from(urlTracking)
        .where(and(
          eq(urlTracking.isTracking, true),
          isNotNull(urlTracking.url)
        ));

      // Son 7 gün içindeki fiyat değişiklikleri
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentChanges = await db.select()
        .from(urlTracking)
        .where(and(
          isNotNull(urlTracking.lastPriceChange),
          gte(urlTracking.lastPriceChange, sevenDaysAgo)
        ));
      
      return {
        totalProducts: allTracked.length,
        monitoredProducts: activeMonitored.length,
        recentPriceChanges: recentChanges.length,
        isRunning: this.isRunning,
        checkInterval: this.checkInterval,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      console.error('Monitoring stats hatası:', error);
      return {
        totalProducts: 0,
        monitoredProducts: 0,
        recentPriceChanges: 0,
        isRunning: this.isRunning,
        checkInterval: this.checkInterval,
        lastCheck: null
      };
    }
  }

  // Shopify fiyat güncelleme fonksiyonu
  private async updateShopifyPrice(
    productId: string,
    variantIds: string | null,
    newPrice: number,
    compareAtPrice: number
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.shopifyService) {
      return { success: false, error: 'Shopify service not initialized' };
    }

    try {
      // Variant ID'leri parse et
      const variantIdList = variantIds ? variantIds.split(',').map(id => id.trim()) : [];
      
      if (variantIdList.length === 0) {
        return { success: false, error: 'No variant IDs found' };
      }

      // Her variant için fiyat güncelle
      for (const variantId of variantIdList) {
        try {
          await this.shopifyService['makeRequest'](
            `variants/${variantId}.json`,
            'PUT',
            {
              variant: {
                id: parseInt(variantId),
                price: newPrice.toFixed(2),
                compare_at_price: compareAtPrice.toFixed(2)
              }
            }
          );
          console.log(`✅ Variant ${variantId} fiyat güncellendi: ${newPrice} TL`);
        } catch (variantError) {
          console.error(`❌ Variant ${variantId} güncelleme hatası:`, variantError);
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  // Utility: sleep function
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const monitoringService = new MonitoringService(300000); // 5 dakika
