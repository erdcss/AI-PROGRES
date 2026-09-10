import axios from "axios";
import { extractTrendyolCategoryProducts, type TrendyolCategoryProduct } from "./trendyol-category-discovery-v2";
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
const MAX_EMPTY_PAGES = 6;
const MAX_REPEAT_PAGES = 12;

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

function pageUrl(base: URL, page: number): string {
  const next = new URL(base.toString());
  if (page <= 1) next.searchParams.delete("pi");
  else next.searchParams.set("pi", String(page));
  return next.toString();
}

function normalizeImage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("/")) return `https://cdn.dsmcdn.com${v}`;
  return v;
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

function canonicalFromUnknown(row: any, baseUrl: string): TrendyolCategoryProduct | null {
  const id = String(row?.id ?? row?.productId ?? row?.contentId ?? row?.product?.id ?? row?.product?.productId ?? "").trim();
  const rawUrl = String(
    row?.url ?? row?.productUrl ?? row?.link ?? row?.webUrl ?? row?.product?.url ?? row?.product?.productUrl ?? "",
  ).trim();

  let productId = /^\d+$/.test(id) ? id : "";
  let url = rawUrl;
  const match = rawUrl.match(/-p-(\d+)/i);
  if (match?.[1]) productId = match[1];
  if (!productId) return null;

  if (!url || !/-p-\d+/i.test(url)) {
    url = `https://www.trendyol.com/${slugify(row?.name ?? row?.title ?? row?.product?.name ?? row?.product?.title)}-p-${productId}`;
  } else {
    try {
      const parsed = new URL(url, baseUrl);
      parsed.protocol = "https:";
      parsed.hostname = "www.trendyol.com";
      parsed.hash = "";
      url = `${parsed.origin}${parsed.pathname}`;
    } catch {
      return null;
    }
  }

  const image = [
    row?.image,
    row?.imageUrl,
    row?.imageUrls?.[0],
    row?.images?.[0],
    row?.media?.images?.[0]?.url,
    row?.product?.image,
    row?.product?.imageUrl,
  ]
    .map(normalizeImage)
    .find(Boolean);

  return {
    productId,
    url,
    title: String(row?.name ?? row?.title ?? row?.product?.name ?? row?.product?.title ?? "").trim() || undefined,
    image,
  };
}

function collectProductRows(payload: unknown): any[] {
  const out: any[] = [];
  const visited = new Set<unknown>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || node == null || visited.has(node)) return;
    if (typeof node !== "object") return;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const rec = node as Record<string, unknown>;
    const id = rec.id ?? rec.productId ?? rec.contentId;
    const hasProductShape =
      id != null &&
      (rec.url != null || rec.productUrl != null || rec.webUrl != null || rec.name != null || rec.title != null || rec.image != null);
    if (hasProductShape) out.push(rec);
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") walk(value, depth + 1);
    }
  };
  walk(payload, 0);
  return out;
}

function buildPublicDiscoveryUrls(base: URL, page: number): string[] {
  const path = base.pathname.replace(/^\/+/, "");
  const variants = [
    new URL(`https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll/${path}`),
    new URL(`https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll/sr`),
  ];

  for (const endpoint of variants) {
    for (const [key, value] of base.searchParams.entries()) {
      if (key !== "pi" && key !== "offset") endpoint.searchParams.set(key, value);
    }
    if (endpoint.pathname.endsWith("/sr") && !endpoint.searchParams.has("q")) {
      endpoint.searchParams.set("q", path);
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
  }
  return variants.map((x) => x.toString());
}

async function fetchPublic(base: URL, page: number): Promise<TrendyolCategoryProduct[]> {
  for (const url of buildPublicDiscoveryUrls(base, page)) {
    try {
      const response = await axios.get(url, {
        timeout: 15_000,
        validateStatus: () => true,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
          Referer: pageUrl(base, page),
          Origin: "https://www.trendyol.com",
        },
      });
      if (response.status < 200 || response.status >= 400) continue;
      const byId = new Map<string, TrendyolCategoryProduct>();
      for (const row of collectProductRows(response.data)) {
        const product = canonicalFromUnknown(row, base.toString());
        if (product && !byId.has(product.productId)) byId.set(product.productId, product);
      }
      if (byId.size > 0) return [...byId.values()];
    } catch {
      // try next variant
    }
  }
  return [];
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
      },
    });
    if (response.status >= 200 && response.status < 400 && typeof response.data === "string") {
      return extractTrendyolCategoryProducts(response.data, target);
    }
  } catch {
    // fallback below
  }
  return [];
}

