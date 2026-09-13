import axios from "axios";
import {
  extractTrendyolCategoryProducts,
  type TrendyolCategoryProduct,
} from "./trendyol-category-discovery-v2";
import {
  discoverTrendyolCategoryProducts as discoverV3,
  type TrendyolCategoryDiscoveryResult as V3Result,
} from "./trendyol-category-discovery-v3";

export type TrendyolCategoryDiscoveryResult = V3Result;

const SEO_USER_AGENTS = ["Twitterbot/1.0", "Google-InspectionTool/1.0"] as const;
const MAX_RAW_PAGES = 12;
const VALIDATION_CONCURRENCY = 6;

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

function addCandidate(
  target: Map<string, TrendyolCategoryProduct>,
  product: TrendyolCategoryProduct | null | undefined,
) {
  if (!product?.productId || !product?.url || target.has(product.productId)) return;
  target.set(product.productId, product);
}

async function fetchRawCategoryPage(target: string): Promise<TrendyolCategoryProduct[]> {
  for (const userAgent of SEO_USER_AGENTS) {
    try {
      const response = await axios.get<string>(target, {
        timeout: 20_000,
        responseType: "text",
        maxRedirects: 4,
        validateStatus: () => true,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "tr-TR,tr;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (
        response.status >= 200 &&
        response.status < 400 &&
        typeof response.data === "string" &&
        response.data.length > 8_000
      ) {
        const products = extractTrendyolCategoryProducts(response.data, target);
        if (products.length > 0) return products;
      }
    } catch {
      // Sonraki SEO user-agent denenir.
    }
  }
  return [];
}

async function validateCandidate(product: TrendyolCategoryProduct): Promise<boolean> {
  for (const userAgent of SEO_USER_AGENTS) {
    try {
      const response = await axios.get<string>(product.url, {
        timeout: 14_000,
        responseType: "text",
        maxRedirects: 4,
        validateStatus: () => true,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "tr-TR,tr;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (response.status < 200 || response.status >= 400) continue;
      if (typeof response.data !== "string" || response.data.length < 5_000) continue;

      const finalUrl = String(response.request?.res?.responseUrl || product.url);
      if (/\/en\/select-country/i.test(finalUrl)) continue;
      if (/select-country/i.test(response.data.slice(0, 20_000))) continue;

      if (
        response.data.includes(product.productId) ||
        new RegExp(`-p-${product.productId}(?:[\\"'/?&<]|$)`, "i").test(response.data)
      ) {
        return true;
      }
    } catch {
      // Diğer user-agent denenir.
    }
  }

  return false;
}

async function validateCandidates(
  products: TrendyolCategoryProduct[],
  requestedCount: number,
): Promise<{ valid: TrendyolCategoryProduct[]; checked: number }> {
  const valid: TrendyolCategoryProduct[] = [];
  let cursor = 0;
  let checked = 0;

  const worker = async () => {
    while (valid.length < requestedCount) {
      const index = cursor++;
      if (index >= products.length) return;
      const product = products[index];
      const ok = await validateCandidate(product);
      checked++;
      if (ok && valid.length < requestedCount) valid.push(product);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(VALIDATION_CONCURRENCY, products.length || 1) },
      () => worker(),
    ),
  );

  return { valid: valid.slice(0, requestedCount), checked };
}

/**
 * V4 davranışı:
 * - Kullanıcının istediği adet, MARKT-GO'da daha önce bulunmuş ürünler yüzünden azalmaz.
 * - V3'ün güçlü kaynakları korunur; eksik adet oluşursa kategori HTML'inden ham ürünler eklenir.
 * - İstenen adetten fazla aday toplanır ve ürün sayfaları hafif SEO isteğiyle doğrulanır.
 *   Böylece 20 URL -> 13 başarılı veri gibi sessiz kayıpların önemli kısmı daha çekim başlamadan elenir.
 */
export async function discoverTrendyolCategoryProducts(input: {
  url: string;
  maxProducts?: number;
}): Promise<TrendyolCategoryDiscoveryResult> {
  const base = normalizeCategoryUrl(input.url);
  const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));
  const reserveCount = Math.max(12, Math.ceil(requestedCount * 0.5));
  const candidateTarget = Math.min(500, requestedCount + reserveCount);
  const warnings: string[] = [];

  const primary = await discoverV3({
    url: base.toString(),
    maxProducts: candidateTarget,
  });

  const candidates = new Map<string, TrendyolCategoryProduct>();
  for (const product of primary.products || []) addCandidate(candidates, product);

  let rawPagesScanned = 0;
  if (candidates.size < candidateTarget) {
    for (
      let page = 1;
      page <= MAX_RAW_PAGES && candidates.size < candidateTarget;
      page += 1
    ) {
      const pageUrl = categoryPageUrl(base, page);
      const rawProducts = await fetchRawCategoryPage(pageUrl);
      rawPagesScanned++;
      for (const product of rawProducts) addCandidate(candidates, product);
    }
  }

  const candidateList = [...candidates.values()];
  const validationPool = candidateList.slice(0, Math.min(candidateList.length, candidateTarget));
  const validation = await validateCandidates(validationPool, requestedCount);

  const selected = new Map<string, TrendyolCategoryProduct>();
  for (const product of validation.valid) addCandidate(selected, product);

  // Ağ doğrulaması geçici olarak yetersiz kaldıysa adedi düşürmek yerine sıradaki gerçek
  // kategori ürünleriyle tamamla. Asıl scraper kendi retry/fallback zincirini yine çalıştırır.
  if (selected.size < requestedCount) {
    for (const product of candidateList) {
      addCandidate(selected, product);
      if (selected.size >= requestedCount) break;
    }
  }

  if (primary.skippedExistingCount > 0) {
    warnings.push(
      `${primary.skippedExistingCount} ürün MARKT-GO'da mevcut olsa da toplu çekim adedini eksiltmemesi için kategori aday havuzunda tutuldu.`,
    );
  }

  if (validation.valid.length < requestedCount) {
    warnings.push(
      `${validation.checked} aday ürün erişim kontrolünden geçirildi; ${validation.valid.length} ürün doğrudan doğrulandı. Kalan adet scraper retry/fallback zinciriyle tamamlanacak.`,
    );
  }

  if (selected.size < requestedCount) {
    warnings.push(
      `${requestedCount} ürün istendi ancak kategori kaynaklarından yalnızca ${selected.size} benzersiz ürün URL'si elde edilebildi.`,
    );
  }

  warnings.push(...(primary.warnings || []).filter((warning) => !/yeni ürün istendi/i.test(warning)));

  return {
    success: selected.size > 0,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: selected.size,
    skippedExistingCount: 0,
    existingCatalogCount: primary.existingCatalogCount || 0,
    pagesScanned: Math.max(primary.pagesScanned || 0, rawPagesScanned),
    products: [...selected.values()].slice(0, requestedCount),
    source: primary.source,
    warnings,
  };
}
