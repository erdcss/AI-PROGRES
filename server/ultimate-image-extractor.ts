/**
 * Ultimate Image Extractor - Kesin Çözüm
 * Trendyol'dan maksimum ve benzersiz görsel çıkarmak için optimized sistem
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export async function extractUltimateImages(url: string): Promise<string[]> {
  console.log('🎯 Ultimate Image Extractor başlatılıyor...');
  
  const allImages: string[] = [];
  
  try {
    // 1. Sayfa kaynağını al
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    // 2. JSON-LD'den benzersiz görselleri çıkar
    const jsonLdImages = extractFromJsonLD($, html);
    console.log(`📸 JSON-LD'den ${jsonLdImages.length} görsel bulundu`);
    
    // 3. HTML'den farklı yöntemlerle görselleri çıkar
    const htmlImages = extractFromHTML($);
    console.log(`🔍 HTML'den ${htmlImages.length} görsel bulundu`);
    
    // 4. Script tag'lerinden görselleri çıkar
    const scriptImages = extractFromScripts($);
    console.log(`📜 Script'lerden ${scriptImages.length} görsel bulundu`);
    
    // 5. Tüm görselleri birleştir
    allImages.push(...jsonLdImages, ...htmlImages, ...scriptImages);
    
    // 6. Duplicate'leri kaldır ve filtrele
    const uniqueImages = Array.from(new Set(allImages));
    const validImages = uniqueImages.filter(img => isValidProductImage(img));
    
    // 7. Görselleri kaliteye göre sırala
    const sortedImages = sortImagesByQuality(validImages);
    
    console.log(`🎯 Ultimate Extractor sonuç: ${sortedImages.length} benzersiz kaliteli görsel`);
    return sortedImages;
    
  } catch (error) {
    console.error('❌ Ultimate Image Extractor hatası:', error);
    return [];
  }
}

/**
 * JSON-LD structured data'dan görselleri çıkarır
 */
function extractFromJsonLD($: cheerio.CheerioAPI, html: string): string[] {
  const images: string[] = [];
  
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const scriptContent = $(el).text();
      if (!scriptContent) return;
      
      const data = JSON.parse(scriptContent);
      
      // ProductGroup yapısı
      if (data["@type"] === "ProductGroup") {
        // Ana ürün görselleri
        if (data.image && data.image.contentUrl) {
          if (Array.isArray(data.image.contentUrl)) {
            data.image.contentUrl.forEach((imgUrl: string) => {
              if (imgUrl && !images.includes(imgUrl)) {
                images.push(imgUrl);
              }
            });
          } else if (typeof data.image.contentUrl === 'string') {
            images.push(data.image.contentUrl);
          }
        }
        
        // Varyant görselleri
        if (data.hasVariant && Array.isArray(data.hasVariant)) {
          data.hasVariant.forEach((variant: any) => {
            if (variant.image) {
              if (typeof variant.image === 'string' && !images.includes(variant.image)) {
                images.push(variant.image);
              } else if (variant.image.contentUrl && !images.includes(variant.image.contentUrl)) {
                images.push(variant.image.contentUrl);
              }
            }
          });
        }
      }
      
      // Product yapısı
      if (data["@type"] === "Product") {
        if (data.image) {
          if (typeof data.image === 'string' && !images.includes(data.image)) {
            images.push(data.image);
          } else if (data.image.url && !images.includes(data.image.url)) {
            images.push(data.image.url);
          } else if (Array.isArray(data.image)) {
            data.image.forEach((img: any) => {
              const imgUrl = typeof img === 'string' ? img : img.url;
              if (imgUrl && !images.includes(imgUrl)) {
                images.push(imgUrl);
              }
            });
          }
        }
      }
      
    } catch (error) {
      // JSON parse hatası, devam et
    }
  });
  
  return images;
}

/**
 * HTML'den farklı selector'larla görselleri çıkarır
 */
function extractFromHTML($: cheerio.CheerioAPI): string[] {
  const images: string[] = [];
  
  // Farklı görsel selector'ları
  const selectors = [
    'img[src*="cdn.dsmcdn.com"]',
    'img[data-src*="cdn.dsmcdn.com"]',
    'img[data-original*="cdn.dsmcdn.com"]',
    'img[data-lazy*="cdn.dsmcdn.com"]',
    '[data-image*="cdn.dsmcdn.com"]',
    '[style*="background-image"][style*="cdn.dsmcdn.com"]'
  ];
  
  selectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      
      // Farklı attribute'lardan URL çıkar
      const possibleUrls = [
        $el.attr('src'),
        $el.attr('data-src'),
        $el.attr('data-original'),
        $el.attr('data-lazy'),
        $el.attr('data-image'),
        extractFromStyle($el.attr('style'))
      ].filter(Boolean);
      
      possibleUrls.forEach(url => {
        if (url && !images.includes(url)) {
          images.push(url);
        }
      });
    });
  });
  
  return images;
}

