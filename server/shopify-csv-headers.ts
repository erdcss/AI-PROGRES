/** Shopify new-import template column headers (single source of truth). */
export const SHOPIFY_NEW_TEMPLATE_HEADERS: readonly string[] = [
  "Title",
  "URL handle",
  "Description",
  "Vendor",
  "Product category",
  "Type",
  "Tags",
  "Published on online store",
  "Status",
  "SKU",
  "Barcode",
  "Option1 name",
  "Option1 value",
  "Option1 Linked To",
  "Option2 name",
  "Option2 value",
  "Option2 Linked To",
  "Option3 name",
  "Option3 value",
  "Option3 Linked To",
  "Price",
  "Compare-at price",
  "Cost per item",
  "Charge tax",
  "Tax code",
  "Unit price total measure",
  "Unit price total measure unit",
  "Unit price base measure",
  "Unit price base measure unit",
  "Inventory tracker",
  "Inventory quantity",
  "Continue selling when out of stock",
  "Weight value (grams)",
  "Weight unit for display",
  "Requires shipping",
  "Fulfillment service",
  "Product image URL",
  "Image position",
  "Image alt text",
  "Variant image URL",
  "Gift card",
  "SEO title",
  "SEO description",
  "Color (product.metafields.shopify.color-pattern)",
  "Google Shopping / Google product category",
  "Google Shopping / Gender",
  "Google Shopping / Age group",
  "Google Shopping / Manufacturer part number (MPN)",
  "Google Shopping / Ad group name",
  "Google Shopping / Ads labels",
  "Google Shopping / Condition",
  "Google Shopping / Custom product",
  "Google Shopping / Custom label 0",
  "Google Shopping / Custom label 1",
  "Google Shopping / Custom label 2",
  "Google Shopping / Custom label 3",
  "Google Shopping / Custom label 4",
] as const;

export const SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT = SHOPIFY_NEW_TEMPLATE_HEADERS.length;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      i++;
    } else {
      current += char;
      i++;
    }
  }

  cells.push(current.trim());
  return cells;
}

/** Sanitize a single CSV header cell (CSV content only — not code identifiers). */
export function sanitizeShopifyCsvHeaderField(field: string): string {
  return field
    .replace(/Optiion1 name/g, "Option1 name")
    .replace(/Optiion(\d)/g, "Option$1")
    .replace(/Fulfillmentservice/g, "Fulfillment service")
    .replace(/GoogleShopping\s*\//g, "Google Shopping /")
    .replace(/GoogleShopping/g, "Google Shopping");
}

/** Sanitize the header row string of a Shopify CSV export. */
export function sanitizeShopifyCsvHeaderLine(headerLine: string): string {
  const fields = splitCsvLine(headerLine).map(sanitizeShopifyCsvHeaderField);

  if (fields.length === SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT) {
    return [...SHOPIFY_NEW_TEMPLATE_HEADERS].join(",");
  }

  return fields.join(",");
}

/**
 * Sanitize Shopify CSV content before persist/serve.
 * Only mutates CSV text — never touches TypeScript identifiers elsewhere.
 */
export function sanitizeShopifyCsvHeaders(csvContent: string): string {
  const hadBom = csvContent.startsWith("\uFEFF");
  const withoutBom = csvContent.replace(/^\uFEFF/, "");
  if (!withoutBom.trim()) {
    return csvContent;
  }

  const newline = withoutBom.includes("\r\n") ? "\r\n" : "\n";
  const lines = withoutBom.split(/\r?\n/);
  lines[0] = sanitizeShopifyCsvHeaderLine(lines[0]);
  const body = lines.join(newline);
  return hadBom ? `\uFEFF${body}` : body;
}

/** @deprecated Use sanitizeShopifyCsvHeaders */
export const normalizeShopifyCsvContent = sanitizeShopifyCsvHeaders;

/** @deprecated Use sanitizeShopifyCsvHeaderLine */
export const normalizeShopifyCsvHeaderLine = sanitizeShopifyCsvHeaderLine;

export function getCanonicalShopifyCsvHeaders(): string[] {
  return [...SHOPIFY_NEW_TEMPLATE_HEADERS];
}
