import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { shopifyMemoryProducts } from "@shared/schema";
import { db } from "../db";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeImages(images: unknown): unknown[] {
  if (!Array.isArray(images)) return [];
  return images.map((img, index) => {
    if (typeof img === "string") return { src: img, position: index + 1 };
    const rec = asRecord(img);
    if (!rec) return img;
    const src = rec.src ?? rec.url ?? rec.originalSrc;
    if (typeof src === "string" && !rec.src) return { ...rec, src, position: rec.position ?? index + 1 };
    return rec;
  });
}

function firstVariant(variants: unknown): Record<string, unknown> | null {
  return Array.isArray(variants) ? asRecord(variants[0]) : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Shopify aktarımı biter bitmez mobil kataloğa (shopify_memory_products) yazar. Toplu sync beklemez. */
export async function upsertShopifyMemoryAfterTransfer(input: {
  shopifyProductId: string;
  title: string;
  handle?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  price?: number | null;
  compareAtPrice?: number | null;
  images?: unknown;
  variants?: unknown;
  options?: unknown;
  sourceUrl?: string | null;
  shopifyProduct?: Record<string, unknown> | null;
}): Promise<{ id: number } | null> {
  const shopifyProductId = String(input.shopifyProductId || "").trim();
  if (!shopifyProductId || !input.title?.trim()) return null;

  const product = input.shopifyProduct || {};
  const variants = Array.isArray(product.variants) ? product.variants : input.variants;
  const main = firstVariant(variants);
  const images = normalizeImages(product.images ?? input.images);
  const price =
    num(input.price) ??
    num(main?.price) ??
    null;
  const compareAtPrice =
    num(input.compareAtPrice) ??
    num(main?.compare_at_price) ??
    null;
  const handle =
    String(input.handle || product.handle || "").trim() || `product-${shopifyProductId}`;

  const [existing] = await db
    .select({
      id: shopifyMemoryProducts.id,
      uniqueTrackingId: shopifyMemoryProducts.uniqueTrackingId,
    })
    .from(shopifyMemoryProducts)
    .where(eq(shopifyMemoryProducts.shopifyProductId, shopifyProductId))
    .limit(1);

  const payload = {
    uniqueTrackingId: existing?.uniqueTrackingId || `shopify_${shopifyProductId}_${randomUUID().split("-")[0]}`,
    shopifyProductId,
    shopifyVariantId: main?.id != null ? String(main.id) : null,
    title: String(product.title || input.title),
    handle,
    vendor: (input.vendor || product.vendor || null) as string | null,
    productType: (input.productType || product.product_type || null) as string | null,
    tags: typeof product.tags === "string"
      ? product.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : Array.isArray(product.tags)
        ? product.tags.map(String)
        : [],
    status: String(input.status || product.status || "draft"),
    price: price != null ? String(price) : null,
    compareAtPrice: compareAtPrice != null ? String(compareAtPrice) : null,
    inventoryQuantity: num(main?.inventory_quantity) ?? 0,
    inventoryPolicy: String(main?.inventory_policy || "deny"),
    sku: main?.sku != null ? String(main.sku) : null,
    barcode: main?.barcode != null ? String(main.barcode) : null,
    images,
    options: product.options ?? input.options ?? [],
    variants: variants ?? [],
    sourceUrl: input.sourceUrl?.trim() || null,
    lastSyncAt: new Date(),
    isTracking: true,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(shopifyMemoryProducts)
      .set(payload)
      .where(eq(shopifyMemoryProducts.shopifyProductId, shopifyProductId));
    return { id: existing.id };
  }

  const [inserted] = await db.insert(shopifyMemoryProducts).values(payload).returning({
    id: shopifyMemoryProducts.id,
  });
  return inserted?.id ? { id: inserted.id } : null;
}

/** Shopify aktarımı → mobil katalog + tepsi bildirimi. Tracking/scrape algoritmasını değiştirmez. */
export async function publishShopifyTransferToMobile(
  input: Parameters<typeof upsertShopifyMemoryAfterTransfer>[0] & {
    sourceLabel?: string;
  },
): Promise<void> {
  try {
    const row = await upsertShopifyMemoryAfterTransfer(input);
    const { notifyMobileProductTransferred } = await import("./mobile-push.service");
    await notifyMobileProductTransferred({
      title: input.title,
      memoryProductId: row?.id ?? null,
      shopifyProductId: input.shopifyProductId,
      sourceLabel: input.sourceLabel,
    });
    const { scheduleDashboardRefresh } = await import("./mobile-dashboard.service");
    scheduleDashboardRefresh();
  } catch (err) {
    console.warn("⚠️ Mobil yayın atlandı:", err);
  }
}
