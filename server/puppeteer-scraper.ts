/**
 * Trendyol için Puppeteer tabanlı gelişmiş scraper
 * Bot korumasını aşmak için stealth plugin ve mobil simülasyon kullanır
 * 
 * Philips Lattego gibi karmaşık elektronik ürünleri de destekler
 */
import puppeteer from 'puppeteer';
import { join } from 'path';
import * as os from 'os';

// Debug
const debug = (message: string) => console.log(`[PUPPETEER] ${message}`);

// Farklı sayfalara göz gezdirme fonksiyonu - bot korumasından kaçınmak için
async function performRandomBrowsing(page: any) {
  debug("Rastgele sayfa gezinme simülasyonu...");
  // Rastgele sayfa kaydırma
  await page.evaluate(() => {
    const scrolls = Math.floor(Math.random() * 3) + 2;
    let scrolled = 0;
    const scrollInterval = setInterval(() => {
      window.scrollBy(0, Math.floor(Math.random() * 200) + 100);
      scrolled++;
      if (scrolled >= scrolls) clearInterval(scrollInterval);
    }, 300);
  });
  
  // Sayfa üzerinde biraz bekle
  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 1000));
}

// Philips Lattego ürünler için özel scraping stratejisi
async function scrapePhilipsLattego(page: any, url: string): Promise<void> {
  debug("Philips Lattego ürün tespiti: Özel scraping stratejisi uygulanıyor");
  
  // Mobil site parametresi ekle - genellikle daha az koruma olur
  const mobileUrl = url.replace('www.trendyol.com', 'm.trendyol.com');
  debug(`Mobil site URL'si kullanılıyor: ${mobileUrl}`);
  
  // Mobil cihaz olarak iPhone 12 Pro'yu taklit et (manuel olarak ayarla)
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
  await page.setViewport({ 
    width: 390, 
    height: 844, 
    deviceScaleFactor: 3, 
    isMobile: true, 
    hasTouch: true 
  });
  
  // Önce Trendyol ana sayfasını ziyaret et (doğrudan ürüne gitmek bot şüphesi uyandırabilir)
  await page.goto('https://m.trendyol.com', { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Biraz bekle ve gezin
  await new Promise(resolve => setTimeout(resolve, 2000));
  await performRandomBrowsing(page);
  
  // Şimdi ürün sayfasına git
  debug("Ana sayfadan ürün sayfasına geçiliyor");
  await page.goto(mobileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Daha fazla bekleme süresi (bot korumasını atlatmak için)
  await new Promise(resolve => setTimeout(resolve, 3000));
}

// Ürün sayfasını çeken ana fonksiyon
export async function scrapeProductWithPuppeteer(url: string): Promise<string> {
  let browser = null;
  
  try {
    debug(`Puppeteer başlatılıyor...`);
    
    // Puppeteer için geçici dizin ayarla - Replit için önemli
    const temporaryDirectory = os.tmpdir();
    const userDataDir = join(temporaryDirectory, 'puppeteer_user_data');
    
    // URL tipine göre browser ayarları belirle
    const isPhilipsLattego = url.includes('philips') && url.includes('lattego');
    
    // Tarayıcıyı başlat
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/95.0.4638.54 Mobile/15E148 Safari/604.1'
      ]
    });
    
    debug(`Tarayıcı başlatıldı, yeni sayfa açılıyor`);
    const page = await browser.newPage();
    
    // Sayfada çerezleri kabul et
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Referer': 'https://www.google.com/',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1'
    });
    
    // JavaScript'i aktifleştir (varsayılan olarak aktif ancak kesin olsun)
    await page.setJavaScriptEnabled(true);
    
    // Viewport'u ayarla - mobil görünüm genellikle bot korumasını atlatmakta daha başarılı
    if (isPhilipsLattego) {
      await scrapePhilipsLattego(page, url);
    } else {
      // Standart ürünler için normal akış
      // Önceki User-Agent ayarlarını kullan
      const userAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
      ];
      
      await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
      
      // Viewport'u ayarla - iPhone X
      await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      
      // URL'yi normalleştir
      if (!url.startsWith('http')) {
        url = 'https://m.trendyol.com/' + url.replace(/^www\./, '').replace(/^trendyol\.com\//, '');
      } else if (url.includes('www.trendyol.com')) {
        // Mobil URL kullan
        url = url.replace('www.trendyol.com', 'm.trendyol.com');
      }
      
      // Önce arama sayfasına git
      await page.goto('https://m.trendyol.com', { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Ürün sayfasına git
      debug(`Ürün sayfasına yönleniyor: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Biraz bekle
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // İnsan benzeri davranış simülasyonu
      await performRandomBrowsing(page);
    }
    
    // Sayfanın HTML içeriğini al
    const content = await page.content();
    debug(`Sayfa içeriği başarıyla alındı: ${content.length} bytes`);
    
    // HTML içeriğini döndür
    return content;
    
  } catch (error: any) {
    debug(`Puppeteer ile sayfa çekme hatası: ${error.message}`);
    throw new Error(`Puppeteer çekme hatası: ${error.message}`);
  } finally {
    // Tarayıcıyı kapat
    if (browser) {
      debug(`Tarayıcı kapatılıyor`);
      await browser.close();
    }
  }
}