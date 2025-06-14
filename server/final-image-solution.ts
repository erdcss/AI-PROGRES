/**
 * Final Image Solution - Kesin Çözüm
 * Trendyol'dan gerçek ürün görselleri çıkarmak için nihai sistem
 */

import * as cheerio from 'cheerio';
import axios from 'axios';

export async function getFinalImages(url: string): Promise<string[]> {
  console.log('🎯 Final Image Solution başlatılıyor...');
  
  try {
    // 1. Sayfa kaynağını al
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    // 2. Ürün ID'sini çıkar
    const productIdMatch = url.match(/p-(\d+)/);
    if (!productIdMatch) {
      console.log('❌ Ürün ID bulunamadı');
      return [];
    }
    
    const productId = productIdMatch[1];
    console.log(`📦 Ürün ID: ${productId}`);
    
    // 3. JSON-LD'den görselleri çıkar - gelişmiş algoritma
    const finalImages: string[] = [];
    
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const scriptContent = $(el).text();
        if (!scriptContent) return;
        
        const data = JSON.parse(scriptContent);
        
        if (data["@type"] === "ProductGroup") {
          // Ana ürün görselleri
          if (data.image && data.image.contentUrl) {
            if (Array.isArray(data.image.contentUrl)) {
              data.image.contentUrl.forEach((imgUrl: string) => {
                if (imgUrl && isRealProductImage(imgUrl) && !finalImages.includes(imgUrl)) {
                  finalImages.push(imgUrl);
                }
              });
            }
          }
          
          // Varyant görselleri
          if (data.hasVariant && Array.isArray(data.hasVariant)) {
            data.hasVariant.forEach((variant: any) => {
              if (variant.image) {
                let variantImageUrl = '';
                if (typeof variant.image === 'string') {
                  variantImageUrl = variant.image;
                } else if (variant.image.contentUrl) {
                  variantImageUrl = variant.image.contentUrl;
                }
                
                if (variantImageUrl && isRealProductImage(variantImageUrl) && !finalImages.includes(variantImageUrl)) {
                  finalImages.push(variantImageUrl);
                }
              }
            });
          }
        }
      } catch (error) {
        // JSON parse hatası, devam et
      }
    });
    
    // 4. Pattern-based görsel URL'leri oluştur
    const patternImages = generatePatternImages(productId);
    patternImages.forEach(img => {
      if (!finalImages.includes(img)) {
        finalImages.push(img);
      }
    });
    
    // 5. HTML'den ek görselleri çıkar
    const htmlImages = extractFromHTML($);
    htmlImages.forEach(img => {
      if (isRealProductImage(img) && !finalImages.includes(img)) {
        finalImages.push(img);
      }
    });
    
    // 6. Duplicate'leri kaldır ve kaliteye göre sırala
    const uniqueImages = Array.from(new Set(finalImages));
    const qualityImages = sortByQuality(uniqueImages);
    
    console.log(`🎯 Final Solution sonuç: ${qualityImages.length} benzersiz kaliteli görsel`);
    return qualityImages;
    
  } catch (error) {
    console.error('❌ Final Image Solution hatası:', error);
    return [];
  }
}

/**
 * Gerçek ürün görseli kontrolü - gelişmiş filtre
 */
function isRealProductImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Trendyol CDN'den olmalı
  if (!url.includes('cdn.dsmcdn.com')) return false;
  
  // Görsel dosyası olmalı
  if (!url.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i)) return false;
  
  // Logoları ve icon'ları filtrele
  const excludePatterns = [
    'logo', 'icon', 'badge', 'sprite', 'placeholder', 'avatar',
    'ty-web.svg', 'favicon', 'button', 'arrow', 'star', 'rating',
    'social', 'payment', 'delivery', 'security', 'banner', 'advertisement',
    'default-thumb', 'basketPreview', 'master/', 'web/master'
  ];
  
  const urlLower = url.toLowerCase();
  if (excludePatterns.some(pattern => urlLower.includes(pattern))) {
    return false;
  }
  
  // Ürün görseli pattern'lerini kontrol et
  const productPatterns = [
    '/product/media/images/',
    '/prod/QC/',
    '/prod/SPM/',
    '/ty\\d+/product/',
    '_org_zoom',
    '_org\\.jpg'
  ];
  
  const hasProductPattern = productPatterns.some(pattern => 
    new RegExp(pattern, 'i').test(url)
  );
  
  return hasProductPattern;
}

/**
 * Pattern-based görsel URL'leri oluştur
 */
function generatePatternImages(productId: string): string[] {
  const patterns: string[] = [];
  
  // Farklı ty versiyonları ve pattern'ler
  const tyVersions = ['1617', '1605', '1606', '1307', '1308', '1309'];
  const dates = ['20241226/12', '20241124/23', '20240510/16', '20240315/14'];
  const qualities = ['_org_zoom.jpg', '_org.jpg'];
  
  tyVersions.forEach(version => {
    dates.forEach(date => {
      qualities.forEach(quality => {
        // SPM/PIM pattern
        patterns.push(`https://cdn.dsmcdn.com/ty${version}/product/media/images/prod/SPM/PIM/${date}/${productId}/1${quality}`);
        patterns.push(`https://cdn.dsmcdn.com/ty${version}/product/media/images/prod/SPM/PIM/${date}/${productId}/2${quality}`);
        patterns.push(`https://cdn.dsmcdn.com/ty${version}/product/media/images/prod/SPM/PIM/${date}/${productId}/3${quality}`);
        
        // QC pattern
        patterns.push(`https://cdn.dsmcdn.com/ty${version}/prod/QC/${date}/${productId}/1${quality}`);
        patterns.push(`https://cdn.dsmcdn.com/ty${version}/prod/QC/${date}/${productId}/2${quality}`);
        
        // mnresize patterns
        patterns.push(`https://cdn.dsmcdn.com/mnresize/1200/1800/ty${version}/product/media/images/prod/SPM/PIM/${date}/${productId}/1${quality}`);
      });
    });
  });
  
  return patterns;
}

/**
 * HTML'den görselleri çıkar
 */
function extractFromHTML($: cheerio.CheerioAPI): string[] {
  const images: string[] = [];
  
  // Farklı selector'lar
  const selectors = [
    'img[src*="cdn.dsmcdn.com"]',
    'img[data-src*="cdn.dsmcdn.com"]',
    'img[data-original*="cdn.dsmcdn.com"]'
  ];
  
  selectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-original');
      if (src && !images.includes(src)) {
        images.push(src);
      }
    });
  });
  
  return images;
}

/**
 * Görselleri kaliteye göre sırala
 */
function sortByQuality(images: string[]): string[] {
  return images.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    
    // org_zoom en yüksek kalite
    if (a.includes('_org_zoom')) scoreA += 100;
    if (b.includes('_org_zoom')) scoreB += 100;
    
    // org ikinci kalite
    if (a.includes('_org') && !a.includes('_org_zoom')) scoreA += 80;
    if (b.includes('_org') && !b.includes('_org_zoom')) scoreB += 80;
    
    // Büyük boyutlar
    if (a.includes('/1200/1800/')) scoreA += 60;
    if (b.includes('/1200/1800/')) scoreB += 60;
    
    // Yeni ty versiyonları
    const tyVersionA = a.match(/ty(\d+)/)?.[1];
    const tyVersionB = b.match(/ty(\d+)/)?.[1];
    if (tyVersionA) scoreA += parseInt(tyVersionA) / 10000;
    if (tyVersionB) scoreB += parseInt(tyVersionB) / 10000;
    
    return scoreB - scoreA;
  });
}