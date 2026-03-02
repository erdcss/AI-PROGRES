/**
 * Network Request Tabanlı Görsel Çıkarıcı
 * Trendyol'un internal API'lerini yakalayarak görselleri direkt alır
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { detectAndBypassProtection } from './detect-bot';

// Stealth plugin'i ekle
puppeteer.use(StealthPlugin());

/**
 * Network request'leri dinleyerek ürün görsellerini yakalar
 * @param url Ürün sayfası URL'si
 * @returns Bulunan tüm görsel URL'leri
 */
export async function extractImagesFromNetwork(url: string): Promise<string[]> {
  let browser;
  const imageUrls: string[] = [];
  
  try {
    console.log(`Network tabanlı görsel çıkarma başlıyor: ${url}`);
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    
    // Bot korumasını aktifleştir
    await detectAndBypassProtection(page);
    
    // Network request'leri dinle
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      const requestUrl = request.url();
      
      // Ürün görseli URL'lerini yakala
      if (requestUrl.includes('cdn.dsmcdn.com') || requestUrl.includes('cdn.trendyol.com')) {
        if (requestUrl.includes('/ty') && 
            (requestUrl.includes('.jpg') || requestUrl.includes('.jpeg') || requestUrl.includes('.png') || requestUrl.includes('.webp'))) {
          
          // Boyut bilgilerini kontrol et - sadece büyük görselleri al
          if (requestUrl.includes('org_zoom') || 
              requestUrl.includes('1200') || 
              requestUrl.includes('1800') ||
              requestUrl.includes('mnresize/600') ||
              requestUrl.includes('mnresize/800')) {
            
            // Zaten var mı kontrol et
            if (!imageUrls.includes(requestUrl)) {
              console.log(`Network'ten görsel yakalandı: ${requestUrl}`);
              imageUrls.push(requestUrl);
            }
          }
        }
      }
      
      request.continue();
    });

    // Response'ları da dinle
    page.on('response', async response => {
      const responseUrl = response.url();
      
      // API response'larında görsel URL'leri ara
      if (responseUrl.includes('api/') || responseUrl.includes('/sr/')) {
        try {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const jsonData = await response.json();
            
            // JSON içindeki tüm görsel URL'lerini çıkar
            const extractedImages = extractImageUrlsFromJson(jsonData);
            extractedImages.forEach(imgUrl => {
              if (!imageUrls.includes(imgUrl)) {
                console.log(`API response'tan görsel bulundu: ${imgUrl}`);
                imageUrls.push(imgUrl);
              }
            });
          }
        } catch (error) {
          // JSON parse hatası - devam et
        }
      }
    });

    // Sayfayı yükle
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Sayfa yüklendikten sonra ek görselleri bulmak için scroll yap
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Görsel galeri elemanlarını kontrol et
    const galleryImages = await page.evaluate(() => {
      const images: string[] = [];
      
      // Farklı görsel galeri seçicilerini dene
      const selectors = [
        'img[data-src*="org_zoom"]',
        'img[src*="org_zoom"]', 
        'img[data-src*="mnresize"]',
        'img[src*="mnresize"]',
        '.gallery img',
        '.image-gallery img',
        '.product-images img',
        '[data-testid*="image"] img'
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const img = el as HTMLImageElement;
          const src = img.dataset.src || img.src;
          if (src && 
              (src.includes('cdn.dsmcdn.com') || src.includes('cdn.trendyol.com')) &&
              (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp'))) {
            images.push(src);
          }
        });
      });
      
      return images;
    });

    // Galeri görsellerini ana listeye ekle
    galleryImages.forEach(imgUrl => {
      if (!imageUrls.includes(imgUrl)) {
        console.log(`Galeri'den görsel bulundu: ${imgUrl}`);
        imageUrls.push(imgUrl);
      }
    });

    // Görselleri optimize et (küçük boyutları büyük boyutlara çevir)
    const optimizedImages = imageUrls.map(url => {
      return url
        .replace('/128/192/', '/1200/1800/')
        .replace('/170/247/', '/1200/1800/')
        .replace('/236/347/', '/1200/1800/')
        .replace('/mnresize/300/', '/mnresize/1200/')
        .replace('/mnresize/400/', '/mnresize/1200/')
        .replace('/mnresize/600/', '/mnresize/1200/');
    });

    // Tekrarları kaldır
    const uniqueImages = Array.from(new Set(optimizedImages));
    
    console.log(`Network tabanlı çıkarma tamamlandı. ${uniqueImages.length} görsel bulundu`);
    return uniqueImages;

  } catch (error) {
    console.error('Network tabanlı görsel çıkarma hatası:', error);
    return imageUrls;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * JSON verisi içindeki tüm görsel URL'lerini recursive olarak çıkarır
 * @param obj JSON objesi
 * @returns Bulunan görsel URL'leri
 */
function extractImageUrlsFromJson(obj: any): string[] {
  const images: string[] = [];
  
  function recursiveExtract(data: any) {
    if (typeof data === 'string') {
      // String bir görsel URL'si mi kontrol et
      if ((data.includes('cdn.dsmcdn.com') || data.includes('cdn.trendyol.com')) &&
          (data.includes('.jpg') || data.includes('.jpeg') || data.includes('.png') || data.includes('.webp'))) {
        images.push(data);
      }
    } else if (Array.isArray(data)) {
      data.forEach(item => recursiveExtract(item));
    } else if (typeof data === 'object' && data !== null) {
      Object.values(data).forEach(value => recursiveExtract(value));
    }
  }
  
  recursiveExtract(obj);
  return images;
}

/**
 * Hibrit görsel çıkarma - hem network hem de DOM parsing
 * @param url Ürün URL'si
 * @returns Tüm bulunan görsellerin birleşimi
 */
export async function hybridImageExtraction(url: string): Promise<string[]> {
  console.log('Hibrit görsel çıkarma başlıyor...');
  
  try {
    // Network tabanlı çıkarma
    const networkImages = await extractImagesFromNetwork(url);
    
    // Mevcut JSON-LD tabanlı çıkarma (yedek olarak)
    const { getAllProductImages } = await import('./image-extractor');
    const jsonLdImages = await getAllProductImages(url);
    
    // Tüm görselleri birleştir
    const allImages = [...networkImages, ...jsonLdImages];
    const uniqueImages = Array.from(new Set(allImages));
    
    // En iyi kalitedeki görselleri seç (org_zoom öncelikli)
    const sortedImages = uniqueImages.sort((a, b) => {
      if (a.includes('org_zoom') && !b.includes('org_zoom')) return -1;
      if (!a.includes('org_zoom') && b.includes('org_zoom')) return 1;
      if (a.includes('1200') && !b.includes('1200')) return -1;
      if (!a.includes('1200') && b.includes('1200')) return 1;
      return 0;
    });
    
    console.log(`Hibrit çıkarma tamamlandı: ${sortedImages.length} görsel`);
    return sortedImages.slice(0, 15); // Maksimum 15 görsel
    
  } catch (error) {
    console.error('Hibrit görsel çıkarma hatası:', error);
    // Hata durumunda fallback olarak mevcut sistemi kullan
    const { getAllProductImages } = await import('./image-extractor');
    return await getAllProductImages(url);
  }
}