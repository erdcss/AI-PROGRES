/**
 * Hydrated member isolation + size/image helpers
 * Çalıştır: tsx server/__tests__/trendyol-hydrated-member.test.ts
 */
import {
  extractSizesFromProductState,
  isolateMemberVariants,
  normalizeDisplayColorPair,
  isValidHydratedSizeLabel,
} from "../trendyol-hydrated-member";
import {
  buildColorFamilyStatus,
  buildColorFamilyVariantMatrix,
  mergeColorFamilyIntoScrapeResult,
  type TrendyolColorFamilyMember,
} from "../trendyol-color-family";
import { filterValidProductImages } from "../../shared/trendyol-product-images";
import { extractColorSiblingCandidatesFromHtml } from "../trendyol-color-sibling-extract";

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

console.log("\n=== Trendyol Hydrated Member ===\n");

{
  console.log("A) Member hydration: DOM bedenleri state boşken alınır");
  const sizes = extractSizesFromProductState({
    slicedAttributes: [
      {
        attributeName: "Beden",
        attributeType: "2",
        attributes: [
          { name: "S", inStock: true },
          { name: "M", inStock: true },
          { name: "L", inStock: false },
        ],
      },
    ],
  });
  assert(sizes.map((s) => s.name).join(",") === "S,M,L", "S/M/L state'ten");
  const isolated = isolateMemberVariants({
    memberColor: "Sarı",
    memberProductId: "111",
    memberUrl: "https://www.trendyol.com/x-p-111",
    sizes: [
      { name: "S", inStock: true, source: "dom_button" },
      { name: "M", inStock: true, source: "dom_button" },
      { name: "L", inStock: true, source: "dom_button" },
    ],
  });
  assert(isolated.length === 3, "3 varyant");
  assert(isolated.every((v) => v.color === "Sarı"), "hepsi Sarı");
}

{
  console.log("B) Lazy gallery URL filter — webp/query/uzantısız CDN");
  const imgs = filterValidProductImages([
    "https://cdn.dsmcdn.com/ty100/product/media/images/x/org_zoom.webp?w=1200",
    "https://cdn.dsmcdn.com/ty100/product/media/images/x/file_without_ext",
    "https://cdn.dsmcdn.com/sfint/logo.svg",
    "https://cdn.dsmcdn.com/ty100/product/media/images/x/photo.avif",
  ]);
  assert(imgs.some((u) => u.includes("org_zoom")), "webp/org_zoom korundu");
  assert(imgs.some((u) => u.includes("file_without_ext")), "uzantısız CDN korundu");
  assert(!imgs.some((u) => u.includes("logo.svg")), "logo reddedildi");
  assert(imgs.some((u) => u.includes(".avif") || u.includes("photo")), "avif korundu");
}

{
  console.log("C) Button swatch — data-product-id href yok");
  const html = `
    <div class="slicing-attributes">
      <button class="slicing-attributes__color" data-product-id="938878792" title="Sarı">Sarı</button>
      <div class="slicing-attributes__item" data-content-id="938878793" data-testid="color-swatch">Kahve</div>
    </div>
  `;
  const fromHtml = extractColorSiblingCandidatesFromHtml(html);
  assert(fromHtml.some((c) => c.productId === "938878792"), "data-product-id aday");
  assert(fromHtml.some((c) => c.productId === "938878793"), "data-content-id aday");
}

{
  console.log("D) Per-color size isolation");
  const members: TrendyolColorFamilyMember[] = [
    {
      productId: "1",
      url: "https://www.trendyol.com/a-p-1",
      color: "Sarı",
      images: ["https://cdn.dsmcdn.com/ty1/product/media/images/sari.jpg"],
      ok: true,
      variants: {
        colors: ["Sarı"],
        sizes: ["S", "M", "L"],
        allVariants: [
          { color: "Sarı", size: "S", inStock: true },
          { color: "Sarı", size: "M", inStock: true },
          { color: "Sarı", size: "L", inStock: true },
        ],
      },
    },
    {
      productId: "2",
      url: "https://www.trendyol.com/b-p-2",
      color: "Kahve",
      images: ["https://cdn.dsmcdn.com/ty1/product/media/images/kahve.jpg"],
      ok: true,
      variants: {
        colors: ["Kahve"],
        sizes: ["M", "L"],
        allVariants: [
          { color: "Kahve", size: "M", inStock: true },
          { color: "Kahve", size: "L", inStock: true },
        ],
      },
    },
  ];
  const matrix = buildColorFamilyVariantMatrix(members);
  assert(matrix.allVariants.length === 5, `5 varyant (got ${matrix.allVariants.length})`);
  assert(!matrix.allVariants.some((v) => v.color === "Kahve" && v.size === "S"), "Kahve-S yok");
}

