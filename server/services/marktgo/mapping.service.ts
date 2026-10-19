import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  integrationProductMappings,
  integrationVariantMappings,
  trackedProducts,
} from "@shared/schema";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import { createHash } from "crypto";
import { getMarktGoClientForConnection } from "./connection.service";
import { extractId, extractExternalId, extractTags } from "./normalize";
import { MarktGoApiError } from "./errors";

export function stableExternalId(localProductId: string): string {
  const raw = String(localProductId || "").trim();
  if (!raw) {
    return `aip_${createHash("sha1").update(String(Date.now())).digest("hex").slice(0, 16)}`;
  }
  if (/^aip_/i.test(raw)) return raw.slice(0, 120);

  // Trendyol productId URL sonunda — kısaltmadan önce yakala
  const trendyolPid = raw.match(/[?&](?:productId|contentId)=(\d{5,})/i)?.[1]
    || raw.match(/-p-(\d{5,})(?:\?|#|$)/i)?.[1]
    || raw.match(/\/p-(\d{5,})(?:\?|#|$)/i)?.[1];
  if (trendyolPid) return `aip_ty_${trendyolPid}`.slice(0, 120);

  // URL / uzun id: baştan kesmek çakışma üretir — her zaman hash
  if (/^https?:\/\//i.test(raw) || raw.length > 64) {
    const hash = createHash("sha1").update(raw).digest("hex").slice(0, 20);
    return `aip_${hash}`;
  }

  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  if (safe) return `aip_${safe}`;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 16);
  return `aip_${hash}`;
}

export function idempotencyKeyForProduct(localProductId: string): string {
  return `aip-product-${stableExternalId(localProductId)}`;
}

export async function findProductMapping(opts: {
  connectionId: number;
  localProductId?: string;
  externalId?: string;
  trackedProductId?: number;
  externalProductId?: string;
}) {
  if (opts.localProductId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.localProductId, opts.localProductId),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  if (opts.externalId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.externalId, opts.externalId),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  if (opts.externalProductId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.externalProductId, String(opts.externalProductId)),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  if (opts.trackedProductId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.trackedProductId, opts.trackedProductId),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  return null;
}

export function isUniqueConstraintError(err: unknown): boolean {
  const stack: unknown[] = [err];
  const seen = new Set<unknown>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur === "object") {
      const rec = cur as Record<string, unknown>;
      if (rec.code === "23505") return true;
      if (rec.cause) stack.push(rec.cause);
      if (rec.originalError) stack.push(rec.originalError);
    }
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (/unique|duplicate key/i.test(msg)) return true;
  }
  return false;
}

export async function upsertProductMapping(input: {
  connectionId: number;
  localProductId: string;
  externalProductId: string;
  externalId: string;
  trackedProductId?: number | null;
  status?: string;
  lastError?: string | null;
  failedSteps?: string[];
}) {
  // Aynı remote ürün farklı localProductId ile gelebilir (yeniden çekim / reconcile).
  // Unique: (connection, external_product_id) ve (connection, external_id) ve (connection, local)
  const existing =
    (await findProductMapping({
      connectionId: input.connectionId,
      externalProductId: input.externalProductId,
    })) ||
    (await findProductMapping({
      connectionId: input.connectionId,
      externalId: input.externalId,
    })) ||
    (await findProductMapping({
      connectionId: input.connectionId,
      localProductId: input.localProductId,
    }));

  const patch = {
    provider: DESTINATION_PROVIDER.MARKTGO,
    localProductId: input.localProductId,
    externalProductId: String(input.externalProductId),
    externalId: input.externalId,
    trackedProductId: input.trackedProductId ?? existing?.trackedProductId ?? null,
    status: input.status || "synced",
    lastError: input.lastError ?? null,
    failedSteps: input.failedSteps || [],
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  };

  async function clearConflictingRows(keepId: number | null) {
    const candidates = [
      await findProductMapping({
        connectionId: input.connectionId,
        localProductId: input.localProductId,
      }),
      await findProductMapping({
        connectionId: input.connectionId,
        externalId: input.externalId,
      }),
      await findProductMapping({
        connectionId: input.connectionId,
        externalProductId: input.externalProductId,
      }),
    ];
    for (const row of candidates) {
      if (row && row.id !== keepId) {
        await deleteProductMapping(row.id);
      }
    }
  }

  if (existing) {
    await clearConflictingRows(existing.id);
    const [row] = await db
      .update(integrationProductMappings)
      .set(patch)
      .where(eq(integrationProductMappings.id, existing.id))
      .returning();
    return row;
  }

  try {
    const [row] = await db
      .insert(integrationProductMappings)
      .values({
        connectionId: input.connectionId,
        ...patch,
      })
      .returning();
    return row;
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    const raced =
      (await findProductMapping({
        connectionId: input.connectionId,
        externalProductId: input.externalProductId,
      })) ||
      (await findProductMapping({
        connectionId: input.connectionId,
        externalId: input.externalId,
      })) ||
      (await findProductMapping({
        connectionId: input.connectionId,
        localProductId: input.localProductId,
      }));
    if (!raced) throw err;
    await clearConflictingRows(raced.id);
    const [row] = await db
      .update(integrationProductMappings)
      .set(patch)
      .where(eq(integrationProductMappings.id, raced.id))
      .returning();
    return row;
  }
}

export async function upsertVariantMapping(input: {
  productMappingId: number;
  localVariantId: string;
  externalVariantId: string;
  option1?: string | null;
  option2?: string | null;
}) {
  const [existing] = await db
    .select()
    .from(integrationVariantMappings)
    .where(
      and(
        eq(integrationVariantMappings.productMappingId, input.productMappingId),
        eq(integrationVariantMappings.localVariantId, input.localVariantId),
      ),
    )
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(integrationVariantMappings)
      .set({
        externalVariantId: String(input.externalVariantId),
        option1: input.option1 ?? existing.option1,
        option2: input.option2 ?? existing.option2,
        updatedAt: new Date(),
      })
      .where(eq(integrationVariantMappings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(integrationVariantMappings)
    .values({
      productMappingId: input.productMappingId,
      localVariantId: input.localVariantId,
      externalVariantId: String(input.externalVariantId),
      option1: input.option1 || null,
      option2: input.option2 || null,
    })
    .returning();
  return row;
}

export async function listVariantMappings(productMappingId: number) {
  return db
    .select()
    .from(integrationVariantMappings)
    .where(eq(integrationVariantMappings.productMappingId, productMappingId));
}

export async function listProductMappings(connectionId: number) {
  return db
    .select()
    .from(integrationProductMappings)
    .where(eq(integrationProductMappings.connectionId, connectionId));
}

export async function deleteProductMapping(id: number) {
  await db.delete(integrationProductMappings).where(eq(integrationProductMappings.id, id));
}

/**
 * Only a destination-scoped id (or a legacy marktgo_managed id) can identify
 * a MARKT-GO product directly. URL aliases are limited to an exact source URL
 * and well-formed Trendyol product identifiers.
 */
export function getTrackingMarktGoIdentity(tracked: {
  sourceUrl: string;
  sourceSite: string;
  sourceProductId: string | null;
  shopifyProductId: string | null;
  shopifySyncStatus: string | null;
}): { externalProductId: string; localProductIds: string[] } {
  const storedId = String(tracked.shopifyProductId || "").trim();
  const externalProductId = storedId.startsWith("marktgo:")
    ? storedId.slice("marktgo:".length).trim()
    : tracked.shopifySyncStatus === "marktgo_managed"
      ? storedId
      : "";

  const aliases = new Set<string>();
  const sourceUrl = String(tracked.sourceUrl || "").trim();
  if (sourceUrl) aliases.add(sourceUrl);

  let trendyolSource = tracked.sourceSite === "trendyol";
  try {
    trendyolSource = new URL(sourceUrl).hostname.toLowerCase().match(/(^|\.)trendyol\.com$/i) !== null;
  } catch {
    // Non-URL legacy records may still have a trusted sourceSite.
  }
  if (trendyolSource) {
    const sourceId =
      String(tracked.sourceProductId || "").trim() ||
      sourceUrl.match(/-p-(\d{5,})(?:[/?#&]|$)/i)?.[1] ||
      "";
    if (/^\d{5,}$/.test(sourceId)) {
      aliases.add(`trendyol_${sourceId}`);
      aliases.add(`trendyol-${sourceId}`);
    }
  }

  return { externalProductId, localProductIds: [...aliases] };
}


type TrackingMappingIdentity = {
  sourceUrl: string;
  sourceSite: string;
  sourceProductId: string | null;
  shopifyProductId: string | null;
  shopifySyncStatus: string | null;
};

/**
 * Catalog reconcile may keep an older tracking row as the mapping owner while
 * a newer tracking row has pending changes for the very same MARKT-GO item.
 * Only identical sources (or a remote-only catalog placeholder) may safely
 * share that mapping for reads; ownership is never moved by the apply path.
 */
export function mayReadMarktGoMappingWithDifferentOwner(
  mappingExternalId: string,
  requested: TrackingMappingIdentity,
  owner: TrackingMappingIdentity,
): boolean {
  const requestedIdentity = getTrackingMarktGoIdentity(requested);
  const ownerIdentity = getTrackingMarktGoIdentity(owner);
  if (
    requestedIdentity.externalProductId &&
    requestedIdentity.externalProductId !== mappingExternalId
  ) return false;
  if (ownerIdentity.externalProductId && ownerIdentity.externalProductId !== mappingExternalId) {
    return false;
  }

  // Never borrow a foreign mapping with no trustworthy target on either side.
  if (!requestedIdentity.externalProductId && !ownerIdentity.externalProductId) return false;

  const requestedUrl = String(requested.sourceUrl || "").trim();
  const ownerUrl = String(owner.sourceUrl || "").trim();
  if (requestedUrl === ownerUrl && requestedUrl.length > 0) return true;

  const trustedTrendyolProductId = (sourceUrl: string): string | null => {
    try {
      const url = new URL(sourceUrl);
      if (!/(^|\.)trendyol\.com$/i.test(url.hostname)) return null;
      return url.pathname.match(/-p-(\d{5,})/i)?.[1] ?? null;
    } catch {
      return null;
    }
  };
  const requestedTy = trustedTrendyolProductId(requestedUrl);
  const ownerTy = trustedTrendyolProductId(ownerUrl);
  if (requestedTy && ownerTy && requestedTy === ownerTy) return true;

  // Catalog-only row has no storefront source. Its remote id must be proven.
  const remoteOnlyOwner = ownerUrl ===
    `marktgo://products/${encodeURIComponent(mappingExternalId)}`;
  return Boolean(
    remoteOnlyOwner &&
    requestedIdentity.externalProductId === mappingExternalId &&
    ownerIdentity.externalProductId === mappingExternalId,
  );
}


/** Restore a missing mapping only after confirming remote identity exists. */
export function canRecoverUnmappedMarktGoProduct(input: {
  trackedSourceUrl: string;
  trackedSourceSite: string;
  trackedSourceProductId: string | null;
  scopedExternalProductId: string;
  remoteProductId: string;
  remoteSourceUrl: string | null;
  remoteExternalId: string | null;
  lookupExternalIds: string[];
}): boolean {
  if (!input.remoteProductId) return false;
  if (input.scopedExternalProductId && input.scopedExternalProductId !== input.remoteProductId) {
    return false;
  }
  if (!input.scopedExternalProductId &&
      (!input.remoteExternalId || !input.lookupExternalIds.includes(input.remoteExternalId))) {
    return false;
  }
  if (input.remoteSourceUrl) {
    const request: TrackingMappingIdentity = {
      sourceUrl: input.trackedSourceUrl,
      sourceSite: input.trackedSourceSite,
      sourceProductId: input.trackedSourceProductId,
      shopifyProductId: input.scopedExternalProductId
        ? "marktgo:" + input.scopedExternalProductId : null,
      shopifySyncStatus: "marktgo",
    };
    const remote: TrackingMappingIdentity = {
      sourceUrl: input.remoteSourceUrl,
      sourceSite: input.trackedSourceSite,
      sourceProductId: null,
      shopifyProductId: "marktgo:" + input.remoteProductId,
      shopifySyncStatus: "marktgo",
    };
    return mayReadMarktGoMappingWithDifferentOwner(input.remoteProductId, request, remote);
  }
  return Boolean(input.scopedExternalProductId ||
    (input.remoteExternalId && input.lookupExternalIds.includes(input.remoteExternalId)));
}

async function recoverMissingMarktGoMapping(
  trackedProductId: number,
  tracked: TrackingMappingIdentity,
  explicitRemoteId: string,
  localProductIds: string[],
) {
  const { client, connection } = await getMarktGoClientForConnection();
  const externalIds = [...new Set(localProductIds.map(stableExternalId))];
  let remoteId: string | null = explicitRemoteId || null;
  if (!remoteId) {
    const foundIds = new Set<string>();
    for (const externalId of externalIds) {
      try {
        const matched = await client.get<unknown>(
          "/products/by-external-id/" + encodeURIComponent(externalId),
        );
        const foundId = extractId(matched);
        if (foundId) foundIds.add(foundId);
      } catch (error) {
        if (error instanceof MarktGoApiError && error.status === 404) continue;
        throw error;
      }
    }
    if (foundIds.size > 1) {
      throw new Error("MARKT-GO ürün araması birden fazla hedef döndürdü; eşleştirme durduruldu");
    }
    remoteId = [...foundIds][0] || null;
  }
  if (!remoteId) return null;

  let remotePayload: unknown;
  try {
    remotePayload = await client.get<unknown>("/products/" + encodeURIComponent(remoteId));
  } catch (error) {
    if (error instanceof MarktGoApiError && error.status === 404) return null;
    throw error;
  }
  if (extractId(remotePayload) !== remoteId) {
    throw new Error("MARKT-GO uzaktaki ürün kimliği doğrulanamadı; eşleştirme kaydedilmedi");
  }
  const outer = (remotePayload && typeof remotePayload === "object"
    ? remotePayload : {}) as Record<string, unknown>;
  const item = ((outer.data && typeof outer.data === "object" ? outer.data :
    outer.product && typeof outer.product === "object" ? outer.product : outer)
    || {}) as Record<string, unknown>;
  const sourceTag = extractTags(remotePayload).find((tag) => tag.startsWith("src:"));
  const remoteSourceUrl = String(item.sourceUrl || (sourceTag ? sourceTag.slice(4) : "")).trim();
  const remoteExternalId = extractExternalId(remotePayload);
  if (!canRecoverUnmappedMarktGoProduct({
    trackedSourceUrl: tracked.sourceUrl,
    trackedSourceSite: tracked.sourceSite,
    trackedSourceProductId: tracked.sourceProductId,
    scopedExternalProductId: explicitRemoteId,
    remoteProductId: remoteId,
    remoteSourceUrl: remoteSourceUrl || null,
    remoteExternalId,
    lookupExternalIds: externalIds,
  })) {
    throw new Error("MARKT-GO kaynak ürün kimliği doğrulanamadı; yanlış ürüne güncelleme yapılmadı");
  }
  const existingRemote = await findProductMapping({
    connectionId: connection.id, externalProductId: remoteId,
  });
  if (existingRemote) {
    return existingRemote.trackedProductId && existingRemote.trackedProductId !== trackedProductId
      ? null : existingRemote;
  }
  const localProductId = "marktgo_recovered_" + remoteId;
  const externalId = remoteExternalId || stableExternalId(localProductId);
  const conflict = (await findProductMapping({ connectionId: connection.id, externalId }))
    || (await findProductMapping({ connectionId: connection.id, localProductId }));
  if (conflict && conflict.externalProductId !== remoteId) {
    throw new Error("MARKT-GO externalId başka ürüne ait; eksik eşleme güvenle kurulamadı");
  }
  const linked = await upsertProductMapping({
    connectionId: connection.id,
    localProductId,
    externalProductId: remoteId,
    externalId,
    trackedProductId,
    status: "synced",
  });
  console.info("[marktgo-mapping-recovery] verified remote product link", {
    trackedProductId, connectionId: connection.id, externalProductId: remoteId,
  });
  return linked;
}

/**
 * A tracked item may be registered successfully after the MARKT-GO mapping
 * was created (especially on the "already_exists" upload path). Resolve the
 * missing link using strong product identifiers; never match by title.
 *
 * A mapping owned by another tracked item is never reassigned automatically.
 */
export async function findMappingForTrackedProduct(trackedProductId: number) {
  const [linked] = await db
    .select()
    .from(integrationProductMappings)
    .where(
      and(
        eq(integrationProductMappings.trackedProductId, trackedProductId),
        eq(integrationProductMappings.provider, DESTINATION_PROVIDER.MARKTGO),
      ),
    )
    .limit(1);
  if (linked) {
    const [tracked] = await db.select().from(trackedProducts)
      .where(eq(trackedProducts.id, trackedProductId)).limit(1);
    if (!tracked || tracked.archivedAt || tracked.currentStatus === "marktgo_deleted") return null;
    const claimed = getTrackingMarktGoIdentity(tracked).externalProductId;
    if (claimed && claimed !== linked.externalProductId) {
      throw new Error("MARKT-GO takip kimliği mevcut eşlemeyle çakışıyor; yanlış ürün güncellenmedi");
    }
    return linked;
  }

  const [tracked] = await db
    .select()
    .from(trackedProducts)
    .where(eq(trackedProducts.id, trackedProductId))
    .limit(1);
  if (!tracked || tracked.archivedAt || tracked.currentStatus === "marktgo_deleted") {
    return null;
  }

  const { externalProductId, localProductIds } = getTrackingMarktGoIdentity(tracked);

  // An exact remote id takes precedence; never silently fall back to an alias
  // if it points to another remote product.
  let candidates = externalProductId
    ? await db
        .select()
        .from(integrationProductMappings)
        .where(
          and(
            eq(integrationProductMappings.provider, DESTINATION_PROVIDER.MARKTGO),
            eq(integrationProductMappings.externalProductId, externalProductId),
          ),
        )
    : [];

  if (!candidates.length && localProductIds.length > 0) {
    const localIds = localProductIds;
    const externalIds = localIds.map(stableExternalId);
    candidates = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.provider, DESTINATION_PROVIDER.MARKTGO),
          inArray(integrationProductMappings.localProductId, localIds),
        ),
      );
    if (!candidates.length) {
      candidates = await db
        .select()
        .from(integrationProductMappings)
        .where(
          and(
            eq(integrationProductMappings.provider, DESTINATION_PROVIDER.MARKTGO),
            inArray(integrationProductMappings.externalId, externalIds),
          ),
        );
    }
  }

  if (candidates.length === 0) {
    return recoverMissingMarktGoMapping(
      trackedProductId, tracked, externalProductId, localProductIds,
    );
  }
  if (candidates.length !== 1) {
    throw new Error("MARKT-GO eşleştirmesi belirsiz: aynı kaynak için birden fazla ürün bulundu");
  }
  const mapping = candidates[0];
  if (externalProductId && mapping.externalProductId !== externalProductId) {
    throw new Error("MARKT-GO ürün kimliği çakışıyor; otomatik düzeltme durduruldu");
  }
  if (mapping.trackedProductId && mapping.trackedProductId !== trackedProductId) {
    const [owner] = await db
      .select()
      .from(trackedProducts)
      .where(eq(trackedProducts.id, mapping.trackedProductId))
      .limit(1);
    if (!owner || !mayReadMarktGoMappingWithDifferentOwner(mapping.externalProductId, tracked, owner)) {
      throw new Error(
        "MARKT-GO bağlantısı farklı bir kaynak ürüne ait; yanlış ürünü güncellememek için işlem durduruldu",
      );
    }
    // Safe same-item alias: use the existing remote mapping without moving its
    // owner, deleting either tracking row, or mutating unrelated change history.
    return mapping;
  }
  if (mapping.trackedProductId === trackedProductId) return mapping;

  // Conditional update guards against two different tracking workers taking
  // ownership of the same remote product concurrently.
  const [attached] = await db
    .update(integrationProductMappings)
    .set({ trackedProductId, updatedAt: new Date() })
    .where(
      and(
        eq(integrationProductMappings.id, mapping.id),
        isNull(integrationProductMappings.trackedProductId),
      ),
    )
    .returning();
  if (attached) return attached;

  const [current] = await db
    .select()
    .from(integrationProductMappings)
    .where(eq(integrationProductMappings.id, mapping.id))
    .limit(1);
  if (current?.trackedProductId === trackedProductId) return current;
  throw new Error("MARKT-GO eşleştirmesi başka işlem tarafından değiştirildi; tekrar deneyin");
}