async function fetchWorkerProducts(target: string): Promise<TrendyolCategoryProduct[]> {
  try {
    const result = await fetchHtmlWithBrowserWorker(target);
    if (result.success && result.html) return extractTrendyolCategoryProducts(result.html, target);
  } catch {
    // fallback below
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
      { timeout: 45_000, validateStatus: () => true, headers: { "Content-Type": "application/json", "x-agent-token": token } },
    );
    const html = response.data?.html;
    return typeof html === "string" ? extractTrendyolCategoryProducts(html, target) : [];
  } catch {
    return [];
  }
}

function unseenCount(items: TrendyolCategoryProduct[], seen: Set<string>): number {
  let count = 0;
  for (const item of items) if (!seen.has(item.productId)) count++;
  return count;
}

function mergeCandidates(groups: TrendyolCategoryProduct[][]): TrendyolCategoryProduct[] {
  const byId = new Map<string, TrendyolCategoryProduct>();
  for (const group of groups) {
    for (const item of group) if (!byId.has(item.productId)) byId.set(item.productId, item);
  }
  return [...byId.values()];
}

export async function discoverTrendyolCategoryProducts(input: {
  url: string;
  maxProducts?: number;
}): Promise<TrendyolCategoryDiscoveryResult> {
  const base = normalizeCategoryUrl(input.url);
  const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));
  const existingOnMarktGo = await loadExistingTrendyolProductsFromMarktGo();

  const products = new Map<string, TrendyolCategoryProduct>();
  const seen = new Set<string>();
  const skipped = new Set<string>();
  const warnings: string[] = [];
  let pagesScanned = 0;
  let emptyPages = 0;
  let repeatPages = 0;
  const used = new Set<TrendyolCategoryDiscoveryResult["source"]>();

  for (let page = 1; page <= MAX_CATEGORY_PAGES && products.size < requestedCount; page++) {
    const target = pageUrl(base, page);
    const publicItems = await fetchPublic(base, page);
    let candidates = publicItems;
    if (publicItems.length > 0) used.add("public-api");

    // Kritik: Kaynak link döndürse bile tamamı daha önce görüldüyse diğer kaynakları da dene.
    if (candidates.length === 0 || unseenCount(candidates, seen) === 0) {
      const directItems = await fetchDirectProducts(target);
      if (directItems.length > 0) used.add("direct");
      const groups = [candidates, directItems];

      if (mergeCandidates(groups).length === 0 || unseenCount(mergeCandidates(groups), seen) === 0) {
        const workerItems = await fetchWorkerProducts(target);
        if (workerItems.length > 0) used.add("browser-worker");
        groups.push(workerItems);
      }

      if (mergeCandidates(groups).length === 0 || unseenCount(mergeCandidates(groups), seen) === 0) {
        const agentItems = await fetchLocalAgentProducts(target);
        if (agentItems.length > 0) used.add("local-agent");
        groups.push(agentItems);
      }
      candidates = mergeCandidates(groups);
    }

    pagesScanned++;
    if (candidates.length === 0) {
      emptyPages++;
      if (emptyPages >= MAX_EMPTY_PAGES) break;
      continue;
    }
    emptyPages = 0;

    let unseen = 0;
    let added = 0;
    for (const item of candidates) {
      if (seen.has(item.productId)) continue;
      seen.add(item.productId);
      unseen++;
      if (existingOnMarktGo.has(item.productId)) {
        skipped.add(item.productId);
        continue;
      }
      products.set(item.productId, item);
      added++;
      if (products.size >= requestedCount) break;
    }

    if (unseen === 0) {
      repeatPages++;
      if (repeatPages >= MAX_REPEAT_PAGES) {
        warnings.push("Trendyol aynı ürün grubunu art arda döndürdüğü için tarama güvenli şekilde durduruldu.");
        break;
      }
    } else {
      repeatPages = 0;
    }

    console.log(
      `[CategoryDiscoveryV3] page=${page} candidates=${candidates.length} unseen=${unseen} added=${added} total=${products.size}/${requestedCount} skipped=${skipped.size}`,
    );
  }

  if (skipped.size > 0) warnings.push(`${skipped.size} ürün zaten MARKT-GO'da bulundu ve tekrar eklenmedi.`);
  if (products.size < requestedCount) {
    warnings.push(`${requestedCount} yeni ürün istendi; ${pagesScanned} sayfa tarandı ve ${products.size} yeni ürün bulunabildi.`);
  }
  if (products.size === 0 && seen.size > 0) {
    warnings.push(`Taranan ${seen.size} benzersiz ürünün tamamı zaten MARKT-GO'da.`);
  }

  let source: TrendyolCategoryDiscoveryResult["source"] = "direct";
  const concrete = [...used].filter((x) => x !== "mixed");
  if (concrete.length > 1) source = "mixed";
  else if (concrete.length === 1) source = concrete[0];

  return {
    success: products.size > 0,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: products.size,
    skippedExistingCount: skipped.size,
    existingCatalogCount: existingOnMarktGo.size,
    pagesScanned,
    products: [...products.values()].slice(0, requestedCount),
    source,
    warnings,
  };
}
