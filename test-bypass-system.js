/**
 * Test Bypass System - Working URL testi
 */

const testUrls = [
  // Confirmed working URLs
  'https://www.trendyol.com/cookplus/mutfaksever-2in1-dograyici-ve-sorbe-makinesi-p-242041337',
  'https://www.trendyol.com/harmana/hindiba-kahvesi-1-aylik-60-kullanim-net-150gr-p-288620006',
  'https://www.trendyol.com/oral-b/dis-fircasi-yedek-basligi-clean-maximiser-cross-action-4-lu-p-169917410',
  // Problem URL
  'https://www.trendyol.com/caglayan-kuyumculuk/14-ayar-altin-halat-burgu-zincir-kolye-6-mm-p-962135032'
];

async function testAll() {
  console.log('🧪 Testing Bypass System Performance...\n');
  
  for (const url of testUrls) {
    console.log(`\n📝 Testing: ${url.split('/').pop()}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/scenario-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      
      if (data.success && data.price?.original > 0) {
        console.log(`✅ SUCCESS: ${data.title}`);
        console.log(`   Price: ${data.price.original} TL`);
        console.log(`   Method: ${data.extractionDetails?.strategy || 'Unknown'}`);
        console.log(`   Images: ${data.images?.length || 0} found`);
      } else {
        console.log(`❌ FAILED: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
    
    // Delay between tests
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n📊 Test completed!');
}

testAll();