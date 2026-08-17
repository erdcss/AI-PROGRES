import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetTrendyolBlockGuardForTests,
  classifyTrendyolBlock,
  getTrendyolBlockStatus,
  isTrendyolCircuitOpen,
  recordTrendyolBlock,
  recordTrendyolSuccess,
  resolveTrendyolHttpProxy,
  shouldSkipDirectHtmlAfterBlock,
} from "../trendyol-block-guard.ts";

describe("classifyTrendyolBlock", () => {
  it("detects Cloudflare challenge HTML", () => {
    const signal = classifyTrendyolBlock({
      source: "html",
      httpStatus: 403,
      html: `<html><body><div id="cf-browser-verification">Just a moment</div></body></html>`,
      title: "Just a moment...",
    });
    assert.ok(signal);
    assert.equal(signal!.kind, "cloudflare");
  });

  it("detects upstream 556", () => {
    const signal = classifyTrendyolBlock({
      source: "api",
      httpStatus: 556,
      bodyPreview: "upstream status code 556",
    });
    assert.ok(signal);
    assert.equal(signal!.kind, "upstream-556");
    assert.equal(signal!.httpStatus, 556);
  });

  it("detects 403 JSON access denied", () => {
    const signal = classifyTrendyolBlock({
      source: "api",
      httpStatus: 403,
      bodyPreview: `{"statusCode":403,"error":"Access Denied"}`,
    });
    assert.ok(signal);
    assert.equal(signal!.kind, "access-denied");
  });

  it("returns null for clean product HTML", () => {
    const html = `<!DOCTYPE html><html><head><title>Ürün</title></head>
<body><script>window.__PRODUCT_DETAIL_APP_INITIAL_STATE__={"product":{"id":123,"name":"Gömlek"}}</script>
<div class="product-detail">ok</div></body></html>`;
    const signal = classifyTrendyolBlock({
      source: "html",
      httpStatus: 200,
      html,
      title: "Gömlek - Trendyol",
    });
    assert.equal(signal, null);
  });

  it("maps contentClass captcha", () => {
    const signal = classifyTrendyolBlock({
      source: "browser_worker",
      contentClass: "captcha",
    });
    assert.ok(signal);
    assert.equal(signal!.kind, "captcha");
  });
});

describe("circuit breaker", () => {
  const prevThreshold = process.env.TRENDYOL_BLOCK_THRESHOLD;
  const prevCooldown = process.env.TRENDYOL_BLOCK_COOLDOWN_MS;
  const prevDedupe = process.env.TRENDYOL_BLOCK_DEDUPE_MS;

  beforeEach(() => {
    __resetTrendyolBlockGuardForTests();
    process.env.TRENDYOL_BLOCK_THRESHOLD = "3";
    process.env.TRENDYOL_BLOCK_COOLDOWN_MS = "600000";
    process.env.TRENDYOL_BLOCK_DEDUPE_MS = "0";
  });

  afterEach(() => {
    __resetTrendyolBlockGuardForTests();
    if (prevThreshold === undefined) delete process.env.TRENDYOL_BLOCK_THRESHOLD;
    else process.env.TRENDYOL_BLOCK_THRESHOLD = prevThreshold;
    if (prevCooldown === undefined) delete process.env.TRENDYOL_BLOCK_COOLDOWN_MS;
    else process.env.TRENDYOL_BLOCK_COOLDOWN_MS = prevCooldown;
    if (prevDedupe === undefined) delete process.env.TRENDYOL_BLOCK_DEDUPE_MS;
    else process.env.TRENDYOL_BLOCK_DEDUPE_MS = prevDedupe;
  });

  it("dedupes same block kind within window", () => {
    process.env.TRENDYOL_BLOCK_DEDUPE_MS = "45000";
    const base = { kind: "access-denied" as const, source: "api" as const };
    recordTrendyolBlock(base);
    recordTrendyolBlock(base);
    recordTrendyolBlock(base);
    assert.equal(getTrendyolBlockStatus().consecutiveFails, 1);
    assert.equal(isTrendyolCircuitOpen(), false);
  });

  it("trips OPEN after N consecutive blocks", () => {
    const base = {
      kind: "cloudflare" as const,
      source: "html" as const,
    };
    assert.equal(isTrendyolCircuitOpen(), false);
    recordTrendyolBlock(base);
    recordTrendyolBlock(base);
    assert.equal(isTrendyolCircuitOpen(), false);
    recordTrendyolBlock(base);
    assert.equal(isTrendyolCircuitOpen(), true);
    const status = getTrendyolBlockStatus();
    assert.equal(status.open, true);
    assert.equal(status.consecutiveFails, 3);
    assert.ok(status.remainingMs > 0);
    assert.equal(status.lastKind, "cloudflare");
  });

  it("success resets consecutive fails and closes circuit", () => {
    const base = { kind: "upstream-556" as const, source: "api" as const };
    recordTrendyolBlock(base);
    recordTrendyolBlock(base);
    recordTrendyolBlock(base);
    assert.equal(isTrendyolCircuitOpen(), true);
    recordTrendyolSuccess();
    assert.equal(isTrendyolCircuitOpen(), false);
    assert.equal(getTrendyolBlockStatus().consecutiveFails, 0);
  });

  it("shouldSkipDirectHtmlAfterBlock for confirmed WAF kinds", () => {
    assert.equal(
      shouldSkipDirectHtmlAfterBlock({ kind: "cloudflare", source: "puppeteer" }),
      true,
    );
    assert.equal(
      shouldSkipDirectHtmlAfterBlock({ kind: "upstream-556", source: "html" }),
      true,
    );
    assert.equal(
      shouldSkipDirectHtmlAfterBlock({ kind: "upstream-556", source: "api" }),
      false,
      "API 556 must not skip product-page HTML",
    );
    assert.equal(shouldSkipDirectHtmlAfterBlock(null), false);
  });
});

