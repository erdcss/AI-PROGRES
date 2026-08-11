import {
  badgeCountFromNotifications,
  parseDeepLink,
  changeTypeLabel,
  changeStatusLabel,
  uniqueImageUrls,
} from "../lib/format";
import { parseWatchTag, shouldNotifyForWatchTag } from "../lib/watch-tag";
import { canOneTapShopifyFix } from "../lib/shopify-fix";
import { assertNoServiceRoleInMobileEnv } from "../lib/supabase";

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

console.log("\n=== Mobile mapping tests ===\n");

assert(parseDeepLink("orvianmonitor://product/12")?.kind === "product", "deep link product kind");
assert(parseDeepLink("orvianmonitor://product/12")?.id === 12, "deep link product id");
assert(parseDeepLink("orvianmonitor://change/99")?.kind === "change", "deep link change kind");
assert(parseDeepLink("orvianmonitor://change/99")?.id === 99, "deep link change id");
assert(parseDeepLink("https://example.com") === null, "invalid deep link null");

assert(badgeCountFromNotifications({ pendingChangesCount: 5 }) === 5, "badge from pending count");
assert(
  badgeCountFromNotifications({ lastChanges: [{}, {}] as unknown[] }) === 2,
  "badge fallback lastChanges length",
);

assert(changeTypeLabel("price_changed") === "Fiyat", "changeTypeLabel price");
assert(changeTypeLabel("stock_changed") === "Stok", "changeTypeLabel stock");
assert(changeStatusLabel("pending") === "Beklemede", "changeStatusLabel pending");
assert(changeStatusLabel("applied") === "Uygulandı", "changeStatusLabel applied");
assert(
  uniqueImageUrls("https://a.com/1.jpg", ["https://a.com/1.jpg", "https://b.com/2.jpg"]).length === 2,
  "uniqueImageUrls dedupes",
);
assert(parseWatchTag("red") === "red", "parseWatchTag red");
assert(shouldNotifyForWatchTag("red", "title_changed") === true, "red tag notifies immediately");
assert(
  canOneTapShopifyFix({
    status: "pending",
    changeType: "price_changed",
    fieldName: "price",
    newValue: 99,
  }),
  "one-tap shopify for price",
);
assert(
  canOneTapShopifyFix({
    status: "pending",
    changeType: "stock_changed",
    fieldName: "available",
    newValue: false,
  }),
  "one-tap shopify for out of stock",
);
assert(
  !canOneTapShopifyFix({
    status: "applied",
    changeType: "price_changed",
    fieldName: "price",
    newValue: 99,
  }),
  "applied changes are not one-tap",
);
assert(assertNoServiceRoleInMobileEnv(), "mobile client has no service role key");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
