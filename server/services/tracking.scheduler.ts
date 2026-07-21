import { db } from "../db";
import { trackedProducts, detectedChanges } from "@shared/schema";
import { eq, and, sql, desc, isNull, isNotNull, count, ne, or } from "drizzle-orm";
import {
  getTrackingSettings,
  isTrackingSettingsTableReady,
} from "./tracking-settings.service";
import { isScrapeGatewaySettingsTableReady } from "./scrape-gateway-settings.service";
import { trackingService } from "./tracking.service";
import {
  fetchSourceForTracking,
  hasSufficientVariantCoverage,
} from "./source-fetcher.service";
import { compareSnapshots, persistDetectedChanges } from "./product-diff.service";
import {
  getLastShopifyTrackingReconcileStatus,
  reconcileShopifyTracking,
  type ShopifyTrackingReconcileResult,
} from "./shopify-tracking-reconciliation.service";
import {
  getProductTrackingMigrationStatus,
  refreshProductTrackingTableStatus,
  ensureTrackingUidColumns,
  isMissingColumnError,
} from "../migrations/run-product-tracking-migration";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
const checkingProducts = new Set<number>();
const SHOPIFY_RECONCILE_INTERVAL_MS = 60 * 60_000;
const SHOPIFY_RECONCILE_RETRY_DELAY_MS = 5 * 60_000;
let shopifyReconcilePromise: Promise<ShopifyTrackingReconcileResult> | null = null;
let lastShopifyReconcileAttemptAt: Date | null = null;

let schedulerState = {
  lastRunAt: null as Date | null,
  lastRunStatus: "idle" as "idle" | "success" | "error" | "skipped",
  nextRunAt: null as Date | null,
  lastRunId: null as string | null,
};

export function isShopifyTrackingReconcileDue(
  last: { status: string; created_at: Date | string } | null,
  now = Date.now(),
): boolean {
  return !(
    last?.status === "success" &&
    now - new Date(last.created_at).getTime() < SHOPIFY_RECONCILE_INTERVAL_MS
  );
}

export async function triggerShopifyTrackingReconcile(
  force = false,
): Promise<ShopifyTrackingReconcileResult | null> {
  if (shopifyReconcilePromise) return shopifyReconcilePromise;

  const now = Date.now();
  if (
    !force &&
    lastShopifyReconcileAttemptAt &&
    now - lastShopifyReconcileAttemptAt.getTime() < SHOPIFY_RECONCILE_RETRY_DELAY_MS
  ) {
    return null;
  }

  if (!force) {
    const last = await getLastShopifyTrackingReconcileStatus().catch(() => null);
    if (!isShopifyTrackingReconcileDue(last, now)) return null;
  }

  lastShopifyReconcileAttemptAt = new Date();
  shopifyReconcilePromise = reconcileShopifyTracking().finally(() => {
    shopifyReconcilePromise = null;
  });
  return shopifyReconcilePromise;
}

