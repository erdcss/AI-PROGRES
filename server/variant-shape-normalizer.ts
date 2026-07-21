import { getShopifyInventoryConfig } from "@shared/shopify-inventory-config";
import { isConfirmedClothingProduct } from "@shared/clothing-keywords";
import { normalizeTrendyolColorName } from "@shared/trendyol-color-normalizer";
import { resolveInventoryQty } from "./shopify-inventory-qty";
import { resolveVariantAvailability } from "@shared/stock-status";
import {
  buildCanonicalHandle,
  buildCanonicalSku,
  buildTrendyolSourceIdentity,
  resolveTrendyolSourceIds,
  type TrendyolSourceIdentity,
} from "./shopify-source-key";
import { mergeScrapeFields, collectScrapeSourceLayers } from "./scrape-field-merge";
import { normalizeTrendyolPriceValue } from "./trendyol-price-utils";
import { traceVariants } from "./variant-trace";
import { isComboSizeLabel } from "@shared/trendyol-variant-utils";

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
  /** Renk ailesindeki tüm trendyol:{productId} anahtarları */
  sourceAliases?: string[];
  handle: string;
  title: string;
  brand: string;
  /** Shopify CSV satış fiyatı (withProfit) */
  price: string;
  /** Gerçek liste/indirim öncesi fiyat — yoksa boş */
  compareAtPrice?: string;
  images: string[];
  /** Renk → galeri; CSV Variant Image / Image Alt için */
  imagesByColor?: Record<string, string[]>;
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

const REJECTED_SIZE_TEXT =
  /sepete ekle|son \d+ ürün|kupon|popüler|yorum|marka|açıklama|fiyat|favori|kargo|tl$|tüm bedenler|beden seç|adetten az stok/i;

export const VALID_SIZE_LABEL =
  /^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|34|36|38|40|42|44|Standart|STD|Tek Ebat)$/i;

export function isValidSizeLabel(size: string): boolean {
  const t = size.trim();
  if (!t) return false;
  // Trendyol combo bedenleri (S/M, L/XL) atomik genişletmeden önce kabul edilmeli
  if (isComboSizeLabel(t)) return true;
  return VALID_SIZE_LABEL.test(t);
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
  return normalizeTrendyolColorName(input);
}

function normalizeSizeArray(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const item of items) {
    const v = normalizeSizeValue(item);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function normalizeColorArray(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const item of items) {
    const v = normalizeColorValue(item);
    if (v && !out.some((x) => x.toLocaleLowerCase("tr-TR") === v.toLocaleLowerCase("tr-TR"))) {
      out.push(v);
    }
  }
  return out;
}

/** @deprecated size-only — renkler için normalizeColorArray kullanın */
function normalizeStringArray(items: unknown): string[] {
  return normalizeSizeArray(items);
}

function variantKey(color: string, size: string): string {
  return `${color.trim().toLowerCase()}|${size.trim().toLowerCase()}`;
}

type EvidenceSource =
  | "api_listing"
  | "all_variants"
  | "stock_map"
  | "dom_buttons"
  | "script_state"
  | "color_size_cross"
  | "inferred_matrix"
  | "unknown";

interface RawVariantRow {
  color: string;
  size: string;
  inStock: boolean;
  stockCount?: number | null;
  price?: string | number;
  image?: string;
  disabledReason?: string;
  confidence: "high" | "medium" | "low";
  evidenceSource?: EvidenceSource;
  sourceListingId?: string | null;
  sourceProductId?: string | null;
}

function resolveRowInStock(o: Record<string, unknown>): boolean {
  const available = resolveVariantAvailability(o);
  return available === true;
}

function resolveRowStockUnknown(o: Record<string, unknown>): boolean {
  return resolveVariantAvailability(o) == null;
}

