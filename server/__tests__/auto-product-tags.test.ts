/**
 * Auto product tags + MARKT-GO collection matching helpers
 * Run: npx tsx server/__tests__/auto-product-tags.test.ts
 */
import {
  generateAutoProductTags,
  normalizeTagKey,
} from "../../shared/auto-product-tags";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\n=== Auto Product Tags ===\n");

assert(normalizeTagKey("Kadın Elbise") === "kadın-elbise", "normalize tag key");

const dress = generateAutoProductTags({
  title: "Kadın Mini Elbise Yazlık",
  brand: "MarkaX",
  knownCollectionTags: ["kadın elbise", "ayakkabı"],
});
assert(dress.includes("kadın elbise"), "matches known collection tag");
assert(dress.includes("kadın"), "includes gender tag");
assert(dress.includes("elbise"), "includes type tag");
assert(dress.includes("Moda"), "includes category bucket");
assert(!dress.some((t) => /trendyol/i.test(t)), "no trendyol tag");

const shoe = generateAutoProductTags({
  title: "Erkek Deri Sneaker Ayakkabı",
});
assert(shoe.includes("erkek"), "gender from title");
assert(shoe.some((t) => /ayakkab/i.test(t)), "shoe type from title");

const merged = generateAutoProductTags({
  title: "Bluetooth Kulaklık",
  existingTags: ["manuel"],
});
assert(merged.includes("manuel"), "keeps existing tags");
assert(merged.includes("Elektronik") || merged.includes("elektronik"), "electronics category");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
