/**
 * Shopify variant ↔ media association regression tests
 * Çalıştır: npx tsx server/__tests__/shopify-variant-media-association.test.ts
 */
import {
  buildSourceVariantsForMedia,
  evaluateAssociationSuccess,
  matchShopifyVariant,
  normalizeMediaUrl,
  planVariantMediaAssociations,
  resolveVariantImageUrl,
  variantMatchKey,
  type ShopifyVariantRef,
  type VariantMediaSource,
} from "../shopify-variant-media-association";

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

const TURKUAZ = "https://cdn.dsmcdn.com/mnresize/1200/1800/turkuaz-main.jpg";
const YESIL = "https://cdn.dsmcdn.com/mnresize/800/1200/yesil-main.jpg";
const MEDIA_T = "gid://shopify/MediaImage/111";
const MEDIA_Y = "gid://shopify/MediaImage/222";

function sources(): VariantMediaSource[] {
  return [
    {
      option1: "Turkuaz",
      option2: "S/M",
      sku: "SKU-T-SM",
      mediaGroupKey: "color:turkuaz",
      featuredImage: TURKUAZ,
    },
    {
      option1: "Turkuaz",
      option2: "L/XL",
      sku: "SKU-T-LXL",
      mediaGroupKey: "color:turkuaz",
      featuredImage: TURKUAZ,
    },
    {
      option1: "Yeşil",
      option2: "S/M",
      sku: "SKU-Y-SM",
      mediaGroupKey: "color:yesil",
      featuredImage: YESIL,
    },
    {
      option1: "Yeşil",
      option2: "L/XL",
      sku: "SKU-Y-LXL",
      mediaGroupKey: "color:yesil",
      featuredImage: YESIL,
    },
  ];
}

function shopifyVariants(): ShopifyVariantRef[] {
  return [
    {
      shopifyVariantId: "1",
      shopifyVariantGid: "gid://shopify/ProductVariant/1",
      option1: "Turkuaz",
      option2: "S/M",
      sku: "SKU-T-SM",
    },
    {
      shopifyVariantId: "2",
      shopifyVariantGid: "gid://shopify/ProductVariant/2",
      option1: "Turkuaz",
      option2: "L/XL",
      sku: "SKU-T-LXL",
    },
    {
      shopifyVariantId: "3",
      shopifyVariantGid: "gid://shopify/ProductVariant/3",
      option1: "Yeşil",
      option2: "S/M",
      sku: "SKU-Y-SM",
    },
    {
      shopifyVariantId: "4",
      shopifyVariantGid: "gid://shopify/ProductVariant/4",
      option1: "Yeşil",
      option2: "L/XL",
      sku: "SKU-Y-LXL",
    },
  ];
}

function mediaMap(): Map<string, string> {
  return new Map([
    [normalizeMediaUrl(TURKUAZ), MEDIA_T],
    [normalizeMediaUrl(YESIL), MEDIA_Y],
  ]);
}

console.log("\nTEST 1: same mediaGroupKey → same MediaImage ID");
{
  const plan = planVariantMediaAssociations(sources(), shopifyVariants(), mediaMap());
  const tSm = plan.associations.find((a) => a.option2 === "S/M" && a.option1 === "Turkuaz");
  const tLxl = plan.associations.find((a) => a.option2 === "L/XL" && a.option1 === "Turkuaz");
  assert(Boolean(tSm && tLxl), "both Turkuaz sizes associated");
  assert(tSm!.mediaId === tLxl!.mediaId, "Turkuaz sizes share mediaId");
  assert(tSm!.mediaId === MEDIA_T, "Turkuaz mediaId is MEDIA_T");
}

console.log("\nTEST 2: different mediaGroupKey → different mediaId");
{
  const plan = planVariantMediaAssociations(sources(), shopifyVariants(), mediaMap());
  const t = plan.associations.find((a) => a.option1 === "Turkuaz")!;
  const y = plan.associations.find((a) => a.option1 === "Yeşil")!;
  assert(t.mediaId !== y.mediaId, "Turkuaz and Yeşil get different mediaIds");
  assert(y.mediaId === MEDIA_Y, "Yeşil mediaId is MEDIA_Y");
}

