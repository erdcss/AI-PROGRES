// Mayo ürünü için multi-color görsel testi
const axios = require('axios');

async function testMultiColorExtraction() {
  try {
    const url = 'https://www.trendyol.com/sayina/kadin-sari-tek-omuz-kemer-detayli-balenli-ozel-tasarim-astarli-sik-butik-mayo-p-682682444?boutiqueId=61&merchantId=381608';
    
    console.log('🎨 Mayo ürününün tüm renk görsellerini test ediyorum...');
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = response.data;
    
    // Tüm CDN resimlerini bul
    const allImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
    console.log(`📸 Toplam CDN resim: ${allImages.length}`);
    
    // Renk kodlarını bul
    const colorCodes = [];
    const imageIds = new Set();
    
    allImages.forEach(img => {
      // Image ID pattern: /398949240/903474114/ (turuncu)
      // Image ID pattern: /398949332/903542807/ (sarı)
      const match = img.match(/\/(\d{9})\/(\d{9})\//);
      if (match) {
        const id1 = match[1];
        const id2 = match[2];
        imageIds.add(`${id1}/${id2}`);
      }
    });
    
    console.log('🔍 Bulunan Image ID kombinasyonları:');
    Array.from(imageIds).forEach((id, index) => {
      console.log(`${index + 1}. ${id}`);
    });
    
    // Renk seçeneklerini script içinde ara
    const colorMatches = html.match(/"color"[^}]*"name":\s*"([^"]+)"/g);
    if (colorMatches) {
      console.log('🎨 Script içindeki renkler:');
      colorMatches.forEach((match, index) => {
        const colorName = match.match(/"name":\s*"([^"]+)"/);
        if (colorName) {
          console.log(`${index + 1}. ${colorName[1]}`);
        }
      });
    }
    
    // Her image ID için farklı renk tespit et
    console.log('\n📊 Her image ID\'nin renk analizi:');
    
    // 398949240/903474114 - Turuncu
    const orangeImages = allImages.filter(img => img.includes('398949240/903474114'));
    console.log(`🟠 Turuncu (398949240/903474114): ${orangeImages.length} resim`);
    if (orangeImages.length > 0) {
      console.log('   Örnekler:', orangeImages.slice(0, 2));
    }
    
    // 398949332/903542807 - Sarı  
    const yellowImages = allImages.filter(img => img.includes('398949332/903542807'));
    console.log(`🟡 Sarı (398949332/903542807): ${yellowImages.length} resim`);
    if (yellowImages.length > 0) {
      console.log('   Örnekler:', yellowImages.slice(0, 2));
    }
    
    // Diğer ID'leri ara
    const otherIds = Array.from(imageIds).filter(id => 
      !id.includes('398949240/903474114') && 
      !id.includes('398949332/903542807')
    );
    
    otherIds.forEach(id => {
      const idImages = allImages.filter(img => img.includes(id));
      console.log(`🎨 Diğer renk (${id}): ${idImages.length} resim`);
    });
    
  } catch (error) {
    console.error('Test hatası:', error.message);
  }
}

testMultiColorExtraction();