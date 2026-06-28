/** Yerel vs bulut (Replit/Railway vb.) çalışma ortamı */

function isExplicitCloudHost(): boolean {
  return Boolean(
    process.env.REPL_ID ||
      process.env.REPLIT_DEPLOYMENT === "1" ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_NAME ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      process.env.VERCEL ||
      process.env.SKIP_PUPPETEER_SCRAPE === "true",
  );
}

export function isCloudRuntime(): boolean {
  if (isExplicitCloudHost()) return true;

  if (
    process.env.NODE_ENV === "production" &&
    (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME)
  ) {
    return true;
  }

  return false;
}

function envFlag(name: string, defaultInCloud: boolean): boolean {
  const raw = process.env[name];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return isCloudRuntime() ? defaultInCloud : true;
}

/** Cloud'da varsayılan kapalı — TRACKING_ENABLED=true ile açılır */
export function isTrackingEnabled(): boolean {
  return envFlag("TRACKING_ENABLED", false);
}

export function isMonitoringEnabled(): boolean {
  return envFlag("MONITORING_ENABLED", false);
}

export function isAutonomousSyncEnabled(): boolean {
  return envFlag("AUTONOMOUS_SYNC_ENABLED", false);
}

export function isPriceMonitoringEnabled(): boolean {
  return envFlag("PRICE_MONITORING_ENABLED", false);
}

export function isProductScheduleMonitoringEnabled(): boolean {
  return envFlag("PRODUCT_SCHEDULE_MONITORING_ENABLED", false);
}

export function isScheduleMonitoringEnabled(): boolean {
  return envFlag("SCHEDULE_MONITORING_ENABLED", false);
}

/** Otomatik tracking scheduler — ilk aşamada kapalı */
export function isTrackingSchedulerEnabled(): boolean {
  return envFlag("TRACKING_SCHEDULER_ENABLED", false);
}

export function getTrackingSchedulerSkippedReason(): string | null {
  if (!isTrackingEnabled()) return "TRACKING_ENABLED=false";
  if (!isTrackingSchedulerEnabled()) return "TRACKING_SCHEDULER_ENABLED=false";
  return null;
}

export function getPriceMonitoringSkippedReason(): string | null {
  if (!isMonitoringEnabled()) return "MONITORING_ENABLED=false";
  if (!isPriceMonitoringEnabled()) return "PRICE_MONITORING_ENABLED=false";
  return null;
}

export function getProductScheduleMonitoringSkippedReason(): string | null {
  if (!isMonitoringEnabled()) return "MONITORING_ENABLED=false";
  if (!isProductScheduleMonitoringEnabled()) return "PRODUCT_SCHEDULE_MONITORING_ENABLED=false";
  if (!isScheduleMonitoringEnabled()) return "SCHEDULE_MONITORING_ENABLED=false";
  return null;
}

export function getAutonomousSyncSkippedReason(): string | null {
  if (!isAutonomousSyncEnabled()) return "AUTONOMOUS_SYNC_ENABLED=false";
  return null;
}

/** Cloud'da Puppeteer/Chromium yalnızca ENABLE_PUPPETEER_IN_CLOUD=true ile açılır */
export function puppeteerAllowed(): boolean {
  if (process.env.FORCE_PUPPETEER_SCRAPE === "true") return true;
  if (!isCloudRuntime()) return true;
  return process.env.ENABLE_PUPPETEER_IN_CLOUD === "true";
}

export function shouldPreferApiOnlyScrape(): boolean {
  if (process.env.FORCE_PUPPETEER_SCRAPE === "true") return false;
  return isCloudRuntime() && !puppeteerAllowed();
}

export function logStartupMonitoringGuards(): void {
  const trackingReason = getTrackingSchedulerSkippedReason();
  const priceReason = getPriceMonitoringSkippedReason();
  const scheduleReason = getProductScheduleMonitoringSkippedReason();
  const syncReason = getAutonomousSyncSkippedReason();

  console.info("🛡️ Monitoring guard durumu:", {
    trackingSchedulerSkippedReason: trackingReason ?? "none",
    priceMonitoringSkippedReason: priceReason ?? "none",
    productScheduleMonitoringSkippedReason: scheduleReason ?? "none",
    autonomousSyncSkippedReason: syncReason ?? "none",
  });
}
