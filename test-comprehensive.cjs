const axios = require('axios');

async function testComprehensiveSystem() {
  console.log('🎯 Comprehensive Image System testi başlıyor...');
  
  try {
    const response = await axios.post('http://localhost:5000/api/comprehensive-images', {
      url: 'https://www.trendyol.com/sayina/kadin-turuncu-tek-omuz-kemer-detayli-balenli-ozel-tasarim-astarli-sik-butik-mayo-p-682678536?boutiqueId=61&merchantId=381608',
      productTitle: 'Sayina Mayo Test'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    console.log('✅ API Response Status:', response.status);
    console.log('📊 Results:');
    console.log('  - Total Images:', response.data.totalImages);
    console.log('  - Total Groups:', response.data.totalGroups);
    console.log('  - Statistics:', JSON.stringify(response.data.statistics, null, 2));
    
    if (response.data.imageGroups) {
      console.log('\n🎨 Image Groups:');
      response.data.imageGroups.forEach((group, index) => {
        console.log(`  Group ${index + 1}: ${group.colorName || group.groupId}`);
        console.log(`    - Images: ${group.imageCount}`);
      });
    }
    
    if (response.data.summary) {
      console.log('\n📋 Summary:');
      console.log(response.data.summary);
    }
    
  } catch (error) {
    console.error('❌ Test Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

testComprehensiveSystem();