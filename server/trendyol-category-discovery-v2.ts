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
  source: "public-api" | "direct" | "browser-worker" | "local-agent" | "mixed";
  warnings: string[];
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const PAGE_SIZE = 24;
const MAX_CATEGORY_PAGES = 500;
const MAX_CONSECUTIVE_EMPTY_PAGES = 4;
const MAX_CONSECUTIVE_REPEAT_PAGES = 6;

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
        .find(".prdct-desc-cntnr-name, .prdct-desc-cntnr-ttl, [class*='product-name'], [class*='product-title']")
        .first()
        .text()
        .trim() ||
      undefined;
    const image =
      $(element).find("img").first().attr("src") ||
      $(element).find("img").first().attr("data-src") ||
      $(element).find("img").first().attr("data-original") ||
      undefined;

    byId.set(product.productId, { ...product, title, image });
  });

  const normalized = raw
    .replace(/&amp;/gi, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/");
  const linkRegex = /(?:https?:\/\/(?:www\.)?trendyol\.com)?(\/[^\s"'<>]+-p-\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(normalized))) {
    const product = canonicalProductUrl(match[1], currentPageUrl);
    if (product && !byId.has(product.productId)) byId.set(product.productId, product);
  }

  return [...byId.values()];
}

function normalizeImage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const image = value.trim();
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith("//")) return `https:${image}`;
  if (image.startsWith("/")) return `https://cdn.dsmcdn.com${image}`;
  return image;
}

function slugifyProductName(value: unknown): string {
  return (
    String(value || "urun")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "urun"
  );
}

function productFromPublicApiRow(row: any, baseUrl: string): TrendyolCategoryProduct | null {
  const id = String(row?.id ?? row?.productId ?? row?.contentId ?? "").trim();
  const rawUrl = row?.url || row?.productUrl || row?.link || row?.webUrl || "";
  let canonical = rawUrl ? canonicalProductUrl(String(rawUrl), baseUrl) : null;

  if (!canonical && /^\d+$/.test(id)) {
    canonical = {
      productId: id,
      url: `https://www.trendyol.com/${slugifyProductName(row?.name || row?.title)}-p-${id}`,
    };
  }
  if (!canonical) return null;

  const imageCandidates = [
    row?.image,
    row?.imageUrl,
    row?.imageUrls?.[0],
    row?.images?.[0],
    row?.media?.images?.[0]?.url,
  ];
  const image = imageCandidates.map(normalizeImage).find(Boolean);

  return {
    ...canonical,
    title: String(row?.name || row?.title || "").trim() || undefined,
    image,
  };
}

function buildPublicDiscoveryUrl(base: URL, page: number): string {
  const path = base.pathname.replace(/^\/+/, "");
  const endpoint = new URL(
    `https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll/${path}`,
  );

  for (const [key, value] of base.searchParams.entries()) {
    if (key !== "pi" && key !== "offset") endpoint.searchParams.set(key, value);
  }

  endpoint.searchParams.set("pi", String(page));
  endpoint.searchParams.set("offset", String((page - 1) * PAGE_SIZE));
  endpoint.searchParams.set("culture", endpoint.searchParams.get("culture") || "tr-TR");
  endpoint.searchParams.set("userGenderId", endpoint.searchParams.get("userGenderId") || "1");
  endpoint.searchParams.set("pId", endpoint.searchParams.get("pId") || "0");
  endpoint.searchParams.set("scoringAlgorithmId", endpoint.searchParams.get("scoringAlgorithmId") || "2");
  endpoint.searchParams.set("categoryRelevancyEnabled", endpoint.searchParams.get("categoryRelevancyEnabled") || "false");
  endpoint.searchParams.set("isLegalRequirementConfirmed", endpoint.searchParams.get("isLegalRequirementConfirmed") || "false");
  endpoint.searchParams.set("searchStrategyType", endpoint.searchParams.get("searchStrategyType") || "DEFAULT");
  endpoint.searchParams.set("productStampType", endpoint.searchParams.get("productStampType") || "TypeA");
  endpoint.searchParams.set("fixSlotProductAdsIncluded", endpoint.searchParams.get("fixSlotProductAdsIncluded") || "true");
  return endpoint.toString();
}

