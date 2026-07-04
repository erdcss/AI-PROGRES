import { upsertProductFromSource } from "./shopify-upsert-service";
import {
  classifyUploadHttpResult,
  validateBulkUploadItem,
  type BulkUploadItemInput,
  type BulkUploadItemResult,
} from "./bulk-upload-validator";
import { findExistingShopifyProduct } from "./shopify-upsert-service";
import { sanitizeShopifyTags } from "@shared/shopify-tag-sanitizer";

const DEFAULT_CONCURRENCY = 1;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
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
    const tags = sanitizeShopifyTags(item.individualTags).join(", ");
    if (tags) {
      csvContent = csvContent.replace(
        /("Tags",[^,\n]*?,)([^,\n]*)/i,
        (_, prefix, _val) => `${prefix}"${tags}"`,
      );
    }
  }

  let attempt = 0;
  const maxAttempts = 3;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const upsert = await upsertProductFromSource(csvContent, canonical);
      if (upsert.success) {
        return {
          ...base,
          success: true,
          status: upsert.mode === "skipped" ? "already_exists" : "success",
          productId: upsert.productId,
          adminUrl: upsert.productId
            ? `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/products/${upsert.productId}`
            : undefined,
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
          return {
            ...base,
            success: true,
            status: "already_exists",
            productId: existing.id,
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
