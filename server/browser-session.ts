import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, KeyInput } from 'puppeteer';
import { puppeteerAllowed } from '@shared/deploy-runtime';

puppeteerExtra.use(StealthPlugin());

interface BrowserState {
  screenshot: string;
  url: string;
  title: string;
  width: number;
  height: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

const VIEWPORT = { width: 1280, height: 800 };
const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';

let browser: Browser | null = null;
let page: Page | null = null;
let busy = false;
let navHistory: string[] = [];
let navIndex = -1;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ensureBrowser(): Promise<Page> {
  if (!puppeteerAllowed()) {
    throw new Error('puppeteer-disabled-in-cloud');
  }

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
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });

  page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7' });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
    (window as any).chrome = { runtime: {} };
  });

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
  const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 58 });
  const url = page.url();
  const title = await page.title().catch(() => '');
  const canGoBack = await page.evaluate(() => window.history.length > 1).catch(() => false);
  return {
    screenshot: `data:image/jpeg;base64,${screenshot}`,
    url,
    title,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    canGoBack,
    canGoForward: false,
  };
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let waited = 0;
  while (busy) {
    await sleep(30);
    waited += 30;
    if (waited > 30000) throw new Error('Browser meşgul, lütfen tekrar deneyin');
  }
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

async function handleCountrySelect(p: Page): Promise<void> {
  const url = p.url();
  if (!url.includes('select-country')) return;
  try {
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
      await sleep(1200);
    } else {
      await p.goto('https://www.trendyol.com/sr?q=&lang=tr', { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
      await sleep(400);
    }
  } catch {
    await p.goto('https://www.trendyol.com/sr?q=', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await sleep(300);
  }
}

async function waitForSettle(p: Page, ms = 350): Promise<void> {
  try {
    await Promise.race([
      p.waitForNetworkIdle({ idleTime: 200, timeout: ms }),
      sleep(ms),
    ]);
  } catch {
    await sleep(80);
  }
}

export async function browserNavigate(url: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 22000 }).catch(() => {});
    await waitForSettle(p, 400);
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
    const beforeUrl = p.url();
    await p.mouse.click(px, py);
    await sleep(60);
    const afterUrl = p.url();
    if (afterUrl !== beforeUrl) {
      await waitForSettle(p, 500);
    } else {
      await waitForSettle(p, 250);
    }
    await handleCountrySelect(p);
    return takeScreenshot();
  });
}

export async function browserScroll(deltaY: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.evaluate((dy: number) => window.scrollBy({ top: dy, behavior: 'instant' }), deltaY);
    await sleep(60);
    return takeScreenshot();
  });
}

export async function browserBack(): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await waitForSettle(p, 300);
    return takeScreenshot();
  });
}

export async function browserForward(): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await waitForSettle(p, 300);
    return takeScreenshot();
  });
}

export async function browserType(text: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.keyboard.type(text, { delay: 15 });
    await sleep(100);
    return takeScreenshot();
  });
}

export async function browserKeyPress(key: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    const beforeUrl = p.url();
    await p.keyboard.press(key as KeyInput);
    await sleep(50);
    const afterUrl = p.url();
    if (afterUrl !== beforeUrl || key === 'Enter') {
      await waitForSettle(p, 400);
    } else {
      await sleep(70);
    }
    await handleCountrySelect(p);
    return takeScreenshot();
  });
}

export async function browserGetScreenshot(): Promise<BrowserState> {
  return withLock(async () => {
    await ensureBrowser();
    return takeScreenshot();
  });
}

// Çift tıklama
export async function browserDoubleClick(x: number, y: number, pageWidth: number, pageHeight: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    const scaleX = VIEWPORT.width / pageWidth;
    const scaleY = VIEWPORT.height / pageHeight;
    const px = Math.round(x * scaleX);
    const py = Math.round(y * scaleY);
    await p.mouse.click(px, py, { clickCount: 2 });
    await sleep(150);
    return takeScreenshot();
  });
}

// Sağ tık
export async function browserRightClick(x: number, y: number, pageWidth: number, pageHeight: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    const scaleX = VIEWPORT.width / pageWidth;
    const scaleY = VIEWPORT.height / pageHeight;
    const px = Math.round(x * scaleX);
    const py = Math.round(y * scaleY);
    // Sayfadaki bağlantıyı al
    const linkHref = await p.evaluate((cx, cy) => {
      const el = document.elementFromPoint(cx, cy);
      const a = el?.closest('a');
      return a?.href || null;
    }, px, py);
    await sleep(100);
    return { ...(await takeScreenshot()), url: linkHref || p.url() };
  });
}

// Hover (fareyi bir konuma götür — dropdown menüler için)
export async function browserHover(x: number, y: number, pageWidth: number, pageHeight: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    const scaleX = VIEWPORT.width / pageWidth;
    const scaleY = VIEWPORT.height / pageHeight;
    const px = Math.round(x * scaleX);
    const py = Math.round(y * scaleY);
    await p.mouse.move(px, py);
    await sleep(300);
    return takeScreenshot();
  });
}

// Fare tutup sürükleme (kaydırma için)
export async function browserDragScroll(startY: number, endY: number, pageHeight: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    const scaleY = VIEWPORT.height / pageHeight;
    const startPy = Math.round(startY * scaleY);
    const endPy = Math.round(endY * scaleY);
    const deltaY = (startPy - endPy) * 2;
    await p.evaluate((dy: number) => window.scrollBy({ top: dy, behavior: 'instant' }), deltaY);
    await sleep(120);
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

export async function prewarmBrowser() {
  try {
    console.log('🌐 Dahili tarayıcı motoru önceden başlatılıyor...');
    const p = await ensureBrowser();
    await p.goto('https://www.trendyol.com/sr?q=', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(600);
    await handleCountrySelect(p);
    console.log('✅ Dahili tarayıcı hazır:', p.url());
  } catch (err) {
    console.warn('⚠️ Tarayıcı ön ısıtma başarısız:', (err as Error).message?.slice(0, 80));
  }
}
