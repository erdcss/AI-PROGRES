import axios from "axios";
import * as cheerio from "cheerio";
import { getInternalSourceAccessSecrets } from "./config/source-access.config";

export type TrendyolCategoryProduct = {
  productId: string;
  url: string;
  title?: string;
  image?: string;
};

export type TrendyolCategoryDiscoveryResult = {
  success: boolean;
  categoryUrl: string;
  requestedCount: number;
  foundCount: number;
  pagesScanned: number;
  products: TrendyolCategoryProduct[];
  source: "direct" | "local-agent" | "mixed";
  warnings: string[];
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

function normalizeCategoryUrl(raw: string): URL {
  const value = String(raw || "").trim();
  if (!value) throw new Error("Kategori URL'si gerekli");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Geçerli bir Trendyol kategori URL'si girin");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "trendyol.com" && host !== "www.trendyol.com") {
    throw new Error("Sadece trendyol.com kategori URL'leri desteklenmektedir");
  }

  if (/-p-\d+(?:\/|$)/i.test(parsed.pathname)) {
    throw new Error("Bu alan ürün URL'si değil kategori / arama URL'si bekliyor");
  }

  parsed.hash = "";
  parsed.hostname = "www.trendyol.com";
  return parsed;
}

function pageUrl(base: URL, page: number): string {
  const next = new URL(base.toString());
  if (page <= 1) next.searchParams.delete("pi");
  else next.searchParams.set("pi", String(page));
  return next.toString();
}

function canonicalProductUrl(href: string, base: string): TrendyolCategoryProduct | null {
  if (!href) return null;
  let decoded = href.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  if (decoded.startsWith("//")) decoded = `https:${decoded}`;

  let url: URL;
  try {
    url = new URL(decoded, base);
  } catch {
    return null;
  }

  if (!url.hostname.endsWith("trendyol.com")) return null;
  const match = url.pathname.match(/-p-(\d+)(?:\/|$)/i);
  if (!match) return null;

  url.protocol = "https:";
  url.hostname = "www.trendyol.com";
  url.hash = "";
  url.searchParams.delete("boutiqueId");
  url.searchParams.delete("merchantId");

  return {
    productId: match[1],
    url: `${url.origin}${url.pathname}`,
  };
}

function extractProducts(html: string, currentPageUrl: string): TrendyolCategoryProduct[] {
  const byId = new Map<string, TrendyolCategoryProduct>();
  const $ = cheerio.load(html || "");

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href") || "";
    const product = canonicalProductUrl(href, currentPageUrl);
    if (!product || byId.has(product.productId)) return;

    const title =
      $(element).attr("title")?.trim() ||
      $(element).find("[title]").first().attr("title")?.trim() ||
      $(element).find(".prdct-desc-cntnr-name, .prdct-desc-cntnr-ttl, [class*='product-name']").first().text().trim() ||
      $(element).text().replace(/\s+/g, " ").trim().slice(0, 180) ||
      undefined;

    const image =
      $(element).find("img").first().attr("src") ||
      $(element).find("img").first().attr("data-src") ||
      undefined;

    byId.set(product.productId, { ...product, title, image });
  });

  // Trendyol bazı render sürümlerinde ürün linklerini yalnız gömülü JSON içinde bırakabiliyor.
  const normalized = String(html || "").replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  const linkRegex = /(?:https?:\/\/www\.trendyol\.com)?(\/[a-z0-9ğüşöçıİĞÜŞÖÇ._~!$&'()*+,;=:@%\/-]+-p-\d+)(?:[?"'\\<\s]|$)/giu;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(normalized))) {
    const product = canonicalProductUrl(match[1], currentPageUrl);
    if (product && !byId.has(product.productId)) byId.set(product.productId, product);
  }

  return [...byId.values()];
}

async function fetchDirect(url: string): Promise<string | null> {
  try {
    const response = await axios.get<string>(url, {
      timeout: 25_000,
      responseType: "text",
      validateStatus: () => true,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.trendyol.com/",
      },
    });
    if (response.status >= 200 && response.status < 400 && typeof response.data === "string") {
      return response.data;
    }
  } catch (error) {
    console.warn("[CategoryDiscovery] direct fetch failed", error instanceof Error ? error.message : error);
  }
  return null;
}

async function fetchViaLocalAgent(url: string): Promise<string | null> {
  const secrets = getInternalSourceAccessSecrets();
  const endpoint = secrets.localAgentEndpoint?.trim();
  const token = secrets.localAgentToken?.trim();
  if (!endpoint || !token) return null;

  try {
    const response = await axios.post(
      `${endpoint.replace(/\/$/, "")}/scrape`,
      { url },
      {
        timeout: 65_000,
        validateStatus: () => true,
        headers: {
          "Content-Type": "application/json",
          "x-agent-token": token,
        },
      },
    );
    const html = response.data?.html;
    return typeof html === "string" && html.length > 500 ? html : null;
  } catch (error) {
    console.warn("[CategoryDiscovery] local-agent failed", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function discoverTrendyolCategoryProducts(input: {
  url: string;
  maxProducts?: number;
}): Promise<TrendyolCategoryDiscoveryResult> {
  const base = normalizeCategoryUrl(input.url);
  const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));
  // Trendyol kategori sayfalarında ürün adedi değişebildiği için sayfa başına 20 varsayımıyla güvenli üst sınır.
  const maxPages = Math.min(40, Math.max(1, Math.ceil(requestedCount / 20) + 2));
  const products = new Map<string, TrendyolCategoryProduct>();
  const warnings: string[] = [];
  let pagesScanned = 0;
  let usedDirect = false;
  let usedAgent = false;
  let consecutiveEmpty = 0;

  for (let page = 1; page <= maxPages && products.size < requestedCount; page++) {
    const target = pageUrl(base, page);
    let html = await fetchDirect(target);
    if (html) usedDirect = true;

    let extracted = html ? extractProducts(html, target) : [];
    if (extracted.length === 0) {
      const agentHtml = await fetchViaLocalAgent(target);
      if (agentHtml) {
        usedAgent = true;
        html = agentHtml;
        extracted = extractProducts(agentHtml, target);
      }
    }

    pagesScanned++;
    if (extracted.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
      continue;
    }
    consecutiveEmpty = 0;

    for (const item of extracted) {
      if (!products.has(item.productId)) products.set(item.productId, item);
      if (products.size >= requestedCount) break;
    }

    if (page < maxPages && products.size < requestedCount) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  if (products.size < requestedCount) {
    warnings.push(`${requestedCount} ürün istendi, ${products.size} benzersiz ürün bağlantısı bulunabildi.`);
  }
  if (products.size === 0) {
    warnings.push("Kategori sayfasından ürün bağlantısı çıkarılamadı. Trendyol erişimi veya Local Agent bağlantısını kontrol edin.");
  }

  return {
    success: products.size > 0,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: products.size,
    pagesScanned,
    products: [...products.values()].slice(0, requestedCount),
    source: usedDirect && usedAgent ? "mixed" : usedAgent ? "local-agent" : "direct",
    warnings,
  };
}
