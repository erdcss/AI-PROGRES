import { normalizeTrendyolDisplayPrice } from "@/utils/price-utils";
import { extractImagesFromCsv, resolveOriginalImageUrl } from "@/lib/product-image-url";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";
import { filterValidProductImages, prioritizeProductImagesForPreview } from "@shared/trendyol-product-images";

export class ScrapeFetchError extends Error {
  reason?: string;
  userMessage?: string;
  stageErrors?: string[];
  stageErrorsHuman?: string;
  finalSuccessReason?: string;

  constructor(
    message: string,
    meta?: {
      reason?: string;
      userMessage?: string;
      stageErrors?: string[];
      stageErrorsHuman?: string;
      finalSuccessReason?: string;
    },
  ) {
    super(message);
    this.name = "ScrapeFetchError";
    Object.assign(this, meta);
  }
}

export type ScrapedUrlPayload = {
  title: string;
  brand?: string;
  description?: string;
  category?: string;
  price: {
    original: number;
    withProfit: number;
    formatted: string;
    profitFormatted: string;
    currency: string;
  };
  images: string[];
  variants?: {
    colors?: string[];
    sizes?: string[];
    allVariants?: Array<{
      color: string;
      size: string;
      inStock: boolean;
      colorCode?: string;
    }>;
  };
  features?: Array<{ key: string; value: string }>;
  stockAnalysis?: {
    totalVariants: number;
    inStockVariants: number;
    outOfStockVariants: number;
    availableSizes: string[];
    unavailableSizes: string[];
  };
  tags?: string[];
  csvContent?: string;
  csvPreview?: {
    headers: string[];
    rows: string[][];
    rowCount?: number;
  };
  csvData?: string[][];
  csvInfo?: {
    filename: string;
    downloadUrl: string;
    ready: boolean;
    productCount: number;
  };
  extractionMethod?: string;
  success?: boolean;
  partialSuccess?: boolean;
  previewOk?: boolean;
  titleSource?: string;
  usableForCsv?: boolean;
  usableForShopify?: boolean;
  blockedForExport?: boolean;
  warnings?: string[];
  finalSuccessReason?: string;
  stageErrors?: string[];
  originalUrl: string;
  sourceUrl: string;
};

function normalizeImageList(images: unknown): string[] {
  return filterValidProductImages(images);
}

function extractCsvContent(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.csvContent === "string" && raw.csvContent.length > 50) {
    return raw.csvContent;
  }
  if (typeof raw.csvData === "string" && raw.csvData.length > 50) {
    return raw.csvData;
  }
  return undefined;
}

function extractCsvPreview(raw: Record<string, unknown>) {
  const preview = raw.csvPreview;
  if (preview && typeof preview === "object") {
    const record = preview as Record<string, unknown>;
    if (Array.isArray(record.headers) && Array.isArray(record.rows)) {
      return {
        headers: record.headers as string[],
        rows: record.rows as string[][],
        rowCount: typeof record.rowCount === "number" ? record.rowCount : undefined,
      };
    }
  }
  return undefined;
}

export function normalizeScrapedPayload(
  raw: Record<string, unknown>,
  url: string,
): ScrapedUrlPayload {
  const images = normalizeImageList(raw.images);
  const displayPrice = normalizeTrendyolDisplayPrice(raw.price, 0.10);

  const usableForCsv = raw.usableForCsv === true;
  const blockedForExport = raw.blockedForExport === true;
  const hasValidPrice = displayPrice.original > 0;

  const csvContent = extractCsvContent(raw);
  const csvPreview = extractCsvPreview(raw);
  const csvInfoRaw = raw.csvInfo as ScrapedUrlPayload["csvInfo"];
  const csvReady =
    csvInfoRaw?.ready === true ||
    Boolean(csvContent) ||
    Boolean(csvPreview?.rows?.length);

  return {
    title: String(raw.title || "Ürün"),
    brand: raw.brand ? String(raw.brand) : "",
    description: raw.description ? String(raw.description) : "",
    category: raw.category ? String(raw.category) : "",
    price: {
      original: displayPrice.original,
      withProfit: displayPrice.withProfit,
      formatted: displayPrice.formatted,
      profitFormatted: displayPrice.profitFormatted,
      currency: "TRY",
    },
    images,
    variants: sanitizeTrendyolVariants(raw.variants, {
      productTitle: String(raw.title || "Ürün"),
    }),
    features: (raw.features as ScrapedUrlPayload["features"]) || [],
    stockAnalysis: raw.stockAnalysis as ScrapedUrlPayload["stockAnalysis"],
    tags: (raw.tags as string[]) || [],
    csvContent,
    csvPreview,
    csvInfo: csvInfoRaw
      ? { ...csvInfoRaw, ready: csvReady && !blockedForExport }
      : {
          filename: "shopify-urunler.csv",
          downloadUrl: "/api/download/shopify-urunler.csv",
          ready: csvReady && usableForCsv && hasValidPrice && !blockedForExport,
          productCount: 0,
        },
    extractionMethod: raw.extractionMethod
      ? String(raw.extractionMethod)
      : undefined,
    success: raw.success !== false,
    partialSuccess: raw.partialSuccess === true,
    previewOk: raw.previewOk === true,
    titleSource: raw.titleSource ? String(raw.titleSource) : undefined,
    usableForCsv,
    usableForShopify: raw.usableForShopify === true,
    blockedForExport,
    warnings: Array.isArray(raw.warnings) ? (raw.warnings as string[]) : undefined,
    finalSuccessReason: raw.finalSuccessReason
      ? String(raw.finalSuccessReason)
      : undefined,
    stageErrors: Array.isArray(raw.stageErrors) ? (raw.stageErrors as string[]) : undefined,
    originalUrl: url,
    sourceUrl: url,
  };
}

