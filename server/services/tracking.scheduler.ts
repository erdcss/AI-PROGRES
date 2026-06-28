import { isTrackingEnabled, isTrackingSchedulerEnabled, getTrackingSchedulerSkippedReason } from "@shared/deploy-runtime";
import { trackingService } from "./tracking.service";
import { fetchSourceForTracking } from "./source-fetcher.service";
import { compareSnapshots, persistDetectedChanges } from "./product-diff.service";

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function runManualProductCheck(trackedProductId: number) {
  if (!isTrackingEnabled()) {
    throw new Error("TRACKING_ENABLED=false");
  }

  const product = await trackingService.getProduct(trackedProductId);
  if (!product) {
    throw new Error("Tracked product bulunamadı");
  }

  if (!product.trackingEnabled) {
    await trackingService.writeSyncLog({
      trackedProductId,
      action: "tracking_check",
      status: "skipped",
      message: "Tracking devre dışı",
      meta: { sourceUrl: product.sourceUrl, skippedReason: "tracking_disabled" },
    });
    return { success: false, skipped: true, message: "Tracking devre dışı" };
  }

  const previousSnapshot = await trackingService.getLatestSnapshot(trackedProductId);
  const fetchResult = await fetchSourceForTracking(product.sourceUrl);

  if (!fetchResult.valid) {
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
        skippedReason: fetchResult.reason,
        errorMessage: fetchResult.message,
      },
    });
    return {
      success: false,
      error: fetchResult.message,
      reason: fetchResult.reason,
      changesCreated: 0,
    };
  }

  const data = fetchResult.data;
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
    const diff = await compareSnapshots(trackedProductId, previousSnapshot, data);
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
        message: `${changesCreated} değişiklik tespit edildi (Shopify sync yapılmadı)`,
        meta: {
          sourceUrl: product.sourceUrl,
          trackedProductId,
          stage: "diff",
          scrapeQuality: data.quality,
          oldSnapshotId: previousSnapshot.id,
          newSnapshotId: newSnapshot.id,
          changeCount: changesCreated,
        },
      });
    } else {
      await trackingService.writeSyncLog({
        trackedProductId,
        action: "tracking_check",
        status: "success",
        message: "Değişiklik tespit edilmedi",
        meta: {
          sourceUrl: product.sourceUrl,
          oldSnapshotId: previousSnapshot.id,
          newSnapshotId: newSnapshot.id,
          changeCount: 0,
        },
      });
    }
  } else {
    await trackingService.writeSyncLog({
      trackedProductId,
      action: "tracking_check",
      status: "success",
      message: "İlk snapshot kaydedildi",
      meta: {
        sourceUrl: product.sourceUrl,
        newSnapshotId: newSnapshot.id,
        changeCount: 0,
      },
    });
  }

  await trackingService.writeSyncLog({
    trackedProductId,
    action: "shopify_sync_skipped",
    status: "skipped",
    message: "Otomatik Shopify güncelleme devre dışı — manuel onay bekleniyor",
    meta: { sourceUrl: product.sourceUrl, changeCount: changesCreated },
  });

  return {
    success: true,
    snapshotId: newSnapshot.id,
    changesCreated,
    price: data.price,
    title: data.title,
  };
}

export function startTrackingScheduler(): void {
  const skipReason = getTrackingSchedulerSkippedReason();
  if (skipReason) {
    console.info(`ℹ️ Tracking scheduler atlandı: ${skipReason}`);
    return;
  }

  if (intervalHandle) return;

  console.log("⏰ Tracking scheduler başlatılıyor (manuel-onay modu, otomatik Shopify sync YOK)");

  intervalHandle = setInterval(async () => {
    try {
      const products = await trackingService.listProducts();
      const due = products.filter((p) => {
        if (!p.trackingEnabled) return false;
        if (!p.lastCheckedAt) return true;
        const mins = p.checkIntervalMinutes ?? 1440;
        const elapsed = Date.now() - new Date(p.lastCheckedAt).getTime();
        return elapsed >= mins * 60_000;
      });

      for (const p of due.slice(0, 5)) {
        try {
          await runManualProductCheck(p.id);
        } catch (err) {
          console.warn(`Tracking scheduler check failed for ${p.id}:`, err);
        }
      }
    } catch (err) {
      console.warn("Tracking scheduler cycle error:", err);
    }
  }, 5 * 60_000);
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

export function getTrackingSchedulerStatus() {
  return {
    enabled: isTrackingEnabled() && isTrackingSchedulerEnabled(),
    running: isTrackingSchedulerRunning(),
    skippedReason: getTrackingSchedulerSkippedReason(),
    autoShopifySync: false,
  };
}
