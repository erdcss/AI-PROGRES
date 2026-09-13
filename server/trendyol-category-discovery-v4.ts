import axios from "axios";
import {
  extractTrendyolCategoryProducts,
  type TrendyolCategoryProduct,
} from "./trendyol-category-discovery-v2";
import {
  discoverTrendyolCategoryProducts as discoverV3,
  type TrendyolCategoryDiscoveryResult as V3Result,
} from "./trendyol-category-discovery-v3";

export type TrendyolCategoryDiscoveryResult = V3Result & {
  /** İstenen adedin arkasında hazır tutulan yedek ürünler. */
  reserveProducts: TrendyolCategoryProduct[];
  candidateCount: number;
};

const SEO_USER_AGENTS = ["Twitterbot/1.0", "Google-InspectionTool/1.0"] as const;
const MAX_RAW_PAGES = 20;
const VALIDATION_CONCURRENCY = 4;

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

/**
 * Kategori keşfinde yalnız HTTP 200 görmek yeterli değildir. Ürün sayfasında
 * ürün kimliğiyle beraber gerçek ürün içerik sinyallerinden en az biri bulunmalıdır.
 * Böylece kategori kartı var fakat ürün detay pipeline'ı boş dönen adaylar elenir.
 */
async function validateCandidate(product: TrendyolCategoryProduct): Promise<boolean> {
  for (const userAgent of SEO_USER_AGENTS) {
    try {
      const response = await axios.get<string>(product.url, {
        timeout: 16_000,
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
      if (typeof response.data !== "string" || response.data.length < 8_000) continue;

      const finalUrl = String(response.request?.res?.responseUrl || product.url);
      const firstChunk = response.data.slice(0, 60_000);
      if (/\/en\/select-country/i.test(finalUrl)) continue;
      if (/select-country/i.test(firstChunk)) continue;

      const hasIdentity =
        response.data.includes(product.productId) ||
        new RegExp(`-p-${product.productId}(?:[\\"'/?&<]|$)`, "i").test(response.data);
      if (!hasIdentity) continue;

      const hasProductSignal =
        /product|ürün|price|fiyat|image|imageurl|merchant|seller|variants?|attributes?/i.test(
          firstChunk,
        );
      if (hasProductSignal) return true;
    } catch {
      // Diğer user-agent denenir.
    }
  }

  return false;
}

async function validateCandidates(
  products: TrendyolCategoryProduct[],
  validationTarget: number,
): Promise<{ valid: TrendyolCategoryProduct[]; checked: number }> {
  const valid: TrendyolCategoryProduct[] = [];
  let cursor = 0;
  let checked = 0;

  const worker = async () => {
    while (valid.length < validationTarget) {
      const index = cursor++;
      if (index >= products.length) return;
      const product = products[index];
      const ok = await validateCandidate(product);
      checked++;
      if (ok && valid.length < validationTarget) valid.push(product);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(VALIDATION_CONCURRENCY, products.length || 1) },
      () => worker(),
    ),
  );

  return { valid: valid.slice(0, validationTarget), checked };
}

/**
 * V4 exact-count davranışı:
 * - Kullanıcının seçtiği adet tek gerçek kaynak sayıdır: 20 => 20, 50 => 50.
 * - Önceden MARKT-GO'da bulunmuş ürünler keşif adedini düşürmez.
 * - İstenen adedin arkasında yedek havuz hazırlanır; UI gerektiğinde başarısız URL'yi
 *   yedek bir ürünle değiştirebilir.
 * - Mümkün olduğunca doğrulanmış ürünler öne alınır; doğrulanmamış adaylar yalnız
 *   yedek/fallback olarak kullanılır.
 */
export async function discoverTrendyolCategoryProducts(input: {
  url: string;
  maxProducts?: number;
}): Promise<TrendyolCategoryDiscoveryResult> {
  const base = normalizeCategoryUrl(input.url);
  const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));
  const reserveCount = Math.min(
    500 - requestedCount,
    Math.max(20, Math.ceil(requestedCount * 0.75)),
  );
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
  const validationTarget = Math.min(
    candidateList.length,
    requestedCount + Math.min(reserveCount, Math.max(8, Math.ceil(requestedCount * 0.25))),
  );
  const validation = await validateCandidates(candidateList, validationTarget);

  const ordered = new Map<string, TrendyolCategoryProduct>();
  for (const product of validation.valid) addCandidate(ordered, product);
  for (const product of candidateList) addCandidate(ordered, product);

  const orderedList = [...ordered.values()];
  const products = orderedList.slice(0, requestedCount);
  const selectedIds = new Set(products.map((product) => product.productId));
  const reserveProducts = orderedList
    .filter((product) => !selectedIds.has(product.productId))
    .slice(0, reserveCount);

  if (primary.skippedExistingCount > 0) {
    warnings.push(
      `${primary.skippedExistingCount} ürün MARKT-GO'da mevcut; exact-count akışında bu durum istenen adedi azaltmaz.`,
    );
  }

  if (validation.valid.length < requestedCount) {
    warnings.push(
      `${validation.checked} aday erişim kontrolünden geçti; ${validation.valid.length} aday güçlü şekilde doğrulandı. Kalan adaylar gerçek kategori sonuçlarından tamamlandı ve scraper retry zinciriyle yeniden doğrulanacak.`,
    );
  }

  if (products.length < requestedCount) {
    warnings.push(
      `${requestedCount} ürün istendi ancak kategori kaynaklarından yalnızca ${products.length} benzersiz ürün URL'si elde edilebildi. Exact-count güvenliği nedeniyle UI eksik adetle otomatik çekim başlatmamalıdır.`,
    );
  }

  warnings.push(...(primary.warnings || []).filter((warning) => !/yeni ürün istendi/i.test(warning)));

  return {
    success: products.length === requestedCount,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: products.length,
    skippedExistingCount: 0,
    existingCatalogCount: primary.existingCatalogCount || 0,
    pagesScanned: Math.max(primary.pagesScanned || 0, rawPagesScanned),
    products,
    reserveProducts,
    candidateCount: orderedList.length,
    source: primary.source,
    warnings,
  };
}
