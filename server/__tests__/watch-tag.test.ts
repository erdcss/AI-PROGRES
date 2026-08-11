/**
 * Run: npx tsx server/__tests__/watch-tag.test.ts
 */
import {
  parseWatchTag,
  shouldNotifyForWatchTag,
  WATCH_TAG_INTERVAL_MINUTES,
  watchTagLabel,
} from "@shared/watch-tag";

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

console.log("\n=== Watch tag tests ===\n");

assert(parseWatchTag("red") === "red", "parse red");
assert(parseWatchTag("kırmızı") === "red", "parse kırmızı");
assert(parseWatchTag("green") === "green", "parse green");
assert(parseWatchTag("yesil") === "green", "parse yesil");
assert(parseWatchTag("blue") === null, "parse invalid null");
assert(WATCH_TAG_INTERVAL_MINUTES.red === 15, "red interval 15");
assert(WATCH_TAG_INTERVAL_MINUTES.green === 60, "green interval 60");
assert(watchTagLabel("red") === "Kırmızı", "label red");

assert(shouldNotifyForWatchTag("red", "title_changed", Date.now()) === true, "red always notifies");
assert(shouldNotifyForWatchTag("green", "price_changed", Date.now()) === true, "green price always");
assert(
  shouldNotifyForWatchTag("green", "title_changed", Date.now() - 1000) === false,
  "green title throttled",
);
assert(
  shouldNotifyForWatchTag("green", "title_changed", Date.now() - 11 * 60_000) === true,
  "green title after throttle",
);
assert(shouldNotifyForWatchTag(null, "title_changed", Date.now()) === true, "untagged notifies");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
