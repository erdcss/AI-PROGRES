// Test file for Trendyol properties extraction (requires Node.js with ES modules)

async function testTrendyolProperties() {
  try {
    console.log('🏷️ Trendyol özellik tablosu çıkarma sistemi test ediliyor...');
    
    // Dynamic import for ES modules
    const { trendyolPropertiesExtractor } = await import('./server/trendyol-properties-extractor.js');
    
    const url = 'https://www.trendyol.com/stanley/the-legendary-classic-bottle-1-9l-2-0qt-p-968131';
    
    console.log(`📍 Test URL: ${url}`);
    console.log(`📍 Hedef: Ürün Özellikleri tablosundaki veriler (Kapasite, Materyal, Renk, vb.)`);
    
    const result = await trendyolPropertiesExtractor.extractTrendyolProperties(url);
    
    console.log('\n✅ TRENDYOL ÖZELLİK TABLOSU SONUÇLARI:');
    console.log(`📊 Toplam özellik: ${result.totalFound}`);
    console.log(`⏱️ İşlem süresi: ${result.extractionTime}ms`);
    console.log(`🔧 Yöntem: ${result.method}`);
    console.log(`✅ Başarı durumu: ${result.success}`);
    
    if (result.properties && result.properties.length > 0) {
      console.log('\n📋 Çıkarılan ürün özellikleri:');
      result.properties.forEach((property, index) => {
        console.log(`${index + 1}. ${property.key}: ${property.value} (${property.category})`);
      });
      
      // Kategorilere göre gruppla
      const categorized = {};
      result.properties.forEach(prop => {
        if (!categorized[prop.category]) {
          categorized[prop.category] = [];
        }
        categorized[prop.category].push(`${prop.key}: ${prop.value}`);
      });
      
      console.log('\n📂 Kategorilere göre özellikler:');
      Object.entries(categorized).forEach(([category, props]) => {
        console.log(`\n🔖 ${category}:`);
        props.forEach(prop => console.log(`   • ${prop}`));
      });
      
    } else {
      console.log('❌ Hiç özellik çıkarılamadı');
      console.log('💡 Bu durumda manuel HTML analizi gerekebilir');
    }
    
  } catch (error) {
    console.error('❌ Test hatası:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testTrendyolProperties();