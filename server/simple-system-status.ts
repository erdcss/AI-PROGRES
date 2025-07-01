/**
 * Simple System Status - Working Telegram integration
 */

import { db } from './db';
import { products, productVariants } from '@shared/schema';
import { count } from 'drizzle-orm';
import { telegramIntegration } from './telegram-integration';

export async function getSystemStatus() {
  const status = {
    timestamp: new Date().toLocaleString('tr-TR'),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: {
      products: 0,
      variants: 0,
      connected: true
    },
    services: {
      telegram: true,
      shopify: !!process.env.SHOPIFY_ACCESS_TOKEN,
      email: !!process.env.GMAIL_USER,
      scraper: true
    }
  };

  try {
    const [productResult] = await db.select({ count: count() }).from(products);
    const [variantResult] = await db.select({ count: count() }).from(productVariants);
    status.database.products = productResult.count;
    status.database.variants = variantResult.count;
  } catch (error) {
    status.database.connected = false;
  }

  return status;
}

export async function sendStatusToTelegram() {
  try {
    const status = await getSystemStatus();
    
    const message = `🔧 SİSTEM DURUMU RAPORU\n\n` +
      `📅 Tarih: ${status.timestamp}\n` +
      `⏱️ Çalışma Süresi: ${Math.floor(status.uptime / 3600)}s ${Math.floor((status.uptime % 3600) / 60)}d\n` +
      `💾 Bellek: ${Math.round(status.memory.heapUsed / 1024 / 1024)}MB\n\n` +
      `📊 VERİTABANI:\n` +
      `  📦 Ürün Sayısı: ${status.database.products}\n` +
      `  🎯 Varyant Sayısı: ${status.database.variants}\n` +
      `  🔗 Bağlantı: ${status.database.connected ? '✅ Aktif' : '❌ Hatalı'}\n\n` +
      `🌐 SERVİSLER:\n` +
      `  📱 Telegram: ${status.services.telegram ? '✅' : '❌'}\n` +
      `  🛒 Shopify: ${status.services.shopify ? '✅' : '❌'}\n` +
      `  📧 Email: ${status.services.email ? '✅' : '❌'}\n` +
      `  🔍 Scraper: ${status.services.scraper ? '✅' : '❌'}\n\n` +
      `⚡ Sistem operasyonel`;

    await telegramIntegration.sendNotification(message);
    return true;
  } catch (error) {
    console.error('Status report error:', error);
    return false;
  }
}