{
  console.log("E) Per-color image isolation");
  const result: Record<string, unknown> = {
    title: "Test Elbise",
    images: ["https://cdn.dsmcdn.com/ty1/product/media/images/root.jpg"],
  };
  mergeColorFamilyIntoScrapeResult({
    result,
    rootUrl: "https://www.trendyol.com/a-p-1",
    rootProductId: "1",
    members: [
      {
        productId: "1",
        url: "https://www.trendyol.com/a-p-1",
        color: "Sarı",
        images: ["https://cdn.dsmcdn.com/ty1/product/media/images/sari1.jpg"],
        ok: true,
        variants: {
          colors: ["Sarı"],
          sizes: ["M"],
          allVariants: [{ color: "Sarı", size: "M", inStock: true }],
        },
      },
      {
        productId: "2",
        url: "https://www.trendyol.com/b-p-2",
        color: "Kahve",
        images: ["https://cdn.dsmcdn.com/ty1/product/media/images/kahve1.jpg"],
        ok: true,
        variants: {
          colors: ["Kahve"],
          sizes: ["M"],
          allVariants: [{ color: "Kahve", size: "M", inStock: true }],
        },
      },
    ],
  });
  const variants = (result.variants as { allVariants: Array<{ color: string; image?: string }> })
    .allVariants;
  assert(
    variants.find((v) => v.color === "Sarı")?.image?.includes("sari1"),
    "sarı varyant sarı görsel",
  );
  assert(
    variants.find((v) => v.color === "Kahve")?.image?.includes("kahve1"),
    "kahve varyant kahve görsel",
  );
  assert(
    !(result.imagesByColor as Record<string, string[]>)["Kahve"]?.some((u) => u.includes("sari")),
    "root/sarı görsel kahveye kopyalanmadı",
  );
}

{
  console.log("F) ProductId mismatch → üye fail, merge edilmez");
  const result: Record<string, unknown> = { title: "Elbise" };
  const { applied } = mergeColorFamilyIntoScrapeResult({
    result,
    rootUrl: "https://www.trendyol.com/a-p-1",
    rootProductId: "1",
    members: [
      {
        productId: "1",
        url: "https://www.trendyol.com/a-p-1",
        color: "Sarı",
        images: ["https://cdn.dsmcdn.com/ty1/product/media/images/s.jpg"],
        ok: true,
        variants: {
          colors: ["Sarı"],
          sizes: ["M"],
          allVariants: [{ color: "Sarı", size: "M", inStock: true }],
        },
      },
      {
        productId: "2",
        url: "https://www.trendyol.com/b-p-2",
        color: "Kahve",
        images: [],
        ok: false,
        error: "productId-mismatch",
      },
    ],
  });
  assert(!applied, "tek geçerli üye → applied false");
}

{
  console.log("G) A.KAHVE display/normalized");
  const pair = normalizeDisplayColorPair("A.KAHVE");
  assert(pair.displayColor === "A.KAHVE", "display korunur");
  assert(pair.normalizedColor === "Açık Kahve", "normalized Açık Kahve");
  const noisy = normalizeDisplayColorPair("A.KAHVEPopüler");
  assert(noisy.normalizedColor === "Açık Kahve", "Popüler gürültüsü temizlenir");
  assert(normalizeDisplayColorPair("fusya").normalizedColor === "Fuşya", "fusya → Fuşya");
  assert(
    normalizeDisplayColorPair("fistik-yesili").normalizedColor === "Fıstık Yeşili",
    "fistik-yesili → Fıstık Yeşili",
  );
  assert(
    normalizeDisplayColorPair("gul-kurusu").normalizedColor === "Gül Kurusu",
    "gul-kurusu → Gül Kurusu",
  );
  assert(isValidHydratedSizeLabel("M"), "M geçerli");
  assert(isValidHydratedSizeLabel("S/M"), "S/M combo geçerli");
  assert(isValidHydratedSizeLabel("L/XL"), "L/XL combo geçerli");
  assert(!isValidHydratedSizeLabel("999"), "999 geçersiz beden");
}

