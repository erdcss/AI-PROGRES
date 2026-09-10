import axios from "axios";
import {
  extractTrendyolCategoryProducts,
  type TrendyolCategoryProduct,
} from "./trendyol-category-discovery-v2";
import { getInternalSourceAccessSecrets } from "./config/source-access.config";
import { fetchHtmlWithBrowserWorker } from "./services/browser-worker-client.service";
import { loadExistingTrendyolProductsFromMarktGo } from "./services/marktgo/trendyol-dedupe.service";

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
const MAX_CONSECUTIVE_EMPTY_PAGES = 8;
const MAX_CONSECUTIVE_REPEAT_PAGES = 30;
const MIN_HEALTHY_UNSEEN_PER_PAGE = 8;

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

  parsed.protocol = "https:";
  parsed.hostname = "www.trendyol.com";
  parsed.hash = "";
  return parsed;
}

function categoryPageUrl(base: URL, page: number): string {
  const next = new URL(base.toString());
  if (page <= 1) next.searchParams.delete("pi");
  else next.searchParams.set("pi", String(page));
  return next.toString();
}

function normalizeImage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const image = value.trim();
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith("//")) return `https:${image}`;
  if (image.startsWith("/")) return `https://cdn.dsmcdn.com${image}`;
  return image;
}

function slugify(value: unknown): string {
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

function productFromApiRow(row: any, baseUrl: string): TrendyolCategoryProduct | null {
  if (!row || typeof row !== "object") return null;

  const rawId = row.id ?? row.productId ?? row.contentId;
  const productId = String(rawId ?? "").trim();
  if (!/^\d+$/.test(productId)) return null;

  const rawUrl = String(row.url ?? row.productUrl ?? row.webUrl ?? row.link ?? "").trim();
  let url = "";

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl, baseUrl);
      const match = parsed.pathname.match(/-p-(\d+)/i);
      if (match?.[1] && match[1] !== productId) return null;
      if (match?.[1]) {
        parsed.protocol = "https:";
        parsed.hostname = "www.trendyol.com";
        parsed.hash = "";
        url = `${parsed.origin}${parsed.pathname}`;
      }
    } catch {
      url = "";
    }
  }

  // result.products içindeki satır zaten gerçek ürün kaydıdır. URL alanı gelmezse
  // Trendyol productId'si ile güvenli canonical URL üretilebilir.
  if (!url) {
    const title = row.name ?? row.title ?? "urun";
    url = `https://www.trendyol.com/${slugify(title)}-p-${productId}`;
  }

  const image = [
    row.image,
    row.imageUrl,
    row.imageUrls?.[0],
    row.images?.[0],
    row.media?.images?.[0]?.url,
  ]
    .map(normalizeImage)
    .find(Boolean);

  return {
    productId,
    url,
    title: String(row.name ?? row.title ?? "").trim() || undefined,
    image,
  };
}

/**
 * Public API'de yalnız bilinen ürün listelerini kabul et.
 * Önceki geniş recursive tarama filtre/marka/kampanya objelerini ürün sanabiliyordu.
 */
