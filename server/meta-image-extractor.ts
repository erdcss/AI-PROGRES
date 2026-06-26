/**
 * Meta ve Structured Data Tabanlı Görsel Çıkarıcı
 * HTML meta tagları, Open Graph, schema.org ve diğer yapılandırılmış verilerden görselleri çıkarır
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Meta tag'lerden ve structured data'dan görselleri çıkarır
 */
export async function extractFromMetaAndStructuredData(url: string): Promise<string[]> {
  const images: string[] = [];
  
  try {
    console.log('Meta tag ve structured data analizi başlıyor...');
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    
    // 1. Open Graph görselleri
    $('meta[property^="og:image"]').each((_, element) => {
      const content = $(element).attr('content');
      if (content && isValidImageUrl(content)) {
        images.push(content);
        console.log(`Open Graph görsel bulundu: ${content}`);
      }
    });

    // 2. Twitter Card görselleri
    $('meta[name^="twitter:image"]').each((_, element) => {
      const content = $(element).attr('content');
      if (content && isValidImageUrl(content)) {
        images.push(content);
        console.log(`Twitter Card görsel bulundu: ${content}`);
      }
    });

    // 3. Schema.org structured data
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonText = $(element).html();
        if (jsonText) {
          const data = JSON.parse(jsonText);
          const schemaImages = extractImagesFromSchema(data);
          schemaImages.forEach(img => {
            if (!images.includes(img)) {
              images.push(img);
              console.log(`Schema.org görsel bulundu: ${img}`);
            }
          });
        }
      } catch (error) {
        console.log('Schema.org JSON parse hatası, devam ediliyor...');
      }
    });

    // 4. Link rel preload/prefetch görselleri
    $('link[rel="preload"][as="image"], link[rel="prefetch"][as="image"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && isValidImageUrl(href)) {
        images.push(href);
        console.log(`Preload görsel bulundu: ${href}`);
      }
    });

    // 5. Meta property image tag'leri
    $('meta[property*="image"], meta[name*="image"]').each((_, element) => {
      const content = $(element).attr('content');
      if (content && isValidImageUrl(content)) {
        images.push(content);
        console.log(`Meta property görsel bulundu: ${content}`);
      }
    });

    // 6. Favicon ve icon'lar (büyük boyutlular)
    $('link[rel*="icon"]').each((_, element) => {
      const href = $(element).attr('href');
      const sizes = $(element).attr('sizes');
      
      if (href && isValidImageUrl(href)) {
        // Sadece büyük boyutlu icon'ları al
        if (!sizes || sizes.includes('192') || sizes.includes('256') || sizes.includes('512')) {
          images.push(href);
          console.log(`Icon görsel bulundu: ${href}`);
        }
      }
    });

    // 7. Apple touch icon'ları
    $('link[rel*="apple-touch-icon"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && isValidImageUrl(href)) {
        images.push(href);
        console.log(`Apple touch icon bulundu: ${href}`);
      }
    });

    // 8. Manifest dosyasından icon'lar
    const manifestLinks = $('link[rel="manifest"]');
    for (let i = 0; i < manifestLinks.length; i++) {
      const element = manifestLinks[i];
      const href = $(element).attr('href');
      if (href) {
        try {
          const manifestUrl = new URL(href, url).href;
          const manifestResponse = await axios.get(manifestUrl, { timeout: 5000 });
          const manifest = manifestResponse.data;
          
          if (manifest.icons && Array.isArray(manifest.icons)) {
            manifest.icons.forEach((icon: any) => {
              if (icon.src && isValidImageUrl(icon.src)) {
                const iconUrl = new URL(icon.src, url).href;
                images.push(iconUrl);
                console.log(`Manifest icon bulundu: ${iconUrl}`);
              }
            });
          }
        } catch (error) {
          console.log('Manifest dosyası okunamadı, devam ediliyor...');
        }
      }
    }

    // 9. Product mikrodata
    $('[itemtype*="Product"]').each((_, element) => {
      $(element).find('[itemprop="image"]').each((_, imgElement) => {
        const src = $(imgElement).attr('src') || $(imgElement).attr('content');
        if (src && isValidImageUrl(src)) {
          images.push(src);
          console.log(`Mikrodata ürün görseli bulundu: ${src}`);
        }
      });
    });

    console.log(`Meta ve structured data analizinden ${images.length} görsel çıkarıldı`);
    return images;

  } catch (error) {
    console.error('Meta ve structured data analizi hatası:', error);
    return images;
  }
}

/**
 * Schema.org verilerinden görselleri çıkarır
 */
