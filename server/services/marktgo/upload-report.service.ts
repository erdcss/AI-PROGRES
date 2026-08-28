import {
  getCachedMarktGoCollections,
  resolveCollectionsForTags,
  syncMarktGoCategorySummary,
} from "./collections-sync.service";
import { resolvePoolProductTagAssignment } from "./pool-map";

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

const HIDDEN_CATEGORY_TITLES = new Set(["urun-havuzu", "koleksiyonsuz"]);

function isSystemTag(tag: string): boolean {
  const t = String(tag || "").trim();
  if (!t) return true;
  if (HIDDEN_CATEGORY_TITLES.has(t.toLowerCase())) return true;
  return t.toLowerCase().startsWith("src:");
}

function normalizeCategoryKey(title: string): string {
  return String(title || "").trim().toLocaleLowerCase("tr-TR");
}

async function ensureCollectionsLoaded(): Promise<void> {
  if (getCachedMarktGoCollections().length) return;
  try {
    await syncMarktGoCategorySummary(false);
  } catch {
    /* rapor etiketlerle devam eder */
  }
}

export async function buildMarktGoUploadItemReport(
  product: Record<string, unknown>,
  outcome?: { success?: boolean; productId?: string; error?: string },
): Promise<MarktGoUploadItemReport> {
  await ensureCollectionsLoaded();
  const { manualTags, autoTags, appliedTags } = resolvePoolProductTagAssignment(product);
  const matchedCollections = resolveCollectionsForTags(appliedTags);
  return {
    title: String(product.title || "Ürün"),
    success: outcome?.success !== false,
    productId: outcome?.productId,
    sourceUrl: product.sourceUrl ? String(product.sourceUrl) : undefined,
    error: outcome?.error,
    manualTags,
    autoTags,
    appliedTags: appliedTags.filter((t) => !isSystemTag(t)),
    matchedCollections,
  };
}

export function aggregateMarktGoUploadReport(
  items: MarktGoUploadItemReport[],
): MarktGoBulkUploadReport {
  const categoryMap = new Map<string, { title: string; count: number }>();
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
      const title = col.title || "Kategorisiz";
      if (HIDDEN_CATEGORY_TITLES.has(normalizeCategoryKey(title))) continue;
      const mapKey = normalizeCategoryKey(title);
      const existing = categoryMap.get(mapKey);
      if (existing) existing.count += 1;
      else categoryMap.set(mapKey, { title, count: 1 });
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
    categorySummary: [...categoryMap.values()]
      .map(({ title, count }) => ({ title, count }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "tr")),
    tagSummary: [...tagMap.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "tr")),
  };
}
