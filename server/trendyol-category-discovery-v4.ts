import axios from "axios";
import {
  extractTrendyolCategoryProducts,
  type TrendyolCategoryProduct,
} from "./trendyol-category-discovery-v2";
import {
  discoverTrendyolCategoryProducts as discoverV3,
  type TrendyolCategoryDiscoveryResult as V3Result,
} from "./trendyol-category-discovery-v3";
import { loadBlockedTrendyolProductIdsForCategoryImport } from "./services/marktgo/trendyol-dedupe.service";

export type TrendyolCategoryDiscoveryResult = V3Result & {
  /** İstenen adedin arkasında hazır tutulan yedek ürünler. */
  reserveProducts: TrendyolCategoryProduct[];
  candidateCount: number;
};

const SEO_USER_AGENTS = ["Twitterbot/1.0", "Google-InspectionTool/1.0"] as const;
const MAX_RAW_PAGES = 120;
const VALIDATION_CONCURRENCY = 4;
const MIX_BAND_SIZE = 24;
const LARGE_BATCH_THRESHOLD = 100;
const LARGE_BATCH_PAGE_CONCURRENCY = 8;
const LARGE_BATCH_MAX_PAGES = 48;
const LARGE_BATCH_REQUEST_TIMEOUT_MS = 7_000;
const LARGE_BATCH_BUDGET_MS = 42_000;
const SMALL_BATCH_VALIDATION_CAP = 24;

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
  blockedIds?: Set<string>,
): "added" | "blocked" | "duplicate" | "invalid" {
  if (!product?.productId || !product?.url) return "invalid";
  if (blockedIds?.has(product.productId)) return "blocked";
  if (target.has(product.productId)) return "duplicate";
  target.set(product.productId, product);
  return "added";
}

/**
 * Trendyol kategori sırası genellikle sayfa bazında benzer ürünleri kümeler.
 * 24'lük sayfa bantlarını round-robin örerek büyük batch'in tek ürün tipine
 * yığılmasını azaltırız: s1/1, s2/1, s3/1... sonra s1/2, s2/2...
 */
function mixAcrossCategoryPages(products: TrendyolCategoryProduct[]): TrendyolCategoryProduct[] {
  if (products.length <= MIX_BAND_SIZE) return products;

  const bands: TrendyolCategoryProduct[][] = [];
  for (let start = 0; start < products.length; start += MIX_BAND_SIZE) {
    bands.push(products.slice(start, start + MIX_BAND_SIZE));
  }

  const mixed: TrendyolCategoryProduct[] = [];
  for (let offset = 0; offset < MIX_BAND_SIZE; offset += 1) {
    for (const band of bands) {
      const product = band[offset];
      if (product) mixed.push(product);
    }
  }
  return mixed;
}

