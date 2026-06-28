import { db } from "../db";
import { detectedChanges, type ProductSnapshot } from "@shared/schema";
import { and, eq, gte } from "drizzle-orm";
import type { FetchedSourceSnapshot } from "./source-fetcher.service";

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

function snapshotVariants(snapshot: ProductSnapshot): Array<Record<string, unknown>> {
  const v = snapshot.variants;
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function variantKey(v: Record<string, unknown>): string {
  const c = String(v.color ?? v.option1 ?? "");
  const s = String(v.size ?? v.option2 ?? "");
  const k = String(v.key ?? "");
  return k || `${c}::${s}`;
}

function numPrice(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

export async function compareSnapshots(
  trackedProductId: number,
  previous: ProductSnapshot | null,
  current: FetchedSourceSnapshot,
): Promise<DiffResult> {
  const changes: DiffResult["changes"] = [];

  if (!previous) {
    return { changes };
  }

  const oldPrice = numPrice(previous.price);
  const newPrice = current.price;

  if (oldPrice != null && newPrice > 0 && Math.abs(oldPrice - newPrice) > 0.009) {
    changes.push({
      changeType: "price",
      fieldName: "price",
      oldValue: oldPrice,
      newValue: newPrice,
      confidence: 95,
      status: "pending",
    });
  }

  const oldStock = previous.stock;
  const newStock = current.stock;
  if (oldStock != null && newStock != null && oldStock !== newStock) {
    changes.push({
      changeType: "stock",
      fieldName: "stock",
      oldValue: oldStock,
      newValue: newStock,
      confidence: 90,
      status: "pending",
    });
  }

  if (previous.available != null && current.available != null && previous.available !== current.available) {
    changes.push({
      changeType: "stock",
      fieldName: "available",
      oldValue: previous.available,
      newValue: current.available,
      confidence: 85,
      status: "pending",
    });
  }

  if (previous.title && current.title && previous.title.trim() !== current.title.trim()) {
    changes.push({
      changeType: "title",
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

  for (const [key, nv] of newMap) {
    if (!oldMap.has(key)) {
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

    const oldInStock = ov.inStock !== false;
    const newInStock = (nv as { inStock?: boolean }).inStock !== false;
    if (oldInStock !== newInStock) {
      changes.push({
        changeType: "variant_changed",
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
        changeType: "price",
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

export async function persistDetectedChanges(input: {
  trackedProductId: number;
  sourceSnapshotId: number;
  targetSnapshotId: number;
  diff: DiffResult;
}) {
  const rows = [];
  for (const c of input.diff.changes) {
    const [row] = await db
      .insert(detectedChanges)
      .values({
        trackedProductId: input.trackedProductId,
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
