export type MarktGoUploadItemReport = {
  title: string;
  success: boolean;
  productId?: string;
  sourceUrl?: string;
  error?: string;
  manualTags: string[];
  autoTags: string[];
  appliedTags: string[];
  matchedCollections: Array<{ id: string; title: string }>;
};

export type MarktGoBulkUploadReport = {
  successCount: number;
  failCount: number;
  items: MarktGoUploadItemReport[];
  categorySummary: Array<{ title: string; count: number }>;
  tagSummary: Array<{ tag: string; count: number }>;
};

const SYSTEM_TAGS = new Set(["urun-havuzu"]);

function isSystemTag(tag: string): boolean {
  const t = String(tag || "").trim();
  if (!t) return true;
  if (SYSTEM_TAGS.has(t.toLowerCase())) return true;
  return t.toLowerCase().startsWith("src:");
}

export function aggregateMarktGoUploadReport(
  items: MarktGoUploadItemReport[],
): MarktGoBulkUploadReport {
  const categoryMap = new Map<string, number>();
  const tagMap = new Map<string, number>();
  let successCount = 0;
  let failCount = 0;

  for (const item of items) {
    if (item.success) successCount++;
    else failCount++;
    if (!item.success) continue;

    const collections =
      item.matchedCollections.length > 0
        ? item.matchedCollections
        : [{ id: "__none__", title: "Kategorisiz" }];

    for (const col of collections) {
      const key = col.title || "Kategorisiz";
      categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
    }

    for (const tag of [...item.autoTags, ...item.manualTags]) {
      if (isSystemTag(tag)) continue;
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }

  return {
    successCount,
    failCount,
    items,
    categorySummary: [...categoryMap.entries()]
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "tr")),
    tagSummary: [...tagMap.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "tr")),
  };
}

export function normalizeUploadReport(raw: unknown): MarktGoBulkUploadReport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as MarktGoBulkUploadReport;
  if (!Array.isArray(o.items)) return null;
  return {
    successCount: Number(o.successCount) || 0,
    failCount: Number(o.failCount) || 0,
    items: o.items,
    categorySummary: Array.isArray(o.categorySummary) ? o.categorySummary : [],
    tagSummary: Array.isArray(o.tagSummary) ? o.tagSummary : [],
  };
}
