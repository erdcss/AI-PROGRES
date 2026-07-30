import { and, desc, eq, inArray } from "drizzle-orm";
import {
  detectedChanges,
  productSnapshots,
  trackedProducts,
} from "@shared/schema";
import { db } from "../db";
import { fetchSourceForTracking } from "./source-fetcher.service";
import { compareSnapshots, persistDetectedChanges } from "./product-diff.service";
import { trackingService } from "./tracking.service";

export type ChangeVerifyResult = {
  checkedProducts: number;
  priceChangesChecked: number;
  confirmed: number;
  rejected: number;
  corrected: number;
  fetchErrors: number;
  message: string;
};

const OPEN_STATUSES = ["pending", "manual_review", "approved", "failed"] as const;

/** Tam eşleşme: %1 veya 1₺ */
function pricesClose(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  const abs = Math.abs(a - b);
  if (abs <= 1) return true;
  return abs / Math.max(a, b) <= 0.01;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Açık fiyat değişikliklerini canlı kaynak fiyatıyla teyit eder.
 * Uyuşmayan kayıtları yok sayar; gerekirse doğru fiyat için yeni değişiklik üretir.
 * Program açılışında startup audit tarafından çağrılır.
 */
export async function verifyOpenDetectedChanges(options?: {
  limitProducts?: number;
  delayMs?: number;
}): Promise<ChangeVerifyResult> {
  const limitProducts = options?.limitProducts ?? 35;
  const delayMs = options?.delayMs ?? 350;

  const openRows = await db
    .select({
      changeId: detectedChanges.id,
      trackedProductId: detectedChanges.trackedProductId,
      changeType: detectedChanges.changeType,
      oldValue: detectedChanges.oldValue,
      newValue: detectedChanges.newValue,
      status: detectedChanges.status,
      sourceUrl: trackedProducts.sourceUrl,
      currentSourcePrice: trackedProducts.currentSourcePrice,
      sourceTitle: trackedProducts.sourceTitle,
    })
    .from(detectedChanges)
    .innerJoin(trackedProducts, eq(trackedProducts.id, detectedChanges.trackedProductId))
    .where(
      and(
        inArray(detectedChanges.status, [...OPEN_STATUSES]),
        inArray(detectedChanges.changeType, ["price_changed", "variant_price_changed"]),
        eq(trackedProducts.trackingEnabled, true),
      ),
    )
    .orderBy(desc(detectedChanges.createdAt))
    .limit(250);

  const byProduct = new Map<number, typeof openRows>();
  for (const row of openRows) {
    const list = byProduct.get(row.trackedProductId) ?? [];
    list.push(row);
    byProduct.set(row.trackedProductId, list);
  }

  const productIds = [...byProduct.keys()].slice(0, limitProducts);
  let confirmed = 0;
  let rejected = 0;
  let corrected = 0;
  let fetchErrors = 0;
  let priceChangesChecked = 0;

  for (const productId of productIds) {
    const productRows = byProduct.get(productId) ?? [];
    const sourceUrl = productRows[0]?.sourceUrl;
    if (!sourceUrl) continue;

    const baseline = Number(productRows[0]?.currentSourcePrice);
    console.info(
      `[change-verify] ürün #${productId} kontrol (${productRows.length} açık fiyat kaydı)...`,
    );

    const fetch = await fetchSourceForTracking(sourceUrl, {
      baselinePrice: Number.isFinite(baseline) && baseline > 0 ? baseline : null,
    });

    if (!fetch.valid) {
      fetchErrors++;
      console.warn(`[change-verify] ürün #${productId} fetch başarısız: ${fetch.message}`);
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }

    const livePrice = fetch.data.price;
    const priceFromBaseline = Boolean(fetch.data.quality?.priceFromBaseline);

    // OOS fallback ile baseline fiyatı geldiyse fiyat teyidi güvenilir değil — atla
    if (priceFromBaseline) {
      console.warn(
        `[change-verify] ürün #${productId} fiyat baseline fallback — fiyat teyidi atlandı (stok/OOS kaydı korunur)`,
      );
      fetchErrors++;
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }

    let productNeedsCorrection = false;

    for (const row of productRows) {
      if (row.changeType !== "price_changed" && row.changeType !== "variant_price_changed") {
        continue;
      }
      priceChangesChecked++;
      const claimed = Number(row.newValue);

      if (pricesClose(claimed, livePrice)) {
        // new_value'yu canlı fiyata hizala (küçük kuruş farkları)
        if (Math.abs(claimed - livePrice) > 0.009) {
          await db
            .update(detectedChanges)
            .set({
              newValue: livePrice as never,
              reason: `Teyit: canlı fiyat ${livePrice.toLocaleString("tr-TR")} ₺ onaylandı`,
              seenAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(detectedChanges.id, row.changeId));
        }
        confirmed++;
        continue;
      }

      await db
        .update(detectedChanges)
        .set({
          status: "ignored",
          reason: `Teyit: canlı ${livePrice.toLocaleString("tr-TR")} ₺ ≠ tespit ${claimed.toLocaleString("tr-TR")} ₺ — hatalı kayıt yok sayıldı`,
          seenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(detectedChanges.id, row.changeId));
      rejected++;
      productNeedsCorrection = true;
    }

    await trackingService.updateAfterSuccessfulCheck(productId, {
      price: livePrice,
      title: fetch.data.title || String(productRows[0]?.sourceTitle ?? ""),
      stock: fetch.data.stock,
    });

    // Hatalı kayıt silindiyse veya kayıtlı fiyat canlıdan sapıyorsa doğru değişiklik üret
    const needFreshDiff =
      productNeedsCorrection ||
      (Number.isFinite(baseline) && baseline > 0 && !pricesClose(baseline, livePrice));

    if (needFreshDiff) {
      const [previous] = await db
        .select()
        .from(productSnapshots)
        .where(eq(productSnapshots.trackedProductId, productId))
        .orderBy(desc(productSnapshots.id))
        .limit(1);

      const newSnapshot = await trackingService.saveSnapshot({
        trackedProductId: productId,
        snapshotType: "scheduled",
        sourceUrl: fetch.data.sourceUrl,
        title: fetch.data.title,
        price: livePrice,
        stock: fetch.data.stock,
        available: fetch.data.available,
        images: fetch.data.images,
        variants: fetch.data.variants,
        rawData: fetch.data.rawData,
        quality: { ...fetch.data.quality, verifiedAtStartup: true },
      });

      if (previous) {
        const diff = await compareSnapshots(productId, previous, fetch.data, {
          knownGoodPrice: Number.isFinite(baseline) && baseline > 0 ? baseline : null,
        });
        const priceDiffs = diff.changes.filter(
          (c) => c.changeType === "price_changed" || c.changeType === "variant_price_changed",
        );
        if (priceDiffs.length > 0) {
          await persistDetectedChanges({
            trackedProductId: productId,
            sourceSnapshotId: previous.id,
            targetSnapshotId: newSnapshot.id,
            diff: { changes: priceDiffs },
          });
          corrected += priceDiffs.length;
        }
      }
    }

    console.info(
      `[change-verify] ürün #${productId} canlı=${livePrice} rejected+=${productNeedsCorrection ? "evet" : "hayır"}`,
    );

    if (delayMs > 0) await sleep(delayMs);
  }

  const message = `${productIds.length} ürün teyit edildi; ${confirmed} onay, ${rejected} hatalı yok sayıldı, ${corrected} doğru fiyat kaydı`;
  console.info(`[change-verify] ${message}`);

  await trackingService.writeSyncLog({
    action: "startup_change_verify",
    status: rejected > 0 ? "warning" : "success",
    message,
    meta: {
      checkedProducts: productIds.length,
      priceChangesChecked,
      confirmed,
      rejected,
      corrected,
      fetchErrors,
    },
  });

  return {
    checkedProducts: productIds.length,
    priceChangesChecked,
    confirmed,
    rejected,
    corrected,
    fetchErrors,
    message,
  };
}
