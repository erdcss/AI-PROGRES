import { getShopifyInventoryConfig } from "@shared/shopify-inventory-config";
import { isConfirmedClothingProduct } from "@shared/clothing-keywords";
import { resolveInventoryQty } from "./shopify-inventory-qty";
import {
  buildCanonicalHandle,
  buildCanonicalSku,
  buildTrendyolSourceIdentity,
  resolveTrendyolSourceIds,
  type TrendyolSourceIdentity,
} from "./shopify-source-key";

export interface CanonicalVariantItem {
  sourceProductId: string;
  color: string;
  size: string;
  option1Name: "Color" | "Renk" | "Title";
  option1Value: string;
  option2Name?: "Size" | "Beden";
  option2Value?: string;
  sku: string;
  inStock: boolean;
  inventoryQty: number;
  sourceStockQty?: number | null;
  stockConfidence: "high" | "medium" | "low";
  disabledReason?: string;
  price: string;
  image?: string;
}

export interface CanonicalProductForShopify {
  sourcePlatform: "trendyol";
  sourceProductId: string;
  urlProductId?: string;
  parsedProductId?: string;
  sourceUrl: string;
  sourceKey: string;
  handle: string;
  title: string;
  brand: string;
  price: string;
  images: string[];
  variants: CanonicalVariantItem[];
  outOfStockVariants: CanonicalVariantItem[];
  stockSummary: {
    totalVariants: number;
    inStockVariants: number;
    outOfStockVariants: number;
    defaultInventoryQty: number;
  };
  manualReviewRequired?: boolean;
  stockText?: string;
  variantDiagnostics?: VariantDiagnostics;
  shopifyUploadBlocked?: boolean;
  blockReason?: string;
}

const APPAREL_HINT =
  /elbise|tişört|t-shirt|pantolon|etek|gömlek|ceket|ayakkabı|sneaker|bluz|kazak|mont|şort|body|takım/i;

function isLikelyApparelForCanonical(
  scrapeResult: Record<string, unknown>,
  sourceUrl: string,
  title: string,
): boolean {
  const blob = `${scrapeResult.title || title} ${scrapeResult.category || ""} ${scrapeResult.description || ""}`;
  if (APPAREL_HINT.test(blob)) return true;
  return isConfirmedClothingProduct(title, sourceUrl);
}

const DEFAULT_COLOR = "Tek Renk";
const DEFAULT_SIZE = "Standart";

const INVALID_COLOR_LABELS = new Set([
  "renk bilgisi yok",
  "renk yok",
  "bilinmiyor",
  "n/a",
  "none",
  "",
]);

const REJECTED_SIZE_TEXT =
  /sepete ekle|son \d+ ürün|kupon|popüler|yorum|marka|açıklama|fiyat|favori|kargo|tl$|tüm bedenler|beden seç|adetten az stok/i;

export const VALID_SIZE_LABEL =
  /^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|34|36|38|40|42|44|Standart|STD|Tek Ebat)$/i;

export function isValidSizeLabel(size: string): boolean {
  return VALID_SIZE_LABEL.test(size.trim());
}

function cleanSize(value: string): string | null {
  const t = value.trim();
  if (!t || REJECTED_SIZE_TEXT.test(t)) return null;
  if (!isValidSizeLabel(t)) return null;
  return t;
}

export function normalizeSizeValue(input: unknown): string | null {
  if (typeof input === "string") return cleanSize(input);
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    for (const key of [
      "name",
      "size",
      "sizeName",
      "value",
      "attributeValue",
      "optionValue",
      "variantValue",
      "text",
    ]) {
      if (typeof o[key] === "string") {
        const cleaned = cleanSize(o[key] as string);
        if (cleaned) return cleaned;
      }
    }
  }
  return null;
}

export function normalizeColorValue(input: unknown): string | null {
  if (typeof input === "string") {
    const t = input.trim();
    if (!t || INVALID_COLOR_LABELS.has(t.toLowerCase())) return null;
    return t;
  }
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    for (const key of ["name", "color", "colorName", "value", "attributeValue"]) {
      if (typeof o[key] === "string") {
        const cleaned = normalizeColorValue(o[key]);
        if (cleaned) return cleaned;
      }
    }
  }
  return null;
}

