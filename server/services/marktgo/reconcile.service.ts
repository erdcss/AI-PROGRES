import { eq } from "drizzle-orm";
import { db } from "../../db";
import { trackedProducts } from "@shared/schema";
import { MarktGoApiError } from "./errors";
import { getMarktGoClientForConnection } from "./connection.service";
import { extractId, listItemsFromPayload } from "./normalize";
import {
  deleteProductMapping,
  listProductMappings,
  stableExternalId,
  upsertProductMapping,
} from "./mapping.service";
import {
  remoteToPoolProduct,
  type CatalogPoolProduct,
} from "./pool-map";
import type { IntegrationProductMapping } from "@shared/schema";

const INTERVAL_MS = 15 * 60_000;
const MAX_PAGES = 50;

export type MarktGoCatalogReconcileResult = {
  success: boolean;
  checked: number;
  live: number;
  removed: number;
  imported: number;
  skipped: number;
  abortedBySafety: boolean;
  removedLocalProductIds: string[];
  removedExternalProductIds: string[];
  products: CatalogPoolProduct[];
  message: string;
  ranAt: string;
};

let inFlight: Promise<MarktGoCatalogReconcileResult> | null = null;
let lastRunAt = 0;
let lastResult: MarktGoCatalogReconcileResult | null = null;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function shouldAbortCatalogWipe(mappingCount: number, liveCount: number, missingCount: number): boolean {
  return mappingCount >= 3 && liveCount === 0 && missingCount === mappingCount;
}

export function pickMissingMappings(
  mappings: Array<{ externalProductId: string }>,
  remoteIds: Set<string>,
) {
  return mappings.filter((m) => !remoteIds.has(String(m.externalProductId)));
}

export function pickUnmappedRemoteIds(
  remoteIds: Iterable<string>,
  mappings: Array<{ externalProductId: string }>,
): string[] {
  const known = new Set(mappings.map((m) => String(m.externalProductId)));
  return [...remoteIds].filter((id) => !known.has(id));
}

function pageFromListPayload(payload: unknown): {
  items: unknown[];
  ids: string[];
  hasMore: boolean;
  pageSize: number;
} {
  const root = asObj(payload);
  const items = listItemsFromPayload(payload);
  const ids = items
    .map((row) => extractId(row))
    .filter((id): id is string => Boolean(id));
  const pag = asObj(root.pagination);
  const hasMore = pag.hasMore === true;
  return { items, ids, hasMore, pageSize: items.length };
}

async function listRemoteCatalog(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
): Promise<{ ids: Set<string>; items: unknown[] }> {
  const ids = new Set<string>();
  const items: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const raw = await client.get<unknown>(`/products?page=${page}&limit=100`);
    const parsed = pageFromListPayload(raw);
    for (const id of parsed.ids) ids.add(id);
    items.push(...parsed.items);
    if (!parsed.hasMore && parsed.pageSize < 100) break;
    if (parsed.pageSize === 0) break;
  }
  return { ids, items };
}

async function remoteProductGone(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
  externalProductId: string,
): Promise<"gone" | "live" | "unknown"> {
  try {
    await client.get(`/products/${encodeURIComponent(externalProductId)}`);
    return "live";
  } catch (err) {
    if (err instanceof MarktGoApiError && err.status === 404) return "gone";
    return "unknown";
  }
}

async function removeLocal(mapping: IntegrationProductMapping): Promise<void> {
  if (mapping.trackedProductId) {
    await db.delete(trackedProducts).where(eq(trackedProducts.id, mapping.trackedProductId));
  }
  await deleteProductMapping(mapping.id);
}

