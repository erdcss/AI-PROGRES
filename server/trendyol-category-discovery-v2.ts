import axios from "axios";
import * as cheerio from "cheerio";
import { getInternalSourceAccessSecrets } from "./config/source-access.config";
import { fetchHtmlWithBrowserWorker } from "./services/browser-worker-client.service";
import { loadExistingTrendyolProductsFromMarktGo } from "./services/marktgo/trendyol-dedupe.service";

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
  skippedExistingCount: number;
  existingCatalogCount: number;
  pagesScanned: number;
  products: TrendyolCategoryProduct[];
  source: "direct" | "browser-worker" | "local-agent" | "mixed";
  warnings: string[];
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const PAGE_SIZE = 24;
// Aynı kategoriden tekrar toplu çekimde ilk yüzlerce/ binlerce ürün MARKT-GO'da
// mevcut olabilir. 40 sayfalık eski limit yeni ürünlere ulaşmadan taramayı kesiyordu.
// Üst sınır sadece güvenlik amaçlıdır; normalde kategori tükenince veya hedefe ulaşınca durur.
const MAX_CATEGORY_PAGES = 500;
const MAX_CONSECUTIVE_NO_UNSEEN_PAGES = 4;

function normalizeCategoryUrl(raw: string): URL {
  const value = String(raw || "").trim();
  if (!value) throw new Error("Kategori URL'si gerekli");

  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  if (host !== "trendyol.com" && host !== "www.trendyol.com") {
    throw new Error("Sadece trendyol.com kategori URL'leri desteklenmektedir");
  }
  if (/-p-\d+(?:\/|$)/i.test(parsed.pathname)) {
    throw new Error("Bu alan ürün URL'si değil kategori / arama URL'si bekliyor");
  }

  parsed.hash = "";
  parsed.protocol = "https:";
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
  let decoded = String(href)
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  if (decoded.startsWith("//")) decoded = `https:${decoded}`;

  let parsed: URL;
  try {
    parsed = new URL(decoded, base);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith("trendyol.com")) return null;
  const match = parsed.pathname.match(/-p-(\d+)/i);
  if (!match) return null;

  parsed.protocol = "https:";
  parsed.hostname = "www.trendyol.com";
  parsed.hash = "";
  return {
    productId: match[1],
    url: `${parsed.origin}${parsed.pathname}`,
  };
}

export function extractTrendyolCategoryProducts(
  html: string,
  currentPageUrl: string,
): TrendyolCategoryProduct[] {
  const byId = new Map<string, TrendyolCategoryProduct>();
  const raw = String(html || "");
  const $ = cheerio.load(raw);

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href") || "";
    const product = canonicalProductUrl(href, currentPageUrl);
    if (!product || byId.has(product.productId)) return;

    const title =
      $(element).attr("title")?.trim() ||
      $(element).find("[title]").first().attr("title")?.trim() ||
      $(element)
        .find(".prdct-desc-cntnr-name, .prdct-desc-cntnr-ttl, [class*='product-name']")
        .first()
        .text()
        .trim() ||
      undefined;
    const image =
      $(element).find("img").first().attr("src") ||
      $(element).find("img").first().attr("data-src") ||
      undefined;

    byId.set(product.productId, { ...product, title, image });
  });

  const normalized = raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/");
  const linkRegex = /(?:https?:\/\/(?:www\.)?trendyol\.com)?(\/[^\s"'<>]+-p-\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(normalized))) {
    const product = canonicalProductUrl(match[1], currentPageUrl);
    if (product && !byId.has(product.productId)) {
      byId.set(product.productId, product);
    }
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
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
        "Cache-Control": "no-cache",
        Referer: "https://www.trendyol.com/",
      },
    });
    if (response.status >= 200 && response.status < 400 && typeof response.data === "string") {
      return response.data;
    }
  } catch (error) {
    console.warn("[CategoryDiscoveryV2] direct failed", error instanceof Error ? error.message : error);
  }
  return null;
}

