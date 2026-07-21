import { upsertProductFromSource, type UpsertResult } from "./shopify-upsert-service";
import {
  classifyUploadHttpResult,
  validateBulkUploadItem,
  type BulkUploadItemInput,
  type BulkUploadItemResult,
} from "./bulk-upload-validator";
import { findExistingShopifyProduct } from "./shopify-upsert-service";
import { applyTagsToShopifyCsv } from "@shared/shopify-csv-tags";
import type { CanonicalProductForShopify } from "./variant-shape-normalizer";

const DEFAULT_CONCURRENCY = 1;

function extractTrackingPrice(
  item: BulkUploadItemInput,
  canonical: CanonicalProductForShopify,
): number {
  const price = item.productData?.price;
  if (typeof price === "number" && price > 0) return price;
  if (price && typeof price === "object") {
    const p = price as { original?: number; withProfit?: number };
    const candidate = Number(p.original ?? p.withProfit ?? 0);
    if (candidate > 0) return candidate;
  }
  const fromCanonical = Number(canonical.price);
  return Number.isFinite(fromCanonical) && fromCanonical > 0 ? fromCanonical : 0;
}

async function registerBulkUploadTracking(
  item: BulkUploadItemInput,
  canonical: CanonicalProductForShopify,
  upsert: UpsertResult,
): Promise<void> {
  const sourceUrl = String(item.sourceUrl ?? canonical.sourceUrl ?? "").trim();
  if (!sourceUrl || !upsert.productId) return;

  const price = extractTrackingPrice(item, canonical);
  if (price <= 0) return;

  try {
    const { getTrackingSettings } = await import("./services/tracking-settings.service");
    const trackingSettings = await getTrackingSettings();
    if (!trackingSettings.trackingEnabled) return;

    const { trackingService } = await import("./services/tracking.service");
    const mappingBySku = new Map((upsert.variantMappings || []).map((m) => [m.sku, m]));

    await trackingService.registerFromShopifyUpload({
      sourceUrl,
      title: canonical.title,
      price,
      shopifyProductId: upsert.productId,
      shopifyHandle: upsert.handle,
      shopifyProductGid: upsert.productGid,
      variants: canonical.variants.map((v) => {
        const mapped = mappingBySku.get(v.sku);
        return {
          option1Name: v.option1Name,
          option1Value: v.option1Value,
          option2Name: v.option2Name,
          option2Value: v.option2Value,
          sku: v.sku ?? undefined,
          shopifyVariantId: mapped?.shopifyVariantId,
          price: Number(v.price) || price,
          inStock: v.inStock !== false,
        };
      }),
    });

    try {
      const { urlTrackingService } = await import("./url-tracking-service");
      await urlTrackingService.enableTracking(sourceUrl, upsert.productId);
    } catch {
      /* legacy url_tracking — v2 kaydı yeterli */
    }

    const { db } = await import("./db");
    const { shopifyTransferredProducts } = await import("@shared/schema");
    await db
      .insert(shopifyTransferredProducts)
      .values({
        sourceUrl,
        shopifyProductId: upsert.productId,
        shopifyHandle: upsert.handle ?? "",
        title: canonical.title,
        brand: canonical.brand ?? "",
        shopifyPrice: String(price),
        originalPrice: String(price),
        variantCount: canonical.variants.length || 1,
        imageCount: canonical.images.length,
        trackingEnabled: true,
        currentStatus: "active",
      })
      .onConflictDoUpdate({
        target: shopifyTransferredProducts.sourceUrl,
        set: {
          shopifyProductId: upsert.productId,
          title: canonical.title,
          variantCount: canonical.variants.length || 1,
          imageCount: canonical.images.length,
          trackingEnabled: true,
          currentStatus: "active",
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.warn("[BulkUpload] Takip kaydı atlandı:", err);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function verifyAndActivateShopifyProduct(productId: string): Promise<{
  verified: boolean;
  shopifyStatus?: string;
}> {
  const { shopifyAdminFetch, parseShopifyAdminResponse } = await import("./shopify-token-manager");

  let lastStatus: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { response } = await shopifyAdminFetch(`/products/${productId}.json`);
      if (response.ok) {
        const data = (await parseShopifyAdminResponse(response)) as {
          product?: { status?: string };
        };
        let status = data.product?.status ?? "unknown";
        lastStatus = status;

        if (status !== "active") {
          const activate = await shopifyAdminFetch(`/products/${productId}.json`, {
            method: "PUT",
            body: JSON.stringify({ product: { id: productId, status: "active" } }),
          });
          if (activate.response.ok) status = "active";
        }
        if (status === "active") return { verified: true, shopifyStatus: status };
      }
    } catch {
      // Yeni oluşturulan ürün kısa süre görünmeyebilir veya doğrulama isteği geçici kesilebilir.
    }
    if (attempt < 3) await sleep(500 * attempt);
  }

  return { verified: false, shopifyStatus: lastStatus };
}

function buildAdminProductUrl(productId: string): string | undefined {
  const domain =
    process.env.SHOPIFY_SHOP_DOMAIN?.trim() ||
    process.env.SHOPIFY_STORE_DOMAIN?.trim() ||
    "";
  if (!domain) return undefined;
  const host = domain.includes(".myshopify.com") ? domain : `${domain}.myshopify.com`;
  return `https://${host}/admin/products/${productId}`;
}

async function uploadSingleItem(
  item: BulkUploadItemInput,
  requestId: string,
): Promise<BulkUploadItemResult> {
  const base: BulkUploadItemResult = {
    clientItemId: item.clientItemId,
    sourceUrl: item.sourceUrl,
    success: false,
    status: "failed",
    requestId,
  };

  const validation = await validateBulkUploadItem(item);
  if (!validation.ok || !validation.canonical || !validation.csvContent) {
    return {
      ...base,
      status: "failed",
      errorCode: validation.errorCode,
      error: validation.error,
    };
  }

  const canonical = validation.canonical;
  let csvContent = validation.csvContent;

  if (item.individualTags?.length) {
    // İstemci etiketi daha önce eklemiş olsa bile yardımcı fonksiyon tekrar eklemez.
    // Regex ile CSV değiştirmek virgüllü/quoted hücrelerde kolonları bozuyordu.
    csvContent = applyTagsToShopifyCsv(csvContent, item.individualTags);
  }

  let attempt = 0;
  const maxAttempts = 3;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const upsert = await upsertProductFromSource(csvContent, canonical);
      if (upsert.success) {
        if (upsert.mode !== "skipped" && upsert.productId) {
          setImmediate(() => {
            registerBulkUploadTracking(item, canonical, upsert).catch((err) => {
              console.warn("[BulkUpload] Arka plan takip kaydı atlandı:", err);
            });
          });
        }

        let verified = false;
        let shopifyStatus: string | undefined;
        if (upsert.productId) {
          const check = await verifyAndActivateShopifyProduct(upsert.productId);
          verified = check.verified;
          shopifyStatus = check.shopifyStatus;
        }

        const adminUrl = upsert.productId ? buildAdminProductUrl(upsert.productId) : undefined;

        if (upsert.productId && !verified) {
          return {
            ...base,
            success: false,
            status: "failed",
            productId: upsert.productId,
            adminUrl,
            mode: upsert.mode,
            verified: false,
            shopifyStatus,
            errorCode: "shopify_verify_failed",
            error: "Shopify'da ürün doğrulanamadı — admin panelini kontrol edin",
          };
        }

        return {
          ...base,
          success: true,
          status: upsert.mode === "skipped" ? "already_exists" : "success",
          productId: upsert.productId,
          adminUrl,
          mode: upsert.mode,
          verified,
          shopifyStatus,
        };
      }

      if (upsert.httpStatus === 429 && attempt < maxAttempts) {
        await sleep(2000 * attempt);
        continue;
      }

      if (upsert.httpStatus && upsert.httpStatus >= 500 && attempt < maxAttempts) {
        await sleep(1500 * attempt);
        continue;
      }

      const classified = classifyUploadHttpResult(upsert.httpStatus ?? 422, {
        success: false,
        error: upsert.message,
        errorCode: upsert.httpStatus === 409 ? "job_locked" : undefined,
      });

      if (classified.status === "unknown" && item.idempotencyKey) {
        const existing = await findExistingShopifyProduct({
          sourceProductId: canonical.sourceProductId,
          handle: canonical.handle,
        });
        if (existing?.id) {
          const adminUrl = buildAdminProductUrl(existing.id);
          return {
            ...base,
            success: true,
            status: "already_exists",
            productId: existing.id,
            adminUrl,
            mode: "updated",
            verified: true,
          };
        }
      }

      return {
        ...base,
        status: classified.status,
        success: classified.success,
        errorCode: classified.errorCode,
        error: classified.error ?? upsert.message,
      };
    } catch (err) {
      if (attempt >= maxAttempts) {
        return {
          ...base,
          status: "unknown",
          errorCode: "upload_exception",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      await sleep(1000 * attempt);
    }
  }

  return { ...base, status: "unknown", errorCode: "max_retries", error: "Yükleme denemeleri tükendi" };
}

export async function executeBulkShopifyUpload(
  items: BulkUploadItemInput[],
  opts?: { requestId?: string; concurrency?: number },
): Promise<{
  success: boolean;
  total: number;
  successCount: number;
  failureCount: number;
  unknownCount: number;
  results: BulkUploadItemResult[];
}> {
  const requestId = opts?.requestId ?? `bulk-${Date.now()}`;
  const concurrency = Math.min(Math.max(opts?.concurrency ?? DEFAULT_CONCURRENCY, 1), 2);
  const results: BulkUploadItemResult[] = new Array(items.length);

  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await uploadSingleItem(items[idx], requestId);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const successCount = results.filter((r) => r.success && r.status === "success").length;
  const alreadyExists = results.filter((r) => r.success && r.status === "already_exists").length;
  const failureCount = results.filter((r) => r.status === "failed").length;
  const unknownCount = results.filter((r) => r.status === "unknown").length;

  return {
    success: failureCount === 0 && unknownCount === 0,
    total: items.length,
    successCount: successCount + alreadyExists,
    failureCount,
    unknownCount,
    results,
  };
}
