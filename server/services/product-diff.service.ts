import { db } from "../db";
import { detectedChanges, trackedVariants, type ProductSnapshot } from "@shared/schema";
import { and, eq, gte } from "drizzle-orm";
import type { FetchedSourceSnapshot } from "./source-fetcher.service";
import {
  assessPriceChange,
  isPlausibleProductPrice,
  resolveReliableBaselinePrice,
  stableVariantKey,
} from "@shared/tracking-price-sanity";

export type DiffResult = {
  changes: Array<{
    changeType: string;
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
    confidence: number;
    status: "pending" | "manual_review";
    reason?: string;
    variantKey?: string;
  }>;
};

export type CompareContext = {
  knownGoodPrice?: number | null;
};

function snapshotVariants(snapshot: ProductSnapshot): Array<Record<string, unknown>> {
  const v = snapshot.variants;
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function variantKey(v: Record<string, unknown>): string {
  return stableVariantKey({
    color: v.color as string | undefined,
    size: v.size as string | undefined,
    option1: v.option1 as string | undefined,
    option2: v.option2 as string | undefined,
    key: v.key as string | undefined,
  });
}

function numPrice(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Stok sayısı varyant sayısından geliyorsa küçük farkları yok say */
function looksLikeStockOnlyNoise(
  oldStock: number,
  newStock: number,
  oldPrice: number | null,
  newPrice: number,
): boolean {
  if (oldPrice == null || !isPlausibleProductPrice(oldPrice)) return false;
  if (Math.abs(oldPrice - newPrice) > 0.009) return false;
  return oldStock <= 30 && newStock <= 30 && Math.abs(oldStock - newStock) <= 2;
}

async function isDuplicateChange(input: {
  trackedProductId: number;
  changeType: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
}): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: detectedChanges.id })
    .from(detectedChanges)
    .where(
      and(
        eq(detectedChanges.trackedProductId, input.trackedProductId),
        eq(detectedChanges.changeType, input.changeType),
        eq(detectedChanges.fieldName, input.fieldName),
        gte(detectedChanges.createdAt, since),
      ),
    )
    .limit(20);

  if (rows.length === 0) return false;

  const oldJson = JSON.stringify(input.oldValue ?? null);
  const newJson = JSON.stringify(input.newValue ?? null);

  const dupRows = await db
    .select()
    .from(detectedChanges)
    .where(
      and(
        eq(detectedChanges.trackedProductId, input.trackedProductId),
        eq(detectedChanges.changeType, input.changeType),
        eq(detectedChanges.fieldName, input.fieldName),
        gte(detectedChanges.createdAt, since),
      ),
    );

  return dupRows.some(
    (r) =>
      JSON.stringify(r.oldValue ?? null) === oldJson &&
      JSON.stringify(r.newValue ?? null) === newJson &&
      ["pending", "manual_review"].includes(r.status),
  );
}

async function loadTrackedVariantKeys(trackedProductId: number): Promise<Set<string>> {
  const rows = await db
    .select({
      option1: trackedVariants.option1,
      option2: trackedVariants.option2,
      sourceSku: trackedVariants.sourceSku,
      shopifyVariantId: trackedVariants.shopifyVariantId,
      currentAvailable: trackedVariants.currentAvailable,
    })
    .from(trackedVariants)
    .where(eq(trackedVariants.trackedProductId, trackedProductId));

  const withShopify = rows.filter((r) => Boolean(String(r.shopifyVariantId ?? "").trim()));
  const source =
    withShopify.length > 0
      ? withShopify
      : rows.filter((r) => r.currentAvailable !== false);

  return new Set(
    source.map((r) =>
      stableVariantKey({
        color: r.option1 ?? undefined,
        size: r.option2 ?? undefined,
        sku: r.sourceSku ?? undefined,
      }),
    ),
  );
}

function shouldTrackVariantChange(key: string, trackedKeys: Set<string>): boolean {
  if (trackedKeys.size === 0) return true;
  return trackedKeys.has(key);
}