export function releaseStaleCheckLocks(): void {
  checkingProducts.clear();
  console.info("ℹ️ Tracking check kilitleri temizlendi (restart recovery)");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function numPrice(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function visibleTrackedProductCondition() {
  return and(
    ne(trackedProducts.currentStatus, "shopify_deleted"),
    isNull(trackedProducts.archivedAt),
    or(
      isNotNull(trackedProducts.shopifyProductId),
      isNotNull(trackedProducts.shopifyProductGid),
    ),
  );
}

export async function runManualProductCheck(trackedProductId: number) {
  const settings = await getTrackingSettings();
  if (!settings.trackingEnabled) {
    throw new Error("Takip sistemi program ayarlarından kapalı");
  }

  if (checkingProducts.has(trackedProductId)) {
    return { success: false, skipped: true, message: "Bu ürün zaten kontrol ediliyor" };
  }

  checkingProducts.add(trackedProductId);
  try {
    const product = await trackingService.getProduct(trackedProductId);
    if (!product) throw new Error("Tracked product bulunamadı");

    if (!product.trackingEnabled) {
      await trackingService.writeSyncLog({
        trackedProductId,
        action: "tracking_check",
        status: "skipped",
        message: "Tracking devre dışı",
        meta: { sourceUrl: product.sourceUrl, skippedReason: "tracking_disabled" },
      });
      return { success: false, skipped: true, message: "Tracking devre dışı", checked: false };
    }

    const previousSnapshot = await trackingService.getLatestSnapshot(trackedProductId);
    const baselinePrice = numPrice(product.currentSourcePrice);
    const fetchResult = await fetchSourceForTracking(product.sourceUrl, {
      baselinePrice,
    });

    if (!fetchResult.valid) {
      const isPriceIssue = fetchResult.reason === "unreliable_price";
      if (isPriceIssue) {
        await trackingService.writeSyncLog({
          trackedProductId,
          action: "source_fetch",
          status: "warning",
          message: `Güvenilir fiyat alınamadı — baseline korundu: ${fetchResult.message}`,
          meta: {
            sourceUrl: product.sourceUrl,
            trackedProductId,
            stage: "price_sanity",
            skippedReason: fetchResult.reason,
          },
        });
        await db
          .update(trackedProducts)
          .set({ lastCheckedAt: new Date(), updatedAt: new Date() })
          .where(eq(trackedProducts.id, trackedProductId));
        return {
          success: false,
          skipped: true,
          checked: true,
          validSource: false,
          changesCreated: 0,
          userMessage: fetchResult.message,
          error: fetchResult.message,
          reason: fetchResult.reason,
        };
      }

      await trackingService.markCheckError(trackedProductId, fetchResult.message);
      await trackingService.writeSyncLog({
        trackedProductId,
        action: "source_fetch",
        status: fetchResult.reason === "fetch_error" ? "error" : "warning",
        message: fetchResult.message,
        meta: {
          sourceUrl: product.sourceUrl,
          trackedProductId,
          stage: "source_fetch",
          scrapeQuality: fetchResult.quality,
          finalSuccessReason: fetchResult.quality?.finalSuccessReason,
          skippedReason: fetchResult.reason,
          errorMessage: fetchResult.message,
        },
      });
      return {
        success: false,
        checked: true,
        validSource: false,
        changesCreated: 0,
        finalSuccessReason: fetchResult.quality?.finalSuccessReason ?? "no-usable-data",
        stageErrors: fetchResult.quality?.stageErrors ?? [],
        userMessage: fetchResult.message,
        error: fetchResult.message,
        reason: fetchResult.reason,
      };
    }

    const data = fetchResult.data;
    const previousVariantCount = Array.isArray(previousSnapshot?.variants)
      ? previousSnapshot.variants.length
      : 0;
    if (!hasSufficientVariantCoverage(previousVariantCount, data.variants.length)) {
      const message =
        `Eksik varyant ölçümü yok sayıldı (${data.variants.length}/${previousVariantCount})`;
      await db
        .update(trackedProducts)
        .set({ lastCheckedAt: new Date(), updatedAt: new Date() })
        .where(eq(trackedProducts.id, trackedProductId));
      await trackingService.writeSyncLog({
        trackedProductId,
        action: "source_fetch",
        status: "warning",
        message,
        meta: {
          previousVariantCount,
          currentVariantCount: data.variants.length,
          skippedReason: "incomplete_variant_snapshot",
        },
      });
      return {
        success: false,
        skipped: true,
        checked: true,
        validSource: false,
        changesCreated: 0,
        userMessage: message,
        reason: "incomplete_variant_snapshot",
      };
    }

    const newSnapshot = await trackingService.saveSnapshot({
      trackedProductId,
      snapshotType: "manual",
      sourceUrl: data.sourceUrl,
      title: data.title,
      price: data.price,
      stock: data.stock,
      available: data.available,
      images: data.images,
      variants: data.variants,
      rawData: data.rawData,
      quality: data.quality,
    });

    await trackingService.updateAfterSuccessfulCheck(trackedProductId, {
      price: data.price,
      stock: data.stock,
      title: data.title,
    });

    let changesCreated = 0;
    if (previousSnapshot) {
      const diff = await compareSnapshots(trackedProductId, previousSnapshot, data, {
        knownGoodPrice: baselinePrice,
      });
      if (diff.changes.length > 0) {
        const rows = await persistDetectedChanges({
          trackedProductId,
          sourceSnapshotId: previousSnapshot.id,
          targetSnapshotId: newSnapshot.id,
          diff,
        });
        changesCreated = rows.length;
        await trackingService.writeSyncLog({
          trackedProductId,
          action: "diff_detected",
          status: "success",
          message: `${changesCreated} değişiklik tespit edildi`,
          meta: {
            sourceUrl: product.sourceUrl,
            oldSnapshotId: previousSnapshot.id,
            newSnapshotId: newSnapshot.id,
            changeCount: changesCreated,
          },
        });
      }
    }

    await trackingService.writeSyncLog({
      trackedProductId,
      action: "shopify_sync_skipped",
      status: "skipped",
      message: "Otomatik Shopify güncelleme kapalı",
      meta: { changeCount: changesCreated },
    });

    return {
      success: true,
      checked: true,
      validSource: true,
      snapshotId: newSnapshot.id,
      changesCreated,
      price: data.price,
      title: data.title,
      finalSuccessReason: data.quality?.finalSuccessReason ?? "full-data",
      stageErrors: (data.quality?.stageErrors as string[]) ?? [],
      userMessage: "Kontrol başarılı",
    };
  } finally {
    checkingProducts.delete(trackedProductId);
  }
}

async function runSchedulerCycle(allowSchemaRetry = true) {
  const runId = `run-${Date.now()}`;
  schedulerState.lastRunId = runId;

  try {
    const settings = await getTrackingSettings();
    if (!settings.trackingEnabled || !settings.schedulerEnabled) {
      schedulerState.lastRunStatus = "skipped";
      schedulerState.lastRunAt = new Date();
      return;
    }

    try {
      await triggerShopifyTrackingReconcile(false);
    } catch (err) {
      console.warn("Shopify tracking reconciliation skipped:", err);
    }

    const now = Date.now();
    const products = await db
      .select()
      .from(trackedProducts)
      .where(
        and(
          eq(trackedProducts.trackingEnabled, true),
          eq(trackedProducts.currentStatus, "active"),
          visibleTrackedProductCondition(),
        ),
      );

    const due = products.filter((p) => {
      if (checkingProducts.has(p.id)) return false;
      const intervalMin = p.checkIntervalMinutes ?? settings.checkIntervalMinutes;
      if (!p.lastCheckedAt) return true;
      const elapsed = now - new Date(p.lastCheckedAt).getTime();
      return elapsed >= intervalMin * 60_000;
    });

    const batch = due.slice(0, settings.batchSize);
    for (const p of batch) {
      try {
        await runManualProductCheck(p.id);
      } catch (err) {
        console.warn(`Scheduler check failed for product ${p.id}:`, err);
      }
      if (settings.requestDelayMs > 0) await sleep(settings.requestDelayMs);
    }

    schedulerState.lastRunStatus = "success";
    schedulerState.lastRunAt = new Date();
    schedulerState.nextRunAt = new Date(Date.now() + 60_000);

    await trackingService.writeSyncLog({
      action: "tracking_check",
      status: "success",
      message: `Scheduler cycle: ${batch.length} ürün kontrol edildi`,
      meta: { schedulerRunId: runId, changeCount: batch.length },
    });
  } catch (err) {
    if (
      allowSchemaRetry &&
      (isMissingColumnError(err, "tracking_uid") || isMissingColumnError(err, "variant_uid"))
    ) {
      const patched = await ensureTrackingUidColumns().catch(() => false);
      if (patched) {
        console.info("ℹ️ Tracking schema patch uygulandı — scheduler döngüsü yeniden deneniyor");
        await runSchedulerCycle(false);
        return;
      }
    }
    schedulerState.lastRunStatus = "error";
    schedulerState.lastRunAt = new Date();
    console.warn("Tracking scheduler cycle error:", err);
  }
}

export async function startTrackingScheduler(): Promise<void> {
  if (intervalHandle) return;

  const settings = await getTrackingSettings();
  if (!settings.schedulerEnabled) {
    console.info("ℹ️ Tracking scheduler kapalı (program ayarı: scheduler_enabled=false)");
    return;
  }

  console.log("⏰ Ürün Takip v2 scheduler başlatılıyor (Shopify ürün eşitleme: saatlik)");
  schedulerState.nextRunAt = new Date(Date.now() + 60_000);

  intervalHandle = setInterval(() => {
    void runSchedulerCycle();
  }, 60_000);
}

export function triggerImmediateSchedulerCycle(delayMs = 15_000): void {
  setTimeout(() => void runSchedulerCycle(), delayMs);
}

export function stopTrackingScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function isTrackingSchedulerRunning(): boolean {
  return intervalHandle != null;
}

export async function getTrackingSchedulerStatus() {
  const migration = await refreshProductTrackingTableStatus().catch(() =>
    getProductTrackingMigrationStatus(),
  );

  let settings: Awaited<ReturnType<typeof getTrackingSettings>> | null = null;
  let settingsReady = false;
  try {
    settingsReady = await isTrackingSettingsTableReady();
    if (settingsReady) {
      settings = await getTrackingSettings();
    }
  } catch {
    settingsReady = false;
  }

  const scrapeGatewaySettingsReady = await isScrapeGatewaySettingsTableReady().catch(
    () => false,
  );

  const lastShopifyReconcile = await getLastShopifyTrackingReconcileStatus().catch(() => null);

  if (!settings) {
    return {
      trackingEnabled: false,
      schedulerEnabled: false,
      safeSchedulerRunning: isTrackingSchedulerRunning(),
      autoShopifySyncEnabled: false,
      nextRunAt: schedulerState.nextRunAt,
      lastRunAt: schedulerState.lastRunAt,
      lastRunStatus: schedulerState.lastRunStatus,
      batchSize: 5,
      intervalMinutes: 60,
      requestDelayMs: 1500,
      pendingChangesCount: 0,
      manualReviewCount: 0,
      trackedProductsCount: 0,
      activeTrackedProductsCount: 0,
      errorProductsCount: 0,
      shopifyReconcileRunning: shopifyReconcilePromise !== null,
      lastShopifyReconcile,
      settingsReady,
      scrapeGatewaySettingsReady,
      migration: {
        allTablesReady: migration.allTablesReady,
        tables: migration.tables,
      },
      legacySystemsRemoved: true,
    };
  }

  const [trackedCount] = await db
    .select({ c: count() })
    .from(trackedProducts)
    .where(
      visibleTrackedProductCondition(),
    );
  const [activeCount] = await db
    .select({ c: count() })
    .from(trackedProducts)
    .where(
      and(
        eq(trackedProducts.trackingEnabled, true),
        eq(trackedProducts.currentStatus, "active"),
        visibleTrackedProductCondition(),
      ),
    );

  const [pendingCount] = await db
    .select({ c: count() })
    .from(detectedChanges)
    .innerJoin(trackedProducts, eq(detectedChanges.trackedProductId, trackedProducts.id))
    .where(and(eq(detectedChanges.status, "pending"), visibleTrackedProductCondition()));

  const [manualCount] = await db
    .select({ c: count() })
    .from(detectedChanges)
    .innerJoin(trackedProducts, eq(detectedChanges.trackedProductId, trackedProducts.id))
    .where(and(eq(detectedChanges.status, "manual_review"), visibleTrackedProductCondition()));

  const [errorCount] = await db
    .select({ c: count() })
    .from(trackedProducts)
    .where(eq(trackedProducts.currentStatus, "error"));

  return {
    trackingEnabled: settings.trackingEnabled,
    schedulerEnabled: settings.schedulerEnabled,
    safeSchedulerRunning: isTrackingSchedulerRunning(),
    autoShopifySyncEnabled: false,
    nextRunAt: schedulerState.nextRunAt,
    lastRunAt: schedulerState.lastRunAt,
    lastRunStatus: schedulerState.lastRunStatus,
    batchSize: settings.batchSize,
    intervalMinutes: settings.checkIntervalMinutes,
    requestDelayMs: settings.requestDelayMs,
    pendingChangesCount: Number(pendingCount?.c ?? 0),
    manualReviewCount: Number(manualCount?.c ?? 0),
    trackedProductsCount: Number(trackedCount?.c ?? 0),
    activeTrackedProductsCount: Number(activeCount?.c ?? 0),
    errorProductsCount: Number(errorCount?.c ?? 0),
    shopifyReconcileRunning: shopifyReconcilePromise !== null,
    lastShopifyReconcile,
    settingsReady: true,
    scrapeGatewaySettingsReady,
    migration: {
      allTablesReady: migration.allTablesReady,
      tables: migration.tables,
    },
    legacySystemsRemoved: true,
  };
}

export async function getTrackingNotifications() {
  const status = await getTrackingSchedulerStatus();

  const lastChanges = await db
    .select()
    .from(detectedChanges)
    .where(and(isNull(detectedChanges.seenAt), eq(detectedChanges.status, "pending")))
    .orderBy(desc(detectedChanges.createdAt))
    .limit(20);

  const priceChangeCount = await db
    .select({ c: count() })
    .from(detectedChanges)
    .where(and(eq(detectedChanges.changeType, "price_changed"), eq(detectedChanges.status, "pending")));

  const stockChangeCount = await db
    .select({ c: count() })
    .from(detectedChanges)
    .where(and(eq(detectedChanges.changeType, "stock_changed"), eq(detectedChanges.status, "pending")));

  const variantChangeCount = await db
    .select({ c: count() })
    .from(detectedChanges)
    .where(
      sql`${detectedChanges.changeType} IN ('variant_added','variant_removed','variant_changed','variant_price_changed','variant_stock_changed') AND ${detectedChanges.status} = 'pending'`,
    );

  return {
    pendingChangesCount: status.pendingChangesCount,
    manualReviewCount: status.manualReviewCount,
    priceChangeCount: Number(priceChangeCount[0]?.c ?? 0),
    stockChangeCount: Number(stockChangeCount[0]?.c ?? 0),
    variantChangeCount: Number(variantChangeCount[0]?.c ?? 0),
    lastChanges,
  };
}
