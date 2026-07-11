import type { CanonicalProductForShopify } from "./variant-shape-normalizer";
import { buildCanonicalProductForShopify, validateCanonicalForShopifyUpload } from "./variant-shape-normalizer";
import { resolveUploadCsvContent } from "./shopify-csv-upload-validation";
import { evaluateShopifyExportGate } from "./shopify-export-gate";
import { isBlockedShopifyTag, sanitizeShopifyTags } from "@shared/shopify-tag-sanitizer";
import { deriveProductStockLabel, summarizeStockFromVariants } from "@shared/stock-status";

export type BulkUploadItemStatus =
  | "success"
  | "failed"
  | "unknown"
  | "already_exists";

export interface BulkUploadItemInput {
  clientItemId: string;
  sourceUrl?: string;
  productData?: Record<string, unknown>;
  canonicalProduct?: CanonicalProductForShopify;
  csvContent?: string;
  individualTags?: string[];
  idempotencyKey?: string;
  approvedForShopify?: boolean;
}

export interface BulkUploadItemResult {
  clientItemId: string;
  sourceUrl?: string;
  success: boolean;
  status: BulkUploadItemStatus;
  productId?: string;
  adminUrl?: string;
  mode?: "created" | "updated" | "skipped";
  verified?: boolean;
  shopifyStatus?: string;
  errorCode?: string;
  error?: string;
  requestId?: string;
}

export interface BulkUploadValidation {
  ok: boolean;
  errorCode?: string;
  error?: string;
  canonical?: CanonicalProductForShopify | null;
  csvContent?: string;
}

function extractPrice(productData?: Record<string, unknown>): number {
  const price = productData?.price;
  if (typeof price === "number") return price;
  if (price && typeof price === "object") {
    const p = price as { original?: number; withProfit?: number };
    return Number(p.withProfit ?? p.original ?? 0) || 0;
  }
  return 0;
}

function normalizeImages(productData?: Record<string, unknown>): unknown {
  return productData?.images ?? [];
}

export async function validateBulkUploadItem(
  item: BulkUploadItemInput,
): Promise<BulkUploadValidation> {
  const sourceUrl = String(
    item.sourceUrl ?? item.productData?.sourceUrl ?? item.productData?.originalUrl ?? "",
  ).trim();

  if (!sourceUrl) {
    return { ok: false, errorCode: "missing_source_url", error: "sourceUrl gerekli" };
  }

  let canonical =
    item.canonicalProduct ??
    (item.productData
      ? buildCanonicalProductForShopify({
          scrapeResult: item.productData,
          sourceUrl,
        })
      : null);

  if (!canonical?.sourceProductId) {
    return { ok: false, errorCode: "missing_source_product_id", error: "sourceProductId bulunamadı" };
  }

  const title = String(item.productData?.title ?? canonical.title ?? "").trim();
  if (title.length < 3) {
    return { ok: false, errorCode: "invalid_title", error: "Geçerli başlık yok" };
  }

  const priceOriginal = extractPrice(item.productData) || Number(canonical.price) || 0;
  if (priceOriginal <= 0) {
    return { ok: false, errorCode: "invalid_price", error: "Fiyat > 0 olmalı" };
  }

  const images = normalizeImages(item.productData);
  const gate = evaluateShopifyExportGate({
    title,
    scrapedTitle: title,
    priceOriginal,
    images,
    sourceUrl,
    titleSource: String(item.productData?.titleSource ?? ""),
    approvedForShopify: item.approvedForShopify,
  });
  if (!gate.allowed) {
    return { ok: false, errorCode: "export_gate_blocked", error: gate.reason ?? "Export engellendi" };
  }

  const allVariants = [
    ...(canonical.variants ?? []),
    ...(canonical.outOfStockVariants ?? []),
  ];
  if (allVariants.length === 0) {
    return { ok: false, errorCode: "no_variants", error: "Canonical varyant yok" };
  }

  const stockSummary = summarizeStockFromVariants(
    allVariants.map((v) => ({
      inStock: v.inStock,
      stockStatus:
        v.stockConfidence === "low" && !v.inStock
          ? "unknown"
          : v.inStock
            ? "in_stock"
            : "out_of_stock",
    })),
  );
  const stockLabel = deriveProductStockLabel(stockSummary);
  if (stockLabel === "unknown_stock" && item.approvedForShopify !== true) {
    return {
      ok: false,
      errorCode: "unknown_stock",
      error: "Stok bilinmeyen ürün otomatik yüklemeye dahil edilmez",
      canonical,
    };
  }

  const seenSku = new Set<string>();
  for (const v of allVariants) {
    if (seenSku.has(v.sku)) {
      return { ok: false, errorCode: "duplicate_sku", error: `Tekrarlayan SKU: ${v.sku}`, canonical };
    }
    seenSku.add(v.sku);
  }

  const resolvedCsv = await resolveUploadCsvContent(item.csvContent, item.productData, {
    sourceUrl,
    productTitle: title,
  });
  if (!resolvedCsv.ok) {
    return {
      ok: false,
      errorCode: resolvedCsv.step ?? "csv_missing",
      error: resolvedCsv.error ?? "CSV üretilemedi",
      canonical,
    };
  }

  const gateCanonical = validateCanonicalForShopifyUpload(canonical);
  if (!gateCanonical.ok && item.approvedForShopify !== true) {
    return {
      ok: false,
      errorCode: gateCanonical.step,
      error: gateCanonical.error,
      canonical,
    };
  }

  if (item.individualTags?.some((t) => isBlockedShopifyTag(t))) {
    return { ok: false, errorCode: "blocked_tag", error: "Yasaklı etiket içeriyor", canonical };
  }

  sanitizeShopifyTags(item.individualTags ?? []);

  return { ok: true, canonical, csvContent: resolvedCsv.csvContent };
}

export function classifyUploadHttpResult(
  httpStatus: number,
  body: Record<string, unknown>,
): { status: BulkUploadItemStatus; success: boolean; errorCode?: string; error?: string } {
  if (httpStatus >= 200 && httpStatus < 300 && body.success === true) {
    return { status: "success", success: true };
  }

  const errorCode = String(body.errorCode ?? body.step ?? body.code ?? "");
  const error = String(body.error ?? body.message ?? `HTTP ${httpStatus}`);

  if (httpStatus === 409) {
    if (errorCode === "duplicate_product" || errorCode === "already_applied") {
      return { status: "already_exists", success: true, errorCode, error };
    }
    return { status: "failed", success: false, errorCode: errorCode || "conflict", error };
  }

  if (httpStatus === 408 || errorCode === "timeout") {
    return { status: "unknown", success: false, errorCode: "timeout", error };
  }

  return { status: "failed", success: false, errorCode, error };
}
