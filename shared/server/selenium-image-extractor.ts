/**
 * Selenium WebDriver Tabanlı Görsel Çıkarıcı
 * JavaScript tamamen yüklendikten sonra dinamik içeriği yakalar
 */

import { Builder, By, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

/**
 * Selenium ile görselleri çıkarır
 * @param url Ürün URL'si
 * @returns Bulunan tüm görsel URL'leri
 */
export async function extractImagesWithSelenium(url: string): Promise<string[]> {
  let driver: WebDriver | null = null;
  const images: string[] = [];

  try {
    console.log(`Selenium ile görsel çıkarma başlıyor: ${url}`);

    // Chrome seçenekleri
    const options = new chrome.Options();
    options.addArguments(
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images=false'
    );

    // Chrome driver oluştur
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // User-Agent ayarla
    await driver.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    `);

    // Sayfayı yükle
    await driver.get(url);

    // Sayfa yüklenene kadar bekle
    await driver.wait(until.elementLocated(By.css('body')), 15000);

    // JavaScript yüklenmesi için ekstra bekleme
    await driver.sleep(3000);

    // Sayfayı scroll yap - görsel lazy loading'i tetiklmek için
    await driver.executeScript(`
      // Yavaş scroll yaparak tüm görsellerin yüklenmesini sağla
      let scrollHeight = document.body.scrollHeight;
      let currentPosition = 0;
      let step = 300;
      
      function scrollStep() {
        window.scrollTo(0, currentPosition);
        currentPosition += step;
        if (currentPosition < scrollHeight) {
          setTimeout(scrollStep, 500);
        }
      }
      scrollStep();
    `);

    // Scroll işleminin tamamlanması için bekle
    await driver.sleep(5000);

    // Ürün galeri görselleri - ana görseller
    const galleryImages = await driver.findElements(By.css('img[data-src*="cdn.dsmcdn.com"], img[src*="cdn.dsmcdn.com"], img[data-src*="cdn.trendyol.com"], img[src*="cdn.trendyol.com"]'));
    
    for (const img of galleryImages) {
      try {
        let src = await img.getAttribute('data-src');
        if (!src) {
          src = await img.getAttribute('src');
        }
        
        if (src && (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp'))) {
          // Küçük boyutları büyük boyutlara çevir
          const optimizedSrc = src
            .replace(/\/\d+\/\d+\//, '/1200/1800/')
            .replace(/mnresize\/\d+/, 'mnresize/1200')
            .replace(/crop\/\d+/, 'crop/1200');
          
          if (!images.includes(optimizedSrc)) {
            images.push(optimizedSrc);
            console.log(`Selenium ile görsel bulundu: ${optimizedSrc}`);
          }
        }
      } catch (error) {
        // Element hatasını atla, devam et
        continue;
      }
    }

    // Thumbnail görselleri - küçük önizlemeler
    const thumbnails = await driver.findElements(By.css('.image-thumb img, .thumbnail img, .product-image-thumb img'));
    
    for (const thumb of thumbnails) {
      try {
        let src = await thumb.getAttribute('data-src') || await thumb.getAttribute('src');
        
        if (src && (src.includes('cdn.dsmcdn.com') || src.includes('cdn.trendyol.com'))) {
          // Thumbnail'i full size'a çevir
          const fullSizeSrc = src
            .replace(/\/\d+\/\d+\//, '/1200/1800/')
            .replace(/mnresize\/\d+/, 'mnresize/1200');
          
          if (!images.includes(fullSizeSrc)) {
            images.push(fullSizeSrc);
            console.log(`Selenium ile thumbnail bulundu: ${fullSizeSrc}`);
          }
        }
      } catch (error) {
        continue;
      }
    }

    // Sayfa kaynak kodundaki tüm görsel URL'lerini yakala
    const pageSource = await driver.getPageSource();
    const urlMatches = pageSource.match(/https:\/\/(cdn\.dsmcdn\.com|cdn\.trendyol\.com)[^"'\s]+\.(jpg|jpeg|png|webp)/gi);
    
    if (urlMatches) {
      urlMatches.forEach(url => {
        const optimizedUrl = url
          .replace(/\/\d+\/\d+\//, '/1200/1800/')
          .replace(/mnresize\/\d+/, 'mnresize/1200');
        
        if (!images.includes(optimizedUrl)) {
          images.push(optimizedUrl);
          console.log(`Selenium ile sayfa kaynağından görsel bulundu: ${optimizedUrl}`);
        }
      });
    }

    // Network requestlerini JavaScript ile yakala
    const networkImages = await driver.executeScript(`
      // Network request'leri yakalamak için performance API kullan
      const resources = performance.getEntriesByType('resource');
      const imageUrls = [];
      
      resources.forEach(resource => {
        if (resource.name.includes('cdn.dsmcdn.com') || resource.name.includes('cdn.trendyol.com')) {
          if (resource.name.includes('.jpg') || resource.name.includes('.jpeg') || 
              resource.name.includes('.png') || resource.name.includes('.webp')) {
            imageUrls.push(resource.name);
          }
        }
      });
      
      return imageUrls;
    `);

    if (Array.isArray(networkImages)) {
      networkImages.forEach((url: any) => {
        const optimizedUrl = url
          .replace(/\/\d+\/\d+\//, '/1200/1800/')
          .replace(/mnresize\/\d+/, 'mnresize/1200');
        
        if (!images.includes(optimizedUrl)) {
          images.push(optimizedUrl);
          console.log(`Selenium network'ten görsel bulundu: ${optimizedUrl}`);
        }
      });
    }

    // Tekrarları kaldır ve sırala
    const uniqueImages = Array.from(new Set(images));
    const sortedImages = uniqueImages.sort((a, b) => {
      // org_zoom öncelikli sıralama
      if (a.includes('org_zoom') && !b.includes('org_zoom')) return -1;
      if (!a.includes('org_zoom') && b.includes('org_zoom')) return 1;
      if (a.includes('1200') && !b.includes('1200')) return -1;
      if (!a.includes('1200') && b.includes('1200')) return 1;
      return 0;
    });

    console.log(`Selenium ile görsel çıkarma tamamlandı: ${sortedImages.length} görsel`);
    return sortedImages.slice(0, 20); // En fazla 20 görsel

  } catch (error) {
    console.error('Selenium görsel çıkarma hatası:', error);
    return images;
  } finally {
    if (driver) {
      await driver.quit();
    }
  }
}

