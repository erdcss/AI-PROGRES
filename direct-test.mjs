import fetch from 'node-fetch';

async function directTest() {
  try {
    console.log('Testing Çaykur Tiryaki Çayı extraction...');
    
    const response = await fetch('http://localhost:5000/api/scraper/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://www.trendyol.com/caykur/tiryaki-cayi-5000-gr-edt-p-2946258'
      }),
      timeout: 90000
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Product extracted successfully:');
      console.log('Title:', data.data.title);
      console.log('Price:', data.data.price);
      console.log('Variants:', data.data.variants?.length || 0);
      
      // Test Shopify addition
      console.log('Adding to Shopify...');
      
      const shopifyResponse = await fetch('http://localhost:5000/api/shopify/add-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productData: data.data
        })
      });
      
      const shopifyData = await shopifyResponse.json();
      
      if (shopifyData.success) {
        console.log('Added to Shopify successfully!');
        console.log('Shopify Product ID:', shopifyData.shopifyProductId);
      } else {
        console.log('Shopify addition failed:', shopifyData.error);
      }
      
    } else {
      console.log('Extraction failed:', data.error);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

directTest();