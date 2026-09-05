import { eq } from "drizzle-orm";
import { db } from "../../db";
import { trackedProducts } from "@shared/schema";
import { MARKTGO_FIXED_STOCK } from "@shared/integration-provider";
import { redactSecrets } from "../../lib/secret-crypto";
import { MarktGoApiError } from "./errors";
import { getMarktGoClientForConnection } from "./connection.service";
import {
  findProductMapping,
  idempotencyKeyForProduct,
  listVariantMappings,
  stableExternalId,
  upsertProductMapping,
  upsertVariantMapping,
  deleteProductMapping,
} from "./mapping.service";
import { extractId, normalizeMarktGoProduct } from "./normalize";
import type { ImportedReviewInput, LocalProductInput, SyncProgress } from "./types";
import { prepareMarktGoImages } from "./images";
import { scrapeTrendyolReviewsWithBrowserWorker } from "../browser-worker-client.service";

const STEP_LABEL: Record<string, string> = {
  product_create: "Ürün oluşturuluyor",
  product_lookup: "Mevcut ürün bulunuyor",
  images: "Görseller aktarılıyor",
  variants: "Varyantlar oluşturuluyor",
  variant_images: "Varyant görselleri bağlanıyor",
  inventory: "Stok senkronize ediliyor",
  pricing: "Fiyat kontrol ediliyor",
  reviews: "Ürün yorumları aktarılıyor",
  done: "Tamamlandı",
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function intStock(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function skusFromProductPayload(payload: unknown): Array<Record<string, unknown>> {
  const root = asObj(payload);
  const product = asObj(root.data || root.product || root);
  const variants = product.variants;
  if (Array.isArray(variants)) return variants.map((row) => asObj(row));
  const boxed = asObj(variants);
  if (Array.isArray(boxed.skus)) return boxed.skus.map((row) => asObj(row));
  return [];
}

function buildInlineVariants(input: LocalProductInput) {
  const rows = input.variants || [];
  if (!rows.length) return undefined;
  const prefix = stableExternalId(String(input.localProductId)).slice(0, 48);
  const colors = [...new Set(rows.map((v) => String(v.option1 || "").trim()).filter(Boolean))];
  const sizes = [...new Set(rows.map((v) => String(v.option2 || "").trim()).filter(Boolean))];
  const options: Array<{ id: string; name: string; values: string[] }> = [];
  if (colors.length) options.push({ id: "opt1", name: "Renk", values: colors });
  if (sizes.length) options.push({ id: "opt2", name: "Beden", values: sizes });
  if (!options.length) {
    options.push({
      id: "opt1",
      name: "Varyant",
      values: rows.map((v, i) => String(v.localVariantId || i + 1)),
    });
  }
  const skus = rows.map((v, i) => {
    const stock = intStock(v.stock, MARKTGO_FIXED_STOCK);
    return {
      id: `${prefix}-v${i + 1}`.slice(0, 80),
      option1: v.option1 || null,
      option2: v.option2 || null,
      option3: null,
      stock,
      available: stock > 0,
      ...(v.imageUrl && /^https?:\/\//i.test(v.imageUrl) ? { imageUrl: v.imageUrl } : {}),
    };
  });
  return { options, skus };
}

function isDuplicateProductError(err: unknown): boolean {
  if (!(err instanceof MarktGoApiError)) return false;
  return err.code === "duplicate" || err.status === 409;
}

function isDuplicateVariantError(err: unknown): boolean {
  return err instanceof MarktGoApiError && err.code === "duplicate_variant";
}

function normalizeReviewDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ""
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeReviewImages(raw: Record<string, unknown>): string[] {
  const values: unknown[] = [];
  for (const key of ["mediaFiles", "images", "imageUrls", "photos"]) {
    const candidate = raw[key];
    if (Array.isArray(candidate)) values.push(...candidate);
  }
  const out = values
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const row = asObj(item);
      return String(row.url || row.imageUrl || row.path || "").trim();
    })
    .filter((url) => /^https?:\/\//i.test(url));
  return [...new Set(out)];
}

function sanitizeProvidedReviews(reviews: ImportedReviewInput[] | undefined): ImportedReviewInput[] {
  if (!Array.isArray(reviews)) return [];
  const seen = new Set<string>();
  const normalized: ImportedReviewInput[] = [];
  reviews.forEach((review, index) => {
    const rating = Math.round(Number(review?.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
    const externalReviewId = String(review.externalReviewId || `local-${index + 1}`).trim();
    if (seen.has(externalReviewId)) return;
    seen.add(externalReviewId);
    const normalizedDate = normalizeReviewDate(review.createdAt);
    normalized.push({
      externalReviewId,
      rating,
      ...(review.comment ? { comment: String(review.comment) } : {}),
      ...(review.reviewerName ? { reviewerName: String(review.reviewerName) } : {}),
      ...(normalizedDate ? { createdAt: normalizedDate } : {}),
      images: Array.isArray(review.images)
        ? [...new Set(review.images.map(String).filter((url) => /^https?:\/\//i.test(url)))]
        : [],
      approved: review.approved !== false,
    });
  });
  return normalized;
}

function reviewCountHint(input: LocalProductInput, summary?: Record<string, unknown> | null): number {
  const candidates = [
    input.expectedReviewCount,
    summary?.totalElements,
    summary?.total,
    summary?.reviewCount,
    summary?.totalReviewCount,
    summary?.ratingCount,
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

async function resolveProductReviews(input: LocalProductInput): Promise<{
  reviews: ImportedReviewInput[];
  attempted: boolean;
  expectedCount: number;
  source: "provided" | "browser_worker" | "none";
  error?: string;
}> {
  const provided = sanitizeProvidedReviews(input.reviews);
  if (provided.length > 0) {
    return {
      reviews: provided,
      attempted: true,
      expectedCount: Math.max(reviewCountHint(input), provided.length),
      source: "provided",
    };
  }

  const sourceUrl = String(input.sourceUrl || "").trim();
  if (!/trendyol\.com/i.test(sourceUrl) || !/[/-]p-\d+/i.test(sourceUrl)) {
    return {
      reviews: [],
      attempted: Array.isArray(input.reviews),
      expectedCount: reviewCountHint(input),
      source: "none",
    };
  }

  const productId = (sourceUrl.match(/[/-]p-(\d+)/i) || [])[1] || "";
  try {
    const result = await scrapeTrendyolReviewsWithBrowserWorker({
      url: sourceUrl,
      productId,
      pageSize: 50,
      maxPages: 500,
      timeoutMs: 180_000,
    });
    if (!result.success) {
      return {
        reviews: [],
        attempted: true,
        expectedCount: reviewCountHint(input),
        source: "browser_worker",
        error: result.error || "Trendyol yorumları çekilemedi",
      };
    }

    const seen = new Set<string>();
    const reviews: ImportedReviewInput[] = [];
    result.reviews.forEach((item, index) => {
      const raw = asObj(item);
      const rating = Math.round(Number(raw.rate ?? raw.starCount ?? raw.rating ?? 0));
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
      const sourceId = String(raw.id ?? raw.reviewId ?? `${productId}-${index + 1}`).trim();
      const externalReviewId = `trendyol:${sourceId}`;
      if (seen.has(externalReviewId)) return;
      seen.add(externalReviewId);
      const createdAt = normalizeReviewDate(
        raw.createdAt ?? raw.createdDate ?? raw.lastModifiedAt ?? raw.lastModifiedDate,
      );
      const comment = String(raw.comment ?? raw.reviewText ?? raw.commentText ?? raw.body ?? "").trim();
      const reviewerName = String(raw.userFullName ?? raw.userName ?? raw.reviewerName ?? "Anonim").trim();
      reviews.push({
        externalReviewId,
        rating,
        ...(comment ? { comment } : {}),
        ...(reviewerName ? { reviewerName } : {}),
        ...(createdAt ? { createdAt } : {}),
        images: normalizeReviewImages(raw),
        approved: true,
      });
    });

    const expectedCount = reviewCountHint(input, result.summary);
    if (reviews.length === 0 && expectedCount > 0) {
      return {
        reviews: [],
        attempted: true,
        expectedCount,
        source: "browser_worker",
        error: `Trendyol ${expectedCount} değerlendirme bildiriyor fakat 0 gerçek yorum kaydı çekildi`,
      };
    }

    return {
      reviews,
      attempted: true,
      expectedCount: Math.max(expectedCount, reviews.length),
      source: "browser_worker",
    };
  } catch (err) {
    return {
      reviews: [],
      attempted: true,
      expectedCount: reviewCountHint(input),
      source: "browser_worker",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

type ReviewSyncResponse = {
  productId?: number | string;
  inserted?: number;
  skipped?: number;
  updated?: number;
  total?: number;
  reviews?: unknown[];
};

async function getRemoteReviewCount(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
  externalProductId: string,
): Promise<number> {
  const raw = await client.get<unknown>(`/products/${externalProductId}/reviews`);
  const root = asObj(raw);
  if (Array.isArray(root.reviews)) return root.reviews.length;
  if (Array.isArray(root.items)) return root.items.length;
  if (Array.isArray(raw)) return raw.length;
  const total = Number(root.total);
  return Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0;
}

async function syncReviewsToExistingProduct(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
  externalProductId: string,
  reviews: ImportedReviewInput[],
): Promise<{ sent: number; remoteCount: number }> {
  if (!reviews.length) {
    const remoteCount = await getRemoteReviewCount(client, externalProductId).catch(() => 0);
    return { sent: 0, remoteCount };
  }
  await client.post<ReviewSyncResponse>(`/products/${externalProductId}/reviews`, { reviews });
  const remoteCount = await getRemoteReviewCount(client, externalProductId);
  if (remoteCount < reviews.length) {
    throw new Error(`Turmarkt yorum doğrulaması başarısız: gönderilen=${reviews.length}, kayıtlı=${remoteCount}`);
  }
  return { sent: reviews.length, remoteCount };
}

async function lookupByExternalId(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
  externalId: string,
): Promise<string | null> {
  try {
    const raw = await client.get<unknown>(
      `/products/by-external-id/${encodeURIComponent(externalId)}`,
    );
    return extractId(raw);
  } catch (err) {
    if (err instanceof MarktGoApiError && err.status === 404) return null;
    throw err;
  }
}

async function verifyRemoteProductExists(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
  externalProductId: string,
): Promise<boolean> {
  try {
    await client.get<unknown>(`/products/${externalProductId}`);
    return true;
  } catch (err) {
    if (err instanceof MarktGoApiError && err.status === 404) return false;
    throw err;
  }
}

export async function fetchNormalizedMarktGoProduct(externalProductId: string, connectionId?: number) {
  const { client } = await getMarktGoClientForConnection(connectionId);
  const raw = await client.get<unknown>(`/products/${externalProductId}`);
  return normalizeMarktGoProduct(raw);
}

export async function syncProductToMarktGo(input: LocalProductInput, connectionId?: number) {
  const { client, connection } = await getMarktGoClientForConnection(connectionId);
  const steps: SyncProgress[] = [];
  const failed: string[] = [];
  const localProductId = String(input.localProductId);
  const externalId = stableExternalId(localProductId);
  const images = await prepareMarktGoImages(input.images || [], 12);
  const brand = input.brand ? String(input.brand).trim() : "";
  const reviewResolution = await resolveProductReviews(input);
  const reviews = reviewResolution.reviews;
  if (reviewResolution.error) failed.push("reviews");

  let mapping = await findProductMapping({
    connectionId: connection.id,
    localProductId,
    externalId,
    trackedProductId: input.trackedProductId || undefined,
  });

  let externalProductId = mapping?.externalProductId || null;
  let createdPayload: unknown = null;

  if (externalProductId) {
    const stillOnRemote = await verifyRemoteProductExists(client, externalProductId);
    if (stillOnRemote) {
      let remoteReviewCount = 0;
      if (!reviewResolution.error) {
        try {
          const reviewSync = await syncReviewsToExistingProduct(client, externalProductId, reviews);
          remoteReviewCount = reviewSync.remoteCount;
        } catch (err) {
          reviewResolution.error = err instanceof Error ? err.message : String(err);
          if (!failed.includes("reviews")) failed.push("reviews");
        }
      }
      steps.push({
        step: "product_lookup",
        label: "Ürün zaten MARKT-GO'da",
        ok: true,
        detail: "aynı benzersiz ID — ürün yeniden oluşturulmadı",
      });
      if (reviewResolution.attempted) {
        steps.push({
          step: "reviews",
          label: STEP_LABEL.reviews,
          ok: !reviewResolution.error,
          detail: reviewResolution.error || `${reviews.length} gönderildi / ${remoteReviewCount} kayıtlı`,
        });
      }
      const existingStatus = reviewResolution.error ? "partial_sync" : "already_exists";
      mapping = await upsertProductMapping({
        connectionId: connection.id,
        localProductId,
        externalProductId,
        externalId,
        trackedProductId: input.trackedProductId || mapping?.trackedProductId || undefined,
        status: existingStatus,
        lastError: reviewResolution.error || null,
        failedSteps: reviewResolution.error ? ["reviews"] : [],
      });
      return {
        success: true,
        status: existingStatus,
        skipped: true,
        provider: "marktgo" as const,
        connectionId: connection.id,
        externalProductId,
        externalId,
        mappingId: mapping.id,
        categoryUnresolved: false,
        reviewCount: reviews.length,
        remoteReviewCount,
        reviewsSynced: !reviewResolution.error,
        reviewSource: reviewResolution.source,
        expectedReviewCount: reviewResolution.expectedCount,
        steps,
        failedSteps: reviewResolution.error ? ["reviews"] : [],
        message: redactSecrets(
          reviewResolution.error
            ? `Ürün mevcut; yorum senkronu başarısız: ${reviewResolution.error}`
            : `Ürün zaten MARKT-GO'da — ${reviews.length} yorum senkronize edildi`,
        ),
      };
    }
    if (mapping) {
      await deleteProductMapping(mapping.id);
      mapping = null;
    }
    externalProductId = null;
  }

  if (!externalProductId && !mapping) {
    const linkedId = await lookupByExternalId(client, externalId);
    if (linkedId && (await verifyRemoteProductExists(client, linkedId))) {
      externalProductId = linkedId;
      let remoteReviewCount = 0;
      if (!reviewResolution.error) {
        try {
          const reviewSync = await syncReviewsToExistingProduct(client, externalProductId, reviews);
          remoteReviewCount = reviewSync.remoteCount;
        } catch (err) {
          reviewResolution.error = err instanceof Error ? err.message : String(err);
          if (!failed.includes("reviews")) failed.push("reviews");
        }
      }
      steps.push({
        step: "product_lookup",
        label: "Ürün zaten MARKT-GO'da",
        ok: true,
        detail: "externalId ile eşleşti — ürün yeniden oluşturulmadı",
      });
      if (reviewResolution.attempted) {
        steps.push({
          step: "reviews",
          label: STEP_LABEL.reviews,
          ok: !reviewResolution.error,
          detail: reviewResolution.error || `${reviews.length} gönderildi / ${remoteReviewCount} kayıtlı`,
        });
      }
      const existingStatus = reviewResolution.error ? "partial_sync" : "already_exists";
      mapping = await upsertProductMapping({
        connectionId: connection.id,
        localProductId,
        externalProductId,
        externalId,
        trackedProductId: input.trackedProductId || undefined,
        status: existingStatus,
        lastError: reviewResolution.error || null,
        failedSteps: reviewResolution.error ? ["reviews"] : [],
      });
      return {
        success: true,
        status: existingStatus,
        skipped: true,
        provider: "marktgo" as const,
        connectionId: connection.id,
        externalProductId,
        externalId,
        mappingId: mapping.id,
        categoryUnresolved: false,
        reviewCount: reviews.length,
        remoteReviewCount,
        reviewsSynced: !reviewResolution.error,
        reviewSource: reviewResolution.source,
        expectedReviewCount: reviewResolution.expectedCount,
        steps,
        failedSteps: reviewResolution.error ? ["reviews"] : [],
        message: redactSecrets(
          reviewResolution.error
            ? `Ürün mevcut; yorum senkronu başarısız: ${reviewResolution.error}`
            : `Ürün zaten MARKT-GO'da — ${reviews.length} yorum senkronize edildi`,
        ),
      };
    }
    if (linkedId) externalProductId = null;
  }

  const buildProductBody = (withVariants: boolean): Record<string, unknown> => {
    const inline = withVariants ? buildInlineVariants(input) : undefined;
    return {
      name: input.title,
      description: input.description || "",
      ...(brand ? { brand } : {}),
      price: money(input.price),
      discountPrice: input.discountPrice != null ? money(input.discountPrice) : null,
      stock: intStock(input.stock, MARKTGO_FIXED_STOCK),
      images,
      tags: input.tags || [],
      status: "active" as const,
      externalId,
      sourceSite: "AI-PROGRES",
      ...(input.sourceUrl && /^https?:\/\//i.test(input.sourceUrl)
        ? { sourceUrl: input.sourceUrl }
        : {}),
      ...(!reviewResolution.error && reviewResolution.attempted && reviews.length ? { reviews } : {}),
      ...(inline ? { variants: inline } : {}),
    };
  };

  async function createRemote(withVariants: boolean) {
    return client.post<unknown>(
      "/products",
      buildProductBody(withVariants),
      idempotencyKeyForProduct(localProductId),
    );
  }

  if (externalProductId) {
    try {
      await client.patch(`/products/${externalProductId}`, {
        name: input.title,
        description: input.description || "",
        ...(brand ? { brand } : {}),
        images,
        sourceSite: "AI-PROGRES",
        ...(!reviewResolution.error && reviewResolution.attempted && reviews.length ? { reviews } : {}),
      });
      steps.push({ step: "product_create", label: "Ürün güncelleniyor", ok: true });
    } catch (err) {
      if (err instanceof MarktGoApiError && err.status === 404 && mapping) {
        await deleteProductMapping(mapping.id);
        externalProductId = null;
        mapping = null;
      } else {
        throw err;
      }
    }
  }

  if (!externalProductId) {
    try {
      createdPayload = await createRemote(true);
      externalProductId = extractId(createdPayload);
      steps.push({ step: "product_create", label: STEP_LABEL.product_create, ok: true });
    } catch (err) {
      if (isDuplicateVariantError(err)) {
        try {
          createdPayload = await createRemote(false);
          externalProductId = extractId(createdPayload);
          steps.push({
            step: "product_create",
            label: STEP_LABEL.product_create,
            ok: true,
            detail: "varyantlar atlanarak oluşturuldu",
          });
        } catch (retryErr) {
          if (isDuplicateProductError(retryErr)) {
            externalProductId = await lookupByExternalId(client, externalId);
            steps.push({
              step: "product_lookup",
              label: STEP_LABEL.product_lookup,
              ok: Boolean(externalProductId),
              detail: "mevcut ürün yeniden bağlandı",
            });
            if (!externalProductId) throw retryErr;
            if (!reviewResolution.error) {
              try {
                await syncReviewsToExistingProduct(client, externalProductId, reviews);
              } catch (reviewErr) {
                reviewResolution.error = reviewErr instanceof Error ? reviewErr.message : String(reviewErr);
                if (!failed.includes("reviews")) failed.push("reviews");
              }
            }
          } else {
            throw retryErr;
          }
        }
      } else if (isDuplicateProductError(err)) {
        externalProductId = await lookupByExternalId(client, externalId);
        steps.push({
          step: "product_lookup",
          label: STEP_LABEL.product_lookup,
          ok: Boolean(externalProductId),
          detail: "mevcut ürün yeniden bağlandı",
        });
        if (!externalProductId) throw err;
        if (!reviewResolution.error) {
          try {
            await syncReviewsToExistingProduct(client, externalProductId, reviews);
          } catch (reviewErr) {
            reviewResolution.error = reviewErr instanceof Error ? reviewErr.message : String(reviewErr);
            if (!failed.includes("reviews")) failed.push("reviews");
          }
        }
      } else {
        throw err;
      }
    }
  }

  if (!externalProductId) {
    throw new MarktGoApiError("MARKT-GO ürün ID alınamadı", 0, "no_id");
  }

  let remoteReviewCount = 0;
  if (!reviewResolution.error && reviewResolution.attempted && reviews.length > 0) {
    try {
      remoteReviewCount = await getRemoteReviewCount(client, externalProductId);
      if (remoteReviewCount < reviews.length) {
        reviewResolution.error = `Turmarkt yorum doğrulaması başarısız: gönderilen=${reviews.length}, kayıtlı=${remoteReviewCount}`;
        if (!failed.includes("reviews")) failed.push("reviews");
      }
    } catch (err) {
      reviewResolution.error = `Turmarkt yorum doğrulaması yapılamadı: ${err instanceof Error ? err.message : String(err)}`;
      if (!failed.includes("reviews")) failed.push("reviews");
    }
  }

  mapping = await upsertProductMapping({
    connectionId: connection.id,
    localProductId,
    externalProductId,
    externalId,
    trackedProductId: input.trackedProductId,
    status: "syncing",
  });

  steps.push({
    step: "images",
    label: STEP_LABEL.images,
    ok: true,
    detail: `${images.length} görsel`,
  });

  const createdSkus = skusFromProductPayload(createdPayload);
  const inputVariants = input.variants || [];
  let mappedCount = 0;
  if (createdPayload && inputVariants.length) {
    const jobs = inputVariants.map((v, i) => {
      const sku =
        createdSkus.find((row) => String(row.id) === String(v.localVariantId)) ||
        createdSkus.find(
          (row) =>
            String(row.option1 || "") === String(v.option1 || "") &&
            String(row.option2 || "") === String(v.option2 || ""),
        ) ||
        createdSkus[i];
      const vid = sku?.id != null ? String(sku.id) : null;
      if (!vid) return Promise.resolve(false);
      return upsertVariantMapping({
        productMappingId: mapping.id,
        localVariantId: v.localVariantId,
        externalVariantId: vid,
        option1: v.option1,
        option2: v.option2,
      }).then(() => true);
    });
    mappedCount = (await Promise.all(jobs)).filter(Boolean).length;
  } else if (!createdPayload) {
    mappedCount = inputVariants.length;
  }
  steps.push({
    step: "variants",
    label: STEP_LABEL.variants,
    ok: mappedCount === inputVariants.length || inputVariants.length === 0,
    detail: inputVariants.length ? `${mappedCount}/${inputVariants.length}` : "varyant yok",
  });
  if (inputVariants.length && mappedCount !== inputVariants.length) {
    failed.push("variants");
  }
  steps.push({
    step: "variant_images",
    label: STEP_LABEL.variant_images,
    ok: true,
  });
  steps.push({ step: "inventory", label: STEP_LABEL.inventory, ok: true });
  steps.push({ step: "pricing", label: STEP_LABEL.pricing, ok: true });
  if (reviewResolution.attempted) {
    steps.push({
      step: "reviews",
      label: STEP_LABEL.reviews,
      ok: !reviewResolution.error,
      detail: reviewResolution.error || `${reviews.length} gönderildi / ${remoteReviewCount || reviews.length} kayıtlı`,
    });
  }

  const status = failed.length ? "partial_sync" : "synced";
  let trackedProductId = input.trackedProductId ?? null;

  if (input.sourceUrl && status !== "partial_sync") {
    try {
      const { trackingService } = await import("../tracking.service");
      const sell = Number(input.discountPrice ?? input.price);
      if (Number.isFinite(sell) && sell > 0) {
        const tracked = await trackingService.registerFromDestinationUpload({
          sourceUrl: String(input.sourceUrl),
          title: input.title,
          price: sell,
          destinationProductId: externalProductId,
          variants: (input.variants || []).map((v) => ({
            color: v.option1,
            size: v.option2,
            sku: v.sku,
            price: v.price ?? undefined,
            inStock: Number(v.stock) > 0,
          })),
        });
        trackedProductId = tracked.id;
      }
    } catch (err) {
      console.warn(
        "[marktgo] tracking register skipped:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  mapping = await upsertProductMapping({
    connectionId: connection.id,
    localProductId,
    externalProductId,
    externalId,
    trackedProductId,
    status,
    lastError: failed.length ? failed.join(",") : null,
    failedSteps: failed,
  });

  if (trackedProductId) {
    try {
      await db
        .update(trackedProducts)
        .set({ updatedAt: new Date() })
        .where(eq(trackedProducts.id, trackedProductId));
      const { ensureTrackedLink } = await import("./apply-change.service");
      await ensureTrackedLink(trackedProductId, mapping.id);
    } catch {
      /* tracking optional */
    }
  }

  steps.push({ step: "done", label: STEP_LABEL.done, ok: failed.length === 0 });

  return {
    success: true,
    status,
    provider: "marktgo" as const,
    connectionId: connection.id,
    externalProductId,
    externalId,
    mappingId: mapping.id,
    categoryUnresolved: false,
    reviewCount: reviews.length,
    remoteReviewCount,
    reviewsSynced: !reviewResolution.error,
    reviewSource: reviewResolution.source,
    expectedReviewCount: reviewResolution.expectedCount,
    steps,
    failedSteps: failed,
    message: redactSecrets(
      failed.length
        ? `MARKT-GO kısmi senkron: ${failed.join(",")}`
        : `MARKT-GO'ya gönderildi${reviewResolution.attempted ? ` — ${reviews.length} yorum` : ""}`,
    ),
  };
}

export async function listVariantMappingsForProduct(productMappingId: number) {
  return listVariantMappings(productMappingId);
}