function strictProductRows(payload: any): any[] {
  const candidates = [
    payload?.result?.products,
    payload?.data?.result?.products,
    payload?.data?.products,
    payload?.products,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function buildApiUrl(base: URL, params: { pi: number; offset?: number }): string {
  const categoryPath = base.pathname.replace(/^\/+/, "");
  const endpoint = new URL(
    `https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll/${categoryPath}`,
  );

  for (const [key, value] of base.searchParams.entries()) {
    if (key !== "pi" && key !== "offset") endpoint.searchParams.set(key, value);
  }

  endpoint.searchParams.set("pi", String(params.pi));
  if (typeof params.offset === "number") {
    endpoint.searchParams.set("offset", String(Math.max(0, params.offset)));
  }

  // Trendyol kategori infinite-scroll isteklerinde görülen temel parametreler.
  endpoint.searchParams.set("culture", endpoint.searchParams.get("culture") || "tr-TR");
  endpoint.searchParams.set("userGenderId", endpoint.searchParams.get("userGenderId") || "1");
  endpoint.searchParams.set("pId", endpoint.searchParams.get("pId") || "0");
  endpoint.searchParams.set("scoringAlgorithmId", endpoint.searchParams.get("scoringAlgorithmId") || "2");
  endpoint.searchParams.set("categoryRelevancyEnabled", endpoint.searchParams.get("categoryRelevancyEnabled") || "false");
  endpoint.searchParams.set("isLegalRequirementConfirmed", endpoint.searchParams.get("isLegalRequirementConfirmed") || "false");
  endpoint.searchParams.set("searchStrategyType", endpoint.searchParams.get("searchStrategyType") || "DEFAULT");
  endpoint.searchParams.set("productStampType", endpoint.searchParams.get("productStampType") || "TypeA");
  endpoint.searchParams.set("fixSlotProductAdsIncluded", endpoint.searchParams.get("fixSlotProductAdsIncluded") || "false");
  endpoint.searchParams.set("os", endpoint.searchParams.get("os") || "1");
  endpoint.searchParams.set("sk", endpoint.searchParams.get("sk") || "1");

  return endpoint.toString();
}

/**
 * Trendyol farklı kategori/listing türlerinde pi+offset kombinasyonunu farklı
 * yorumlayabiliyor. Tek varsayıma bağlanmak yerine güvenli varyantları birlikte
 * deneyip gerçek result.products kümelerini birleştiriyoruz.
 */
function buildApiVariants(base: URL, logicalPage: number): string[] {
  const offsetA = Math.max(0, (logicalPage - 1) * PAGE_SIZE);
  const offsetB = Math.max(0, (logicalPage - 2) * PAGE_SIZE);
  const urls = [
    buildApiUrl(base, { pi: logicalPage }),
    buildApiUrl(base, { pi: logicalPage, offset: offsetA }),
    buildApiUrl(base, { pi: 2, offset: offsetA }),
  ];

  if (logicalPage >= 2) {
    urls.push(buildApiUrl(base, { pi: 2, offset: offsetB }));
  }

  return [...new Set(urls)];
}

async function fetchApiVariant(
  url: string,
  base: URL,
  logicalPage: number,
): Promise<TrendyolCategoryProduct[]> {
  try {
    const response = await axios.get(url, {
      timeout: 15_000,
      validateStatus: () => true,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
        Referer: categoryPageUrl(base, logicalPage),
        Origin: "https://www.trendyol.com",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (response.status < 200 || response.status >= 400) return [];

    const rows = strictProductRows(response.data);
    const byId = new Map<string, TrendyolCategoryProduct>();
    for (const row of rows) {
      const product = productFromApiRow(row, base.toString());
      if (product && !byId.has(product.productId)) byId.set(product.productId, product);
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

function mergeProducts(groups: TrendyolCategoryProduct[][]): TrendyolCategoryProduct[] {
  const byId = new Map<string, TrendyolCategoryProduct>();
  for (const group of groups) {
    for (const product of group) {
      if (!product?.productId || !product?.url) continue;
      if (!byId.has(product.productId)) byId.set(product.productId, product);
    }
  }
  return [...byId.values()];
}

function countUnseen(items: TrendyolCategoryProduct[], seen: Set<string>): number {
  let count = 0;
  for (const item of items) {
    if (!seen.has(item.productId)) count++;
  }
  return count;
}

async function fetchPublicProducts(
  base: URL,
  logicalPage: number,
): Promise<TrendyolCategoryProduct[]> {
  const urls = buildApiVariants(base, logicalPage);
  const groups = await Promise.all(
    urls.map((url) => fetchApiVariant(url, base, logicalPage)),
  );
  return mergeProducts(groups);
}

async function fetchDirectProducts(target: string): Promise<TrendyolCategoryProduct[]> {
  try {
    const response = await axios.get<string>(target, {
      timeout: 15_000,
      responseType: "text",
      validateStatus: () => true,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.trendyol.com/",
      },
    });

    if (response.status >= 200 && response.status < 400 && typeof response.data === "string") {
      return extractTrendyolCategoryProducts(response.data, target);
    }
  } catch {
    // Browser Worker fallback aşağıda devreye girebilir.
  }
  return [];
}

async function fetchWorkerProducts(target: string): Promise<TrendyolCategoryProduct[]> {
  try {
    const result = await fetchHtmlWithBrowserWorker(target);
    if (result.success && typeof result.html === "string" && result.html.length > 500) {
      return extractTrendyolCategoryProducts(result.html, target);
    }
  } catch {
    // Local Agent fallback aşağıda devreye girebilir.
  }
  return [];
}

async function fetchLocalAgentProducts(target: string): Promise<TrendyolCategoryProduct[]> {
  const secrets = getInternalSourceAccessSecrets();
  const endpoint = secrets.localAgentEndpoint?.trim();
  const token = secrets.localAgentToken?.trim();
  if (!endpoint || !token) return [];

  try {
    const response = await axios.post(
      `${endpoint.replace(/\/$/, "")}/scrape`,
      { url: target },
      {
        timeout: 45_000,
        validateStatus: () => true,
        headers: {
          "Content-Type": "application/json",
          "x-agent-token": token,
        },
      },
    );
    const html = response.data?.html;
    return typeof html === "string"
      ? extractTrendyolCategoryProducts(html, target)
      : [];
  } catch {
    return [];
  }
}

export async function discoverTrendyolCategoryProducts(input: {
  url: string;
  maxProducts?: number;
}): Promise<TrendyolCategoryDiscoveryResult> {
  const base = normalizeCategoryUrl(input.url);
  const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));

  // Katı duplicate kuralı korunur: MARKT-GO kataloğu doğrulanmadan seçim başlamaz.
  const existingOnMarktGo = await loadExistingTrendyolProductsFromMarktGo();

  const selected = new Map<string, TrendyolCategoryProduct>();
  const seenCategoryIds = new Set<string>();
  const skippedExistingIds = new Set<string>();
  const warnings: string[] = [];
  const usedSources = new Set<"public-api" | "direct" | "browser-worker" | "local-agent">();

  let pagesScanned = 0;
  let consecutiveEmptyPages = 0;
  let consecutiveRepeatPages = 0;

  for (
    let logicalPage = 1;
    logicalPage <= MAX_CATEGORY_PAGES && selected.size < requestedCount;
    logicalPage++
  ) {
    const target = categoryPageUrl(base, logicalPage);

    let candidates = await fetchPublicProducts(base, logicalPage);
    if (candidates.length > 0) usedSources.add("public-api");

    // Public API yalnız birkaç yeni ürün veriyorsa sayfalama varyantı tekrar ediyor olabilir.
    // Bu durumda gerçek kategori HTML'ini de kontrol et.
    if (
      candidates.length === 0 ||
      countUnseen(candidates, seenCategoryIds) < MIN_HEALTHY_UNSEEN_PER_PAGE
    ) {
      const direct = await fetchDirectProducts(target);
      if (direct.length > 0) usedSources.add("direct");
      candidates = mergeProducts([candidates, direct]);
    }

    // Hâlâ sağlıklı sayıda yeni ID yoksa gerçek Chromium DOM'una geç.
    if (
      candidates.length === 0 ||
      countUnseen(candidates, seenCategoryIds) < MIN_HEALTHY_UNSEEN_PER_PAGE
    ) {
      const worker = await fetchWorkerProducts(target);
      if (worker.length > 0) usedSources.add("browser-worker");
      candidates = mergeProducts([candidates, worker]);
    }

    // Son fallback yalnız hiç yeni ürün görünmüyorsa Local Agent.
    if (countUnseen(candidates, seenCategoryIds) === 0) {
      const local = await fetchLocalAgentProducts(target);
      if (local.length > 0) usedSources.add("local-agent");
      candidates = mergeProducts([candidates, local]);
    }

    pagesScanned++;

    if (candidates.length === 0) {
      consecutiveEmptyPages++;
      console.warn(
        `[CategoryDiscoveryV3] page=${logicalPage} empty=${consecutiveEmptyPages}/${MAX_CONSECUTIVE_EMPTY_PAGES}`,
      );
      if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) break;
      continue;
    }
    consecutiveEmptyPages = 0;

    let unseenOnPage = 0;
    let addedOnPage = 0;

    for (const product of candidates) {
      if (seenCategoryIds.has(product.productId)) continue;
      seenCategoryIds.add(product.productId);
      unseenOnPage++;

      if (existingOnMarktGo.has(product.productId)) {
        skippedExistingIds.add(product.productId);
        continue;
      }

      selected.set(product.productId, product);
      addedOnPage++;
      if (selected.size >= requestedCount) break;
    }

    if (unseenOnPage === 0) {
      consecutiveRepeatPages++;
      if (consecutiveRepeatPages >= MAX_CONSECUTIVE_REPEAT_PAGES) {
        warnings.push(
          "Trendyol aynı ürün grubunu uzun süre tekrar ettiği için tarama güvenli şekilde durduruldu.",
        );
        break;
      }
    } else {
      consecutiveRepeatPages = 0;
    }

    console.log(
      `[CategoryDiscoveryV3] page=${logicalPage} candidates=${candidates.length} unseen=${unseenOnPage} added=${addedOnPage} selected=${selected.size}/${requestedCount} skippedExisting=${skippedExistingIds.size}`,
    );
  }

  if (skippedExistingIds.size > 0) {
    warnings.push(
      `${skippedExistingIds.size} ürün zaten MARKT-GO'da bulundu ve tekrar eklenmedi.`,
    );
  }

  if (selected.size < requestedCount) {
    warnings.push(
      `${requestedCount} yeni ürün istendi; ${pagesScanned} kategori adımı tarandı ve ${selected.size} eklenmemiş ürün bulunabildi.`,
    );
  }

  if (selected.size === 0 && seenCategoryIds.size > 0) {
    warnings.push(
      `${seenCategoryIds.size} benzersiz Trendyol ürünü görüldü ancak tamamı MARKT-GO'da mevcut veya yeni ürün bulunamadı.`,
    );
  }

  if (selected.size === 0 && seenCategoryIds.size === 0) {
    warnings.push(
      "Kategori ürünleri alınamadı. Public API, Direct HTML, Browser Worker ve Local Agent yolları denendi.",
    );
  }

  const source: TrendyolCategoryDiscoveryResult["source"] =
    usedSources.size > 1
      ? "mixed"
      : usedSources.has("public-api")
        ? "public-api"
        : usedSources.has("browser-worker")
          ? "browser-worker"
          : usedSources.has("local-agent")
            ? "local-agent"
            : "direct";

  return {
    success: selected.size > 0,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: selected.size,
    skippedExistingCount: skippedExistingIds.size,
    existingCatalogCount: existingOnMarktGo.size,
    pagesScanned,
    products: [...selected.values()].slice(0, requestedCount),
    source,
    warnings,
  };
}
