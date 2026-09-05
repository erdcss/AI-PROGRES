/** Map Trendyol / scraper product payloads into product-pool shape for MARKT-GO upload. */

import { marktGoStockForAvailability } from "@shared/integration-provider";

export function extractNumericPrice(price: unknown): number | null {
  if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
  if (price && typeof price === "object") {
    const o = price as Record<string, unknown>;
    for (const key of ["original", "withProfit", "sale", "amount"]) {
      const n = Number(o[key]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  if (typeof price === "string") {
    const n = Number(String(price).replace(/[^\d.,]/g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function normalizeReviewDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ""
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeReviews(input: Record<string, unknown>) {
  const rawReviews = Array.isArray(input.reviews) ? input.reviews : [];
  const seen = new Set<string>();
  return rawReviews.flatMap((item, index) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const rating = Math.round(Number(row.rating ?? row.rate ?? row.starCount ?? 0));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return [];
    const sourceId = String(row.externalReviewId ?? row.id ?? row.reviewId ?? `review-${index + 1}`).trim();
    const externalReviewId = sourceId.startsWith("trendyol:") ? sourceId : `trendyol:${sourceId}`;
    if (seen.has(externalReviewId)) return [];
    seen.add(externalReviewId);
    const imagesRaw = Array.isArray(row.images)
      ? row.images
      : Array.isArray(row.mediaFiles)
        ? row.mediaFiles
        : [];
    const images = imagesRaw
      .map((image) => {
        if (typeof image === "string") return image;
        const imageRow = (image && typeof image === "object" ? image : {}) as Record<string, unknown>;
        return String(imageRow.url ?? imageRow.imageUrl ?? "");
      })
      .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)));
    return [{
      externalReviewId,
      rating,
      comment: String(row.comment ?? row.body ?? row.reviewText ?? "").trim() || undefined,
      reviewerName: String(row.reviewerName ?? row.userFullName ?? row.userName ?? "Anonim").trim() || undefined,
      createdAt: normalizeReviewDate(row.createdAt ?? row.review_date ?? row.createdDate ?? row.lastModifiedAt),
      images: [...new Set(images)],
      approved: row.approved !== false,
    }];
  });
}

export function mapScraperLikeToPoolProduct(input: Record<string, unknown>) {
  const imagesRaw = Array.isArray(input.images) ? input.images : [];
  const images = imagesRaw
    .map((img) => (typeof img === "string" ? img : (img as { url?: string })?.url))
    .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)));

  const variantsRoot = (input.variants && typeof input.variants === "object"
    ? (input.variants as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const allVariants = Array.isArray(variantsRoot.allVariants)
    ? variantsRoot.allVariants
    : Array.isArray(input.variants)
      ? (input.variants as unknown[])
      : [];

  const variants = allVariants.map((raw, i) => {
    const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const color = String(v.color || v.option1 || "").trim();
    const size = String(v.size || v.option2 || "").trim();
    const baseId = String(v.sourceProductId || v.listingId || v.id || "").trim();
    const id = baseId ? `${baseId}-${i + 1}` : `${color}-${size}-${i + 1}`;
    return {
      id,
      color: color || undefined,
      size: size || undefined,
      option1: color || undefined,
      option2: size || undefined,
      sku: v.sku ? String(v.sku) : undefined,
      inStock: v.inStock !== false,
      stock: marktGoStockForAvailability(v.inStock !== false),
      price: v.price != null ? extractNumericPrice(v.price) ?? undefined : undefined,
      image: typeof v.image === "string" ? v.image : undefined,
      imageUrl: typeof v.image === "string" ? v.image : undefined,
    };
  });

  const featuresRaw = Array.isArray(input.features)
    ? input.features
    : Array.isArray(input.attributes)
      ? input.attributes
      : [];
  const features = featuresRaw
    .map((f) => {
      const row = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      const name = String(row.name || row.key || "").trim();
      const value = String(row.value || "").trim();
      return name && value ? { name, value } : null;
    })
    .filter(Boolean);

  const salePrice =
    extractNumericPrice(input.salePrice) ??
    extractNumericPrice(input.price) ??
    0;

  const reviews = normalizeReviews(input);
  const reviewCountRaw = Number(
    input.reviewCount ??
      input.ratingCount ??
      (input.reviewStats && typeof input.reviewStats === "object"
        ? (input.reviewStats as Record<string, unknown>).total
        : undefined) ??
      (input.reviewsStats && typeof input.reviewsStats === "object"
        ? (input.reviewsStats as Record<string, unknown>).total
        : undefined),
  );
  const reviewCount = Number.isFinite(reviewCountRaw) && reviewCountRaw >= 0
    ? Math.floor(reviewCountRaw)
    : reviews.length || null;

  return {
    poolId: String(
      input.poolId ||
        input.id ||
        (input.sourceUrl
          ? `url_${String(input.sourceUrl).replace(/^https?:\/\//i, "").slice(-48)}`
          : "") ||
        `scraper-${Date.now()}`,
    ),
    title: String(input.title || input.productTitle || "Ürün"),
    salePrice,
    brand: input.brand ? String(input.brand) : undefined,
    category: input.category ? String(input.category) : undefined,
    categoryPath: Array.isArray(input.categoryPath)
      ? input.categoryPath.map(String)
      : Array.isArray((input.canonicalProduct as { categoryPath?: string[] } | undefined)?.categoryPath)
        ? (input.canonicalProduct as { categoryPath: string[] }).categoryPath
        : undefined,
    sourceUrl: String(input.sourceUrl || input.originalUrl || ""),
    images,
    image: images[0],
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    description: input.description ? String(input.description) : undefined,
    features,
    reviews,
    reviewCount,
    variants,
    inStock: variants.length ? variants.some((v) => v.inStock) : true,
    stock: marktGoStockForAvailability(
      variants.length ? variants.some((v) => v.inStock) : true,
    ),
  };
}
