import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRestoredCsvPreview,
  parseCsvContent,
  selectFirstProductRow,
} from "./csv-preview-recovery.ts";
import type { CsvPreviewResponse, CsvStatusResponse } from "./shopify-csv-download.ts";
import {
  applyUrlQueueClearOnly,
  applyWorkspaceClear,
} from "./scraper-workspace-clear.ts";

const BASE_STATUS: CsvStatusResponse = {
  ready: true,
  csvExists: true,
  downloadUrl: "/api/download/shopify-urunler.csv",
  filename: "shopify-urunler.csv",
  productCount: 1,
  csvModified: "2026-06-26T12:00:00.000Z",
};

const BASE_PREVIEW: CsvPreviewResponse = {
  headers: ["Title", "URL handle", "Vendor", "Variant Price", "Product image URL"],
  rows: [],
  rowCount: 1,
};

describe("buildRestoredCsvPreview", () => {
  it("parses a valid Shopify CSV row", () => {
    const csvContent = [
      "Title,URL handle,Vendor,Variant Price,Product image URL,Body (HTML)",
      '"Kadın Elbise","kadin-elbise","Trend Brand","541.20","https://cdn.example/main.jpg","Normal description"',
    ].join("\n");

    const restored = buildRestoredCsvPreview({
      status: BASE_STATUS,
      preview: BASE_PREVIEW,
      csvContent,
    });

    assert.equal(restored.productTitle, "Kadın Elbise");
    assert.equal(restored.brand, "Trend Brand");
    assert.equal(restored.price?.original, 541.2);
    assert.equal(restored.price?.withProfit, 541.2);
    assert.deepEqual(restored.images, ["https://cdn.example/main.jpg"]);
    assert.equal(restored.restoredFromDisk, true);
    assert.equal(restored.shopifyUploadBlocked, true);
  });

  it("keeps quoted commas inside description columns", () => {
    const csvContent = [
      "Title,URL handle,Vendor,Variant Price,Product image URL,Body (HTML)",
      '"Ürün","urun","Marka","120.50","https://cdn.example/a.jpg","Açıklama, virgüllü ""alıntı"""',
    ].join("\n");

    const parsed = parseCsvContent(csvContent);
    assert.equal(parsed.rows[0][5], 'Açıklama, virgüllü "alıntı"');

    const restored = buildRestoredCsvPreview({
      status: BASE_STATUS,
      preview: BASE_PREVIEW,
      csvContent,
    });

    assert.equal(restored.productTitle, "Ürün");
    assert.equal(restored.brand, "Marka");
  });

  it("falls back when title is missing", () => {
    const csvContent = [
      "Title,URL handle,Vendor,Variant Price,Product image URL",
      ',"only-handle","Marka","99.00",""',
    ].join("\n");

    const restored = buildRestoredCsvPreview({
      status: BASE_STATUS,
      preview: BASE_PREVIEW,
      csvContent,
    });

    assert.equal(restored.productTitle, "Son oluşturulan ürün");
  });

  it("returns empty images when image column is blank", () => {
    const csvContent = [
      "Title,URL handle,Vendor,Variant Price,Product image URL",
      '"Ürün","urun","Marka","99.00",""',
    ].join("\n");

    const restored = buildRestoredCsvPreview({
      status: BASE_STATUS,
      preview: BASE_PREVIEW,
      csvContent,
    });

    assert.deepEqual(restored.images, []);
  });

  it("normalizes broken price to zero without NaN", () => {
    const csvContent = [
      "Title,URL handle,Vendor,Variant Price,Product image URL",
      '"Ürün","urun","Marka","not-a-price",""',
    ].join("\n");

    const restored = buildRestoredCsvPreview({
      status: BASE_STATUS,
      preview: BASE_PREVIEW,
      csvContent,
    });

    assert.equal(restored.price?.original, 0);
    assert.equal(restored.price?.withProfit, 0);
    assert.equal(Number.isNaN(restored.price?.original ?? NaN), false);
  });

  it("skips image-only rows when selecting product row", () => {
    const csvContent = [
      "Title,URL handle,Product image URL,Variant Price",
      '"Ana Ürün","ana-urun","https://cdn.example/main.jpg","250.00"',
      ',"","https://cdn.example/extra.jpg",""',
    ].join("\n");

    const parsed = parseCsvContent(csvContent);
    const productRow = selectFirstProductRow(parsed.headers, parsed.rows);

    assert.ok(productRow);
    assert.equal(productRow?.[0], "Ana Ürün");

    const restored = buildRestoredCsvPreview({
      status: BASE_STATUS,
      preview: BASE_PREVIEW,
      csvContent,
    });

    assert.equal(restored.productTitle, "Ana Ürün");
    assert.equal(restored.price?.original, 250);
  });
});

describe("scraper workspace clear helpers", () => {
  it("clears only URL queue and keeps preview/product", () => {
    const initial = {
      urlQueue: [{ url: "https://example.com" }],
      product: { title: "Ürün" },
      csvPreviews: [{ id: "preview-1" }],
    };

    const next = applyUrlQueueClearOnly(initial);

    assert.deepEqual(next.urlQueue, []);
    assert.equal(next.product, initial.product);
    assert.deepEqual(next.csvPreviews, initial.csvPreviews);
  });

  it("clears all frontend scrape state", () => {
    const initial = {
      urlQueue: [{ url: "https://example.com" }],
      product: { title: "Ürün" },
      csvPreviews: [{ id: "preview-1" }],
    };

    const next = applyWorkspaceClear(initial);

    assert.deepEqual(next.urlQueue, []);
    assert.equal(next.product, null);
    assert.deepEqual(next.csvPreviews, []);
  });
});
