/**
 * Trendyol renk ailesi birleştirme testleri
 * Çalıştır: npm run test:color-family
 */
import {
  buildColorFamilyVariantMatrix,
  buildColorFamilyIdentity,
  buildSoftColorFamilyMembersFromCandidates,
  extractColorSiblingCandidatesFromHtml,
  extractColorSiblingCandidatesFromProduct,
  extractImagesByColorFromProduct,
  attachVariantImagesFromColorMap,
  mergeColorFamilyIntoScrapeResult,
  mergeColorSiblingCandidates,
  normalizeColorSiblingUrl,
  type TrendyolColorFamilyMember,
} from "../trendyol-color-family";
import { resolveColorFamilySourceKey } from "../shopify-source-key";
import { buildCanonicalProductForShopify } from "../variant-shape-normalizer";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";

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

const URL_A =
  "https://www.trendyol.com/us-polo/aci-kahve-sweatshirt-p-1149286458";
const URL_B =
  "https://www.trendyol.com/us-polo/siyah-sweatshirt-p-1150476051";

console.log("\n=== Trendyol Color Family ===\n");

{
  console.log("1) İki ayrı URL iki renk olarak bulunmalı");
  const fromProduct = extractColorSiblingCandidatesFromProduct(
    {
      slicedAttributes: [
        {
          attributeName: "Renk",
          attributeType: "1",
          attributes: [
            {
              name: "Acı Kahve",
              contentId: 1149286458,
              url: URL_A,
              imageUrl: "https://cdn.dsmcdn.com/a.jpg",
            },
            {
              name: "Siyah",
              contentId: 1150476051,
              productUrl: URL_B,
              image: "https://cdn.dsmcdn.com/b.jpg",
            },
          ],
        },
      ],
    },
    URL_A,
  );
  const ids = new Set(fromProduct.map((c) => c.productId));
  assert(ids.has("1149286458"), "Acı Kahve productId");
  assert(ids.has("1150476051"), "Siyah productId");
  assert(fromProduct.length >= 2, "en az 2 aday");
}

{
  console.log("2) href + raw state adayları dedupe edilmeli");
  const html = `
    <a class="slicing-attributes__item" href="/us-polo/siyah-p-1150476051">Siyah</a>
    <a class="slicing-attributes__color" href="https://www.trendyol.com/us-polo/aci-kahve-p-1149286458">Acı Kahve</a>
    <a href="https://www.trendyol.com/diger/ilgisiz-urun-p-999888777">ilgisiz</a>
    <a href="https://evil.com/p-9999999999">evil</a>
  `;
  const fromHtml = extractColorSiblingCandidatesFromHtml(html);
  const fromState = extractColorSiblingCandidatesFromProduct({
    product: {
      colorOptions: [
        { color: "Siyah", productId: "1150476051", href: URL_B },
        { color: "Acı Kahve", id: "1149286458", url: URL_A },
      ],
    },
  });
  const merged = mergeColorSiblingCandidates(fromHtml, fromState);
  assert(merged.length === 2, `dedupe → 2 (got ${merged.length})`);
  assert(
    merged.every((c) => c.url.includes("trendyol.com")),
    "yalnızca trendyol.com",
  );
  assert(!merged.some((c) => c.productId === "9999999999"), "evil host reddedildi");
  assert(!merged.some((c) => c.productId === "999888777"), "ilgisiz ürün linki alınmadı");
  assert(
    fromHtml.some((c) => c.productId === "1150476051" && c.color === "Siyah"),
    "anchor metninden Siyah renk adı",
  );
  assert(
    fromHtml.some((c) => c.productId === "1149286458" && c.color === "Acı Kahve"),
    "anchor metninden Acı Kahve renk adı",
  );

  const complementary = mergeColorSiblingCandidates(
    [
      {
        productId: "1150476051",
        url: URL_B,
        images: [
          "https://cdn.dsmcdn.com/siyah-1.jpg",
          "https://cdn.dsmcdn.com/siyah-2.jpg",
        ],
        source: "browser-worker",
      },
    ],
    [{ productId: "1150476051", url: URL_B, color: "Siyah", source: "html" }],
  );
  assert(complementary[0]?.color === "Siyah", "görsel-zengin adaya HTML renk adı eklenir");
  assert(complementary[0]?.images?.length === 2, "renk eklenirken BW galerisi korunur");

  const jsonLd = `
    <script type="application/ld+json">
      {
        "@type": "ProductGroup",
        "hasVariant": [
          {
            "@type": "Product",
            "sku": "846246947",
            "color": "kirmizi",
            "image": "https://cdn.dsmcdn.com/kirmizi.jpg",
            "offers": {
              "url": "https://www.trendyol.com/test/kirmizi-elbise-p-846246947",
              "availability": "https://schema.org/InStock"
            }
          },
          {
            "@type": "Product",
            "sku": "815675167",
            "color": "mavi-c",
            "image": "https://cdn.dsmcdn.com/mavi.jpg",
            "offers": {
              "url": "https://www.trendyol.com/test/mavi-elbise-p-815675167",
              "availability": "https://schema.org/InStock"
            }
          }
        ]
      }
    </script>
  `;
  const fromJsonLd = extractColorSiblingCandidatesFromHtml(jsonLd);
  assert(fromJsonLd.length === 2, "ProductGroup JSON-LD → 2 renk adayı");
  assert(
    fromJsonLd.some(
      (c) => c.productId === "815675167" && c.color === "mavi-c" && c.images?.length === 1,
    ),
    "JSON-LD renk + productId + görsel birlikte",
  );
}

