import { generateMultiVariantShopifyCSV } from "./multi-variant-csv-generator";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";
import {
  SHOPIFY_CSV_FILENAME,
  getCsvDownloadInfo,
  parseCSVRow,
  saveShopifyCsv,
} from "./csv-paths";

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
  productCount: number;
}

export interface ScrapeCsvPreview {
  headers: string[];
  rows: string[][];
  rowCount: number;
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

function parseNumericPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,]/g, "");
    if (!cleaned) return null;

    let normalized = cleaned;
    const parts = cleaned.split(".");
    if (parts.length === 3 && parts[2].length <= 2) {
      normalized = `${parts[0]}${parts[1]}.${parts[2]}`;
    } else if (cleaned.includes(",") && !cleaned.includes(".")) {
      normalized = cleaned.replace(",", ".");
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function extractPrice(price: unknown): number | null {
  if (price == null) return null;

  const direct = parseNumericPrice(price);
  if (direct) return direct;

  if (typeof price === "object") {
    const record = price as Record<string, unknown>;
    for (const key of ["withProfit", "original", "sale", "amount", "value", "current"]) {
      const candidate = parseNumericPrice(record[key]);
      if (candidate) return candidate;
    }
    for (const key of ["profitFormatted", "formatted", "raw"]) {
      const candidate = parseNumericPrice(record[key]);
      if (candidate) return candidate;
    }
  }

  return null;
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

export function normalizeScrapeProduct(result: Record<string, unknown>, sourceUrl?: string): ScrapeProductShape | null {
  const source =
    (result.productInfo as Record<string, unknown> | undefined) ??
    (result.product as Record<string, unknown> | undefined) ??
    result;

  const title = String(source.title ?? result.title ?? "").trim();
  const rawPrice = source.price ?? result.price;
  const numericPrice = extractPrice(rawPrice);

  if (!title) {
    console.error("[CSV] Ürün title eksik — CSV üretilmedi", { sourceUrl });
    return null;
  }

  if (!numericPrice) {
    console.error("[CSV] Ürün price eksik — CSV üretilmedi", { title, sourceUrl, rawPrice });
    return null;
  }

  const brand = String(source.brand ?? result.brand ?? "");
  const description = String(source.description ?? result.description ?? "");
  const category = String(source.category ?? result.category ?? "");
  const images = normalizeImages(source.images ?? result.images);
  const variants = normalizeVariants(source.variants ?? result.variants, title);
  const features = Array.isArray(source.features ?? result.features)
    ? (source.features ?? result.features) as ScrapeProductShape["features"]
    : [];
  const tags = Array.isArray(source.tags ?? result.tags)
    ? (source.tags ?? result.tags) as string[]
    : [];

  const withProfit = extractPrice(
    typeof rawPrice === "object" && rawPrice !== null
      ? (rawPrice as Record<string, unknown>).withProfit
      : undefined,
  );

  return {
    id: String(source.id ?? result.id ?? `product-${Date.now()}`),
    title,
    brand,
    price: {
      original: numericPrice,
      withProfit: withProfit ?? numericPrice,
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
    productCount: info.productCount,
  };
}

export function emptyScrapeCsvInfo(): ScrapeCsvInfo {
  return {
    filename: SHOPIFY_CSV_FILENAME,
    downloadUrl: `/api/download/${SHOPIFY_CSV_FILENAME}`,
    ready: false,
    productCount: 0,
  };
}

export async function buildScrapeCsvContent(
  result: Record<string, unknown>,
  sourceUrl?: string,
): Promise<string | null> {
  const product = normalizeScrapeProduct(result, sourceUrl);
  if (!product) return null;

  try {
    const csvContent = await generateMultiVariantShopifyCSV(product);
    if (!csvContent?.trim()) {
      console.error("[CSV] generateMultiVariantShopifyCSV boş içerik döndü", { title: product.title });
      return null;
    }
    const { validateCsvContent } = await import("./shopify-csv-headers");
    const check = validateCsvContent(csvContent);
    console.log("[CSV] buildScrapeCsvContent validation", {
      headerCount: check.headerCount,
      rowCounts: check.rowCounts,
      valid: check.valid,
    });
    if (!check.valid) {
      console.error("[CSV] validation failed:", check.error);
      return null;
    }
    return csvContent;
  } catch (error) {
    console.error("[CSV] generateMultiVariantShopifyCSV hatası:", error);
    return null;
  }
}

export async function buildAndSaveScrapeCsv(
  result: Record<string, unknown>,
  sourceUrl?: string,
): Promise<{ csvContent: string; csvInfo: ScrapeCsvInfo } | null> {
  const csvContent = await buildScrapeCsvContent(result, sourceUrl);
  if (!csvContent) return null;

  saveShopifyCsv(csvContent);
  return {
    csvContent,
    csvInfo: toScrapeCsvInfo(getCsvDownloadInfo()),
  };
}

export async function buildCsvFromScrapeResult(
  result: Record<string, unknown>,
  sourceUrl?: string,
  endpoint = "unknown",
): Promise<{ csvContent?: string; csvInfo: ScrapeCsvInfo }> {
  const normalized = normalizeScrapeProduct(result, sourceUrl);
  console.log("[SCRAPE SUCCESS] endpoint:", endpoint);
  console.log("[SCRAPE SUCCESS] title:", normalized?.title ?? result.title);
  console.log("[SCRAPE SUCCESS] price:", normalized?.price ?? result.price);

  const bundle = await buildAndSaveScrapeCsv(result, sourceUrl);
  const csvInfo = bundle?.csvInfo ?? emptyScrapeCsvInfo();
  console.log("[CSV BUILD] result:", csvInfo);

  return {
    csvContent: bundle?.csvContent,
    csvInfo,
  };
}

export async function attachCsvToScrapeResult<T extends Record<string, unknown>>(
  result: T,
  sourceUrl?: string,
  endpoint = "unknown",
): Promise<
  T & { csvContent?: string; csvInfo: ScrapeCsvInfo; csvPreview?: ScrapeCsvPreview }
> {
  const blocked =
    result.usableForCsv === false ||
    (result.blockedForExport === true && result.usableForCsv !== true);

  if (blocked) {
    console.log("[CSV] attach skipped — usableForCsv=false", {
      title: result.title,
      titleSource: result.titleSource,
      previewOk: result.previewOk,
      endpoint,
    });
    return { ...result, csvInfo: emptyScrapeCsvInfo() };
  }

  const { csvContent, csvInfo } = await buildCsvFromScrapeResult(result, sourceUrl, endpoint);
  if (csvContent) {
    const csvPreview = buildCsvPreviewFromContent(csvContent);
    console.log("[CSV] attached — usableForCsv=true", {
      previewOk: result.previewOk === true,
      endpoint,
      csvPreview: csvPreview
        ? `rows=${csvPreview.rowCount}`
        : "rows=0",
      csvInfo: `filename=${csvInfo.filename}`,
    });
    return { ...result, csvContent, csvInfo, csvPreview: csvPreview ?? undefined };
  }

  console.log("[CSV] attach failed — CSV content empty", {
    title: result.title,
    endpoint,
  });
  return { ...result, csvInfo };
}

export async function enrichScrapeResponseWithCsv<T extends Record<string, unknown>>(
  payload: T,
  sourceUrl?: string,
  endpoint = "/api/scrape",
): Promise<T & { csvContent?: string; csvInfo: ScrapeCsvInfo }> {
  if (payload.success === false) {
    return { ...payload, csvInfo: emptyScrapeCsvInfo() };
  }

  return attachCsvToScrapeResult(payload, sourceUrl, endpoint);
}
