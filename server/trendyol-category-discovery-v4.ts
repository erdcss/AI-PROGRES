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
 * 24'lük sayfa bantlarını round-robin örerek 500 ürünün tek bir ürün tipine
 * yığılmasını azaltırız: s1/1, s2/1, s3/1... sonra s1/2, s2/2...
 * İşlem deterministiktir; aynı aday havuzu her zaman aynı karışık sırayı üretir.
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
 * - Kullanıcının seçtiği adet tek gerçek kaynak sayıdır: 20 => 20, 500 => 500.
 * - Aynı Trendyol productId aynı işlemde ikinci kez seçilemez.
 * - MARKT-GO'da halen bulunan ürün tekrar seçilemez.
 * - Daha önce programa girip sonradan katalogdan silinen ürün de tracked_products
 *   geçmişi sayesinde tekrar seçilemez.
 * - Eski ürün görülürse adet düşürülmez; tarama sonraki kategori sayfalarına devam
 *   eder ve hedef adet yeni/benzersiz ürünlerle tamamlanır.
 * - Son liste kategori sayfa bantlarından karışık/round-robin sırada üretilir.
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

  // Fail-closed: duplicate kayıt defteri doğrulanamıyorsa yeni kategori aktarımı
  // başlatılmaz. Böylece bağlantı sorunu yüzünden eski ürün yeniden çekilemez.
  const duplicateGuard = await loadBlockedTrendyolProductIdsForCategoryImport();
  const blockedIds = duplicateGuard.blockedIds;
  const blockedCandidates = new Set<string>();

  const primary = await discoverV3({
    url: base.toString(),
    maxProducts: candidateTarget,
  });

  const candidates = new Map<string, TrendyolCategoryProduct>();
  for (const product of primary.products || []) {
    const status = addCandidate(candidates, product, blockedIds);
    if (status === "blocked") blockedCandidates.add(product.productId);
  }

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
      for (const product of rawProducts) {
        const status = addCandidate(candidates, product, blockedIds);
        if (status === "blocked") blockedCandidates.add(product.productId);
      }
    }
  }

  const candidateList = [...candidates.values()];
  const validationTarget = Math.min(
    candidateList.length,
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

  const skippedExistingCount = primary.skippedExistingCount + blockedCandidates.size;
  if (skippedExistingCount > 0) {
    warnings.push(
      `${skippedExistingCount} eski/tekrar ürün engellendi; hedef adet için kategori taraması sonraki benzersiz ürünlerle devam etti.`,
    );
  }

  warnings.push(
    `Tekrar koruması aktif: MARKT-GO kataloğu ${duplicateGuard.catalogCount} Trendyol ürünü, kalıcı takip geçmişi ${duplicateGuard.historyCount} Trendyol ürünü içeriyor. Aynı productId ikinci kez seçilmez.`,
  );

  if (validation.valid.length < requestedCount) {
    warnings.push(
      `${validation.checked} aday erişim kontrolünden geçti; ${validation.valid.length} aday güçlü şekilde doğrulandı. Kalan adaylar gerçek kategori sonuçlarından tamamlandı ve scraper retry zinciriyle yeniden doğrulanacak.`,
    );
  }

  if (products.length < requestedCount) {
    warnings.push(
      `${requestedCount} yeni ve benzersiz ürün istendi ancak kategori kaynaklarından yalnızca ${products.length} uygun ürün elde edilebildi. Eksik adetle otomatik çekim başlatılmamalıdır.`,
    );
  }

  warnings.push(...(primary.warnings || []).filter((warning) => !/yeni ürün istendi/i.test(warning)));

  return {
    success: products.length === requestedCount,
    categoryUrl: base.toString(),
    requestedCount,
    foundCount: products.length,
    skippedExistingCount,
    existingCatalogCount: duplicateGuard.catalogCount,
    pagesScanned: Math.max(primary.pagesScanned || 0, rawPagesScanned),
    products,
    reserveProducts,
    candidateCount: orderedList.length,
    source: primary.source,
    warnings,
  };
}
