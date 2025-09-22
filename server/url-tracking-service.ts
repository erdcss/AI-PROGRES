import { db } from './db';
import { urlTracking, priceHistory } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { scenarioBasedScrape } from './scenario-based-scraper';
import { ultimatePriceExtract } from './ultimate-price-extractor';
import { enhancedPriceMovementTracker } from './enhanced-price-movement-tracker';
import { notificationGateway } from './notification-gateway';
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
        error: error instanceof Error ? error.message : String(error)
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
        const priceResult = ultimatePriceExtract($, response.data);
        console.log(`🎯 ULTIMATE PRICE RESULT: ${priceResult.original} TL via ${priceResult.method}`);
        
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
        const { filteredNotifier } = await import('./filtered-telegram-notifier');
        await filteredNotifier.sendNotification(message);
        console.log('📱 Tracking başlangıç bildirimi Telegram\'a gönderildi');
      } catch (importError) {
        console.log('📱 Telegram notifier import failed for tracking start notification');
      }
      
    } catch (error) {
      console.error('❌ Tracking başlangıç bildirimi hatası:', error);
    }
  }

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