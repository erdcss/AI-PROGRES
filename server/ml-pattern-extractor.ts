/**
 * Machine Learning Pattern-Based Image Extractor
 * Uses pattern analysis to predict and discover additional image URLs
 */

import axios from 'axios';

export async function extractImagesWithMLPatterns(url: string): Promise<string[]> {
  console.log('🤖 ML Pattern Extractor başlatılıyor...');
  
  const allImages: string[] = [];
  
  try {
    // 1. URL'den ürün ID ve boutique bilgilerini çıkar
    const urlInfo = parseProductUrl(url);
    if (!urlInfo.productId) {
      console.log('❌ Ürün ID bulunamadı');
      return allImages;
    }
    
    console.log(`🔍 Ürün ID: ${urlInfo.productId}, Boutique: ${urlInfo.boutique}`);

    // 2. Sayfa kaynağını analiz et
    const pageAnalysis = await analyzePageSource(url);
    
    // 3. ML tabanlı pattern'leri uygula
    const predictedImages = await applyMLPatterns(urlInfo, pageAnalysis);
    
    // 4. Görsel URL'lerinin geçerliliğini kontrol et
    const validImages = await validateImageUrls(predictedImages);
    
    allImages.push(...validImages);

  } catch (error) {
    console.error('❌ ML Pattern Extractor hatası:', error);
  }

  console.log(`🤖 ML Pattern Extractor sonuç: ${allImages.length} ek görsel`);
  return allImages;
}

/**
 * URL'yi parse ederek ürün bilgilerini çıkarır
 */
function parseProductUrl(url: string): { productId: string | null, boutique: string | null } {
  const productIdMatch = url.match(/p-(\d+)/);
  const boutiqueMatch = url.match(/\/([^\/]+)\/[^\/]+-p-\d+/);
  
  return {
    productId: productIdMatch ? productIdMatch[1] : null,
    boutique: boutiqueMatch ? boutiqueMatch[1] : null
  };
}

/**
 * Sayfa kaynağını analiz eder
 */
async function analyzePageSource(url: string): Promise<PageAnalysis> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    },
    timeout: 15000
  });

  const html = response.data;
  
  return {
    existingImageUrls: extractImageUrlsFromHtml(html),
    cdnPatterns: analyzeCdnPatterns(html),
    imageHashes: extractImageHashes(html),
    colorVariants: extractColorVariants(html),
    sizeVariants: extractSizeVariants(html)
  };
}

/**
 * HTML'den mevcut görsel URL'lerini çıkarır
 */
function extractImageUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const patterns = [
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/\d+\/\d+\/[a-f0-9-]+\/\d+_org_zoom\.jpg/g,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/\d+\/\d+\/[a-f0-9-]+\/\d+_org\.jpg/g,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/\d+\/\d+\/\d+\/[a-f0-9-]+\.jpg/g
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      urls.push(match[0]);
    }
  });

  return Array.from(new Set(urls));
}

/**
 * CDN pattern'lerini analiz eder
 */
function analyzeCdnPatterns(html: string): CdnPattern[] {
  const patterns: CdnPattern[] = [];
  const tyVersions = new Set<string>();
  const dateFolders = new Set<string>();
  const timeFolders = new Set<string>();
  const imageHashes = new Set<string>();

  // Mevcut URL'lerden pattern'leri çıkar
  const existingUrls = extractImageUrlsFromHtml(html);
  
  existingUrls.forEach(url => {
    const match = url.match(/ty(\d+)\/prod\/QC\/(\d+)\/(\d+)\/([a-f0-9-]+)\//);
    if (match) {
      tyVersions.add(match[1]);
      dateFolders.add(match[2]);
      timeFolders.add(match[3]);
      imageHashes.add(match[4]);
    }
  });

  return [{
    tyVersions: Array.from(tyVersions),
    dateFolders: Array.from(dateFolders),
    timeFolders: Array.from(timeFolders),
    imageHashes: Array.from(imageHashes)
  }];
}

/**
 * Görsel hash'lerini çıkarır
 */
function extractImageHashes(html: string): string[] {
  const hashes: string[] = [];
  const hashPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
  
  let match;
  while ((match = hashPattern.exec(html)) !== null) {
    hashes.push(match[0]);
  }
  
  return Array.from(new Set(hashes));
}

/**
 * Renk varyantlarını çıkarır
 */
function extractColorVariants(html: string): string[] {
  const colors: string[] = [];
  
  // JSON-LD'den renk bilgilerini çıkar
  const jsonLdMatches = html.match(/"color":\s*"([^"]+)"/g);
  if (jsonLdMatches) {
    jsonLdMatches.forEach(match => {
      const colorMatch = match.match(/"color":\s*"([^"]+)"/);
      if (colorMatch) {
        colors.push(colorMatch[1]);
      }
    });
  }
  
  return Array.from(new Set(colors));
}

/**
 * Beden varyantlarını çıkarır
 */
function extractSizeVariants(html: string): string[] {
  const sizes: string[] = [];
  
  // JSON-LD'den beden bilgilerini çıkar
  const sizeMatches = html.match(/"size":\s*\[([^\]]+)\]/g);
  if (sizeMatches) {
    sizeMatches.forEach(match => {
      const sizeArrayMatch = match.match(/"size":\s*\[([^\]]+)\]/);
      if (sizeArrayMatch) {
        const sizeList = sizeArrayMatch[1].replace(/"/g, '').split(',');
        sizes.push(...sizeList.map(s => s.trim()));
      }
    });
  }
  
  return [...new Set(sizes)];
}

/**
 * ML tabanlı pattern'leri uygular
 */