function normalizeStringArray(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const item of items) {
    const v = normalizeSizeValue(item) ?? normalizeColorValue(item);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function variantKey(color: string, size: string): string {
  return `${color.trim().toLowerCase()}|${size.trim().toLowerCase()}`;
}

interface RawVariantRow {
  color: string;
  size: string;
  inStock: boolean;
  stockCount?: number | null;
  price?: string | number;
  image?: string;
  disabledReason?: string;
  confidence: "high" | "medium" | "low";
}

function collectFromItems(variants: Record<string, unknown>): RawVariantRow[] {
  const items = variants.items;
  if (!Array.isArray(items) || items.length === 0) return [];

  return items.map((item) => {
    const o = item as Record<string, unknown>;
    const color = normalizeColorValue(o.color ?? o.colorName) || DEFAULT_COLOR;
    const size = normalizeSizeValue(o.size ?? o.sizeName) || DEFAULT_SIZE;
    return {
      color,
      size,
      inStock: o.inStock !== false,
      stockCount:
        typeof o.stockCount === "number"
          ? o.stockCount
          : typeof o.sourceStockQty === "number"
            ? o.sourceStockQty
            : null,
      price: String(o.price ?? ""),
      image: typeof o.image === "string" ? o.image : undefined,
      disabledReason: typeof o.disabledReason === "string" ? o.disabledReason : undefined,
      confidence: "high" as const,
    };
  });
}

function collectFromStockMap(
  stockMap: Record<string, boolean>,
  colors: string[],
  sizes: string[],
): RawVariantRow[] {
  const rows: RawVariantRow[] = [];
  for (const [key, inStock] of Object.entries(stockMap)) {
    const parts = key.split("-");
    let color = DEFAULT_COLOR;
    let size = DEFAULT_SIZE;
    if (parts.length >= 2) {
      color = parts.slice(0, -1).join("-");
      size = parts[parts.length - 1];
    } else if (sizes.includes(key)) {
      size = key;
    } else {
      color = key;
    }
    rows.push({ color, size, inStock, confidence: "high" });
  }
  if (rows.length > 0) return rows;

  for (const color of colors.length ? colors : [DEFAULT_COLOR]) {
    for (const size of sizes.length ? sizes : [DEFAULT_SIZE]) {
      const key = `${color}-${size}`;
      rows.push({
        color,
        size,
        inStock: stockMap[key] !== false,
        confidence: "high",
      });
    }
  }
  return rows;
}

function collectFromStockMatrix(stockMatrix: Record<string, unknown>): RawVariantRow[] {
  const rows: RawVariantRow[] = [];
  for (const entry of Object.values(stockMatrix)) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const color = normalizeColorValue(o.color ?? o.colorName) || DEFAULT_COLOR;
    const size = normalizeSizeValue(o.size ?? o.sizeName) || DEFAULT_SIZE;
    rows.push({
      color,
      size,
      inStock: o.inStock !== false,
      stockCount: typeof o.stockCount === "number" ? o.stockCount : null,
      confidence: "high",
    });
  }
  return rows;
}

function collectFromAllVariants(allVariants: unknown[]): RawVariantRow[] {
  return allVariants.map((item) => {
    const o = item as Record<string, unknown>;
    const color = normalizeColorValue(o.color ?? o.colorName) || DEFAULT_COLOR;
    const size = normalizeSizeValue(o.size ?? o.sizeName) || DEFAULT_SIZE;
    return {
      color,
      size,
      inStock: o.inStock !== false,
      stockCount: typeof o.stockCount === "number" ? o.stockCount : null,
      image: typeof o.image === "string" ? o.image : undefined,
      confidence: "high" as const,
    };
  });
}

function collectFromColorSizeCross(
  colors: string[],
  sizes: string[],
  stockMap?: Record<string, boolean>,
): RawVariantRow[] {
  const c = colors.length ? colors : [DEFAULT_COLOR];
  const s = sizes.length ? sizes : [DEFAULT_SIZE];
  const rows: RawVariantRow[] = [];
  for (const color of c) {
    for (const size of s) {
      const key = `${color}-${size}`;
      const inStock = stockMap ? stockMap[key] !== false : true;
      rows.push({ color, size, inStock, confidence: "low" });
    }
  }
  return rows;
}

