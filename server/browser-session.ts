import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, KeyInput } from 'puppeteer';

// Stealth plugin — Cloudflare ve bot algılamayı aşar
puppeteerExtra.use(StealthPlugin());

interface BrowserState {
  screenshot: string;
  url: string;
  title: string;
  width: number;
  height: number;
}

const VIEWPORT = { width: 1280, height: 800 };
const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';
const TRENDYOL_HOME = 'https://www.trendyol.com/cep-telefonu-x-c104';

let browser: Browser | null = null;
let page: Page | null = null;
let busy = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ensureBrowser(): Promise<Page> {
  if (browser && page) {
    try {
      await page.evaluate(() => document.title);
      return page;
    } catch {
      browser = null;
      page = null;
    }
  }

  browser = await puppeteerExtra.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--window-size=1280,800',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      '--no-first-run',
      '--lang=tr-TR',
    ],
  });

  page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'tr-TR,tr;q=0.9' });

  // Trendyol'un bot algılama engelini aş
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
  });

  // Türkçe oturum cookie'leri ayarla (ülke seçimini atla)
  await page.setCookie(
    { name: 'platform', value: 'web', domain: '.trendyol.com' },
    { name: 'language', value: 'tr', domain: '.trendyol.com' },
    { name: 'country', value: 'TR', domain: '.trendyol.com' },
    { name: 'culture', value: 'tr-TR', domain: '.trendyol.com' },
  );

  return page;
}

async function takeScreenshot(): Promise<BrowserState> {
  if (!page) throw new Error('Browser not initialized');
  const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 85 });
  const url = page.url();
  const title = await page.title().catch(() => '');
  return {
    screenshot: `data:image/jpeg;base64,${screenshot}`,
    url,
    title,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  };
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  while (busy) {
    await sleep(50);
  }
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

// Ülke seçim sayfasından TR'ye otomatik geç
async function handleCountrySelect(p: Page): Promise<void> {
  const url = p.url();
  if (url.includes('select-country')) {
    try {
      // Önce sayfadaki tüm linkleri tara, TR/Türkiye içereni bul ve tıkla
      const clicked = await p.evaluate(() => {
        const allLinks = Array.from(document.querySelectorAll('a, button, [role="button"]'));
        const trLink = allLinks.find(el => {
          const text = el.textContent?.trim() || '';
          const href = (el as HTMLAnchorElement).href || '';
          return text === 'TR' || text === 'Türkiye' || text.includes('Turkey') ||
                 href.includes('/tr') || href.includes('?country=TR') ||
                 el.getAttribute('data-country') === 'TR';
        });
        if (trLink) { (trLink as HTMLElement).click(); return true; }
        return false;
      });

      if (clicked) {
        await sleep(1500);
      } else {
        // TR linki bulunamadı, doğrudan arama sayfasına git
        await p.goto('https://www.trendyol.com/sr?q=&lang=tr', { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
        await sleep(600);
      }
    } catch {
      await p.goto('https://www.trendyol.com/sr?q=', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      await sleep(500);
    }
  }
}

export async function browserNavigate(url: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(600);
    await handleCountrySelect(p);
    return takeScreenshot();
  });
}

export async function browserClick(x: number, y: number, pageWidth: number, pageHeight: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    const scaleX = VIEWPORT.width / pageWidth;
    const scaleY = VIEWPORT.height / pageHeight;
    const px = Math.round(x * scaleX);
    const py = Math.round(y * scaleY);
    await p.mouse.click(px, py);
    await sleep(900);
    await handleCountrySelect(p);
    return takeScreenshot();
  });
}

export async function browserScroll(deltaY: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.evaluate((dy: number) => window.scrollBy({ top: dy, behavior: 'smooth' }), deltaY);
    await sleep(400);
    return takeScreenshot();
  });
}

export async function browserBack(): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await sleep(600);
    return takeScreenshot();
  });
}

export async function browserForward(): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await sleep(600);
    return takeScreenshot();
  });
}

// Metin yaz — mevcut odaklı elemente
export async function browserType(text: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.keyboard.type(text, { delay: 40 });
    await sleep(300);
    return takeScreenshot();
  });
}

// Özel tuş bas (Enter, Backspace, Tab, ArrowDown vb.)
export async function browserKeyPress(key: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.keyboard.press(key as KeyInput);
    await sleep(700);
    await handleCountrySelect(p);
    return takeScreenshot();
  });
}

// Mevcut ekran görüntüsünü al (navigasyon yok)
export async function browserGetScreenshot(): Promise<BrowserState> {
  return withLock(async () => {
    await ensureBrowser();
    return takeScreenshot();
  });
}

export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    page = null;
  }
}

// Sunucu başladığında tarayıcıyı önceden ısıt
export async function prewarmBrowser() {
  try {
    console.log('🌐 Dahili tarayıcı motoru önceden başlatılıyor...');
    const p = await ensureBrowser();
    // Türkçe arama sayfasına git (ülke seçimi atlar)
    await p.goto('https://www.trendyol.com/sr?q=', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(800);
    // Eğer hâlâ ülke seçimindeyse handle et
    await handleCountrySelect(p);
    console.log('✅ Dahili tarayıcı hazır:', p.url());
  } catch (err) {
    console.warn('⚠️ Tarayıcı ön ısıtma başarısız (ilk kullanımda başlatılacak):', (err as Error).message?.slice(0, 80));
  }
}
