/**
 * Canlı Trendyol varyant izleme testi — fixture değil, gerçek pipeline.
 * Çalıştır: npx tsx server/scripts/live-variant-trace-test.ts
 */
import { enterVariantTrace, getVariantTraceContext, evaluateVariantCollapse } from "../variant-trace";
import { runTrendyolScrapePipeline } from "../trendyol-scrape-pipeline";
import { enrichTrendyolResult } from "../trendyol-result-normalizer";
import { buildCanonicalProductForShopify } from "../variant-shape-normalizer";
import { generateCanonicalShopifyCSV } from "../shopify-canonical-export";

const LIVE_URL =
  process.env.TRENDYOL_TEST_URL ||
  "https://www.trendyol.com/framgan/y2k-beyaz-born-to-reat-baskili-oversize-t-shirt-p-941825789?boutiqueId=61&merchantId=1146443&sav=true";

const EXPECTED_SIZES = ["S", "M", "L", "XL"];

function sizesOf(variants: unknown): string[] {
  if (!variants || typeof variants !== "object") return [];
  const v = variants as { sizes?: string[]; allVariants?: Array<{ size?: string }> };
  if (Array.isArray(v.sizes) && v.sizes.length) return [...v.sizes].sort();
  const fromAll = (v.allVariants || []).map((x) => String(x.size || "").trim()).filter(Boolean);
  return [...new Set(fromAll)].sort();
}

function printTable(rows: Array<{ stage: string; count: number; sizes: string; source: string }>) {
  console.log("\n| Aşama | Varyant sayısı | Bedenler | Kaynak |");
  console.log("|---|---:|---|---|");
  for (const r of rows) {
    console.log(`| ${r.stage} | ${r.count} | ${r.sizes || "-"} | ${r.source} |`);
  }
}

async function main() {
  const requestId = `live-${Date.now().toString(36)}`;
  enterVariantTrace({ requestId, sourceUrl: LIVE_URL });

  console.log(`\n=== Canlı varyant izleme: p-941825789 ===\nURL: ${LIVE_URL}\n`);

  const pipeline = await runTrendyolScrapePipeline(LIVE_URL, "auto-fast");
  if (!pipeline.result) {
    console.error("Pipeline sonuç döndürmedi", pipeline.diagnostics?.stageErrors);
    process.exit(1);
  }

  let result = pipeline.result;
  result = await enrichTrendyolResult(LIVE_URL, result);

  const canonical = buildCanonicalProductForShopify({
    scrapeResult: result,
    sourceUrl: LIVE_URL,
  });

  const csv = canonical ? generateCanonicalShopifyCSV(canonical) : null;
  const csvRowCount = csv
    ? csv.split("\n").filter((line) => line.trim() && !line.startsWith("Handle")).length
    : 0;

  const ctx = getVariantTraceContext();
  const finalVariants = canonical?.variants ?? result.variants;
  const collapse = evaluateVariantCollapse(finalVariants);

  const tableRows: Array<{ stage: string; count: number; sizes: string; source: string }> = [];
  for (const s of ctx?.stages ?? []) {
    if (
      [
        "raw_dom",
        "embedded_state",
        "resolver_output",
        "stock_normalizer_output",
        "canonical_product",
        "csv_rows",
        "api_response",
      ].includes(s.stage)
    ) {
      tableRows.push({
        stage: s.stage,
        count: s.count,
        sizes: s.uniqueSizes.join(", "),
        source: s.stage,
      });
    }
  }
  tableRows.push({
    stage: "canonical_product (final)",
    count: canonical?.variants?.length ?? 0,
    sizes: sizesOf({ allVariants: canonical?.variants }).join(", "),
    source: "buildCanonicalProductForShopify",
  });
  tableRows.push({
    stage: "csv_rows (final)",
    count: csvRowCount,
    sizes: sizesOf({ allVariants: canonical?.variants }).join(", "),
    source: "generateCanonicalShopifyCSV",
  });

  printTable(tableRows);

  const finalSizes = sizesOf({ allVariants: canonical?.variants });
  console.log("\n--- Sonuç ---");
  console.log(`Final bedenler: [${finalSizes.join(", ")}]`);
  console.log(`Beklenen: [${EXPECTED_SIZES.join(", ")}]`);
  console.log(`CSV satır sayısı: ${csvRowCount}`);
  if (collapse.collapsed) {
    console.error(
      `VARIANT_COLLAPSE_DETECTED: richestCount=${collapse.richestCount} finalCount=${collapse.finalCount} collapsedAt=${collapse.collapsedAt}`,
    );
    console.error(`En zengin aşama: ${collapse.richestStage} bedenler=[${collapse.richestSizes.join(", ")}]`);
  }

  const missing = EXPECTED_SIZES.filter((s) => !finalSizes.includes(s));
  if (missing.length > 0) {
    console.error(`Eksik bedenler: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (csvRowCount < 4) {
    console.error(`CSV yeterli satır içermiyor: ${csvRowCount}`);
    process.exit(1);
  }
  console.log("\n✓ Canlı scrape: S, M, L, XL doğrulandı");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
