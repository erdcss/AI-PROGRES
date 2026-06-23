/**
 * Direct Connection Test for Telegram and Shopify
 * Test both services independently
 */

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import {
  resolveShopifyCredentials,
  ShopifyCredentialsError,
  normalizeShopDomain,
  type ShopifyCredentialSource,
} from './shopify-credentials';

interface ConnectionTestResult {
  service: string;
  connected: boolean;
  message: string;
  details?: any;
  timestamp: Date;
}

export async function testTelegramConnection(): Promise<ConnectionTestResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    return {
      service: 'Telegram',
      connected: false,
      message: 'TELEGRAM_BOT_TOKEN environment variable not found',
      timestamp: new Date()
    };
  }

  try {
    console.log('🔍 Testing Telegram connection...');
    
    const response = await axios.get(
      `https://api.telegram.org/bot${token}/getMe`,
      { timeout: 10000 }
    );

    if (response.data.ok) {
      console.log('✅ Telegram connection successful');
      return {
        service: 'Telegram',
        connected: true,
        message: 'Telegram Bot is active and responding',
        details: {
          username: response.data.result?.username,
          firstName: response.data.result?.first_name,
          canJoinGroups: response.data.result?.can_join_groups,
          canReadAllGroupMessages: response.data.result?.can_read_all_group_messages
        },
        timestamp: new Date()
      };
    } else {
      throw new Error('Telegram API returned error');
    }
  } catch (error: any) {
    console.error('❌ Telegram connection failed:', error.message);
    return {
      service: 'Telegram',
      connected: false,
      message: `Telegram connection failed: ${error.message}`,
      details: { error: error.response?.data || error.message },
      timestamp: new Date()
    };
  }
}

export interface ShopifyConnectionTestResult {
  success: boolean;
  connected: boolean;
  message: string;
  shopDomain?: string;
  shopName?: string;
  tokenSource?: ShopifyCredentialSource | 'none';
  scopesHint?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  error?: { status?: number; hint?: string };
}

export async function runShopifyConnectionTest(requestId?: string): Promise<ShopifyConnectionTestResult> {
  const rid = requestId || 'conn-test';
  let creds;
  try {
    creds = await resolveShopifyCredentials();
  } catch (err) {
    const msg = err instanceof ShopifyCredentialsError ? err.message : 'Shopify kimlik bilgileri bulunamadı';
    console.warn(`[${rid}] Shopify connection test: no credentials`);
    return {
      success: false,
      connected: false,
      message: msg,
      tokenSource: 'none',
      requestId: rid,
      error: { hint: 'OAuth veya Admin Token ile bağlantı kurun' },
    };
  }

  const shopDomain = normalizeShopDomain(creds.shopDomain);
  console.log(`[${rid}] Shopify test domain=${shopDomain} source=${creds.source}`);

  try {
    const response = await axios.get(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': creds.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      validateStatus: () => true,
    });

    if (response.status === 401) {
      return {
        success: false,
        connected: false,
        message: 'Token geçersiz veya süresi dolmuş',
        shopDomain,
        tokenSource: creds.source,
        requestId: rid,
        error: { status: 401, hint: 'Yeni Admin API token oluşturun veya OAuth yenileyin' },
      };
    }
    if (response.status === 403) {
      return {
        success: false,
        connected: false,
        message: 'Yetki/scope eksik — read_products ve write_products gerekli',
        shopDomain,
        tokenSource: creds.source,
        requestId: rid,
        error: { status: 403, hint: 'Uygulama izinlerinde ürün okuma/yazma scope ekleyin' },
      };
    }
    if (response.status !== 200 || !response.data?.shop) {
      return {
        success: false,
        connected: false,
        message: `Shopify API hatası (HTTP ${response.status})`,
        shopDomain,
        tokenSource: creds.source,
        requestId: rid,
        error: { status: response.status },
      };
    }

    const shop = response.data.shop;
    return {
      success: true,
      connected: true,
      message: 'Shopify bağlantısı başarılı',
      shopDomain,
      shopName: shop.name,
      tokenSource: creds.source,
      scopesHint: 'read_products, write_products, read_inventory, write_inventory',
      requestId: rid,
      details: {
        email: shop.email,
        currency: shop.currency,
        planName: shop.plan_name,
        myshopifyDomain: shop.myshopify_domain || shop.domain,
      },
    };
  } catch (error: any) {
    console.error(`[${rid}] Shopify connection failed:`, error.message);
    return {
      success: false,
      connected: false,
      message: `Bağlantı hatası: ${error.message}`,
      shopDomain,
      tokenSource: creds.source,
      requestId: rid,
    };
  }
}

export async function testShopifyConnection(): Promise<ConnectionTestResult> {
  const result = await runShopifyConnectionTest();
  return {
    service: 'Shopify',
    connected: result.connected,
    message: result.message,
    details: {
      shopName: result.shopName,
      domain: result.shopDomain,
      tokenSource: result.tokenSource,
      scopesHint: result.scopesHint,
      ...(result.details || {}),
      ...(result.error || {}),
    },
    timestamp: new Date(),
  };
}

export async function testAllConnections(): Promise<{
  telegram: ConnectionTestResult;
  shopify: ConnectionTestResult;
  summary: {
    totalServices: number;
    connectedServices: number;
    failedServices: number;
    overallStatus: 'all_connected' | 'partial_connected' | 'all_failed';
  };
}> {
  console.log('🔧 Running comprehensive connection tests...');
  
  const [telegramResult, shopifyResult] = await Promise.all([
    testTelegramConnection(),
    testShopifyConnection()
  ]);

  const connectedCount = [telegramResult, shopifyResult].filter(r => r.connected).length;
  const totalCount = 2;
  
  let overallStatus: 'all_connected' | 'partial_connected' | 'all_failed';
  if (connectedCount === totalCount) {
    overallStatus = 'all_connected';
  } else if (connectedCount > 0) {
    overallStatus = 'partial_connected';
  } else {
    overallStatus = 'all_failed';
  }

  return {
    telegram: telegramResult,
    shopify: shopifyResult,
    summary: {
      totalServices: totalCount,
      connectedServices: connectedCount,
      failedServices: totalCount - connectedCount,
      overallStatus
    }
  };
}

export async function sendTelegramTestMessage(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!token || !chatId) {
    return {
      success: false,
      message: 'Telegram credentials not found'
    };
  }

  try {
    const bot = new TelegramBot(token);
    
    const testMessage = `🧪 <b>TEST MESAJI</b>

✅ Telegram entegrasyonu çalışıyor!
📱 Bildirimler bu chat'e gelecek
🕐 Zaman: ${new Date().toLocaleString('tr-TR')}

🔧 Sistem durumu:
• Trendyol scraper: Aktif
• Shopify entegrasyonu: Test ediliyor
• Görsel çıkarma: Çalışıyor`;

    await bot.sendMessage(chatId, testMessage, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    });

    return {
      success: true,
      message: 'Test mesajı başarıyla gönderildi'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Telegram test mesajı gönderilemedi: ${error.message}`,
      details: { error: error.message }
    };
  }
}