{
  console.log("3) Her rengin kendi bedenleri korunmalı / çapraz üretilmemeli");
  const members: TrendyolColorFamilyMember[] = [
    {
      productId: "1149286458",
      url: URL_A,
      color: "Acı Kahve",
      images: ["https://cdn.dsmcdn.com/kahve1.jpg", "https://cdn.dsmcdn.com/kahve2.jpg"],
      ok: true,
      variants: {
        colors: ["Acı Kahve"],
        sizes: ["S", "M", "L"],
        allVariants: [
          { color: "Acı Kahve", size: "S", inStock: true },
          { color: "Acı Kahve", size: "M", inStock: true },
          { color: "Acı Kahve", size: "L", inStock: false },
        ],
      },
    },
    {
      productId: "1150476051",
      url: URL_B,
      color: "Siyah",
      images: ["https://cdn.dsmcdn.com/siyah1.jpg"],
      ok: true,
      variants: {
        colors: ["Siyah"],
        sizes: ["M", "L", "XL"],
        allVariants: [
          { color: "Siyah", size: "M", inStock: true },
          { color: "Siyah", size: "L", inStock: true },
          { color: "Siyah", size: "XL", inStock: true },
        ],
      },
    },
  ];
  const matrix = buildColorFamilyVariantMatrix(members);
  assert(matrix.allVariants.length === 6, `6 varyant (got ${matrix.allVariants.length})`);
  assert(
    !matrix.allVariants.some((v) => v.color === "Siyah" && v.size === "S"),
    "Siyah-S üretilmedi",
  );
  assert(
    !matrix.allVariants.some((v) => v.color === "Acı Kahve" && v.size === "XL"),
    "Acı Kahve-XL üretilmedi",
  );
  assert(
    matrix.allVariants.some((v) => v.color === "Acı Kahve" && v.size === "S"),
    "Acı Kahve-S var",
  );
}

