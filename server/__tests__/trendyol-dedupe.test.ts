import assert from "node:assert/strict";
import {
  extractTrendyolProductId,
  trendyolStableLocalProductId,
} from "../services/marktgo/trendyol-dedupe.service";

assert.equal(
  extractTrendyolProductId(
    "https://www.trendyol.com/rimense/kadin-canta-p-992046791?boutiqueId=61&merchantId=123",
  ),
  "992046791",
);
assert.equal(extractTrendyolProductId("trendyol_1186733340"), "1186733340");
assert.equal(extractTrendyolProductId("trendyol:1186733340"), "1186733340");
assert.equal(extractTrendyolProductId("https://example.com/product/1"), null);
assert.equal(trendyolStableLocalProductId("992046791"), "trendyol_992046791");
assert.equal(trendyolStableLocalProductId(""), null);

console.log("trendyol-dedupe tests passed");
