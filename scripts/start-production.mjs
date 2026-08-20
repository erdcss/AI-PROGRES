import { loadProjectEnv, logEnvBootstrapSummary } from "./load-env.mjs";
import fs from "fs";
import path from "path";

loadProjectEnv();
logEnvBootstrapSummary("start-production");

process.env.NODE_ENV = "production";

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME,
);

function applyDefaultEnv(key, value) {
  if (!process.env[key]) process.env[key] = value;
}

if (isRailway) {
  // Production scrape hız profili: tarayıcı işi Browser Worker'da kalır.
  // Railway env'de açıkça verilen timeout değerleri korunur.
  process.env.ENABLE_PUPPETEER_IN_CLOUD = "false";
  applyDefaultEnv("BROWSER_WORKER_TIMEOUT_MS", "30000");
  applyDefaultEnv("CLOUD_SCRAPE_GLOBAL_TIMEOUT_MS", "45000");
  applyDefaultEnv("CLOUD_SCRAPE_JOB_MAX_MS", "60000");
  applyDefaultEnv("TRENDYOL_BLOCK_BACKOFF_MS", "500");

  console.log("⚡ Railway Trendyol hızlı profil aktif", {
    browserWorkerTimeoutMs: process.env.BROWSER_WORKER_TIMEOUT_MS,
    cloudGlobalTimeoutMs: process.env.CLOUD_SCRAPE_GLOBAL_TIMEOUT_MS,
    cloudJobMaxMs: process.env.CLOUD_SCRAPE_JOB_MAX_MS,
    blockBackoffMs: process.env.TRENDYOL_BLOCK_BACKOFF_MS,
    mainServicePuppeteer: process.env.ENABLE_PUPPETEER_IN_CLOUD,
  });
}

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  // loadProjectEnv already applied; keep for backward-compatible log below
}

const required = ["DATABASE_URL"];
const recommended = [
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_STORE_URL",
  "OPENAI_API_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`⚠️ Deploy: ${key} tanımlı değil — bazı özellikler çalışmayabilir`);
  }
}

for (const key of recommended) {
  if (!process.env[key]) {
    console.warn(`ℹ️ Deploy: ${key} eksik (isteğe bağlı)`);
  }
}

console.log(`🚀 Production başlatılıyor (PORT=${process.env.PORT || "3000"})`);
await import("../dist/index.js");
