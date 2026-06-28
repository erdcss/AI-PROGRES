import { logProductTrackingV2Startup } from "@shared/deploy-runtime";
import {
  runProductTrackingMigration,
  refreshProductTrackingTableStatus,
} from "../migrations/run-product-tracking-migration";
import { ensureTrackingSettings } from "./tracking-settings.service";
import { ensureScrapeGatewaySettings } from "./scrape-gateway-settings.service";
import { startTrackingScheduler, releaseStaleCheckLocks } from "./tracking.scheduler";
import { trackingService } from "./tracking.service";

/** Ürün Takip v2 — tek resmi başlatma noktası */
export async function bootstrapProductTrackingV2(): Promise<void> {
  const migrationOk = await runProductTrackingMigration(true);
  const status = await refreshProductTrackingTableStatus();

  if (!migrationOk || !status.allTablesReady) {
    console.error("❌ Product Tracking v2 bootstrap: migration tamamlanamadı", {
      tables: status.tables,
      error: status.error,
    });
    logProductTrackingV2Startup({
      safeSchedulerRunning: false,
      trackingEnabled: false,
      migrationIncomplete: true,
    });
    return;
  }

  try {
    await ensureTrackingSettings();
    await ensureScrapeGatewaySettings();
    releaseStaleCheckLocks();

    try {
      await trackingService.cleanupInvalidRecordsOnStartup();
    } catch (err) {
      console.warn("⚠️ Startup cleanup atlandı:", err);
    }

    startTrackingScheduler();

    const settings = await ensureTrackingSettings();
    logProductTrackingV2Startup({
      safeSchedulerRunning: settings.schedulerEnabled,
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