async function fetchViaBrowserWorker(url: string): Promise<string | null> {
  try {
    const result = await fetchHtmlWithBrowserWorker(url);
    if (result.success && typeof result.html === "string" && result.html.length > 500) {
      return result.html;
    }
    console.warn("[CategoryDiscoveryV2] browser worker empty", {
      category: result.errorCategory,
      stage: result.stageError,
      status: result.status,
    });
  } catch (error) {
    console.warn("[CategoryDiscoveryV2] browser worker failed", error instanceof Error ? error.message : error);
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
    console.warn("[CategoryDiscoveryV2] local agent failed", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function discoverTrendyolCategoryProducts(input: {
  url: string;
  maxProducts?: number;
}): Promise<TrendyolCategoryDiscoveryResult> {
  const base = normalizeCategoryUrl(input.url);
  const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));

  // KATI KURAL: MARKT-GO canlı kataloğu doğrulanmadan kategori toplu çekimi başlamaz.
  // Böylece katalog kontrolü başarısız olduğunda sistem fail-open davranıp duplicate oluşturamaz.
  const existingOnMarktGo = await loadExistingTrendyolProductsFromMarktGo();

  const products = new Map<string, TrendyolCategoryProduct>();
  const seenCategoryProductIds = new Set<string>();
  const skippedExistingIds = new Set<string>();
  const warnings: string[] = [];
  let pagesScanned = 0;
  let usedDirect = false;
  let usedBrowserWorker = false;
  let usedLocalAgent = false;
  let consecutiveEmpty = 0;
  let consecutiveNoUnseenProducts = 0;

  // requestedCount = bulunması gereken YENİ ürün sayısıdır. Önceden MARKT-GO'ya
  // gönderilen ürünler sayıya dahil edilmez; sistem sonraki kategori sayfalarına
  // ilerlemeye devam eder. Bu özellikle aynı kategori URL'sinin tekrar kullanımında kritiktir.
  for (let page = 1; page <= MAX_CATEGORY_PAGES && products.size < requestedCount; page++) {
    const target = pageUrl(base, page);
    let extracted: TrendyolCategoryProduct[] = [];

    const directHtml = await fetchDirect(target);
    if (directHtml) {
      usedDirect = true;
      extracted = extractTrendyolCategoryProducts(directHtml, target);
    }

    if (extracted.length === 0) {
      const workerHtml = await fetchViaBrowserWorker(target);
      if (workerHtml) {
        usedBrowserWorker = true;
        extracted = extractTrendyolCategoryProducts(workerHtml, target);
      }
    }

    if (extracted.length === 0) {
      const localHtml = await fetchViaLocalAgent(target);
      if (localHtml) {
        usedLocalAgent = true;
        extracted = extractTrendyolCategoryProducts(localHtml, target);
      }
    }

    pagesScanned++;

    if (extracted.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
      continue;
    }
    consecutiveEmpty = 0;

    let unseenOnThisPage = 0;
    for (const item of extracted) {
      if (seenCategoryProductIds.has(item.productId)) continue;
      seenCategoryProductIds.add(item.productId);
      unseenOnThisPage++;

      if (existingOnMarktGo.has(item.productId)) {
        skippedExistingIds.add(item.productId);
        continue;
      }

      products.set(item.productId, item);
      if (products.size >= requestedCount) break;
    }

    // Trendyol bazı durumlarda pi parametresine rağmen aynı HTML'i tekrar döndürebilir.
    // Sadece bu durumda güvenli şekilde kesiyoruz. Sayfada yeni kategori productId'leri
    // görülüyorsa hepsi MARKT-GO'da mevcut olsa bile taramaya devam edilir.
    if (unseenOnThisPage === 0) {
      consecutiveNoUnseenProducts++;
      if (consecutiveNoUnseenProducts >= MAX_CONSECUTIVE_NO_UNSEEN_PAGES) {
        warnings.push(
          "Trendyol art arda aynı ürün sayfalarını döndürdüğü için tarama güvenli şekilde durduruldu.",
        );
        break;
      }
    } else {
      consecutiveNoUnseenProducts = 0;
    }

    console.log(
      `[CategoryDiscoveryV2] page=${page} extracted=${extracted.length} unseen=${unseenOnThisPage} new=${products.size}/${requestedCount} skippedExisting=${skippedExistingIds.size}`,
    );
  }

  if (skippedExistingIds.size > 0) {
    warnings.push(
      `${skippedExistingIds.size} ürün zaten MARKT-GO'da bulundu ve tekrar eklenmedi.`,
    );
  }
  if (products.size < requestedCount) {
    warnings.push(
      `${requestedCount} yeni ürün istendi; ${pagesScanned} sayfa tarandı ve ${products.size} eklenmemiş ürün bulunabildi.`,
    );
  }
  if (products.size === 0 && skippedExistingIds.size > 0) {
    warnings.push(
      `Taranan ${seenCategoryProductIds.size} benzersiz kategori ürününün tamamı zaten MARKT-GO'da.`,
    );
  } else if (products.size === 0) {
    warnings.push(
      "Kategori sayfasından ürün bağlantısı çıkarılamadı. Direct HTML, Browser Worker ve Local Agent yolları denendi.",
    );
  }

  const sourceCount = [usedDirect, usedBrowserWorker, usedLocalAgent].filter(Boolean).length;
  const source: TrendyolCategoryDiscoveryResult["source"] =
    sourceCount > 1
      ? "mixed"
      : usedBrowserWorker
        ? "browser-worker"
        : usedLocalAgent
          ? "local-agent"
          : "direct";

  return {
    success: products.size > 0,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: products.size,
    skippedExistingCount: skippedExistingIds.size,
    existingCatalogCount: existingOnMarktGo.size,
    pagesScanned,
    products: [...products.values()].slice(0, requestedCount),
    source,
    warnings,
  };
}
