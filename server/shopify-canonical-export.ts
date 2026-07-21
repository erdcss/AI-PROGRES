import {
  SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT,
  SHOPIFY_NEW_TEMPLATE_HEADERS,
  sanitizeShopifyCsvHeaders,
} from "./shopify-csv-headers";
import type { CanonicalProductForShopify } from "./variant-shape-normalizer";
import { getShopifyInventoryConfig } from "@shared/shopify-inventory-config";
import { traceVariants } from "./variant-trace";
import { joinShopifyTags, buildAutomaticProductTags } from "@shared/shopify-tag-sanitizer";

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
  return joinShopifyTags(buildAutomaticProductTags(product.sourceProductId));
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

function resolveCsvVariantOptions(
  variant: CanonicalProductForShopify["variants"][number],
  isFirst: boolean,
  productHasRealColor: boolean,
) {
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

  // Ürün seviyesinde gerçek renk varsa tüm satırlar Renk+Beden şemasında kalmalı
  if (productHasRealColor && hasRealSize) {
    option1Name = isFirst ? "Renk" : "";
    option1Value = hasRealColor ? colorValue : "Tek Renk";
    option2Name = isFirst ? "Beden" : "";
    option2Value = sizeValue;
  } else if (hasRealColor && hasRealSize) {
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

function resolveVariantCsvSalePrice(
  variant: CanonicalProductForShopify["variants"][number],
  product: CanonicalProductForShopify,
): string {
  const variantPrice = Number.parseFloat(variant.price);
  if (Number.isFinite(variantPrice) && variantPrice > 0) {
    return variantPrice.toFixed(2);
  }
  const productPrice = Number.parseFloat(product.price);
  if (Number.isFinite(productPrice) && productPrice > 0) {
    return productPrice.toFixed(2);
  }
  return "";
}

/** Canonical üründen Shopify CSV üretir — her varyant satırında Handle dolu */
export function generateCanonicalShopifyCSV(
  product: CanonicalProductForShopify,
): string | null {
  const config = getShopifyInventoryConfig();
  const defaultSalePrice = resolveVariantCsvSalePrice(
    { price: product.price } as CanonicalProductForShopify["variants"][number],
    product,
  );
  if (!defaultSalePrice) {
    console.error("[CSV] generateCanonicalShopifyCSV — csv_missing_price", {
      title: product.title,
      price: product.price,
    });
    return null;
  }

  const headers = [...SHOPIFY_NEW_TEMPLATE_HEADERS];
  const rows: string[][] = [headers];
  const handle = product.handle;
  const bodyHtml = buildBodyHtml(product);
  const tags = buildTags(product);
  let imagePosition = 1;
  const addedImages = new Set<string>();
  const continueSelling = config.allowOverselling ? "CONTINUE" : "DENY";

  const rawExportVariants =
    product.variants.length > 0
      ? product.variants
      : [
          {
            color: "Tek Renk",
            size: "Standart",
            sku: `${product.sourceProductId}-default`,
            inStock: true,
            inventoryQty: config.defaultInStockQty,
            option1Name: "Title" as const,
            option1Value: "Default Title",
            price: product.price,
          },
        ];

  const namedColorVariants = rawExportVariants.filter(
    (v) => v.color && v.color !== "Tek Renk",
  );
  const colorScopedVariants =
    namedColorVariants.length > 0 ? namedColorVariants : rawExportVariants;

  // Stokta olmayan bedenler Shopify CSV'ye yazılmaz (env ile açıkça istenmedikçe)
  const stockScopedVariants = config.exportOutOfStockVariants
    ? colorScopedVariants
    : colorScopedVariants.filter((v) => v.inStock);

  const exportVariants =
    stockScopedVariants.length > 0 ? stockScopedVariants : colorScopedVariants.filter((v) => v.inStock);

  if (exportVariants.length === 0) {
    console.error("[CSV] generateCanonicalShopifyCSV — no in-stock variants to export", {
      title: product.title,
      total: colorScopedVariants.length,
    });
    return null;
  }

  const productHasRealColor = exportVariants.some(
    (v) => v.color && v.color !== "Tek Renk",
  );

  traceVariants("csv_rows", exportVariants, {
    source: "generateCanonicalShopifyCSV",
    options: { rowCount: exportVariants.length, handle },
  });

  exportVariants.forEach((variant, index) => {
    const isFirst = index === 0;
    const row: string[] = Array(TOTAL_COLUMNS).fill("");
    const salePrice = resolveVariantCsvSalePrice(variant, product);

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
      resolveCsvVariantOptions(variant, isFirst, productHasRealColor);

    row[COL.OPTION1_NAME] = option1Name;
    row[COL.OPTION1_VALUE] = option1Value;
    row[COL.OPTION2_NAME] = option2Name;
    row[COL.OPTION2_VALUE] = option2Value;

    row[COL.SKU] = variant.sku;
    row[COL.PRICE] = salePrice;
    row[COL.COMPARE_AT_PRICE] = product.compareAtPrice ?? "";
    row[COL.CHARGE_TAX] = "TRUE";
    row[COL.INVENTORY_TRACKER] = "shopify";
    row[COL.INVENTORY_QUANTITY] = String(
      variant.inStock ? variant.inventoryQty : 0,
    );
    row[COL.CONTINUE_SELLING] = continueSelling;
    row[COL.WEIGHT_UNIT] = "g";
    row[COL.REQUIRES_SHIPPING] = "TRUE";
    row[COL.FULFILLMENT_SERVICE] = "manual";

    if (isFirst && product.images[0]) {
      row[COL.PRODUCT_IMAGE_URL] = product.images[0];
      row[COL.IMAGE_POSITION] = String(imagePosition);
      row[COL.IMAGE_ALT_TEXT] = productHasRealColor
        ? `${product.title} - ${variant.color}`
        : product.title;
      addedImages.add(product.images[0]);
      imagePosition++;
    } else if (variant.image && !addedImages.has(variant.image)) {
      row[COL.PRODUCT_IMAGE_URL] = variant.image;
      row[COL.IMAGE_POSITION] = String(imagePosition);
      row[COL.IMAGE_ALT_TEXT] = `${product.title} - ${variant.color}`;
      addedImages.add(variant.image);
      imagePosition++;
    }

    // Shopify variant ↔ image bağlama
    if (variant.image) {
      row[COL.VARIANT_IMAGE_URL] = variant.image;
    } else if (isFirst && product.images[0]) {
      row[COL.VARIANT_IMAGE_URL] = product.images[0];
    }

    rows.push(row);
  });

  // Kalan galeri: imagesByColor varsa renge göre alt text; yoksa düz product.images
  const imagesByColor = product.imagesByColor || {};
  const colorKeys = Object.keys(imagesByColor);
  if (colorKeys.length > 0) {
    for (const color of colorKeys) {
      for (const imgUrl of imagesByColor[color] || []) {
        if (!imgUrl || addedImages.has(imgUrl)) continue;
        const imageRow: string[] = Array(TOTAL_COLUMNS).fill("");
        imageRow[COL.URL_HANDLE] = handle;
        imageRow[COL.PRODUCT_IMAGE_URL] = imgUrl;
        imageRow[COL.IMAGE_POSITION] = String(imagePosition);
        imageRow[COL.IMAGE_ALT_TEXT] = `${product.title} - ${color}`;
        rows.push(imageRow);
        addedImages.add(imgUrl);
        imagePosition++;
      }
    }
  }

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
    variantRows: exportVariants.length,
    imageRows: addedImages.size,
    skippedOutOfStock: colorScopedVariants.length - exportVariants.length,
  });

  return sanitizeShopifyCsvHeaders(csvBody);
}