function collectFromItems(variants: Record<string, unknown>): RawVariantRow[] {
  const items = variants.items;
  if (!Array.isArray(items) || items.length === 0) return [];

  return items.map((item) => {
    const o = item as Record<string, unknown>;
    const color = normalizeColorValue(o.color ?? o.colorName) || DEFAULT_COLOR;
    const size = normalizeSizeValue(o.size ?? o.sizeName) || DEFAULT_SIZE;
    const unknown = resolveRowStockUnknown(o);
    return {
      color,
      size,
      inStock: unknown ? false : resolveRowInStock(o),
      stockCount:
        typeof o.stockCount === "number"
          ? o.stockCount
          : typeof o.sourceStockQty === "number"
            ? o.sourceStockQty
            : null,
      price: String(o.price ?? ""),
      image: typeof o.image === "string" ? o.image : undefined,
      disabledReason: typeof o.disabledReason === "string" ? o.disabledReason : undefined,
      confidence: unknown ? ("low" as const) : ("high" as const),
      evidenceSource: "api_listing",
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
    rows.push({ color, size, inStock, confidence: "high", evidenceSource: "stock_map" });
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
      inStock: resolveRowStockUnknown(o) ? false : resolveRowInStock(o),
      stockCount: typeof o.stockCount === "number" ? o.stockCount : null,
      confidence: resolveRowStockUnknown(o) ? "low" : "high",
      evidenceSource: "stock_map",
    });
  }
  return rows;
}

