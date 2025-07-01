// Test file for detailed feature extraction

async function testDetailedFeatures() {
  try {
    console.log('🎯 Detaylı özellik çıkarma sistemi test ediliyor...');
    
    const { detailedFeatureExtractor } = require('./server/detailed-feature-extractor');
    
    const url = 'https://www.trendyol.com/stanley/the-legendary-classic-bottle-1-9l-2-0qt-p-968131';
    
    console.log(`📍 Test URL: ${url}`);
    
    const result = await detailedFeatureExtractor.extractDetailedFeatures(url);
    
    console.log('\n✅ DETAYLI ÖZELLİK ÇIKARMA SONUÇLARI:');
    console.log(`📊 Toplam özellik: ${result.totalFound}`);
    console.log(`⏱️ İşlem süresi: ${result.extractionTime}ms`);
    console.log(`✅ Başarı durumu: ${result.success}`);
    
    if (result.features && result.features.length > 0) {
      console.log('\n📋 Çıkarılan özellikler:');
      result.features.forEach((feature, index) => {
        console.log(`${index + 1}. ${feature.key}: ${feature.value} (${feature.category})`);
      });
    } else {
      console.log('❌ Hiç özellik çıkarılamadı');
    }
    
  } catch (error) {
    console.error('❌ Test hatası:', error.message);
  }
}

testDetailedFeatures();