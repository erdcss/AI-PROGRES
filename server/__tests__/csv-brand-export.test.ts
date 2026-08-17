import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeScrapeFields } from "../scrape-field-merge.ts";
import { generateCanonicalShopifyCSV } from "../shopify-canonical-export.ts";
import { buildCanonicalProductForShopify } from "../variant-shape-normalizer.ts";
import {
  brandFromTrendyolUrl,
  isValidExportBrandName,
  resolveExportBrand,
} from "../trendyol-title-utils.ts";
import { parseCSVRow } from "../csv-paths.ts";

describe("export brand resolution", () => {
  it("rejects placeholder Marka and uses features", () => {
    const merged = mergeScrapeFields({
      title: "Test Tişört",
      brand: "Marka",
      category: "Giyim",
      sourceUrl: "https://www.trendyol.com/brand/x-p-123456789",
      features: [{ key: "Marka", value: "U.S. Polo Assn." }],
      price: { original: 100 },
      images: ["https://cdn.dsmcdn.com/a.jpg"],
    });
    assert.equal(merged.brand, "U.S. Polo Assn.");
    assert.equal(merged.brandSource, "features");
  });

  it("does not use URL segment brand as vendor", () => {
    assert.equal(
      brandFromTrendyolUrl("https://www.trendyol.com/brand/x-p-123456789"),
      null,
    );
    assert.equal(
      brandFromTrendyolUrl("https://www.trendyol.com/us-polo-assn/urun-p-123456789"),
      "Us Polo Assn",
    );
  });

  it("rejects category duplicated as brand", () => {
    assert.equal(
      isValidExportBrandName("Giyim", { category: "Giyim", title: "Test" }),
      false,
    );
  });

  it("writes real brand to CSV Vendor column", () => {
    const canonical = buildCanonicalProductForShopify({
      sourceUrl: "https://www.trendyol.com/lela/urun-p-123456789",
      scrapeResult: {
        title: "Lela Elbise",
        brand: "Marka",
        category: "Elbise",
        features: [{ name: "Marka", value: "Lela" }],
        price: { original: 200, withProfit: 220 },
        images: ["https://cdn.dsmcdn.com/a.jpg"],
        variants: { items: [{ color: "Siyah", size: "M", inStock: true }] },
      },
    });
    assert.ok(canonical);
    const csv = generateCanonicalShopifyCSV(canonical!);
    assert.ok(csv);
    const lines = csv!.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const headers = parseCSVRow(lines[0]);
    const row = parseCSVRow(lines[1]);
    const vendorIdx = headers.findIndex((h) => h.toLowerCase() === "vendor");
    assert.equal(row[vendorIdx], "Lela");
  });

  it("resolveExportBrand prefers features over invalid root brand", () => {
    const resolved = resolveExportBrand({
      layers: [{ key: "root", data: { brand: "Kategori", category: "Kategori" } }],
      features: [{ key: "Marka", value: "Mavi" }],
      title: "Mavi Jean",
      category: "Kategori",
    });
    assert.equal(resolved.brand, "Mavi");
    assert.equal(resolved.source, "features");
  });
});
