import {
  badgeCountFromNotifications,
  parseDeepLink,
  changeTypeLabel,
} from "../lib/format";
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
assert(assertNoServiceRoleInMobileEnv(), "mobile client has no service role key");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
