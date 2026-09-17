import { getMarktGoClientForConnection } from "./connection.service";
import { resolveCategoryId } from "./category.service";
import {
  resolveCollectionsForTags,
  syncMarktGoCategorySummary,
} from "./collections-sync.service";
import type { LocalProductInput } from "./types";

export type MarktGoAutomaticCollectionResult = {
  attempted: boolean;
  tagsApplied: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryUnresolved: boolean;
  matchedCollections: Array<{ id: string; title: string }>;
};

/**
 * Keep MARKT-GO collection assignment deterministic for both new and previously
 * synced products. MARKT-GO collections are tag/condition based, while a primary
 * category can also be assigned through categoryId. We therefore always refresh
 * the product tags and, when resolvable, the primary category.
 */
export async function applyAutomaticCollectionsToMarktGoProduct(
  externalProductId: string | number | null | undefined,
  input: LocalProductInput,
  connectionId?: number,
): Promise<MarktGoAutomaticCollectionResult> {
  const id = String(externalProductId || "").trim();
  if (!id) {
    return {
      attempted: false,
      tagsApplied: 0,
      categoryId: null,
      categoryName: null,
      categoryUnresolved: false,
      matchedCollections: [],
    };
  }

  const { client, connection } = await getMarktGoClientForConnection(connectionId);

  // Load the current MARKT-GO collection rules before matching. If the catalog
  // endpoint is temporarily unavailable, tag sync still proceeds safely.
  try {
    await syncMarktGoCategorySummary(false);
  } catch {
    /* collection cache is optional for the actual tag patch */
  }

  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((tag) => String(tag || "").trim()).filter(Boolean))]
    : [];
  const matchedCollections = resolveCollectionsForTags(tags);

  let categorySource = String(input.category || "").trim();
  let categoryResolution = await resolveCategoryId(
    client,
    connection.id,
    categorySource || null,
  );

  // Source category names do not always equal MARKT-GO collection names. If the
  // exact source category cannot be resolved, use the best tag-matched collection
  // as the primary category while retaining all collection tags.
  if (!categoryResolution.categoryId && matchedCollections.length > 0) {
    categorySource = matchedCollections[0].title;
    categoryResolution = await resolveCategoryId(
      client,
      connection.id,
      categorySource,
    );
  }

  const payload: Record<string, unknown> = { tags };
  if (categoryResolution.categoryId != null) {
    payload.categoryId = categoryResolution.categoryId;
  }

  try {
    await client.patch(`/products/${encodeURIComponent(id)}`, payload);
  } catch (err) {
    // Some MARKT-GO deployments may reject categoryId while still supporting
    // tag updates. Never lose collection tags because of an optional category.
    if (categoryResolution.categoryId != null) {
      await client.patch(`/products/${encodeURIComponent(id)}`, { tags });
      return {
        attempted: true,
        tagsApplied: tags.length,
        categoryId: null,
        categoryName: null,
        categoryUnresolved: true,
        matchedCollections,
      };
    }
    throw err;
  }

  return {
    attempted: true,
    tagsApplied: tags.length,
    categoryId: categoryResolution.categoryId,
    categoryName: categoryResolution.name || (categoryResolution.categoryId ? categorySource : null),
    categoryUnresolved: categoryResolution.unresolved,
    matchedCollections,
  };
}
