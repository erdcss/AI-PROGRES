import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ProductPoolFeature, ProductPoolProduct } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function parseTrPrice(raw: string): number | null {
  const cleaned = String(raw || "")
    .replace(/[^\d.,]/g, "")
    .trim();
  if (!cleaned) return null;
  // 17.299,50 / 1.234.567,89 → binlik nokta + ondalık virgül
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const n = Number.parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // 17781,12 → ondalık virgül
  if (cleaned.includes(",")) {
    const n = Number.parseFloat(cleaned.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // 17.299 / 1.234.567 → yalnızca binlik nokta (TR)
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const n = Number.parseFloat(cleaned.replace(/\./g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // 17399.00 / 17781.12 → İngilizce ondalık
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function discountPercent(price: number, compareAt: number | null): number {
  if (!compareAt || compareAt <= price || price <= 0) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function faviconFor(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

/** Site logosu / favicon / ikon — ürün galerisine ve Shopify'a girmemeli */
export function isLikelySiteBrandingImage(url: string): boolean {
  const u = String(url || "").toLowerCase().split("?")[0];
  if (!u.startsWith("http")) return true;
  if (/\.svg$/i.test(u) || /\.ico$/i.test(u)) return true;
  if (/favicon|ladybug|sprite|watermark|placeholder|no[-_]?image/i.test(u)) return true;
  if (/\/(?:logo|logos|brand|brands)(?:\/|-|_|\.)/i.test(u)) return true;
  if (/logo[-_]?(?:dark|light|white|black|header|footer)?\.(?:png|jpe?g|webp|gif)$/i.test(u)) {
    return true;
  }
  if (/\/(?:icons?|app-icons|static\/favicon)\//i.test(u)) return true;
  if (/\/custom\/upload\//i.test(u)) return true;
  if (/\/skins\/shared\/images\/logo/i.test(u)) return true;
  if (/badge|banner|\/emblem/i.test(u) && !/\/a1\/org\//i.test(u)) return true;
  // n11: .jpg uzantılı logo placeholder (ürün değil)
  if (/n11scdn\d*-im\.akamaized\.net\/a1\/640\//i.test(u) && !/\/img-\d+/i.test(u)) {
    return true;
  }
  // Amazon site grafikleri (ürün değil)
  if (/media-amazon\.com\/images\/[gs]\//i.test(u)) return true;
  return false;
}

/** Shopify / UI galeri: site logosu hariç yalnızca ürün görselleri */
export function filterProductImagesForShopify(
  images: unknown,
  siteLogoUrl?: string,
): string[] {
  const logoKey = String(siteLogoUrl || "")
    .split("?")[0]
    .toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(images) ? images : [];
  for (const raw of list) {
    if (typeof raw !== "string" || !raw.startsWith("http")) continue;
    const key = raw.split("?")[0].toLowerCase();
    if (seen.has(key)) continue;
    if (logoKey && key === logoKey) continue;
    if (isLikelySiteBrandingImage(raw)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= 8) break;
  }
  return out;
}

export async function rejectNonJpegProductPlaceholders(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (out.length >= 8) break;
    // Sadece şüpheli CDN yollarını byte ile doğrula (hız için)
    const needsProbe =
      /n11scdn/i.test(url) ||
      /\.(png)(\?|$)/i.test(url) ||
      /logo|icon|favicon/i.test(url);
    if (!needsProbe) {
      out.push(url);
      continue;
    }
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Referer: "https://www.n11.com/",
          Accept: "image/*,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const isWebp =
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP";
      const isPng =
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      // n11 / küçük PNG: logo placeholder; büyük PNG ürün olabilir
      if (isPng) {
        if (/n11scdn|logo|icon|favicon/i.test(url) || buf.length < 40_000) continue;
        out.push(url);
        continue;
      }
      if (isJpeg || isWebp) out.push(url);
    } catch {
      /* skip */
    }
  }
  return out;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractFeatures($: CheerioAPI): ProductPoolFeature[] {
  const features: ProductPoolFeature[] = [];
  const seen = new Set<string>();

  const push = (name: string, value: string) => {
    const n = cleanText(name).replace(/:$/, "");
    const v = cleanText(value);
    if (!n || !v || n.length > 80 || v.length > 400) return;
    const key = `${n.toLowerCase()}::${v.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    features.push({ name: n, value: v });
  };

  $("table tr").each((_, row) => {
    const cells = $(row).find("th,td");
    if (cells.length >= 2) {
      push($(cells[0]).text(), $(cells[1]).text());
    }
  });

  $("dl").each((_, dl) => {
    const $dl = $(dl);
    $dl.find("dt").each((i, dt) => {
      const dd = $dl.find("dd").eq(i);
      push($(dt).text(), dd.text());
    });
  });

  $(".prop-spec-box li, .product-features li, .product-specs li, .ozellikler li").each((_, li) => {
    const text = cleanText($(li).text());
    const m = text.match(/^([^:–—-]{2,60})\s*[:–—-]\s*(.+)$/);
    if (m) push(m[1], m[2]);
  });

  $("span.product-part-title").each((_, el) => {
    const title = cleanText($(el).text());
    if (!/özellik/i.test(title) && !/hakkında/i.test(title)) return;
    const block = $(el).parent();
    const raw = cleanText(block.text().replace(title, ""));
    if (/özellik/i.test(title) && raw.length > 20) {
      raw
        .split(/(?<=\.)\s+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 12 && p.length < 280)
        .slice(0, 8)
        .forEach((p, i) => push(`Özellik ${i + 1}`, p));
    }
  });

  return features.slice(0, 24);
}

async function fetchHtml(
  url: string,
  options?: { crawlerFallback?: boolean },
): Promise<string> {
  const cleanUrl = url.split("#")[0];
  const userAgents = options?.crawlerFallback
    ? [
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        UA,
      ]
    : [UA];

  let lastErr: Error | null = null;
  for (const userAgent of userAgents) {
    try {
      const res = await fetch(cleanUrl, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
      });
      const html = await res.text();
      const amazonChallenge =
        /validateCaptcha|opfcaptcha|Alışverişe Devam Et|Continue shopping/i.test(html) &&
        html.length < 20_000;
      const blocked =
        !res.ok ||
        amazonChallenge ||
        /Attention Required!|Just a moment|cf-browser-verification|Sorry, you have been blocked/i.test(
          html,
        ) ||
        html.length < 4000;
      if (blocked) {
        lastErr = new Error(`Sayfa alınamadı (HTTP ${res.status})`);
        continue;
      }
      return html;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr || new Error("Sayfa alınamadı");
}

function isUsableProductHtml(html: string): boolean {
  if (!html || html.length < 4000) return false;
  if (/Attention Required!|Just a moment|cf-browser-verification|Sorry, you have been blocked/i.test(html)) {
    return false;
  }
  // Amazon bot/captcha interstitial
  if (
    /validateCaptcha|opfcaptcha|api-services-support@amazon\.|Alışverişe Devam Et|Continue shopping/i.test(
      html,
    ) &&
    html.length < 20_000
  ) {
    return false;
  }
  return true;
}

async function fetchProtectedMarketplaceHtml(
  url: string,
  label: string,
  failMessage: string,
): Promise<string> {
  try {
    return await fetchHtml(url, { crawlerFallback: true });
  } catch (directErr) {
    console.warn(
      `[ProductPool/${label}] Direct fetch blocked, trying browser fallbacks:`,
      directErr instanceof Error ? directErr.message : String(directErr),
    );
  }

  try {
    const {
      fetchHtmlWithBrowserWorker,
      isBrowserWorkerConfigured,
    } = await import("../services/browser-worker-client.service");
    if (isBrowserWorkerConfigured()) {
      const bw = await fetchHtmlWithBrowserWorker(url);
      if (bw.success && bw.html && isUsableProductHtml(bw.html)) {
        console.log(`[ProductPool/${label}] Browser Worker HTML ok (${bw.html.length} bytes)`);
        return bw.html;
      }
      console.warn(
        `[ProductPool/${label}] Browser Worker failed:`,
        bw.error || bw.errorCategory || "empty",
      );
    }
  } catch (err) {
    console.warn(
      `[ProductPool/${label}] Browser Worker error:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  const stealthHtml = await fetchHtmlWithStealthBrowser(url);
  if (stealthHtml && isUsableProductHtml(stealthHtml)) {
    console.log(`[ProductPool/${label}] Stealth Chromium HTML ok (${stealthHtml.length} bytes)`);
    return stealthHtml;
  }

  throw new Error(failMessage);
}

/** n11: önce crawler UA; canlı CF engelinde Browser Worker → yerel stealth Chromium */
async function fetchN11Html(url: string): Promise<string> {
  return fetchProtectedMarketplaceHtml(
    url,
    "n11",
    "n11 sayfası alınamadı (Cloudflare). Canlıda BROWSER_WORKER_URL yapılandırın veya daha sonra tekrar deneyin.",
  );
}

async function fetchAmazonHtml(url: string): Promise<string> {
  return fetchProtectedMarketplaceHtml(
    url,
    "amazon",
    "Amazon sayfası alınamadı (bot koruması). Canlıda BROWSER_WORKER_URL yapılandırın veya daha sonra tekrar deneyin.",
  );
}

async function fetchHtmlWithStealthBrowser(url: string): Promise<string | null> {
  try {
    const { createRequire } = await import("module");
    const { getChromiumPath } = await import("../puppeteer-config");
    const require = createRequire(import.meta.url);
    const puppeteerExtraLib = require("puppeteer-extra");
    const StealthPlugin = require("puppeteer-extra-plugin-stealth");
    const puppeteerExtra = puppeteerExtraLib.default || puppeteerExtraLib;
    puppeteerExtra.use(StealthPlugin());

    const chromePath = getChromiumPath();
    let browser: { close: () => Promise<void> } | null = null;
    let page: {
      setViewport: (v: object) => Promise<void>;
      setUserAgent: (ua: string) => Promise<void>;
      setExtraHTTPHeaders: (h: Record<string, string>) => Promise<void>;
      setRequestInterception: (v: boolean) => Promise<void>;
      on: (ev: string, fn: (req: { resourceType: () => string; abort: () => void; continue: () => void }) => void) => void;
      goto: (u: string, o: object) => Promise<unknown>;
      content: () => Promise<string>;
      close: () => Promise<void>;
    } | null = null;

    try {
      browser = await puppeteerExtra.launch({
        headless: true,
        executablePath: chromePath,
        protocolTimeout: 120000,
        timeout: 120000,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
          "--lang=tr-TR,tr",
          "--window-size=1366,768",
        ],
      });
      page = await (browser as any).newPage();
      if (!page) return null;
      await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
      await page.setUserAgent(UA);
      await page.setExtraHTTPHeaders({
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const rt = req.resourceType();
        if (["image", "font", "media"].includes(rt)) req.abort();
        else req.continue();
      });

      // magaza/renk query korunur
      await page.goto(url.split("#")[0], { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 5000));
      let html = await page.content();
      if (/Just a moment|cf-browser-verification|cf-wrapper/i.test(html)) {
        await new Promise((r) => setTimeout(r, 12000));
        html = await page.content();
      }
      return html;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          /* ignore */
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.warn(
      "[ProductPool/n11] Stealth Chromium failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function isLikelyN11ProductImage(url: string, productId = ""): boolean {
  const u = url.toLowerCase();
  if (!u.startsWith("http")) return false;
  if (/\.svg(\?|$)/i.test(u)) return false;
  if (/noimage|favicon|logo|icon|ladybug|sprite|badge|banner/i.test(u)) return false;
  if (/\/custom\/upload\//i.test(u)) return false;
  if (/\/public\/images\//i.test(u)) return false;
  if (!/n11scdn\d*(?:-im)?\.akamaized\.net\/a1\//i.test(u)) return false;
  // Asıl ürün fotoğrafları genelde jpg/webp; png çoğu branding
  if (/\.(jpe?g|webp)(\?|$)/i.test(u)) return true;
  if (productId && u.includes(productId.toLowerCase()) && /\.png(\?|$)/i.test(u)) return true;
  return false;
}

/** LD/640 yolları bazen .jpg uzantılı n11 logosunu (küçük PNG) döndürür; org+IMG güvenilir. */
function n11ImageScore(url: string, productId = ""): number {
  if (!isLikelyN11ProductImage(url, productId)) return -1;
  const u = url.toLowerCase();
  let score = 0;
  if (/\/a1\/org\//i.test(u)) score += 50;
  if (/\/img-\d+/i.test(u)) score += 40;
  if (productId && u.includes(productId.toLowerCase())) score += 15;
  if (/\.jpe?g(\?|$)/i.test(u)) score += 10;
  if (/n11scdn\d+-im\./i.test(u)) score -= 35;
  if (/\/a1\/640\//i.test(u) && !/\/img-/i.test(u)) score -= 25;
  return score;
}

async function filterRealN11Images(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (out.length >= 12) break;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Referer: "https://www.n11.com/",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) continue;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const isWebp =
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP";
      const isPng =
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      // .jpg diye sunulan küçük/orta PNG = n11 logo placeholder
      if (isPng) continue;
      if (isJpeg || isWebp) out.push(url);
    } catch {
      /* skip broken */
    }
  }
  // Canlı CDN sunucu IP'sini engelleyebilir — güvenilir org/IMG yollarını yine de bırak
  if (!out.length) {
    return urls
      .filter((u) => /\/a1\/org\//i.test(u) || /\/img-\d+/i.test(u))
      .filter((u) => !isLikelySiteBrandingImage(u))
      .slice(0, 12);
  }
  return out;
}

async function scrapeN11(html: string, sourceUrl: string): Promise<ProductPoolProduct> {
  const $ = cheerio.load(html);
  const cleanUrl = sourceUrl.split("?")[0];
  const productIdMatch = cleanUrl.match(/-(\d{6,})(?:\?|$)/);
  const productId = productIdMatch?.[1] || "";

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let inStock = true;
  let ldProductImage = "";
  let siteLogoFromLd = "";
  const features: ProductPoolFeature[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).html() || "");
      const nodes = Array.isArray(raw)
        ? raw
        : Array.isArray(raw["@graph"])
          ? raw["@graph"]
          : [raw];
      for (const node of nodes) {
        const type = String(node?.["@type"] || "");
        if (type === "Organization" && typeof node.logo === "string" && node.logo.startsWith("http")) {
          siteLogoFromLd = node.logo;
        }
        if (type !== "Product") continue;
        title = cleanText(String(node.name || ""));
        sku = String(node.sku || sku || "");
        const brandVal = node.brand;
        if (typeof brandVal === "string") brand = brandVal;
        else if (brandVal && typeof brandVal === "object") {
          brand = String((brandVal as { name?: string }).name || "");
        }
        const img = node.image;
        if (typeof img === "string" && n11ImageScore(img, productId) >= 40) {
          ldProductImage = img.split("?")[0];
        } else if (Array.isArray(img)) {
          for (const i of img) {
            if (typeof i === "string" && n11ImageScore(i, productId) >= 40) {
              ldProductImage = i.split("?")[0];
              break;
            }
          }
        }
        const color = cleanText(String(node.color || ""));
        if (color) features.push({ name: "Renk", value: color });
        const props = Array.isArray(node.additionalProperty) ? node.additionalProperty : [];
        for (const p of props) {
          const n = cleanText(String(p?.name || ""));
          const v = cleanText(String(p?.value || ""));
          if (n && v) features.push({ name: n, value: v });
        }
        const offer = node.offers as Record<string, unknown> | undefined;
        if (offer) {
          const p =
            parseTrPrice(String(offer.price ?? "")) ||
            parseTrPrice(String(offer.lowPrice ?? "")) ||
            parseTrPrice(String(offer.highPrice ?? ""));
          if (p && p > 0) salePrice = p;
          const avail = String(offer.availability || "");
          if (/OutOfStock|SoldOut/i.test(avail)) inStock = false;
        }
      }
    } catch {
      /* next */
    }
  });

  // Embedded JSON prices: "17.299 TL", "17399.00", "19.351,50 TL"
  const priceCandidates: number[] = [];
  const listCandidates: number[] = [];
  for (const m of html.matchAll(/"price"\s*:\s*"([^"]+)"/gi)) {
    const p = parseTrPrice(m[1]);
    if (p && p > 0 && p < 1_000_000) priceCandidates.push(p);
  }
  for (const m of html.matchAll(/"displayPrice"\s*:\s*"([^"]+)"/gi)) {
    const p = parseTrPrice(m[1]);
    if (p && p > 0 && p < 1_000_000) listCandidates.push(p);
  }
  // Aykırı küçük değerleri ele (yanlış parse / kargo vb.)
  const sanePrices = (arr: number[]) => {
    if (!arr.length) return [] as number[];
    const max = Math.max(...arr);
    return arr.filter((p) => p >= Math.max(50, max * 0.15));
  };
  const salePool = sanePrices(priceCandidates);
  const listPool = sanePrices(listCandidates);
  // Satıcı JSON fiyatları AggregateOffer.lowPrice'tan daha spesifik (magaza=...)
  if (salePool.length) {
    const minSale = Math.min(...salePool);
    if (!salePrice || minSale <= salePrice) salePrice = minSale;
  }
  if (listPool.length) {
    listPrice = Math.max(...listPool);
  }
  if (!listPrice && salePool.length > 1) {
    listPrice = Math.max(...salePool);
  }
  if (listPrice > 0 && salePrice > 0 && listPrice < salePrice) {
    const tmp = listPrice;
    listPrice = salePrice;
    salePrice = tmp;
  }

  const galleryRaw = [
    ...html.matchAll(
      /https:\/\/n11scdn\d*(?:-im)?\.akamaized\.net\/a1\/(?:org|640|500_750|400_600)[^"'\\\s]+\.(?:jpg|jpeg|png|webp)/gi,
    ),
  ].map((m) => m[0].split("?")[0]);

  const gallery = galleryRaw
    .filter((u) => n11ImageScore(u, productId) >= 40)
    .sort((a, b) => n11ImageScore(b, productId) - n11ImageScore(a, productId));

  const candidates: string[] = [];
  if (ldProductImage) candidates.push(ldProductImage);
  for (const u of gallery) {
    if (!candidates.includes(u)) candidates.push(u);
  }
  // Skor yetmezse yine de adayları doğrulamaya gönder
  if (!candidates.length) {
    for (const u of galleryRaw) {
      if (isLikelyN11ProductImage(u, productId) && !candidates.includes(u)) candidates.push(u);
    }
  }

  const uniqueImages = await filterRealN11Images(
    [...new Set(candidates)].sort(
      (a, b) => n11ImageScore(b, productId) - n11ImageScore(a, productId),
    ),
  );

  if (!title) {
    title =
      cleanText($("h1").first().text()) ||
      cleanText($('meta[property="og:title"]').attr("content") || "") ||
      cleanText($("title").text()) ||
      "Ürün";
  }
  title = title
    .replace(/\s*Fiyatları ve Özellikleri\s*$/i, "")
    .replace(/\s*[|-]\s*n11.*$/i, "")
    .trim();

  if (!brand) {
    brand =
      html.match(/"brandName"\s*:\s*"([^"]+)"/)?.[1] ||
      html.match(/"brand"\s*:\s*"([^"]{2,40})"/)?.[1] ||
      "";
  }
  if (!sku) {
    sku = html.match(/"sku"\s*:\s*"([^"]+)"/)?.[1] || "";
  }

  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      parseTrPrice($("[itemprop='price']").attr("content") || "") ||
      0;
  }

  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: cleanText(brand) });
  }
  if (sku && !features.some((f) => /sku|barkod/i.test(f.name))) {
    features.push({ name: "SKU", value: sku });
  }

  const magaza = new URL(sourceUrl).searchParams.get("magaza");
  if (magaza) features.push({ name: "Mağaza", value: magaza });

  const compareAt = listPrice > salePrice ? listPrice : null;

  // Site rozeti: SVG custom/upload tarayıcıda kırılabiliyor — sabit favicon
  const siteLogoUrl =
    (siteLogoFromLd && !/\/custom\/upload\//i.test(siteLogoFromLd) ? siteLogoFromLd : "") ||
    "https://www.n11.com/favicon.ico";

  return {
    title,
    sourceUrl: cleanUrl + (magaza ? `?magaza=${encodeURIComponent(magaza)}` : ""),
    siteName: "n11",
    siteLogoUrl,
    brand: brand ? cleanText(brand) : undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: discountPercent(salePrice, compareAt),
    salePrice,
    images: uniqueImages,
    features: features.slice(0, 24),
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapeHepegitim(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;

  let productId = "";
  let modelName = "";
  let sku = "";
  let brand = "";
  let priceFromJson: number | null = null;
  let imageFromJson = "";

  const scripts = $("script")
    .map((_, el) => $(el).html() || "")
    .get()
    .join("\n");
  const jspMatch = scripts.match(/jspValue\s*=\s*(\{[\s\S]*?\});/);
  if (jspMatch) {
    try {
      const data = JSON.parse(jspMatch[1]) as Record<string, unknown>;
      productId = String(data.ProductID || "");
      modelName = String(data.ModelName || "");
      sku = String(data.SKU || data.Barcode || "");
      brand = String(data.Brand || "");
      const p = Number.parseFloat(String(data.Price ?? ""));
      if (Number.isFinite(p)) priceFromJson = p;
      if (typeof data.ImageUrl === "string" && data.ImageUrl) {
        imageFromJson = absoluteUrl(origin, data.ImageUrl.replace("/middle/", "/big/"));
      }
    } catch {
      /* ignore */
    }
  }

  const title =
    modelName ||
    $("h1.product-title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "Ürün";

  const salesText = $(".product-price .price-sales").first().text();
  const standardText = $(".product-price .price-standard").first().text();
  const salePrice =
    parseTrPrice(salesText) ??
    priceFromJson ??
    parseTrPrice($(".price-sales").first().text()) ??
    0;
  const compareAt =
    parseTrPrice(standardText) ??
    (salePrice > 0 && priceFromJson && priceFromJson > salePrice ? priceFromJson : null);

  const images = new Set<string>();
  if (imageFromJson) images.add(imageFromJson);
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) images.add(absoluteUrl(origin, ogImage));

  $('img[src*="productimages/"], img[data-src*="productimages/"]').each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (!src) return;
    if (productId && !src.includes(`/productimages/${productId}/`)) return;
    const abs = absoluteUrl(origin, src.replace("/middle/", "/big/").replace("/original/", "/big/"));
    images.add(abs);
  });

  const logoSrc =
    $(".navbar-brand img").first().attr("src") ||
    $('img[alt*="Hepegitim" i]').first().attr("src") ||
    "/skins/shared/images/logo.png";

  const siteLogoUrl = absoluteUrl(origin, logoSrc);
  const price = compareAt && compareAt > salePrice ? compareAt : salePrice;
  const finalSale = salePrice || price;
  const disc = discountPercent(finalSale, compareAt && compareAt > finalSale ? compareAt : null);
  const features = extractFeatures($);
  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: brand });
  }
  if (sku && !features.some((f) => /sku|barkod|barcode/i.test(f.name))) {
    features.push({ name: "Barkod", value: sku });
  }

  return {
    title,
    sourceUrl,
    siteName: "Hepegitim",
    siteLogoUrl,
    brand: brand || undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: price || finalSale,
    compareAtPrice: compareAt && compareAt > finalSale ? compareAt : null,
    discountPercent: disc,
    salePrice: finalSale,
    images: [...images].slice(0, 12),
    features,
    inStock: true,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapeGeneric(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;
  const host = hostnameOf(sourceUrl);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Ürün";

  const ogImage = $('meta[property="og:image"]').attr("content");
  const images: string[] = [];
  if (ogImage) images.push(absoluteUrl(origin, ogImage));

  const priceMeta =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[itemprop="price"]').attr("content") ||
    $('[itemprop="price"]').attr("content") ||
    $(".price").first().text();
  const salePrice = parseTrPrice(String(priceMeta || "")) ?? 0;

  const logo =
    $('link[rel="icon"]').attr("href") ||
    $('meta[property="og:image"]').attr("content") ||
    faviconFor(sourceUrl);

  return {
    title,
    sourceUrl,
    siteName: host,
    siteLogoUrl: logo ? absoluteUrl(origin, logo) : faviconFor(sourceUrl),
    currency: "TRY",
    price: salePrice,
    compareAtPrice: null,
    discountPercent: 0,
    salePrice,
    images: images.slice(0, 12),
    features: extractFeatures($),
    inStock: true,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapePazarama(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let currency = "TRY";
  let inStock = true;
  const features: ProductPoolFeature[] = [];
  const images: string[] = [];

  const ldBlocks = [...html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )];
  for (const m of ldBlocks) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>;
      if (String(data["@type"] || "") !== "Product") continue;

      title = cleanText(String(data.name || ""));
      sku = String(data.sku || "");
      const brandVal = data.brand;
      if (typeof brandVal === "string") brand = brandVal;
      else if (brandVal && typeof brandVal === "object") {
        brand = String((brandVal as { name?: string }).name || "");
      }

      const offer = data.offers as Record<string, unknown> | undefined;
      if (offer) {
        const p = Number(offer.price);
        if (Number.isFinite(p) && p > 0) salePrice = p;
        if (typeof offer.priceCurrency === "string" && offer.priceCurrency) {
          currency = offer.priceCurrency;
        }
        const avail = String(offer.availability || "");
        if (/OutOfStock|SoldOut/i.test(avail)) inStock = false;
        const seller = cleanText(String(offer.seller || ""));
        if (seller) features.push({ name: "Satıcı", value: seller });
      }

      const img = data.image;
      if (typeof img === "string" && img) images.push(img);
      else if (Array.isArray(img)) {
        for (const i of img) if (typeof i === "string" && i) images.push(i);
      }

      for (const key of ["color", "weight", "width", "height", "depth", "material"] as const) {
        const v = cleanText(String(data[key] ?? ""));
        if (!v || /^yok$/i.test(v)) continue;
        const labels: Record<string, string> = {
          color: "Renk",
          weight: "Ağırlık",
          width: "Genişlik",
          height: "Yükseklik",
          depth: "Derinlik",
          material: "Materyal",
        };
        features.push({ name: labels[key], value: v });
      }
      break;
    } catch {
      /* next block */
    }
  }

  // Nuxt payload: listPrice:{...value:32340...}
  const listMatch = html.match(/listPrice\s*:\s*\{[^}]*?\bvalue\s*:\s*(\d+(?:\.\d+)?)/);
  if (listMatch) {
    const lp = Number(listMatch[1]);
    if (Number.isFinite(lp) && lp > salePrice) listPrice = lp;
  }

  const discMatch = html.match(/discountRate\s*:\s*\{\s*discountRate\s*:\s*"(\d+)"/);
  let discountPct = 0;
  if (discMatch) {
    const d = Number(discMatch[1]);
    if (Number.isFinite(d) && d > 0) discountPct = d;
  }

  // URL'deki ürün kodundan galeri görselleri
  const codeMatch = sourceUrl.match(/-p-(\d{6,})/i) || sourceUrl.match(/\/(\d{10,})(?:\?|$)/);
  const productCode = codeMatch?.[1] || "";
  if (productCode) {
    const re = new RegExp(
      `https://img\\.pzrmcdn\\.com[^"'\\\\\\s]*${productCode}[^"'\\\\\\s]+\\.(?:jpg|jpeg|png|webp)`,
      "gi",
    );
    const found = html.match(re) || [];
    for (const raw of found) {
      const full = raw.replace(/\/mnresize\/\d+\/\d+\//i, "/");
      if (!/\/icons\//i.test(full)) images.push(full);
    }
  }

  if (!title) {
    title =
      $('meta[property="og:title"], meta[name="og:title"]').attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Ürün";
    title = title.replace(/\s*[|-]\s*Pazarama.*$/i, "").trim() || title;
  }

  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      0;
  }

  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: brand });
  }
  if (sku && !features.some((f) => /sku|barkod|barcode/i.test(f.name))) {
    features.push({ name: "SKU", value: sku });
  }

  const uniqueImages = [...new Set(images)].slice(0, 12);
  const compareAt = listPrice > salePrice ? listPrice : null;
  const disc = discountPct || discountPercent(salePrice, compareAt);

  const logoHref =
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel="icon"]').attr("href") ||
    "https://img.pzrmcdn.com/mnresize/64/64/asset/icons/pwa.png";

  return {
    title,
    sourceUrl,
    siteName: "Pazarama",
    siteLogoUrl: absoluteUrl(origin, logoHref),
    brand: brand || undefined,
    sku: sku || undefined,
    currency,
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: disc,
    salePrice,
    images: uniqueImages,
    features: features.slice(0, 24),
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapeIdefix(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let discountPct = 0;
  const images: string[] = [];
  const features: ProductPoolFeature[] = [];

  const nextMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (nextMatch) {
    try {
      const next = JSON.parse(nextMatch[1]) as {
        props?: { pageProps?: { productDetail?: Record<string, unknown> } };
      };
      const pd = next.props?.pageProps?.productDetail;
      if (pd) {
        title = String(pd.title || "");
        brand = String(pd.brandName || "");
        sku = String(pd.barcode || "");
        const cp = pd.currentPrice as Record<string, unknown> | undefined;
        if (cp) {
          const effective = Number(cp.effectivePrice ?? cp.discountedPrice ?? 0);
          const base = Number(cp.price ?? 0);
          if (Number.isFinite(effective) && effective > 0) salePrice = effective;
          if (Number.isFinite(base) && base > 0) listPrice = base;
          const dp = Number(cp.discountPercentage ?? 0);
          if (Number.isFinite(dp) && dp > 0) discountPct = Math.round(dp);
          const varianters = Array.isArray(cp.varianters) ? cp.varianters : [];
          for (const v of varianters) {
            const row = v as Record<string, unknown>;
            const name = cleanText(String(row.attributeName || ""));
            const value = cleanText(String(row.attributeValueName || ""));
            if (name && value) features.push({ name, value });
          }
        }
        const imgs = Array.isArray(pd.images) ? pd.images : [];
        for (const img of imgs) {
          const src = String((img as { src?: string })?.src || "");
          if (!src) continue;
          images.push(
            src.replace("{size}", "800/0/").replace(/\/resize\/\{size\}/, "/resize/800/0/"),
          );
        }
        const descHtml = String(pd.description || "");
        if (descHtml) {
          const $desc = cheerio.load(descHtml);
          const paras = $desc("p")
            .map((_, el) => cleanText($desc(el).text()))
            .get()
            .filter((t) => t.length > 20 && t.length < 280)
            .slice(0, 8);
          paras.forEach((p, i) => {
            if (!features.some((f) => f.value === p)) {
              features.push({ name: `Özellik ${i + 1}`, value: p });
            }
          });
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (!title) {
    title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Ürün";
  }

  if (!images.length) {
    const og = $('meta[property="og:image"]').attr("content");
    if (og) images.push(absoluteUrl(origin, og));
  }

  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      parseTrPrice($("[data-testid*='price']").first().text()) ||
      0;
  }

  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: brand });
  }
  if (sku && !features.some((f) => /barkod|sku/i.test(f.name))) {
    features.push({ name: "Barkod", value: sku });
  }

  const compareAt = listPrice > salePrice ? listPrice : null;
  const disc =
    discountPct ||
    discountPercent(salePrice, compareAt);

  const siteLogoUrl = absoluteUrl(origin, "/images/app-icons/logo.svg");

  return {
    title,
    sourceUrl,
    siteName: "idefix",
    siteLogoUrl,
    brand: brand || undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: disc,
    salePrice,
    images: [...new Set(images)].slice(0, 12),
    features: features.slice(0, 24),
    inStock: true,
    scrapedAt: new Date().toISOString(),
  };
}

export async function scrapeProductPoolUrl(url: string): Promise<ProductPoolProduct> {
  const trimmed = String(url || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Geçerli bir http(s) URL girin");
  }

  const host = hostnameOf(trimmed).toLowerCase();

  let product: ProductPoolProduct;

  // PTT AVM Cloudflare korumalı — mevcut stealth scraper (axios UA + Puppeteer)
  if (host.includes("pttavm.com")) {
    product = await scrapePttavmPool(trimmed);
  } else if (host.includes("n11.com")) {
    // n11 Cloudflare — crawler UA → Browser Worker → stealth Chromium
    const html = await fetchN11Html(trimmed);
    product = await scrapeN11(html, trimmed);
    if (!(product.salePrice > 0)) {
      throw new Error("n11 ürün fiyatı alınamadı");
    }
  } else if (host.includes("amazon.")) {
    product = await scrapeAmazonPool(trimmed);
  } else {
    const html = await fetchHtml(trimmed);

    if (host.includes("hepegitim.com")) {
      product = scrapeHepegitim(html, trimmed);
    } else if (host.includes("idefix.com")) {
      product = scrapeIdefix(html, trimmed);
    } else if (host.includes("pazarama.com")) {
      product = scrapePazarama(html, trimmed);
    } else {
      product = scrapeGeneric(html, trimmed);
    }
  }

  return {
    ...product,
    images: filterProductImagesForShopify(product.images, product.siteLogoUrl),
  };
}

function normalizeAmazonProductUrl(sourceUrl: string): { asin: string; cleanUrl: string } {
  const asinMatch =
    sourceUrl.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i) ||
    sourceUrl.match(/[?&]asin=([A-Z0-9]{10})/i);
  const asin = asinMatch?.[1]?.toUpperCase() || "";
  if (!asin) {
    throw new Error("Amazon ASIN bulunamadı (ör. /dp/B07L7RCGJC)");
  }
  let host = "www.amazon.com.tr";
  try {
    host = new URL(sourceUrl).hostname || host;
  } catch {
    /* keep default */
  }
  if (!/amazon\./i.test(host)) host = "www.amazon.com.tr";
  return {
    asin,
    cleanUrl: `https://${host}/dp/${asin}?language=tr_TR`,
  };
}

function amazonImageScore(url: string): number {
  const sl = url.match(/_SL(\d+)_/i)?.[1];
  if (sl) return Number(sl);
  const ux = url.match(/_UX(\d+)_/i)?.[1];
  if (ux) return Number(ux);
  const sx = url.match(/_SX(\d+)_/i)?.[1];
  if (sx) return Number(sx);
  return 200;
}

function preferAmazonProductImages(urls: string[]): string[] {
  const byId = new Map<string, string>();
  for (const raw of urls) {
    if (!raw.startsWith("http")) continue;
    const u = raw.replace(/\\u002F/gi, "/").split("?")[0];
    if (isLikelySiteBrandingImage(u)) continue;
    if (!/media-amazon\.com\/images\/I\//i.test(u)) continue;
    const id = u.match(/\/images\/I\/([^./]+)/i)?.[1];
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || amazonImageScore(u) > amazonImageScore(prev)) byId.set(id, u);
  }
  return [...byId.values()]
    .sort((a, b) => amazonImageScore(b) - amazonImageScore(a))
    .slice(0, 12);
}

function scrapeAmazon(html: string, sourceUrl: string): ProductPoolProduct {
  const { asin, cleanUrl } = normalizeAmazonProductUrl(sourceUrl);
  const $ = cheerio.load(html);

  let title =
    cleanText($("#productTitle").text()) ||
    cleanText($('meta[property="og:title"]').attr("content") || "") ||
    cleanText($("#title").text()) ||
    cleanText($("title").text());
  title = title
    .replace(/\s*:\s*Amazon\.com\.tr.*$/i, "")
    .replace(/\s*[|-]\s*Amazon.*$/i, "")
    .trim();

  let brand =
    cleanText($("#bylineInfo").text()) ||
    cleanText($("a#bylineInfo").text()) ||
    html.match(/"brand"\s*:\s*"([^"]{2,80})"/i)?.[1] ||
    "";
  brand = brand
    .replace(/^(Marka\s*:|Brand\s*:|Visit the|Store)\s*/i, "")
    .replace(/\s+Store$/i, "")
    .trim();

  const priceCandidates: number[] = [];
  const listCandidates: number[] = [];

  $("#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen, .apexPriceToPay .a-offscreen")
    .each((_, el) => {
      const p = parseTrPrice($(el).text());
      if (p && p > 0 && p < 5_000_000) priceCandidates.push(p);
    });
  $(".a-price.a-text-price .a-offscreen, #listPrice, span.a-price.a-text-price span[aria-hidden]")
    .each((_, el) => {
      const p = parseTrPrice($(el).text());
      if (p && p > 0 && p < 5_000_000) listCandidates.push(p);
    });

  // Fallback: all offscreen prices (first is usually sale)
  if (!priceCandidates.length) {
    $(".a-price .a-offscreen").each((_, el) => {
      const p = parseTrPrice($(el).text());
      if (p && p > 0 && p < 5_000_000) priceCandidates.push(p);
    });
  }

  const ldPrices: number[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).html() || "");
      const nodes = Array.isArray(raw) ? raw : [raw];
      for (const node of nodes) {
        if (String(node?.["@type"] || "") !== "Product") continue;
        if (!title && node.name) title = cleanText(String(node.name));
        const brandVal = node.brand;
        if (!brand) {
          if (typeof brandVal === "string") brand = brandVal;
          else if (brandVal && typeof brandVal === "object") {
            brand = String((brandVal as { name?: string }).name || "");
          }
        }
        const offer = node.offers;
        const offers = Array.isArray(offer) ? offer : offer ? [offer] : [];
        for (const o of offers) {
          const p = parseTrPrice(String(o?.price ?? o?.lowPrice ?? ""));
          if (p && p > 0) ldPrices.push(p);
        }
      }
    } catch {
      /* next */
    }
  });

  let salePrice =
    (priceCandidates.length ? Math.min(...priceCandidates) : 0) ||
    (ldPrices.length ? Math.min(...ldPrices) : 0);
  let listPrice = listCandidates.length ? Math.max(...listCandidates) : 0;
  if (listPrice > 0 && salePrice > 0 && listPrice < salePrice) {
    const tmp = listPrice;
    listPrice = salePrice;
    salePrice = tmp;
  }

  const imageUrls: string[] = [];
  const landing =
    $("#landingImage").attr("data-old-hires") ||
    $("#imgTagWrapperId img").attr("data-old-hires") ||
    $("#landingImage").attr("src") ||
    $('meta[property="og:image"]').attr("content") ||
    "";
  if (landing.startsWith("http")) imageUrls.push(landing);
  try {
    const dyn = $("#landingImage").attr("data-a-dynamic-image");
    if (dyn) {
      const map = JSON.parse(dyn) as Record<string, unknown>;
      for (const u of Object.keys(map)) {
        if (u.startsWith("http")) imageUrls.push(u);
      }
    }
  } catch {
    /* ignore */
  }
  for (const m of html.matchAll(/"(?:hiRes|large|mainUrl)"\s*:\s*"(https:[^"]+)"/g)) {
    imageUrls.push(m[1].replace(/\\u002F/gi, "/"));
  }
  const images = preferAmazonProductImages(imageUrls);

  const features: ProductPoolFeature[] = [];
  const pushFeat = (name: string, value: string) => {
    const n = cleanText(name).replace(/:$/, "");
    const v = cleanText(value);
    if (!n || !v || n.length > 80 || v.length > 400) return;
    if (features.some((f) => f.name === n && f.value === v)) return;
    features.push({ name: n, value: v });
  };

  $("#feature-bullets li span.a-list-item").each((_, el) => {
    const t = cleanText($(el).text());
    if (!t || t.length < 8) return;
    if (/Bu ürünle ilgili|Make sure|Garanti bilgisini/i.test(t)) return;
    pushFeat("Özellik", t);
  });
  $("#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr").each(
    (_, tr) => {
      const $tr = $(tr);
      const th = cleanText($tr.find("th").first().text() || $tr.find("td").eq(0).text());
      const td = cleanText($tr.find("td").last().text());
      if (th && td && th !== td) pushFeat(th, td);
    },
  );
  if (brand) pushFeat("Marka", brand);
  pushFeat("ASIN", asin);

  const availText = cleanText($("#availability").text() || $("#availability_feature_div").text());
  const inStock = !/stokta\s*yok|şu anda mevcut değil|currently unavailable|out of stock/i.test(
    availText,
  );

  const compareAt = listPrice > salePrice ? listPrice : null;

  return {
    title: title || `Amazon ${asin}`,
    sourceUrl: cleanUrl,
    siteName: "Amazon",
    siteLogoUrl: "https://www.amazon.com.tr/favicon.ico",
    brand: brand || undefined,
    sku: asin,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: discountPercent(salePrice, compareAt),
    salePrice,
    images,
    features: features.slice(0, 24),
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

async function scrapeAmazonPool(sourceUrl: string): Promise<ProductPoolProduct> {
  const { cleanUrl } = normalizeAmazonProductUrl(sourceUrl);
  const html = await fetchAmazonHtml(cleanUrl);
  const product = scrapeAmazon(html, cleanUrl);
  if (!product.title || product.title === `Amazon ${product.sku}`) {
    throw new Error("Amazon ürün başlığı alınamadı");
  }
  if (!(product.salePrice > 0)) {
    throw new Error("Amazon ürün fiyatı alınamadı");
  }
  return product;
}

/** PTT AVM → ürün havuzu (Cloudflare bypass için pttavm-scraper) */
async function scrapePttavmPool(sourceUrl: string): Promise<ProductPoolProduct> {
  const cleanUrl = sourceUrl.split("?")[0];
  const { scrapePttAvm } = await import("../pttavm-scraper");
  const result = await scrapePttAvm(cleanUrl);

  if (!result.success || !result.title?.trim()) {
    throw new Error(
      result.message ||
        "PTT AVM ürünü çekilemedi (Cloudflare engeli). Daha sonra tekrar deneyin.",
    );
  }

  let salePrice = Number(result.price?.original) || 0;
  const formatted = String(result.price?.formatted || "");
  const fromFormatted = parseTrPrice(formatted);
  if (fromFormatted && fromFormatted > salePrice * 10) {
    salePrice = fromFormatted;
  }
  // TR binlik nokta yanlış parse: 20.936 → 20936
  if (salePrice > 0 && salePrice < 500 && Number.isFinite(salePrice)) {
    const scaled = Math.round(salePrice * 1000);
    if (scaled >= 1000 && scaled < 10_000_000) salePrice = scaled;
  }
  if (!(salePrice > 0)) {
    throw new Error("PTT AVM fiyatı alınamadı");
  }
  salePrice = Math.round(salePrice * 100) / 100;

  const images = (result.images || [])
    .map((img) => (typeof img === "string" ? img : img?.url || ""))
    .filter((u) => typeof u === "string" && u.startsWith("http") && !u.endsWith(".svg"))
    .map((u) => u.split("?")[0]);

  const features: ProductPoolFeature[] = (result.features || [])
    .map((f) => ({
      name: cleanText(String(f.key || "")),
      value: cleanText(String(f.value || "")),
    }))
    .filter((f) => f.name && f.value)
    .slice(0, 24);

  if (result.brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: cleanText(result.brand) });
  }
  if (result.category && !features.some((f) => /kategori/i.test(f.name))) {
    features.push({ name: "Kategori", value: cleanText(result.category) });
  }

  const inStock =
    Array.isArray(result.variants?.allVariants) && result.variants.allVariants.length > 0
      ? result.variants.allVariants.some((v) => v.inStock)
      : true;

  return {
    title: cleanText(result.title),
    sourceUrl: cleanUrl,
    siteName: "PTT AVM",
    siteLogoUrl: "https://www.pttavm.com/favicon.ico",
    brand: result.brand ? cleanText(result.brand) : undefined,
    currency: "TRY",
    price: salePrice,
    compareAtPrice: null,
    discountPercent: 0,
    salePrice,
    images: [...new Set(images)].slice(0, 12),
    features,
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

/** Shopify açıklaması — yalnızca özellikler; yoksa boş */
export function buildProductPoolDescriptionHtml(
  features: Array<{ name?: string; value?: string }> | null | undefined,
): string {
  const rows = (features || [])
    .map((f) => ({
      name: cleanText(String(f?.name || "")),
      value: cleanText(String(f?.value || "")),
    }))
    .filter((f) => f.name && f.value);
  if (!rows.length) return "";

  const items = rows
    .map(
      (f) =>
        `<li><strong>${escapeHtml(f.name)}:</strong> ${escapeHtml(f.value)}</li>`,
    )
    .join("");
  return `<h3>Ürün Özellikleri</h3><ul>${items}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
