#!/usr/bin/env node
/**
 * Scrape capabilities smoke check for local or Railway.
 * Usage: node scripts/scrape-capabilities-check.mjs
 * Env: SHOPIFY_TEST_BASE_URL or SCRAPE_TEST_BASE_URL (default http://127.0.0.1:3000)
 */

const base =
  process.env.SCRAPE_TEST_BASE_URL?.trim() ||
  process.env.SHOPIFY_TEST_BASE_URL?.trim() ||
  "http://127.0.0.1:3000";

async function main() {
  const url = `${base.replace(/\/$/, "")}/api/runtime/scrape-capabilities`;
  console.log(`[capabilities] GET ${url}`);
  const started = Date.now();
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  console.log(`[capabilities] status=${res.status} durationMs=${Date.now() - started}`);
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok) process.exit(1);
  if (body.fatal) {
    console.warn("[capabilities] fatal=true — production scraping not ready");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[capabilities] failed:", err.message);
  process.exit(1);
});
