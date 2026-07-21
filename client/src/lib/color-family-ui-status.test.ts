/**
 * Renk ailesi UI status resolver testleri
 * Çalıştır: npx tsx client/src/lib/color-family-ui-status.test.ts
 */
import {
  resolveColorFamilyUiStatus,
  shouldBlockShopifyForColorFamily,
} from "./color-family-ui-status";
import { buildCsvPreviewEntry, type ScrapedUrlPayload } from "./scrape-url-client";

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

console.log("\n=== Color Family UI Status ===\n");

{
  console.log("1) Tam başarılı 2 renk ailesi → success");
  const ui = resolveColorFamilyUiStatus({
    colorFamilyStatus: {
      attempted: true,
      applicable: true,
      state: "success",
      candidateCount: 2,
      fetchedMemberCount: 2,
      failedMemberCount: 0,
      colorCount: 2,
      variantCount: 5,
      imageCount: 8,
      galleriesWithImages: 2,
      expectedGalleryCount: 2,
      variantsWithImage: 5,
      aliasesCount: 2,
      familySourceKey: "trendyol-group:1149286458",
      colors: ["Acı Kahve", "Siyah"],
      sourceAliases: ["trendyol:1149286458", "trendyol:1150476051"],
      failedMembers: [],
      message: "ok",
    },
    imagesByColor: {
      "Acı Kahve": ["https://cdn.dsmcdn.com/a.jpg"],
      Siyah: ["https://cdn.dsmcdn.com/b.jpg"],
    },
  });
  assert(ui.state === "success", "success state");
  assert(ui.title.includes("çalıştı"), "title");
  assert(ui.familySourceKey === "trendyol-group:1149286458", "family key visible");
  assert(ui.sourceAliases.length === 2, "aliases");
  assert(ui.checks.find((c) => c.key === "galleries")?.ok === true, "gallery check ok");
}

{
  console.log("2) 3 aday, 2 başarılı, 1 fail → partial");
  const ui = resolveColorFamilyUiStatus({
    colorFamilyStatus: {
      attempted: true,
      applicable: true,
      state: "partial",
      candidateCount: 3,
      fetchedMemberCount: 2,
      failedMemberCount: 1,
      colorCount: 2,
      variantCount: 4,
      imageCount: 4,
      galleriesWithImages: 2,
      expectedGalleryCount: 2,
      variantsWithImage: 4,
      aliasesCount: 2,
      familySourceKey: "trendyol-group:1149286458",
      colors: ["Acı Kahve", "Siyah"],
      sourceAliases: ["trendyol:1149286458", "trendyol:1150476051"],
      failedMembers: [{ productId: "116", error: "timeout" }],
      message: "partial",
    },
  });
  assert(ui.state === "partial", "partial");
  assert(ui.failedCount === 1, "failedCount");
}

{
  console.log("3) 2 aday ama 1 renk → failed + shopify block");
  const failedPreview = {
    colorFamilyStatus: {
      attempted: true,
      crawlAttempted: true,
      applicable: true,
      state: "failed" as const,
      candidateCount: 2,
      fetchedMemberCount: 1,
      failedMemberCount: 1,
      colorCount: 1,
      variantCount: 2,
      imageCount: 1,
      galleriesWithImages: 1,
      expectedGalleryCount: 2,
      variantsWithImage: 2,
      aliasesCount: 0,
      colors: ["Acı Kahve"],
      sourceAliases: [] as string[],
      failedMembers: [{ productId: "1150476051", error: "timeout" }],
      message: "failed",
    },
  };
  const ui = resolveColorFamilyUiStatus(failedPreview);
  assert(ui.state === "failed", "failed");
  assert(shouldBlockShopifyForColorFamily(failedPreview) === true, "shopify blocked on failed");
}

{
  console.log("3b) crawl yok + gürültülü aday → shopify engellenmez");
  const noisy = {
    colorFamilyStatus: {
      attempted: true,
      crawlAttempted: false,
      applicable: false,
      state: "not_applicable" as const,
      candidateCount: 5,
      fetchedMemberCount: 0,
      failedMemberCount: 0,
      colorCount: 3,
      variantCount: 9,
      imageCount: 0,
      galleriesWithImages: 0,
      expectedGalleryCount: 3,
      variantsWithImage: 0,
      aliasesCount: 0,
      colors: ["A", "B", "C"],
      sourceAliases: [] as string[],
      failedMembers: [],
      message: "no crawl",
    },
  };
  assert(shouldBlockShopifyForColorFamily(noisy) === false, "no crawl → no block");
}

{
  console.log("4) tek renkli → not_applicable");
  const ui = resolveColorFamilyUiStatus({
    colorFamilyStatus: {
      attempted: false,
      applicable: false,
      state: "not_applicable",
      candidateCount: 1,
      fetchedMemberCount: 1,
      failedMemberCount: 0,
      colorCount: 1,
      variantCount: 3,
      imageCount: 2,
      galleriesWithImages: 1,
      expectedGalleryCount: 1,
      variantsWithImage: 3,
      aliasesCount: 1,
      colors: ["Siyah"],
      sourceAliases: ["trendyol:1"],
      failedMembers: [],
      message: "tek",
    },
  });
  assert(ui.state === "not_applicable", "not_applicable");
  assert(shouldBlockShopifyForColorFamily({ colorFamilyStatus: {
    attempted: false,
    applicable: false,
    state: "not_applicable",
    candidateCount: 1,
    fetchedMemberCount: 1,
    failedMemberCount: 0,
    colorCount: 1,
    variantCount: 3,
    imageCount: 2,
    galleriesWithImages: 1,
    expectedGalleryCount: 1,
    variantsWithImage: 3,
    aliasesCount: 1,
    colors: ["Siyah"],
    sourceAliases: ["trendyol:1"],
    failedMembers: [],
    message: "tek",
  } }) === false, "not blocked");
}

