import { getMarktGoClientForConnection } from "./connection.service";
import { extractId, extractTags, listItemsFromPayload, normalizeMarktGoProduct } from "./normalize";
import { normalizeTagKey } from "@shared/auto-product-tags";

export type MarktGoCollectionCondition = {
  field: string;
  operator: string;
  value: string;
};

export type MarktGoCategorySyncResult = {
  provider: "marktgo";
  syncedAt: string;
  totalProducts: number;
  taggedProducts: number;
  untaggedProducts: number;
  tags: Array<{
    tag: string;
    productCount: number;
    collections: Array<{
      id: string | null;
      title: string;
      handle: string | null;
      productCount: number;
    }>;
  }>;
  collections: Array<{
    id: string;
    title: string;
    handle: string;
    taggedProductCount: number;
    tags: string[];
    conditions: MarktGoCollectionCondition[];
    conditionMatch: "all" | "any";
  }>;
  message?: string;
};

type RemoteCollection = {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  conditions: MarktGoCollectionCondition[];
  conditionMatch: "all" | "any";
  productCount: number;
};

type RemoteProduct = {
  id: string;
  title: string;
  tags: string[];
};

let lastResult: MarktGoCategorySyncResult | null = null;
let knownCollectionTags: string[] = [];
let inFlight: Promise<MarktGoCategorySyncResult> | null = null;
let lastRunAt = 0;
const MIN_INTERVAL_MS = 30_000;

export function getLastMarktGoCategorySummary(): MarktGoCategorySyncResult | null {
  return lastResult;
}

/** Çekim sırasında otomatik etiket eşlemesi için koleksiyon etiketleri. */
export function getKnownMarktGoCollectionTags(): string[] {
  return knownCollectionTags.slice();
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function parseConditions(raw: unknown): MarktGoCollectionCondition[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const o = asObj(row);
      return {
        field: String(o.field || "").trim(),
        operator: String(o.operator || "is").trim() || "is",
        value: String(o.value || "").trim(),
      };
    })
    .filter((c) => c.field && c.value);
}

function conditionTags(conditions: MarktGoCollectionCondition[]): string[] {
  return conditions
    .filter((c) => c.field === "tag" && (c.operator === "is" || !c.operator))
    .map((c) => c.value.trim())
    .filter(Boolean);
}