{
  console.log("4) Görseller + varyant image + sourceAliases + merge");
  const result: Record<string, unknown> = {
    title: "US Polo Sweatshirt",
    brand: "U.S. Polo Assn.",
    images: ["https://cdn.dsmcdn.com/root.jpg"],
    price: { original: 1000, withProfit: 1200 },
  };
  const members: TrendyolColorFamilyMember[] = [
    {
      productId: "1149286458",
      url: URL_A,
      color: "Acı Kahve",
      images: ["https://cdn.dsmcdn.com/kahve1.jpg"],
      ok: true,
      rawProductJson: {
        color: "Acı Kahve",
        images: ["https://cdn.dsmcdn.com/kahve1.jpg"],
        slicedAttributes: [
          {
            attributeName: "Beden",
            attributeType: "2",
            attributes: [
              { name: "S", inStock: true },
              { name: "M", inStock: true },
            ],
          },
        ],
      },
      variants: {
        colors: ["Acı Kahve"],
        sizes: ["S", "M"],
        allVariants: [
          { color: "Acı Kahve", size: "S", inStock: true },
          { color: "Acı Kahve", size: "M", inStock: true },
        ],
      },
    },
    {
      productId: "1150476051",
      url: URL_B,
      color: "Siyah",
      images: ["https://cdn.dsmcdn.com/siyah1.jpg"],
      ok: true,
      rawProductJson: {
        color: "Siyah",
        images: ["https://cdn.dsmcdn.com/siyah1.jpg"],
        slicedAttributes: [
          {
            attributeName: "Beden",
            attributeType: "2",
            attributes: [{ name: "L", inStock: true }],
          },
        ],
      },
      variants: {
        colors: ["Siyah"],
        sizes: ["L"],
        allVariants: [{ color: "Siyah", size: "L", inStock: true }],
      },
    },
  ];

  const { applied, family } = mergeColorFamilyIntoScrapeResult({
    result,
    rootUrl: URL_A,
    rootProductId: "1149286458",
    rootRawProduct: { productGroupId: "grp-99", product: { productGroupId: "grp-99" } },
    members,
    candidates: [
      { productId: "1149286458", url: URL_A },
      { productId: "1150476051", url: URL_B },
    ],
  });

  assert(applied === true, "family applied");
  assert(Boolean(family), "family object");
  assert(
    Array.isArray(result.images) &&
      (result.images as string[]).includes("https://cdn.dsmcdn.com/kahve1.jpg") &&
      (result.images as string[]).includes("https://cdn.dsmcdn.com/siyah1.jpg"),
    "tüm renk görselleri result.images",
  );
  const variants = (result.variants as { allVariants: Array<{ color: string; size: string; image?: string; sourceProductId?: string }> })
    .allVariants;
  assert(
    variants.every((v) =>
      v.color === "Acı Kahve"
        ? v.image?.includes("kahve")
        : v.color === "Siyah"
          ? v.image?.includes("siyah")
          : false,
    ),
    "her varyant doğru renk görseli",
  );
  assert(
    Array.isArray(result.sourceAliases) &&
      (result.sourceAliases as string[]).includes("trendyol:1149286458") &&
      (result.sourceAliases as string[]).includes("trendyol:1150476051"),
    "sourceAliases tüm child id",
  );
  assert(
    result.familySourceKey === "trendyol-group:grp-99",
    `familySourceKey groupId (got ${result.familySourceKey})`,
  );
}

{
  console.log("5) Aynı ailedeki ikinci URL yeni Shopify ürünü oluşturmamalı");
  const keyA = resolveColorFamilySourceKey({
    memberProductIds: ["1149286458", "1150476051"],
  });
  const keyB = resolveColorFamilySourceKey({
    memberProductIds: ["1150476051", "1149286458"],
  });
  assert(keyA.sourceKey === keyB.sourceKey, "stabil family sourceKey");
  assert(keyA.sourceKey === "trendyol-group:1149286458", "min productId family");

  const scrape = {
    title: "US Polo Sweatshirt",
    brand: "U.S. Polo Assn.",
    sourceUrl: URL_B,
    price: { original: 1000, withProfit: 1200 },
    images: ["https://cdn.dsmcdn.com/siyah1.jpg", "https://cdn.dsmcdn.com/kahve1.jpg"],
    familySourceKey: keyA.sourceKey,
    sourceAliases: keyA.sourceAliases,
    variants: {
      colors: ["Acı Kahve", "Siyah"],
      sizes: ["S", "M", "L"],
      allVariants: [
        {
          color: "Acı Kahve",
          size: "S",
          inStock: true,
          image: "https://cdn.dsmcdn.com/kahve1.jpg",
          sourceProductId: "1149286458",
        },
        {
          color: "Siyah",
          size: "M",
          inStock: true,
          image: "https://cdn.dsmcdn.com/siyah1.jpg",
          sourceProductId: "1150476051",
        },
      ],
    },
  };
  const canonical = buildCanonicalProductForShopify({ scrapeResult: scrape });
  assert(Boolean(canonical), "canonical built");
  assert(canonical!.sourceKey === keyA.sourceKey, "canonical sourceKey = family");
  assert(
    Array.isArray(canonical!.sourceAliases) && canonical!.sourceAliases!.length === 2,
    "canonical sourceAliases",
  );
  assert(
    canonical!.variants.every((v) => Boolean(v.image)),
    "canonical variant.image korundu",
  );
}

