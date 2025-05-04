/**
 * Trendyol için Puppeteer tabanlı gelişmiş scraper
 * Bot korumasını aşmak için stealth plugin kullanır
 * 
 * NOT: Puppeteer bağımlılık hatası nedeniyle şimdilik standby modunda.
 * Sisteme gerekli bağımlılıklar yüklendikten sonra tekrar aktif edilebilir.
 */
import puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { join } from 'path';
import * as os from 'os';

// Puppeteer-extra kuruluyor
const puppeteerExtra = addExtra(puppeteer);
puppeteerExtra.use(StealthPlugin());

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

// Ürün sayfasını çeken ana fonksiyon
export async function scrapeProductWithPuppeteer(url: string): Promise<string> {
  let browser = null;
  
  try {
    debug(`Puppeteer başlatılıyor...`);
    
    // Puppeteer için geçici dizin ayarla - Replit için önemli
    const temporaryDirectory = os.tmpdir();
    const userDataDir = join(temporaryDirectory, 'puppeteer_user_data');
    
    // Puppeteer'ı extra plugin ile başlat
    browser = await puppeteerExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      userDataDir
    });
    
    debug(`Tarayıcı başlatıldı, yeni sayfa açılıyor`);
    const page = await browser.newPage();
    
    // Kullanıcı ajanını ayarla
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
    ];
    
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    
    // Extra başlıklar ayarla
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Referer': 'https://www.google.com/'
    });
    
    // Viewport'u ayarla
    await page.setViewport({ width: 1366, height: 768 });
    
    // Önce Google'a git
    debug(`Google'a navigasyon başlatılıyor...`);
    await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
    
    // Biraz bekle
    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 500));
    
    // URL'yi normalleştir
    if (!url.startsWith('http')) {
      url = 'https://www.' + url.replace(/^www\./, '');
    }
    
    // Sayfayı aç 
    debug(`Ürün sayfasına yönleniyor: ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Sayfanın yüklenmesi için ek süre
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // İnsan benzeri davranış simülasyonu 
    await performRandomBrowsing(page);
    
    // Sayfanın HTML içeriğini al
    const content = await page.content();
    debug(`Sayfa içeriği alındı: ${content.length} bytes`);
    
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