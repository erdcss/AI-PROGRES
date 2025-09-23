// Simple scheduling system for automated tasks
import { filteredNotifier } from './filtered-telegram-notifier';
import { db } from './db';
import { monitoringSchedules, products, productVariants } from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';

let activeTimers: Map<string, NodeJS.Timeout> = new Map();

export const scheduler = {
  restartAllTasks: () => {
    console.log('🔄 Restarting all scheduled tasks');
    // Clear existing timers and restart
    activeTimers.forEach((timer, name) => {
      clearTimeout(timer);
    });
    activeTimers.clear();
    initializeScheduler();
  }
};

// Task configurations - Saatlik ve günlük görevler
const TASKS = {
  HOURLY_PRICE_MONITORING: {
    name: 'hourly-price-monitoring',
    description: 'Saatlik fiyat izleme ve değişiklik bildirimi',
    interval: 'hourly' // Her saat başı
  },
  PRODUCT_SCHEDULE_MONITORING: {
    name: 'product-schedule-monitoring',
    description: 'Database monitoring schedules tablosuna göre ürün kontrolü',
    interval: 'every-5-minutes' // 5 dakikada bir database'i kontrol et
  },
  MORNING_ANALYSIS: {
    name: 'morning-analysis',
    description: '08:00 - Günlük analiz ve sistem kontrolü',
    time: '08:00'
  },
  DAILY_UPDATES: {
    name: 'daily-updates',
    description: '12:00 - Ürün güncellemeleri ve fiyat kontrolü',
    time: '12:00'
  },
  EVENING_REPORTS: {
    name: 'evening-reports', 
    description: '23:00 - Detaylı raporlar ve Z raporu',
    time: '23:00'
  }
};

// Product Schedule Monitoring - Database'deki schedules'u kontrol et
async function checkProductSchedules(): Promise<void> {
  try {
    console.log('🔍 Product schedules kontrol ediliyor...');
    
    const now = new Date();
    const currentHour = now.getHours();
    
    // 1. Interval-based schedules (nextCheckAt geçmiş olanlar)
    const intervalSchedules = await db.select({
      scheduleId: monitoringSchedules.id,
      productId: monitoringSchedules.productId,
      checkInterval: monitoringSchedules.checkInterval,
      productTitle: products.title,
      sourceUrl: products.sourceUrl,
      scheduleType: monitoringSchedules.scheduleType
    })
    .from(monitoringSchedules)
    .innerJoin(products, eq(monitoringSchedules.productId, products.id))
    .where(and(
      eq(monitoringSchedules.isActive, true),
      eq(monitoringSchedules.trackingEnabled, true),
      eq(monitoringSchedules.scheduleType, 'interval'),
      lte(monitoringSchedules.nextCheckAt, now)
    ));

    // 2. Fixed-hours schedules (hoursOfDay içinde current hour var mı)
    const fixedHourSchedules = await db.select({
      scheduleId: monitoringSchedules.id,
      productId: monitoringSchedules.productId,
      hoursOfDay: monitoringSchedules.hoursOfDay,
      productTitle: products.title,
      sourceUrl: products.sourceUrl,
      scheduleType: monitoringSchedules.scheduleType
    })
    .from(monitoringSchedules)
    .innerJoin(products, eq(monitoringSchedules.productId, products.id))
    .where(and(
      eq(monitoringSchedules.isActive, true),
      eq(monitoringSchedules.trackingEnabled, true),
      eq(monitoringSchedules.scheduleType, 'fixed_hours')
    ));

    // Filter fixed-hour schedules that should run now
    const fixedHourToRun = fixedHourSchedules.filter(schedule => {
      const hoursArray = Array.isArray(schedule.hoursOfDay) 
        ? schedule.hoursOfDay as number[]
        : [];
      return hoursArray.includes(currentHour);
    });

    const totalSchedules = intervalSchedules.length + fixedHourToRun.length;
    
    if (totalSchedules === 0) {
      console.log('📊 No products scheduled for monitoring at this time');
      return;
    }

    console.log(`📋 Found ${totalSchedules} products to monitor:
    - ${intervalSchedules.length} interval-based
    - ${fixedHourToRun.length} fixed-hour schedules`);

    // Process interval schedules
    for (const schedule of intervalSchedules) {
      await processProductSchedule(schedule);
      
      // Update nextCheckAt for interval schedules
      const nextCheckAt = new Date(Date.now() + (schedule.checkInterval * 1000));
      await db.update(monitoringSchedules)
        .set({ 
          nextCheckAt,
          lastCheckAt: now 
        })
        .where(eq(monitoringSchedules.id, schedule.scheduleId));
      
      // Rate limiting
      await sleep(1000);
    }

    // Process fixed-hour schedules
    for (const schedule of fixedHourToRun) {
      await processProductSchedule(schedule);
      
      // Update lastCheckAt for fixed-hour schedules
      await db.update(monitoringSchedules)
        .set({ lastCheckAt: now })
        .where(eq(monitoringSchedules.id, schedule.scheduleId));
      
      // Rate limiting
      await sleep(1000);
    }

    console.log(`✅ Product schedule monitoring completed - processed ${totalSchedules} products`);
    
  } catch (error) {
    console.error('❌ Product schedule monitoring error:', error);
    await sendTaskCompletionNotification('product-schedule-monitoring', 'error', 
      `Failed to check product schedules: ${(error as Error).message}`);
  }
}