export interface VariantDiagnostics {
  rawSizeCount?: number;
  rawDomSizeCount?: number;
  domSizeButtons?: string[];
  scriptSizes?: string[];
  mergedSizeCount?: number;
  canonicalVariantCount?: number;
  shopifyUploadBlocked?: boolean;
  sparseVariantDetected?: boolean;
  fullVariantScrapeAttempted?: boolean;
  sizeSourceWinner?: "dom" | "script" | "fast";
  blockReason?: string;
}

function logVariantTrace(stage: string, message: string): void {
  console.log(`[VariantTrace:${stage}] ${message}`);
}

function extractSizesFromSlicingAttributes(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const attrs = raw as Record<string, unknown>;
  const beden =
    attrs.Beden ?? attrs.BEDEN ?? attrs.beden ?? attrs.Size ?? attrs.size;
  if (Array.isArray(beden)) {
    return beden
      .map((x) => normalizeSizeValue(x))
      .filter((s): s is string => Boolean(s));
  }
  if (typeof beden === "string") {
    const s = normalizeSizeValue(beden);
    return s ? [s] : [];
  }
  return [];
}

function mergeAllVariantSources(
  v: Record<string, unknown>,
  extras?: { domSizeButtons?: string[]; slicingAttributes?: unknown; scriptSizes?: string[] },
): { rows: RawVariantRow[]; sizeSources: Record<string, string[]> } {
  const sizeSources: Record<string, string[]> = {};
  const rowMap = new Map<string, RawVariantRow>();

  const ingest = (rows: RawVariantRow[], source: string) => {
    const sizes = [
      ...new Set(
        rows
          .map((r) => normalizeSizeValue(r.size))
          .filter((s): s is string => Boolean(s)),
      ),
    ];
    sizeSources[source] = sizes;
    for (const row of rows) {
      const color = normalizeColorValue(row.color) || DEFAULT_COLOR;
      const size = normalizeSizeValue(row.size);
      if (!size) continue;
      const key = variantKey(color, size);
      const existing = rowMap.get(key);
      if (!existing || (row.confidence === "high" && existing.confidence !== "high")) {
        rowMap.set(key, { ...row, color, size });
      }
    }
  };

  const colors = normalizeStringArray(v.colors);
  const sizes = normalizeStringArray(v.sizes ?? v.availableSizes);
  const stockMap =
    v.stockMap && typeof v.stockMap === "object"
      ? (v.stockMap as Record<string, boolean>)
      : undefined;

  if (Array.isArray(v.items) && v.items.length > 0) {
    ingest(collectFromItems(v), "items");
  }
  if (stockMap && Object.keys(stockMap).length > 0) {
    ingest(collectFromStockMap(stockMap, colors, sizes), "stockMap");
  }
  if (v.stockMatrix && typeof v.stockMatrix === "object") {
    ingest(collectFromStockMatrix(v.stockMatrix as Record<string, unknown>), "stockMatrix");
  }
  if (Array.isArray(v.allVariants) && v.allVariants.length > 0) {
    ingest(collectFromAllVariants(v.allVariants as unknown[]), "allVariants");
  }
  if (colors.length || sizes.length) {
    ingest(collectFromColorSizeCross(colors, sizes, stockMap), "colorSizeCross");
  }
  if (extras?.slicingAttributes) {
    const slicingSizes = extractSizesFromSlicingAttributes(extras.slicingAttributes);
    if (slicingSizes.length) {
      ingest(
        slicingSizes.map((size) => ({
          color: DEFAULT_COLOR,
          size,
          inStock: true,
          confidence: "high" as const,
        })),
        "slicingAttributes",
      );
    }
  }
  if (extras?.scriptSizes?.length) {
    ingest(
      extras.scriptSizes.map((size) => ({
        color: DEFAULT_COLOR,
        size,
        inStock: true,
        confidence: "high" as const,
      })),
      "scriptJson",
    );
  }
  if (extras?.domSizeButtons?.length) {
    ingest(
      extras.domSizeButtons.map((size) => ({
        color: DEFAULT_COLOR,
        size,
        inStock: true,
        confidence: "high" as const,
      })),
      "domButtons",
    );
  }

  return { rows: Array.from(rowMap.values()), sizeSources };
}

