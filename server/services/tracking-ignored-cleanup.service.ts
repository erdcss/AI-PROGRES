import { db, pool } from "../db";
import { detectedChanges, trackedProducts } from "@shared/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  classifyShopifyNode,
  normalizeShopifyProductIdentity,
} from "./shopify-tracking-reconciliation.service";
import { shopifyAdminGraphql } from "../shopify-token-manager";
import { trackingService } from "./tracking.service";

const NOISE_CHANGE_TYPES = ["variant_added", "variant_removed"] as const;

const NOISE_REASONS = [
  "Eski varyant bildirimi: güncel takip kaydı zaten mevcut",
  "Tek ölçümde eksik görünen varyant kaldırılmış sayılmaz",
  "Varyant stokları mevcut; toplam stok bildirimi yinelenen bilgidir",
  "Ürün kapanmadı; yalnızca bazı beden/renk stokları değişti",
  "Eski gereksiz kayıt: değer değişmemiş",
] as const;

const ACTIONABLE_CHANGE_TYPES = [
  "price_changed",
  "variant_price_changed",
  "variant_stock_changed",
  "title_changed",
] as const;

export type IgnoredCleanupResult = {
  success: boolean;
  noiseDeleted: number;
  restoredToPending: number;
  shopifyMissingDeleted: number;
  shopifyChecked: number;
  shopifyLive: number;
  message: string;
  deletedProductIds: number[];
  restoredChangeIds: number[];
  error?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Yok sayılan gürültüyü sil; gerçek değişiklikleri Düzeltilecekler'e al */
export async function purgeIgnoredNoiseAndRestoreRealChanges(): Promise<{
  noiseDeleted: number;
  restoredToPending: number;
  restoredChangeIds: number[];
}> {
  const noiseDeleted = await db
    .delete(detectedChanges)
    .where(
      and(
        eq(detectedChanges.status, "ignored"),
        or(
          inArray(detectedChanges.changeType, [...NOISE_CHANGE_TYPES]),
          and(
            eq(detectedChanges.changeType, "stock_changed"),
            inArray(detectedChanges.reason, [...NOISE_REASONS]),
          ),
          inArray(detectedChanges.reason, [...NOISE_REASONS]),
        ),
      ),
    )
    .returning({ id: detectedChanges.id });

  const restored = await db
    .update(detectedChanges)
    .set({
      status: "pending",
      seenAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(detectedChanges.status, "ignored"),
        inArray(detectedChanges.changeType, [...ACTIONABLE_CHANGE_TYPES]),
      ),
    )
    .returning({ id: detectedChanges.id });

  return {
    noiseDeleted: noiseDeleted.length,
    restoredToPending: restored.length,
    restoredChangeIds: restored.map((r) => r.id),
  };
}

async function verifyShopifyPresence(
  rows: Array<{
    id: number;
    shopifyProductId: string | null;
    shopifyProductGid: string | null;
  }>,
): Promise<Array<{ trackedProductId: number; state: "live" | "missing" | "skip"; productId: string | null }>> {
  const prepared: Array<{ trackedProductId: number; productId: string; gid: string }> = [];
  const results: Array<{
    trackedProductId: number;
    state: "live" | "missing" | "skip";
    productId: string | null;
  }> = [];

  for (const row of rows) {
    const identity = normalizeShopifyProductIdentity(row);
    if (!identity.ok) {
      results.push({ trackedProductId: row.id, state: "skip", productId: null });
      continue;
    }
    prepared.push({
      trackedProductId: row.id,
      productId: identity.productId,
      gid: identity.gid,
    });
  }

  const BATCH = 40;
  for (let i = 0; i < prepared.length; i += BATCH) {
    const batch = prepared.slice(i, i + BATCH);
    const query = `
      query TrackingHardDeleteVerify($ids: [ID!]!) {
        nodes(ids: $ids) {
          __typename
          ... on Product {
            id
            legacyResourceId
            handle
            status
          }
        }
      }
    `;
    try {
      const gql = await shopifyAdminGraphql<{
        nodes?: Array<{
          __typename?: string;
          id?: string;
          legacyResourceId?: string;
          handle?: string;
          status?: string;
        } | null>;
      }>(query, { ids: batch.map((b) => b.gid) });

      // shopifyAdminGraphql returns { response, data, errors } — never treat the wrapper as data.
      if (!gql.response.ok || gql.errors || !Array.isArray(gql.data?.nodes)) {
        console.warn(
          `[tracking-cleanup] Shopify doğrulama eksik/hatalı (batch ${i}): ok=${gql.response.ok} errors=${Boolean(gql.errors)}`,
        );
        for (const item of batch) {
          results.push({
            trackedProductId: item.trackedProductId,
            state: "skip",
            productId: item.productId,
          });
        }
      } else {
        const nodes = gql.data!.nodes!;
        batch.forEach((item, idx) => {
          const node = nodes[idx];
          // nodes(ids) returns null only when the product is gone; anything else is skip.
          if (node === null) {
            results.push({
              trackedProductId: item.trackedProductId,
              state: "missing",
              productId: item.productId,
            });
            return;
          }
          const classified = classifyShopifyNode(
            { productId: item.productId, gid: item.gid },
            node,
          );
          results.push({
            trackedProductId: item.trackedProductId,
            state: classified.state === "live" ? "live" : "skip",
            productId: item.productId,
          });
        });
      }
    } catch (err) {
      console.warn(
        `[tracking-cleanup] Shopify doğrulama hatası: ${(err as Error).message}`,
      );
      for (const item of batch) {
        results.push({
          trackedProductId: item.trackedProductId,
          state: "skip",
          productId: item.productId,
        });
      }
    }
    if (i + BATCH < prepared.length) await sleep(250);
  }

  return results;
}

/**
 * Shopify'da olmayan takip ürünlerini cascade ile tamamen siler
 * (varyant, snapshot, değişiklik kayıtları dahil).
 */
export async function hardDeleteTrackedProductsMissingFromShopify(): Promise<{
  checked: number;
  live: number;
  skipped: number;
  deleted: number;
  deletedProductIds: number[];
  deletedShopifyIds: string[];
  abortedBySafety: boolean;
}> {
  const rows = await db
    .select({
      id: trackedProducts.id,
      shopifyProductId: trackedProducts.shopifyProductId,
      shopifyProductGid: trackedProducts.shopifyProductGid,
      sourceUrl: trackedProducts.sourceUrl,
      sourceTitle: trackedProducts.sourceTitle,
    })
    .from(trackedProducts);

  const verification = await verifyShopifyPresence(rows);
  const missing = verification.filter((v) => v.state === "missing");
  const live = verification.filter((v) => v.state === "live").length;
  const skipped = verification.filter((v) => v.state === "skip").length;
  const deletedProductIds: number[] = [];
  const deletedShopifyIds: string[] = [];

  // Safety: if nothing verified as live while we have rows, verification is broken — do not wipe.
  if (rows.length > 0 && live === 0 && missing.length === rows.length) {
    console.error(
      `[tracking-cleanup] Güvenlik durdurması: ${rows.length} ürünün tamamı missing göründü (skip=${skipped}). Hard-delete iptal.`,
    );
    return {
      checked: rows.length,
      live: 0,
      skipped,
      deleted: 0,
      deletedProductIds: [],
      deletedShopifyIds: [],
      abortedBySafety: true,
    };
  }

  for (const item of missing) {
    const productId = item.productId;
    if (productId && pool) {
      await pool.query(
        `UPDATE shopify_transferred_products
            SET tracking_enabled = FALSE, current_status = 'deleted', updated_at = NOW()
          WHERE shopify_product_id = $1`,
        [productId],
      );
      await pool.query(`DELETE FROM shopify_memory_products WHERE shopify_product_id = $1`, [
        productId,
      ]);
      deletedShopifyIds.push(productId);
    }

    await db.delete(trackedProducts).where(eq(trackedProducts.id, item.trackedProductId));
    deletedProductIds.push(item.trackedProductId);
  }

  return {
    checked: rows.length,
    live,
    skipped,
    deleted: deletedProductIds.length,
    deletedProductIds,
    deletedShopifyIds,
    abortedBySafety: false,
  };
}

/** Silinen ürünlerin sistemde kalmadığını doğrular */
export async function verifyHardDeleteRemoval(input: {
  deletedProductIds: number[];
  deletedShopifyIds: string[];
}): Promise<{
  passed: boolean;
  failures: Array<{ kind: string; id: string }>;
}> {
  const failures: Array<{ kind: string; id: string }> = [];

  if (input.deletedProductIds.length > 0) {
    const lingering = await db
      .select({ id: trackedProducts.id })
      .from(trackedProducts)
      .where(inArray(trackedProducts.id, input.deletedProductIds));
    for (const row of lingering) {
      failures.push({ kind: "tracked_products.id", id: String(row.id) });
    }
  }

  if (input.deletedShopifyIds.length > 0 && pool) {
    const trackedByShopify = await db
      .select({
        id: trackedProducts.id,
        shopifyProductId: trackedProducts.shopifyProductId,
      })
      .from(trackedProducts)
      .where(inArray(trackedProducts.shopifyProductId, input.deletedShopifyIds));
    for (const row of trackedByShopify) {
      failures.push({
        kind: "tracked_products.shopify_product_id",
        id: String(row.shopifyProductId ?? row.id),
      });
    }

    const mem = await pool.query<{ shopify_product_id: string }>(
      `SELECT shopify_product_id FROM shopify_memory_products
        WHERE shopify_product_id = ANY($1::text[])`,
      [input.deletedShopifyIds],
    );
    for (const row of mem.rows) {
      failures.push({ kind: "shopify_memory_products", id: row.shopify_product_id });
    }

    const activeXfer = await pool.query<{ shopify_product_id: string }>(
      `SELECT shopify_product_id FROM shopify_transferred_products
        WHERE shopify_product_id = ANY($1::text[])
          AND (tracking_enabled = TRUE OR current_status <> 'deleted')`,
      [input.deletedShopifyIds],
    );
    for (const row of activeXfer.rows) {
      failures.push({ kind: "shopify_transferred_products.active", id: row.shopify_product_id });
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Hatalı hard-delete sonrası: shopify_transferred_products'ta silindi işaretlenen
 * ama Shopify'da hâlâ canlı olan ürünleri takibe geri yükler.
 */
export async function restoreTrackedProductsFromTransferred(): Promise<{
  success: boolean;
  checked: number;
  restored: number;
  trulyMissing: number;
  skipped: number;
  errors: number;
  message: string;
}> {
  if (!pool) {
    return {
      success: false,
      checked: 0,
      restored: 0,
      trulyMissing: 0,
      skipped: 0,
      errors: 0,
      message: "DATABASE_URL tanımlı değil",
    };
  }

  const transferred = await pool.query<{
    id: number;
    source_url: string;
    title: string;
    shopify_product_id: string;
    shopify_handle: string | null;
    original_price: string | null;
    shopify_price: string | null;
  }>(
    `SELECT id, source_url, title, shopify_product_id, shopify_handle,
            original_price::text, shopify_price::text
       FROM shopify_transferred_products
      WHERE current_status = 'deleted'
        AND tracking_enabled = FALSE
        AND shopify_product_id IS NOT NULL
        AND source_url IS NOT NULL
      ORDER BY id`,
  );

  const rows = transferred.rows.map((r) => ({
    id: r.id,
    shopifyProductId: r.shopify_product_id,
    shopifyProductGid: `gid://shopify/Product/${r.shopify_product_id}`,
  }));

  const verification = await verifyShopifyPresence(rows);
  let restored = 0;
  let trulyMissing = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of verification) {
    const row = transferred.rows.find((r) => r.id === item.trackedProductId);
    if (!row) {
      skipped++;
      continue;
    }

    if (item.state === "skip") {
      skipped++;
      continue;
    }

    if (item.state === "missing") {
      trulyMissing++;
      continue;
    }

    const price = Number(row.original_price ?? row.shopify_price ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      skipped++;
      continue;
    }

    try {
      await trackingService.registerFromShopifyUpload({
        sourceUrl: row.source_url,
        title: row.title,
        price,
        shopifyProductId: row.shopify_product_id,
        shopifyHandle: row.shopify_handle ?? undefined,
        shopifyProductGid: `gid://shopify/Product/${row.shopify_product_id}`,
      });

      await pool.query(
        `UPDATE shopify_transferred_products
            SET tracking_enabled = TRUE, current_status = 'active', updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );

      restored++;
    } catch (err) {
      console.warn(
        `[tracking-cleanup] Geri yükleme hatası (${row.source_url}): ${(err as Error).message}`,
      );
      errors++;
    }
  }

  const message = `${restored} ürün takibe geri yüklendi; ${trulyMissing} gerçekten Shopify'da yok; ${skipped} atlandı; ${errors} hata`;
  console.info(`[tracking-cleanup] ${message}`);

  return {
    success: errors === 0,
    checked: rows.length,
    restored,
    trulyMissing,
    skipped,
    errors,
    message,
  };
}

/** Yok sayılan temizliği + Shopify kayıp ürün hard-delete */
export async function cleanupIgnoredAndMissingShopify(): Promise<IgnoredCleanupResult> {
  try {
    const ignoredPart = await purgeIgnoredNoiseAndRestoreRealChanges();
    const shopifyPart = await hardDeleteTrackedProductsMissingFromShopify();

    const message = [
      `${ignoredPart.noiseDeleted} gürültü yok-sayılan silindi`,
      `${ignoredPart.restoredToPending} gerçek değişiklik Düzeltilecekler'e alındı`,
      `${shopifyPart.deleted} Shopify'da olmayan ürün hafızadan silindi`,
    ].join("; ");

    console.info(`[tracking-cleanup] ${message}`);

    return {
      success: true,
      noiseDeleted: ignoredPart.noiseDeleted,
      restoredToPending: ignoredPart.restoredToPending,
      shopifyMissingDeleted: shopifyPart.deleted,
      shopifyChecked: shopifyPart.checked,
      shopifyLive: shopifyPart.live,
      message,
      deletedProductIds: shopifyPart.deletedProductIds,
      restoredChangeIds: ignoredPart.restoredChangeIds,
    };
  } catch (err) {
    return {
      success: false,
      noiseDeleted: 0,
      restoredToPending: 0,
      shopifyMissingDeleted: 0,
      shopifyChecked: 0,
      shopifyLive: 0,
      message: (err as Error).message,
      deletedProductIds: [],
      restoredChangeIds: [],
      error: (err as Error).message,
    };
  }
}
