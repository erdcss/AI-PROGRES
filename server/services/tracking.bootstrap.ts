import { logProductTrackingV2Startup } from "@shared/deploy-runtime";
import {
  runProductTrackingMigration,
  refreshProductTrackingTableStatus,
  ensureTrackingUidColumns,
} from "../migrations/run-product-tracking-migration";
import { ensureTrackingSettings } from "./tracking-settings.service";
import { ensureScrapeGatewaySettings } from "./scrape-gateway-settings.service";
import { seedInternalSourceAccessFromEnv } from "./source-access-manager.service";
import {
  startTrackingScheduler,
  releaseStaleCheckLocks,
  triggerImmediateSchedulerCycle,
  isTrackingSchedulerRunning,
} from "./tracking.scheduler";
import {
  ensureLocalTrackingAutoStart,
  syncShopifyMemoryToTracking,
} from "./tracking-sync.service";
import { backfillTrackingUids } from "./tracking-uid-backfill.service";
import {
  reconcileUnreliablePriceChanges,
  supersedeStaleTrackingChanges,
} from "./tracking-reconcile.service";
import { runStartupTrackingAndShopifyAudit } from "./tracking-startup-audit.service";
import { isCloudRuntime } from "@shared/deploy-runtime";
import { trackingService } from "./tracking.service";
import { runControlCenterMigration } from "../migrations/run-control-center-migration";
import { runMobilePushMigration } from "../migrations/run-mobile-push-migration";
import { runMarktGoMigration } from "../migrations/run-marktgo-migration";
import { resumePendingImportJobs } from "./import-job-runner.service";

/** Ürün Takip v2 — tek resmi başlatma noktası */
export async function bootstrapProductTrackingV2(): Promise<void> {
  const migrationOk = await runProductTrackingMigration(true);
  const controlCenterOk = await runControlCenterMigration(true);
  await runMobilePushMigration(true);
  await runMarktGoMigration(true);
  const status = await refreshProductTrackingTableStatus();

  if (!migrationOk || !status.allTablesReady) {
    console.error("❌ Product Tracking v2 bootstrap: migration tamamlanamadı", {
      tables: status.tables,
      error: status.error,
      controlCenterOk,
    });
    logProductTrackingV2Startup({
      safeSchedulerRunning: false,
      trackingEnabled: false,
      migrationIncomplete: true,
    });
    return;
  }

  try {
    await ensureTrackingUidColumns();
    await ensureTrackingSettings();
    await ensureLocalTrackingAutoStart();
    await ensureScrapeGatewaySettings();
    await seedInternalSourceAccessFromEnv();
    releaseStaleCheckLocks();

    try {
      await trackingService.cleanupInvalidRecordsOnStartup();
    } catch (err) {
      console.warn("⚠️ Startup cleanup atlandı:", err);
    }

    try {
      await syncShopifyMemoryToTracking();
    } catch (err) {
      console.warn("⚠️ Shopify → v2 takip senkronu atlandı:", err);
    }

    try {
      await backfillTrackingUids();
    } catch (err) {
      console.warn("⚠️ Takip UID backfill atlandı:", err);
    }

    try {
      await reconcileUnreliablePriceChanges();
      await supersedeStaleTrackingChanges();
    } catch (err) {
      console.warn("⚠️ Takip değişiklik temizliği atlandı:", err);
    }

    await startTrackingScheduler();
    // Açılış: takip + Shopify hard-delete + silme doğrulaması + uygulama içi bildirimler
    setTimeout(() => {
      void runStartupTrackingAndShopifyAudit().catch((err) =>
        console.warn("⚠️ Açılış Shopify/takip denetimi atlandı:", err),
      );
    }, isCloudRuntime() ? 10_000 : 3_000);
    triggerImmediateSchedulerCycle(isCloudRuntime() ? 15_000 : 5_000);

    if (controlCenterOk) {
      void resumePendingImportJobs();
    }

    const settings = await ensureTrackingSettings();
    logProductTrackingV2Startup({
      safeSchedulerRunning: isTrackingSchedulerRunning(),
      trackingEnabled: settings.trackingEnabled,
    });
  } catch (err) {
    console.warn("⚠️ Product Tracking v2 bootstrap hatası:", err);
    logProductTrackingV2Startup({
      safeSchedulerRunning: false,
      trackingEnabled: false,
      bootstrapError: (err as Error).message,
    });
  }
}
