/**
 * Test Script - Working URL'leri Bul
 * Tracking'teki URL'lerden çalışanları tespit et
 */

const testUrls = [
  'https://www.trendyol.com/nanomax/bluetooth-kulaklik-stereo-muzik-dinleme-p-90027948',
  'https://www.trendyol.com/defacto/erkek-regular-fit-polo-yaka-t-shirt-p-123456',
  'https://www.trendyol.com/cookplus/mutfaksever-2in1-dograyici-ve-sorbe-makinesi-p-242041337',
  'https://www.trendyol.com/oral-b/dis-fircasi-yedek-basligi-clean-maximiser-cross-action-4-lu-p-169917410'
];

async function testUrl(url) {
  try {
    const response = await fetch('http://localhost:5000/api/scenario-scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url })
    });
    
    const data = await response.json();
    
    if (data.success && data.price && data.price.original > 0) {
      console.log(`✅ ÇALIŞIYOR: ${url}`);
      console.log(`   Başlık: ${data.title}`);
      console.log(`   Fiyat: ${data.price.original} TL`);
      console.log(`   Görseller: ${data.images?.length || 0} adet`);
      console.log('');
      return true;
    } else {
      console.log(`❌ BLOCKED: ${url.substring(0, 60)}...`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${url.substring(0, 60)}... - ${error.message}`);
    return false;
  }
}

async function findWorkingUrls() {
  console.log('🔍 Working URLleri test ediyorum...\n');
  
  let workingCount = 0;
  for (const url of testUrls) {
    const isWorking = await testUrl(url);
    if (isWorking) workingCount++;
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 saniye bekle
  }
  
  console.log(`\n📊 Sonuç: ${workingCount}/${testUrls.length} URL çalışıyor`);
}

findWorkingUrls();