function detectInputShape(variants: Record<string, unknown>): string {
  if (Array.isArray(variants.items) && variants.items.length > 0) return "items";
  if (variants.stockMap && typeof variants.stockMap === "object") return "stockMap";
  if (variants.stockMatrix && typeof variants.stockMatrix === "object") return "stockMatrix";
  if (Array.isArray(variants.allVariants) && variants.allVariants.length > 0) return "allVariants";
  if (Array.isArray(variants.colors) || Array.isArray(variants.sizes)) return "object-array/string-array";
  return "default";
}

function extractVariantsFromScrape(
  variants: unknown,
  stockText?: string,
  extras?: {
    domSizeButtons?: string[];
    slicingAttributes?: unknown;
    variantDiagnostics?: VariantDiagnostics;
    scriptSizes?: string[];
  },
): { rows: RawVariantRow[]; inputShape: string; diagnostics: VariantDiagnostics } {
  if (!variants || typeof variants !== "object") {
    return {
      rows: [],
      inputShape: "default",
      diagnostics: { shopifyUploadBlocked: true },
    };
  }

  const v = variants as Record<string, unknown>;
  const inputShape = detectInputShape(v);

  logVariantTrace(
    "raw",
    `product.allVariants.length=${Array.isArray(v.allVariants) ? v.allVariants.length : 0}`,
  );
  logVariantTrace("raw", `product.variants.length=${Array.isArray(v.items) ? v.items.length : 0}`);
  logVariantTrace("raw", `product.slicingAttributes=${JSON.stringify(extras?.slicingAttributes ?? null)}`);
  logVariantTrace("raw", `product.attributes.Beden=${JSON.stringify(v.sizes ?? v.availableSizes)}`);
  logVariantTrace(
    "raw",
    `domSizeButtons=${(extras?.domSizeButtons ?? []).join(",") || "none"}`,
  );

  const { rows: mergedRows, sizeSources } = mergeAllVariantSources(v, {
    domSizeButtons: extras?.domSizeButtons,
    slicingAttributes: extras?.slicingAttributes,
    scriptSizes: extras?.scriptSizes ?? extras?.variantDiagnostics?.scriptSizes,
  });

  for (const [source, sizes] of Object.entries(sizeSources)) {
    logVariantTrace("normalizerInput", `${source}=${sizes.join(",") || "none"}`);
  }

  let rows = mergedRows;

  if (rows.length === 0) {
    return {
      rows: [],
      inputShape,
      diagnostics: { shopifyUploadBlocked: true, mergedSizeCount: 0 },
    };
  }

  const beforeFilter = [...new Set(rows.map((r) => r.size))];
  logVariantTrace("normalizerOutput", `canonicalSizes=${beforeFilter.join(",")}`);

  const deduped = new Map<string, RawVariantRow>();
  for (const row of rows) {
    const color = normalizeColorValue(row.color) || DEFAULT_COLOR;
    const size = normalizeSizeValue(row.size);
    if (!size) continue;
    const key = variantKey(color, size);
    if (!deduped.has(key)) deduped.set(key, { ...row, color, size });
  }

  const afterSizes = [...new Set(Array.from(deduped.values()).map((r) => r.size))];
  logVariantTrace("normalizerOutput", `canonicalVariants=${deduped.size}`);

  const diagnostics: VariantDiagnostics = {
    rawSizeCount: beforeFilter.length,
    rawDomSizeCount: extras?.domSizeButtons?.length,
    domSizeButtons: extras?.domSizeButtons,
    mergedSizeCount: afterSizes.length,
    canonicalVariantCount: deduped.size,
  };

  return { rows: Array.from(deduped.values()), inputShape, diagnostics };
}

