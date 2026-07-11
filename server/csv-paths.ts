import fs from "fs";
import os from "os";
import path from "path";
import {
  sanitizeShopifyCsvHeaders,
  sanitizeShopifyCsvHeaderLine,
  SHOPIFY_NEW_TEMPLATE_HEADERS,
  SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT,
} from "./shopify-csv-headers";

export const SHOPIFY_CSV_FILENAME = "shopify-urunler.csv";

const CSV_BOM = "\uFEFF";

let cachedCsvOutputDir: string | null = null;

function isWritableDirectory(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/** Single CSV output directory for local dev, Railway, and /tmp fallback */
export function resolveCsvOutputDirectory(): string {
  if (cachedCsvOutputDir) return cachedCsvOutputDir;

  const candidates = [
    path.join(process.cwd(), "temp"),
    path.join(os.tmpdir(), "turmarkt-csv"),
    "/tmp/turmarkt-csv",
  ];

  for (const dir of candidates) {
    if (isWritableDirectory(dir)) {
      cachedCsvOutputDir = dir;
      return dir;
    }
  }

  cachedCsvOutputDir = path.join(process.cwd(), "temp");
  fs.mkdirSync(cachedCsvOutputDir, { recursive: true });
  return cachedCsvOutputDir;
}

export function getShopifyCsvPath(): string {
  return path.join(resolveCsvOutputDirectory(), SHOPIFY_CSV_FILENAME);
}

export function resolveShopifyCsvPath(): string | null {
  const candidate = getShopifyCsvPath();
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
      return candidate;
    }
  } catch {
    // ignore unreadable paths
  }
  return null;
}

function withBom(content: string): string {
  const stripped = content.replace(/^\uFEFF/, "");
  return `${CSV_BOM}${stripped}`;
}

export function saveShopifyCsv(csvContent: string): string {
  const target = getShopifyCsvPath();
  const sanitized = sanitizeShopifyCsvHeaders(csvContent).replace(/^\uFEFF/, "");
  const payload = withBom(sanitized);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, payload, "utf8");
  return target;
}

/** Read CSV from disk, sanitize header typos, persist if changed. */
export function ensureSanitizedShopifyCsvOnDisk(): string | null {
  const filePath = resolveShopifyCsvPath();
  if (!filePath) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const sanitized = withBom(sanitizeShopifyCsvHeaders(raw).replace(/^\uFEFF/, ""));

  if (sanitized !== raw) {
    fs.writeFileSync(filePath, sanitized, "utf8");
  }

  return filePath;
}

/** Sanitized CSV payload for download responses (also persists fixes). */
export function getSanitizedShopifyCsvPayload(): { payload: string; filePath: string } | null {
  const filePath = ensureSanitizedShopifyCsvOnDisk();
  if (!filePath) return null;

  const payload = fs.readFileSync(filePath, "utf8");
  return { payload: payload.startsWith(CSV_BOM) ? payload : withBom(payload), filePath };
}

