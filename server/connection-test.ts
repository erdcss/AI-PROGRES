/**
 * Direct Connection Test for Telegram and Shopify
 * Test both services independently
 */

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import { getShopifyConfig } from './shopify-credentials';

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

export async function testShopifyConnection(): Promise<ConnectionTestResult> {
  const config = await getShopifyConfig();
  const domain = config?.shopDomain;
  const accessToken = config?.accessToken;
  
  if (!domain || !accessToken) {
    return {
      service: 'Shopify',
      connected: false,
      message: 'Shopify kimlik bilgileri bulunamadı. Lütfen Shopify bağlantı ayarlarını yapın.',
      timestamp: new Date()
    };
  }

  try {
    console.log('🔍 Testing Shopify connection...');
    
    const response = await axios.get(
      `https://${domain}/admin/api/2023-10/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data.shop) {
      console.log('✅ Shopify connection successful');
      return {
        service: 'Shopify',
        connected: true,
        message: 'Shopify API is active and responding',
        details: {
          shopName: response.data.shop.name,
          domain: response.data.shop.domain,
          email: response.data.shop.email,
          currency: response.data.shop.currency,
          country: response.data.shop.country_name,
          planName: response.data.shop.plan_name
        },
        timestamp: new Date()
      };
    } else {
      throw new Error('Shopify API returned unexpected response');
    }
  } catch (error: any) {
    console.error('❌ Shopify connection failed:', error.message);
    return {
      service: 'Shopify',
      connected: false,
      message: `Shopify connection failed: ${error.message}`,
      details: { 
        error: error.response?.data || error.message,
        statusCode: error.response?.status,
        domain: domain
      },
      timestamp: new Date()
    };
  }
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