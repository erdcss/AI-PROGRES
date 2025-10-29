import { db } from './db';
import { urlTracking, urlPriceHistory } from '@shared/schema';
import { eq, desc, and, isNotNull, gte } from 'drizzle-orm';
import { telegramIntegration } from './telegram-integration';
import { telegramGateway } from './telegram-notification-gateway';
import { scenarioBasedScrape } from './scenario-based-scraper';
import { ShopifyApiService } from './shopify-api-service';
import { VariantTrackingService } from './variant-tracking-service';
import { shopifySyncManager } from './shopify-sync-manager';
import type { VariantInfo } from './variant-tracking-service';

export class MonitoringService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private shopifyService: ShopifyApiService | null = null;
  private variantTracker: VariantTrackingService;

  constructor(private checkInterval: number = 300000) {
    // Initialize Shopify service
    try {
      this.shopifyService = new ShopifyApiService();
      console.log('✅ Shopify API Service initialized for monitoring');
    } catch (error) {
      console.log('⚠️ Shopify API Service initialization failed - auto-updates disabled');
      this.shopifyService = null;
    }

    // Initialize Variant Tracker
    this.variantTracker = new VariantTrackingService(telegramIntegration);
    console.log('✅ Variant Tracking Service initialized');
    console.log('🤖 ShopifySyncManager initialized for autonomous synchronization');
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
        
        // 🚨 RATE LIMITING: 5-10 second delay between products to prevent blocking
        const delay = 5000 + Math.random() * 5000; // Random 5-10 seconds
        console.log(`⏱️ Waiting ${Math.round(delay/1000)}s before next product...`);
        await this.sleep(delay);
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
      
      // 🔄 RETRY MECHANISM: Try up to 3 times with exponential backoff
      let freshData = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries && (!freshData || !freshData.success)) {
        if (retryCount > 0) {
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // 2s, 4s, 8s
          console.log(`🔄 Retry ${retryCount}/${maxRetries} after ${backoffDelay}ms for: ${trackedProduct.productTitle}`);
          await this.sleep(backoffDelay);
        }
        
        // Trendyol'dan güncel verileri çek
        freshData = await this.scrapeProductData(trackedProduct.url);
        retryCount++;
      }
      
      if (!freshData || !freshData.success) {
        console.log(`❌ Veri çekilemedi (${maxRetries} deneme sonrası): ${trackedProduct.productTitle}`);
        
        // Update last checked time even on failure
        await db.update(urlTracking)
          .set({ lastChecked: new Date() } as any)
          .where(eq(urlTracking.id, trackedProduct.id));
        
        return;
      }
      
      console.log(`✅ Veri başarıyla çekildi (${retryCount} deneme): ${trackedProduct.productTitle}`);

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
          } as any)
          .where(eq(urlTracking.id, trackedProduct.id));

        // 🔗 SYNC: Update products table to maintain FK integrity
        try {
          const { urlTrackingService } = await import('./url-tracking-service');
          await urlTrackingService.syncProductFromUrlTracking(trackedProduct.id);
          console.log(`🔗 Products table synced for tracking ID ${trackedProduct.id}`);
        } catch (syncError) {
          console.error('⚠️ Products sync failed (non-critical):', syncError);
        }

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
        } as any);

        // 🤖 AUTONOMOUS SYNC: Price change detected, trigger Shopify sync
        if (trackedProduct.shopifyProductId) {
          try {
            console.log('\n🤖 AUTONOMOUS SYNC: Price change detected, triggering Shopify sync...');
            
            const syncResult = await shopifySyncManager.processChanges(trackedProduct.id, {
              priceChange: {
                oldPrice,
                newPrice,
                changeType: isIncrease ? 'increase' : 'decrease',
                changePercentage
              }
            });
            
            if (syncResult.success) {
              console.log(`✅ Shopify price sync completed: ${syncResult.changes} changes applied`);
              
              // Update sync status
              await db.update(urlTracking)
                .set({
                  lastShopifySyncAt: new Date(),
                  syncStatus: 'synced'
                } as any)
                .where(eq(urlTracking.id, trackedProduct.id));
            } else {
              console.error(`❌ Shopify price sync failed with ${syncResult.errors} errors`);
              
              await db.update(urlTracking)
                .set({
                  syncStatus: 'failed',
                  syncErrors: `Price sync failed with ${syncResult.errors} errors`
                } as any)
                .where(eq(urlTracking.id, trackedProduct.id));
              
              // Send Telegram error notification via gateway
              await telegramGateway.sendShopifySyncError(
                trackedProduct.productTitle || 'Unknown',
                trackedProduct.id,
                'price_update',
                `Price sync failed with ${syncResult.errors} errors`
              );
            }
          } catch (syncError) {
            console.error('❌ Shopify price sync error:', syncError);
            
            // Send Telegram error notification via gateway
            await telegramGateway.sendShopifySyncError(
              trackedProduct.productTitle || 'Unknown',
              trackedProduct.id,
              'price_update',
              (syncError as Error).message
            );
          }
        }

        // Send price change notification via gateway (with deduplication & filtering)
        const shopifyUpdated = trackedProduct.shopifyProductId ? true : false;
        await telegramGateway.sendPriceChange(
          trackedProduct.productTitle || 'Unknown',
          trackedProduct.id,
          oldPrice,
          newPrice,
          shopifyUpdated
        );
      } else {
        // Fiyat değişmedi, sadece lastChecked güncelle
        await db.update(urlTracking)
          .set({
            lastChecked: new Date()
          } as any)
          .where(eq(urlTracking.id, trackedProduct.id));
        
        // 🔗 SYNC: Update products table even when price unchanged (ensures consistency)
        try {
          const { urlTrackingService } = await import('./url-tracking-service');
          await urlTrackingService.syncProductFromUrlTracking(trackedProduct.id);
        } catch (syncError) {
          console.error('⚠️ Products sync failed (non-critical):', syncError);
        }
        
        console.log(`✅ URL kontrol edildi (fiyat değişmedi): ${trackedProduct.productTitle}`);
      }

      // 🧩 VARIANT TRACKING - Varyant değişikliklerini tespit et
      if (freshData.variants?.allVariants && Array.isArray(freshData.variants.allVariants)) {
        const allVariants = freshData.variants.allVariants;
        console.log(`🧩 VARIANT TRACKING: Checking ${allVariants.length} variants`);

        // Convert scraped variants to VariantInfo format
        const currentVariants: VariantInfo[] = allVariants.map((v: any) => ({
          color: v.color || 'Standart',
          size: v.size || 'Tek Beden',
          sku: v.sku || undefined,
          trendyolPrice: v.trendyolPrice ?? newPrice,
          shopifyPrice: v.shopifyPrice ?? Math.round(newPrice * 1.10 * 100) / 100,
          stockCount: v.stockCount ?? 0,
          inStock: v.inStock ?? true
        }));

        // Track variant changes (compares with database, records changes, sends Telegram)
        const comparisonResult = await this.variantTracker.trackVariants(
          trackedProduct.id,
          trackedProduct.productTitle,
          currentVariants
        );

        // Filter out-of-stock variants for Shopify sync
        const { available, outOfStock } = this.variantTracker.filterInStockVariants(currentVariants);
        console.log(`📊 Variant Summary: ${available.length} available, ${outOfStock.length} out-of-stock (excluded from Shopify)`);

        // 🤖 AUTONOMOUS SYNC: Apply changes to Shopify if any changes detected
        if (comparisonResult && (comparisonResult.addedVariants.length > 0 || comparisonResult.removedVariants.length > 0 || comparisonResult.stockChanges.length > 0)) {
          console.log('\n🤖 AUTONOMOUS SYNC: Changes detected, triggering Shopify sync...');
          try {
            // Convert comparison result to variant changes for sync manager
            const variantChanges = [
              ...comparisonResult.addedVariants.map((v: any) => ({ changeType: 'variant_added' as const, ...v })),
              ...comparisonResult.removedVariants.map((v: any) => ({ changeType: 'variant_removed' as const, ...v })),
              ...comparisonResult.stockChanges.map((v: any) => ({ changeType: 'variant_stock_changed' as const, ...v }))
            ];
            
            const syncResult = await shopifySyncManager.processChanges(trackedProduct.id, {
              variantChanges: variantChanges as any
            });
            
            if (syncResult.success) {
              console.log(`✅ Shopify sync completed: ${syncResult.changes} changes applied`);
            } else {
              console.error(`❌ Shopify sync failed with ${syncResult.errors} errors`);
              // Send Telegram error notification via gateway
              await telegramGateway.sendShopifySyncError(
                trackedProduct.productTitle || 'Unknown',
                trackedProduct.id,
                'variant_sync',
                `Variant sync failed with ${syncResult.errors} errors`
              );
            }
          } catch (syncError) {
            console.error('❌ Shopify sync error:', syncError);
            // Send Telegram error notification via gateway
            await telegramGateway.sendShopifySyncError(
              trackedProduct.productTitle || 'Unknown',
              trackedProduct.id,
              'variant_sync',
              (syncError as Error).message
            );
          }
        } else {
          console.log('ℹ️ No variant changes detected, skipping Shopify sync');
        }
      } else {
        console.log(`ℹ️ No variants found for ${trackedProduct.productTitle} (single-variant product)`);
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
          } as any)
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
        } as any);
        
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
        .set({ isTracking: false } as any)
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
