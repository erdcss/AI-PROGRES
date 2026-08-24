/**
 * Auto product tags + MARKT-GO collection matching helpers
 * Run: npx tsx server/__tests__/auto-product-tags.test.ts
 */
import {
  generateAutoProductTags,
  normalizeTagKey,
  tagsFromCategoryPath,
  resolveKnownTagSpelling,
} from "../../shared/auto-product-tags";
import {
  cleanTrendyolCategoryPath,
  extractTrendyolCategoryPath,
} from "../../shared/trendyol-category-path";

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

console.log("\n=== Category path tags ===\n");

const path = cleanTrendyolCategoryPath(
  [
    "Trendyol",
    "Bahçe & Yapı Market",
    "Banyo Yapı & Hırdavat",
    "Banyo & Yapı Malzemeleri",
    "Banyo Aksesuarı",
    "Banyo Düzenleyici",
    "BEYZANA Banyo Düzenleyici",
    "BEYZANA Gider Kapatıcı Pislik Tutucu Kendinden Yapışkanlı Gider Kapağı 1 adet",
  ],
  {
    title: "BEYZANA Gider Kapatıcı Pislik Tutucu Kendinden Yapışkanlı Gider Kapağı 1 adet",
    brand: "BEYZANA",
  },
);
assert(!path.some((p) => /trendyol/i.test(p)), "path drops trendyol");
assert(path.includes("Bahçe & Yapı Market"), "keeps top category");
assert(path.includes("Banyo Aksesuarı"), "keeps mid category");
assert(path.includes("Banyo Düzenleyici"), "keeps leaf category");
assert(
  !path.some((p) => /gider kapatıcı/i.test(p)),
  "drops product title crumb",
);

const knownSpelling = resolveKnownTagSpelling("banyo aksesuarı", [
  "Banyo Aksesuarı",
  "Ev & Yaşam",
]);
assert(knownSpelling === "Banyo Aksesuarı", "uses categories-page spelling");

const fromPath = tagsFromCategoryPath(path, {
  knownCollectionTags: ["Banyo Aksesuarı", "Bahçe & Yapı Market"],
});
assert(fromPath.includes("Banyo Aksesuarı"), "path tags include bathroom accessory");
assert(fromPath.includes("Bahçe & Yapı Market"), "path tags include garden market");
assert(!fromPath.some((t) => /trendyol/i.test(t)), "path tags exclude trendyol");

const withPath = generateAutoProductTags({
  title: "BEYZANA Gider Kapatıcı Pislik Tutucu Kendinden Yapışkanlı Gider Kapağı 1 adet",
  brand: "BEYZANA",
  categoryPath: path,
  knownCollectionTags: ["Banyo Aksesuarı", "Bahçe & Yapı Market"],
});
assert(withPath.includes("Banyo Aksesuarı"), "auto tags from breadcrumb");
assert(withPath.includes("Bahçe & Yapı Market"), "auto tags top category");
assert(withPath.includes("BEYZANA"), "brand tag");
assert(withPath.filter((t) => t === "Banyo Düzenleyici").length >= 1, "leaf category tag");
assert(!withPath.some((t) => /trendyol/i.test(t)), "auto tags never trendyol");
assert(withPath.length >= 4, "multiple tags from category path");

const htmlLd = `
<script type="application/ld+json">
{"@type":"BreadcrumbList","itemListElement":[
  {"@type":"ListItem","position":1,"name":"Trendyol"},
  {"@type":"ListItem","position":2,"name":"Bahçe & Yapı Market"},
  {"@type":"ListItem","position":3,"name":"Banyo Aksesuarı"},
  {"@type":"ListItem","position":4,"name":"Banyo Düzenleyici"}
]}
</script>`;
const extracted = extractTrendyolCategoryPath(htmlLd, { title: "Ürün" });
assert(extracted[0] === "Bahçe & Yapı Market", "json-ld extract skips trendyol");
assert(extracted.includes("Banyo Aksesuarı"), "json-ld mid path");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