/**
 * Tüm yöntemleri birleştiren ultra hibrit fonksiyon
 * @param url Ürün URL'si
 * @returns Tüm yöntemlerden toplanan görseller
 */
export async function ultraHybridImageExtraction(url: string): Promise<string[]> {
  console.log('Ultra hibrit görsel çıkarma başlıyor...');
  
  const allImages: string[] = [];
  
  try {
    // 1. Selenium tabanlı çıkarma
    console.log('1. Selenium tabanlı çıkarma...');
    const seleniumImages = await extractImagesWithSelenium(url);
    allImages.push(...seleniumImages);
    
    // 2. API tabanlı çıkarma
    console.log('2. API tabanlı çıkarma...');
    const { extractImagesFromAPI } = await import('./api-image-extractor');
    const apiImages = await extractImagesFromAPI(url);
    allImages.push(...apiImages);
    
    // 3. Network tabanlı çıkarma
    console.log('3. Network tabanlı çıkarma...');
    const { extractImagesFromNetwork } = await import('./network-image-extractor');
    const networkImages = await extractImagesFromNetwork(url);
    allImages.push(...networkImages);
    
    // 4. JSON-LD tabanlı çıkarma (fallback)
    console.log('4. JSON-LD tabanlı çıkarma...');
    const { getAllProductImages } = await import('./image-extractor');
    const jsonLdImages = await getAllProductImages(url);
    allImages.push(...jsonLdImages);
    
    // Tekrarları kaldır ve kalite skoruna göre sırala
    const uniqueImages = Array.from(new Set(allImages));
    
    const sortedImages = uniqueImages.sort((a, b) => {
      return getImageQualityScore(b) - getImageQualityScore(a);
    });
    
    console.log(`Ultra hibrit çıkarma tamamlandı: ${sortedImages.length} görsel`);
    return sortedImages.slice(0, 25); // En fazla 25 görsel
    
  } catch (error) {
    console.error('Ultra hibrit görsel çıkarma hatası:', error);
    return allImages;
  }
}

/**
 * Görsel kalite skorunu hesaplar
 * @param url Görsel URL'si
 * @returns Kalite skoru
 */
function getImageQualityScore(url: string): number {
  let score = 0;
  
  // Boyut skorları
  if (url.includes('1200') || url.includes('1800')) score += 10;
  if (url.includes('org_zoom')) score += 15;
  if (url.includes('mnresize/1200')) score += 8;
  if (url.includes('quality/95')) score += 5;
  
  // Format skorları
  if (url.includes('.webp')) score += 3;
  if (url.includes('.jpg') || url.includes('.jpeg')) score += 2;
  if (url.includes('.png')) score += 1;
  
  return score;
}