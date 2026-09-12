import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../../db";
import { trackedProducts } from "@shared/schema";
import { generateTrackingUid } from "../tracking-uid.service";
import type { CatalogPoolProduct } from "./pool-map";

export function canonicalTrackingSourceUrl(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const u = new URL(value);
    u.hash = "";
    if (/(^|\.)trendyol\.com$/i.test(u.hostname)) {
      u.search = "";
      u.pathname = u.pathname.replace(/\/yorumlar\/?$/i, "").replace(/\/+$/, "");
      u.hostname = "www.trendyol.com";
      u.protocol = "https:";
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

export function trackingSourceProductId(raw: string): string | null {
  const value = String(raw || "");
  return value.match(/-p-(\d{5,})/i)?.[1] || value.match(/[?&](?:productId|contentId)=(\d{5,})/i)?.[1] || null;
}

export async function findTrackedDuplicateBySourceUrl(rawUrl: string) {
  const canonical = canonicalTrackingSourceUrl(rawUrl);
  if (!canonical) return null;
  const pid = trackingSourceProductId(canonical);
  const conditions = [eq(trackedProducts.sourceUrl, canonical)];
  if (pid) conditions.push(eq(trackedProducts.sourceProductId, pid));
  const [row] = await db
    .select()
    .from(trackedProducts)
    .where(or(...conditions))
    .limit(1);
  if (!row || row.archivedAt || row.currentStatus === "marktgo_deleted") return null;
  return row;
}

export async function splitNewTrackingSourceUrls(urls: string[]) {
  const normalized = [...new Set(urls.map(canonicalTrackingSourceUrl).filter(Boolean))];
  if (!normalized.length) return { newUrls: [] as string[], duplicateUrls: [] as string[] };
  const pids = [...new Set(normalized.map(trackingSourceProductId).filter((x): x is string => Boolean(x)))];
  const rows = await db
    .select({ sourceUrl: trackedProducts.sourceUrl, sourceProductId: trackedProducts.sourceProductId, archivedAt: trackedProducts.archivedAt, currentStatus: trackedProducts.currentStatus })
    .from(trackedProducts)
    .where(
      pids.length
        ? or(inArray(trackedProducts.sourceUrl, normalized), inArray(trackedProducts.sourceProductId, pids))
        : inArray(trackedProducts.sourceUrl, normalized),
    );
  const liveRows = rows.filter((r) => !r.archivedAt && r.currentStatus !== "marktgo_deleted");
  const knownUrls = new Set(liveRows.map((r) => canonicalTrackingSourceUrl(r.sourceUrl)));
  const knownPids = new Set(liveRows.map((r) => r.sourceProductId).filter(Boolean));
  const duplicateUrls: string[] = [];
  const newUrls: string[] = [];
  for (const url of normalized) {
    const pid = trackingSourceProductId(url);
    if (knownUrls.has(url) || (pid && knownPids.has(pid))) duplicateUrls.push(url);
    else newUrls.push(url);
  }
  return { newUrls, duplicateUrls };
}

export async function ensureTrackedProductForMarktGo(product: CatalogPoolProduct) {
  const sourceUrl = canonicalTrackingSourceUrl(product.sourceUrl);
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  const sourceProductId = trackingSourceProductId(sourceUrl);
  const sourceSite = /trendyol\.com/i.test(sourceUrl) ? "trendyol" : "marktgo";
  let row = await findTrackedDuplicateBySourceUrl(sourceUrl);
  const now = new Date();
  const price = Number(product.salePrice || product.price || 0);
  const stock = Array.isArray(product.variants)
    ? product.variants.reduce((sum, variant) => sum + (variant.inStock === false ? 0 : 1), 0)
    : product.inStock ? 1 : 0;
  const patch = {
    sourceUrl,
    sourceSite,
    sourceProductId,
    sourceTitle: product.title || "MARKT-GO Ürünü",
    shopifyProductId: String(product.externalProductId),
    currentSourcePrice: Number.isFinite(price) && price > 0 ? String(price) : null,
    currentSourceStock: stock,
    currentStatus: "active",
    trackingEnabled: true,
    shopifySyncStatus: "marktgo_managed",
    lastShopifySyncAt: now,
    archivedAt: null,
    pausedReason: null,
    updatedAt: now,
  } as const;

  if (row) {
    const [updated] = await db.update(trackedProducts).set(patch).where(eq(trackedProducts.id, row.id)).returning();
    return updated;
  }

  try {
    const [created] = await db.insert(trackedProducts).values({
      ...patch,
      trackingUid: generateTrackingUid({ sourceSite, sourceProductId, sourceUrl }),
    }).returning();
    return created;
  } catch (error) {
    row = await findTrackedDuplicateBySourceUrl(sourceUrl);
    if (!row) throw error;
    const [updated] = await db.update(trackedProducts).set(patch).where(eq(trackedProducts.id, row.id)).returning();
    return updated;
  }
}

export async function markMissingMarktGoTrackedProductDeleted(trackedProductId: number) {
  const [row] = await db.select().from(trackedProducts).where(eq(trackedProducts.id, trackedProductId)).limit(1);
  if (!row) return false;
  if (row.shopifySyncStatus !== "marktgo_managed") return false;
  await db.delete(trackedProducts).where(eq(trackedProducts.id, trackedProductId));
  return true;
}