export async function compareSnapshots(
  trackedProductId: number,
  previous: ProductSnapshot | null,
  current: FetchedSourceSnapshot,
  context?: CompareContext,
): Promise<DiffResult> {
  const changes: DiffResult["changes"] = [];

  if (!previous) {
    return { changes };
  }

  const knownGood = context?.knownGoodPrice ?? null;
  const oldPrice = resolveReliableBaselinePrice(numPrice(previous.price), knownGood);
  const newPrice = current.price;

  if (
    oldPrice != null &&
    newPrice > 0 &&
    Math.abs(oldPrice - newPrice) > 0.009
  ) {
    const assessment = assessPriceChange(oldPrice, newPrice);
    if (assessment.shouldRecord) {
      changes.push({
        changeType: "price_changed",
        fieldName: "price",
        oldValue: oldPrice,
        newValue: newPrice,
        confidence: assessment.confidence,
        status: assessment.status,
        reason: assessment.reason,
      });
    }
  }

  const oldStock = previous.stock;
  const newStock = current.stock;
  if (
    oldStock != null &&
    newStock != null &&
    oldStock !== newStock &&
    !(looksLikeStockOnlyNoise(oldStock, newStock, oldPrice, newPrice))
  ) {
    changes.push({
      changeType: "stock_changed",
      fieldName: "stock",
      oldValue: oldStock,
      newValue: newStock,
      confidence: 90,
      status: "pending",
    });
  }

  if (previous.available != null && current.available != null && previous.available !== current.available) {
    changes.push({
      changeType: "stock_changed",
      fieldName: "available",
      oldValue: previous.available,
      newValue: current.available,
      confidence: 85,
      status: "pending",
    });
  }

  if (previous.title && current.title && previous.title.trim() !== current.title.trim()) {
    changes.push({
      changeType: "title_changed",
      fieldName: "title",
      oldValue: previous.title,
      newValue: current.title,
      confidence: 80,
      status: "manual_review",
      reason: "Başlık değişimi manuel inceleme gerektirir",
    });
  }

  const oldVariants = snapshotVariants(previous);
  const newVariants = current.variants.map((v) => ({
    key: v.key,
    color: v.color,
    size: v.size,
    inStock: v.inStock,
    price: v.price,
  }));

  const oldMap = new Map(oldVariants.map((v) => [variantKey(v), v]));
  const newMap = new Map(newVariants.map((v) => [variantKey(v), v]));
  const trackedKeys = await loadTrackedVariantKeys(trackedProductId);

  for (const [key, nv] of newMap) {
    if (!oldMap.has(key)) {
      if (!shouldTrackVariantChange(key, trackedKeys)) continue;
      changes.push({
        changeType: "variant_added",
        fieldName: "variant",
        oldValue: null,
        newValue: nv,
        confidence: 70,
        status: "manual_review",
        reason: "Yeni varyant — manuel inceleme gerekiyor",
        variantKey: key,
      });
    }
  }

  for (const [key, ov] of oldMap) {
    if (!newMap.has(key)) {
      if (!shouldTrackVariantChange(key, trackedKeys)) continue;
      changes.push({
        changeType: "variant_removed",
        fieldName: "variant",
        oldValue: ov,
        newValue: null,
        confidence: 60,
        status: "manual_review",
        reason: "Varyant kaldırıldı — eşleşme emin değil, manuel inceleme gerekiyor",
        variantKey: key,
      });
    }
  }

  for (const [key, nv] of newMap) {
    const ov = oldMap.get(key);
    if (!ov) continue;
    if (!shouldTrackVariantChange(key, trackedKeys)) continue;

    const oldInStock = ov.inStock !== false;
    const newInStock = (nv as { inStock?: boolean }).inStock !== false;
    if (oldInStock !== newInStock) {
      changes.push({
        changeType: "variant_stock_changed",
        fieldName: "inStock",
        oldValue: oldInStock,
        newValue: newInStock,
        confidence: 75,
        status: "pending",
        variantKey: key,
      });
    }

    const oldVp = numPrice(ov.price);
    const newVp = numPrice((nv as { price?: number }).price);
    if (oldVp != null && newVp != null && Math.abs(oldVp - newVp) > 0.009) {
      changes.push({
        changeType: "variant_price_changed",
        fieldName: "variant_price",
        oldValue: oldVp,
        newValue: newVp,
        confidence: 80,
        status: "pending",
        variantKey: key,
      });
    }
  }

  const deduped: DiffResult["changes"] = [];
  for (const c of changes) {
    const dup = await isDuplicateChange({
      trackedProductId,
      changeType: c.changeType,
      fieldName: c.fieldName,
      oldValue: c.oldValue,
      newValue: c.newValue,
    });
    if (!dup) deduped.push(c);
  }

  return { changes: deduped };
}

async function resolveTrackedVariantId(
  trackedProductId: number,
  change: DiffResult["changes"][number],
): Promise<number | null> {
  const meta = change.newValue ?? change.oldValue;
  if (!meta || typeof meta !== "object") return null;
  const o = meta as Record<string, unknown>;
  const color = o.color ? String(o.color) : o.option1 ? String(o.option1) : null;
  const size = o.size ? String(o.size) : o.option2 ? String(o.option2) : null;
  const sku = o.sku ? String(o.sku) : null;

  const conditions = [eq(trackedVariants.trackedProductId, trackedProductId)];
  if (color) conditions.push(eq(trackedVariants.option1, color));
  if (size) conditions.push(eq(trackedVariants.option2, size));
  if (sku) conditions.push(eq(trackedVariants.sourceSku, sku));

  if (conditions.length <= 1) return null;

  const rows = await db
    .select({ id: trackedVariants.id })
    .from(trackedVariants)
    .where(and(...conditions))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function persistDetectedChanges(input: {
  trackedProductId: number;
  sourceSnapshotId: number;
  targetSnapshotId: number;
  diff: DiffResult;
}) {
  const rows = [];
  for (const c of input.diff.changes) {
    const trackedVariantId = await resolveTrackedVariantId(input.trackedProductId, c);
    const [row] = await db
      .insert(detectedChanges)
      .values({
        trackedProductId: input.trackedProductId,
        trackedVariantId,
        changeType: c.changeType,
        fieldName: c.fieldName,
        oldValue: c.oldValue as never,
        newValue: c.newValue as never,
        confidence: String(c.confidence),
        status: c.status,
        reason: c.reason ?? null,
        sourceSnapshotId: input.sourceSnapshotId,
        targetSnapshotId: input.targetSnapshotId,
      })
      .returning();
    rows.push(row);
  }
  return rows;
}
