#!/usr/bin/env node
/**
 * Live Trendyol scrape smoke test.
 * Usage: node scripts/trendyol-live-scrape-smoke.mjs "<trendyol-url>"
 */

const base =
  process.env.SCRAPE_TEST_BASE_URL?.trim() ||
  process.env.SHOPIFY_TEST_BASE_URL?.trim() ||
  "http://127.0.0.1:5000";

const noStoreHeaders = { "Cache-Control": "no-store" };

const testUrl =
  process.argv[2] ||
  "https://www.trendyol.com/calliel/ton-esitleyici-aydinlik-verici-yogun-nemlendirici-50-spf-gunes-kremi-80-ml-p-951534808?boutiqueId=61&merchantId=830154";

function resolvePollDeadlineMs(capabilities) {
  const globalTimeoutMs =
    typeof capabilities.globalTimeoutMs === "number" ? capabilities.globalTimeoutMs : 180_000;
  return Math.max(globalTimeoutMs + 45_000, 240_000);
}

async function pollJob(jobId, deadlineMs) {
  const started = Date.now();
  let lastStatus = "processing";
  let lastBody = null;

  while (Date.now() - started < deadlineMs) {
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(`${base.replace(/\/$/, "")}/api/scrape-job/${jobId}`, {
      cache: "no-store",
      headers: noStoreHeaders,
    });

    if (res.status === 404) {
      const err = new Error("job not found; server may have restarted");
      err.code = "job_not_found";
      err.jobId = jobId;
      err.elapsedMs = Date.now() - started;
      err.deadlineMs = deadlineMs;
      throw err;
    }

    const data = await res.json();
    lastBody = data;
    lastStatus = data.status;
    if (data.status === "processing") continue;
    return { data, durationMs: Date.now() - started };
  }

  const err = new Error("job polling timeout");
  err.jobId = jobId;
  err.lastStatus = lastStatus;
  err.elapsedMs = Date.now() - started;
  err.deadlineMs = deadlineMs;
  err.lastResponse = lastBody;
  throw err;
}

async function main() {
  console.log(`[smoke] base URL: ${base}`);
  console.log(`[smoke] product URL: ${testUrl}`);

  const capRes = await fetch(`${base.replace(/\/$/, "")}/api/runtime/scrape-capabilities`, {
    cache: "no-store",
    headers: noStoreHeaders,
  });
  const capabilities = await capRes.json().catch(() => ({}));
  console.log("[smoke] capabilities:", JSON.stringify(capabilities, null, 2));

  const pollDeadlineMs = resolvePollDeadlineMs(capabilities);
  console.log(`[smoke] poll deadline: ${pollDeadlineMs}ms`);

  const pipelineStart = Date.now();
  const startRes = await fetch(`${base.replace(/\/$/, "")}/api/trendyol-scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...noStoreHeaders },
    body: JSON.stringify({ url: testUrl, onlyExtractData: true, scrapeMode: "auto-fast" }),
  });
  const startBody = await startRes.json();
  if (!startRes.ok || !startBody.jobId) {
    console.error("[smoke] scrape start failed", startRes.status, startBody);
    process.exit(1);
  }

  console.log(`[smoke] jobId=${startBody.jobId}`);
  const { data: job, durationMs } = await pollJob(startBody.jobId, pollDeadlineMs);
  const result = job.result || {};
  const summary = {
    finalStatus: job.status,
    durationMs,
    pipelineDurationMs: Date.now() - pipelineStart,
    title: result.title,
    price: result.price?.original ?? result.price,
    imageCount: Array.isArray(result.images) ? result.images.length : 0,
    variantCount: result.variants?.allVariants?.length ?? 0,
    sizes: result.variants?.sizes,
    sourceProductId: result.sourceProductId || result.urlProductId,
    stageErrors: result.stageErrors || job.stageErrors,
    imageFetcherSkippedReason: result.imageFetcherSkippedReason || job.imageFetcherSkippedReason,
    partialSuccess: result.partialSuccess,
    previewOk: result.previewOk,
    chromiumSource: capabilities.chromiumSource,
    selectedProviders: capabilities.selectedProviders,
  };

  console.log("[smoke] summary:", JSON.stringify(summary, null, 2));

  if (job.status === "error") process.exit(1);
  if (job.status === "success" || job.status === "partial_success") process.exit(0);
  process.exit(1);
}

main().catch((err) => {
  console.error("[smoke] failed:", err.message);
  if (err.jobId) console.error("[smoke] jobId:", err.jobId);
  if (err.lastStatus) console.error("[smoke] last status:", err.lastStatus);
  if (err.elapsedMs != null) console.error("[smoke] elapsedMs:", err.elapsedMs);
  if (err.deadlineMs != null) console.error("[smoke] deadlineMs:", err.deadlineMs);
  if (err.lastResponse) {
    console.error("[smoke] last job response:", JSON.stringify(err.lastResponse, null, 2));
  }
  process.exit(1);
});