function collectFromAllVariants(allVariants: unknown[]): RawVariantRow[] {
  const rows: RawVariantRow[] = [];
  for (const item of allVariants) {
    const o = item as Record<string, unknown>;
    const rawColor = o.color ?? o.colorName;
    const normalizedColor = normalizeColorValue(rawColor);
    if (!normalizedColor && rawColor != null && String(rawColor).trim()) {
      continue;
    }
    const color = normalizedColor || DEFAULT_COLOR;
    const size = normalizeSizeValue(o.size ?? o.sizeName) || DEFAULT_SIZE;
    const images = Array.isArray(o.images)
      ? o.images.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
      : [];
    const image =
      typeof o.image === "string" && /^https?:\/\//i.test(o.image)
        ? o.image
        : images[0];
    rows.push({
      color,
      size,
      inStock: resolveRowStockUnknown(o) ? false : resolveRowInStock(o),
      stockCount:
        typeof o.stockCount === "number"
          ? o.stockCount
          : typeof o.sourceStockQty === "number"
            ? o.sourceStockQty
            : null,
      price:
        typeof o.price === "number" || typeof o.price === "string" ? o.price : undefined,
      image,
      confidence: resolveRowStockUnknown(o) ? "low" : "high",
      evidenceSource: "all_variants" as const,
      sourceListingId:
        typeof o.listingId === "string"
          ? o.listingId
          : typeof o.sourceListingId === "string"
            ? o.sourceListingId
            : null,
      sourceProductId:
        o.sourceProductId != null
          ? String(o.sourceProductId)
          : o.productId != null
            ? String(o.productId)
            : null,
    });
  }
  return rows;
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
      const inStock = stockMap
        ? stockMap[key] === true
        : false;
      rows.push({
        color,
        size,
        inStock,
        confidence: stockMap ? "medium" : "low",
        evidenceSource: "color_size_cross",
      });
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
      const size = normalizeSizeValue(row.size) || DEFAULT_SIZE;
      const key = variantKey(color, size);
      const existing = rowMap.get(key);
      if (!existing || (row.confidence === "high" && existing.confidence !== "high")) {
        rowMap.set(key, { ...row, color, size });
      }
    }
  };

  const colors = normalizeColorArray(v.colors);
  const sizes = normalizeSizeArray(v.sizes ?? v.availableSizes);
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

  const existingSizeKeys = new Set(
    [...rowMap.values()].map((r) => (normalizeSizeValue(r.size) || "").toLowerCase()).filter(Boolean),
  );
  const ingestExtraSizes = (
    sizes: string[],
    source: string,
    evidenceSource: RawVariantRow["evidenceSource"],
  ) => {
    const normalized = sizes
      .map((s) => normalizeSizeValue(s))
      .filter((s): s is string => Boolean(s));
    const novel = normalized.filter((s) => !existingSizeKeys.has(s.toLowerCase()));
    if (novel.length === 0) return;
    ingest(
      novel.map((size) => ({
        color: DEFAULT_COLOR,
        size,
        inStock: false,
        confidence: "low" as const,
        evidenceSource,
      })),
      source,
    );
    for (const s of novel) existingSizeKeys.add(s.toLowerCase());
  };

  // Renk satırı olsa bile DOM/script/slicing bedenleri birleştir — yalnızca görünür
  // seçili bedene güvenilmemeli (hasNamedColorsInMap eski kapısı kaldırıldı).
  if (extras?.slicingAttributes) {
    const slicingSizes = extractSizesFromSlicingAttributes(extras.slicingAttributes);
    if (slicingSizes.length) ingestExtraSizes(slicingSizes, "slicingAttributes", "script_state");
  }
  if (extras?.scriptSizes?.length) {
    ingestExtraSizes(extras.scriptSizes, "scriptJson", "script_state");
  }
  if (extras?.domSizeButtons?.length) {
    ingestExtraSizes(extras.domSizeButtons, "domButtons", "dom_buttons");
  }

  if (colors.length > 0 && sizes.length > 0 && rowMap.size === 0) {
    ingest(collectFromColorSizeCross(colors, sizes, stockMap), "color_size_cross");
  }

  if (colors.length === 0 && sizes.length > 0 && rowMap.size === 0) {
    ingest(
      sizes.map((size) => ({
        color: DEFAULT_COLOR,
        size,
        inStock: stockMap ? stockMap[`${DEFAULT_COLOR}-${size}`] !== false && stockMap[`Tek Renk-${size}`] !== false : true,
        confidence: "medium" as const,
        evidenceSource: "script_state" as const,
      })),
      "sizesOnly",
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
    const allVariants = Array.isArray(v.allVariants) ? (v.allVariants as unknown[]) : [];
    if (allVariants.length > 0) {
      rows = allVariants.map((item) => {
        const o = item as Record<string, unknown>;
        return {
          color: normalizeColorValue(o.color ?? o.colorName) || DEFAULT_COLOR,
          size: normalizeSizeValue(o.size ?? o.sizeName) || DEFAULT_SIZE,
          inStock: resolveRowStockUnknown(o) ? false : resolveRowInStock(o),
          stockCount: typeof o.stockCount === "number" ? o.stockCount : null,
          confidence: resolveRowStockUnknown(o) ? ("low" as const) : ("medium" as const),
          evidenceSource: "allVariants" as const,
        };
      });
    }
  }

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
    const size = normalizeSizeValue(row.size) || DEFAULT_SIZE;
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

function extractImagesFromList(raw: unknown): string[] {
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

function pickExplicitCompareAtPrice(priceRaw: unknown, salePrice: number): string | undefined {
  if (!priceRaw || typeof priceRaw !== "object" || salePrice <= 0) return undefined;
  const record = priceRaw as Record<string, unknown>;
  for (const key of ["compareAtPrice", "compareAt", "listPrice"]) {
    const candidate = normalizeTrendyolPriceValue(record[key]);
    if (candidate > salePrice) return candidate.toFixed(2);
  }
  return undefined;
}

function resolveVariantSalePrice(
  variantOriginalPrice: string | undefined,
  productSalePrice: string,
  profitRatio: number,
): string {
  if (variantOriginalPrice) {
    const parsed = normalizeTrendyolPriceValue(variantOriginalPrice);
    if (parsed > 0) {
      return (Math.round(parsed * profitRatio * 100) / 100).toFixed(2);
    }
  }
  return productSalePrice;
}

function extractImages(source: Record<string, unknown>): string[] {
  return extractImagesFromList(source.images);
}

export interface BuildCanonicalInput {
  scrapeResult: Record<string, unknown>;
  sourceUrl?: string;
}

/** Scrape sonucunu CanonicalProductForShopify formatına dönüştürür */
export function buildCanonicalProductForShopify(
  input: BuildCanonicalInput,
): CanonicalProductForShopify | null {
  const merged = mergeScrapeFields(input.scrapeResult);
  const layers = collectScrapeSourceLayers(input.scrapeResult);
  const rootLayer = layers.find((layer) => layer.key === "root")?.data ?? input.scrapeResult;

  const sourceUrl =
    input.sourceUrl ||
    String(
      rootLayer.sourceUrl ?? rootLayer.originalUrl ?? rootLayer.url ?? "",
    ).trim();

  const identity: TrendyolSourceIdentity | null = sourceUrl
    ? buildTrendyolSourceIdentity(sourceUrl)
    : null;

  const scrapedId =
    rootLayer.id ?? rootLayer.productId ?? rootLayer.contentId ?? input.scrapeResult.id;
  const sourceIds = sourceUrl
    ? resolveTrendyolSourceIds(sourceUrl, scrapedId as string | number | undefined)
    : null;

  const sourceProductId =
    sourceIds?.selectedSourceProductId ||
    identity?.sourceProductId ||
    String(scrapedId ?? "").replace(/\D/g, "") ||
    `unknown-${Date.now()}`;

  const title = merged.title.trim();
  if (!title) return null;

  const brand = merged.brand.trim() || "Generic";
  const salePriceNum =
    merged.priceWithProfit > 0 ? merged.priceWithProfit : merged.priceOriginal;
  if (salePriceNum <= 0) return null;
  const price = salePriceNum.toFixed(2);
  const compareAtPrice = pickExplicitCompareAtPrice(rootLayer.price, salePriceNum);
  const profitRatio =
    merged.priceOriginal > 0 && merged.priceWithProfit > 0
      ? merged.priceWithProfit / merged.priceOriginal
      : 1;
  const stockText = String(
    rootLayer.stockText ?? rootLayer.stockStatus ?? input.scrapeResult.stockText ?? "",
  );

  const variantsRaw = merged.variants ?? rootLayer.variants ?? input.scrapeResult.variants;
  const variantDiagnostics =
    (input.scrapeResult.variantDiagnostics as VariantDiagnostics | undefined) ?? {};
  const domSizeButtons =
    variantDiagnostics.domSizeButtons ??
    (Array.isArray(input.scrapeResult.domSizeButtons)
      ? (input.scrapeResult.domSizeButtons as string[])
      : undefined);
  const scriptSizes = variantDiagnostics.scriptSizes;
  const slicingAttributes =
    rootLayer.slicingAttributes ?? input.scrapeResult.slicingAttributes ?? rootLayer.attributes;

  const extractedVariants = extractVariantsFromScrape(
    variantsRaw,
    stockText,
    { domSizeButtons, slicingAttributes, variantDiagnostics, scriptSizes },
  );
  let rows = extractedVariants.rows;
  const { inputShape, diagnostics: extractDiag } = extractedVariants;
  const likelyApparel = isLikelyApparelForCanonical(input.scrapeResult, sourceUrl, title);

  if (rows.length === 0) {
    if (!likelyApparel) {
      console.log(
        "[VariantNormalize] varyantsız normal ürün — güvenli varsayılan Shopify varyantı oluşturuldu",
      );
      rows = [
        {
          color: DEFAULT_COLOR,
          size: DEFAULT_SIZE,
          inStock: true,
          confidence: "low",
          evidenceSource: "unknown",
        },
      ];
    } else {
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
      compareAtPrice,
      images: extractImagesFromList(merged.images),
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
  }

  const config = getShopifyInventoryConfig();
  const familySourceKey =
    typeof input.scrapeResult.familySourceKey === "string"
      ? input.scrapeResult.familySourceKey
      : typeof (input.scrapeResult.colorFamily as { familySourceKey?: string } | undefined)
            ?.familySourceKey === "string"
        ? (input.scrapeResult.colorFamily as { familySourceKey: string }).familySourceKey
        : null;
  const sourceAliases = Array.isArray(input.scrapeResult.sourceAliases)
    ? (input.scrapeResult.sourceAliases as string[]).filter((s) => typeof s === "string")
    : Array.isArray((input.scrapeResult.colorFamily as { sourceAliases?: string[] } | undefined)?.sourceAliases)
      ? ((input.scrapeResult.colorFamily as { sourceAliases: string[] }).sourceAliases)
      : undefined;
  const effectiveSourceKey =
    familySourceKey ||
    sourceIds?.sourceKey ||
    identity?.sourceKey ||
    `trendyol:${sourceProductId}`;
  const familyIdForHandle =
    familySourceKey?.replace(/^trendyol-group:/, "") || sourceProductId;

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

    const variantSourceProductId = row.sourceProductId || sourceProductId;
    const variantPrice = resolveVariantSalePrice(
      row.price != null && String(row.price).trim() !== "" ? String(row.price) : undefined,
      price,
      profitRatio,
    );

    return {
      sourceProductId: variantSourceProductId,
      color: row.color,
      size: row.size,
      option1Name,
      option1Value,
      option2Name,
      option2Value,
      sku: buildCanonicalSku(variantSourceProductId, row.color, row.size),
      inStock: row.inStock,
      inventoryQty,
      sourceStockQty: row.stockCount ?? null,
      stockConfidence: row.confidence,
      disabledReason: row.disabledReason,
      price: variantPrice,
      image: row.image,
    };
  });

  const inStock = canonicalRows.filter((v) => v.inStock);
  const outOfStock = canonicalRows.filter((v) => !v.inStock);

  // Gerçek renk varken "Tek Renk" satırlarını düş — Shopify option şemasını bozar
  const namedColorRows = canonicalRows.filter(
    (v) => v.color && v.color !== DEFAULT_COLOR,
  );
  const rowsForColor =
    namedColorRows.length > 0 ? namedColorRows : canonicalRows;

  // Shopify'a yalnızca stokta olanlar gider (env ile açılmadıkça)
  const rowsForExport = config.exportOutOfStockVariants
    ? rowsForColor
    : rowsForColor.filter((v) => v.inStock);

  const exportVariants =
    rowsForExport.length > 0
      ? rowsForExport
      : config.exportOutOfStockVariants
        ? rowsForColor
        : inStock.filter((v) =>
            namedColorRows.length > 0 ? v.color && v.color !== DEFAULT_COLOR : true,
          );

  const colors = [...new Set(rowsForColor.map((v) => v.color))];
  const sizes = [...new Set(rowsForColor.map((v) => v.size))];

  const imagesByColorRaw = input.scrapeResult.imagesByColor;
  const imagesByColor: Record<string, string[]> =
    imagesByColorRaw && typeof imagesByColorRaw === "object" && !Array.isArray(imagesByColorRaw)
      ? Object.fromEntries(
          Object.entries(imagesByColorRaw as Record<string, unknown>)
            .map(([k, v]) => [
              k,
              Array.isArray(v)
                ? v.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
                : [],
            ])
            .filter(([, urls]) => (urls as string[]).length > 0),
        )
      : {};

  // Her varyanta kendi renk görselini bağla
  for (const v of exportVariants) {
    if (v.image) continue;
    const gallery =
      imagesByColor[v.color] ||
      Object.entries(imagesByColor).find(
        ([k]) => k.toLocaleLowerCase("tr-TR") === v.color.toLocaleLowerCase("tr-TR"),
      )?.[1];
    if (gallery?.[0]) v.image = gallery[0];
  }
  for (const v of rowsForColor) {
    if (v.image) continue;
    const gallery =
      imagesByColor[v.color] ||
      Object.entries(imagesByColor).find(
        ([k]) => k.toLocaleLowerCase("tr-TR") === v.color.toLocaleLowerCase("tr-TR"),
      )?.[1];
    if (gallery?.[0]) v.image = gallery[0];
  }

  // Ürün galerisi: renk sırasıyla (yabancı renk görselleri karışmasın)
  const orderedFromColors: string[] = [];
  const seenImg = new Set<string>();
  for (const color of colors) {
    const gallery =
      imagesByColor[color] ||
      Object.entries(imagesByColor).find(
        ([k]) => k.toLocaleLowerCase("tr-TR") === color.toLocaleLowerCase("tr-TR"),
      )?.[1] ||
      [];
    for (const img of gallery) {
      if (seenImg.has(img)) continue;
      seenImg.add(img);
      orderedFromColors.push(img);
    }
  }
  for (const v of exportVariants) {
    if (v.image && !seenImg.has(v.image)) {
      seenImg.add(v.image);
      orderedFromColors.push(v.image);
    }
  }
  const flatImages = extractImagesFromList(merged.images);
  const productImages =
    orderedFromColors.length > 0
      ? [
          ...orderedFromColors,
          ...flatImages.filter((u) => !seenImg.has(u) && colors.length <= 1),
        ]
      : flatImages;

  console.log(`[VariantNormalize] inputShape=${inputShape}`);
  console.log(`[VariantNormalize] colors=${colors.join(", ")}`);
  console.log(`[VariantNormalize] sizes=${sizes.join(", ")}`);
  if (namedColorRows.length > 0 && namedColorRows.length !== canonicalRows.length) {
    console.log(
      `[VariantNormalize] droppedPlaceholderColors=${canonicalRows.length - namedColorRows.length}`,
    );
  }
  if (!config.exportOutOfStockVariants && rowsForColor.length !== exportVariants.length) {
    console.log(
      `[VariantNormalize] droppedOutOfStock=${rowsForColor.length - exportVariants.length} (Shopify'a gönderilmeyecek)`,
    );
  }
  console.log(
    `[VariantNormalize] canonicalVariants=${exportVariants.length} (inStock=${exportVariants.filter((v) => v.inStock).length} outOfStockKept=${exportVariants.filter((v) => !v.inStock).length})`,
  );
  console.log(
    `[Stock] inStock=${inStock.length} outOfStock=${outOfStock.length} defaultQty=${config.defaultInStockQty} exportOos=${config.exportOutOfStockVariants}`,
  );

  const lowConfidenceOnly =
    rowsForColor.every((v) => v.stockConfidence === "low") && rowsForColor.length <= 1;

  const domMismatch =
    (extractDiag.rawDomSizeCount ?? 0) > rowsForColor.length &&
    (extractDiag.rawDomSizeCount ?? 0) > 1;

  const mergedSourceCount = Math.max(
    extractDiag.mergedSizeCount ?? 0,
    variantDiagnostics.mergedSizeCount ?? 0,
    domSizeButtons?.length ?? 0,
    (scriptSizes?.length ?? 0),
  );
  const mergeFailed =
    mergedSourceCount > 1 && rowsForColor.length === 1 && (extractDiag.rawDomSizeCount ?? 0) > 1;

  const apparelOneSizeBlock =
    likelyApparel &&
    rowsForColor.length <= 1 &&
    (variantDiagnostics.fullVariantScrapeAttempted === true ||
      input.scrapeResult.fullVariantScrapeAttempted === true);

  const blockReason = apparelOneSizeBlock
    ? "Kıyafet ürünü için sadece 1 beden tespit edildi. Full DOM/API varyant taraması yeterli veri döndürmedi."
    : mergeFailed
      ? `Variant merge failed: raw sources found ${mergedSourceCount} sizes but canonical has ${canonicalRows.length}`
      : undefined;

  const manualReviewRequired =
    lowConfidenceOnly || domMismatch || canonicalRows.length === 0 || apparelOneSizeBlock || mergeFailed;
  const shopifyUploadBlocked =
    exportVariants.length === 0 || domMismatch || apparelOneSizeBlock || mergeFailed;

  if (domMismatch || mergeFailed) {
    console.warn(
      `⚠️ Canlı sayfada ${extractDiag.rawDomSizeCount ?? mergedSourceCount} beden bulundu fakat aktarım datasında ${rowsForColor.length} beden var. Manuel kontrol gerekli.`,
    );
  }

  console.log(
    `[VariantDebug] canonicalVariants=${exportVariants.length} manualReviewRequired=${manualReviewRequired}`,
  );

  if (identity || sourceIds || familySourceKey) {
    console.log(
      `[Source] platform=trendyol productId=${sourceProductId} sourceKey=${effectiveSourceKey}`,
    );
  }

  const exportOutOfStock = rowsForColor.filter((v) => !v.inStock);
  const exportInStock = exportVariants.filter((v) => v.inStock);

  traceVariants("canonical_product", { allVariants: exportVariants }, {
    source: "buildCanonicalProductForShopify",
    options: {
      exportCount: exportVariants.length,
      inStock: exportInStock.length,
      outOfStock: exportOutOfStock.length,
      sizes,
      mergeFailed,
      apparelOneSizeBlock,
    },
  });

  return {
    sourcePlatform: "trendyol",
    sourceProductId,
    urlProductId: sourceIds?.urlProductId ?? identity?.sourceProductId,
    parsedProductId: sourceIds?.parsedProductId ?? undefined,
    sourceUrl: identity?.sourceUrl || sourceUrl,
    sourceKey: effectiveSourceKey,
    sourceAliases,
    handle: buildCanonicalHandle(brand, title, familyIdForHandle),
    title,
    brand,
    price,
    compareAtPrice,
    images: productImages,
    imagesByColor: Object.keys(imagesByColor).length ? imagesByColor : undefined,
    variants: exportVariants,
    outOfStockVariants: exportOutOfStock,
    stockSummary: {
      totalVariants: rowsForColor.length,
      inStockVariants: rowsForColor.filter((v) => v.inStock).length,
      outOfStockVariants: exportOutOfStock.length,
      defaultInventoryQty: config.defaultInStockQty,
    },
    manualReviewRequired,
    shopifyUploadBlocked,
    variantDiagnostics: {
      ...variantDiagnostics,
      ...extractDiag,
      canonicalVariantCount: exportVariants.length,
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
  if (canonical.shopifyUploadBlocked) {
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