{
  console.log("6) Tek renkli üründe ek crawl / merge yok");
  const result: Record<string, unknown> = {
    title: "Tek Renk Ürün",
    images: [],
  };
  const { applied } = mergeColorFamilyIntoScrapeResult({
    result,
    rootUrl: URL_A,
    rootProductId: "1149286458",
    members: [
      {
        productId: "1149286458",
        url: URL_A,
        color: "Acı Kahve",
        images: ["https://cdn.dsmcdn.com/kahve1.jpg"],
        ok: true,
        variants: {
          colors: ["Acı Kahve"],
          sizes: ["M"],
          allVariants: [{ color: "Acı Kahve", size: "M", inStock: true }],
        },
      },
    ],
  });
  assert(applied === false, "tek renk → merge yok");
  assert(result.colorFamily == null, "colorFamily yazılmadı");
}

{
  console.log("7) Kardeş başarısız → partial family");
  const result: Record<string, unknown> = {
    title: "Partial Family",
    images: [],
  };
  const { applied, family } = mergeColorFamilyIntoScrapeResult({
    result,
    rootUrl: URL_A,
    rootProductId: "1149286458",
    members: [
      {
        productId: "1149286458",
        url: URL_A,
        color: "Acı Kahve",
        images: ["https://cdn.dsmcdn.com/kahve1.jpg"],
        ok: true,
        variants: {
          colors: ["Acı Kahve"],
          sizes: ["S"],
          allVariants: [{ color: "Acı Kahve", size: "S", inStock: true }],
        },
      },
      {
        productId: "1150476051",
        url: URL_B,
        color: "Siyah",
        images: [],
        ok: false,
        error: "timeout",
      },
      {
        productId: "1160000000",
        url: "https://www.trendyol.com/x/bej-p-1160000000",
        color: "Bej",
        images: ["https://cdn.dsmcdn.com/bej1.jpg"],
        ok: true,
        variants: {
          colors: ["Bej"],
          sizes: ["M"],
          allVariants: [{ color: "Bej", size: "M", inStock: true }],
        },
      },
    ],
  });
  assert(applied === true, "partial family applied (≥2 ok)");
  assert(
    family?.diagnostics?.failedMembers?.some((f) => f.productId === "1150476051") === true,
    "failed member diagnostics",
  );
  assert(
    (result.variants as { allVariants: unknown[] }).allVariants.length === 2,
    "yalnızca başarılı üyelerin varyantları",
  );
}

{
  console.log("8) SanitizedVariant metadata korunmalı");
  const sanitized = sanitizeTrendyolVariants([
    {
      color: "Siyah",
      size: "M",
      inStock: true,
      image: "https://cdn.dsmcdn.com/siyah1.jpg",
      sourceProductId: "1150476051",
      sourceUrl: URL_B,
      price: 999,
      stockCount: 3,
    },
  ]);
  const v = sanitized.allVariants[0];
  assert(v?.image?.includes("siyah") === true, "image korundu");
  assert(v?.sourceProductId === "1150476051", "sourceProductId korundu");
  assert(v?.sourceUrl === URL_B, "sourceUrl korundu");
  assert(v?.price === 999, "price korundu");
  assert(v?.stockCount === 3, "stockCount korundu");
}

{
  console.log("9) normalizeColorSiblingUrl");
  const n = normalizeColorSiblingUrl("/marka/urun-p-1149286458?boutiqueId=1");
  assert(n?.productId === "1149286458", "relative url productId");
  assert(n?.url.includes("trendyol.com") === true, "absolute trendyol");
  assert(normalizeColorSiblingUrl("https://example.com/p-12345") === null, "non-trendyol null");
}

{
  console.log("10) identity aliases");
  const id = buildColorFamilyIdentity({
    rootProductId: "1150476051",
    memberProductIds: ["1149286458", "1150476051"],
  });
  assert(id.familyId === "1149286458", "min id family");
  assert(id.sourceAliases.length === 2, "2 aliases");
}

