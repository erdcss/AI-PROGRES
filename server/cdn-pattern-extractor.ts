/**
 * Trendyol CDN Pattern Görsel Çıkarıcı
 * CDN URL pattern'lerini analiz ederek maksimum görsel sayısına ulaşır
 */

import axios from 'axios';

export async function extractImagesByCDNPatterns(url: string): Promise<string[]> {
  console.log('🔍 CDN Pattern Extractor başlatılıyor...');
  
  const allImages: string[] = [];
  
  try {
    // 1. Sayfa kaynağını al
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000
    });

    const html = response.data;
    
    // 2. Ürün ID'sini çıkar
    const productIdMatch = url.match(/p-(\d+)/);
    if (!productIdMatch) {
      console.log('❌ Ürün ID bulunamadı');
      return allImages;
    }
    
    const productId = productIdMatch[1];
    console.log(`📦 Ürün ID: ${productId}`);

    // 3. HTML'den mevcut görsel URL'lerini analiz et
    const existingImageUrls = extractExistingImageUrls(html);
    console.log(`🖼️  HTML'den ${existingImageUrls.length} mevcut görsel bulundu`);

    // 4. CDN pattern'lerini analiz et
    const cdnPatterns = analyzeCDNPatterns(existingImageUrls);
    console.log(`🔧 ${cdnPatterns.length} farklı CDN pattern tespit edildi`);

    // 5. Pattern'lere göre görsel varyasyonları oluştur
    const generatedImages = generateImageVariations(productId, cdnPatterns);
    console.log(`✨ ${generatedImages.length} görsel varyasyonu oluşturuldu`);

    // 6. Mevcut ve oluşturulan görselleri birleştir
    const candidateImages = existingImageUrls.concat(generatedImages);
    
    // 7. Duplicate'leri kaldır
    const uniqueImages = Array.from(new Set(candidateImages));
    console.log(`🔄 ${uniqueImages.length} benzersiz görsel candidate'i hazır`);

    // 8. Görsellerin geçerliliğini batch olarak kontrol et
    const validImages = await validateImagesInBatches(uniqueImages);
    console.log(`✅ ${validImages.length} geçerli görsel doğrulandı`);

    allImages.push(...validImages);

  } catch (error) {
    console.error('❌ CDN Pattern Extractor hatası:', error);
  }

  console.log(`🎯 CDN Pattern Extractor sonuç: ${allImages.length} görsel`);
  return allImages;
}

/**
 * HTML'den mevcut görsel URL'lerini çıkarır
 */
function extractExistingImageUrls(html: string): string[] {
  const urls: string[] = [];
  
  // Farklı görsel URL pattern'leri
  const patterns = [
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/\d+\/\d+\/[a-f0-9-]+\/\d+_org_zoom\.jpg/g,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/\d+\/\d+\/[a-f0-9-]+\/\d+_org\.jpg/g,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/\d+\/\d+\/\d+\/[a-f0-9-]+\.jpg/g,
    /"contentUrl":\s*\[\s*([^\]]+)\]/g,
    /"image":\s*"([^"]+\.jpg)"/g,
    /data-src="([^"]+\.jpg)"/g,
    /src="([^"]+\.jpg)"/g
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1] || match[0];
      if (url && url.includes('cdn.dsmcdn.com') && !urls.includes(url)) {
        urls.push(url.replace(/"/g, ''));
      }
    }
  });

  return urls;
}

/**
 * Mevcut URL'lerden CDN pattern'lerini analiz eder
 */