{
  console.log("5) eski payload çok renk → not_applicable (unknown değil)");
  const ui = resolveColorFamilyUiStatus({
    productTitle: "Eski",
    variants: { colors: ["Kırmızı", "Mavi", "Siyah"], allVariants: [] },
  } as never);
  assert(ui.state === "not_applicable", "multi-color without family → not_applicable");
  assert(ui.state !== "success", "colors alone ≠ success");
  assert(ui.title.includes("Çok renkli") || ui.colorCount === 3, "açık başlık");
}

{
  console.log("6) alias/family key yok → success olmamalı (legacy)");
  const ui = resolveColorFamilyUiStatus({
    colorFamily: {
      colors: ["Acı Kahve", "Siyah"],
      members: [
        { productId: "1", color: "Acı Kahve", images: ["https://a.jpg"], ok: true },
        { productId: "2", color: "Siyah", images: ["https://b.jpg"], ok: true },
      ],
    },
    variants: {
      colors: ["Acı Kahve", "Siyah"],
      allVariants: [
        { color: "Acı Kahve", size: "S", image: "https://a.jpg" },
        { color: "Siyah", size: "M", image: "https://b.jpg" },
      ],
    },
    imagesByColor: {
      "Acı Kahve": ["https://a.jpg"],
      Siyah: ["https://b.jpg"],
    },
  });
  assert(ui.state !== "success", "no family key → not success");
}

{
  console.log("7) galeri eksik → partial (legacy)");
  const ui = resolveColorFamilyUiStatus({
    familySourceKey: "trendyol-group:1149286458",
    sourceAliases: ["trendyol:1149286458", "trendyol:1150476051"],
    colorFamily: {
      familySourceKey: "trendyol-group:1149286458",
      colors: ["Acı Kahve", "Siyah"],
      sourceAliases: ["trendyol:1149286458", "trendyol:1150476051"],
      members: [
        { productId: "1149286458", color: "Acı Kahve", images: ["https://a.jpg"], ok: true },
        { productId: "1150476051", color: "Siyah", images: [], ok: true },
      ],
    },
    imagesByColor: {
      "Acı Kahve": ["https://a.jpg"],
      Siyah: [],
    },
    variants: {
      colors: ["Acı Kahve", "Siyah"],
      allVariants: [
        { color: "Acı Kahve", size: "S", image: "https://a.jpg" },
        { color: "Siyah", size: "M" },
      ],
    },
  });
  assert(ui.state === "partial" || ui.checks.find((c) => c.key === "galleries")?.ok === false, "missing gallery");
  assert(ui.sourceAliases.length === 2, "aliases deduped");
}

{
  console.log("8) buildCsvPreviewEntry alanları korunmalı");
  const payload = {
    title: "Test Elbise",
    brand: "BLUEMISS",
    price: {
      original: 1000,
      withProfit: 1200,
      formatted: "1000",
      profitFormatted: "1200",
      currency: "TRY",
    },
    images: ["https://cdn.dsmcdn.com/a.jpg"],
    originalUrl: "https://www.trendyol.com/x-p-1149286458",
    sourceUrl: "https://www.trendyol.com/x-p-1149286458",
    colorFamilyStatus: {
      attempted: true,
      applicable: true,
      state: "success" as const,
      candidateCount: 2,
      fetchedMemberCount: 2,
      failedMemberCount: 0,
      colorCount: 2,
      variantCount: 4,
      imageCount: 6,
      galleriesWithImages: 2,
      expectedGalleryCount: 2,
      variantsWithImage: 4,
      aliasesCount: 2,
      familySourceKey: "trendyol-group:1149286458",
      colors: ["Acı Kahve", "Siyah"],
      sourceAliases: ["trendyol:1149286458", "trendyol:1150476051"],
      failedMembers: [],
      message: "ok",
    },
    imagesByColor: {
      "Acı Kahve": ["https://cdn.dsmcdn.com/a.jpg"],
      Siyah: ["https://cdn.dsmcdn.com/b.jpg"],
    },
    sourceAliases: ["trendyol:1149286458", "trendyol:1150476051"],
    familySourceKey: "trendyol-group:1149286458",
    variants: {
      colors: ["Acı Kahve", "Siyah"],
      sizes: ["S", "M"],
      allVariants: [
        {
          color: "Acı Kahve",
          size: "S",
          inStock: true,
          image: "https://cdn.dsmcdn.com/a.jpg",
          sourceProductId: "1149286458",
        },
      ],
    },
  } satisfies ScrapedUrlPayload;

  const entry = buildCsvPreviewEntry(payload, payload.sourceUrl, "test");
  assert(entry.colorFamilyStatus?.state === "success", "status preserved");
  assert(Boolean(entry.imagesByColor?.Siyah), "imagesByColor preserved");
  assert(entry.sourceAliases?.length === 2, "aliases preserved");
  assert(entry.familySourceKey === "trendyol-group:1149286458", "family key preserved");
  assert(
    entry.variants.allVariants.some(
      (v: { image?: string }) => v.image === "https://cdn.dsmcdn.com/a.jpg",
    ),
    "variant.image preserved",
  );
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
process.exit(failed > 0 ? 1 : 0);
