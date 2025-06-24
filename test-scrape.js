import axios from 'axios';

async function testScrapeAndAdd() {
  try {
    console.log('🔄 Çaykur Tiryaki Çayı ürünü çekiliyor...');
    
    const response = await axios.post('http://localhost:5000/api/scraper/extract', {
      url: 'https://www.trendyol.com/caykur/tiryaki-cayi-5000-gr-edt-p-2946258'
    }, {
      timeout: 60000, // 60 saniye timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      console.log('✅ Ürün başarıyla çekildi:', response.data.data.title);
      console.log('💰 Fiyat:', response.data.data.price);
      console.log('🎯 Varyant sayısı:', response.data.data.variants?.length || 0);
      
      // Shopify'a ekle
      console.log('🔄 Shopify\'a ekleniyor...');
      
      const shopifyResponse = await axios.post('http://localhost:5000/api/shopify/add-product', {
        productData: response.data.data
      });
      
      if (shopifyResponse.data.success) {
        console.log('✅ Shopify\'a başarıyla eklendi!');
        console.log('🏪 Admin URL:', shopifyResponse.data.adminUrl);
        console.log('🛍️ Store URL:', shopifyResponse.data.storeUrl);
      }
    } else {
      console.log('❌ Ürün çekilemedi:', response.data.error);
    }
  } catch (error) {
    console.error('❌ Hata:', error.response?.data?.error || error.message);
  }
}

testScrapeAndAdd();