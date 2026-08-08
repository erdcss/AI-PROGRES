/**
 * Live variant-media verification for a Trendyol URL.
 * Usage: npx tsx scripts/verify-trendyol-variant-media.ts [url]
 */
import { runTrendyolScrapePipeline } from "../server/trendyol-scrape-pipeline";
import { generateCanonicalShopifyCSV } from "../server/shopify-canonical-export";
import { buildCanonicalProductForShopify } from "../server/variant-shape-normalizer";

const url =
  process.argv[2] ||
  "https://www.trendyol.com/tofs-textile/kadin-file-triko-panco-bluz-salas-oversize-yarasa-kol-yazlik-orgu-bluz-p-1134593582?boutiqueId=61&merchantId=929410";

async function main() {
  console.log("[verify] scraping:", url);
  const outcome = await runTrendyolScrapePipeline(url, "auto-fast");
  const result = (outcome as any)?.result ?? outcome;

  const variantsBag = (result as any)?.variants || {};
  const allVariants: any[] = Array.isArray(variantsBag.allVariants)
    ? variantsBag.allVariants
    : [];
  const groups: any[] = Array.isArray((result as any).variantMediaGroups)
    ? (result as any).variantMediaGroups
    : [];
  const colors = [
    ...new Set(
      allVariants.map((v) => String(v.color || "").trim()).filter(Boolean),
    ),
  ];
  const sizes = [
    ...new Set(
      allVariants.map((v) => String(v.size || "").trim()).filter(Boolean),
    ),
  ];

  console.log("\n========== VARIANT MEDIA REPORT ==========");
  console.log("title:", (result as any).title || "-");
  console.log("contentId:", (result as any).productContentId ?? (result as any).productId ?? "-");
  console.log("productMainId:", (result as any).productMainId ?? "-");
  console.log("mediaDrivingOption:", (result as any).mediaDrivingOption ?? "-");
  console.log("colors:", colors.join(", ") || "(none)");
  console.log("sizes:", sizes.join(", ") || "(none)");
  console.log("variantCount:", allVariants.length);
  console.log("\n--- variantMediaGroups ---");
  for (const g of groups) {
    console.log(
      JSON.stringify(
        {
          key: g.key,
          optionValue: g.optionValue,
          imageCount: Array.isArray(g.images) ? g.images.length : 0,
          featuredImage: g.featuredImage,
          sourceContentId: g.sourceContentId,
        },
        null,
        2,
      ),
    );
  }
  console.log("\n--- variants (media bindings) ---");
  for (const v of allVariants) {
    console.log(
      JSON.stringify(
        {
          color: v.color,
          size: v.size,
          mediaGroupKey: v.mediaGroupKey,
          featuredImage: v.featuredImage || v.image,
          inStock: v.inStock,
        },
        null,
        2,
      ),
    );
  }

  // Same-color sizes must share mediaGroupKey
  const byColor = new Map<string, Set<string>>();
  for (const v of allVariants) {
    const c = String(v.color || "");
    if (!c) continue;
    if (!byColor.has(c)) byColor.set(c, new Set());
    if (v.mediaGroupKey) byColor.get(c)!.add(String(v.mediaGroupKey));
  }
  console.log("\n--- same-color mediaGroupKey check ---");
  for (const [color, keys] of byColor) {
    const ok = keys.size <= 1;
    console.log(`${ok ? "OK" : "FAIL"} ${color}: keys=[${[...keys].join(", ")}]`);
  }

  try {
    const canonical = buildCanonicalProductForShopify({
      scrapeResult: result as any,
      sourceUrl: url,
    });
    const csv = generateCanonicalShopifyCSV(canonical);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const headers = lines[0]?.split(",") || [];
    const variantImageIdx = headers.findIndex((h) =>
      /variant image/i.test(h.replace(/"/g, "")),
    );
    console.log("\n--- CSV sample (first 3 data rows Variant Image) ---");
    console.log("Variant Image column index:", variantImageIdx);
    for (const line of lines.slice(1, 4)) {
      // crude CSV cell peek — enough for smoke
      const cells = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
      const img =
        variantImageIdx >= 0 ? (cells[variantImageIdx] || "").replace(/^"|"$/g, "") : "";
      console.log("Variant Image:", img.slice(0, 120));
    }
  } catch (err: any) {
    console.warn("[verify] canonical/csv skipped:", err?.message || err);
  }

  console.log("\n========== END ==========");
}

main().catch((err) => {
  console.error("[verify] failed:", err);
  process.exit(1);
});
