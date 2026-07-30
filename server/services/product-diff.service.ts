import { db } from "../db";
import { detectedChanges, trackedVariants, type ProductSnapshot } from "@shared/schema";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import type { FetchedSourceSnapshot } from "./source-fetcher.service";
import {
  assessPriceChange,
  isPlausibleProductPrice,
  isPlaceholderVariantSize,
  resolveReliableBaselinePrice,
  stableVariantKey,
  variantKeysLooselyEqual,
} from "@shared/tracking-price-sanity";
import { buildChangeDiagnosis } from "@shared/tracking-change-diagnosis";
import { matchTrackedVariantByKey } from "@shared/tracking-variant-resolve";

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
  if (!Array.isArray(v)) return [];
  return (v as Array<Record<string, unknown>>).map((variant) => ({
    ...variant,
    color: variant.color ?? variant.option1 ?? variant.option1Value,
    size: variant.size ?? variant.option2 ?? variant.option2Value,
    sku: variant.sku ?? variant.sourceSku,
    inStock:
      typeof variant.inStock === "boolean"
        ? variant.inStock
        : typeof variant.currentAvailable === "boolean"
          ? variant.currentAvailable
          : undefined,
  }));
}

function variantKey(v: Record<string, unknown>): string {
  return stableVariantKey({
    color: v.color as string | undefined,
    size: v.size as string | undefined,
    option1: v.option1 as string | undefined,
    option2: v.option2 as string | undefined,
    key: v.key as string | undefined,
    sku: v.sku as string | undefined,
  });
}

function numPrice(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
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
      }),
    ),
  );
}

function shouldTrackVariantChange(key: string, trackedKeys: Set<string>): boolean {
  if (trackedKeys.size === 0) return true;
  if (trackedKeys.has(key)) return true;
  for (const tracked of trackedKeys) {
    if (variantKeysLooselyEqual(key, tracked)) return true;
  }
  return false;
}

