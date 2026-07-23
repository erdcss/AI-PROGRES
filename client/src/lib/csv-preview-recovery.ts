import type { CSVPreviewData } from "@/components/CSVDrawerProductPreview";
import type { CsvPreviewResponse, CsvStatusResponse } from "@/lib/shopify-csv-download";

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let index = 0;

  while (index < line.length) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && index + 1 < line.length && line[index + 1] === '"') {
        current += '"';
        index += 2;
      } else {
        inQuotes = !inQuotes;
        index++;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(normalizeCsvCell(current));
      current = "";
      index++;
    } else {
      current += char;
      index++;
    }
  }

  cells.push(normalizeCsvCell(current));
  return cells;
}

function normalizeCsvCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

export function parseCsvContent(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function findColumnIndex(headers: string[], names: string[]): number {
  const lowerHeaders = headers.map((header) => header.trim().toLowerCase());
  for (const name of names) {
    const index = lowerHeaders.indexOf(name.toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

function readColumn(headers: string[], row: string[], names: string[]): string {
  const index = findColumnIndex(headers, names);
  if (index < 0) return "";
  return row[index]?.trim() ?? "";
}

function parsePriceValue(raw: string): number {
  if (!raw.trim()) return 0;
  const clean = raw
    .replace(/[₺]/g, "")
    .replace(/\bTL\b/gi, "")
    .replace(/\s+/g, "")
    .trim();
  const trFull = clean.match(/^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/);
  if (trFull) {
    return Number.parseFloat(`${trFull[1].replace(/\./g, "")}.${trFull[2]}`);
  }
  const trThousands = clean.match(/^(\d{1,3}(?:\.\d{3})+)$/);
  if (trThousands) {
    return Number(trThousands[1].replace(/\./g, ""));
  }
  const normalized = clean.replace(/[^0-9.,]/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isProductDataRow(headers: string[], row: string[]): boolean {
  const title = readColumn(headers, row, ["Title"]);
  const handle = readColumn(headers, row, ["URL handle", "Handle"]);
  return Boolean(title || handle);
}

export function selectFirstProductRow(
  headers: string[],
  rows: string[][],
): string[] | null {
  for (const row of rows) {
    if (isProductDataRow(headers, row)) {
      return row;
    }
  }
  return null;
}

const RESTORED_SHOPIFY_BLOCK_REASON =
  "Bu önizleme diskten geri yüklendi. Shopify aktarımı için kaynak ürün yeniden doğrulanmalıdır.";

export function buildRestoredCsvPreview(params: {
  status: CsvStatusResponse;
  preview: CsvPreviewResponse;
  csvContent: string;
}): CSVPreviewData {
  const { status, preview, csvContent } = params;
  const parsed = parseCsvContent(csvContent);
  const headers = parsed.headers.length > 0 ? parsed.headers : preview.headers || [];
  const productRow = selectFirstProductRow(headers, parsed.rows);

  const title = productRow ? readColumn(headers, productRow, ["Title"]) : "";
  const vendor = productRow ? readColumn(headers, productRow, ["Vendor"]) : "";
  const priceRaw = productRow
    ? readColumn(headers, productRow, ["Variant Price", "Price"])
    : "";
  const imageUrl = productRow
    ? readColumn(headers, productRow, ["Product image URL", "Image Src"])
    : "";

  const validPrice = parsePriceValue(priceRaw);
  const csvModified =
    typeof status.csvModified === "string"
      ? status.csvModified
      : status.csvModified
        ? new Date(status.csvModified).toISOString()
        : new Date().toISOString();

  return {
    id: `restored-${status.csvModified || Date.now()}`,
    productTitle: title || "Son oluşturulan ürün",
    csvContent,
    csvPreview: {
      headers: preview.headers || [],
      rows: preview.rows || [],
      rowCount: preview.rowCount || 0,
    },
    sourceUrl: "",
    variants: {
      colors: [],
      sizes: [],
      allVariants: [],
    },
    images: imageUrl ? [imageUrl] : [],
    price: {
      original: validPrice,
      withProfit: validPrice,
    },
    brand: vendor || "",
    createdAt: csvModified,
    csvInfo: {
      ...status,
      ready: true,
    },
    restoredFromDisk: true,
    approvedForShopify: false,
    shopifyUploadBlocked: true,
    blockReason: RESTORED_SHOPIFY_BLOCK_REASON,
  };
}
