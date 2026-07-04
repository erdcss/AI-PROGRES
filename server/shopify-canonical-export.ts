import {
  SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT,
  SHOPIFY_NEW_TEMPLATE_HEADERS,
  sanitizeShopifyCsvHeaders,
} from "./shopify-csv-headers";
import type { CanonicalProductForShopify } from "./variant-shape-normalizer";
import { getShopifyInventoryConfig } from "@shared/shopify-inventory-config";

const COL = {
  TITLE: 0,
  URL_HANDLE: 1,
  DESCRIPTION: 2,
  VENDOR: 3,
  PRODUCT_CATEGORY: 4,
  TYPE: 5,
  TAGS: 6,
  PUBLISHED: 7,
  STATUS: 8,
  SKU: 9,
  OPTION1_NAME: 11,
  OPTION1_VALUE: 12,
  OPTION2_NAME: 14,
  OPTION2_VALUE: 15,
  PRICE: 20,
  COMPARE_AT_PRICE: 21,
  CHARGE_TAX: 23,
  INVENTORY_TRACKER: 29,
  INVENTORY_QUANTITY: 30,
  CONTINUE_SELLING: 31,
  WEIGHT_UNIT: 33,
  REQUIRES_SHIPPING: 34,
  FULFILLMENT_SERVICE: 35,
  PRODUCT_IMAGE_URL: 36,
  IMAGE_POSITION: 37,
  IMAGE_ALT_TEXT: 38,
  VARIANT_IMAGE_URL: 39,
  GIFT_CARD: 40,
  SEO_TITLE: 41,
  SEO_DESCRIPTION: 42,
} as const;

const TOTAL_COLUMNS = SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT;

