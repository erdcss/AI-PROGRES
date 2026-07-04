import { generateCanonicalShopifyCSV } from "./shopify-canonical-export";
import { buildCanonicalProductForShopify } from "./variant-shape-normalizer";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";
import fs from "fs";
import path from "path";
import {
  SHOPIFY_CSV_FILENAME,
  getCsvDownloadInfo,
  parseCSVRow,
  resolveCsvOutputDirectory,
  saveShopifyCsv,
  analyzeShopifyCsvContent,
} from "./csv-paths";
import {
  buildMinimalShopifyCsvRow,
} from "./shopify-csv-headers";
import { logCacheGuard } from "./flow-trace";
import {
  hasCsvEligibleScrapeData,
  mergeScrapeFields,
  type ScrapeFieldSource,
} from "./scrape-field-merge";
import type { CanonicalProductForShopify } from "./variant-shape-normalizer";

interface ScrapeProductShape {
  id: string;
  title: string;
  brand: string;
  price: { original: number; withProfit: number };
  description: string;
  category: string;
  images: Array<{ url: string; alt?: string; colorName?: string }>;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features: Array<{ key: string; value: string }>;
  tags: string[];
}

export interface ScrapeCsvInfo {
  filename: string;
  downloadUrl: string;
  ready: boolean;
  rowCount: number;
  productCount: number;
  variantRowCount: number;
  imageRowCount: number;
}

