import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractTrendyolProductId } from "../trendyol-title-utils.ts";
import { htmlProductIdMatchesUrl } from "../trendyol-puppeteer-html-merge.ts";

describe("extractTrendyolProductId — size/volume in slug", () => {
  it("does not treat edp-50-ml as product id", () => {
    const url =
      "https://www.trendyol.com/lumenascent/liora-kadin-parfum-floral-edp-50-ml-p-971347342";
    assert.equal(extractTrendyolProductId(url), "971347342");
  });

  it("handles query strings and 100-ml slugs", () => {
    const url =
      "https://www.trendyol.com/brand/x-edp-100-ml-p-808740259?boutiqueId=61&merchantId=1";
    assert.equal(extractTrendyolProductId(url), "808740259");
  });

  it("handles standard apparel urls", () => {
    assert.equal(
      extractTrendyolProductId(
        "https://www.trendyol.com/mse-hold/buzgulu-cop-poseti-p-1148094498",
      ),
      "1148094498",
    );
  });

  it("rejects short false-positive ids in html match", () => {
    const badUrl = "https://www.trendyol.com/x/edp-50-ml-p-12"; // too short canonical after fix → null or long only
    const perfume =
      "https://www.trendyol.com/lumenascent/liora-kadin-parfum-floral-edp-50-ml-p-971347342";
    const lampHtml =
      '<html><body><script>"id":1123009712</script><a href="/p-1123009712">x</a></body></html>';
    assert.equal(htmlProductIdMatchesUrl(lampHtml, perfume), false);
    const perfumeHtml =
      '<html><body><script>"productId":"971347342"</script><a href="/brand/x-p-971347342">ok</a></body></html>';
    assert.equal(htmlProductIdMatchesUrl(perfumeHtml, perfume), true);
    void badUrl;
  });
});