function mapHasLooseKey(map: Map<string, Record<string, unknown>>, key: string): boolean {
  if (map.has(key)) return true;
  for (const existing of map.keys()) {
    if (variantKeysLooselyEqual(key, existing)) return true;
  }
  return false;
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
  const oldVariants = snapshotVariants(previous);
  const hasVariantStockData = oldVariants.length > 0 && current.variants.length > 0;
  const productPriceChanged =
    oldPrice != null && newPrice > 0 && Math.abs(oldPrice - newPrice) > 0.009;

  if (productPriceChanged) {
    const assessment = assessPriceChange(oldPrice, newPrice);
    if (assessment.shouldRecord) {
      const diagnosis = buildChangeDiagnosis({
        changeType: "price_changed",
        fieldName: "price",
        oldValue: oldPrice,
        newValue: newPrice,
        storedReason: assessment.reason,
      });
      changes.push({
        changeType: "price_changed",
        fieldName: "price",
        oldValue: oldPrice,
        newValue: newPrice,
        confidence: assessment.confidence,
        status: assessment.status,
        reason: diagnosis.diagnosis,
      });
    }
  }

  const oldStock = previous.stock;
  const newStock = current.stock;
  if (
    newStock != null &&
    oldStock !== newStock &&
    // Önceki stok bilinmiyorken (null) → 0 da ürün tükenmesi sayılır
    (oldStock != null || newStock === 0) &&
    !hasVariantStockData &&
    !(
      oldStock != null &&
      looksLikeStockOnlyNoise(oldStock, newStock, oldPrice, newPrice)
    )
  ) {
    const diagnosis = buildChangeDiagnosis({
      changeType: "stock_changed",
      fieldName: "stock",
      oldValue: oldStock,
      newValue: newStock,
    });
    changes.push({
      changeType: "stock_changed",
      fieldName: "stock",
      oldValue: oldStock,
      newValue: newStock,
      confidence: oldStock == null ? 80 : 90,
      status: "pending",
      reason: diagnosis.diagnosis,
    });
  }

  const currentAllOos =
    current.available === false ||
    (typeof current.stock === "number" && current.stock === 0) ||
    (current.variants.length > 0 &&
      current.variants.every((v) => v.inStock === false));

  if (
    current.available === false &&
    previous.available !== false &&
    // true→false veya bilinmeyen→false (güçlü OOS kanıtı)
    (previous.available === true || currentAllOos) &&
    (!hasVariantStockData || current.available === false)
  ) {
    const diagnosis = buildChangeDiagnosis({
      changeType: "stock_changed",
      fieldName: "available",
      oldValue: previous.available,
      newValue: current.available,
    });
    changes.push({
      changeType: "stock_changed",
      fieldName: "available",
      oldValue: previous.available,
      newValue: current.available,
      confidence: previous.available == null ? 85 : 90,
      status: "pending",
      reason: diagnosis.diagnosis,
    });
  }

  if (
    previous.title &&
    current.title &&
    normalizeComparableText(previous.title) !== normalizeComparableText(current.title)
  ) {
    const diagnosis = buildChangeDiagnosis({
      changeType: "title_changed",
      fieldName: "title",
      oldValue: previous.title,
      newValue: current.title,
    });
    changes.push({
      changeType: "title_changed",
      fieldName: "title",
      oldValue: previous.title,
      newValue: current.title,
      confidence: 80,
      status: "manual_review",
      reason: diagnosis.diagnosis,
    });
  }

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

  const isColorOnlySkuSet = (map: Map<string, Record<string, unknown>>) =>
    map.size > 0 &&
    map.size <= 2 &&
    [...map.values()].every((v) =>
      isPlaceholderVariantSize(String(v.size ?? v.option2 ?? "")),
    );

  const productLooksBuyable =
    current.available === true ||
    (typeof current.stock === "number" && current.stock > 0) ||
    [...newMap.values()].some((v) => v.inStock === true);

  const allNewVariantsOos =
    newMap.size > 0 && [...newMap.values()].every((v) => v.inStock === false);

  // Tek renk / bedensiz ürün: ürün alınabiliyorken "renk tükendi" üretme
  // Ama ürün tamamen tükendiyse (available=false / tüm varyantlar OOS) bastırma.
  const suppressColorOnlyOos =
    productLooksBuyable &&
    !allNewVariantsOos &&
    current.available !== false &&
    (isColorOnlySkuSet(newMap) || isColorOnlySkuSet(oldMap));

  // Kaynak snapshot'ında geçici olarak görünmeyip sonraki kontrolde geri dönen
  // mevcut Shopify varyantları "yeni varyant" değildir. Gerçek varyant ekleme,
  // ayrı bir eşleme akışı olmadan güvenli biçimde ayırt edilemediği için bildirim üretme.

  // Tek bir kaynak ölçümünde görünmeyen varyantı "kaldırıldı" sayma.
  // Trendyol seçili satıcı, renk ailesi veya geçici eksik DOM nedeniyle aynı
  // varyantı sonraki ölçümde tekrar döndürebiliyor. Kalıcı kaldırma için ardışık
  // tam snapshot kanıtı kurulana kadar yanlış alarm üretmemek daha güvenlidir.

  for (const [key, nv] of newMap) {
    const ov = oldMap.get(key) ?? [...oldMap.entries()].find(([k]) => variantKeysLooselyEqual(k, key))?.[1];
    if (!ov) continue;
    if (!shouldTrackVariantChange(key, trackedKeys)) continue;

    const oldInStock = ov.inStock !== false;
    const newInStock = (nv as { inStock?: boolean }).inStock !== false;
    if (oldInStock !== newInStock) {
      if (newInStock === false && suppressColorOnlyOos) {
        continue;
      }
      // Ürün hâlâ satın alınabilirken az varyantlı OOS sayma
      // (ürün tamamen tükendiyse bildirim üret)
      if (
        newInStock === false &&
        productLooksBuyable &&
        !allNewVariantsOos &&
        current.available !== false &&
        newMap.size <= 2
      ) {
        continue;
      }
      const diagnosis = buildChangeDiagnosis({
        changeType: "variant_stock_changed",
        fieldName: "inStock",
        oldValue: oldInStock,
        newValue: newInStock,
        variantLabel: key,
      });
      changes.push({
        changeType: "variant_stock_changed",
        fieldName: "inStock",
        oldValue: oldInStock,
        newValue: newInStock,
        confidence: 75,
        status: "pending",
        reason: diagnosis.diagnosis,
        variantKey: key,
      });
    }

    const oldVp = numPrice(ov.price);
    const newVp = numPrice((nv as { price?: number }).price);
    if (oldVp != null && newVp != null && Math.abs(oldVp - newVp) > 0.009) {
      const mirrorsProductPrice =
        productPriceChanged &&
        oldPrice != null &&
        Math.abs(oldVp - oldPrice) <= 0.009 &&
        Math.abs(newVp - newPrice) <= 0.009;
      if (mirrorsProductPrice) continue;
      const diagnosis = buildChangeDiagnosis({
        changeType: "variant_price_changed",
        fieldName: "variant_price",
        oldValue: oldVp,
        newValue: newVp,
        variantLabel: key,
      });
      changes.push({
        changeType: "variant_price_changed",
        fieldName: "variant_price",
        oldValue: oldVp,
        newValue: newVp,
        confidence: 80,
        status: "pending",
        reason: diagnosis.diagnosis,
        variantKey: key,
      });
    }
  }

  // Önceki snapshot'ta varyant yokken yeni ölçüm ürünü tükendi gösteriyorsa
  // (kozmetik/tek SKU) stok dışı bildirimi üret.
  if (oldMap.size === 0 && current.available === false && newMap.size > 0) {
    for (const [key, nv] of newMap) {
      if ((nv as { inStock?: boolean }).inStock !== false) continue;
      if (!shouldTrackVariantChange(key, trackedKeys)) continue;
      const diagnosis = buildChangeDiagnosis({
        changeType: "variant_stock_changed",
        fieldName: "inStock",
        oldValue: true,
        newValue: false,
        variantLabel: key,
      });
      changes.push({
        changeType: "variant_stock_changed",
        fieldName: "inStock",
        oldValue: true,
        newValue: false,
        confidence: 85,
        status: "pending",
        reason: diagnosis.diagnosis,
        variantKey: key,
      });
    }
  }

  // Önceki snapshot'ta stoktayken yeni ölçümde hiç gelmeyen takip edilen varyantlar
  // → stok dışı say. Anahtar rename (siyah::sku ↔ siyah::tek beden) ve satın
  // alınabilir ürünlerde yanlış alarm üretme.
  const coverageOk =
    oldMap.size === 0 || newMap.size >= Math.max(1, Math.floor(oldMap.size * 0.5));
  if (coverageOk && newMap.size > 0 && !suppressColorOnlyOos) {
    for (const [key, ov] of oldMap) {
      if (mapHasLooseKey(newMap, key)) continue;
      if (!shouldTrackVariantChange(key, trackedKeys)) continue;
      if (ov.inStock === false) continue; // zaten OOS biliniyordu
      // Tek SKU / kozmetik: ürün hâlâ alınabiliyorsa kayıp anahtar ≠ OOS
      if (
        productLooksBuyable &&
        !allNewVariantsOos &&
        current.available !== false &&
        (oldMap.size <= 2 || newMap.size <= 2)
      ) {
        continue;
      }
      const diagnosis = buildChangeDiagnosis({
        changeType: "variant_stock_changed",
        fieldName: "inStock",
        oldValue: true,
        newValue: false,
        variantLabel: key,
      });
      changes.push({
        changeType: "variant_stock_changed",
        fieldName: "inStock",
        oldValue: true,
        newValue: false,
        confidence: 70,
        status: "pending",
        reason:
          diagnosis.diagnosis ||
          `Varyant kaynakta artık listelenmiyor — stok dışı kabul edildi (${key})`,
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
  const rows = await db
    .select({
      id: trackedVariants.id,
      option1: trackedVariants.option1,
      option2: trackedVariants.option2,
      option3: trackedVariants.option3,
      sourceSku: trackedVariants.sourceSku,
      shopifyVariantId: trackedVariants.shopifyVariantId,
      sourceVariantTitle: trackedVariants.sourceVariantTitle,
    })
    .from(trackedVariants)
    .where(eq(trackedVariants.trackedProductId, trackedProductId));

  if (change.variantKey) {
    const matched = matchTrackedVariantByKey(rows, change.variantKey);
    if (matched?.id) return matched.id;
  }

  const meta = change.newValue ?? change.oldValue;
  if (meta && typeof meta === "object") {
    const o = meta as Record<string, unknown>;
    const key =
      (o.key ? String(o.key) : null) ||
      stableVariantKey({
        color: o.color ? String(o.color) : o.option1 ? String(o.option1) : undefined,
        size: o.size ? String(o.size) : o.option2 ? String(o.option2) : undefined,
        sku: o.sku ? String(o.sku) : undefined,
      });
    const matched = matchTrackedVariantByKey(rows, key);
    if (matched?.id) return matched.id;
  }

  return null;
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
    if (
      (c.changeType === "variant_stock_changed" ||
        c.changeType === "variant_price_changed") &&
      trackedVariantId == null
    ) {
      console.warn(
        `⚠️ Eşleşmeyen ${c.changeType} atlandı (ürün #${input.trackedProductId}, key=${c.variantKey ?? "?"})`,
      );
      continue;
    }
    const sameTarget = [
      eq(detectedChanges.trackedProductId, input.trackedProductId),
      eq(detectedChanges.changeType, c.changeType),
      eq(detectedChanges.fieldName, c.fieldName),
      inArray(detectedChanges.status, ["pending", "manual_review", "approved", "failed"]),
      trackedVariantId == null
        ? isNull(detectedChanges.trackedVariantId)
        : eq(detectedChanges.trackedVariantId, trackedVariantId),
    ];
    await db
      .update(detectedChanges)
      .set({
        status: "superseded",
        reason: "Daha yeni bir değişiklik kaydıyla güncellendi",
        updatedAt: new Date(),
      })
      .where(and(...sameTarget));

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

/**
 * Kaynak ürün hâlâ stokta/satın alınabilir görünüyorsa, yanlış üretilmiş
 * "varyant tükendi" pending kayıtlarını temizle (kozmetik tek-SKU yanlış alarmı).
 */
export async function clearFalsePendingVariantOos(input: {
  trackedProductId: number;
  available: boolean | null;
  stock: number | null;
  variants: Array<{ inStock?: boolean }>;
}): Promise<number> {
  const anyInStock = input.variants.some((v) => v.inStock === true);
  const buyable =
    input.available === true ||
    (typeof input.stock === "number" && input.stock > 0) ||
    anyInStock;
  if (!buyable) return 0;

  const candidates = await db
    .select({
      id: detectedChanges.id,
      newValue: detectedChanges.newValue,
    })
    .from(detectedChanges)
    .where(
      and(
        eq(detectedChanges.trackedProductId, input.trackedProductId),
        eq(detectedChanges.changeType, "variant_stock_changed"),
        inArray(detectedChanges.status, ["pending", "manual_review", "approved"]),
      ),
    );

  const oosIds = candidates
    .filter((row) => {
      const v = row.newValue;
      if (v === false || v === "false" || v === 0) return true;
      if (v && typeof v === "object" && "inStock" in (v as object)) {
        const stock = (v as { inStock: unknown }).inStock;
        return stock === false || stock === "false" || stock === 0;
      }
      return false;
    })
    .map((row) => row.id);

  if (oosIds.length === 0) return 0;

  const cleared = await db
    .update(detectedChanges)
    .set({
      status: "superseded",
      reason: "Kaynak ürün stokta göründü — yanlış stok dışı alarmı iptal edildi",
      updatedAt: new Date(),
    })
    .where(inArray(detectedChanges.id, oosIds))
    .returning({ id: detectedChanges.id });

  if (cleared.length > 0) {
    console.info(
      `[tracking] #${input.trackedProductId}: ${cleared.length} yanlış varyant-OOS alarmı iptal edildi`,
    );
  }

  return cleared.length;
}