/**
 * Script tag'lerinden görselleri çıkarır
 */
function extractFromScripts($: cheerio.CheerioAPI): string[] {
  const images: string[] = [];
  
  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    if (!scriptContent) return;
    
    // JavaScript içindeki görsel URL'lerini bul
    const patterns = [
      /"(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/g,
      /'(https:\/\/cdn\.dsmcdn\.com[^']*\.(?:jpg|jpeg|png|webp)[^']*)'/g,
      /url\s*:\s*["'](https:\/\/cdn\.dsmcdn\.com[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/g,
      /src\s*:\s*["'](https:\/\/cdn\.dsmcdn\.com[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(scriptContent)) !== null) {
        const imageUrl = match[1];
        if (imageUrl && !images.includes(imageUrl)) {
          images.push(imageUrl);
        }
      }
    });
  });
  
  return images;
}

/**
 * Style attribute'undan background-image URL'sini çıkarır
 */
function extractFromStyle(style: string | undefined): string | null {
  if (!style) return null;
  
  const match = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
  return match ? match[1] : null;
}

/**
 * Geçerli ürün görseli kontrolü
 */
function isValidProductImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Trendyol CDN'den olmalı
  if (!url.includes('cdn.dsmcdn.com')) return false;
  
  // Görsel dosyası olmalı
  if (!url.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i)) return false;
  
  // Gereksiz görselleri filtrele
  const excludePatterns = [
    'logo',
    'badge',
    'icon',
    'sprite',
    'placeholder',
    'avatar',
    'button',
    'arrow',
    'star',
    'rating',
    'social',
    'payment',
    'delivery',
    'security',
    'banner',
    'advertisement',
    'ty-web.svg',
    'favicon'
  ];
  
  const urlLower = url.toLowerCase();
  if (excludePatterns.some(pattern => urlLower.includes(pattern))) {
    return false;
  }
  
  // Çok küçük görselleri filtrele (boyut URL'de varsa)
  const sizeMatch = url.match(/(\d+)x(\d+)/);
  if (sizeMatch) {
    const width = parseInt(sizeMatch[1]);
    const height = parseInt(sizeMatch[2]);
    if (width < 100 || height < 100) return false;
  }
  
  // mnresize ile küçültülmüş görselleri tercih etme
  if (url.includes('mnresize') && (url.includes('/50/') || url.includes('/75/') || url.includes('/100/'))) {
    return false;
  }
  
  return true;
}

/**
 * Görselleri kaliteye göre sıralar
 */
function sortImagesByQuality(images: string[]): string[] {
  return images.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    
    // org_zoom en yüksek kalite
    if (a.includes('_org_zoom')) scoreA += 100;
    if (b.includes('_org_zoom')) scoreB += 100;
    
    // org ikinci en yüksek kalite
    if (a.includes('_org') && !a.includes('_org_zoom')) scoreA += 80;
    if (b.includes('_org') && !b.includes('_org_zoom')) scoreB += 80;
    
    // Büyük boyutlar tercih
    if (a.includes('/1200/') || a.includes('/1800/')) scoreA += 60;
    if (b.includes('/1200/') || b.includes('/1800/')) scoreB += 60;
    
    // ty1617, ty1605 gibi yeni versiyonlar tercih
    const tyVersionA = a.match(/ty(\d+)/)?.[1];
    const tyVersionB = b.match(/ty(\d+)/)?.[1];
    if (tyVersionA) scoreA += parseInt(tyVersionA) / 10000;
    if (tyVersionB) scoreB += parseInt(tyVersionB) / 10000;
    
    // mnresize küçük boyutları cezalandır
    if (a.includes('mnresize')) {
      const sizeMatch = a.match(/mnresize\/(\d+)/);
      if (sizeMatch) {
        const size = parseInt(sizeMatch[1]);
        scoreA -= (500 - size) / 10; // Küçük boyutları cezalandır
      }
    }
    
    if (b.includes('mnresize')) {
      const sizeMatch = b.match(/mnresize\/(\d+)/);
      if (sizeMatch) {
        const size = parseInt(sizeMatch[1]);
        scoreB -= (500 - size) / 10;
      }
    }
    
    return scoreB - scoreA; // Yüksek skordan düşüğe sırala
  });
}