function extractImagesFromSchema(data: any): string[] {
  const images: string[] = [];
  
  function extractRecursive(obj: any, depth = 0) {
    if (depth > 10) return; // Sonsuz döngüyü önle
    
    if (typeof obj === 'string' && isValidImageUrl(obj)) {
      images.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(item => extractRecursive(item, depth + 1));
    } else if (typeof obj === 'object' && obj !== null) {
      // Özel image alanları
      const imageFields = [
        'image', 'images', 'photo', 'photos', 'picture', 'pictures',
        'thumbnail', 'thumbnails', 'logo', 'icon', 'contentUrl',
        'url', 'sameAs', 'primaryImageOfPage'
      ];
      
      imageFields.forEach(field => {
        if (obj[field]) {
          extractRecursive(obj[field], depth + 1);
        }
      });
      
      // Diğer alanları da kontrol et
      Object.values(obj).forEach(value => {
        if (typeof value === 'string' && isValidImageUrl(value)) {
          images.push(value);
        } else if (typeof value === 'object') {
          extractRecursive(value, depth + 1);
        }
      });
    }
  }
  
  extractRecursive(data);
  return Array.from(new Set(images)); // Tekrarları kaldır
}

/**
 * URL'nin geçerli bir görsel URL'si olup olmadığını kontrol eder
 */
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Trendyol CDN URL'leri
  if (url.includes('cdn.dsmcdn.com') || url.includes('cdn.trendyol.com')) {
    return url.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i) !== null;
  }
  
  // Genel görsel URL'leri
  return url.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i) !== null;
}

/**
 * Relative URL'leri absolute URL'lere çevirir
 */
function resolveUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (error) {
    return relativeUrl;
  }
}

/**
 * CSS dosyalarından background image'leri çıkarır
 */
export async function extractFromCSS(url: string): Promise<string[]> {
  const images: string[] = [];
  
  try {
    console.log('CSS background image analizi başlıyor...');
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    
    // Inline CSS'leri kontrol et
    $('style').each((_, element) => {
      const cssText = $(element).html();
      if (cssText) {
        const backgroundImages = extractBackgroundImagesFromCSS(cssText);
        backgroundImages.forEach(img => {
          const absoluteUrl = resolveUrl(url, img);
          if (isValidImageUrl(absoluteUrl)) {
            images.push(absoluteUrl);
            console.log(`CSS background image bulundu: ${absoluteUrl}`);
          }
        });
      }
    });
    
    // External CSS dosyalarını kontrol et
    const stylesheetLinks = $('link[rel="stylesheet"]');
    for (let i = 0; i < stylesheetLinks.length; i++) {
      const element = stylesheetLinks[i];
      const href = $(element).attr('href');
      if (href) {
        try {
          const cssUrl = resolveUrl(url, href);
          const cssResponse = await axios.get(cssUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
          });
          
          const backgroundImages = extractBackgroundImagesFromCSS(cssResponse.data);
          backgroundImages.forEach(img => {
            const absoluteUrl = resolveUrl(cssUrl, img);
            if (isValidImageUrl(absoluteUrl)) {
              images.push(absoluteUrl);
              console.log(`External CSS background image bulundu: ${absoluteUrl}`);
            }
          });
        } catch (error) {
          console.log(`CSS dosyası okunamadı: ${href}`);
        }
      }
    }

    console.log(`CSS analizinden ${images.length} görsel çıkarıldı`);
    return images;

  } catch (error) {
    console.error('CSS analizi hatası:', error);
    return images;
  }
}

/**
 * CSS metninden background-image URL'lerini çıkarır
 */
function extractBackgroundImagesFromCSS(cssText: string): string[] {
  const images: string[] = [];
  const urlPattern = /background(?:-image)?\s*:\s*url\(['"]?([^'")]+)['"]?\)/gi;
  
  let match;
  while ((match = urlPattern.exec(cssText)) !== null) {
    const imageUrl = match[1];
    if (imageUrl && !imageUrl.startsWith('data:')) {
      images.push(imageUrl);
    }
  }
  
  return images;
}

/**
 * Master meta görsel çıkarma fonksiyonu
 */
export async function extractAllMetaImages(url: string): Promise<string[]> {
  const allImages: string[] = [];
  
  // 1. Meta ve structured data
  const metaImages = await extractFromMetaAndStructuredData(url);
  allImages.push(...metaImages);
  
  // 2. CSS background images
  const cssImages = await extractFromCSS(url);
  allImages.push(...cssImages);
  
  // Tekrarları kaldır ve optimize et
  const uniqueImages = Array.from(new Set(allImages));
  
  // Trendyol görselleri için optimize et
  const optimizedImages = uniqueImages.map(img => {
    if (img.includes('cdn.dsmcdn.com') || img.includes('cdn.trendyol.com')) {
      return img
        .replace(/\/\d+\/\d+\//, '/1200/1800/')
        .replace(/mnresize\/\d+/, 'mnresize/1200');
    }
    return img;
  }).filter(img => isValidImageUrl(img));
  
  console.log(`Meta görsel çıkarma tamamlandı: ${optimizedImages.length} görsel`);
  return optimizedImages;
}