function extractPrice(raw: unknown): string {
  if (typeof raw === "number" && raw > 0) return raw.toFixed(2);
  if (typeof raw === "string") {
    const m = raw.match(/[\d.,]+/);
    if (m) return m[0].replace(",", ".");
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of ["withProfit", "original", "sale", "value"]) {
      const p = extractPrice(o[key]);
      if (p && p !== "0.00") return p;
    }
  }
  return "0";
}

function extractImages(source: Record<string, unknown>): string[] {
  const raw = source.images;
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const img of raw) {
    if (typeof img === "string" && img.startsWith("http")) urls.push(img);
    else if (img && typeof img === "object") {
      const u = (img as Record<string, unknown>).url ?? (img as Record<string, unknown>).src;
      if (typeof u === "string" && u.startsWith("http")) urls.push(u);
    }
  }
  return [...new Set(urls)];
}

export interface BuildCanonicalInput {
  scrapeResult: Record<string, unknown>;
  sourceUrl?: string;
}

/** Scrape sonucunu CanonicalProductForShopify formatına dönüştürür */
export function buildCanonicalProductForShopify(
  input: BuildCanonicalInput,
): CanonicalProductForShopify | null {
  const source =
    (input.scrapeResult.productInfo as Record<string, unknown> | undefined) ??
    (input.scrapeResult.product as Record<string, unknown> | undefined) ??
    input.scrapeResult;

  const sourceUrl =
    input.sourceUrl ||
    String(source.sourceUrl ?? source.originalUrl ?? source.url ?? "").trim();

  const identity: TrendyolSourceIdentity | null = sourceUrl
    ? buildTrendyolSourceIdentity(sourceUrl)
    : null;

  const scrapedId =
    source.id ?? source.productId ?? source.contentId ?? input.scrapeResult.id;
  const sourceIds = sourceUrl
    ? resolveTrendyolSourceIds(sourceUrl, scrapedId as string | number | undefined)
    : null;

  const sourceProductId =
    sourceIds?.selectedSourceProductId ||
    identity?.sourceProductId ||
    String(scrapedId ?? "").replace(/\D/g, "") ||
    `unknown-${Date.now()}`;

  const title = String(source.title ?? input.scrapeResult.title ?? "").trim();
  if (!title) return null;

  const brand = String(source.brand ?? input.scrapeResult.brand ?? "Generic").trim();
  const price = extractPrice(source.price ?? input.scrapeResult.price);
  const stockText = String(
    source.stockText ?? source.stockStatus ?? input.scrapeResult.stockText ?? "",
  );

  const variantsRaw = source.variants ?? input.scrapeResult.variants;
  const variantDiagnostics =
    (input.scrapeResult.variantDiagnostics as VariantDiagnostics | undefined) ?? {};
  const domSizeButtons =
    variantDiagnostics.domSizeButtons ??
    (Array.isArray(input.scrapeResult.domSizeButtons)
      ? (input.scrapeResult.domSizeButtons as string[])
      : undefined);
  const scriptSizes = variantDiagnostics.scriptSizes;
  const slicingAttributes =
    source.slicingAttributes ?? input.scrapeResult.slicingAttributes ?? source.attributes;

  const { rows, inputShape, diagnostics: extractDiag } = extractVariantsFromScrape(
    variantsRaw,
    stockText,
    { domSizeButtons, slicingAttributes, variantDiagnostics, scriptSizes },
  );

  if (rows.length === 0) {
    console.log("[VariantNormalize] no variants extracted — manual review required");
    return {
      sourcePlatform: "trendyol",
      sourceProductId,
      urlProductId: sourceIds?.urlProductId ?? identity?.sourceProductId,
      parsedProductId: sourceIds?.parsedProductId ?? undefined,
      sourceUrl: identity?.sourceUrl || sourceUrl,
      sourceKey: sourceIds?.sourceKey || identity?.sourceKey || `trendyol:${sourceProductId}`,
      handle: buildCanonicalHandle(brand, title, sourceProductId),
      title,
      brand,
      price,
      images: extractImages(source),
      variants: [],
      outOfStockVariants: [],
      stockSummary: {
        totalVariants: 0,
        inStockVariants: 0,
        outOfStockVariants: 0,
        defaultInventoryQty: getShopifyInventoryConfig().defaultInStockQty,
      },
      manualReviewRequired: true,
      shopifyUploadBlocked: true,
      variantDiagnostics: { ...variantDiagnostics, ...extractDiag, shopifyUploadBlocked: true },
      stockText,
    };
  }

  const config = getShopifyInventoryConfig();
  const canonicalRows: CanonicalVariantItem[] = rows.map((row) => {
    const inventoryQty = resolveInventoryQty(
      { inStock: row.inStock, stockCount: row.stockCount },
      stockText,
      config,
    );
    const hasColor = row.color && row.color !== DEFAULT_COLOR;
    const hasSize = row.size && row.size !== DEFAULT_SIZE && row.size !== "Tek Beden";

    let option1Name: CanonicalVariantItem["option1Name"] = "Title";
    let option1Value = "Default Title";
    let option2Name: CanonicalVariantItem["option2Name"];
    let option2Value: string | undefined;

    if (hasColor && hasSize) {
      option1Name = "Renk";
      option1Value = row.color;
      option2Name = "Beden";
      option2Value = row.size;
    } else if (hasColor) {
      option1Name = "Renk";
      option1Value = row.color;
    } else if (hasSize) {
      option1Name = "Beden";
      option1Value = row.size;
    }

    return {
      sourceProductId,
      color: row.color,
      size: row.size,
      option1Name,
      option1Value,
      option2Name,
      option2Value,
      sku: buildCanonicalSku(sourceProductId, row.color, row.size),
      inStock: row.inStock,
      inventoryQty,
      sourceStockQty: row.stockCount ?? null,
      stockConfidence: row.confidence,
      disabledReason: row.disabledReason,
      price,
      image: row.image,
    };
  });

  const inStock = canonicalRows.filter((v) => v.inStock);
  const outOfStock = canonicalRows.filter((v) => !v.inStock);
  const exportVariants = config.exportOutOfStockVariants ? canonicalRows : inStock;

  const colors = [...new Set(canonicalRows.map((v) => v.color))];
  const sizes = [...new Set(canonicalRows.map((v) => v.size))];

  console.log(`[VariantNormalize] inputShape=${inputShape}`);
  console.log(`[VariantNormalize] colors=${colors.join(", ")}`);
  console.log(`[VariantNormalize] sizes=${sizes.join(", ")}`);
  console.log(
    `[VariantNormalize] canonicalVariants=${exportVariants.length} (inStock=${inStock.length} outOfStock=${outOfStock.length})`,
  );
  console.log(
    `[Stock] inStock=${inStock.length} outOfStock=${outOfStock.length} defaultQty=${config.defaultInStockQty}`,
  );

  const lowConfidenceOnly =
    canonicalRows.every((v) => v.stockConfidence === "low") && canonicalRows.length <= 1;

  const domMismatch =
    (extractDiag.rawDomSizeCount ?? 0) > canonicalRows.length &&
    (extractDiag.rawDomSizeCount ?? 0) > 1;

  const mergedSourceCount = Math.max(
    extractDiag.mergedSizeCount ?? 0,
    variantDiagnostics.mergedSizeCount ?? 0,
    domSizeButtons?.length ?? 0,
    (scriptSizes?.length ?? 0),
  );
  const mergeFailed =
    mergedSourceCount > 1 && canonicalRows.length === 1 && (extractDiag.rawDomSizeCount ?? 0) > 1;

  const apparelOneSizeBlock =
    isLikelyApparelForCanonical(input.scrapeResult, sourceUrl, title) &&
    canonicalRows.length <= 1 &&
    (variantDiagnostics.fullVariantScrapeAttempted === true ||
      input.scrapeResult.fullVariantScrapeAttempted === true);

  const blockReason = apparelOneSizeBlock
    ? "Kıyafet ürünü için sadece 1 beden tespit edildi. Full DOM/API varyant taraması yeterli veri döndürmedi."
    : mergeFailed
      ? `Variant merge failed: raw sources found ${mergedSourceCount} sizes but canonical has ${canonicalRows.length}`
      : undefined;

  const manualReviewRequired =
    lowConfidenceOnly || domMismatch || canonicalRows.length === 0 || apparelOneSizeBlock || mergeFailed;
  const shopifyUploadBlocked = manualReviewRequired || domMismatch || apparelOneSizeBlock || mergeFailed;

  if (domMismatch || mergeFailed) {
    console.warn(
      `⚠️ Canlı sayfada ${extractDiag.rawDomSizeCount ?? mergedSourceCount} beden bulundu fakat aktarım datasında ${canonicalRows.length} beden var. Manuel kontrol gerekli.`,
    );
  }

  console.log(
    `[VariantDebug] canonicalVariants=${exportVariants.length} manualReviewRequired=${manualReviewRequired}`,
  );

  if (identity || sourceIds) {
    console.log(
      `[Source] platform=trendyol productId=${sourceProductId} sourceKey=trendyol:${sourceProductId}`,
    );
  }

  return {
    sourcePlatform: "trendyol",
    sourceProductId,
    urlProductId: sourceIds?.urlProductId ?? identity?.sourceProductId,
    parsedProductId: sourceIds?.parsedProductId ?? undefined,
    sourceUrl: identity?.sourceUrl || sourceUrl,
    sourceKey: sourceIds?.sourceKey || identity?.sourceKey || `trendyol:${sourceProductId}`,
    handle: buildCanonicalHandle(brand, title, sourceProductId),
    title,
    brand,
    price,
    images: extractImages(source),
    variants: exportVariants,
    outOfStockVariants: outOfStock,
    stockSummary: {
      totalVariants: canonicalRows.length,
      inStockVariants: inStock.length,
      outOfStockVariants: outOfStock.length,
      defaultInventoryQty: config.defaultInStockQty,
    },
    manualReviewRequired,
    shopifyUploadBlocked,
    variantDiagnostics: {
      ...variantDiagnostics,
      ...extractDiag,
      canonicalVariantCount: canonicalRows.length,
      shopifyUploadBlocked,
      sizeSourceWinner: variantDiagnostics.sizeSourceWinner,
      blockReason,
    },
    blockReason,
    stockText,
  };
}

