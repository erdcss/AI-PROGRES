/**
 * System Status Reporter - Telegram sistem durumu ve hata raporu
 */

import { db } from './db';
import { products, productVariants } from '@shared/schema';
import { count } from 'drizzle-orm';

interface SystemStatus {
  timestamp: string;
  uptime: string;
  memory: {
    used: string;
    total: string;
    percentage: number;
  };
  database: {
    products: number;
    variants: number;
    connected: boolean;
  };
  services: {
    telegram: boolean;
    shopify: boolean;
    email: boolean;
    scraper: boolean;
  };
  errors: string[];
  warnings: string[];
  performance: {
    lastExtraction: string;
    avgResponseTime: string;
    successRate: number;
  };
}

export async function generateSystemStatusReport(): Promise<SystemStatus> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Memory kullanımı
  const memUsage = process.memoryUsage();
  const memoryUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
  const memoryTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
  const memoryPercentage = Math.round((memoryUsed / memoryTotal) * 100);
  
  // Veritabanı durumu
  let dbConnected = true;
  let productCount = 0;
  let variantCount = 0;
  
  try {
    const [productResult] = await db.select({ count: count() }).from(products);
    const [variantResult] = await db.select({ count: count() }).from(productVariants);
    productCount = productResult.count;
    variantCount = variantResult.count;
  } catch (error) {
    dbConnected = false;
    errors.push(`Veritabanı bağlantı hatası: ${error}`);
  }
  
  // Servis durumları kontrolü
  const telegramStatus = !!process.env.TELEGRAM_BOT_TOKEN;
  const shopifyStatus = !!process.env.SHOPIFY_ACCESS_TOKEN && !!process.env.SHOPIFY_STORE_DOMAIN;
  const emailStatus = !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD;
  
  if (!telegramStatus) warnings.push('Telegram bot token eksik');
  if (!shopifyStatus) warnings.push('Shopify API bilgileri eksik');
  if (!emailStatus) warnings.push('Email yapılandırması eksik');
  
  // Scraper durumu testi
  let scraperStatus = true;
  try {
    // Basit bir test URL'i ile scraper durumunu kontrol et
    const testResponse = await fetch('http://localhost:5000/api/health', { 
      method: 'GET'
    });
    if (!testResponse.ok) {
      scraperStatus = false;
      errors.push('Scraper servisi yanıt vermiyor');
    }
  } catch (error) {
    scraperStatus = false;
    errors.push('Scraper servisi erişilemez');
  }
  
  // Memory uyarıları
  if (memoryPercentage > 80) {
    warnings.push(`Yüksek memory kullanımı: %${memoryPercentage}`);
  }
  
  // Uptime hesaplama
  const uptimeSeconds = Math.floor(process.uptime());
  const uptimeHours = Math.floor(uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeFormatted = `${uptimeHours}s ${uptimeMinutes}dk`;
  
  return {
    timestamp: new Date().toLocaleString('tr-TR'),
    uptime: uptimeFormatted,
    memory: {
      used: `${memoryUsed} MB`,
      total: `${memoryTotal} MB`,
      percentage: memoryPercentage
    },
    database: {
      products: productCount,
      variants: variantCount,
      connected: dbConnected
    },
    services: {
      telegram: telegramStatus,
      shopify: shopifyStatus,
      email: emailStatus,
      scraper: scraperStatus
    },
    errors,
    warnings,
    performance: {
      lastExtraction: 'Bilinmiyor',
      avgResponseTime: `${Date.now() - startTime}ms`,
      successRate: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20))
    }
  };
}

export function formatSystemStatusForTelegram(status: SystemStatus): string {
  const statusEmoji = status.errors.length === 0 ? '✅' : '⚠️';
  const dbEmoji = status.database.connected ? '✅' : '❌';
  const servicesEmoji = Object.values(status.services).every(s => s) ? '✅' : '⚠️';
  
  let message = `${statusEmoji} **SİSTEM DURUM RAPORU**\n\n`;
  
  // Genel bilgiler
  message += `📅 **Tarih:** ${status.timestamp}\n`;
  message += `⏱️ **Çalışma Süresi:** ${status.uptime}\n`;
  message += `💾 **Memory:** ${status.memory.used}/${status.memory.total} (%${status.memory.percentage})\n\n`;
  
  // Veritabanı
  message += `${dbEmoji} **VERİTABANI**\n`;
  message += `📦 Ürünler: ${status.database.products}\n`;
  message += `🏷️ Varyantlar: ${status.database.variants}\n`;
  message += `🔗 Bağlantı: ${status.database.connected ? 'Aktif' : 'Kapalı'}\n\n`;
  
  // Servisler
  message += `${servicesEmoji} **SERVİSLER**\n`;
  message += `📱 Telegram: ${status.services.telegram ? '✅' : '❌'}\n`;
  message += `🛒 Shopify: ${status.services.shopify ? '✅' : '❌'}\n`;
  message += `📧 Email: ${status.services.email ? '✅' : '❌'}\n`;
  message += `🔍 Scraper: ${status.services.scraper ? '✅' : '❌'}\n\n`;
  
  // Performans
  message += `⚡ **PERFORMANS**\n`;
  message += `📊 Başarı Oranı: %${status.performance.successRate}\n`;
  message += `⏱️ Yanıt Süresi: ${status.performance.avgResponseTime}\n\n`;
  
  // Hatalar
  if (status.errors.length > 0) {
    message += `❌ **HATALAR (${status.errors.length})**\n`;
    status.errors.forEach((error, index) => {
      message += `${index + 1}. ${error}\n`;
    });
    message += '\n';
  }
  
  // Uyarılar
  if (status.warnings.length > 0) {
    message += `⚠️ **UYARILAR (${status.warnings.length})**\n`;
    status.warnings.forEach((warning, index) => {
      message += `${index + 1}. ${warning}\n`;
    });
    message += '\n';
  }
  
  // Özet
  const totalIssues = status.errors.length + status.warnings.length;
  if (totalIssues === 0) {
    message += `🎉 **Sistem tamamen sağlıklı çalışıyor!**\n`;
  } else {
    message += `📋 **Toplam ${totalIssues} sorun tespit edildi**\n`;
  }
  
  message += `\n⏰ Rapor oluşturma zamanı: ${new Date().toLocaleTimeString('tr-TR')}`;
  
  return message;
}

export async function sendSystemStatusToTelegram(): Promise<boolean> {
  try {
    const status = await generateSystemStatusReport();
    const message = formatSystemStatusForTelegram(status);
    
    // Telegram mesajı gönder
    const telegramModule = await import('./telegram-integration');
    const success = await telegramModule.sendTelegramMessage(message);
    
    if (success) {
      console.log('✅ Sistem durum raporu Telegram\'a gönderildi');
      return true;
    } else {
      console.log('❌ Telegram raporu gönderilemedi');
      return false;
    }
  } catch (error) {
    console.error('❌ Sistem raporu oluşturma hatası:', error);
    return false;
  }
}