async function fetchRawCategoryPage(
  target: string,
  timeoutMs = 20_000,
  parallelAgents = false,
): Promise<TrendyolCategoryProduct[]> {
  const fetchForAgent = async (userAgent: (typeof SEO_USER_AGENTS)[number]) => {
    try {
      const response = await axios.get<string>(target, {
        timeout: timeoutMs,
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
        return extractTrendyolCategoryProducts(response.data, target);
      }
    } catch {
      // Bu agent başarısızsa diğer yol denenir.
    }
    return [];
  };

  if (parallelAgents) {
    const groups = await Promise.all(SEO_USER_AGENTS.map((userAgent) => fetchForAgent(userAgent)));
    const byId = new Map<string, TrendyolCategoryProduct>();
    for (const group of groups) {
      for (const product of group) {
        if (product?.productId && product?.url && !byId.has(product.productId)) {
          byId.set(product.productId, product);
        }
      }
    }
    return [...byId.values()];
  }

  for (const userAgent of SEO_USER_AGENTS) {
    const products = await fetchForAgent(userAgent);
    if (products.length > 0) return products;
  }
  return [];
}

async function collectLargeBatchCandidates(input: {
  base: URL;
  blockedIds: Set<string>;
  blockedCandidates: Set<string>;
  candidateTarget: number;
}): Promise<{ candidates: Map<string, TrendyolCategoryProduct>; pagesScanned: number }> {
  const { base, blockedIds, blockedCandidates, candidateTarget } = input;
  const candidates = new Map<string, TrendyolCategoryProduct>();
  const startedAt = Date.now();
  let nextPage = 1;
  let pagesScanned = 0;
  let emptyBatches = 0;

  while (
    candidates.size < candidateTarget &&
    nextPage <= LARGE_BATCH_MAX_PAGES &&
    Date.now() - startedAt < LARGE_BATCH_BUDGET_MS
  ) {
    const pages: number[] = [];
    for (
      let index = 0;
      index < LARGE_BATCH_PAGE_CONCURRENCY && nextPage <= LARGE_BATCH_MAX_PAGES;
      index += 1
    ) {
      pages.push(nextPage++);
    }

    const groups = await Promise.all(
      pages.map(async (page) => ({
        page,
        products: await fetchRawCategoryPage(
          categoryPageUrl(base, page),
          LARGE_BATCH_REQUEST_TIMEOUT_MS,
          true,
        ),
      })),
    );

    pagesScanned += groups.length;
    let addedThisBatch = 0;

    // Promise.all giriş sırasını koruduğu için kategori sayfa sırası deterministik kalır.
    for (const group of groups) {
      for (const product of group.products) {
        const status = addCandidate(candidates, product, blockedIds);
        if (status === "blocked") blockedCandidates.add(product.productId);
        if (status === "added") addedThisBatch += 1;
      }
    }

    console.info(
      `[CategoryDiscoveryV4] fast-pages=${pages[0]}-${pages[pages.length - 1]} added=${addedThisBatch} candidates=${candidates.size}/${candidateTarget} elapsed=${Date.now() - startedAt}ms`,
    );

    if (addedThisBatch === 0) emptyBatches += 1;
    else emptyBatches = 0;

    if (emptyBatches >= 2) break;
  }

  return { candidates, pagesScanned };
}

/**
 * Kategori keşfinde yalnız HTTP 200 görmek yeterli değildir. Ürün sayfasında
 * ürün kimliğiyle beraber gerçek ürün içerik sinyallerinden en az biri bulunmalıdır.
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
  if (validationTarget <= 0 || products.length === 0) return { valid: [], checked: 0 };

  const validByIndex = new Map<number, TrendyolCategoryProduct>();
  let validCount = 0;
  let cursor = 0;
  let checked = 0;

  const worker = async () => {
    while (validCount < validationTarget) {
      const index = cursor++;
      if (index >= products.length) return;
      const product = products[index];
      const ok = await validateCandidate(product);
      checked++;
      if (ok && validCount < validationTarget && !validByIndex.has(index)) {
        validByIndex.set(index, product);
        validCount++;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(VALIDATION_CONCURRENCY, products.length || 1) },
      () => worker(),
    ),
  );

  const valid = [...validByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, product]) => product)
    .slice(0, validationTarget);

  return { valid, checked };
}

/**
 * V4 exact-count + no-repeat davranışı:
 * - 20 => 20, 50 => 50, 500 => 500.
 * - Aynı Trendyol productId aynı işlemde veya geçmiş aktarımlarda ikinci kez seçilemez.
 * - 100+ ürün keşfi proxy'nin 60 saniyelik sınırına girmemesi için kategori sayfalarını
 *   kontrollü paralel tarar ve ürün detay ön-doğrulamasını gerçek scraper aşamasına bırakır.
 * - 500 ürün için ayrıca yedek havuz hazırlanır; bir ürün detay çekiminde düşerse exact-count
 *   akışı yedek URL ile hedef adedi koruyabilir.
 */
export async function discoverTrendyolCategoryProducts(input: {
  url: string;
  maxProducts?: number;
}): Promise<TrendyolCategoryDiscoveryResult> {
  const base = normalizeCategoryUrl(input.url);
  const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));
  const isLargeBatch = requestedCount >= LARGE_BATCH_THRESHOLD;
  const reserveCount = isLargeBatch
    ? Math.min(120, Math.max(30, Math.ceil(requestedCount * 0.2)))
    : Math.min(500 - requestedCount, Math.max(20, Math.ceil(requestedCount * 0.75)));
  const candidateTarget = requestedCount + reserveCount;
  const warnings: string[] = [];

  // Fail-closed: canlı katalog + kalıcı geçmiş doğrulanmadan kategori aktarımı başlamaz.
  const duplicateGuard = await loadBlockedTrendyolProductIdsForCategoryImport();
  const blockedIds = duplicateGuard.blockedIds;
  const blockedCandidates = new Set<string>();

  let candidates = new Map<string, TrendyolCategoryProduct>();
  let primarySkippedExistingCount = 0;
  let primaryPagesScanned = 0;
  let primaryWarnings: string[] = [];
  let source: V3Result["source"] = "seo-ssr";
  let rawPagesScanned = 0;

  if (isLargeBatch) {
    const fast = await collectLargeBatchCandidates({
      base,
      blockedIds,
      blockedCandidates,
      candidateTarget,
    });
    candidates = fast.candidates;
    rawPagesScanned = fast.pagesScanned;
    console.info(
      `[CategoryDiscoveryV4] large-batch=${requestedCount} fast-discovery completed candidates=${candidates.size} pages=${rawPagesScanned}`,
    );
  } else {
    const primary = await discoverV3({
      url: base.toString(),
      maxProducts: Math.min(500, candidateTarget),
    });
    primarySkippedExistingCount = primary.skippedExistingCount || 0;
    primaryPagesScanned = primary.pagesScanned || 0;
    primaryWarnings = primary.warnings || [];
    source = primary.source;

    for (const product of primary.products || []) {
      const status = addCandidate(candidates, product, blockedIds);
      if (status === "blocked") blockedCandidates.add(product.productId);
    }

    if (candidates.size < candidateTarget) {
      for (
        let page = 1;
        page <= MAX_RAW_PAGES && candidates.size < candidateTarget;
        page += 1
      ) {
        const rawProducts = await fetchRawCategoryPage(categoryPageUrl(base, page));
        rawPagesScanned++;
        for (const product of rawProducts) {
          const status = addCandidate(candidates, product, blockedIds);
          if (status === "blocked") blockedCandidates.add(product.productId);
        }
      }
    }
  }

  const candidateList = [...candidates.values()];
  const validationTarget = isLargeBatch
    ? 0
    : Math.min(
        candidateList.length,
        SMALL_BATCH_VALIDATION_CAP,
        requestedCount + Math.min(reserveCount, Math.max(8, Math.ceil(requestedCount * 0.25))),
      );
  const validation = await validateCandidates(candidateList, validationTarget);

  const ordered = new Map<string, TrendyolCategoryProduct>();
  for (const product of validation.valid) addCandidate(ordered, product, blockedIds);
  for (const product of candidateList) addCandidate(ordered, product, blockedIds);

  const orderedList = mixAcrossCategoryPages([...ordered.values()]);
  const products = orderedList.slice(0, requestedCount);
  const selectedIds = new Set(products.map((product) => product.productId));
  const reserveProducts = orderedList
    .filter((product) => !selectedIds.has(product.productId))
    .slice(0, reserveCount);

  const skippedExistingCount = primarySkippedExistingCount + blockedCandidates.size;
  if (skippedExistingCount > 0) {
    warnings.push(
      `${skippedExistingCount} eski/tekrar ürün engellendi; hedef adet için kategori taraması sonraki benzersiz ürünlerle devam etti.`,
    );
  }

  warnings.push(
    `Tekrar koruması aktif: MARKT-GO kataloğu ${duplicateGuard.catalogCount} Trendyol ürünü, kalıcı takip geçmişi ${duplicateGuard.historyCount} Trendyol ürünü içeriyor. Aynı productId ikinci kez seçilmez.`,
  );

  if (isLargeBatch) {
    warnings.push(
      `Büyük batch hızlı keşif modu kullanıldı: ${rawPagesScanned} kategori sayfası kontrollü paralel tarandı; ${reserveProducts.length} yedek ürün hazırlandı.`,
    );
  } else if (validationTarget > 0 && validation.valid.length < Math.min(requestedCount, validationTarget)) {
    warnings.push(
      `${validation.checked} aday erişim kontrolünden geçti; ${validation.valid.length} aday güçlü şekilde doğrulandı. Kalan adaylar ürün çekme pipeline'ında yeniden doğrulanacak.`,
    );
  }

  if (products.length < requestedCount) {
    warnings.push(
      `${requestedCount} yeni ve benzersiz ürün istendi ancak kategori kaynaklarından yalnızca ${products.length} uygun ürün elde edilebildi. Eksik adetle otomatik çekim başlatılmamalıdır.`,
    );
  }

  warnings.push(...primaryWarnings.filter((warning) => !/yeni ürün istendi/i.test(warning)));

  return {
    success: products.length === requestedCount,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: products.length,
    skippedExistingCount,
    existingCatalogCount: duplicateGuard.catalogCount,
    pagesScanned: Math.max(primaryPagesScanned, rawPagesScanned),
    products,
    reserveProducts,
    candidateCount: orderedList.length,
    source,
    warnings,
  };
}
