const axios = require('axios');

async function testMultiVariantDiscovery() {
  console.log('🎯 Multi-Variant Discovery System testi başlıyor...');
  
  const testUrl = 'https://www.trendyol.com/sayina/kadin-sari-tek-omuz-kemer-detayli-balenli-ozel-tasarim-astarli-sik-butik-mayo-p-682682444?boutiqueId=61&merchantId=381608';
  
  try {
    console.log('📍 Test URL:', testUrl);
    console.log('⏱️ API çağrısı yapılıyor...');
    
    const response = await axios.post('http://localhost:5000/api/multi-variant-discovery', {
      url: testUrl
    });
    
    console.log('✅ API Response Status:', response.status);
    
    if (response.data.success) {
      const result = response.data.result;
      const summary = response.data.summary;
      
      console.log('\n📊 Discovery Results:');
      console.log(`  - Total Variants: ${summary.totalVariants}`);
      console.log(`  - Successful Extractions: ${summary.successfulExtractions}`);
      console.log(`  - Failed Extractions: ${summary.failedExtractions}`);
      console.log(`  - Total Images: ${summary.totalImages}`);
      console.log(`  - Total Groups: ${summary.totalGroups}`);
      console.log(`  - Processing Time: ${summary.processingTime}ms`);
      console.log(`  - Colors Found: ${summary.colorsFound.join(', ')}`);
      
      console.log('\n🎨 Base Product Info:');
      console.log(`  - Brand: ${result.discovery.baseProductInfo.brand}`);
      console.log(`  - Base Title: ${result.discovery.baseProductInfo.baseTitle}`);
      console.log(`  - Merchant ID: ${result.discovery.baseProductInfo.merchantId}`);
      console.log(`  - Boutique ID: ${result.discovery.baseProductInfo.boutiqueId}`);
      
      console.log('\n🔗 Discovered Variants:');
      result.variantData.forEach((variant, index) => {
        console.log(`  Variant ${index + 1}: ${variant.color}`);
        console.log(`    - URL: ${variant.url}`);
        console.log(`    - Product ID: ${variant.productId}`);
        console.log(`    - Is Main: ${variant.isMain ? 'Yes' : 'No'}`);
        console.log(`    - Processing: ${variant.processing.success ? 'Success' : 'Failed'}`);
        console.log(`    - Duration: ${variant.processing.duration}ms`);
        console.log(`    - Images Found: ${variant.imageCount}`);
        if (variant.processing.error) {
          console.log(`    - Error: ${variant.processing.error}`);
        }
        console.log('');
      });
      
    } else {
      console.error('❌ API çağrısı başarısız:', response.data);
    }
    
  } catch (error) {
    console.error('❌ Test hatası:', error.response?.data || error.message);
  }
}

testMultiVariantDiscovery();