async function applyMLPatterns(urlInfo: any, analysis: PageAnalysis): Promise<string[]> {
  const predictedImages: string[] = [];
  
  // Pattern 1: Zaman bazlı tahminler
  const timeBasedImages = generateTimeBasedVariations(urlInfo.productId, analysis.cdnPatterns);
  predictedImages.push(...timeBasedImages);
  
  // Pattern 2: Hash varyasyonları
  const hashBasedImages = generateHashBasedVariations(urlInfo.productId, analysis.imageHashes);
  predictedImages.push(...hashBasedImages);
  
  // Pattern 3: Renk varyant tahminleri
  const colorBasedImages = generateColorBasedVariations(urlInfo.productId, analysis.colorVariants, analysis.cdnPatterns);
  predictedImages.push(...colorBasedImages);
  
  // Pattern 4: Beden varyant tahminleri
  const sizeBasedImages = generateSizeBasedVariations(urlInfo.productId, analysis.sizeVariants, analysis.cdnPatterns);
  predictedImages.push(...sizeBasedImages);
  
  // Pattern 5: Sequencial image discovery
  const sequencialImages = generateSequencialVariations(analysis.existingImageUrls);
  predictedImages.push(...sequencialImages);
  
  return [...new Set(predictedImages)];
}

/**
 * Zaman bazlı varyasyonlar oluşturur
 */
function generateTimeBasedVariations(productId: string, patterns: CdnPattern[]): string[] {
  const variations: string[] = [];
  
  if (patterns.length === 0) return variations;
  
  const pattern = patterns[0];
  const imageNumbers = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const suffixes = ['_org_zoom.jpg', '_org.jpg'];
  
  // Son 3 aydaki tarih folder'ları tahmin et
  const recentDates = generateRecentDates();
  
  pattern.tyVersions.forEach(tyVersion => {
    recentDates.forEach(dateFolder => {
      pattern.timeFolders.forEach(timeFolder => {
        pattern.imageHashes.forEach(hash => {
          imageNumbers.forEach(imageNum => {
            suffixes.forEach(suffix => {
              const url = `https://cdn.dsmcdn.com/ty${tyVersion}/prod/QC/${dateFolder}/${timeFolder}/${hash}/${imageNum}${suffix}`;
              variations.push(url);
            });
          });
        });
      });
    });
  });
  
  return variations;
}

/**
 * Hash bazlı varyasyonlar oluşturur
 */
function generateHashBasedVariations(productId: string, hashes: string[]): string[] {
  const variations: string[] = [];
  const tyVersions = ['1617', '1605', '1606'];
  const imageNumbers = ['1', '2', '3', '4'];
  const suffixes = ['_org_zoom.jpg', '_org.jpg'];
  
  hashes.forEach(hash => {
    tyVersions.forEach(tyVersion => {
      const dateFolder = '20241226'; // En güncel tarih
      const timeFolder = '12';
      
      imageNumbers.forEach(imageNum => {
        suffixes.forEach(suffix => {
          const url = `https://cdn.dsmcdn.com/ty${tyVersion}/prod/QC/${dateFolder}/${timeFolder}/${hash}/${imageNum}${suffix}`;
          variations.push(url);
        });
      });
    });
  });
  
  return variations;
}

/**
 * Renk bazlı varyasyonlar oluşturur
 */
function generateColorBasedVariations(productId: string, colors: string[], patterns: CdnPattern[]): string[] {
  // Bu basit implementasyonda mevcut pattern'leri kullanıyoruz
  // Gerçek ML sisteminde renk-hash ilişkilerini öğrenebiliriz
  return generateTimeBasedVariations(productId, patterns).slice(0, 20);
}

/**
 * Beden bazlı varyasyonlar oluşturur
 */
function generateSizeBasedVariations(productId: string, sizes: string[], patterns: CdnPattern[]): string[] {
  // Bu basit implementasyonda mevcut pattern'leri kullanıyoruz
  return generateTimeBasedVariations(productId, patterns).slice(0, 15);
}

/**
 * Sequencial varyasyonlar oluşturur
 */
function generateSequencialVariations(existingUrls: string[]): string[] {
  const variations: string[] = [];
  
  existingUrls.forEach(url => {
    // Görsel numarasını artırarak yeni URL'ler tahmin et
    for (let i = 1; i <= 10; i++) {
      const newUrl = url.replace(/\/(\d+)_org/, `/${i}_org`);
      if (newUrl !== url) {
        variations.push(newUrl);
      }
    }
  });
  
  return variations;
}

/**
 * Son 3 aydaki tarih folder'ları oluşturur
 */
function generateRecentDates(): string[] {
  const dates = [];
  const currentDate = new Date();
  
  for (let i = 0; i < 90; i++) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    dates.push(dateStr);
  }
  
  return dates.slice(0, 10); // Son 10 gün
}

/**
 * Görsel URL'lerinin geçerliliğini kontrol eder
 */
async function validateImageUrls(urls: string[]): Promise<string[]> {
  const validUrls: string[] = [];
  const batchSize = 5;
  
  for (let i = 0; i < Math.min(urls.length, 25); i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const response = await axios.head(url, { 
            timeout: 3000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          return response.status === 200 ? url : null;
        } catch {
          return null;
        }
      })
    );
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        validUrls.push(result.value);
      }
    });
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return validUrls;
}

interface PageAnalysis {
  existingImageUrls: string[];
  cdnPatterns: CdnPattern[];
  imageHashes: string[];
  colorVariants: string[];
  sizeVariants: string[];
}

interface CdnPattern {
  tyVersions: string[];
  dateFolders: string[];
  timeFolders: string[];
  imageHashes: string[];
}