async function fetchViaPublicDiscoveryApi(
  base: URL,
  page: number,
): Promise<TrendyolCategoryProduct[]> {
  const url = buildPublicDiscoveryUrl(base, page);
  try {
    const response = await axios.get(url, {
      timeout: 20_000,
      validateStatus: () => true,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
        Referer: pageUrl(base, page),
        Origin: "https://www.trendyol.com",
      },
    });

    if (response.status < 200 || response.status >= 400) {
      console.warn(`[CategoryDiscoveryV2] public api page=${page} HTTP ${response.status}`);
      return [];
    }

    const data = response.data;
    const rows =
      data?.result?.products ||
      data?.result?.contents ||
      data?.result?.content ||
      data?.products ||
      data?.contents ||
      data?.content ||
      [];
    if (!Array.isArray(rows)) return [];

    const byId = new Map<string, TrendyolCategoryProduct>();
    for (const row of rows) {
      const product = productFromPublicApiRow(row, base.toString());
      if (product && !byId.has(product.productId)) byId.set(product.productId, product);
    }
    return [...byId.values()];
  } catch (error) {
    console.warn(
      `[CategoryDiscoveryV2] public api page=${page} failed`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

async function fetchDirect(url: string): Promise<string | null> {
  try {
    const response = await axios.get<string>(url, {
      timeout: 20_000,
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

  // Fail-closed duplicate guard: MARKT-GO katalog doğrulanmadan yeni ürün seçilmez.
  const existingOnMarktGo = await loadExistingTrendyolProductsFromMarktGo();

  const products = new Map<string, TrendyolCategoryProduct>();
  const seenCategoryProductIds = new Set<string>();
  const skippedExistingIds = new Set<string>();
  const warnings: string[] = [];
  let pagesScanned = 0;
  let usedPublicApi = false;
  let usedDirect = false;
  let usedBrowserWorker = false;
  let usedLocalAgent = false;
  let consecutiveEmpty = 0;
  let consecutiveRepeatOnly = 0;

  for (let page = 1; page <= MAX_CATEGORY_PAGES && products.size < requestedCount; page++) {
    const target = pageUrl(base, page);

    // Birincil kaynak: Trendyol kategori sayfasının kendi infinite-scroll JSON servisi.
    let extracted = await fetchViaPublicDiscoveryApi(base, page);
    if (extracted.length > 0) usedPublicApi = true;

    // API geçici olarak boş/engelli ise HTML yollarına düş.
    if (extracted.length === 0) {
      const directHtml = await fetchDirect(target);
      if (directHtml) {
        usedDirect = true;
        extracted = extractTrendyolCategoryProducts(directHtml, target);
      }
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
      console.warn(`[CategoryDiscoveryV2] page=${page} empty (${consecutiveEmpty}/${MAX_CONSECUTIVE_EMPTY_PAGES})`);
      if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY_PAGES) break;
      continue;
    }
    consecutiveEmpty = 0;

    let unseenOnThisPage = 0;
    let newOnThisPage = 0;
    for (const item of extracted) {
      if (seenCategoryProductIds.has(item.productId)) continue;
      seenCategoryProductIds.add(item.productId);
      unseenOnThisPage++;

      if (existingOnMarktGo.has(item.productId)) {
        skippedExistingIds.add(item.productId);
        continue;
      }

      products.set(item.productId, item);
      newOnThisPage++;
      if (products.size >= requestedCount) break;
    }

    // API/HTML gerçekten aynı ürünleri tekrar döndürürse sonsuz döngüyü önle.
    if (unseenOnThisPage === 0) {
      consecutiveRepeatOnly++;
      if (consecutiveRepeatOnly >= MAX_CONSECUTIVE_REPEAT_PAGES) {
        warnings.push("Trendyol art arda aynı ürün grubunu döndürdüğü için tarama durduruldu.");
        break;
      }
    } else {
      consecutiveRepeatOnly = 0;
    }

    console.log(
      `[CategoryDiscoveryV2] page=${page} extracted=${extracted.length} unseen=${unseenOnThisPage} newPage=${newOnThisPage} newTotal=${products.size}/${requestedCount} skippedExisting=${skippedExistingIds.size}`,
    );
  }

  if (skippedExistingIds.size > 0) {
    warnings.push(`${skippedExistingIds.size} ürün zaten MARKT-GO'da bulundu ve tekrar eklenmedi.`);
  }
  if (products.size < requestedCount) {
    warnings.push(
      `${requestedCount} yeni ürün istendi; ${pagesScanned} sayfa tarandı ve ${products.size} eklenmemiş ürün bulunabildi.`,
    );
  }
  if (products.size === 0 && skippedExistingIds.size > 0) {
    warnings.push(`Taranan ${seenCategoryProductIds.size} benzersiz ürünün tamamı zaten MARKT-GO'da.`);
  } else if (products.size === 0) {
    warnings.push(
      "Kategori ürünleri alınamadı. Public API, Direct HTML, Browser Worker ve Local Agent yolları denendi.",
    );
  }

  const sourceCount = [usedPublicApi, usedDirect, usedBrowserWorker, usedLocalAgent].filter(Boolean).length;
  const source: TrendyolCategoryDiscoveryResult["source"] =
    sourceCount > 1
      ? "mixed"
      : usedPublicApi
        ? "public-api"
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