/** Toplu ve tekli akışların ortak pipeline scrape + poll mantığı */
export async function fetchScenarioScrapeResult(
  url: string,
  onlyExtractData = true,
): Promise<ScrapedUrlPayload> {
  const startResp = await fetch("/api/trendyol-scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      mode: "single",
      onlyExtractData,
      scrapeMode: "auto-fast",
    }),
  });

  if (!startResp.ok) {
    const errData = await startResp.json().catch(() => ({}));
    throw new Error(
      (errData as { message?: string }).message || `HTTP ${startResp.status}`,
    );
  }

  const startData = await startResp.json();
  let raw: Record<string, unknown>;

  if (!startData.jobId) {
    raw = { ...startData, originalUrl: url };
  } else {
    const { jobId } = startData;
    const maxWait = 180_000;
    const pollInterval = 2500;
    const deadline = Date.now() + maxWait;
    let polled: Record<string, unknown> | null = null;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const pollResp = await fetch(`/api/scrape-job/${jobId}`);
      if (!pollResp.ok) {
        throw new Error(`Polling hatası: HTTP ${pollResp.status}`);
      }

      const pollData = await pollResp.json();
      if (pollData.status === "done") {
        const result = pollData.result as Record<string, unknown> | undefined;
        const canPreview =
          result?.success === true || result?.previewOk === true;
        if (!canPreview) {
          const msg = String(
            result?.deployUserMessage ||
              result?.message ||
              result?.error ||
              "Çekim başarısız",
          );
          const detail = result?.stageErrorsHuman
            ? ` — ${String(result.stageErrorsHuman)}`
            : "";
          throw new Error(`${msg}${detail}`);
        }
        polled = { ...result, originalUrl: url };
        break;
      }
      if (pollData.status === "error") {
        const msg = String(
          pollData.userMessage ||
            pollData.message ||
            pollData.code ||
            pollData.error ||
            "Scraping başarısız",
        );
        throw new ScrapeFetchError(msg, {
          reason: pollData.finalSuccessReason || pollData.code,
          userMessage: pollData.userMessage,
          stageErrors: pollData.stageErrors,
          stageErrorsHuman: pollData.stageErrorsHuman,
          finalSuccessReason: pollData.finalSuccessReason,
        });
      }
    }

    if (!polled) {
      throw new Error("Zaman aşımı — lütfen tekrar deneyin.");
    }
    raw = polled;
  }

  if (!raw?.title) {
    throw new Error("Ürün verisi alınamadı");
  }

  return normalizeScrapedPayload(raw, url);
}

export function buildCsvPreviewEntry(
  data: ScrapedUrlPayload,
  url: string,
  idPrefix = "csv",
) {
  const urlSlug = url.split("/").pop()?.split("?")[0] || `url-${Date.now()}`;
  return {
    id: `${idPrefix}-${urlSlug}-${Date.now()}`,
    productTitle: data.title,
    csvContent: data.csvContent || "",
    csvPreview: data.csvPreview,
    sourceUrl: url,
    usableForCsv: data.usableForCsv,
    csvInfo: data.csvInfo,
    variants: {
      colors: data.variants?.colors || [],
      sizes: data.variants?.sizes || [],
    },
    images: data.images,
    price: {
      original: data.price.original,
      withProfit: data.price.withProfit,
    },
    brand: data.brand,
    createdAt: new Date().toISOString(),
  };
}

/** localStorage'dan gelen eski önizlemeleri normalize et */
export function normalizeStoredCsvPreview(preview: Record<string, unknown>) {
  const rawPrice = preview.price;
  let price: { original: number; withProfit: number };
  if (typeof rawPrice === "number" && rawPrice > 0) {
    price = {
      original: rawPrice,
      withProfit: Math.round(rawPrice * 1.10 * 100) / 100,
    };
  } else if (rawPrice && typeof rawPrice === "object") {
    const p = rawPrice as { original?: number; withProfit?: number };
    price = {
      original: p.original ?? 0,
      withProfit: p.withProfit ?? Math.round((p.original ?? 0) * 1.15 * 100) / 100,
    };
  } else {
    price = { original: 0, withProfit: 0 };
  }

  const rawImages = Array.isArray(preview.images) ? preview.images : [];
  const csvContent = typeof preview.csvContent === "string" ? preview.csvContent : "";
  const images = prioritizeProductImagesForPreview(
    filterValidProductImages([
      ...rawImages
        .map((item) => resolveOriginalImageUrl(item) || (typeof item === "string" ? item : null))
        .filter((u): u is string => Boolean(u)),
      ...extractImagesFromCsv(csvContent),
    ]),
  );

  return { ...preview, price, images };
}

export function hasCsvPreviewData(input: {
  csvContent?: string;
  csvPreview?: { headers?: string[]; rows?: string[][] };
  csvInfo?: { ready?: boolean };
}): boolean {
  if (input.csvContent && input.csvContent.trim().length > 50) return true;
  if (input.csvPreview?.rows?.length) return true;
  if (input.csvInfo?.ready) return true;
  return false;
}
