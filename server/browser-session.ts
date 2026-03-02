import puppeteer, { Browser, Page } from 'puppeteer';

interface BrowserState {
  screenshot: string;
  url: string;
  title: string;
  width: number;
  height: number;
}

const VIEWPORT = { width: 1280, height: 800 };
const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';

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

  browser = await puppeteer.launch({
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
    ],
  });

  page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  return page;
}

async function takeScreenshot(): Promise<BrowserState> {
  if (!page) throw new Error('Browser not initialized');
  const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
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

export async function browserNavigate(url: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(800);
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
    await sleep(1200);
    return takeScreenshot();
  });
}

export async function browserScroll(deltaY: number): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.evaluate((dy: number) => window.scrollBy(0, dy), deltaY);
    await sleep(300);
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

export async function browserType(text: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.keyboard.type(text, { delay: 30 });
    await sleep(300);
    return takeScreenshot();
  });
}

export async function browserKeyPress(key: string): Promise<BrowserState> {
  return withLock(async () => {
    const p = await ensureBrowser();
    await p.keyboard.press(key as any);
    await sleep(800);
    return takeScreenshot();
  });
}

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