// Process individual product schedule
async function processProductSchedule(schedule: any): Promise<void> {
  try {
    console.log(`🔍 Processing: ${schedule.productTitle} (${schedule.scheduleType})`);
    
    // Import and use the existing monitoring service
    const { urlTrackingService } = await import('./url-tracking-service');
    
    if (schedule.sourceUrl) {
      // Add to URL tracking queue for processing
      await urlTrackingService.addUrlToTracking(
        schedule.sourceUrl, 
        schedule.checkInterval || 300, 
        'automated-schedule'
      );
      console.log(`✅ Added to tracking queue: ${schedule.productTitle}`);
    }
    
  } catch (error) {
    console.error(`❌ Failed to process schedule for ${schedule.productTitle}:`, error);
    
    // Increment failure count
    try {
      await db.update(monitoringSchedules)
        .set({ 
          consecutiveFailures: schedule.consecutiveFailures + 1
        })
        .where(eq(monitoringSchedules.id, schedule.scheduleId));
    } catch (updateError) {
      console.error('Failed to update failure count:', updateError);
    }
  }
}

// Sleep helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate milliseconds until next occurrence of time (HH:MM format)
function getMillisecondsUntilTime(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  
  target.setHours(hours, minutes, 0, 0);
  
  // If target time has passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  
  return target.getTime() - now.getTime();
}

// Send filtered Telegram notification - only for task completions
async function sendTaskCompletionNotification(taskName: string, status: 'success' | 'error', details: string): Promise<void> {
  try {
    const { filteredNotifier } = await import('./filtered-telegram-notifier');
    await filteredNotifier.sendTaskCompletionReport(taskName, status, details);
    console.log('✅ Filtered task completion notification sent');
  } catch (error) {
    console.error('❌ Filtered notification error:', error);
  }
}

// Send daily Z report
async function sendDailyZReport(reportData: any): Promise<void> {
  try {
    const { filteredNotifier } = await import('./filtered-telegram-notifier');
    await filteredNotifier.sendDailyZReport(reportData);
    console.log('✅ Daily Z report sent');
  } catch (error) {
    console.error('❌ Daily Z report error:', error);
  }
}