describe("resolveTrendyolHttpProxy", () => {
  const prevA = process.env.TRENDYOL_HTTP_PROXY;
  const prevB = process.env.INTERNAL_PROXY_URL;

  afterEach(() => {
    if (prevA === undefined) delete process.env.TRENDYOL_HTTP_PROXY;
    else process.env.TRENDYOL_HTTP_PROXY = prevA;
    if (prevB === undefined) delete process.env.INTERNAL_PROXY_URL;
    else process.env.INTERNAL_PROXY_URL = prevB;
  });

  it("prefers TRENDYOL_HTTP_PROXY", () => {
    process.env.TRENDYOL_HTTP_PROXY = "http://proxy.example:8080";
    process.env.INTERNAL_PROXY_URL = "http://other:9";
    assert.equal(resolveTrendyolHttpProxy(), "http://proxy.example:8080");
  });

  it("falls back to INTERNAL_PROXY_URL", () => {
    delete process.env.TRENDYOL_HTTP_PROXY;
    process.env.INTERNAL_PROXY_URL = "http://internal:3128";
    assert.equal(resolveTrendyolHttpProxy(), "http://internal:3128");
  });

  it("returns null when unset", () => {
    delete process.env.TRENDYOL_HTTP_PROXY;
    delete process.env.INTERNAL_PROXY_URL;
    assert.equal(resolveTrendyolHttpProxy(), null);
  });
});

describe("pipeline rejects when circuit OPEN", () => {
  const prevThreshold = process.env.TRENDYOL_BLOCK_THRESHOLD;
  const prevCooldown = process.env.TRENDYOL_BLOCK_COOLDOWN_MS;
  const prevDedupe = process.env.TRENDYOL_BLOCK_DEDUPE_MS;

  beforeEach(() => {
    __resetTrendyolBlockGuardForTests();
    process.env.TRENDYOL_BLOCK_THRESHOLD = "2";
    process.env.TRENDYOL_BLOCK_COOLDOWN_MS = "600000";
    process.env.TRENDYOL_BLOCK_DEDUPE_MS = "0";
  });

  afterEach(() => {
    __resetTrendyolBlockGuardForTests();
    if (prevThreshold === undefined) delete process.env.TRENDYOL_BLOCK_THRESHOLD;
    else process.env.TRENDYOL_BLOCK_THRESHOLD = prevThreshold;
    if (prevCooldown === undefined) delete process.env.TRENDYOL_BLOCK_COOLDOWN_MS;
    else process.env.TRENDYOL_BLOCK_COOLDOWN_MS = prevCooldown;
    if (prevDedupe === undefined) delete process.env.TRENDYOL_BLOCK_DEDUPE_MS;
    else process.env.TRENDYOL_BLOCK_DEDUPE_MS = prevDedupe;
  });

  it("runTrendyolScrapePipeline short-circuits without stages", async () => {
    recordTrendyolBlock({ kind: "cloudflare", source: "html" });
    recordTrendyolBlock({ kind: "cloudflare", source: "html" });
    assert.equal(isTrendyolCircuitOpen(), true);

    const { runTrendyolScrapePipeline } = await import("../trendyol-scrape-pipeline.ts");
    const outcome = await runTrendyolScrapePipeline(
      "https://www.trendyol.com/brand/x-p-123456789",
    );
    assert.equal(outcome.success, false);
    assert.ok(outcome.diagnostics.stageErrors.includes("trendyol-circuit-open"));
    assert.equal(outcome.diagnostics.scenarioSkippedReason, "trendyol-circuit-open");
    assert.equal(outcome.diagnostics.pipelineDurationMs, 0);
    assert.match(String(outcome.result.deployUserMessage || ""), /engelledi|bekleyin/i);
  });
});