export interface ScrapeCsvPreview {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export type CsvErrorCode =
  | "csv_missing_title"
  | "csv_missing_price"
  | "csv_canonical_failed"
  | "csv_validation_failed"
  | "csv_write_failed"
  | "csv_no_product_row";

export interface CsvDiagnostics {
  selectedTitleSource?: ScrapeFieldSource | null;
  selectedPriceSource?: ScrapeFieldSource | null;
  rawPriceShape?: string;
  canonicalCreated?: boolean;
  normalizedCreated?: boolean;
  csvLength?: number;
  csvReady?: boolean;
  minimalFallbackUsed?: boolean;
}

export interface CsvBuildOutcome {
  csvContent?: string;
  csvInfo: ScrapeCsvInfo;
  csvPreview?: ScrapeCsvPreview;
  canonicalProduct?: CanonicalProductForShopify;
  csvErrorCode?: CsvErrorCode;
  csvDiagnostics: CsvDiagnostics;
}

function buildCsvPreviewFromContent(csvContent: string): ScrapeCsvPreview | null {
  const lines = csvContent
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return null;

  const headers = parseCSVRow(lines[0]);
  const rows = lines.slice(1, 6).map(parseCSVRow);

  return {
    headers,
    rows,
    rowCount: Math.max(0, lines.length - 1),
  };
}

function csvHasProductRow(csvContent: string): boolean {
  const lines = csvContent
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return false;

  const headers = parseCSVRow(lines[0]);
  const firstRow = parseCSVRow(lines[1]);
  const titleIdx = headers.findIndex((h) => h.trim().toLowerCase() === "title");
  const handleIdx = headers.findIndex((h) => h.trim().toLowerCase() === "url handle");
  const priceIdx = headers.findIndex((h) => h.trim().toLowerCase() === "price");

  const title = titleIdx >= 0 ? firstRow[titleIdx]?.trim() : "";
  const handle = handleIdx >= 0 ? firstRow[handleIdx]?.trim() : "";
  const priceRaw = priceIdx >= 0 ? firstRow[priceIdx]?.trim() : "";
  const priceNum = Number.parseFloat(priceRaw.replace(",", "."));

  return Boolean(title && handle && Number.isFinite(priceNum) && priceNum > 0);
}

function normalizeImages(images: unknown): ScrapeProductShape["images"] {
  if (!Array.isArray(images)) return [];

  return images
    .map((img) => {
      if (typeof img === "string") {
        const url = img.trim().startsWith("//") ? `https:${img.trim()}` : img.trim();
        return url ? { url, colorName: "none" } : null;
      }
      if (img && typeof img === "object") {
        const record = img as Record<string, unknown>;
        const raw = record.url ?? record.src ?? record.imageUrl ?? record.image;
        if (typeof raw === "string") {
          const url = raw.trim().startsWith("//") ? `https:${raw.trim()}` : raw.trim();
          if (!url) return null;
          const typed = img as { url: string; alt?: string; colorName?: string };
          return { url, alt: typed.alt, colorName: typed.colorName || "none" };
        }
      }
      return null;
    })
    .filter((img): img is ScrapeProductShape["images"][number] => Boolean(img));
}

function normalizeVariants(
  variants: unknown,
  productTitle?: string,
): ScrapeProductShape["variants"] {
  const sanitized = sanitizeTrendyolVariants(variants, { productTitle });
  return {
    colors: sanitized.colors,
    sizes: sanitized.sizes,
    allVariants: sanitized.allVariants.map((v) => ({
      color: v.color,
      colorCode: v.colorCode || "",
      size: v.size,
      inStock: v.inStock,
    })),
  };
}

function pickFirstNonEmptyString(
  result: Record<string, unknown>,
  field: "description" | "category",
): string {
  const sources = [
    result.productInfo,
    result.product,
    result.canonicalProduct,
    result,
  ];
  for (const source of sources) {
    if (source && typeof source === "object") {
      const value = (source as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

export function normalizeScrapeProduct(
  result: Record<string, unknown>,
  sourceUrl?: string,
): ScrapeProductShape | null {
  const merged = mergeScrapeFields(result);

  if (!merged.title) {
    console.error("[CSV] Ürün title eksik — CSV üretilmedi", {
      sourceUrl,
      selectedTitleSource: merged.titleSource,
    });
    return null;
  }

  if (merged.priceOriginal <= 0) {
    console.error("[CSV] Ürün price eksik — CSV üretilmedi", {
      title: merged.title,
      sourceUrl,
      selectedPriceSource: merged.priceSource,
      rawPriceShape: merged.rawPriceShape,
    });
    return null;
  }

  const description = pickFirstNonEmptyString(result, "description");
  const category = pickFirstNonEmptyString(result, "category");
  const images = normalizeImages(merged.images);
  const variants = normalizeVariants(merged.variants, merged.title);
  const features = Array.isArray(result.features)
    ? (result.features as ScrapeProductShape["features"])
    : [];
  const tags = Array.isArray(result.tags) ? (result.tags as string[]) : [];

  return {
    id: String(result.id ?? `product-${Date.now()}`),
    title: merged.title,
    brand: merged.brand,
    price: {
      original: merged.priceOriginal,
      withProfit: merged.priceWithProfit,
    },
    description,
    category,
    images,
    variants,
    features,
    tags,
  };
}

export function toScrapeCsvInfo(info: ReturnType<typeof getCsvDownloadInfo>): ScrapeCsvInfo {
  return {
    filename: info.filename,
    downloadUrl: info.downloadUrl,
    ready: info.ready,
    rowCount: info.rowCount,
    productCount: info.productCount,
    variantRowCount: info.variantRowCount,
    imageRowCount: info.imageRowCount,
  };
}

function scrapeCsvInfoFromContent(csvContent: string, ready = true): ScrapeCsvInfo {
  const stats = analyzeShopifyCsvContent(csvContent);
  return {
    filename: SHOPIFY_CSV_FILENAME,
    downloadUrl: `/api/download/${SHOPIFY_CSV_FILENAME}`,
    ready: ready && (stats?.productCount ?? 0) > 0,
    rowCount: stats?.rowCount ?? 0,
    productCount: stats?.productCount ?? 0,
    variantRowCount: stats?.variantRowCount ?? 0,
    imageRowCount: stats?.imageRowCount ?? 0,
  };
}

export function emptyScrapeCsvInfo(): ScrapeCsvInfo {
  return {
    filename: SHOPIFY_CSV_FILENAME,
    downloadUrl: `/api/download/${SHOPIFY_CSV_FILENAME}`,
    ready: false,
    rowCount: 0,
    productCount: 0,
    variantRowCount: 0,
    imageRowCount: 0,
  };
}

function buildDiagnosticsBase(result: Record<string, unknown>): CsvDiagnostics {
  const merged = mergeScrapeFields(result);
  return {
    selectedTitleSource: merged.titleSource,
    selectedPriceSource: merged.priceSource,
    rawPriceShape: merged.rawPriceShape,
    canonicalCreated: false,
    normalizedCreated: false,
    csvLength: 0,
    csvReady: false,
    minimalFallbackUsed: false,
  };
}

export async function buildScrapeCsvContent(
  result: Record<string, unknown>,
  sourceUrl?: string,
): Promise<CsvBuildOutcome> {
  console.log("[FlowTrace] activeRoute=routes.ts CSV=shopify-canonical-export.ts");
  const diagnostics = buildDiagnosticsBase(result);
  const merged = mergeScrapeFields(result);

  if (!merged.title) {
    return {
      csvInfo: emptyScrapeCsvInfo(),
      csvErrorCode: "csv_missing_title",
      csvDiagnostics: diagnostics,
    };
  }

  if (merged.priceOriginal <= 0) {
    return {
      csvInfo: emptyScrapeCsvInfo(),
      csvErrorCode: "csv_missing_price",
      csvDiagnostics: diagnostics,
    };
  }

  const canonical = buildCanonicalProductForShopify({ scrapeResult: result, sourceUrl });
  diagnostics.canonicalCreated = Boolean(canonical);

  if (canonical) {
    if (canonical.manualReviewRequired) {
      console.warn("[CSV] manualReviewRequired — düşük güven, CSV yine üretiliyor", {
        title: canonical.title,
      });
    }

    const canonicalPrice = Number.parseFloat(canonical.price);
    if (!Number.isFinite(canonicalPrice) || canonicalPrice <= 0) {
      return {
        csvInfo: emptyScrapeCsvInfo(),
        canonicalProduct: canonical,
        csvErrorCode: "csv_missing_price",
        csvDiagnostics: diagnostics,
      };
    }

    try {
      const csvContent = generateCanonicalShopifyCSV(canonical);
      if (!csvContent?.trim()) {
        return {
          csvInfo: emptyScrapeCsvInfo(),
          canonicalProduct: canonical,
          csvErrorCode: "csv_canonical_failed",
          csvDiagnostics: diagnostics,
        };
      }

      const { validateCsvContent } = await import("./shopify-csv-headers");
      const check = validateCsvContent(csvContent);
      console.log("[CSV] buildScrapeCsvContent validation", {
        headerCount: check.headerCount,
        rowCounts: check.rowCounts,
        valid: check.valid,
      });

      if (!check.valid) {
        return {
          csvInfo: emptyScrapeCsvInfo(),
          canonicalProduct: canonical,
          csvErrorCode: "csv_validation_failed",
          csvDiagnostics: { ...diagnostics, csvLength: csvContent.length },
        };
      }

      if (!csvHasProductRow(csvContent)) {
        return {
          csvInfo: emptyScrapeCsvInfo(),
          canonicalProduct: canonical,
          csvErrorCode: "csv_no_product_row",
          csvDiagnostics: { ...diagnostics, csvLength: csvContent.length },
        };
      }

      diagnostics.csvLength = csvContent.length;
      diagnostics.csvReady = true;
      return {
        csvContent,
        csvInfo: scrapeCsvInfoFromContent(csvContent),
        csvPreview: buildCsvPreviewFromContent(csvContent) ?? undefined,
        canonicalProduct: canonical,
        csvDiagnostics: diagnostics,
      };
    } catch (error) {
      console.error("[CSV] generateCanonicalShopifyCSV hatası:", error);
      return {
        csvInfo: emptyScrapeCsvInfo(),
        canonicalProduct: canonical,
        csvErrorCode: "csv_canonical_failed",
        csvDiagnostics: diagnostics,
      };
    }
  }

  const product = normalizeScrapeProduct(result, sourceUrl);
  diagnostics.normalizedCreated = Boolean(product);

  if (!product) {
    return {
      csvInfo: emptyScrapeCsvInfo(),
      csvErrorCode: merged.title ? "csv_missing_price" : "csv_missing_title",
      csvDiagnostics: diagnostics,
    };
  }

  const salePrice = product.price.withProfit || product.price.original;
  const minimalCsv = buildMinimalShopifyCsvRow({
    title: product.title,
    brand: product.brand,
    price: salePrice,
    imageUrl: product.images[0]?.url,
  });

  if (!minimalCsv?.trim()) {
    return {
      csvInfo: emptyScrapeCsvInfo(),
      csvErrorCode: "csv_canonical_failed",
      csvDiagnostics: diagnostics,
    };
  }

  const { validateCsvContent } = await import("./shopify-csv-headers");
  const check = validateCsvContent(minimalCsv);
  if (!check.valid || !csvHasProductRow(minimalCsv)) {
    return {
      csvInfo: emptyScrapeCsvInfo(),
      csvErrorCode: check.valid ? "csv_no_product_row" : "csv_validation_failed",
      csvDiagnostics: { ...diagnostics, csvLength: minimalCsv.length, minimalFallbackUsed: true },
    };
  }

  console.log("[CSV] minimal product fallback used", { title: product.title });
  diagnostics.minimalFallbackUsed = true;
  diagnostics.csvLength = minimalCsv.length;
  diagnostics.csvReady = true;

  return {
    csvContent: minimalCsv,
    csvInfo: scrapeCsvInfoFromContent(minimalCsv),
    csvPreview: buildCsvPreviewFromContent(minimalCsv) ?? undefined,
    csvErrorCode: undefined,
    csvDiagnostics: diagnostics,
  };
}

export async function buildAndSaveScrapeCsv(
  result: Record<string, unknown>,
  sourceUrl?: string,
): Promise<CsvBuildOutcome> {
  const outcome = await buildScrapeCsvContent(result, sourceUrl);
  if (!outcome.csvContent) return outcome;

  try {
    saveShopifyCsv(outcome.csvContent);
    return {
      ...outcome,
      csvInfo: toScrapeCsvInfo(getCsvDownloadInfo()),
    };
  } catch (error) {
    console.error("[CSV] saveShopifyCsv failed:", error);
    return {
      ...outcome,
      csvContent: undefined,
      csvInfo: emptyScrapeCsvInfo(),
      csvErrorCode: "csv_write_failed",
      csvDiagnostics: { ...outcome.csvDiagnostics, csvReady: false },
    };
  }
}

export async function buildCsvFromScrapeResult(
  result: Record<string, unknown>,
  sourceUrl?: string,
  endpoint = "unknown",
): Promise<CsvBuildOutcome> {
  const normalized = normalizeScrapeProduct(result, sourceUrl);
  console.log("[SCRAPE SUCCESS] endpoint:", endpoint);
  console.log("[SCRAPE SUCCESS] title:", normalized?.title ?? mergeScrapeFields(result).title);
  console.log("[SCRAPE SUCCESS] price:", normalized?.price ?? mergeScrapeFields(result).priceOriginal);

  const outcome = await buildAndSaveScrapeCsv(result, sourceUrl);
  console.log("[CSV BUILD] result:", outcome.csvInfo, outcome.csvErrorCode ?? "ok");
  return outcome;
}

export async function attachCsvToScrapeResult<T extends Record<string, unknown>>(
  result: T,
  sourceUrl?: string,
  endpoint = "unknown",
): Promise<
  T & {
    csvContent?: string;
    csvInfo: ScrapeCsvInfo;
    csvPreview?: ScrapeCsvPreview;
    canonicalProduct?: CanonicalProductForShopify;
    csvErrorCode?: CsvErrorCode;
    csvDiagnostics?: CsvDiagnostics;
  }
> {
  const explicitlyBlocked =
    result.usableForCsv === false &&
    result.blockedForExport === true &&
    !hasCsvEligibleScrapeData(result);

  if (explicitlyBlocked) {
    console.log("[CSV] attach skipped — export blocked", {
      title: result.title,
      titleSource: result.titleSource,
      previewOk: result.previewOk,
      endpoint,
    });
    return { ...result, csvInfo: emptyScrapeCsvInfo() };
  }

  const outcome = await buildCsvFromScrapeResult(result, sourceUrl, endpoint);

  if (outcome.csvContent) {
    console.log("[CSV] attached — usableForCsv=true", {
      previewOk: result.previewOk === true,
      endpoint,
      csvPreview: outcome.csvPreview ? `rows=${outcome.csvPreview.rowCount}` : "rows=0",
      csvInfo: `filename=${outcome.csvInfo.filename}`,
      csvDiagnostics: outcome.csvDiagnostics,
    });
    return {
      ...result,
      csvContent: outcome.csvContent,
      csvInfo: outcome.csvInfo,
      csvPreview: outcome.csvPreview,
      canonicalProduct: outcome.canonicalProduct,
      csvDiagnostics: outcome.csvDiagnostics,
      usableForCsv: true,
    };
  }

  console.log("[CSV] attach failed", {
    title: mergeScrapeFields(result).title,
    endpoint,
    csvErrorCode: outcome.csvErrorCode,
    csvDiagnostics: outcome.csvDiagnostics,
  });

  return {
    ...result,
    csvInfo: outcome.csvInfo,
    canonicalProduct: outcome.canonicalProduct,
    csvErrorCode: outcome.csvErrorCode,
    csvDiagnostics: outcome.csvDiagnostics,
  };
}

/** Yeni scrape başladığında eski CSV önizlemesini geçersiz kılar */
export function invalidateStaleCsvCache(
  sourceUrl: string,
  expectedProductId: string,
  scrapeRunId: string,
): { oldCsvDeleted: boolean } {
  let oldCsvDeleted = false;
  try {
    const csvDir = resolveCsvOutputDirectory();
    const csvPath = path.join(csvDir, SHOPIFY_CSV_FILENAME);
    const metaPath = path.join(csvDir, "csv-data.json");

    for (const filePath of [csvPath, metaPath]) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        oldCsvDeleted = true;
      }
    }

    logCacheGuard({
      cleared: true,
      oldCsvDeleted,
      localPreviewInvalidated: true,
      scrapeRunId,
      previewSourceProductId: expectedProductId,
      sourceUrl,
    });
  } catch (err) {
    console.warn("[CacheGuard] CSV invalidation failed:", err);
  }
  return { oldCsvDeleted };
}

export async function enrichScrapeResponseWithCsv<T extends Record<string, unknown>>(
  payload: T,
  sourceUrl?: string,
  endpoint = "/api/scrape",
): Promise<
  T & {
    csvContent?: string;
    csvInfo: ScrapeCsvInfo;
    csvPreview?: ScrapeCsvPreview;
    canonicalProduct?: CanonicalProductForShopify;
    csvErrorCode?: CsvErrorCode;
    csvDiagnostics?: CsvDiagnostics;
  }
> {
  const canAttempt =
    payload.previewOk === true ||
    payload.usableForCsv === true ||
    payload.success === true ||
    payload.partialSuccess === true ||
    hasCsvEligibleScrapeData(payload);

  if (!canAttempt) {
    return { ...payload, csvInfo: emptyScrapeCsvInfo() };
  }

  return attachCsvToScrapeResult(payload, sourceUrl, endpoint);
}

export { hasCsvEligibleScrapeData, mergeScrapeFields };
