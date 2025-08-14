import axios from 'axios';

async function testSimpleExtraction() {
  try {
    console.log('Testing simple Trendyol extraction...');
    
    // Test with a simple product URL
    const testUrl = 'https://www.trendyol.com/nike/air-force-1-07-erkek-sneaker-ayakkabi-315122-111-p-1758665';
    
    const response = await axios.post('http://localhost:5000/api/scenario-scrape', {
      url: testUrl
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testSimpleExtraction();