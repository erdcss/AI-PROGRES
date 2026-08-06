import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTrendyolRateLimitHtml,
  trendyolBackoffMs,
} from "../trendyol-rate-limit.ts";

describe("trendyol-rate-limit", () => {
  it("detects Turkish soft-429 page", () => {
    const html = `
      <html><body><h1>429</h1>
      <p>Aradığın içeriğe şu an ulaşılamıyor. Hemen ayrılma</p>
      </body></html>
    `;
    assert.equal(isTrendyolRateLimitHtml(html), true);
  });

  it("does not flag real product pages", () => {
    const html =
      "__PRODUCT_DETAIL_APP_INITIAL_STATE__" +
      "x".repeat(90_000) +
      '"discountedPrice"';
    assert.equal(isTrendyolRateLimitHtml(html), false);
  });

  it("backoff grows with attempt", () => {
    const a0 = trendyolBackoffMs(0, { baseMs: 1000, maxMs: 60_000 });
    const a3 = trendyolBackoffMs(3, { baseMs: 1000, maxMs: 60_000 });
    assert.ok(a0 >= 1000 && a0 < 5000);
    assert.ok(a3 > a0);
  });
});