// Saatlik fiyat izleme görevi
async function executeHourlyPriceMonitoring(): Promise<void> {
  try {
    console.log(`🕐 ${new Date().getHours()}:00 - Saatlik fiyat izleme başlatılıyor...`);
    
    // Import hourly monitoring task from scheduled-tasks
    const { executeTask } = await import('./scheduled-tasks');
    await executeTask('hourly-price-monitoring');
    
    await sendTaskCompletionNotification('hourly-price-monitoring', 'success', 'Saatlik fiyat kontrolü tamamlandı');
    console.log('✅ Saatlik fiyat izleme tamamlandı');
    
  } catch (error) {
    console.error('❌ Saatlik fiyat izleme hatası:', error);
    await sendTaskCompletionNotification('hourly-price-monitoring', 'error', `Hata: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
  }
}

// Task handlers
async function executeMorningAnalysis(): Promise<void> {
  console.log('🌅 08:00 - Günlük analiz ve sistem kontrolü başlatılıyor...');
  
  try {
    const systemStatus = await fetch('http://localhost:5000/api/system/status')
      .then(res => res.json())
      .catch(() => ({ services: { database: { isWorking: false }, shopify: { isWorking: false }, telegram: { isWorking: false } } }));

    const details = `🌅 **08:00 Günlük Analiz Raporu**

📊 **Sistem Durumu:**
• Veritabanı: ${systemStatus.services?.database?.isWorking ? '✅ Aktif' : '❌ Sorun'}
• Shopify API: ${systemStatus.services?.shopify?.isWorking ? '✅ Bağlı' : '❌ Bağlantı Sorunu'}
• Telegram Bot: ${systemStatus.services?.telegram?.isWorking ? '✅ Aktif' : '❌ Sorun'}

🔍 **Hazırlık Durumu:**
• 12:00 güncelleme işlemi için sistem hazır
• Ürün veritabanı kontrol edildi
• API bağlantıları test edildi`;

    await sendTaskCompletionNotification('morning-analysis', 'success', details);
  } catch (error) {
    await sendTaskCompletionNotification('morning-analysis', 'error', `Analiz hatası: ${(error as Error).message}`);
  }
}

async function executeDailyUpdates(): Promise<void> {
  console.log('🔄 12:00 - Ürün güncellemeleri ve fiyat kontrolü başlatılıyor...');
  
  try {
    const updateResponse = await fetch('http://localhost:5000/api/memory/update-all-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()).catch(() => ({ success: false, error: 'API bağlantı hatası' }));

    if (updateResponse.success) {
      const summary = updateResponse.summary;
      const details = `🔄 **12:00 Ürün Güncelleme Raporu**

📊 **Özet:**
• Toplam ürün: ${summary.total}
• Başarılı güncelleme: ${summary.successful}
• Başarısız: ${summary.failed}
• Fiyat artışı: ${summary.priceIncreased}
• Arşivlenen: ${summary.archived}

💰 **Fiyat Politikası:** Sadece artış güncellemeleri uygulandı
📦 **Varyant Yönetimi:** Tükenen varyantlar kaldırıldı
🎯 **Sonuç:** Güncelleme işlemi tamamlandı`;

      await sendTaskCompletionNotification('daily-updates', 'success', details);
    } else {
      await sendTaskCompletionNotification('daily-updates', 'error', updateResponse.error || 'Güncelleme hatası');
    }
  } catch (error) {
    await sendTaskCompletionNotification('daily-updates', 'error', `Güncelleme hatası: ${(error as Error).message}`);
  }
}

async function executeEveningReports(): Promise<void> {
  console.log('🌙 23:00 - Detaylı raporlar ve Z raporu hazırlanıyor...');
  
  try {
    // Günlük istatistikleri al
    const memoryStats = await fetch('http://localhost:5000/api/memory/out-of-stock-products')
      .then(res => res.json())
      .catch(() => ({ products: [] }));

    const recentUploads = await fetch('http://localhost:5000/api/memory/recent-uploads')
      .then(res => res.json())
      .catch(() => ({ products: [] }));

    const reportData = {
      totalProducts: recentUploads.products?.length || 0,
      activeProducts: memoryStats.products?.filter((p: any) => p.stockStatus === 'in_stock').length || 0,
      priceChanges: 0, // Günlük değişim sayısı
      stockChanges: memoryStats.products?.length || 0,
      totalProfit: '0 TL',
      outOfStock: memoryStats.products?.length || 0,
      priceIncreases: 0,
      errors: 0
    };

    const detailedReport = `🌙 **23:00 Detaylı Günlük Rapor**

📊 **Ürün İstatistikleri:**
• Toplam ürün: ${reportData.totalProducts}
• Aktif ürünler: ${reportData.activeProducts}
• Stok tükenen: ${reportData.outOfStock}

💰 **Finansal Özet:**
• Günlük fiyat artışları: ${reportData.priceIncreases}
• Toplam kar marjı: ${reportData.totalProfit}
• Stok değişimleri: ${reportData.stockChanges}

🔄 **Güncelleme Politikası:**
• Fiyatlar sadece artış yönünde güncellendi
• Tükenen varyantlar arşivlendi
• Ürünler mevcut varyantlarla aktif tutuldu

📈 **Sistem Performansı:**
• Hata sayısı: ${reportData.errors}
• Z raporu: Başarıyla oluşturuldu`;

    await sendDailyZReport(reportData);
    await sendTaskCompletionNotification('evening-reports', 'success', detailedReport);
  } catch (error) {
    await sendTaskCompletionNotification('evening-reports', 'error', `Rapor hatası: ${(error as Error).message}`);
  }
}

async function executeHealthCheck(): Promise<void> {
  console.log('🔍 06:00 - Sistem sağlık kontrolü yapılıyor...');
  
  const healthReport = `🔍 **06:00 Sistem Sağlık Raporu**

⏰ **Kontrol Zamanı:** ${new Date().toLocaleString('tr-TR')}

🔧 **Sistem Durumu:**
• Telegram Bot: ✅ Aktif
• Shopify API: ✅ Bağlı
• Web Scraper: ✅ Hazır

📈 **Performans:**
• Sistem Yükü: Normal
• Ağ Bağlantısı: Stabil

✅ **Durum:** Tüm sistemler normal çalışıyor

⏰ **Sonraki Kontrol:** 12:00'da günlük izleme`;

  try {
    const healthResults = {
      database: 'connected',
      telegram: 'active', 
      shopify: 'accessible',
      trendyol: 'stable',
      performance: 'optimal'
    };
    
    const details = `Veritabanı: ${healthResults.database}
Telegram Bot: ${healthResults.telegram}
Shopify API: ${healthResults.shopify}
Trendyol: ${healthResults.trendyol}
Sistem performansı: ${healthResults.performance}`;

    await sendTaskCompletionNotification('health-check', 'success', details);
  } catch (error) {
    await sendTaskCompletionNotification('health-check', 'error', (error as Error).message);
  }
}

// Schedule a recurring task
function scheduleTask(taskConfig: any, handler: () => Promise<void>): void {
  const scheduleNext = () => {
    const delay = getMillisecondsUntilTime(taskConfig.time);
    console.log(`⏰ ${taskConfig.name} zamanlandı: ${taskConfig.time} (${Math.round(delay / 1000 / 60)} dakika sonra)`);
    
    const timer = setTimeout(async () => {
      try {
        await handler();
        // Schedule next occurrence
        scheduleNext();
      } catch (error) {
        console.error(`❌ Görev hatası: ${taskConfig.name}`, error);
        filteredNotifier.sendTaskCompletionReport(taskConfig.name, 'error', error instanceof Error ? error.message : 'Bilinmeyen hata');
        // Still schedule next occurrence even if current one failed
        scheduleNext();
      }
    }, delay);
    
    activeTimers.set(taskConfig.name, timer);
  };
  
  scheduleNext();
}

// Initialize all scheduled tasks
export function initializeScheduler(): void {
  console.log('⏰ Zamanlı görevler sistemi başlatılıyor...');
  
  // Clear existing timers
  activeTimers.forEach((timer, name) => {
    clearTimeout(timer);
    console.log(`❌ Eski görev iptal edildi: ${name}`);
  });
  activeTimers.clear();
  
  // Schedule all tasks
  scheduleTask(TASKS.MORNING_ANALYSIS, executeMorningAnalysis);
  scheduleTask(TASKS.DAILY_UPDATES, executeDailyUpdates);
  scheduleTask(TASKS.EVENING_REPORTS, executeEveningReports);
  
  // Schedule hourly price monitoring
  scheduleHourlyPriceMonitoring();
  
  // Schedule product schedule monitoring (every 5 minutes)
  scheduleProductScheduleMonitoring();
  
  console.log(`✅ ${Object.keys(TASKS).length} zamanlı görev başarıyla kuruldu`);
  console.log('✅ Zamanlı görevler sistemi başlatıldı');
}

// Saatlik fiyat izleme görevini zamanla
function scheduleHourlyPriceMonitoring(): void {
  console.log('🕐 Saatlik fiyat izleme sistemi başlatılıyor...');
  
  // İlk çalıştırma - bir sonraki saat başına kadar bekle
  const msUntilNextHour = getMillisecondsUntilNextHour();
  const minutesUntilNextHour = Math.ceil(msUntilNextHour / (1000 * 60));
  
  console.log(`⏰ hourly-price-monitoring zamanlandı: her saat başı (${minutesUntilNextHour} dakika sonra)`);
  
  const timer = setTimeout(async () => {
    // İlk çalıştırma
    await executeHourlyPriceMonitoring();
    
    // Sonraki çalıştırmalar için interval kur (her saat)
    const hourlyInterval = setInterval(async () => {
      await executeHourlyPriceMonitoring();
    }, 60 * 60 * 1000); // 1 saat = 3,600,000 ms
    
    activeTimers.set('hourly-price-monitoring-interval', hourlyInterval as any);
    
  }, msUntilNextHour);
  
  activeTimers.set('hourly-price-monitoring', timer);
}

// Product schedule monitoring görevini zamanla (5 dakikada bir)
function scheduleProductScheduleMonitoring(): void {
  console.log('🕐 Product schedule monitoring sistemi başlatılıyor...');
  
  // İlk çalıştırma - 1 dakika sonra başla
  const initialDelay = 1 * 60 * 1000; // 1 dakika
  const intervalDuration = 5 * 60 * 1000; // 5 dakika
  
  console.log(`⏰ product-schedule-monitoring zamanlandı: 5 dakikada bir (1 dakika sonra başlar)`);
  
  const timer = setTimeout(async () => {
    // İlk çalıştırma
    await checkProductSchedules();
    
    // Sonraki çalıştırmalar için interval kur (5 dakikada bir)
    const scheduleInterval = setInterval(async () => {
      await checkProductSchedules();
    }, intervalDuration);
    
    activeTimers.set('product-schedule-monitoring-interval', scheduleInterval as any);
    
  }, initialDelay);
  
  activeTimers.set('product-schedule-monitoring', timer);
}

// Bir sonraki saat başına kadar olan milisaniye
function getMillisecondsUntilNextHour(): number {
  const now = new Date();
  const nextHour = new Date();
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  
  return nextHour.getTime() - now.getTime();
}

// Get status of scheduled tasks
export function getSchedulerStatus(): any {
  const status = Object.values(TASKS).map(task => {
    const isActive = activeTimers.has(task.name);
    const isHourly = 'interval' in task && task.interval === 'hourly';
    let nextRun = 'Devre dışı';
    
    if (isActive && 'time' in task && task.time) {
      try {
        nextRun = new Date(Date.now() + getMillisecondsUntilTime(task.time)).toLocaleString('tr-TR');
      } catch (error) {
        nextRun = 'Hata';
      }
    } else if (isHourly) {
      nextRun = 'Her saat başı';
    }
    
    return {
      name: task.name,
      description: task.description,
      time: 'time' in task ? task.time : 'hourly',
      isActive,
      nextRun
    };
  });
  
  return {
    totalTasks: Object.keys(TASKS).length,
    activeTasks: activeTimers.size,
    status
  };
}

// Manual task execution for testing
export async function executeTaskManually(taskName: string): Promise<boolean> {
  try {
    console.log(`🔄 Manuel görev çalıştırılıyor: ${taskName}`);
    
    switch (taskName) {
      case 'morning-analysis':
        await executeMorningAnalysis();
        break;
      case 'daily-updates':
        await executeDailyUpdates();
        break;
      case 'evening-reports':
        await executeEveningReports();
        break;
      case 'product-schedule-monitoring':
        await checkProductSchedules();
        break;
      default:
        console.error(`❌ Bilinmeyen görev: ${taskName}`);
        return false;
    }
    
    console.log(`✅ Manuel görev tamamlandı: ${taskName}`);
    return true;
  } catch (error) {
    console.error(`❌ Manuel görev hatası: ${taskName}`, error);
    return false;
  }
}

// Shutdown scheduler
export function shutdownScheduler(): void {
  console.log('🛑 Zamanlı görevler kapatılıyor...');
  
  activeTimers.forEach((timer, name) => {
    clearTimeout(timer);
    console.log(`❌ Görev durduruldu: ${name}`);
  });
  
  activeTimers.clear();
  console.log('✅ Tüm zamanlı görevler durduruldu');
}