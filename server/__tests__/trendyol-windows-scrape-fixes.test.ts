/**
 * Windows scrape fix regression tests
 * Run: npm run test:scrape-fixes
 */
import os from "os";
import { domStockEvaluateScript } from "../trendyol-puppeteer-stock-extractor";
import {
  htmlProductIdMatchesUrl,
  mergeTrendyolHtmlCoreIntoResult,
  parseTrendyolCoreFromHtml,
} from "../trendyol-puppeteer-html-merge";
import { resolveChromiumPath } from "../puppeteer-config";
import { curlSupportsHttp2 } from "../curl-fetch";
import { getSessionBrowserFingerprint } from "../browser-fingerprint";

const TEST_URL =
  "https://www.trendyol.com/trend-emmoda/erkek-minimal-palmiye-baskili-sifir-kol-yuvarlak-bisiklet-yaka-bej-rengi-tisort-tshirt-p-1158681520?boutiqueId=61&merchantId=1248368";

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

function resolvePollDeadlineMs(globalTimeoutMs: number): number {
  return Math.max(globalTimeoutMs + 45_000, 240_000);
}

function buildFixtureHtml(): string {
  const pad = "x".repeat(6000);
  return `${pad}
<script type="application/ld+json">
{"@type":"Product","name":"Erkek Minimal Palmiye Baskılı Sıfır Kol Yuvarlak Bisiklet Yaka Bej Rengi Tişört / Tshirt","brand":{"name":"Trend EmModa"},"offers":{"price":"299.99","priceCurrency":"TRY"}}
</script>
<script>window.__PRODUCT_DETAIL_APP_INITIAL_STATE__={"product":{"id":1158681520,"name":"Erkek Minimal Palmiye Baskılı Sıfır Kol Yuvarlak Bisiklet Yaka Bej Rengi Tişört / Tshirt","brand":{"name":"Trend EmModa"},"price":{"sellingPrice":299.99},"images":[{"url":"https://cdn.dsmcdn.com/ty123/prod/QC_test.jpg"}]}};</script>
<div class="slicing-attribute-section-value"><button>S</button><button>M</button><button>L</button><button>XL</button><button>2XL</button></div>`;
}

console.log("\n=== Trendyol Windows Scrape Fixes ===\n");

{
  const src = domStockEvaluateScript.toString();
  assert(!src.includes("isValidSizeLabel("), "domStockEvaluateScript does not reference outer isValidSizeLabel");
  assert(src.includes("isValidSizeLabelInDom"), "domStockEvaluateScript inlines size label helper");
  assert(src.includes("const OOS_TEXT"), "domStockEvaluateScript inlines OOS_TEXT regex");
}

{
  const html = buildFixtureHtml();
  assert(htmlProductIdMatchesUrl(html, TEST_URL), "fixture HTML matches product id from URL");
  const wrongHtml = html.replace(/1158681520/g, "9999999999");
  assert(!htmlProductIdMatchesUrl(wrongHtml, TEST_URL), "wrong product id rejected");
}

{
  const html = buildFixtureHtml();
  const parsed = parseTrendyolCoreFromHtml(html, TEST_URL, "test-fixture");
  assert(parsed != null, "parseTrendyolCoreFromHtml returns data");
  assert(
    (parsed?.title || "").includes("Palmiye"),
    "fixture title contains Palmiye",
  );
  assert((parsed?.price?.original ?? 0) > 0, "fixture price > 0");

  const target: Record<string, unknown> = { title: "slicing attribute product", price: { original: 0 } };
  mergeTrendyolHtmlCoreIntoResult(target, parsed!, TEST_URL);
  assert(
    String(target.title).includes("Palmiye"),
    "merge replaces placeholder title",
  );
  assert((target.price as { original: number }).original > 0, "merge sets price");
  assert(Array.isArray(target.images) && target.images.length > 0, "merge sets images");
}

{
  const resolution = resolveChromiumPath();
  if (process.platform === "win32") {
    assert(!resolution.path?.includes("/nix/store"), "Windows: no nix store chromium path");
  }
}

{
  assert(resolvePollDeadlineMs(180_000) >= 225_000, "poll deadline >= 225000 for 180s global timeout");
  assert(resolvePollDeadlineMs(120_000) >= 240_000, "poll deadline minimum 240000");
}

{
  const supports = curlSupportsHttp2();
  assert(typeof supports === "boolean", "curlSupportsHttp2 returns boolean without throwing");
}

{
  const fp = getSessionBrowserFingerprint();
  if (process.platform === "win32") {
    assert(fp.platform === "Win32", "Windows session fingerprint platform Win32");
    assert(fp.userAgent.includes("Windows NT"), "Windows UA contains Windows NT");
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