function escapeCsvCell(cell: string): string {
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function buildTags(product: CanonicalProductForShopify): string {
  const base = [
    "trendyol-import",
    "source:trendyol",
    `trendyol:${product.sourceProductId}`,
  ];
  return base.join(", ");
}

function buildBodyHtml(product: CanonicalProductForShopify): string {
  const inStockSizes = [
    ...new Set(product.variants.filter((v) => v.inStock).map((v) => v.size)),
  ];
  const inStockColors = [
    ...new Set(product.variants.filter((v) => v.inStock).map((v) => v.color)),
  ];
  let html = `<div class="product-details">`;
  if (product.brand) html += `<p><strong>Marka:</strong> ${product.brand}</p>`;
  if (inStockColors.length)
    html += `<p><strong>Mevcut Renkler:</strong> ${inStockColors.join(", ")}</p>`;
  if (inStockSizes.length)
    html += `<p><strong>Mevcut Bedenler:</strong> ${inStockSizes.join(", ")}</p>`;
  html += `</div>`;
  return html;
}

function resolveCsvVariantOptions(variant: CanonicalProductForShopify["variants"][number], isFirst: boolean) {
  const colorValue =
    variant.color && variant.color !== "Tek Renk" ? variant.color : "Tek Renk";
  const sizeValue = variant.size && variant.size !== "Standart" ? variant.size : "";

  const hasRealColor = colorValue !== "Tek Renk";
  const hasRealSize =
    Boolean(sizeValue) && sizeValue !== "Standart" && sizeValue !== "Tek Beden";

  let option1Name = "";
  let option1Value = "";
  let option2Name = "";
  let option2Value = "";

  if (hasRealColor && hasRealSize) {
    option1Name = isFirst ? "Renk" : "";
    option1Value = colorValue;
    option2Name = isFirst ? "Beden" : "";
    option2Value = sizeValue;
  } else if (hasRealSize) {
    option1Name = isFirst ? "Beden" : "";
    option1Value = sizeValue;
  } else if (hasRealColor) {
    option1Name = isFirst ? "Renk" : "";
    option1Value = colorValue;
  } else {
    option1Name = isFirst ? "Title" : "";
    option1Value = "Default Title";
  }

  return { option1Name, option1Value, option2Name, option2Value };
}

/** Canonical üründen Shopify CSV üretir — her varyant satırında Handle dolu */
export function generateCanonicalShopifyCSV(
  product: CanonicalProductForShopify,
): string {
  const config = getShopifyInventoryConfig();
  const salePrice =
    product.price && product.price !== "0"
      ? product.price
      : "29.90";
  const compareAt = product.price
    ? (Math.round(parseFloat(product.price) * 1.2 * 100) / 100).toString()
    : "0";

  const headers = [...SHOPIFY_NEW_TEMPLATE_HEADERS];
  const rows: string[][] = [headers];
  const handle = product.handle;
  const bodyHtml = buildBodyHtml(product);
  const tags = buildTags(product);
  let imagePosition = 1;
  const addedImages = new Set<string>();

  product.variants.forEach((variant, index) => {
    const isFirst = index === 0;
    const row: string[] = Array(TOTAL_COLUMNS).fill("");

    row[COL.URL_HANDLE] = handle;

    if (isFirst) {
      row[COL.TITLE] = product.title;
      row[COL.DESCRIPTION] = bodyHtml;
      row[COL.VENDOR] = product.brand || "Generic";
      row[COL.TAGS] = tags;
      row[COL.PUBLISHED] = "TRUE";
      row[COL.STATUS] = variant.inStock ? "active" : "draft";
      row[COL.GIFT_CARD] = "FALSE";
      row[COL.SEO_TITLE] = product.title.substring(0, 70);
    } else {
      row[COL.STATUS] = variant.inStock ? "active" : "draft";
    }

    const { option1Name, option1Value, option2Name, option2Value } =
      resolveCsvVariantOptions(variant, isFirst);

    row[COL.OPTION1_NAME] = option1Name;
    row[COL.OPTION1_VALUE] = option1Value;
    row[COL.OPTION2_NAME] = option2Name;
    row[COL.OPTION2_VALUE] = option2Value;

    row[COL.SKU] = variant.sku;
    row[COL.PRICE] = salePrice;
    row[COL.COMPARE_AT_PRICE] = compareAt;
    row[COL.CHARGE_TAX] = "TRUE";
    row[COL.INVENTORY_TRACKER] = "shopify";
    row[COL.INVENTORY_QUANTITY] = String(
      variant.inStock ? variant.inventoryQty : config.exportOutOfStockVariants ? 0 : 0,
    );
    row[COL.CONTINUE_SELLING] =
      variant.inStock || !config.exportOutOfStockVariants ? "CONTINUE" : "DENY";
    row[COL.WEIGHT_UNIT] = "g";
    row[COL.REQUIRES_SHIPPING] = "TRUE";
    row[COL.FULFILLMENT_SERVICE] = "manual";

    if (isFirst && product.images[0]) {
      row[COL.PRODUCT_IMAGE_URL] = product.images[0];
      row[COL.IMAGE_POSITION] = String(imagePosition);
      row[COL.IMAGE_ALT_TEXT] = product.title;
      addedImages.add(product.images[0]);
      imagePosition++;
    } else if (variant.image && !addedImages.has(variant.image)) {
      row[COL.PRODUCT_IMAGE_URL] = variant.image;
      row[COL.IMAGE_POSITION] = String(imagePosition);
      row[COL.IMAGE_ALT_TEXT] = `${product.title} - ${variant.color}`;
      addedImages.add(variant.image);
      imagePosition++;
    }

    rows.push(row);
  });

  product.images.forEach((imgUrl) => {
    if (!imgUrl || addedImages.has(imgUrl)) return;
    const imageRow: string[] = Array(TOTAL_COLUMNS).fill("");
    imageRow[COL.URL_HANDLE] = handle;
    imageRow[COL.PRODUCT_IMAGE_URL] = imgUrl;
    imageRow[COL.IMAGE_POSITION] = String(imagePosition);
    imageRow[COL.IMAGE_ALT_TEXT] = product.title;
    rows.push(imageRow);
    addedImages.add(imgUrl);
    imagePosition++;
  });

  const csvBody = rows
    .map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(","))
    .join("\n");

  console.log("[FlowTrace] CSV generator=shopify-canonical-export.ts", {
    handle,
    variantRows: product.variants.length,
    imageRows: addedImages.size,
  });

  return sanitizeShopifyCsvHeaders(csvBody);
}
