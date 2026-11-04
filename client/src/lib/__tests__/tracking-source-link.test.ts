import assert from "node:assert/strict";
import { resolveTrackingSourceUrl } from "../tracking-source-link";

assert.equal(
  resolveTrackingSourceUrl("https://www.trendyol.com/a/p-123?merchantId=4&boutiqueId=1"),
  "https://www.trendyol.com/a/p-123?merchantId=4&boutiqueId=1",
);
assert.equal(
  resolveTrackingSourceUrl("www.n11.com/urun/ornek?magaza=1"),
  "https://www.n11.com/urun/ornek?magaza=1",
);
assert.equal(resolveTrackingSourceUrl("javascript:alert(1)"), null);
assert.equal(resolveTrackingSourceUrl("data:text/html,<script>1</script>"), null);
assert.equal(resolveTrackingSourceUrl("/internal-route"), null);
assert.equal(resolveTrackingSourceUrl(""), null);
assert.equal(resolveTrackingSourceUrl("http://localhost/private"), null);
assert.equal(resolveTrackingSourceUrl("https://name:password@example.org/p"), null);
assert.equal(resolveTrackingSourceUrl("ftp://example.org/p"), null);
console.log("Tracking source URL regression tests: OK");
