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

/** CSV satırını güvenli escape ile serialize eder */
export function serializeShopifyCsvRow(fields: string[]): string {
  return fields
    .map((cell) => {
      const s = cell !== null && cell !== undefined ? String(cell) : "";
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

export function validateCsvRowLength(headerCount: number, row: string[]): boolean {
  return row.length === headerCount;
}

export function validateCsvContent(csvContent: string): {
  valid: boolean;
  headerCount: number;
  rowCounts: number[];
  error?: string;
} {
  const lines = csvContent.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return { valid: false, headerCount: 0, rowCounts: [], error: "empty-csv" };
  }

  const headerCells = splitCsvLine(lines[0]);
  const headerCount = headerCells.length;
  const rowCounts: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const count = splitCsvLine(lines[i]).length;
    rowCounts.push(count);
    if (count !== headerCount) {
      console.error("[CSV] validateCsvContent mismatch", {
        headerCount,
        rowCount: count,
        line: i + 1,
      });
      return {
        valid: false,
        headerCount,
        rowCounts,
        error: `columns length is ${headerCount}, got ${count} on line ${i + 1}`,
      };
    }
  }

  return { valid: true, headerCount, rowCounts };
}

/** Tek satırlık minimal ürün CSV — canonical header ile */
export function buildMinimalShopifyCsvRow(input: {
  title: string;
  brand?: string;
  price: number;
  imageUrl?: string;
}): string | null {
  if (!input.title || input.price <= 0) return null;

  const handle = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const row = Array(SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT).fill("") as string[];
  row[0] = input.title;
  row[1] = handle;
  row[3] = input.brand || "";
  row[4] = "Kategori";
  row[5] = "Kategori";
  row[7] = "TRUE";
  row[8] = "active";
  row[20] = String(input.price);
  row[23] = "TRUE";
  row[29] = "shopify";
  row[30] = "0";
  row[31] = "DENY";
  row[33] = "g";
  row[34] = "TRUE";
  row[35] = "manual";
  if (input.imageUrl) {
    row[36] = input.imageUrl;
    row[37] = "1";
    row[38] = input.title;
  }
  row[40] = "FALSE";
  row[41] = input.title;
  row[42] = input.title;

  const validation = validateCsvRowLength(SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT, row);
  if (!validation) {
    console.error("[CSV] buildMinimalShopifyCsvRow column mismatch", {
      headerCount: SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT,
      rowCount: row.length,
    });
    return null;
  }

  const headerLine = serializeShopifyCsvRow([...SHOPIFY_NEW_TEMPLATE_HEADERS]);
  const dataLine = serializeShopifyCsvRow(row);
  const csv = `${headerLine}\n${dataLine}`;
  const check = validateCsvContent(csv);
  console.log("[CSV] buildMinimalShopifyCsvRow", {
    headerCount: check.headerCount,
    rowCount: check.rowCounts[0] ?? 0,
    valid: check.valid,
  });
  return check.valid ? csv : null;
}
