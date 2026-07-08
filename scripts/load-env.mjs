/**
 * Central .env loader for all Node entrypoints (idempotent).
 *
 * Resolution order:
 *   1. .env
 *   2. .env.local
 *   3. env (N) backup files, newest first
 */
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const defaultEnvPath = path.join(root, ".env");
const primaryEnvNames = [".env", ".env.local"];
const backupEnvPattern = /^env \(\d+\)$/i;

let loaded = false;
let resolvedEnvPath = null;

function getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

export function resolveProjectEnvPath() {
  for (const fileName of primaryEnvNames) {
    const candidate = path.join(root, fileName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const backups = entries
    .filter((entry) => entry.isFile() && backupEnvPattern.test(entry.name))
    .map((entry) => {
      const filePath = path.join(root, entry.name);
      return {
        filePath,
        fileName: entry.name,
        mtimeMs: getMtimeMs(filePath),
      };
    })
    .sort((a, b) => {
      if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
      return b.fileName.localeCompare(a.fileName, undefined, { numeric: true });
    });

  return backups[0]?.filePath ?? null;
}

export function loadProjectEnv() {
  if (!loaded) {
    resolvedEnvPath = resolveProjectEnvPath();
    if (resolvedEnvPath) {
      config({ path: resolvedEnvPath, override: false });
    }
    loaded = true;
  }

  const exists = Boolean(resolvedEnvPath);
  return {
    envLoaded: exists,
    envPath: resolvedEnvPath ?? defaultEnvPath,
    envFile: resolvedEnvPath ? path.basename(resolvedEnvPath) : null,
    exists,
  };
}

export function maskEnvPath(value) {
  if (!value?.trim()) return null;
  const v = value.trim();
  if (v.length <= 12) return "***";
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export function logEnvBootstrapSummary(source) {
  const envState = loadProjectEnv();
  const browserWorkerUrl =
    process.env.BROWSER_WORKER_URL?.trim() ||
    process.env.BROWSER_WORKER_ENDPOINT?.trim() ||
    "";
  const localAgentEndpoint = process.env.INTERNAL_LOCAL_AGENT_ENDPOINT?.trim() || "";

  console.info(`[ENV_BOOTSTRAP] source=${source}`, {
    envLoaded: envState.envLoaded,
    envFile: envState.envFile,
    envFileExists: envState.exists,
    DATABASE_URL: process.env.DATABASE_URL?.trim() ? "set" : "missing",
    SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN?.trim() ? "set" : "missing",
    PORT: process.env.PORT ? "set" : "missing",
    FORCE_PUPPETEER_SCRAPE: process.env.FORCE_PUPPETEER_SCRAPE === "true",
    PUPPETEER_EXECUTABLE_PATH: Boolean(process.env.PUPPETEER_EXECUTABLE_PATH?.trim()),
    puppeteerPathHint: maskEnvPath(process.env.PUPPETEER_EXECUTABLE_PATH),
    LOCAL_AGENT_PORT: process.env.LOCAL_AGENT_PORT ? "set" : "missing",
    INTERNAL_LOCAL_AGENT_ENDPOINT: Boolean(localAgentEndpoint),
    localAgentHostHint: localAgentEndpoint
      ? maskEnvPath(localAgentEndpoint.replace(/^https?:\/\//, ""))
      : null,
    BROWSER_WORKER_URL: Boolean(browserWorkerUrl),
    browserWorkerHostHint: browserWorkerUrl
      ? maskEnvPath(browserWorkerUrl.replace(/^https?:\/\//, ""))
      : null,
    USE_EXTERNAL_LOCAL_AGENT: process.env.USE_EXTERNAL_LOCAL_AGENT === "true",
  });
}