{
  console.log("11) colorFamilyStatus success/partial/failed");
  const result: Record<string, unknown> = { title: "Status Test", images: [] };
  const membersOk: TrendyolColorFamilyMember[] = [
    {
      productId: "1149286458",
      url: URL_A,
      color: "Acı Kahve",
      images: ["https://cdn.dsmcdn.com/kahve1.jpg"],
      ok: true,
      variants: {
        colors: ["Acı Kahve"],
        sizes: ["S"],
        allVariants: [
          {
            color: "Acı Kahve",
            size: "S",
            inStock: true,
            image: "https://cdn.dsmcdn.com/kahve1.jpg",
          },
        ],
      },
    },
    {
      productId: "1150476051",
      url: URL_B,
      color: "Siyah",
      images: ["https://cdn.dsmcdn.com/siyah1.jpg"],
      ok: true,
      variants: {
        colors: ["Siyah"],
        sizes: ["M"],
        allVariants: [
          {
            color: "Siyah",
            size: "M",
            inStock: true,
            image: "https://cdn.dsmcdn.com/siyah1.jpg",
          },
        ],
      },
    },
  ];
  mergeColorFamilyIntoScrapeResult({
    result,
    rootUrl: URL_A,
    rootProductId: "1149286458",
    members: membersOk,
    candidates: [
      { productId: "1149286458", url: URL_A },
      { productId: "1150476051", url: URL_B },
    ],
  });
  const status = result.colorFamilyStatus as { state: string; aliasesCount: number };
  assert(status?.state === "success", `status success (got ${status?.state})`);
  assert(status.aliasesCount >= 2, "aliasesCount >= 2");
}

{
  console.log("\n10) Soft candidate + colorImages → renk adı ile görsel");
  const soft = buildSoftColorFamilyMembersFromCandidates({
    candidates: [
      {
        productId: "1149286458",
        url: URL_A,
        color: "Acı Kahve",
        image: "https://cdn.dsmcdn.com/kahve1.jpg",
      },
      {
        productId: "1150476051",
        url: URL_B,
        color: "Siyah",
        image: "https://cdn.dsmcdn.com/siyah1.jpg",
      },
    ],
    rootProductId: "1149286458",
    rootColor: "Acı Kahve",
    rootImages: ["https://cdn.dsmcdn.com/kahve1.jpg", "https://cdn.dsmcdn.com/kahve2.jpg"],
    rootVariants: sanitizeTrendyolVariants({
      colors: ["Acı Kahve"],
      sizes: ["S", "M"],
      allVariants: [
        { color: "Acı Kahve", size: "S", inStock: true },
        { color: "Acı Kahve", size: "M", inStock: true },
      ],
    }),
  });
  assert(soft.filter((m) => m.ok).length === 2, "soft 2 ok üye");
  assert(
    soft.some((m) => m.color === "Siyah" && m.images[0]?.includes("siyah")),
    "Siyah soft üye kendi görseliyle",
  );

  const byColor = extractImagesByColorFromProduct({
    colorImages: {
      Bordo: ["https://cdn.dsmcdn.com/bordo1.jpg"],
      Siyah: ["https://cdn.dsmcdn.com/siyah-x.jpg"],
    },
  });
  assert(byColor.Bordo?.length === 1, "colorImages Bordo");
  assert(byColor.Siyah?.length === 1, "colorImages Siyah");

  const scoped: Record<string, unknown> = {
    images: [
      "https://cdn.dsmcdn.com/bordo1.jpg",
      "https://cdn.dsmcdn.com/siyah-x.jpg",
      "https://cdn.dsmcdn.com/yesil1.jpg",
    ],
    variants: {
      colors: ["Bordo"],
      sizes: ["M"],
      allVariants: [{ color: "Bordo", size: "M", inStock: true }],
    },
  };
  attachVariantImagesFromColorMap(scoped, byColor);
  assert(
    (scoped.images as string[]).every((u) => u.includes("bordo")),
    "tek renk varken yabancı renk görselleri düşer",
  );
  assert(
    (scoped.variants as { allVariants: Array<{ image?: string }> }).allVariants[0]?.image?.includes(
      "bordo",
    ),
    "varyanta Bordo görseli bağlandı",
  );
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
process.exit(failed > 0 ? 1 : 0);