export function validateCanonicalForShopifyUpload(
  canonical: CanonicalProductForShopify | null,
  diagnostics?: VariantDiagnostics,
): { ok: true } | { ok: false; error: string; step: string } {
  if (!canonical) {
    return { ok: false, error: "Canonical product oluşturulamadı", step: "canonical_missing" };
  }
  if (!canonical.variants || canonical.variants.length === 0) {
    return {
      ok: false,
      error: "Canonical variants empty. Shopify upload blocked.",
      step: "canonical_variants_empty",
    };
  }
  const rawDom = diagnostics?.rawDomSizeCount ?? canonical.variantDiagnostics?.rawDomSizeCount;
  if (
    rawDom &&
    rawDom > canonical.stockSummary.totalVariants &&
    rawDom > 1
  ) {
    return {
      ok: false,
      error: `Canlı sayfada ${rawDom} beden bulundu fakat aktarım datasında ${canonical.stockSummary.totalVariants} beden var. Manuel kontrol gerekli.`,
      step: "variant_count_mismatch",
    };
  }
  if (canonical.manualReviewRequired || canonical.shopifyUploadBlocked) {
    return {
      ok: false,
      error: "Manual review required. Shopify upload blocked.",
      step: "low_confidence_variants",
    };
  }
  return { ok: true };
}

/** Hardcoded sahte varyant listesi tespiti (test ve guard için) */
export const BANNED_HARDCODED_VARIANT_SIGNATURES = [
  "Gri-XS",
  "Gri-S",
  "Turuncu-XL",
  "UA-GRI",
  "UA-TURUNCU",
] as const;

export function containsBannedHardcodedVariants(variants: CanonicalVariantItem[]): boolean {
  const skus = variants.map((v) => v.sku.toUpperCase());
  const colors = variants.map((v) => v.color);
  const hasGriTuruncuPair =
    colors.includes("Gri") &&
    colors.includes("Turuncu") &&
    variants.some((v) => /^(XS|S|M|L|XL|2XL|3XL)$/i.test(v.size));
  const hasUaSku = skus.some((s) => s.startsWith("UA-"));
  return hasGriTuruncuPair || hasUaSku;
}
