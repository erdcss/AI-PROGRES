/** Yerel vs bulut (Replit/Railway vb.) çalışma ortamı — yalnızca Puppeteer/cloud tespiti */

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

export function logProductTrackingV2Startup(meta: Record<string, unknown>): void {
  console.info("🛡️ Ürün Takip Sistemi v2:", {
    productTrackingV2Enabled: true,
    legacyMonitoringRemoved: true,
    legacyPriceMonitoringRemoved: true,
    legacyProductScheduleRemoved: true,
    autonomousSyncDisabledByDesign: true,
    ...meta,
  });
}