function parseCollections(payload: unknown): RemoteCollection[] {
  const items = listItemsFromPayload(payload);
  const fromRoot = asObj(payload);
  const alt = Array.isArray(fromRoot.categories)
    ? fromRoot.categories
    : Array.isArray(fromRoot.collections)
      ? fromRoot.collections
      : [];
  const rows = items.length ? items : alt;
  const out: RemoteCollection[] = [];

  for (const row of rows) {
    const o = asObj(row);
    const id = extractId(o);
    if (!id) continue;
    const title = String(o.name || o.title || "")
      .replace(/["']/g, "")
      .trim();
    if (!title) continue;
    const handle = String(o.slug || o.handle || "").trim() || id;
    const conditions = parseConditions(o.conditions).map((c) => ({
      ...c,
      value: c.value.replace(/["']/g, "").trim(),
    }));
    const tagsFromField = Array.isArray(o.tags)
      ? o.tags.map((t) => String(t || "").replace(/["']/g, "").trim()).filter(Boolean)
      : [];
    const tags = [
      ...new Set([...conditionTags(conditions), ...tagsFromField, title].filter(Boolean)),
    ];
    const match = String(o.conditionMatch || "all").toLowerCase() === "any" ? "any" : "all";
    out.push({
      id,
      title,
      handle,
      tags,
      conditions,
      conditionMatch: match,
      productCount: Number(o.productCount) || 0,
    });
  }
  return out;
}

async function fetchCollections(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
): Promise<RemoteCollection[]> {
  try {
    const raw = await client.get<unknown>("/categories");
    const list = parseCollections(raw);
    if (list.length) return list;
  } catch {
    /* try collections alias */
  }
  try {
    const raw = await client.get<unknown>("/collections");
    return parseCollections(raw);
  } catch {
    return [];
  }
}

async function fetchProducts(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
): Promise<RemoteProduct[]> {
  const products: RemoteProduct[] = [];
  for (let page = 1; page <= 50; page++) {
    const raw = await client.get<unknown>(`/products?page=${page}&limit=100`);
    const items = listItemsFromPayload(raw);
    if (!items.length) break;
    for (const row of items) {
      const id = extractId(row);
      if (!id) continue;
      const norm = normalizeMarktGoProduct(row);
      products.push({
        id,
        title: norm.title || id,
        tags: extractTags(row),
      });
    }
    const root = asObj(raw);
    const pag = asObj(root.pagination);
    if (pag.hasMore !== true && items.length < 100) break;
  }
  return products;
}

function productMatchesCollection(product: RemoteProduct, collection: RemoteCollection): boolean {
  const tagConditions = collection.conditions.filter((c) => c.field === "tag");
  if (tagConditions.length) {
    const match = collection.conditionMatch;
    const evalOne = (c: MarktGoCollectionCondition) => {
      const has = product.tags.some(
        (t) => normalizeTagKey(t) === normalizeTagKey(c.value),
      );
      return c.operator === "is_not" ? !has : has;
    };
    return match === "any" ? tagConditions.some(evalOne) : tagConditions.every(evalOne);
  }
  // Koşul yoksa: koleksiyon adı / tags alanı ürün etiketleriyle eşleşsin
  const needles = collection.tags.length ? collection.tags : [collection.title];
  return needles.some((needle) =>
    product.tags.some((t) => normalizeTagKey(t) === normalizeTagKey(needle)),
  );
}

function buildSummary(
  collections: RemoteCollection[],
  products: RemoteProduct[],
): MarktGoCategorySyncResult {
  const tagMap = new Map<
    string,
    {
      label: string;
      products: Set<string>;
      collections: Map<string, { collection: RemoteCollection | null; products: Set<string> }>;
    }
  >();
  const collectionMap = new Map<
    string,
    { collection: RemoteCollection; products: Set<string>; tags: Set<string> }
  >();

  for (const collection of collections) {
    collectionMap.set(collection.id, {
      collection,
      products: new Set(),
      tags: new Set(collection.tags),
    });
  }

  for (const product of products) {
    const tags = [...new Set(product.tags.map((t) => t.trim()).filter(Boolean))];
    const matchedCollections = collections.filter((c) => productMatchesCollection(product, c));

    for (const tag of tags) {
      const tagKey = normalizeTagKey(tag);
      let tagEntry = tagMap.get(tagKey);
      if (!tagEntry) {
        tagEntry = { label: tag, products: new Set(), collections: new Map() };
        tagMap.set(tagKey, tagEntry);
      }
      tagEntry.products.add(product.id);

      const targets = matchedCollections.length ? matchedCollections : [null];
      for (const collection of targets) {
        const collectionKey = collection?.id ?? "__unassigned__";
        let relation = tagEntry.collections.get(collectionKey);
        if (!relation) {
          relation = { collection, products: new Set() };
          tagEntry.collections.set(collectionKey, relation);
        }
        relation.products.add(product.id);
        if (collection) {
          const entry = collectionMap.get(collection.id);
          if (entry) {
            entry.products.add(product.id);
            entry.tags.add(tag);
          }
        }
      }
    }

    for (const collection of matchedCollections) {
      const entry = collectionMap.get(collection.id);
      if (entry) entry.products.add(product.id);
    }
  }

  const taggedProducts = products.filter((p) => p.tags.length > 0).length;
  const known = new Set<string>();
  for (const c of collections) {
    for (const t of c.tags) known.add(t);
    for (const t of conditionTags(c.conditions)) known.add(t);
  }
  knownCollectionTags = [...known];

  return {
    provider: "marktgo",
    syncedAt: new Date().toISOString(),
    totalProducts: products.length,
    taggedProducts,
    untaggedProducts: products.length - taggedProducts,
    tags: [...tagMap.values()]
      .map((entry) => ({
        tag: entry.label,
        productCount: entry.products.size,
        collections: [...entry.collections.values()]
          .map(({ collection, products: relationProducts }) => ({
            id: collection?.id ?? null,
            title: collection?.title ?? "Koleksiyonsuz",
            handle: collection?.handle ?? null,
            productCount: relationProducts.size,
          }))
          .sort((a, b) => b.productCount - a.productCount || a.title.localeCompare(b.title, "tr")),
      }))
      .sort((a, b) => b.productCount - a.productCount || a.tag.localeCompare(b.tag, "tr")),
    collections: [...collectionMap.values()]
      .map(({ collection, products: collectionProducts, tags }) => ({
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        taggedProductCount: Math.max(collectionProducts.size, collection.productCount || 0),
        tags: [...tags].sort((a, b) => a.localeCompare(b, "tr")),
        conditions: collection.conditions,
        conditionMatch: collection.conditionMatch,
      }))
      .sort(
        (a, b) =>
          b.taggedProductCount - a.taggedProductCount || a.title.localeCompare(b.title, "tr"),
      ),
  };
}

export async function syncMarktGoCategorySummary(force = false): Promise<MarktGoCategorySyncResult> {
  if (inFlight) return inFlight;
  if (!force && lastResult && Date.now() - lastRunAt < MIN_INTERVAL_MS) {
    return lastResult;
  }

  lastRunAt = Date.now();
  inFlight = (async () => {
    const { client } = await getMarktGoClientForConnection();
    let collections: RemoteCollection[] = [];
    let products: RemoteProduct[] = [];
    let collectionError = "";
    let productError = "";

    try {
      collections = await fetchCollections(client);
    } catch (err) {
      collectionError = err instanceof Error ? err.message : String(err);
    }

    try {
      products = await fetchProducts(client);
    } catch (err) {
      productError = err instanceof Error ? err.message : String(err);
    }

    if (!collections.length && !products.length) {
      throw new Error(
        collectionError || productError || "MARKT-GO koleksiyon / ürün listesi alınamadı",
      );
    }

    const summary = buildSummary(collections, products);
    const notes: string[] = [];
    if (collections.length) notes.push(`${collections.length} koleksiyon`);
    if (products.length) notes.push(`${products.length} ürün`);
    if (collectionError && !collections.length) notes.push(`koleksiyon: ${collectionError}`);
    if (productError && !products.length) notes.push(`ürün listesi atlandı`);
    summary.message = notes.join(" · ") || "MARKT-GO katalog boş";
    lastResult = summary;
    return summary;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
