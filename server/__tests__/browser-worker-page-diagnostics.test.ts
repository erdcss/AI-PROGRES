import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPageContent,
  isEmptyHtmlDocument,
  shouldRetryNavigation,
  workerErrorCategoryFromDiagnostics,
  byteLengthUtf8,
} from "../../browser-worker/page-diagnostics.ts";
import { mapBrowserWorkerStageError } from "../services/browser-worker-client.service.ts";

const EMPTY_39 = "<html><head></head><body></body></html>";

describe("page-diagnostics — empty / 39-byte shell", () => {
  it("detects classic empty playwright document (39 bytes)", () => {
    assert.equal(byteLengthUtf8(EMPTY_39), 39);
    assert.equal(isEmptyHtmlDocument(EMPTY_39), true);
    const diag = classifyPageContent({
      html: EMPTY_39,
      finalUrl: "https://www.trendyol.com/brand/item-p-123456",
      navigationStatus: 200,
      title: "",
      bodyText: "",
    });
    assert.equal(diag.contentClass, "empty-document");
    assert.equal(diag.blockReason, "empty-document");
    assert.equal(diag.isUsableProductHtml, false);
    assert.equal(shouldRetryNavigation(diag), true);
  });

  it("accepts real product HTML with state marker", () => {
    const html = `<!doctype html><html><head><title>Ürün</title></head><body>
      <script>window.__PRODUCT_DETAIL_APP_INITIAL_STATE__={"product":{"id":123456,"name":"Test"}}</script>
      <div class="gallery-container"><img src="https://cdn.dsmcdn.com/a.jpg"/></div>
      ${"x".repeat(6000)}
    </body></html>`;
    const diag = classifyPageContent({
      html,
      finalUrl: "https://www.trendyol.com/brand/test-urun-p-123456",
      navigationStatus: 200,
      title: "Test Ürün",
      bodyText: "Test Ürün 1.299 TL",
    });
    assert.equal(diag.contentClass, "product-html");
    assert.equal(diag.hasProductStateJson, true);
    assert.equal(diag.isUsableProductHtml, true);
    assert.equal(shouldRetryNavigation(diag), false);
  });
});

describe("page-diagnostics — blocked / challenge / redirect", () => {
  it("classifies 403 access denied", () => {
    const diag = classifyPageContent({
      html: "<html><body>Access Denied</body></html>" + "x".repeat(200),
      finalUrl: "https://www.trendyol.com/x-p-1",
      navigationStatus: 403,
      title: "Access Denied",
      bodyText: "Access Denied",
    });
    assert.equal(diag.contentClass, "access-denied");
    assert.equal(diag.challengeBlocked, true);
    assert.equal(workerErrorCategoryFromDiagnostics(diag), "blocked");
  });

  it("classifies cloudflare challenge page", () => {
    const diag = classifyPageContent({
      html:
        "<html><body><div id='challenge-platform'>Just a moment...</div>cloudflare cf-browser-verification</body></html>" +
        "y".repeat(300),
      finalUrl: "https://www.trendyol.com/x-p-1",
      navigationStatus: 200,
      title: "Just a moment...",
      bodyText: "Just a moment... cloudflare",
    });
    assert.equal(diag.contentClass, "cloudflare-challenge");
    assert.equal(diag.challengeBlocked, true);
    assert.equal(mapBrowserWorkerStageError("blocked"), "browser-worker-blocked");
  });

  it("classifies off-product redirect", () => {
    const diag = classifyPageContent({
      html: "<html><body>" + "z".repeat(2000) + "</body></html>",
      finalUrl: "https://www.trendyol.com/giris",
      navigationStatus: 200,
      title: "Giriş",
      bodyText: "Giriş yap",
    });
    assert.equal(diag.contentClass, "product-redirect");
    assert.equal(diag.blockReason, "product-redirect");
    assert.equal(workerErrorCategoryFromDiagnostics(diag), "navigation");
  });

  it("classifies status 556 as upstream-556 blocked", () => {
    const diag = classifyPageContent({
      html: "<html><body>blocked</body></html>" + "x".repeat(200),
      finalUrl: "https://www.trendyol.com/x-p-1",
      navigationStatus: 556,
      title: "Error",
      bodyText: "Request failed",
    });
    assert.equal(diag.contentClass, "upstream-556");
    assert.equal(diag.challengeBlocked, true);
    assert.equal(workerErrorCategoryFromDiagnostics(diag), "blocked");
  });
});

describe("page-diagnostics — hydration-thin shell", () => {
  it("flags thin JS shell without product state", () => {
    const html = `<html><head></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    const diag = classifyPageContent({
      html,
      finalUrl: "https://www.trendyol.com/brand/x-p-99999",
      navigationStatus: 200,
      title: "",
      bodyText: "",
    });
    assert.equal(diag.contentClass, "javascript-shell");
    assert.equal(shouldRetryNavigation(diag), true);
  });
});

describe("blocked category preserved for main service", () => {
  it("maps blocked to browser-worker-blocked stage error", () => {
    assert.equal(mapBrowserWorkerStageError("blocked"), "browser-worker-blocked");
    assert.notEqual(mapBrowserWorkerStageError("blocked"), "browser-worker-invalid-response");
  });
});
