import { logProductTrackingV2Startup } from "@shared/deploy-runtime";
import { runProductTrackingMigration } from "../migrations/run-product-tracking-migration";
import { ensureTrackingSettings } from "./tracking-settings.service";
import { ensureScrapeGatewaySettings } from "./scrape-gateway-settings.service";
import { startTrackingScheduler, releaseStaleCheckLocks } from "./tracking.scheduler";
import { trackingService } from "./tracking.service";

/** Ürün Takip v2 — tek resmi başlatma noktası */
export async function bootstrapProductTrackingV2(): Promise<void> {
  await runProductTrackingMigration();
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
}
