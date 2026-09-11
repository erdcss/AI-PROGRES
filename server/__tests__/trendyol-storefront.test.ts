import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTrendyolTurkeyStorefront, isTrendyolCountrySelection } from "../../shared/trendyol-storefront";
import { gotoTrendyolPage } from "../../browser-worker/trendyol-navigation";
import { classifyPageContent, shouldRetryNavigation, workerErrorCategoryFromDiagnostics } from "../../browser-worker/page-diagnostics";
import { formatScrapeDeployUserMessage, type ScrapeDiagnostics } from "../../shared/scrape-runtime";
import axios from "axios";
import { scrapeTrendyolWithBrowserWorker } from "../services/browser-worker-client.service";

const product = "https://www.trendyol.com/puma/siyah-erkek-cocuk-t-shirt-is1230006134001-p-803329188?boutiqueId=61&merchantId=927119&itemNumber=123";

describe("Trendyol Türkiye storefront regression", () => {
  it("selects TR before the first navigation, preserving product, seller and variant", async () => {
    let visited = "";
    const page = {
      goto: async (url: string) => { visited = url; return { status: () => 200 }; },
      url: () => visited,
    };
    await gotoTrendyolPage(page as any, product, 15_000);
    const url = new URL(visited);
    assert.equal(url.pathname, new URL(product).pathname);
    assert.equal(url.searchParams.get("merchantId"), "927119");
    assert.equal(url.searchParams.get("boutiqueId"), "61");
    assert.equal(url.searchParams.get("itemNumber"), "123");
    assert.equal(url.searchParams.get("storefrontId"), "1");
    assert.equal(url.searchParams.get("countryCode"), "TR");
    assert.equal(url.searchParams.get("language"), "tr");
    assert.equal(withTrendyolTurkeyStorefront(visited), visited);
  });

  it("keeps other marketplaces and lookalike domains unchanged", () => {
    for (const url of ["https://www.n11.com/product?x=1", "https://trendyol.com.example.org/x-p-12345"]) {
      assert.equal(withTrendyolTurkeyStorefront(url), url);
      assert.equal(isTrendyolCountrySelection(url.replace(/\/x-p-12345$/, "/en/select-country")), false);
    }
  });

  it("selects a visible Türkiye store link once and returns to the original product in the same page", async () => {
    const visits: string[] = [];
    let clicked = 0;
    let current = "about:blank";
    const page = {
      goto: async (url: string) => {
        visits.push(url);
        current = visits.length === 1 ? "https://www.trendyol.com/en/select-country" : url;
        return { status: () => 200 };
      },
      url: () => current,
      getByRole: () => ({ first: () => ({
        isVisible: async () => true,
        getAttribute: async () => "https://www.trendyol.com/",
        click: async () => { clicked++; },
      }) }),
    };
    await gotoTrendyolPage(page as any, product, 15_000);
    assert.equal(clicked, 1);
    assert.equal(visits.length, 2);
    assert.equal(visits[0], visits[1]);
    assert.equal(current, withTrendyolTurkeyStorefront(product));
  });

  it("does not retry access denials, login pages or follow off-site country links", async () => {
    for (const finalUrl of ["https://www.trendyol.com/giris", "https://www.trendyol.com/en/select-country"]) {
      for (const status of [200, 403]) {
        let visits = 0;
        const page = {
          goto: async () => { visits++; return { status: () => status }; },
          url: () => finalUrl,
          getByRole: () => ({ first: () => ({
            isVisible: async () => true,
            getAttribute: async () => "https://trendyol.com.example.org/",
            click: async () => assert.fail("must not click off-site link"),
          }) }),
        };
        await gotoTrendyolPage(page as any, product, 15_000);
        assert.equal(visits, 1);
      }
    }
  });

  it("reports the observed country selector as navigation, never an IP ban or product", () => {
    const diag = classifyPageContent({
      html: "<html><body>Select country Türkiye</body></html>" + " ".repeat(260_000),
      finalUrl: "https://www.trendyol.com/en/select-country",
      navigationStatus: 200,
      title: "Trendyol | Shop for Latest Fashion Trends & Accessories",
      bodyText: "Select country Türkiye",
    });
    assert.equal(diag.contentClass, "country-selection");
    assert.equal(diag.isUsableProductHtml, false);
    assert.equal(diag.challengeBlocked, false);
    assert.equal(workerErrorCategoryFromDiagnostics(diag), "navigation");
    assert.equal(shouldRetryNavigation(diag), false);
    const message = formatScrapeDeployUserMessage({
      stageErrors: ["browser-worker-country-selection", "upstream-556", "direct-html-error"],
      isCloudRuntime: true,
    } as ScrapeDiagnostics);
    assert.match(message, /ülke seçimi/);
    assert.doesNotMatch(message, /engel|ban koruması/);
  });

  it("preserves the worker's country-selection error through the HTTP client and forwards the deadline", async () => {
    const previousAdapter = axios.defaults.adapter;
    const previousUrl = process.env.BROWSER_WORKER_URL;
    const previousToken = process.env.BROWSER_WORKER_TOKEN;
    process.env.BROWSER_WORKER_URL = "https://worker.example.test";
    process.env.BROWSER_WORKER_TOKEN = "unit-test-only";
    axios.defaults.adapter = async (config) => {
      assert.equal(JSON.parse(config.data).deadlineMs, 24_000);
      return { status: 422, statusText: "Unprocessable Entity", headers: {}, config,
        data: { ok: false, html: "x".repeat(260_000), errorCategory: "navigation",
          finalUrl: "https://www.trendyol.com/en/select-country",
          diagnostics: { contentClass: "country-selection", challengeBlocked: false } },
      };
    };
    try {
      const result = await scrapeTrendyolWithBrowserWorker(product, { clientTimeoutMs: 25_000 });
      assert.equal(result.success, false);
      assert.equal(result.stageError, "browser-worker-country-selection");
      assert.equal(result.errorCategory, "navigation");
    } finally {
      axios.defaults.adapter = previousAdapter;
      if (previousUrl === undefined) delete process.env.BROWSER_WORKER_URL;
      else process.env.BROWSER_WORKER_URL = previousUrl;
      if (previousToken === undefined) delete process.env.BROWSER_WORKER_TOKEN;
      else process.env.BROWSER_WORKER_TOKEN = previousToken;
    }
  });
});