export function parseCSVRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < row.length) {
    const char = row[i];

    if (char === '"') {
      if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
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

export function isDummyCsvHeaders(headers: string[]): boolean {
  const trimmed = headers.map((h) => h.trim());
  if (trimmed.length === 2 && trimmed[0] === "Title" && trimmed[1] === "URL handle") {
    return true;
  }
  return false;
}

export function hasValidShopifyCsvHeaders(headers: string[]): boolean {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const hasTitle = lower.includes("title");
  const hasHandle = lower.includes("handle") || lower.includes("url handle");
  const hasPriceOrSku =
    lower.includes("variant price") ||
    lower.includes("price") ||
    lower.includes("variant sku") ||
    lower.includes("sku");

  return hasTitle && hasHandle && hasPriceOrSku;
}

export function computeCsvReady(headers: string[], productCount: number, csvExists: boolean): boolean {
  if (!csvExists || productCount <= 0) return false;
  if (isDummyCsvHeaders(headers)) return false;
  return hasValidShopifyCsvHeaders(headers);
}

export interface ShopifyCsvRowStats {
  rowCount: number;
  productCount: number;
  variantRowCount: number;
  imageRowCount: number;
}

function findHeaderIndex(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

export function analyzeShopifyCsvRows(
  headers: string[],
  dataRows: string[][],
): ShopifyCsvRowStats {
  const handleIdx = findHeaderIndex(headers, ["url handle", "handle"]);
  const skuIdx = findHeaderIndex(headers, ["sku", "variant sku"]);
  const imageIdx = findHeaderIndex(headers, ["product image url", "image src"]);

  const handles = new Set<string>();
  let variantRowCount = 0;
  let imageRowCount = 0;

  for (const row of dataRows) {
    const handle = handleIdx >= 0 ? (row[handleIdx] ?? "").trim() : "";
    const sku = skuIdx >= 0 ? (row[skuIdx] ?? "").trim() : "";
    const image = imageIdx >= 0 ? (row[imageIdx] ?? "").trim() : "";

    if (handle) handles.add(handle);
    if (sku) {
      variantRowCount++;
    } else if (image) {
      imageRowCount++;
    }
  }

  return {
    rowCount: dataRows.length,
    productCount: handles.size,
    variantRowCount,
    imageRowCount,
  };
}

export function analyzeShopifyCsvContent(csvContent: string): ShopifyCsvRowStats | null {
  const lines = csvContent
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  const headers = parseCSVRow(lines[0]);
  const dataRows = lines.slice(1).map(parseCSVRow);
  return analyzeShopifyCsvRows(headers, dataRows);
}

export interface ShopifyCsvParseResult {
  headers: string[];
  dataRows: string[][];
  rowCount: number;
  productCount: number;
  variantRowCount: number;
  imageRowCount: number;
  ready: boolean;
  filePath: string;
}

export function parseShopifyCsvFile(filePath?: string | null): ShopifyCsvParseResult | null {
  const resolved = filePath ?? ensureSanitizedShopifyCsvOnDisk();
  if (!resolved) return null;

  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return {
      headers: [],
      dataRows: [],
      rowCount: 0,
      productCount: 0,
      variantRowCount: 0,
      imageRowCount: 0,
      ready: false,
      filePath: resolved,
    };
  }

  const parsedHeaderFields = parseCSVRow(sanitizeShopifyCsvHeaderLine(lines[0]));
  const headers =
    parsedHeaderFields.length === SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT
      ? [...SHOPIFY_NEW_TEMPLATE_HEADERS]
      : parsedHeaderFields;

  const dataRows = lines.slice(1).map(parseCSVRow);
  const stats = analyzeShopifyCsvRows(headers, dataRows);

  return {
    headers,
    dataRows,
    rowCount: stats.rowCount,
    productCount: stats.productCount,
    variantRowCount: stats.variantRowCount,
    imageRowCount: stats.imageRowCount,
    ready: computeCsvReady(headers, stats.productCount, true),
    filePath: resolved,
  };
}

export function getCsvDownloadInfo() {
  ensureSanitizedShopifyCsvOnDisk();

  const filePath = resolveShopifyCsvPath();
  const csvExists = Boolean(filePath);
  const csvSize = csvExists ? fs.statSync(filePath!).size : 0;
  const parsed = csvExists ? parseShopifyCsvFile(filePath) : null;

  return {
    filename: SHOPIFY_CSV_FILENAME,
    downloadUrl: `/api/download/${SHOPIFY_CSV_FILENAME}`,
    ready: parsed?.ready ?? false,
    csvExists,
    csvSize,
    rowCount: parsed?.rowCount ?? 0,
    productCount: parsed?.productCount ?? 0,
    variantRowCount: parsed?.variantRowCount ?? 0,
    imageRowCount: parsed?.imageRowCount ?? 0,
    filePath: filePath || null,
    headers: parsed?.headers ?? [],
  };
}

export async function attachCsvInfoToResult<T extends Record<string, unknown>>(
  result: T,
  csvContent?: string | null,
): Promise<T & { csvInfo?: ReturnType<typeof getCsvDownloadInfo> }> {
  let content = csvContent;
  if (!content && typeof result.csvContent === "string") {
    content = result.csvContent;
  }

  if (content && content.trim().length > 0) {
    saveShopifyCsv(content);
    const sanitized = sanitizeShopifyCsvHeaders(content);
    return {
      ...result,
      csvContent: sanitized.replace(/^\uFEFF/, ""),
      csvInfo: getCsvDownloadInfo(),
    };
  }

  const existing = getCsvDownloadInfo();
  if (existing.ready) {
    return { ...result, csvInfo: existing };
  }

  return result;
}

export function deleteShopifyCsv(): boolean {
  const target = getShopifyCsvPath();

  if (!fs.existsSync(target)) {
    return false;
  }

  fs.unlinkSync(target);
  return true;
}