async function runReconcile(): Promise<MarktGoCatalogReconcileResult> {
  const ranAt = new Date().toISOString();
  const empty = (message: string, extra?: Partial<MarktGoCatalogReconcileResult>): MarktGoCatalogReconcileResult => ({
    success: true,
    checked: 0,
    live: 0,
    removed: 0,
    imported: 0,
    skipped: 0,
    abortedBySafety: false,
    removedLocalProductIds: [],
    removedExternalProductIds: [],
    products: [],
    message,
    ranAt,
    ...extra,
  });

  let connection;
  let client;
  try {
    ({ client, connection } = await getMarktGoClientForConnection());
  } catch {
    return empty("MARKT-GO bağlantısı yok — katalog kontrolü atlandı");
  }

  const mappings = await listProductMappings(connection.id);
  let catalog: { ids: Set<string>; items: unknown[] };
  try {
    catalog = await listRemoteCatalog(client);
  } catch (err) {
    return empty("MARKT-GO ürün listesi alınamadı — silme yapılmadı", {
      success: false,
      checked: mappings.length,
      skipped: mappings.length,
      message: err instanceof Error ? err.message : "liste alınamadı",
    });
  }

  const remoteIds = catalog.ids;
  const products = catalog.items
    .map((row) => remoteToPoolProduct(row))
    .filter((row): row is CatalogPoolProduct => Boolean(row));

  if (!mappings.length && !products.length) {
    return empty("Gönderilmiş MARKT-GO ürünü yok");
  }

  const missing = pickMissingMappings(mappings, remoteIds);
  const liveFromList = mappings.length - missing.length;

  if (shouldAbortCatalogWipe(mappings.length, liveFromList, missing.length)) {
    return empty("Güvenlik: tüm ürünler eksik göründü, silme iptal", {
      checked: mappings.length,
      live: products.length,
      abortedBySafety: true,
      skipped: mappings.length,
      products,
    });
  }

  const removedLocalProductIds: string[] = [];
  const removedExternalProductIds: string[] = [];
  let skipped = 0;
  let extraLive = 0;

  for (const mapping of missing) {
    const state = await remoteProductGone(client, String(mapping.externalProductId));
    if (state === "live") {
      extraLive += 1;
      continue;
    }
    if (state === "unknown") {
      skipped += 1;
      continue;
    }
    try {
      await removeLocal(mapping);
      removedLocalProductIds.push(mapping.localProductId);
      removedExternalProductIds.push(String(mapping.externalProductId));
    } catch {
      skipped += 1;
    }
  }

  let imported = 0;
  const mappedExt = new Set(
    (await listProductMappings(connection.id)).map((m) => String(m.externalProductId)),
  );
  for (const product of products) {
    if (mappedExt.has(product.externalProductId)) continue;
    try {
      await upsertProductMapping({
        connectionId: connection.id,
        localProductId: product.poolId,
        externalProductId: product.externalProductId,
        externalId: stableExternalId(product.poolId),
        status: "synced",
      });
      mappedExt.add(product.externalProductId);
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  const removed = removedLocalProductIds.length;
  const live = Math.max(products.length, liveFromList + extraLive);
  const parts: string[] = [];
  if (imported) parts.push(`${imported} canlı ürün programa alındı`);
  if (removed) parts.push(`${removed} silinen ürün çıkarıldı`);
  return {
    success: true,
    checked: Math.max(mappings.length, products.length),
    live,
    removed,
    imported,
    skipped,
    abortedBySafety: false,
    removedLocalProductIds,
    removedExternalProductIds,
    products,
    message: parts.length ? parts.join(" · ") : "MARKT-GO katalog eşleşiyor",
    ranAt,
  };
}

export function getLastMarktGoCatalogReconcile(): MarktGoCatalogReconcileResult | null {
  return lastResult;
}

export async function triggerMarktGoCatalogReconcile(force = false): Promise<MarktGoCatalogReconcileResult | null> {
  if (inFlight) return inFlight;
  if (!force && lastRunAt && Date.now() - lastRunAt < INTERVAL_MS) {
    return lastResult;
  }
  lastRunAt = Date.now();
  inFlight = runReconcile()
    .then((result) => {
      lastResult = result;
      if (result.removed > 0 || result.imported > 0) {
        console.info(`[marktgo-reconcile] ${result.message}`);
      }
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
