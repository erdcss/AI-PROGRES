/** Yerel vs bulut (Replit/Railway vb.) çalışma ortamı */

export function isCloudRuntime(): boolean {
  return Boolean(
    process.env.REPL_ID ||
      process.env.REPLIT_DEPLOYMENT === "1" ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      process.env.VERCEL ||
      process.env.SKIP_PUPPETEER_SCRAPE === "true",
  );
}

export function shouldPreferApiOnlyScrape(): boolean {
  if (process.env.FORCE_PUPPETEER_SCRAPE === "true") return false;
  return isCloudRuntime();
}