{
  console.log("H) Status: sizeCount=0 → partial + Shopify block");
  const status = buildColorFamilyStatus({
    attempted: true,
    rootProductId: "1",
    familySourceKey: "trendyol-group:1",
    sourceAliases: ["trendyol:1", "trendyol:2"],
    colors: ["Sarı", "Kahve"],
    imagesByColor: {
      Sarı: ["https://cdn.dsmcdn.com/a.jpg"],
      Kahve: ["https://cdn.dsmcdn.com/b.jpg"],
    },
    variants: [
      { color: "Sarı", size: "M", image: "https://cdn.dsmcdn.com/a.jpg" },
      { color: "Kahve", size: "M", image: "https://cdn.dsmcdn.com/b.jpg" },
    ],
    members: [
      {
        productId: "1",
        url: "https://www.trendyol.com/a-p-1",
        color: "Sarı",
        images: ["https://cdn.dsmcdn.com/a.jpg"],
        ok: true,
        variants: {
          colors: ["Sarı"],
          sizes: ["M"],
          allVariants: [{ color: "Sarı", size: "M", inStock: true, image: "https://cdn.dsmcdn.com/a.jpg" }],
        },
      },
      {
        productId: "2",
        url: "https://www.trendyol.com/b-p-2",
        color: "Kahve",
        images: ["https://cdn.dsmcdn.com/b.jpg"],
        ok: true,
        variants: { colors: ["Kahve"], sizes: [], allVariants: [] },
      },
    ],
    isApparel: true,
  });
  assert(status.state === "partial" || status.state === "failed", `state partial/failed got ${status.state}`);
  assert(status.membersMissingSizes.includes("Kahve") || status.membersMissingVariants.includes("Kahve"), "kahve eksik");
  assert(status.shopifyUploadBlocked === true, "Shopify bloklandı");
}

{
  console.log("I) Sibling contentId → çapraz yok; OOS CSV dışı");
  const { buildVariantMatrixFromSlicingData } = await import("../trendyol-slicing-parser");
  const matrix = buildVariantMatrixFromSlicingData(
    {
      colors: [
        { name: "Açık Kahve", inStock: true, contentId: "938878791" },
        { name: "Sarı", inStock: true, contentId: "938879479" },
        { name: "Siyah", inStock: true, contentId: "949790842" },
      ],
      sizes: [
        { name: "S", inStock: true },
        { name: "M", inStock: false },
        { name: "L", inStock: true },
      ],
    },
    [],
    { currentProductId: "938878791", currentColor: "Açık Kahve" },
  );
  assert(matrix.length === 3, `yalnızca 3 beden (got ${matrix.length})`);
  assert(matrix.every((v) => v.color === "Açık Kahve"), "yalnızca Açık Kahve");
  assert(!matrix.some((v) => v.color === "Sarı"), "Sarı çapraz yok");
  assert(matrix.find((v) => v.size === "M")?.inStock === false, "M OOS");

  const result: Record<string, unknown> = {
    title: "LOISY Elbise",
    images: [],
  };
  mergeColorFamilyIntoScrapeResult({
    result,
    rootUrl: "https://www.trendyol.com/a-p-938878791",
    rootProductId: "938878791",
    members: [
      {
        productId: "938878791",
        url: "https://www.trendyol.com/a-p-938878791",
        color: "Açık Kahve",
        images: ["https://cdn.dsmcdn.com/ty1/product/media/images/kahve.jpg"],
        ok: true,
        variants: {
          colors: ["Açık Kahve"],
          sizes: ["S", "M", "L"],
          allVariants: [
            { color: "Açık Kahve", size: "S", inStock: true },
            { color: "Açık Kahve", size: "M", inStock: false },
            { color: "Açık Kahve", size: "L", inStock: true },
          ],
        },
      },
      {
        productId: "938879479",
        url: "https://www.trendyol.com/b-p-938879479",
        color: "Sarı",
        images: ["https://cdn.dsmcdn.com/ty1/product/media/images/sari.jpg"],
        ok: true,
        variants: {
          colors: ["Sarı"],
          sizes: ["S", "L"],
          allVariants: [
            { color: "Sarı", size: "S", inStock: true },
            { color: "Sarı", size: "L", inStock: false },
          ],
        },
      },
    ],
  });
  const all = (result.variants as { allVariants: Array<{ color: string; size: string; inStock: boolean }> })
    .allVariants;
  assert(all.some((v) => v.color === "Açık Kahve" && v.size === "M" && v.inStock === false), "OOS korunur");
  assert(!all.some((v) => v.color === "Sarı" && v.size === "M"), "Sarı-M üretilmedi");
  const csvEligible = all.filter((v) => v.inStock !== false);
  assert(csvEligible.every((v) => v.inStock !== false), "CSV adayları stoklu");
  assert(!csvEligible.some((v) => v.size === "M" && v.color === "Açık Kahve"), "OOS M CSV adayında yok");
  assert(csvEligible.length >= 3, `stoklu kombinasyonlar (got ${csvEligible.length})`);
}

console.log(`\nSonuç: ${passed} geçti, ${failed} kaldı\n`);
if (failed > 0) process.exit(1);
