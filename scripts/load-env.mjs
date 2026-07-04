/**
 * Central .env loader for all Node entrypoints (idempotent).
 */
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

let loaded = false;

export function loadProjectEnv() {
  if (loaded) {
    return { envLoaded: true, envPath, exists: fs.existsSync(envPath) };
  }
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
  loaded = true;
  return { envLoaded: true, envPath, exists: fs.existsSync(envPath) };
}

export function maskEnvPath(value) {
  if (!value?.trim()) return null;
  const v = value.trim();
  if (v.length <= 12) return "***";
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export function logEnvBootstrapSummary(source) {
  const browserWorkerUrl =
    process.env.BROWSER_WORKER_URL?.trim() ||
    process.env.BROWSER_WORKER_ENDPOINT?.trim() ||
    "";
  const localAgentEndpoint = process.env.INTERNAL_LOCAL_AGENT_ENDPOINT?.trim() || "";

  console.info(`[ENV_BOOTSTRAP] source=${source}`, {
    envFileExists: fs.existsSync(envPath),
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
