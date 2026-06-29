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

export interface ShopifyCsvParseResult {
  headers: string[];
  dataRows: string[][];
  productCount: number;
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
      productCount: 0,
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
  const productCount = dataRows.length;

  return {
    headers,
    dataRows,
    productCount,
    ready: computeCsvReady(headers, productCount, true),
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
    productCount: parsed?.productCount ?? 0,
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
