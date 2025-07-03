const axios = require('axios');
const cheerio = require('cheerio');

async function testCompleteImageExtraction() {
  const url = 'https://www.trendyol.com/sayina/kadin-turuncu-tek-omuz-kemer-detayli-balenli-ozel-tasarim-astarli-sik-butik-mayo-p-682678536?boutiqueId=61&merchantId=381608';
  
  console.log('🖼️ TÜM ürün görsellerini çıkarma testi başlıyor...');
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    console.log(`📄 HTML analizi: ${Math.round(html.length / 1024)}KB`);
    
    // Method 1: CDN görsellerini regex ile toplu çıkar
    const cdnImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
    console.log(`🔍 CDN'den bulunan toplam görsel: ${cdnImages.length}`);
    
    // Görselleri kategorize et
    const highQualityImages = cdnImages.filter(img => img.includes('_org_zoom.jpg'));
    const mediumQualityImages = cdnImages.filter(img => img.includes('_medium.jpg') || img.includes('/medium/'));
    const thumbnailImages = cdnImages.filter(img => img.includes('_thumb.jpg') || img.includes('/thumb/'));
    
    console.log(`📊 Görsel kalite dağılımı:`);
    console.log(`  - Yüksek kalite (_org_zoom): ${highQualityImages.length}`);
    console.log(`  - Orta kalite (_medium): ${mediumQualityImages.length}`);
    console.log(`  - Thumbnail (_thumb): ${thumbnailImages.length}`);
    
    // Benzersiz görsel ID'lerini tespit et
    const imageIds = new Set();
    cdnImages.forEach(img => {
      const match = img.match(/\/(\d{9})\/(\d{9})\//);
      if (match) {
        imageIds.add(`${match[1]}/${match[2]}`);
      }
    });
    
    console.log(`🎨 Benzersiz görsel grubu: ${imageIds.size}`);
    
    // Method 2: DOM'dan renk seçici görsellerini çıkar
    const colorImages = $('.pr-in-dt-cl img, .color-variant img');
    console.log(`🎨 Renk seçici görselleri: ${colorImages.length}`);
    
    colorImages.each((i, img) => {
      const src = $(img).attr('src') || '';
      const alt = $(img).attr('alt') || '';
      if (src.includes('cdn.dsmcdn.com')) {
        console.log(`  ${i + 1}. ${alt}: ${src.split('/').pop()}`);
      }
    });
    
    // Method 3: Ana galeri görsellerini çıkar
    const galleryImages = $('img').filter((i, img) => {
      const src = $(img).attr('src') || '';
      return src.includes('cdn.dsmcdn.com') && src.includes('_org_zoom.jpg');
    });
    
    console.log(`🖼️ Ana galeri görselleri: ${galleryImages.length}`);
    
    // İlk 10 yüksek kalite görseli göster
    console.log(`\n🎯 İlk 10 yüksek kalite görsel:`);
    highQualityImages.slice(0, 10).forEach((img, i) => {
      console.log(`  ${i + 1}. ${img.split('/').slice(-3).join('/')}`);
    });
    
    // Toplam özet
    console.log(`\n✅ TOPLAM ÖZET:`);
    console.log(`  - Toplam CDN görsel: ${cdnImages.length}`);
    console.log(`  - Yüksek kalite: ${highQualityImages.length}`);
    console.log(`  - Benzersiz görsel grubu: ${imageIds.size}`);
    console.log(`  - DOM renk seçici: ${colorImages.length}`);
    console.log(`  - Ana galeri: ${galleryImages.length}`);
    
  } catch (error) {
    console.error('❌ Test hatası:', error.message);
  }
}

testCompleteImageExtraction();