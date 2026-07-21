/**
 * Combo beden genişletme testi — canlı Trendyol S/M, M/L, L/XL → S, M, L, XL
 */
import {
  expandComboSizeToLabels,
  sanitizeTrendyolVariants,
  variantRichnessScore,
} from "@shared/trendyol-variant-utils";

const URL =
  "https://www.trendyol.com/framgan/y2k-beyaz-born-to-reat-baskili-oversize-t-shirt-p-941825789";

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

assert(
  JSON.stringify(expandComboSizeToLabels("S/M")) === JSON.stringify(["S", "M"]),
  "S/M → S,M",
);
assert(
  JSON.stringify(expandComboSizeToLabels("M/L")) === JSON.stringify(["M", "L"]),
  "M/L → M,L",
);
assert(
  JSON.stringify(expandComboSizeToLabels("L/XL")) === JSON.stringify(["L", "XL"]),
  "L/XL → L,XL",
);
assert(
  JSON.stringify(expandComboSizeToLabels("S\\u002FM")) === JSON.stringify(["S", "M"]),
  "S\\u002FM kaçışlı → S,M",
);

// Jojomia / Lonse: yalnızca S/M stokta, L/XL üstü çizili → L ve XL OOS
const jojomia = sanitizeTrendyolVariants(
  {
    colors: ["Somon"],
    sizes: ["S/M", "L/XL"],
    allVariants: [
      { color: "Somon", size: "S/M", inStock: true },
      { color: "Somon", size: "L/XL", inStock: false },
    ],
  },
  {
    productTitle: "Sofia Askılı Uzun Elbise Lonse Linen Dokumlu Rahat Kalıp Yazlık Elbise",
    sourceUrl:
      "https://www.trendyol.com/jojomia/sofia-askili-uzun-elbise-lonse-linen-dokumlu-rahat-kalip-yazlik-elbise-p-940135380",
  },
);
const jojomiaInStock = jojomia.allVariants.filter((v) => v.inStock !== false).map((v) => v.size).sort();
const jojomiaOos = jojomia.allVariants.filter((v) => v.inStock === false).map((v) => v.size).sort();
assert(
  JSON.stringify(jojomiaInStock) === JSON.stringify(["M", "S"]),
  `Somon S/M stokta → S,M (${jojomiaInStock.join(",")})`,
);
assert(
  JSON.stringify(jojomiaOos) === JSON.stringify(["L", "XL"]),
  `L/XL tükendi → L,XL OOS (${jojomiaOos.join(",")})`,
);

const sanitized = sanitizeTrendyolVariants(
  {
    colors: ["Beyaz"],
    sizes: ["S/M", "M/L", "L/XL"],
    allVariants: [
      { color: "Beyaz", size: "S/M", inStock: true },
      { color: "Beyaz", size: "M/L", inStock: true },
      { color: "Beyaz", size: "L/XL", inStock: false },
    ],
  },
  { productTitle: "Y2k Beyaz Oversize T-Shirt", sourceUrl: URL },
);

const sizes = [...sanitized.sizes].sort();
assert(sizes.includes("S") && sizes.includes("M") && sizes.includes("L") && sizes.includes("XL"), `Combo sanitize → ${sizes.join(",")}`);
assert(sanitized.allVariants.length >= 4, `allVariants >= 4 (${sanitized.allVariants.length})`);

const lVariant = sanitized.allVariants.find((v) => v.size === "L");
assert(lVariant?.inStock === false, "L/XL tükendi → L inStock=false");

const scoreCombo = variantRichnessScore(sanitized);
const scoreSingle = variantRichnessScore(
  sanitizeTrendyolVariants(
    { colors: ["Beyaz"], sizes: ["S/M"], allVariants: [{ color: "Beyaz", size: "S/M", inStock: true }] },
    { productTitle: "Y2k Beyaz Oversize T-Shirt", sourceUrl: URL },
  ),
);
assert(scoreCombo > scoreSingle, "4 atomik beden skoru > tek combo");

console.log(`\nCombo expand: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
