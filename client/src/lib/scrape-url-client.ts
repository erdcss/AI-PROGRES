import { normalizeTrendyolDisplayPrice } from "@/utils/price-utils";
import { extractImagesFromCsv, resolveOriginalImageUrl } from "@/lib/product-image-url";
import { mergeCanonicalPreviewVariants } from "@/lib/preview-variants";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";
import { deriveProductStockLabel, summarizeStockFromVariants } from "@shared/stock-status";
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
      image?: string;
      images?: string[];
      sourceProductId?: string;
      sourceUrl?: string;
      listingId?: string;
      price?: string | number;
      stockCount?: number | null;
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
  colorFamilyStatus?: {
    attempted: boolean;
    crawlAttempted?: boolean;
    applicable: boolean;
    state: "success" | "partial" | "failed" | "not_applicable";
    candidateCount: number;
    fetchedMemberCount: number;
    failedMemberCount: number;
    colorCount: number;
    variantCount: number;
    imageCount: number;
    galleriesWithImages: number;
    expectedGalleryCount: number;
    variantsWithImage: number;
    aliasesCount: number;
    rootProductId?: string;
    familySourceKey?: string;
    colors: string[];
    sourceAliases: string[];
    failedMembers: Array<{
      productId?: string;
      url?: string;
      error?: string;
    }>;
    message: string;
  };
  colorFamily?: {
    familyId?: string;
    familySourceKey?: string;
    rootProductId?: string;
    rootUrl?: string;
    colors?: string[];
    imagesByColor?: Record<string, string[]>;
    sourceAliases?: string[];
    members?: Array<{
      productId: string;
      url: string;
      color: string;
      images: string[];
      ok: boolean;
      error?: string;
    }>;
  };
  imagesByColor?: Record<string, string[]>;
  sourceAliases?: string[];
  familySourceKey?: string;
  canonicalProduct?: {
    sourceKey: string;
    sourceProductId: string;
    variants: Array<{
      color: string;
      size: string;
      inStock: boolean;
      inventoryQty?: number;
    }>;
    outOfStockVariants?: Array<{
      color: string;
      size: string;
      inStock: boolean;
      inventoryQty?: number;
    }>;
    stockSummary?: {
      totalVariants: number;
      inStockVariants: number;
      outOfStockVariants: number;
    };
    manualReviewRequired?: boolean;
    shopifyUploadBlocked?: boolean;
    blockReason?: string;
  };
  scrapeRunId?: string;
  variantBlockReason?: string;
  variantExtractionFailed?: boolean;
  variantCollapseDetected?: boolean;
  variantCollapseMessage?: string;
  manualReviewRequired?: boolean;
  shopifyUploadBlocked?: boolean;
  urlProductId?: string | null;
  selectedSourceProductId?: string;
  createdAt?: string;
  stockSummary?: {
    totalVariants: number;
    inStockVariants: number;
    outOfStockVariants: number;
  };
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

  const canonicalProduct = raw.canonicalProduct as ScrapedUrlPayload["canonicalProduct"];
  const sourceTags = canonicalProduct?.sourceKey
    ? [canonicalProduct.sourceKey]
    : (raw.tags as string[]) || [];

  const canonicalPreviewRows = mergeCanonicalPreviewVariants(canonicalProduct);
  const variantSource = canonicalPreviewRows.length
    ? {
        colors: [...new Set(canonicalPreviewRows.map((v) => v.color).filter(Boolean))],
        sizes: [...new Set(canonicalPreviewRows.map((v) => v.size).filter(Boolean))],
        allVariants: canonicalPreviewRows.map((v) => ({
          color: v.color,
          size: v.size,
          inStock: v.inStock,
        })),
        items: canonicalPreviewRows,
      }
    : sanitizeTrendyolVariants(raw.variants, {
        productTitle: String(raw.title || "Ürün"),
        sourceUrl: url,
      });

  if (import.meta.env.DEV) {
    const sizes = [
      ...new Set(
        (variantSource.allVariants || [])
          .map((v) => v.size)
          .filter((s) => s && String(s).trim() !== ""),
      ),
    ];
    console.log(
      `[VARIANT_TRACE] ${JSON.stringify({
        requestId: raw.scrapeRunId ?? "client",
        stage: "client_received",
        sourceUrl: url.split("?")[0],
        productId: url.match(/p-(\d+)/)?.[1] ?? null,
        count: variantSource.allVariants?.length ?? 0,
        options: { sizes },
        variants: (variantSource.allVariants || []).slice(0, 50).map((v) => ({
          size: v.size,
          color: v.color,
          sku: "",
          inStock: v.inStock,
          quantity: null,
          source: "client_received",
        })),
      })}`,
    );
  }

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
    variants: variantSource,
    features: (raw.features as ScrapedUrlPayload["features"]) || [],
    stockAnalysis: raw.stockAnalysis as ScrapedUrlPayload["stockAnalysis"],
    stockSummary: canonicalProduct?.stockSummary ?? (raw.stockSummary as ScrapedUrlPayload["stockSummary"]),
    tags: sourceTags,
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
    canonicalProduct,
    colorFamilyStatus: raw.colorFamilyStatus as ScrapedUrlPayload["colorFamilyStatus"],
    colorFamily: raw.colorFamily as ScrapedUrlPayload["colorFamily"],
    imagesByColor:
      raw.imagesByColor && typeof raw.imagesByColor === "object"
        ? (raw.imagesByColor as Record<string, string[]>)
        : undefined,
    sourceAliases: Array.isArray(raw.sourceAliases)
      ? (raw.sourceAliases as string[]).filter((s) => typeof s === "string")
      : undefined,
    familySourceKey:
      typeof raw.familySourceKey === "string" ? raw.familySourceKey : undefined,
    scrapeRunId: raw.scrapeRunId ? String(raw.scrapeRunId) : undefined,
    variantBlockReason: raw.variantBlockReason ? String(raw.variantBlockReason) : undefined,
    variantExtractionFailed: raw.variantExtractionFailed === true,
    variantCollapseDetected: raw.variantCollapseDetected === true,
    variantCollapseMessage: raw.variantCollapseMessage
      ? String(raw.variantCollapseMessage)
      : undefined,
    manualReviewRequired: raw.manualReviewRequired === true,
    shopifyUploadBlocked: raw.shopifyUploadBlocked === true,
    urlProductId: raw.urlProductId != null ? String(raw.urlProductId) : undefined,
    selectedSourceProductId:
      raw.selectedSourceProductId != null ? String(raw.selectedSourceProductId) : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
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
    let globalTimeoutMs = 180_000;
    try {
      const capResp = await fetch("/api/runtime/scrape-capabilities", { cache: "no-store" });
      if (capResp.ok) {
        const caps = await capResp.json();
        if (typeof caps.globalTimeoutMs === "number") globalTimeoutMs = caps.globalTimeoutMs;
      }
    } catch {
      /* use default */
    }
    const maxWait = Math.max(globalTimeoutMs + 45_000, 240_000);
    const pollInterval = 2500;
    const deadline = Date.now() + maxWait;
    let polled: Record<string, unknown> | null = null;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const pollResp = await fetch(`/api/scrape-job/${jobId}`, { cache: "no-store" });
      if (pollResp.status === 404) {
        throw new Error("job not found; server may have restarted");
      }
      if (!pollResp.ok) {
        throw new Error(`Polling hatası: HTTP ${pollResp.status}`);
      }

      const pollData = await pollResp.json();
      if (pollData.status === "success" || pollData.status === "partial_success") {
        const result = pollData.result as Record<string, unknown> | undefined;
        const canPreview =
          result?.success === true ||
          result?.previewOk === true ||
          pollData.status === "partial_success";
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
        polled = { ...result, originalUrl: url, partialSuccess: pollData.status === "partial_success" };
        break;
      }
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
          throw new Error(msg);
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
      throw new Error(
        `Çekim zaman aşımı (${Math.round(maxWait / 1000)}s) — job tamamlanmadı. Railway scrape provider ayarlarını kontrol edin.`,
      );
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
  const canonicalPreviewRows = mergeCanonicalPreviewVariants(data.canonicalProduct);
  const sanitizedVariants = canonicalPreviewRows.length
    ? sanitizeTrendyolVariants(
        {
          colors: [...new Set(canonicalPreviewRows.map((v) => v.color).filter(Boolean))],
          sizes: [...new Set(canonicalPreviewRows.map((v) => v.size).filter(Boolean))],
          allVariants: canonicalPreviewRows,
          items: canonicalPreviewRows,
        },
        { productTitle: data.title, sourceUrl: url },
      )
    : sanitizeTrendyolVariants(data.variants, {
        productTitle: data.title,
        sourceUrl: url,
      });
  const hasCsv = (data.csvContent || "").trim().length > 50;
  const baseCsvInfo = data.csvInfo;
  const csvInfo = baseCsvInfo
    ? {
        ...baseCsvInfo,
        ready: baseCsvInfo.ready === true || hasCsv,
        productCount: Math.max(baseCsvInfo.productCount ?? 0, hasCsv ? 1 : 0),
      }
    : hasCsv
      ? {
          filename: "shopify-urunler.csv",
          downloadUrl: "/api/download/shopify-urunler.csv",
          ready: true,
          productCount: 1,
        }
      : undefined;
  const stockSummary = canonicalPreviewRows.length
    ? summarizeStockFromVariants(
        canonicalPreviewRows.map((v) => ({
          inStock: v.inStock,
          stockStatus: v.inStock ? "in_stock" : "out_of_stock",
        })),
      )
    : undefined;
  const stockLabel = stockSummary ? deriveProductStockLabel(stockSummary) : undefined;

  return {
    id: `${idPrefix}-${urlSlug}-${Date.now()}`,
    productTitle: data.title,
    csvContent: data.csvContent || "",
    csvPreview: data.csvPreview,
    sourceUrl: url,
    scrapeRunId: data.scrapeRunId,
    canonicalProduct: data.canonicalProduct,
    stockSummary,
    stockLabel,
    stockAnalysis: data.stockAnalysis,
    manualReviewRequired: data.canonicalProduct?.manualReviewRequired,
    shopifyUploadBlocked: data.canonicalProduct?.shopifyUploadBlocked,
    blockReason:
      (data as Record<string, unknown>).variantBlockReason as string | undefined ||
      data.canonicalProduct?.blockReason,
    sourceProductId: data.canonicalProduct?.sourceProductId,
    usableForCsv: data.usableForCsv,
    csvInfo,
    titleSource: data.titleSource,
    variants: {
      colors: sanitizedVariants.colors,
      sizes: sanitizedVariants.sizes,
      allVariants: sanitizedVariants.allVariants,
      items: canonicalPreviewRows,
    },
    images: data.images,
    price: {
      original: data.price.original,
      withProfit: data.price.withProfit,
    },
    brand: data.brand,
    createdAt: new Date().toISOString(),
    approvedForShopify: true,
    colorFamilyStatus: data.colorFamilyStatus,
    colorFamily: data.colorFamily,
    imagesByColor: data.imagesByColor,
    sourceAliases: data.sourceAliases,
    familySourceKey: data.familySourceKey,
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
