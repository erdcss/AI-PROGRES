import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  categorizeBrowserWorkerError,
  mapBrowserWorkerStageError,
  normalizeBrowserWorkerSecret,
  resolveBrowserWorkerEndpoint,
  createScrapeCorrelationId,
} from "../services/browser-worker-client.service.ts";
import { formatScrapeDeployUserMessage } from "../../shared/scrape-runtime.ts";

describe("browser-worker-client — env normalize", () => {
  it("strips wrapping quotes and whitespace from secrets", () => {
    assert.equal(normalizeBrowserWorkerSecret('  "abc-token"  '), "abc-token");
    assert.equal(normalizeBrowserWorkerSecret("'abc-token'"), "abc-token");
    assert.equal(normalizeBrowserWorkerSecret("abc-token\r\n"), "abc-token");
    assert.equal(normalizeBrowserWorkerSecret("   "), null);
    assert.equal(normalizeBrowserWorkerSecret(null), null);
  });

  it("prefers BROWSER_WORKER_URL over ENDPOINT and strips trailing slash", () => {
    assert.equal(
      resolveBrowserWorkerEndpoint("https://worker.example.com/", "https://ignored.example.com"),
      "https://worker.example.com",
    );
    assert.equal(
      resolveBrowserWorkerEndpoint(null, "https://worker.example.com/scrape/"),
      "https://worker.example.com/scrape",
    );
    assert.equal(resolveBrowserWorkerEndpoint(undefined, undefined), null);
  });

  it("creates opaque correlation ids", () => {
    const id = createScrapeCorrelationId();
    assert.match(id, /^bw-[a-z0-9]+-[a-z0-9]+$/i);
  });
});

describe("browser-worker-client — error categories", () => {
  it("maps auth http statuses to auth category", () => {
    assert.equal(categorizeBrowserWorkerError(new Error("x"), 401).category, "auth");
    assert.equal(categorizeBrowserWorkerError(new Error("x"), 403).category, "auth");
    assert.equal(mapBrowserWorkerStageError("auth"), "browser-worker-unauthorized");
  });

  it("maps timeout errors", () => {
    const err = Object.assign(new Error("timeout of 45000ms exceeded"), {
      code: "ECONNABORTED",
    });
    assert.equal(categorizeBrowserWorkerError(err).category, "timeout");
    assert.equal(mapBrowserWorkerStageError("timeout"), "browser-worker-timeout");
  });

  it("maps not-configured and blocked", () => {
    assert.equal(mapBrowserWorkerStageError("not-configured"), "browser-worker-not-configured");
    assert.equal(mapBrowserWorkerStageError("blocked"), "browser-worker-blocked");
    assert.equal(mapBrowserWorkerStageError("unknown"), "browser-worker-failed");
  });
});

describe("formatScrapeDeployUserMessage — auth vs quality", () => {
  it("surfaces unauthorized distinctly from extraction quality", () => {
    const msg = formatScrapeDeployUserMessage({
      selectedScrapeMode: "auto-fast",
      effectiveScrapeMode: "auto-fast",
      isCloudRuntime: true,
      puppeteerAllowed: false,
      apiStarted: false,
      apiSuccess: false,
      directHtmlStarted: false,
      directHtmlSuccess: false,
      htmlParseStarted: false,
      htmlParseSuccess: false,
      imageFetcherStarted: false,
      imageFetcherSuccess: false,
      imageFallbackStarted: false,
      imageFallbackSuccess: false,
      stageErrors: ["browser-worker-unauthorized"],
      finalSuccessReason: "browser-worker-failed",
    });
    assert.match(msg, /token|yetkilendirme|Worker/i);
    assert.doesNotMatch(msg, /Kaynak veri doğrulanamadı/);
  });

  it("keeps quality rejection message for missing core fields", () => {
    const msg = formatScrapeDeployUserMessage({
      selectedScrapeMode: "auto-fast",
      effectiveScrapeMode: "auto-fast",
      isCloudRuntime: true,
      puppeteerAllowed: false,
      apiStarted: true,
      apiSuccess: false,
      directHtmlStarted: true,
      directHtmlSuccess: false,
      htmlParseStarted: false,
      htmlParseSuccess: false,
      imageFetcherStarted: false,
      imageFetcherSuccess: false,
      imageFallbackStarted: false,
      imageFallbackSuccess: false,
      stageErrors: ["browser-worker-timeout", "api-null-response"],
      finalSuccessReason: "no-usable-data",
    });
    assert.match(msg, /Tarayıcı Worker|Geçerli fiyat|zaman|yanıt vermedi/i);
  });
});

describe("turkish luxury prices still parse", () => {
  it("keeps 5-6 digit TL formats", async () => {
    const { parseTurkishPriceText } = await import("../trendyol-price-utils.ts");
    assert.equal(parseTurkishPriceText("9.999 TL"), 9999);
    assert.equal(parseTurkishPriceText("12.499,90 TL"), 12499.9);
    assert.equal(parseTurkishPriceText("113.266,00 TL"), 113266);
  });
});

describe("env isolation for endpoint resolution", () => {
  const prevUrl = process.env.BROWSER_WORKER_URL;
  const prevEndpoint = process.env.BROWSER_WORKER_ENDPOINT;
  const prevToken = process.env.BROWSER_WORKER_TOKEN;

  beforeEach(() => {
    delete process.env.BROWSER_WORKER_URL;
    delete process.env.BROWSER_WORKER_ENDPOINT;
    delete process.env.BROWSER_WORKER_TOKEN;
  });

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.BROWSER_WORKER_URL;
    else process.env.BROWSER_WORKER_URL = prevUrl;
    if (prevEndpoint === undefined) delete process.env.BROWSER_WORKER_ENDPOINT;
    else process.env.BROWSER_WORKER_ENDPOINT = prevEndpoint;
    if (prevToken === undefined) delete process.env.BROWSER_WORKER_TOKEN;
    else process.env.BROWSER_WORKER_TOKEN = prevToken;
  });

  it("isBrowserWorkerConfigured requires both endpoint and token", async () => {
    const { isBrowserWorkerConfigured } = await import(
      "../services/browser-worker-client.service.ts"
    );
    assert.equal(isBrowserWorkerConfigured(), false);
    process.env.BROWSER_WORKER_URL = "https://worker.example.com/";
    assert.equal(isBrowserWorkerConfigured(), false);
    process.env.BROWSER_WORKER_TOKEN = '"secret-token"';
    assert.equal(isBrowserWorkerConfigured(), true);
  });
});
