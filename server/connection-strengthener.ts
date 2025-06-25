/**
 * Shopify ve Telegram Bağlantı Güçlendirici
 */

import axios from 'axios';
import axiosRetry from 'axios-retry';

export class ConnectionStrengthener {
  
  constructor() {
    this.setupAxiosRetry();
  }

  private setupAxiosRetry() {
    // Axios retry konfigürasyonu
    axiosRetry(axios, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.code === 'ECONNRESET' ||
               error.code === 'ETIMEDOUT' ||
               error.response?.status >= 500;
      }
    });
  }

  async testShopifyConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('🔍 Shopify bağlantısı test ediliyor...');
      
      const response = await axios.get(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      console.log('✅ Shopify bağlantısı başarılı');
      return {
        success: true,
        message: 'Shopify API bağlantısı aktif',
        data: {
          shop: response.data.shop?.name,
          domain: response.data.shop?.domain
        }
      };
    } catch (error: any) {
      console.error('❌ Shopify bağlantı hatası:', error.message);
      return {
        success: false,
        message: `Shopify bağlantı hatası: ${error.message}`
      };
    }
  }

  async testTelegramConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('🔍 Telegram bağlantısı test ediliyor...');
      
      const response = await axios.get(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`,
        {
          timeout: 15000
        }
      );

      console.log('✅ Telegram bağlantısı başarılı');
      return {
        success: true,
        message: 'Telegram Bot bağlantısı aktif',
        data: {
          username: response.data.result?.username,
          firstName: response.data.result?.first_name
        }
      };
    } catch (error: any) {
      console.error('❌ Telegram bağlantı hatası:', error.message);
      return {
        success: false,
        message: `Telegram bağlantı hatası: ${error.message}`
      };
    }
  }

  async sendTelegramTest(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('📱 Test mesajı gönderiliyor...');
      
      const testMessage = `🔧 Bağlantı Testi - ${new Date().toLocaleString('tr-TR')}

✅ Sistem bağlantıları güçlendirildi
📊 Shopify ve Telegram entegrasyonu aktif
🚀 Tüm servisler operasyonel`;

      const response = await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: '1219880063',
          text: testMessage,
          parse_mode: 'HTML'
        },
        {
          timeout: 15000
        }
      );

      console.log('✅ Test mesajı başarıyla gönderildi');
      return {
        success: true,
        message: 'Telegram test mesajı gönderildi'
      };
    } catch (error: any) {
      console.error('❌ Telegram mesaj gönderme hatası:', error.message);
      return {
        success: false,
        message: `Telegram mesaj hatası: ${error.message}`
      };
    }
  }

  async testShopifyProductCreation(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('🛍️ Shopify ürün oluşturma testi...');
      
      const testProduct = {
        product: {
          title: 'Test Ürün - Bağlantı Kontrolü',
          body_html: '<p>Bu bir bağlantı test ürünüdür.</p>',
          vendor: 'Test',
          product_type: 'Test',
          status: 'draft',
          variants: [{
            price: '1.00',
            inventory_quantity: 0,
            inventory_management: 'shopify'
          }]
        }
      };

      const response = await axios.post(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/products.json`,
        testProduct,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );

      // Test ürünü oluşturduktan sonra sil
      const productId = response.data.product.id;
      await axios.delete(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/products/${productId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        }
      );

      console.log('✅ Shopify ürün oluşturma testi başarılı');
      return {
        success: true,
        message: 'Shopify ürün API testi başarılı',
        data: { testProductId: productId }
      };
    } catch (error: any) {
      console.error('❌ Shopify ürün testi hatası:', error.message);
      return {
        success: false,
        message: `Shopify ürün API hatası: ${error.message}`
      };
    }
  }

  async performFullConnectionTest(): Promise<{
    shopify: any;
    telegram: any;
    shopifyProduct: any;
    telegramTest: any;
    timestamp: Date;
  }> {
    console.log('🔧 Kapsamlı bağlantı testi başlatılıyor...');
    
    const results = {
      shopify: await this.testShopifyConnection(),
      telegram: await this.testTelegramConnection(),
      shopifyProduct: await this.testShopifyProductCreation(),
      telegramTest: await this.sendTelegramTest(),
      timestamp: new Date()
    };

    const successCount = Object.values(results)
      .filter(r => typeof r === 'object' && r !== null && 'success' in r && r.success)
      .length;

    console.log(`📊 Bağlantı testi tamamlandı: ${successCount}/4 başarılı`);
    
    return results;
  }

  async reinforceConnections(): Promise<void> {
    console.log('🚀 Bağlantı güçlendirme işlemleri...');
    
    // Axios global ayarları
    axios.defaults.timeout = 30000;
    axios.defaults.maxRedirects = 5;
    
    // Request interceptor
    axios.interceptors.request.use(
      (config) => {
        config.headers['User-Agent'] = 'Turmarkt-System/1.0';
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        console.log(`🔄 HTTP ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || 'Network Error'}`);
        return Promise.reject(error);
      }
    );

    console.log('✅ Bağlantı güçlendirme tamamlandı');
  }
}

export const connectionStrengthener = new ConnectionStrengthener();