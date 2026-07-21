import { pool } from "../db";
import { shopifyAdminGraphql } from "../shopify-token-manager";

const RECONCILE_LOCK_KEY = 1_397_480_921;
const BATCH_SIZE = 40;
const ACTIVE_CHANGE_STATUSES = ["pending", "manual_review", "approved"];

type TrackedShopifyRow = {
  id: number;
  source_title: string;
  shopify_product_id: string | null;
  shopify_product_gid: string | null;
  current_status: string;
  tracking_enabled: boolean;
  paused_reason: string | null;
};

export type ShopifyExistenceState = "live" | "missing" | "identity_conflict" | "unknown";

export type ShopifyExistenceResult = {
  trackedProductId: number;
  state: ShopifyExistenceState;
  productId: string | null;
  gid: string | null;
  handle?: string;
  reason?: string;
};

export type ShopifyTrackingReconcileResult = {
  success: boolean;
  locked?: boolean;
  checked: number;
  live: number;
  archived: number;
  restored: number;
  superseded: number;
  conflicts: number;
  unknown: number;
  shopDomain?: string;
  startedAt: string;
  completedAt: string;
  message: string;
  items: ShopifyExistenceResult[];
  error?: string;
};

type ShopifyNode = {
  __typename?: string;
  id?: string;
  legacyResourceId?: string;
  handle?: string;
  status?: string;
} | null;

