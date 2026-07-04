#!/usr/bin/env node
/**
 * Live import-job E2E — scrape only, no Shopify upload.
 * Usage: node scripts/import-job-live-e2e.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://127.0.0.1:5000";
const TEST_URL =
  "https://www.trendyol.com/trend-emmoda/erkek-minimal-palmiye-baskili-sifir-kol-yuvarlak-bisiklet-yaka-bej-rengi-tisort-tshirt-p-1158681520?boutiqueId=61&merchantId=1248368";

const TIMEOUT_MS = 300_000;
const POLL_MS = 5000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`\n🧪 Import job live E2E → ${BASE}\n`);

  const createRes = await fetch(`${BASE}/api/import-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": `e2e-${Date.now()}` },
    body: JSON.stringify({
      sourceUrl: TEST_URL,
      uploadMode: "manual_approval",
      scrapeMode: "auto-fast",
    }),
  });
  const createBody = await createRes.json();
  if (!createRes.ok || !createBody.jobId) {
    console.error("❌ POST /api/import-jobs failed:", createBody);
    process.exit(1);
  }
  const jobId = createBody.jobId;
  console.log(`✓ Job created: ${jobId}`);

  const deadline = Date.now() + TIMEOUT_MS;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const detailRes = await fetch(`${BASE}/api/import-jobs/${jobId}`);
    const detail = await detailRes.json();
    const status = detail.job?.status;
    if (status !== lastStatus) {
      console.log(`  status: ${status} (${detail.job?.progressPercentage ?? 0}%)`);
      lastStatus = status;
    }
    if (["awaiting_approval", "failed", "cancelled", "completed"].includes(status)) break;
    await sleep(POLL_MS);
  }

  const finalRes = await fetch(`${BASE}/api/import-jobs/${jobId}`);
  const final = await finalRes.json();
  const job = final.job;
  const events = final.events || [];

  console.log("\n--- Sonuç ---");
  console.log("status:", job?.status);
  console.log("sourceProductId:", job?.sourceProductId);
  console.log("title:", job?.canonicalProduct?.title);
  console.log("price:", job?.canonicalProduct?.originalPrice);
  console.log("variants:", job?.variantCount);
  console.log("images:", job?.imageCount);
  console.log("quality:", job?.qualityStatus, job?.qualityScore);
  console.log("events:", events.length);

  const sizes = (job?.canonicalProduct?.variants || []).map((v) => v.size).filter(Boolean);
  console.log("sizes:", sizes.join(", "));

  const ok =
    job?.status === "awaiting_approval" &&
    job?.sourceProductId === "1158681520" &&
    (job?.canonicalProduct?.originalPrice || 0) > 0 &&
    job?.variantCount >= 5 &&
    job?.imageCount >= 1 &&
    job?.qualityScore != null;

  if (!ok) {
    console.error("\n❌ E2E FAILED");
    process.exit(1);
  }

  // dry-run (read-only Shopify)
  const dryRes = await fetch(`${BASE}/api/import-jobs/${jobId}/dry-run`, { method: "POST" });
  const dry = await dryRes.json();
  console.log("\ndry-run mode:", dry.result?.mode || dry.mode);
  console.log("safeToApply:", dry.result?.safeToApply);

  console.log("\n✅ E2E PASSED (no Shopify upload)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
