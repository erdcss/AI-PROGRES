const axios = require('axios');

async function testRealScraping() {
  console.log('=== Testing Real Product Scraping ===');
  
  const testUrls = [
    'https://www.trendyol.com/koton/test-product-p-111222333',
    'https://www.trendyol.com/mavi/test-jeans-p-444555666',
    'https://www.trendyol.com/nike/test-shoes-p-777888999'
  ];
  
  for (let i = 0; i < testUrls.length; i++) {
    console.log(`\nTest ${i + 1}: ${testUrls[i]}`);
    
    try {
      const response = await axios.post('http://localhost:5000/api/scrape', {
        url: testUrls[i]
      });
      
      console.log('Success:', response.data.success);
      console.log('Title:', response.data.title);
      console.log('Price:', response.data.price);
      console.log('ID:', response.data.id);
      
    } catch (error) {
      console.log('Error:', error.response?.data?.message || error.message);
    }
    
    // Wait 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Check CSV status
  try {
    const csvResponse = await axios.get('http://localhost:5000/api/csv-status');
    console.log('\nCSV Status:');
    console.log('Total products:', csvResponse.data.totalRows);
    console.log('Unique products:', csvResponse.data.uniqueProducts);
  } catch (error) {
    console.log('CSV status error:', error.message);
  }
}

testRealScraping().catch(console.error);