import { ShopifyIntegration } from './shopify-integration';

export async function testShopifyConnection() {
  try {
    const shopify = new ShopifyIntegration('turmarkt.com', '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');
    
    console.log('🔗 Shopify bağlantısı test ediliyor...');
    const connected = await shopify.testConnection();
    
    if (connected) {
      console.log('✅ Shopify API bağlantısı başarılı!');
      console.log('🏪 Mağaza: turmarkt.com');
      return true;
    } else {
      console.log('❌ Shopify API bağlantısı başarısız');
      return false;
    }
  } catch (error) {
    console.error('❌ Shopify test hatası:', error.message);
    return false;
  }
}

// Test çalıştır
if (require.main === module) {
  testShopifyConnection();
}