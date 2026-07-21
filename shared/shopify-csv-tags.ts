import { joinShopifyTags, sanitizeShopifyTags } from "./shopify-tag-sanitizer";

function splitCsvRecords(csv: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;
    if (ch === '"') {
      current += ch;
      if (inQuotes && csv[i + 1] === '"') {
        current += csv[++i]!;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && csv[i + 1] === "\n") i++;
      if (current.trim()) records.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.trim()) records.push(current);
  return records;
}

export function parseShopifyCsvRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function escapeShopifyCsvCell(value: string): string {
  const cell = String(value ?? "");
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * Manuel etiketleri Shopify CSV'nin ilk ürün satırına ekler.
 * Değer hücreye çıplak yazılır; CSV tırnağı serializer tarafından yalnızca bir kez eklenir.
 */
export function applyTagsToShopifyCsv(csvContent: string, tags: Iterable<string>): string {
  const additions = sanitizeShopifyTags(tags);
  if (!additions.length || !csvContent.trim()) return csvContent;

  const hadBom = csvContent.startsWith("\uFEFF");
  const records = splitCsvRecords(csvContent.replace(/^\uFEFF/, ""));
  if (records.length < 2) return csvContent;

  const header = parseShopifyCsvRow(records[0]!);
  const tagsIndex = header.findIndex((h) => h.trim().toLowerCase() === "tags");
  if (tagsIndex < 0) return csvContent;

  const rowIndex = records.findIndex((record, index) => {
    if (index === 0) return false;
    const cells = parseShopifyCsvRow(record);
    return cells.some((cell) => cell.trim());
  });
  if (rowIndex < 1) return csvContent;

  const cells = parseShopifyCsvRow(records[rowIndex]!);
  while (cells.length < header.length) cells.push("");

  const existing = sanitizeShopifyTags(
    String(cells[tagsIndex] ?? "")
      .split(",")
      .map((tag) => tag.trim()),
  );
  cells[tagsIndex] = joinShopifyTags([...existing, ...additions]);
  records[rowIndex] = cells.map(escapeShopifyCsvCell).join(",");

  const result = records.join("\n");
  return hadBom ? `\uFEFF${result}` : result;
}
