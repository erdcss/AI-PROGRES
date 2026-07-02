/**
 * Direct Connection Test for Telegram and Shopify
 */

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import {
  normalizeShopDomain,
  getShopifyClientCredentials,
  type ShopifyCredentialSource,
} from './shopify-credentials';

interface ConnectionTestResult {
  service: string;
  connected: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export async function testTelegramConnection(): Promise<ConnectionTestResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return {
      service: 'Telegram',
      connected: false,
      message: 'TELEGRAM_BOT_TOKEN environment variable not found',
      timestamp: new Date(),
    };
  }

  try {
    const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
      timeout: 10000,
    });

    if (response.data.ok) {
      return {
        service: 'Telegram',
        connected: true,
        message: 'Telegram Bot is active and responding',
        details: {
          username: response.data.result?.username,
          firstName: response.data.result?.first_name,
        },
        timestamp: new Date(),
      };
    }
    throw new Error('Telegram API returned error');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      service: 'Telegram',
      connected: false,
      message: `Telegram connection failed: ${message}`,
      timestamp: new Date(),
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
  scopesOk?: boolean;
  scopes?: string[];
  canReadProducts?: boolean;
  canWriteProducts?: boolean;
  scopesHint?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  error?: { status?: number; hint?: string };
}

export async function runShopifyConnectionTest(
  requestId?: string,
): Promise<ShopifyConnectionTestResult> {
  const rid = requestId || 'conn-test';

  try {
    const {
      shopifyAdminFetch,
      parseShopifyAdminResponse,
      fetchShopifyAccessScopes,
      mapShopifyProbeError,
    } = await import('./shopify-token-manager');

    const { response: shopResponse, shopDomain, tokenSource } = await shopifyAdminFetch('/shop.json');
    const scopeInfo = await fetchShopifyAccessScopes();

    const mapSource = (): ShopifyCredentialSource | 'none' => {
      if (tokenSource === 'db') return 'db';
      if (tokenSource === 'env' || tokenSource === 'cache') return 'env_access';
      if (tokenSource === 'client_credentials') return 'client_credentials';
      return 'none';
    };

    console.log(`[${rid}] Shopify test domain=${shopDomain} source=${tokenSource}`);

    if (shopResponse.status === 200) {
      const body = (await parseShopifyAdminResponse(shopResponse)) as {
        shop?: { name?: string; email?: string; currency?: string; plan_name?: string; myshopify_domain?: string; domain?: string };
      } | null;
      const shop = body?.shop;

      if (!scopeInfo.scopesOk) {
        const missing = scopeInfo.missingScopes.join(', ') || 'read_products, write_products';
        return {
          success: false,
          connected: false,
          message: `Bağlantı var ancak scope eksik: ${missing}`,
          shopDomain: normalizeShopDomain(shopDomain),
          shopName: shop?.name,
          tokenSource: mapSource(),
          scopesOk: false,
          scopes: scopeInfo.scopes,
          canReadProducts: scopeInfo.canReadProducts,
          canWriteProducts: scopeInfo.canWriteProducts,
          requestId: rid,
          error: { hint: `Eksik scope: ${missing}` },
        };
      }

      return {
        success: true,
        connected: true,
        message: 'Shopify bağlantısı başarılı',
        shopDomain: normalizeShopDomain(shopDomain),
        shopName: shop?.name,
        tokenSource: mapSource(),
        scopesOk: true,
        scopes: scopeInfo.scopes,
        canReadProducts: scopeInfo.canReadProducts,
        canWriteProducts: scopeInfo.canWriteProducts,
        scopesHint: scopeInfo.scopes.join(', '),
        requestId: rid,
        details: {
          email: shop?.email,
          currency: shop?.currency,
          planName: shop?.plan_name,
          myshopifyDomain: shop?.myshopify_domain || shop?.domain,
        },
      };
    }

    const hasClientCreds = Boolean(getShopifyClientCredentials());
    return {
      success: false,
      connected: false,
      message: mapShopifyProbeError(shopResponse.status),
      shopDomain: normalizeShopDomain(shopDomain),
      tokenSource: mapSource(),
      scopesOk: scopeInfo.scopesOk,
      scopes: scopeInfo.scopes,
      requestId: rid,
      error: {
        status: shopResponse.status,
        hint: hasClientCreds
          ? 'SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (shpsec_...) ve SHOPIFY_SHOP_DOMAIN (*.myshopify.com) kontrol edin'
          : 'SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET veya SHOPIFY_ADMIN_ACCESS_TOKEN tanımlayın',
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Shopify bağlantı testi başarısız';
    const hasClientCreds = Boolean(getShopifyClientCredentials());
    return {
      success: false,
      connected: false,
      message: hasClientCreds
        ? `${msg} — SHOPIFY_SHOP_DOMAIN (*.myshopify.com) ve client secret doğruluğunu kontrol edin`
        : msg,
      tokenSource: 'none',
      requestId: rid,
      error: {
        hint: hasClientCreds
          ? 'Dev Dashboard Client Secret (shpsec_...) kullanın; shpss_ API secret değildir'
          : 'OAuth, Admin Token veya client credentials tanımlayın',
      },
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
      scopesOk: result.scopesOk,
      scopes: result.scopes,
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
  const [telegramResult, shopifyResult] = await Promise.all([
    testTelegramConnection(),
    testShopifyConnection(),
  ]);

  const connectedCount = [telegramResult, shopifyResult].filter((r) => r.connected).length;
  const totalCount = 2;

  let overallStatus: 'all_connected' | 'partial_connected' | 'all_failed';
  if (connectedCount === totalCount) overallStatus = 'all_connected';
  else if (connectedCount > 0) overallStatus = 'partial_connected';
  else overallStatus = 'all_failed';

  return {
    telegram: telegramResult,
    shopify: shopifyResult,
    summary: {
      totalServices: totalCount,
      connectedServices: connectedCount,
      failedServices: totalCount - connectedCount,
      overallStatus,
    },
  };
}

export async function sendTelegramTestMessage(): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { success: false, message: 'Telegram credentials not found' };
  }

  try {
    const bot = new TelegramBot(token);
    await bot.sendMessage(
      chatId,
      `🧪 TEST — ${new Date().toLocaleString('tr-TR')}`,
      { disable_web_page_preview: true },
    );
    return { success: true, message: 'Test mesajı başarıyla gönderildi' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Telegram test mesajı gönderilemedi: ${message}` };
  }
}