type NodesResponse = {
  nodes?: ShopifyNode[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeShopifyProductIdentity(row: {
  shopifyProductId?: string | null;
  shopifyProductGid?: string | null;
}): { ok: true; productId: string; gid: string } | { ok: false; reason: string } {
  const productId = String(row.shopifyProductId ?? "").trim();
  const rawGid = String(row.shopifyProductGid ?? "").trim();
  const gidMatch = rawGid.match(/^gid:\/\/shopify\/Product\/(\d+)$/);

  if (rawGid && !gidMatch) {
    return { ok: false, reason: "Geçersiz Shopify Product GID" };
  }
  const gidProductId = gidMatch?.[1] ?? "";
  if (productId && !/^\d+$/.test(productId)) {
    return { ok: false, reason: "Geçersiz Shopify product ID" };
  }
  if (productId && gidProductId && productId !== gidProductId) {
    return { ok: false, reason: "Shopify product ID ve GID uyuşmuyor" };
  }

  const resolvedId = productId || gidProductId;
  if (!resolvedId) return { ok: false, reason: "Shopify product kimliği eksik" };
  return {
    ok: true,
    productId: resolvedId,
    gid: `gid://shopify/Product/${resolvedId}`,
  };
}

export function classifyShopifyNode(
  expected: { productId: string; gid: string },
  node: ShopifyNode | undefined,
): { state: Exclude<ShopifyExistenceState, "unknown">; reason?: string } {
  if (node === null) return { state: "missing" };
  if (!node || node.__typename !== "Product" || !node.id) {
    return { state: "identity_conflict", reason: "Shopify node türü veya kimliği geçersiz" };
  }
  if (node.id !== expected.gid || String(node.legacyResourceId ?? "") !== expected.productId) {
    return { state: "identity_conflict", reason: "Shopify node kimliği kayıtla uyuşmuyor" };
  }
  return { state: "live" };
}

export function isCompleteShopifyNodeBatch(input: {
  responseOk: boolean;
  errors?: unknown;
  nodes?: ShopifyNode[];
  expectedCount: number;
}): boolean {
  return (
    input.responseOk &&
    !input.errors &&
    Array.isArray(input.nodes) &&
    input.nodes.length === input.expectedCount
  );
}

async function fetchNodesWithRetry(gids: string[]) {
  const query = `
    query TrackingProductExistence($ids: [ID!]!) {
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

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await shopifyAdminGraphql<NodesResponse>(query, { ids: gids });
    const retryable = result.response.status === 429 || result.response.status >= 500;
    if (result.response.ok && !result.errors && Array.isArray(result.data?.nodes)) return result;
    if (!retryable || attempt === 3) return result;

    const retryAfter = Number(result.response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * attempt);
  }
  throw new Error("Shopify GraphQL doğrulaması tamamlanamadı");
}

async function verifyTrackedRows(
  rows: TrackedShopifyRow[],
): Promise<{ results: ShopifyExistenceResult[]; shopDomain?: string; complete: boolean }> {
  const results: ShopifyExistenceResult[] = [];
  const valid: Array<{
    row: TrackedShopifyRow;
    identity: { productId: string; gid: string };
  }> = [];

  for (const row of rows) {
    const identity = normalizeShopifyProductIdentity({
      shopifyProductId: row.shopify_product_id,
      shopifyProductGid: row.shopify_product_gid,
    });
    if (identity.ok === false) {
      results.push({
        trackedProductId: row.id,
        state: "identity_conflict",
        productId: row.shopify_product_id,
        gid: row.shopify_product_gid,
        reason: identity.reason,
      });
    } else {
      valid.push({ row, identity });
    }
  }

  let shopDomain: string | undefined;
  for (let offset = 0; offset < valid.length; offset += BATCH_SIZE) {
    const batch = valid.slice(offset, offset + BATCH_SIZE);
    try {
      const response = await fetchNodesWithRetry(batch.map((item) => item.identity.gid));
      shopDomain = response.shopDomain;
      const nodes = response.data?.nodes;
      if (
        !isCompleteShopifyNodeBatch({
          responseOk: response.response.ok,
          errors: response.errors,
          nodes,
          expectedCount: batch.length,
        })
      ) {
        for (const item of batch) {
          results.push({
            trackedProductId: item.row.id,
            state: "unknown",
            productId: item.identity.productId,
            gid: item.identity.gid,
            reason: `Shopify doğrulaması belirsiz (HTTP ${response.response.status})`,
          });
        }
        return { results, shopDomain, complete: false };
      }

      const verifiedNodes = nodes as ShopifyNode[];
      batch.forEach((item, index) => {
        const node = verifiedNodes[index];
        const classified = classifyShopifyNode(item.identity, node);
        results.push({
          trackedProductId: item.row.id,
          state: classified.state,
          productId: item.identity.productId,
          gid: item.identity.gid,
          handle: node?.handle,
          reason: classified.reason,
        });
      });
    } catch (error) {
      for (const item of batch) {
        results.push({
          trackedProductId: item.row.id,
          state: "unknown",
          productId: item.identity.productId,
          gid: item.identity.gid,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      return { results, shopDomain, complete: false };
    }
  }

  return { results, shopDomain, complete: true };
}

export async function getLastShopifyTrackingReconcileStatus() {
  if (!pool) return null;
  const result = await pool.query<{
    status: string;
    message: string;
    meta: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT status, message, meta, created_at
       FROM sync_logs
      WHERE action = 'shopify_tracking_reconcile'
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

export async function reconcileShopifyTracking(): Promise<ShopifyTrackingReconcileResult> {
  const startedAt = new Date();
  const base = {
    checked: 0,
    live: 0,
    archived: 0,
    restored: 0,
    superseded: 0,
    conflicts: 0,
    unknown: 0,
    startedAt: startedAt.toISOString(),
    completedAt: startedAt.toISOString(),
    items: [] as ShopifyExistenceResult[],
  };

  if (!pool) {
    return { ...base, success: false, message: "DATABASE_URL tanımlı değil", error: "database_unavailable" };
  }

  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [RECONCILE_LOCK_KEY],
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) {
      return {
        ...base,
        success: false,
        locked: true,
        completedAt: new Date().toISOString(),
        message: "Shopify takip senkronu zaten çalışıyor",
      };
    }

    const tracked = await client.query<TrackedShopifyRow>(
      `SELECT id, source_title, shopify_product_id, shopify_product_gid,
              current_status, tracking_enabled, paused_reason
         FROM tracked_products
        WHERE shopify_product_id IS NOT NULL OR shopify_product_gid IS NOT NULL
        ORDER BY id`,
    );
    const verification = await verifyTrackedRows(tracked.rows);
    const unknown = verification.results.filter((item) => item.state === "unknown").length;
    const conflicts = verification.results.filter((item) => item.state === "identity_conflict").length;

    if (!verification.complete || unknown > 0) {
      const meta = {
        checked: tracked.rowCount,
        unknown,
        conflicts,
        complete: false,
      };
      await client.query(
        `INSERT INTO sync_logs (action, status, message, meta)
         VALUES ('shopify_tracking_reconcile', 'error', $1, $2::jsonb)`,
        ["Shopify doğrulaması belirsiz; hiçbir takip kaydı değiştirilmedi", JSON.stringify(meta)],
      );
      return {
        ...base,
        success: false,
        checked: tracked.rowCount,
        conflicts,
        unknown,
        shopDomain: verification.shopDomain,
        completedAt: new Date().toISOString(),
        message: "Shopify doğrulaması tamamlanamadı; kayıtlar korunarak işlem durduruldu",
        items: verification.results,
        error: "incomplete_shopify_verification",
      };
    }

    const liveItems = verification.results.filter((item) => item.state === "live");
    const missingItems = verification.results.filter((item) => item.state === "missing");
    let restored = 0;
    let archived = 0;
    let superseded = 0;

    await client.query("BEGIN");
    try {
      const now = new Date();
      for (const item of liveItems) {
        const restoredRow = await client.query(
          `UPDATE tracked_products
              SET shopify_product_id = $2,
                  shopify_product_gid = $3,
                  shopify_handle = COALESCE($4, shopify_handle),
                  shopify_sync_status = 'live',
                  last_shopify_sync_at = $5,
                  tracking_enabled = CASE
                    WHEN current_status = 'shopify_deleted'
                     AND (paused_reason = 'shopify_missing' OR paused_reason IS NULL)
                    THEN TRUE ELSE tracking_enabled END,
                  current_status = CASE
                    WHEN current_status = 'shopify_deleted'
                     AND (paused_reason = 'shopify_missing' OR paused_reason IS NULL)
                    THEN 'active' ELSE current_status END,
                  paused_reason = CASE
                    WHEN current_status = 'shopify_deleted'
                     AND (paused_reason = 'shopify_missing' OR paused_reason IS NULL)
                    THEN NULL ELSE paused_reason END,
                  archived_at = CASE
                    WHEN current_status = 'shopify_deleted'
                     AND (paused_reason = 'shopify_missing' OR paused_reason IS NULL)
                    THEN NULL ELSE archived_at END,
                  last_error_message = CASE
                    WHEN current_status = 'shopify_deleted'
                     AND (paused_reason = 'shopify_missing' OR paused_reason IS NULL)
                    THEN NULL ELSE last_error_message END,
                  updated_at = $5
            WHERE id = $1
            RETURNING current_status`,
          [item.trackedProductId, item.productId, item.gid, item.handle ?? null, now],
        );
        if (restoredRow.rows[0]?.current_status === "active") {
          const before = tracked.rows.find((row) => row.id === item.trackedProductId);
          if (
            before?.current_status === "shopify_deleted" &&
            (before.paused_reason === "shopify_missing" || before.paused_reason == null)
          ) {
            restored++;
            await client.query(
              `UPDATE shopify_transferred_products
                  SET tracking_enabled = TRUE, current_status = 'active', updated_at = $2
                WHERE shopify_product_id = $1
                  AND current_status = 'deleted'`,
              [item.productId, now],
            );
          }
        }
      }

      for (const item of missingItems) {
        const archivedRow = await client.query(
          `UPDATE tracked_products
              SET tracking_enabled = FALSE,
                  current_status = 'shopify_deleted',
                  shopify_sync_status = 'missing',
                  last_shopify_sync_at = $2,
                  paused_reason = 'shopify_missing',
                  archived_at = COALESCE(archived_at, $2),
                  last_error_message = 'Shopify mağazasında ürün bulunamadı',
                  last_error_at = $2,
                  updated_at = $2
            WHERE id = $1
              AND current_status <> 'shopify_deleted'
            RETURNING id`,
          [item.trackedProductId, now],
        );
        archived += archivedRow.rowCount;

        await client.query(
          `UPDATE shopify_transferred_products
              SET tracking_enabled = FALSE, current_status = 'deleted', updated_at = $2
            WHERE shopify_product_id = $1`,
          [item.productId, now],
        );
        await client.query(
          "DELETE FROM shopify_memory_products WHERE shopify_product_id = $1",
          [item.productId],
        );
        const changed = await client.query(
          `UPDATE detected_changes
              SET status = 'superseded',
                  reason = 'Shopify ürünü mağazadan silindi',
                  updated_at = $2
            WHERE tracked_product_id = $1
              AND status = ANY($3::text[])
            RETURNING id`,
          [item.trackedProductId, now, ACTIVE_CHANGE_STATUSES],
        );
        superseded += changed.rowCount;
      }

      const meta = {
        checked: tracked.rowCount,
        live: liveItems.length,
        archived,
        restored,
        superseded,
        conflicts,
        unknown: 0,
        shopDomain: verification.shopDomain,
      };
      await client.query(
        `INSERT INTO sync_logs (action, status, message, meta)
         VALUES ('shopify_tracking_reconcile', 'success', $1, $2::jsonb)`,
        [
          `${tracked.rowCount} takip kaydı Shopify ile eşitlendi; ${archived} arşivlendi, ${restored} geri getirildi`,
          JSON.stringify(meta),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    return {
      ...base,
      success: true,
      checked: tracked.rowCount,
      live: liveItems.length,
      archived,
      restored,
      superseded,
      conflicts,
      shopDomain: verification.shopDomain,
      completedAt: new Date().toISOString(),
      message: `${tracked.rowCount} ürün Shopify ile eşitlendi`,
      items: verification.results,
    };
  } catch (error) {
    return {
      ...base,
      success: false,
      completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [RECONCILE_LOCK_KEY]).catch(() => undefined);
    }
    client.release();
  }
}
