#!/usr/bin/env node
/**
 * Live import-job E2E v2 — scrape only, no Shopify upload.
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
  console.log(`\n🧪 Import job live E2E v2 → ${BASE}\n`);

  const createRes = await fetch(`${BASE}/api/import-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": `e2e-v2-${Date.now()}` },
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
  console.log(`✓ New job created: ${jobId}`);

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
  const canonical = job?.canonicalProduct;
  const quality = job?.qualityResult;

  console.log("\n--- Sonuç ---");
  console.log("jobId:", job?.jobId);
  console.log("status:", job?.status);
  console.log("quality:", quality?.status, quality?.score);
  console.log("titleSource:", quality?.provenance?.title?.source ?? canonical?.diagnostics?.titleSource);
  console.log("variants:", job?.variantCount);
  console.log("unique images:", quality?.provenance?.images?.uniqueCount ?? canonical?.diagnostics?.uniqueImageCount);
  console.log("raw images:", quality?.provenance?.images?.rawCount ?? canonical?.diagnostics?.rawImageCount);
  console.log("sourcePrice:", canonical?.sourcePrice);
  console.log("blockers:", quality?.blockers?.join(", ") || "none");
  console.log("pipelineMs:", canonical?.diagnostics?.pipelineDurationMs);

  const sizes = (canonical?.variants || [])
    .map((v) => v.option2Value || v.option1Value)
    .filter(Boolean);
  console.log("variant sizes:", [...new Set(sizes)].join(", "));

  const hardcodedStock = (canonical?.variants || []).filter((v) => v.stockQuantity === 10).length;
  const tekRenkWithNamed = (canonical?.variants || []).some(
    (v) => /tek\s*renk/i.test(v.option1Value || "") || /tek\s*renk/i.test(v.option2Value || ""),
  );
  const namedColors = (canonical?.variants || []).filter(
    (v) => v.option1Value && !/tek\s*renk/i.test(v.option1Value),
  ).length;

  const dryRes = await fetch(`${BASE}/api/import-jobs/${jobId}/dry-run`, { method: "POST" });
  const dry = await dryRes.json();
  console.log("\ndry-run mode:", dry.result?.mode);
  console.log("approvalState:", dry.result?.approvalState);
  console.log("safeToApply:", dry.result?.safeToApply);
  console.log("variantChanges.create:", dry.result?.variantChanges?.create?.length ?? 0);
  console.log("canonicalHash:", dry.canonicalHash);
  console.log("shopifySnapshotHash:", dry.shopifySnapshotHash);
  console.log("hash equal:", dry.canonicalHash === dry.shopifySnapshotHash);

  const checks = {
    awaiting: job?.status === "awaiting_approval",
    notApproved100: quality?.status !== "approved" || quality?.score < 100,
    noHardcodedStock: hardcodedStock === 0,
    variantCountReasonable: job?.variantCount <= 15,
    noTekRenkConflict: !(tekRenkWithNamed && namedColors > 0),
    dryRunModeOk: dry.result?.mode === "create" || dry.result?.mode === "update",
    hashSeparated: dry.shopifySnapshotHash == null || dry.canonicalHash !== dry.shopifySnapshotHash,
    sourceProductId: job?.sourceProductId === "1158681520",
  };

  console.log("\n--- Kontroller ---");
  for (const [k, v] of Object.entries(checks)) {
    console.log(`${v ? "✓" : "✗"} ${k}`);
  }

  const ok = Object.values(checks).every(Boolean);
  if (!ok) {
    console.error("\n❌ E2E v2 FAILED");
    process.exit(1);
  }

  console.log("\n✅ E2E v2 PASSED (no Shopify upload)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