function analyzeCDNPatterns(urls: string[]): CDNPattern[] {
  const patterns: CDNPattern[] = [];
  
  urls.forEach(url => {
    // ty1617/prod/QC/20241226/12/ pattern'i
    const match1 = url.match(/ty(\d+)\/prod\/QC\/(\d+)\/(\d+)\//);
    if (match1) {
      patterns.push({
        type: 'QC',
        tyVersion: match1[1],
        dateFolder: match1[2],
        timeFolder: match1[3],
        baseUrl: url.substring(0, url.lastIndexOf('/') + 1)
      });
    }
    
    // product/media/images pattern'i
    const match2 = url.match(/product\/media\/images\/(\d+)\/(\d+)\/(\d+)\//);
    if (match2) {
      patterns.push({
        type: 'media',
        folder1: match2[1],
        folder2: match2[2],
        folder3: match2[3],
        baseUrl: url.substring(0, url.lastIndexOf('/') + 1)
      });
    }
  });

  // Duplicate pattern'leri kaldır
  return patterns.filter((pattern, index, self) => 
    index === self.findIndex(p => p.baseUrl === pattern.baseUrl)
  );
}

/**
 * Pattern'lere göre görsel varyasyonları oluşturur
 */
function generateImageVariations(productId: string, patterns: CDNPattern[]): string[] {
  const variations: string[] = [];
  
  // Yaygın ty version'ları
  const tyVersions = ['1617', '1605', '1606', '1604', '1603', '1602', '1601'];
  
  // Yaygın date folder'lar (son 6 ay)
  const dateFolders = ['20241226', '20241225', '20241224', '20241124', '20241123', '20241023'];
  
  // Yaygın time folder'lar
  const timeFolders = ['12', '11', '10', '09', '08', '07', '23', '22'];
  
  // Görsel numaraları
  const imageNumbers = ['1', '2', '3', '4', '5', '6', '7', '8'];
  
  // Görsel suffix'leri
  const suffixes = ['_org_zoom.jpg', '_org.jpg', '.jpg'];

  // QC pattern'i için varyasyonlar
  tyVersions.forEach(tyVersion => {
    dateFolders.forEach(dateFolder => {
      timeFolders.forEach(timeFolder => {
        // UUID benzeri ID oluştur (basit hash)
        const simpleHash = generateSimpleHash(productId + dateFolder + timeFolder);
        
        imageNumbers.forEach(imageNum => {
          suffixes.forEach(suffix => {
            const url = `https://cdn.dsmcdn.com/ty${tyVersion}/prod/QC/${dateFolder}/${timeFolder}/${simpleHash}/${imageNum}${suffix}`;
            variations.push(url);
          });
        });
      });
    });
  });

  return variations;
}

/**
 * Basit hash oluşturucu (UUID benzeri)
 */
function generateSimpleHash(input: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [8, 4, 4, 4, 12]; // UUID format: 8-4-4-4-12
  let hash = '';
  let inputIndex = 0;
  
  segments.forEach((segmentLength, index) => {
    if (index > 0) hash += '-';
    
    for (let i = 0; i < segmentLength; i++) {
      const charIndex = (input.charCodeAt(inputIndex % input.length) + i) % chars.length;
      hash += chars[charIndex];
      inputIndex++;
    }
  });
  
  return hash;
}

/**
 * Görselleri batch'ler halinde doğrular
 */
async function validateImagesInBatches(urls: string[]): Promise<string[]> {
  const validUrls: string[] = [];
  const batchSize = 10;
  const maxBatches = 5; // Toplam 50 görsel kontrolü
  
  for (let i = 0; i < Math.min(urls.length, maxBatches * batchSize); i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const validBatch = await Promise.all(
      batch.map(async (url) => {
        try {
          const response = await axios.head(url, { 
            timeout: 3000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (response.status === 200 && response.headers['content-type']?.includes('image')) {
            console.log(`✅ Geçerli görsel: ${url}`);
            return url;
          }
        } catch (error) {
          // Sessizce geç, log spam'i önle
        }
        return null;
      })
    );
    
    validUrls.push(...validBatch.filter(url => url !== null) as string[]);
    
    // Rate limiting
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return validUrls;
}

interface CDNPattern {
  type: 'QC' | 'media';
  tyVersion?: string;
  dateFolder?: string;
  timeFolder?: string;
  folder1?: string;
  folder2?: string;
  folder3?: string;
  baseUrl: string;
}