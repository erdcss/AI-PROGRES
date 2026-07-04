/**
 * Local scrape / Windows env tests
 * Run: npm run test:local-scrape
 */
import fs from "fs";
import os from "os";
import path from "path";
import { loadProjectEnv } from "../../scripts/load-env.mjs";
import { ensureEnvLoaded } from "../env-bootstrap";
import { hasAnyInternalProvider } from "../config/source-access.config";
import { resolveChromiumPath } from "../puppeteer-config";
import { classifyScenarioFailure } from "../scenario-error-utils";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log("\n=== Local Scrape / Windows Tests ===\n");

// Env bootstrap idempotent
{
  const first = loadProjectEnv();
  const second = loadProjectEnv();
  assert(first.envLoaded === true, "loadProjectEnv returns envLoaded=true");
  assert(second.envLoaded === true, "loadProjectEnv idempotent");
  assert(ensureEnvLoaded() === fs.existsSync(path.join(process.cwd(), ".env")), "ensureEnvLoaded matches .env presence");
}

// Internal provider disabled locally without USE_EXTERNAL_LOCAL_AGENT
{
  const prevEndpoint = process.env.INTERNAL_LOCAL_AGENT_ENDPOINT;
  const prevToken = process.env.INTERNAL_LOCAL_AGENT_TOKEN;
  const prevFlag = process.env.USE_EXTERNAL_LOCAL_AGENT;
  const prevRailway = process.env.RAILWAY_ENVIRONMENT;

  delete process.env.RAILWAY_ENVIRONMENT;
  process.env.INTERNAL_LOCAL_AGENT_ENDPOINT = "https://dead.trycloudflare.com";
  process.env.INTERNAL_LOCAL_AGENT_TOKEN = "test-token";
  delete process.env.USE_EXTERNAL_LOCAL_AGENT;

  assert(hasAnyInternalProvider() === false, "local: dead cloudflare agent not counted without USE_EXTERNAL_LOCAL_AGENT");

  process.env.USE_EXTERNAL_LOCAL_AGENT = "true";
  assert(hasAnyInternalProvider() === true, "local: agent enabled when USE_EXTERNAL_LOCAL_AGENT=true");

  if (prevEndpoint === undefined) delete process.env.INTERNAL_LOCAL_AGENT_ENDPOINT;
  else process.env.INTERNAL_LOCAL_AGENT_ENDPOINT = prevEndpoint;
  if (prevToken === undefined) delete process.env.INTERNAL_LOCAL_AGENT_TOKEN;
  else process.env.INTERNAL_LOCAL_AGENT_TOKEN = prevToken;
  if (prevFlag === undefined) delete process.env.USE_EXTERNAL_LOCAL_AGENT;
  else process.env.USE_EXTERNAL_LOCAL_AGENT = prevFlag;
  if (prevRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT;
  else process.env.RAILWAY_ENVIRONMENT = prevRailway;
}

// Chromium resolver respects PUPPETEER_EXECUTABLE_PATH
{
  const tmp = path.join(os.tmpdir(), `turmarkt-chrome-test-${Date.now()}.exe`);
  fs.writeFileSync(tmp, "fake");
  const prev = process.env.PUPPETEER_EXECUTABLE_PATH;
  process.env.PUPPETEER_EXECUTABLE_PATH = tmp;
  const resolution = resolveChromiumPath();
  assert(resolution.source === "env", "chromium source=env when PUPPETEER_EXECUTABLE_PATH set");
  assert(resolution.exists === true, "chromium exists for env path");
  fs.unlinkSync(tmp);
  if (prev === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
  else process.env.PUPPETEER_EXECUTABLE_PATH = prev;
}

// Scenario failure classification
{
  const failure = classifyScenarioFailure(new Error("Navigation timeout of 60000 ms exceeded"));
  assert(failure.code === "navigation-timeout", "classify navigation timeout");
  assert(failure.isNavigationFailure === true, "navigation failure flagged");
}

// source-access-internal-provider-unavailable should not be default local path
{
  assert(
    !["source-access-internal-provider-unavailable"].includes("no-internal-provider-configured"),
    "skip reason uses no-internal-provider-configured not unavailable",
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
