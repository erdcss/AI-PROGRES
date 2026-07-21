import {
  extractFastSizes,
  applyFullVariantScrapeToResult,
} from "../trendyol-variant-probe";

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

const fanUrl =
  "https://www.trendyol.com/sinbo/sf-7701-sessiz-mini-vantilator-p-933320634";
const pollutedFan: Record<string, unknown> = {
  title: "Sinbo SF-7701 Sessiz Mini Vantilatör",
  variants: {
    colors: ["Beyaz", "Gri"],
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    allVariants: [
      { color: "Beyaz", size: "S", inStock: true },
      { color: "Gri", size: "XL", inStock: true },
    ],
    stockMap: {
      "Beyaz-S": true,
      "Gri-XL": true,
    },
  },
  domSizeButtons: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
};

assert(
  extractFastSizes(pollutedFan, fanUrl).length === 0,
  "Giyim dışı üründe öneri scripti bedenleri reddedildi",
);

await applyFullVariantScrapeToResult(fanUrl, pollutedFan);

const cleanedFan = pollutedFan.variants as {
  colors?: string[];
  sizes?: string[];
  allVariants?: Array<{ color: string; size: string }>;
};
assert(cleanedFan.sizes?.length === 0, "Fan final varyantlarında beden yok");
assert(
  (cleanedFan.allVariants ?? []).every((variant) => !variant.size),
  "Fan kombinasyonlarında S/M/L sızıntısı yok",
);
assert(
  Array.isArray(pollutedFan.domSizeButtons) &&
    pollutedFan.domSizeButtons.length === 0,
  "Fan domSizeButtons temizlendi",
);

const apparelUrl =
  "https://www.trendyol.com/framgan/y2k-beyaz-oversize-t-shirt-p-941825789";
const apparel = {
  title: "Y2k Beyaz Oversize T-Shirt",
  variants: {
    colors: ["Beyaz"],
    sizes: ["S", "M", "L", "XL"],
    allVariants: ["S", "M", "L", "XL"].map((size) => ({
      color: "Beyaz",
      size,
      inStock: true,
    })),
  },
};
assert(
  extractFastSizes(apparel, apparelUrl).join(",") === "S,M,L,XL",
  "Giyim ürününde gerçek bedenler korunuyor",
);

console.log(`\nNon-apparel size guard: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
