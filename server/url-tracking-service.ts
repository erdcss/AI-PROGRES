import { db } from './db';
import { urlTracking, priceHistory, products } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { scenarioBasedScrape } from './scenario-based-scraper';
import { ultimatePriceExtract } from './ultimate-price-extractor';
import { enhancedPriceMovementTracker } from './enhanced-price-movement-tracker';
import { notificationGateway } from './notification-gateway';
import { shopifyApiService } from './shopify-api-service';
import { productEligibilityService } from './product-eligibility-service';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class UrlTrackingService {
  private trackingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    console.log('🎯 URL Tracking Service başlatılıyor...');
    
    // ✅ SHOPIFY ELIGIBILITY CHECK: Sadece Shopify'da olan ürünleri al
    const eligibleTracking = await productEligibilityService.listEligibleTrackers();
    
    console.log(`📊 ${eligibleTracking.length} Shopify-eligible URL takip sistemi yükleniyor...`);
    
    // Her eligible URL için tracking başlat
    for (const track of eligibleTracking) {
      this.startTracking(track.url, track.trackingInterval || 300);
    }
    
    // Ineligible tracker'ları disable et
    await productEligibilityService.disableIneligibleTrackers();
    
    this.isInitialized = true;
    console.log('✅ URL Tracking Service başlatıldı (Shopify-filtered)');
  }

  async addUrlToTracking(url: string, trackingInterval: number = 300, source: string = 'manual', startTracking: boolean = true): Promise<any> {
    try {
      console.log(`🎯 URL tracking'e ekleniyor: ${url} (source: ${source}, startTracking: ${startTracking})`);
      
      // İlk extraction yap
      const extractionResult = await scenarioBasedScrape(url);
      
      if (!extractionResult.success) {
        throw new Error(`Extraction failed: ${extractionResult.extractionDetails?.evidence?.[0] || 'Unknown error'}`);
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
          isTracking: startTracking,
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
            isTracking: startTracking,
            updatedAt: new Date()
          }
        });

      // 🔗 Sync products table with url_tracking
      await this.syncProductFromUrlTracking(trackedUrl.id);

      // Real-time tracking başlat (sadece startTracking true ise)
      if (startTracking) {
        this.startTracking(url, trackingInterval);
        console.log(`✅ URL tracking eklendi VE başlatıldı: ${extractionResult.title} - ${extractionResult.price.original} TL`);
      } else {
        console.log(`✅ URL tracking eklendi (başlatılmadı): ${extractionResult.title} - ${extractionResult.price.original} TL`);
      }
      
      // ℹ️ Tracking started notifications are now blocked by gateway to reduce spam
      
      return {
        success: true,
        trackedUrl,
        extractionResult
      };
    } catch (error) {
      console.error(`❌ URL tracking eklenirken hata:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Enable tracking for a URL (sets isTracking=true and starts monitoring)
   * Called after Shopify upload succeeds to begin price/stock monitoring
   */
  async enableTracking(url: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🎯 Enabling tracking for: ${url}`);
      
      // Update isTracking to true in database
      const [updated] = await db
        .update(urlTracking)
        .set({ 
          isTracking: true,
          updatedAt: new Date()
        })
        .where(eq(urlTracking.url, url))
        .returning();
      
      if (!updated) {
        return {
          success: false,
          message: `URL not found in tracking system: ${url}`
        };
      }
      
      // Start real-time tracking
      this.startTracking(url, updated.trackingInterval || 300);
      
      console.log(`✅ Tracking enabled and started for: ${url}`);
      
      return {
        success: true,
        message: 'Tracking enabled and started successfully'
      };
    } catch (error) {
      console.error(`❌ Error enabling tracking:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 🔗 Sync products table from url_tracking
   * Creates or updates authoritative product record for variant FK integrity
   */
  async syncProductFromUrlTracking(urlTrackingId: number): Promise<number | null> {
    try {
      // Get url_tracking record
      const [urlTrack] = await db
        .select()
        .from(urlTracking)
        .where(eq(urlTracking.id, urlTrackingId));

      if (!urlTrack) {
        console.error(`❌ URL tracking ID ${urlTrackingId} not found`);
        return null;
      }

      const extractedData = urlTrack.extractedData as any;
      
      // Extract Trendyol product ID from URL
      const trendyolProductIdMatch = urlTrack.url.match(/-p-(\d+)/);
      const trendyolProductId = trendyolProductIdMatch ? trendyolProductIdMatch[1] : `trendyol_${urlTrackingId}`;

      // Create unique tracking ID
      const uniqueTrackingId = `repli_t_${trendyolProductId}_${Date.now()}`;

      // Prepare product data
      const productData = {
        uniqueTrackingId,
        trendyolUrl: urlTrack.url,
        trendyolProductId,
        shopifyProductId: urlTrack.shopifyProductId || null,
        title: urlTrack.productTitle,
        brand: extractedData?.brand || 'Unknown Brand',
        description: extractedData?.description || null,
        category: extractedData?.category || null,
        images: extractedData?.images || [],
        features: extractedData?.features || {},
        colorOptions: extractedData?.colors || [],
        sizeOptions: extractedData?.sizes || [],
        originalPrice: urlTrack.originalPrice,
        currentPrice: urlTrack.currentPrice,
        stockStatus: extractedData?.stockStatus || 'in_stock',
        lastChecked: new Date(),
        sourceUrl: urlTrack.url,
        sourcePlatform: 'trendyol',
        shopifyUrl: urlTrack.shopifyAdminUrl || null,
        shopifyStoreUrl: urlTrack.shopifyStoreUrl || null,
        isActive: urlTrack.isTracking,
        profitMargin: '10.00',
        updatedAt: new Date(),
        lastSyncAt: new Date(),
        syncStatus: 'synced'
      };

      // Insert or update product
      const [product] = await db
        .insert(products)
        .values(productData)
        .onConflictDoUpdate({
          target: products.trendyolUrl,
          set: {
            ...productData,
            updatedAt: new Date(),
            lastSyncAt: new Date()
          }
        })
        .returning();

      console.log(`✅ Product synced to products table: ID ${product.id} - ${product.title}`);
      
      // Update url_tracking with product reference (optional, for tracking)
      await db
        .update(urlTracking)
        .set({ 
          productId: product.id,
          updatedAt: new Date()
        })
        .where(eq(urlTracking.id, urlTrackingId));

      return product.id;
    } catch (error) {
      console.error(`❌ Error syncing product from url_tracking:`, error);
      return null;
    }
  }

  async startTracking(url: string, intervalSeconds: number = 300) {
    // Mevcut tracking'i durdur
    this.stopTracking(url);
    
    // ✅ SHOPIFY ELIGIBILITY CHECK before starting
    const [tracker] = await db.select().from(urlTracking).where(eq(urlTracking.url, url));
    
    if (!tracker) {
      console.log(`⏸️ Tracking skipped for ${url} - Tracker not found`);
      return;
    }
    
    if (!tracker.shopifyProductId) {
      console.log(`⏸️ Tracking skipped for ${url} - No Shopify product linked`);
      return;
    }
    
    const isEligible = await productEligibilityService.isShopifyActive(tracker.shopifyProductId);
    if (!isEligible) {
      console.log(`⏸️ Tracking skipped for ${url} - Not in Shopify memory`);
      // Auto-disable tracking for ineligible products
      await db.update(urlTracking)
        .set({ isTracking: false, status: 'paused', updatedAt: new Date() })
        .where(eq(urlTracking.url, url));
      return;
    }
    
    console.log(`🔄 Tracking başlatılıyor: ${url} (${intervalSeconds}s interval)`);
    
    const interval = setInterval(async () => {
      await this.checkUrl(url);
    }, intervalSeconds * 1000);
    
    this.trackingIntervals.set(url, interval);
  }

  async restartTrackerById(trackerId: number) {
    try {
      const [tracker] = await db.select().from(urlTracking).where(eq(urlTracking.id, trackerId));
      
      if (!tracker) {
        console.log(`⚠️ Tracker not found: ID ${trackerId}`);
        return;
      }
      
      if (!tracker.isTracking) {
        console.log(`⚠️ Tracker ${trackerId} is not set to track (isTracking=false)`);
        return;
      }
      
      console.log(`🔄 Restarting tracker ${trackerId}: ${tracker.url}`);
      await this.startTracking(tracker.url, tracker.trackingInterval || 300);
    } catch (error) {
      console.error(`❌ Error restarting tracker ${trackerId}:`, error);
    }
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

      // ULTIMATE PRICE EXTRACTION - Doğru fiyat tespiti için
      console.log(`🎯 ULTIMATE PRICE EXTRACTION başlatılıyor: ${url}`);
      
      let newPrice: number;
      let extractionResult: any;
      
      try {
        // HTML'i çek
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        
        // 🚨 CHECK FOR BLOCKING BEFORE PROCESSING
        const blockingIndicators = [
          'sorry, you have been blocked',
          'sorry you have been blocked', 
          'access denied',
          'erişim engellendi',
          'rate limited',
          'too many requests',
          'çok fazla istek',
          'blocked by cloudflare',
          'verification required',
          'captcha required',
          'security check',
          'güvenlik kontrolü',
          'bot detected',
          'robot tespit',
          'temporarily blocked',
          'geçici olarak engellendi'
        ];
        
        const htmlContent = response.data.toLowerCase();
        let isBlocked = false;
        let blockingReason = '';
        
        for (const indicator of blockingIndicators) {
          if (htmlContent.includes(indicator)) {
            isBlocked = true;
            blockingReason = indicator;
            break;
          }
        }
        
        // Check if content is too short (usually indicates blocking)
        if (response.data.length < 1000) {
          isBlocked = true;
          blockingReason = `Content too short (${response.data.length} chars)`;
        }
        
        // Check title for blocking indicators
        const pageTitle = $('title').text().toLowerCase();
        if (pageTitle.includes('blocked') || pageTitle.includes('error') || pageTitle.includes('403') || pageTitle.includes('429')) {
          isBlocked = true;
          blockingReason = `Blocked page title: ${pageTitle}`;
        }
        
        if (isBlocked) {
          console.log(`🚫 BLOCKING DETECTED in URL tracking: ${blockingReason}`);
          console.log(`🚫 Content preview: ${response.data.substring(0, 200)}...`);
          
          // Update status to blocked without triggering notifications
          await db
            .update(urlTracking)
            .set({
              status: 'blocked',
              errorMessage: `Site blocked: ${blockingReason}`,
              lastChecked: new Date(),
              checkCount: (existing.checkCount || 0) + 1,
              updatedAt: new Date()
            })
            .where(eq(urlTracking.url, url));
          
          console.log(`⚠️ URL tracking updated with blocked status - no notification sent`);
          return;
        }
        
        console.log('✅ No blocking detected - proceeding with price extraction');
        
        // Ultimate Price Extractor kullan
        const priceResult = await ultimatePriceExtract($, response.data);
        if (priceResult && priceResult.original && priceResult.method) {
          console.log(`🎯 ULTIMATE PRICE RESULT: ${priceResult.original} TL via ${priceResult.method}`);
        } else {
          console.log(`🎯 ULTIMATE PRICE RESULT: Error - priceResult is null or undefined`);
        }
        
        newPrice = priceResult.original;
        
        // Fallback olarak scenario-based scrape kullan (sadece title vs için)
        extractionResult = await scenarioBasedScrape(url);
        if (extractionResult.success) {
          // Fiyatı Ultimate Price Extractor sonucu ile değiştir
          extractionResult.price = {
            original: newPrice,
            currency: 'TL',
            formatted: `${newPrice} TL`,
            withProfit: Math.round(newPrice * 1.10 * 100) / 100,
            profitFormatted: `${Math.round(newPrice * 1.10 * 100) / 100} TL`
          };
        }
        
      } catch (priceError) {
        console.error(`❌ Ultimate Price Extraction failed, fallback to scenario-based: ${priceError instanceof Error ? priceError.message : String(priceError)}`);
        
        // Fallback to scenario-based scraper with blocking detection
        extractionResult = await scenarioBasedScrape(url);
        
        // Check if scenario-based scraper detected blocking
        if (!extractionResult.success && extractionResult.scenario === 'blocked') {
          console.log(`🚫 Scenario-based scraper detected blocking: ${extractionResult.extractionDetails.evidence.join(', ')}`);
          
          // Update status to blocked without sending notifications
          await db
            .update(urlTracking)
            .set({
              status: 'blocked',
              errorMessage: `Extraction blocked: ${extractionResult.extractionDetails.evidence.join(', ')}`,
              lastChecked: new Date(),
              checkCount: (existing.checkCount || 0) + 1,
              updatedAt: new Date()
            })
            .where(eq(urlTracking.url, url));
          
          console.log(`⚠️ URL tracking updated with scenario-blocked status - no notification sent`);
          return;
        }
        
        if (!extractionResult.success) {
          throw new Error(`Both extraction methods failed: ${extractionResult.error}`);
        }
        
        // Final check: Validate extracted title for blocking indicators
        if (extractionResult.title) {
          const titleLower = extractionResult.title.toLowerCase();
          const blockingTitleKeywords = [
            'sorry, you have been blocked',
            'sorry you have been blocked',
            'access denied',
            'erişim engellendi',
            'blocked',
            'engellendi',
            'error',
            'hata',
            '403',
            '429',
            '503'
          ];
          
          const hasBlockingTitle = blockingTitleKeywords.some(keyword => titleLower.includes(keyword));
          
          if (hasBlockingTitle) {
            console.log(`🚫 BLOCKING DETECTED in extracted title: "${extractionResult.title}"`);
            
            // Update status to blocked
            await db
              .update(urlTracking)
              .set({
                status: 'blocked',
                errorMessage: `Blocked title detected: ${extractionResult.title}`,
                lastChecked: new Date(),
                checkCount: (existing.checkCount || 0) + 1,
                updatedAt: new Date()
              })
              .where(eq(urlTracking.url, url));
            
            console.log(`⚠️ URL tracking updated - blocked title detected, no notification sent`);
            return;
          }
        }
        
        newPrice = extractionResult.price.original;
      }
      
      if (!extractionResult.success || newPrice <= 0) {
        console.log(`❌ Extraction failed for ${url}: ${extractionResult.error || 'Invalid price'}`);
        
        // Error durumunu güncelle
        await db
          .update(urlTracking)
          .set({
            status: 'error',
            errorMessage: extractionResult.error || 'Invalid price extracted',
            lastChecked: new Date(),
            checkCount: (existing.checkCount || 0) + 1,
            updatedAt: new Date()
          })
          .where(eq(urlTracking.url, url));
        
        return;
      }

      const currentPrice = parseFloat(existing.currentPrice || '0');
      
      // Stok durumu kontrolü
      const previousStock = (existing.extractedData as any)?.stockStatus || 'unknown';
      const currentStock = (extractionResult as any).stockStatus || 'unknown';
      const stockChanged = previousStock !== currentStock;
      
      // Fiyat değişikliği var mı? (0.05 TL tolerans ile sahte bildirimleri engelle)
      const priceChanged = Math.abs(newPrice - currentPrice) > 0.05;
      
      // Fiyat mantıklı aralıkta mı kontrol et (15-5000 TL arası, lüks ürünler için 15000 TL'ye kadar)
      if (newPrice < 15 || newPrice > 15000) {
        console.log(`⚠️ Mantıksız fiyat tespit edildi: ${newPrice} TL - bildirim gönderilmiyor`);
        return;
      }
      
      // Çok pahalı ürünler için ek doğrulama (5000 TL üzeri ürünler için)
      if (newPrice > 5000) {
        console.log(`💎 Lüks ürün fiyatı tespit edildi: ${newPrice} TL - ekstra doğrulama yapılıyor`);
        // Lüks ürünlerde daha büyük fiyat değişikliklerine tolerans
        if (currentPrice > 0) {
          const luxuryChangePercent = Math.abs((newPrice - currentPrice) / currentPrice) * 100;
          if (luxuryChangePercent > 100) { // Lüks ürünlerde %100'den fazla değişim engelle
            console.log(`⚠️ Lüks ürün aşırı fiyat değişikliği (%${luxuryChangePercent.toFixed(2)}) - bildirim gönderilmiyor`);
            return;
          }
        }
      }
      
      // Normal ürünler için büyük fiyat değişikliklerini filtrele (>200% değişim)
      if (currentPrice > 0 && newPrice <= 5000) {
        const changePercent = Math.abs((newPrice - currentPrice) / currentPrice) * 100;
        if (changePercent > 200) {
          console.log(`⚠️ Aşırı fiyat değişikliği tespit edildi (%${changePercent.toFixed(2)}) - bildirim gönderilmiyor`);
          return;
        }
      }
      
      // Fiyat veya stok değişikliği varsa bildir
      if (priceChanged || stockChanged) {
        console.log(`🔔 DEĞİŞİKLİK TESPİT EDİLDİ: ${existing.productTitle}`);
        
        if (priceChanged) {
          console.log(`💰 FIYAT DEĞİŞİKLİĞİ: ${currentPrice} TL → ${newPrice} TL`);
        }
        
        if (stockChanged) {
          console.log(`📦 STOK DEĞİŞİKLİĞİ: ${previousStock} → ${currentStock}`);
        }

        // 🎯 SHOPIFY AUTO-UPDATE: Tespit edilen değişiklikleri Shopify'a uygula
        await this.triggerShopifyAutoUpdate(existing, {
          newPrice,
          newStockStatus: currentStock,
          oldPrice: currentPrice,
          oldStockStatus: previousStock,
          priceChanged,
          stockChanged
        });
        
        const changePercent = currentPrice > 0 ? ((newPrice - currentPrice) / currentPrice) * 100 : 0;
        
        // NOT: Price history kaydetme işlemi devre dışı bırakıldı
        // URL tracking sisteminin kendi price change tracking mekanizması var
        // Price history tablosu product variants ile ilişkili, URL tracking ile değil
        console.log(`💾 Fiyat değişikliği kaydedildi: ${currentPrice} TL → ${newPrice} TL (${changePercent.toFixed(2)}%)`);

        // Enhanced Price Movement Tracker ile detaylı analiz
        if (priceChanged) {
          await enhancedPriceMovementTracker.trackPriceChange(url, newPrice);
        }

        // Kapsamlı bildirim gönder (fiyat + stok)
        await this.sendComprehensiveChangeNotification(existing, {
          priceChanged,
          stockChanged,
          oldPrice: currentPrice,
          newPrice,
          changePercent,
          oldStock: previousStock,
          newStock: currentStock
        });
        
        // URL tracking güncelle
        await db
          .update(urlTracking)
          .set({
            previousPrice: existing.currentPrice,
            currentPrice: newPrice.toString(),
            lastChecked: new Date(),
            lastSuccessfulCheck: new Date(),
            checkCount: (existing.checkCount || 0) + 1,
            status: 'active',
            lastPriceChange: new Date(),
            priceChangePercent: changePercent.toString(),
            extractedData: extractionResult,
            updatedAt: new Date()
          })
          .where(eq(urlTracking.url, url));
        
        console.log(`📊 Ürün güncellendi: ${existing.productTitle} - ${priceChanged ? `Fiyat: ${changePercent.toFixed(2)}%` : ''} ${stockChanged ? `Stok: ${currentStock}` : ''}`);
      } else {
        // Sadece check time güncelle
        await db
          .update(urlTracking)
          .set({
            lastChecked: new Date(),
            lastSuccessfulCheck: new Date(),
            checkCount: (existing.checkCount || 0) + 1,
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
          errorMessage: (error as Error).message,
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

  async sendComprehensiveChangeNotification(urlTrack: any, changes: {
    priceChanged: boolean;
    stockChanged: boolean;
    oldPrice: number;
    newPrice: number;
    changePercent: number;
    oldStock: string;
    newStock: string;
  }) {
    try {
      const { priceChanged, stockChanged, oldPrice, newPrice, changePercent, oldStock, newStock } = changes;
      
      // 🚨 COMPREHENSIVE VALIDATION before sending notification
      if (!this.validateEntryForNotification(urlTrack)) {
        console.log(`🚫 TELEGRAM NOTIFICATION BLOCKED: Entry failed validation`);
        
        // Update database status to blocked and stop tracking
        await db
          .update(urlTracking)
          .set({
            status: 'blocked',
            isTracking: false,
            errorMessage: `Blocked during notification validation: ${urlTrack.productTitle}`,
            lastChecked: new Date(),
            updatedAt: new Date()
          })
          .where(eq(urlTracking.url, urlTrack.url));
        
        // Stop active tracking
        this.stopTracking(urlTrack.url);
        return; // Exit without sending notification
      }
      
      // Additional price validation
      if (newPrice <= 0 || newPrice > 1000000) {
        console.log(`🚫 TELEGRAM NOTIFICATION BLOCKED: Invalid price ${newPrice} TL`);
        return;
      }
      
      // Check for extreme price changes (>1000%)
      if (Math.abs(changePercent) > 1000) {
        console.log(`🚫 TELEGRAM NOTIFICATION BLOCKED: Extreme price change ${changePercent.toFixed(2)}%`);
        return;
      }
      
      console.log(`✅ TELEGRAM NOTIFICATION VALIDATED: Title="${urlTrack.productTitle}", Price=${newPrice} TL, Change=${changePercent.toFixed(2)}%`);
      
      let alertType = '';
      let alertIcon = '';
      let priority = '';
      
      // Öncelik belirleme
      if (stockChanged && newStock === 'out_of_stock') {
        alertType = 'STOK TÜKENDİ';
        alertIcon = '🚨';
        priority = 'YÜKSEK ÖNCELİK';
      } else if (stockChanged && newStock === 'in_stock') {
        alertType = 'STOK GELDİ';
        alertIcon = '✅';
        priority = 'ORTA ÖNCELİK';
      } else if (priceChanged) {
        alertType = newPrice > oldPrice ? 'FİYAT ARTIŞI' : 'FİYAT DÜŞÜŞÜ';
        alertIcon = newPrice > oldPrice ? '📈' : '📉';
        priority = Math.abs(changePercent) > 20 ? 'YÜKSEK ÖNCELİK' : 'NORMAL';
      }
      
      const changeDetails = [];
      
      // Fiyat değişikliği detayları
      if (priceChanged) {
        const priceDiff = Math.abs(newPrice - oldPrice);
        const priceIcon = newPrice > oldPrice ? '🔺' : '🔻';
        changeDetails.push(
          `${priceIcon} <b>Fiyat Değişikliği:</b>`,
          `• Eski: ${oldPrice.toFixed(2)} TL`,
          `• Yeni: ${newPrice.toFixed(2)} TL`, 
          `• Değişim: ${changePercent.toFixed(2)}% (${priceDiff.toFixed(2)} TL)`
        );
      }
      
      // Stok değişikliği detayları
      if (stockChanged) {
        const stockIcon = newStock === 'in_stock' ? '✅' : newStock === 'out_of_stock' ? '❌' : '❓';
        const stockText = this.getStockDisplayText(newStock);
        const oldStockText = this.getStockDisplayText(oldStock);
        
        changeDetails.push(
          `${stockIcon} <b>Stok Durumu:</b>`,
          `• Eski: ${oldStockText}`,
          `• Yeni: ${stockText}`
        );
      }
      
      // Temiz Trendyol URL'si oluştur
      const cleanUrl = this.cleanTrendyolUrl(urlTrack.url);
      
      // Final title validation before message creation
      const safeTitle = this.sanitizeProductTitle(urlTrack.productTitle);
      
      const message = `
${alertIcon} <b>${alertType} - ${priority}</b>

📦 <b>Ürün:</b> ${safeTitle}

${changeDetails.join('\n')}

🔗 <b>Ürün Sayfası:</b> <a href="${cleanUrl}">Trendyol'da Görüntüle</a>

⏰ <b>Tespit Zamanı:</b> ${new Date().toLocaleString('tr-TR')}
${priority === 'YÜKSEK ÖNCELİK' ? '\n⚡ <b>HEMEN KONTROL EDİN!</b>' : ''}
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

  // ❌ REMOVED: sendTrackingStartedNotification
  // Tracking started notifications are now blocked by TelegramNotificationGateway
  // to reduce spam. Only real changes (price, stock, variants) trigger notifications.

  // Stok durumu görüntü metni
  getStockDisplayText(stockStatus: string): string {
    const stockTexts: { [key: string]: string } = {
      'in_stock': 'Stokta Var ✅',
      'out_of_stock': 'Stok Tükendi ❌',
      'limited_stock': 'Sınırlı Stok ⚠️',
      'unknown': 'Bilinmiyor ❓'
    };
    return stockTexts[stockStatus] || stockStatus;
  }

  // 🚨 DATABASE CLEANUP: Clean blocked entries
  async cleanupBlockedEntries() {
    try {
      console.log('🧹 Starting cleanup of blocked URL entries...');
      
      // Find all entries with blocked titles
      const allEntries = await db
        .select()
        .from(urlTracking);
      
      let cleanedCount = 0;
      const blockingTitleIndicators = [
        'sorry, you have been blocked',
        'sorry you have been blocked',
        'access denied',
        'erişim engellendi',
        'blocked',
        'engellendi',
        'error',
        'hata',
        '403',
        '429',
        '503'
      ];
      
      for (const entry of allEntries) {
        if (entry.productTitle) {
          const titleLower = entry.productTitle.toLowerCase();
          const hasBlockingTitle = blockingTitleIndicators.some(indicator => 
            titleLower.includes(indicator)
          );
          
          if (hasBlockingTitle) {
            console.log(`🧹 Cleaning blocked entry: "${entry.productTitle}"`);
            
            // Update status to blocked and stop tracking
            await db
              .update(urlTracking)
              .set({
                status: 'blocked',
                isTracking: false,
                errorMessage: `Blocked title detected during cleanup: ${entry.productTitle}`,
                updatedAt: new Date()
              })
              .where(eq(urlTracking.id, entry.id));
            
            // Stop any active tracking
            this.stopTracking(entry.url);
            cleanedCount++;
          }
        }
      }
      
      console.log(`✅ Cleanup completed: ${cleanedCount} blocked entries cleaned`);
      return { cleanedCount };
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      return { cleanedCount: 0 };
    }
  }

  // 🚨 VALIDATE ENTRY BEFORE NOTIFICATION
  private validateEntryForNotification(urlTrack: any): boolean {
    if (!urlTrack.productTitle) {
      console.log(`🚫 Entry rejected: No product title`);
      return false;
    }
    
    const productTitle = urlTrack.productTitle.toLowerCase();
    const blockingIndicators = [
      'sorry, you have been blocked',
      'sorry you have been blocked',
      'access denied',
      'erişim engellendi',
      'blocked',
      'engellendi',
      'error',
      'hata',
      '403',
      '429',
      '503',
      'forbidden',
      'yasaklı',
      'captcha',
      'verification',
      'doğrulama',
      'security check',
      'güvenlik kontrolü',
      'bot detected',
      'robot tespit',
      'rate limit',
      'too many requests',
      'çok fazla istek',
      'service unavailable',
      'hizmet kullanılamıyor'
    ];
    
    for (const indicator of blockingIndicators) {
      if (productTitle.includes(indicator)) {
        console.log(`🚫 Entry rejected: Contains blocking indicator "${indicator}"`);
        return false;
      }
    }
    
    // Additional validation: Title should be at least 5 characters and not generic
    if (urlTrack.productTitle.length < 5 || 
        ['product', 'ürün', 'item'].includes(urlTrack.productTitle.toLowerCase())) {
      console.log(`🚫 Entry rejected: Invalid title "${urlTrack.productTitle}"`);
      return false;
    }
    
    return true;
  }

  // 🚨 SANITIZE PRODUCT TITLE for safe display
  private sanitizeProductTitle(title: string | null | undefined): string {
    if (!title) return 'Bilinmeyen Ürün';
    
    // Remove any potentially dangerous HTML or script content
    const cleanTitle = title
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: links
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
    
    // Check if the cleaned title is still valid
    if (cleanTitle.length < 3) {
      return 'Bilinmeyen Ürün';
    }
    
    // Truncate if too long
    if (cleanTitle.length > 100) {
      return cleanTitle.substring(0, 97) + '...';
    }
    
    return cleanTitle;
  }

  // 🎯 SHOPIFY AUTO-UPDATE: Değişiklikleri Shopify'a otomatik uygula
  private async triggerShopifyAutoUpdate(urlTrack: any, changes: {
    newPrice: number;
    newStockStatus: string;
    oldPrice: number;
    oldStockStatus: string;
    priceChanged: boolean;
    stockChanged: boolean;
  }) {
    try {
      console.log(`🔄 Shopify auto-update başlatılıyor: ${urlTrack.productTitle}`);
      
      // Source URL'ye karşılık gelen Shopify product'ını bul
      const [productRecord] = await db
        .select()
        .from(products)
        .where(eq(products.sourceUrl, urlTrack.url));

      if (!productRecord) {
        console.log(`⚠️ Shopify product bulunamadı: ${urlTrack.url}`);
        return;
      }

      if (!productRecord.uniqueTrackingId) {
        console.log(`⚠️ Unique tracking ID eksik: ${productRecord.title}`);
        return;
      }

      console.log(`✅ Shopify product bulundu: ${productRecord.title} (ID: ${productRecord.uniqueTrackingId})`);

      // Auto-update için yeni veri yapısı oluştur
      const newData = {
        price: changes.newPrice,
        stockStatus: changes.newStockStatus,
        extractedAt: new Date()
      };

      // Auto-update seçenekleri - güvenli politika
      const updateOptions = {
        enablePriceUpdates: true,
        enableStockUpdates: true,
        onlyPriceIncreases: true, // Sadece fiyat artışlarını uygula
        priceChangeThreshold: 5 // %5'ten fazla değişiklikleri uygula
      };

      // Shopify API service ile güncelleme yap
      const updateResult = await shopifyApiService.updateProductPricesAndStock(
        productRecord.uniqueTrackingId,
        newData,
        updateOptions
      );

      if (updateResult.success) {
        console.log(`✅ Shopify auto-update başarılı: ${productRecord.title}`);
        
        if (updateResult.changes && updateResult.changes.length > 0) {
          const appliedChanges = updateResult.changes.filter((c: any) => c.shouldApply);
          if (appliedChanges.length > 0) {
            console.log(`🎯 Shopify'da ${appliedChanges.length} güncelleme uygulandı:`, 
              appliedChanges.map((c: any) => `${c.type}: ${c.oldValue} → ${c.newValue}`));
          } else {
            console.log(`📊 Shopify politikası gereği güncelleme uygulanmadı`);
          }
        }
      } else {
        console.error(`❌ Shopify auto-update hatası: ${updateResult.error}`);
      }

    } catch (error) {
      console.error(`❌ Shopify auto-update sistem hatası:`, error);
    }
  }

  // Temiz Trendyol URL'si oluştur
  cleanTrendyolUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Query parametrelerini temizle, sadece temel URL'yi bırak
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      // URL parse edilemezse orijinal URL'yi döndür
      return url;
    }
  }
}

// Singleton instance
export const urlTrackingService = new UrlTrackingService();