console.log("\nTEST 3: variant array order shuffle does not change matching");
{
  const shuffled = [...sources()].reverse();
  const shopifyShuffled = [...shopifyVariants()].reverse();
  const planA = planVariantMediaAssociations(sources(), shopifyVariants(), mediaMap());
  const planB = planVariantMediaAssociations(shuffled, shopifyShuffled, mediaMap());
  const key = (a: { option1?: string; option2?: string }) =>
    variantMatchKey(a.option1, a.option2);
  const mapA = new Map(planA.associations.map((a) => [key(a), a.mediaId]));
  const mapB = new Map(planB.associations.map((a) => [key(a), a.mediaId]));
  assert(
    [...mapA.keys()].every((k) => mapA.get(k) === mapB.get(k)),
    "order-independent option→mediaId mapping",
  );
  const bySku = matchShopifyVariant(
    { sku: "SKU-Y-LXL", option1: "WRONG", option2: "WRONG" },
    shopifyVariants(),
  );
  assert(bySku?.shopifyVariantId === "4", "SKU match preferred over wrong options");
}

console.log("\nTEST 4: empty featuredImage does not crash");
{
  const withEmpty: VariantMediaSource[] = [
    ...sources(),
    { option1: "Mor", option2: "S/M", sku: "SKU-M", featuredImage: "" },
  ];
  let threw = false;
  try {
    const plan = planVariantMediaAssociations(withEmpty, shopifyVariants(), mediaMap());
    assert(plan.missingImage >= 1, "empty image counted as missingImage");
    assert(resolveVariantImageUrl({ featuredImage: "" }) === "", "empty resolves to ''");
  } catch {
    threw = true;
  }
  assert(!threw, "no crash on empty featuredImage");
}

console.log("\nTEST 5: association userErrors → success=false");
{
  const evalResult = evaluateAssociationSuccess({
    expectedAssociations: 4,
    associatedOnReadBack: 4,
    userErrors: [{ message: "Media could not be associated" }],
  });
  assert(evalResult.success === false, "userErrors force success=false");
  assert(evalResult.variantMediaVerification === false, "verification false on userErrors");
}

console.log("\nTEST 6: read-back empty media → variantMediaVerification=false");
{
  const evalResult = evaluateAssociationSuccess({
    expectedAssociations: 4,
    associatedOnReadBack: 0,
    userErrors: [],
  });
  assert(evalResult.variantMediaVerification === false, "empty read-back fails verification");
  assert(evalResult.success === false, "success false when media missing on read-back");

  const ok = evaluateAssociationSuccess({
    expectedAssociations: 4,
    associatedOnReadBack: 4,
    userErrors: [],
  });
  assert(ok.success && ok.variantMediaVerification, "full association verifies");
}

console.log("\nEXTRA: buildSourceVariantsForMedia prefers featuredImage / media group");
{
  const built = buildSourceVariantsForMedia({
    csvVariants: [
      { option1: "Turkuaz", option2: "S/M", sku: "A", image: "" },
      { option1: "Yeşil", option2: "S/M", sku: "B", image: "" },
    ],
    canonical: {
      variants: [
        {
          color: "Turkuaz",
          size: "S/M",
          sku: "A",
          mediaGroupKey: "color:turkuaz",
          featuredImage: TURKUAZ,
        },
        {
          color: "Yeşil",
          size: "S/M",
          sku: "B",
          mediaGroupKey: "color:yesil",
          featuredImage: YESIL,
        },
      ],
      variantMediaGroups: [
        { key: "color:turkuaz", optionValue: "Turkuaz", featuredImage: TURKUAZ },
        { key: "color:yesil", optionValue: "Yeşil", featuredImage: YESIL },
      ],
    },
  });
  assert(built[0].featuredImage === TURKUAZ, "Turkuaz featured from canonical");
  assert(built[1].featuredImage === YESIL, "Yeşil featured from canonical");
  assert(built[0].mediaGroupKey === "color:turkuaz", "mediaGroupKey preserved");
}

console.log("\nEXTRA: mnresize URL normalization");
{
  const a = normalizeMediaUrl(
    "https://cdn.dsmcdn.com/mnresize/1200/1800/prod/x.jpg?q=1",
  );
  const b = normalizeMediaUrl("https://cdn.dsmcdn.com/prod/x.jpg");
  assert(a === b, "mnresize + query stripped for same asset");
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
