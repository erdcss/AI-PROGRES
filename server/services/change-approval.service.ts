import { db } from "../db";
import {
  auditLogs,
  changeGroups,
  detectedChanges,
  trackedProducts,
  trackedVariants,
  type DetectedChange,
  type InsertDetectedChange,
} from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getRequestId } from "../request-context";
import { isDirectlyApplicableTrackingChange } from "@shared/tracking-change-policy";
import {
  extractSourceCostFromChangeValue,
  matchTrackedVariantByKey,
} from "@shared/tracking-variant-resolve";
import { stableVariantKey } from "@shared/tracking-price-sanity";

export const CHANGE_STATUSES = [
  "pending",
  "manual_review",
  "approved",
  "rejected",
  "applying",
  "applied",
  "failed",
  "ignored",
  "superseded",
] as const;

export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ChangeStatus, ChangeStatus[]> = {
  pending: ["manual_review", "approved", "rejected", "ignored", "superseded"],
  manual_review: ["approved", "rejected", "ignored", "superseded"],
  approved: ["applying", "ignored", "superseded"],
  rejected: [],
  applying: ["applied", "failed"],
  applied: [],
  failed: ["applying", "ignored", "superseded"],
  ignored: [],
  superseded: [],
};

export const BULK_ACTION_MAX = 100;

export function canTransition(from: ChangeStatus, to: ChangeStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function recordAudit(input: {
  actor?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  success?: boolean;
  errorCode?: string;
  ipHint?: string;
  userAgentHint?: string;
}) {
  await db.insert(auditLogs).values({
    actor: input.actor ?? "system",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue as never,
    newValue: input.newValue as never,
    requestId: getRequestId(),
    ipHint: input.ipHint,
    userAgentHint: input.userAgentHint,
    success: input.success ?? true,
    errorCode: input.errorCode,
  });
}

async function getChangeOrThrow(id: number): Promise<DetectedChange> {
  const [row] = await db.select().from(detectedChanges).where(eq(detectedChanges.id, id)).limit(1);
  if (!row) throw new Error("Değişiklik bulunamadı");
  return row;
}

function assertTransition(current: string, next: ChangeStatus) {
  if (!canTransition(current as ChangeStatus, next)) {
    throw new Error(`Geçersiz durum geçişi: ${current} → ${next}`);
  }
}

function changePatch(fields: Partial<InsertDetectedChange>): Partial<InsertDetectedChange> {
  return fields;
}

async function hasMarktGoTarget(trackedProductId: number): Promise<boolean> {
  try {
    const { trackedProductHasMarktGoMapping } = await import("./marktgo/apply-change.service");
    return await trackedProductHasMarktGoMapping(trackedProductId);
  } catch {
    return false;
  }
}

export async function approveChange(id: number, actor = "user") {
  const row = await getChangeOrThrow(id);
  assertTransition(row.status, "approved");

  const [updated] = await db
    .update(detectedChanges)
    .set(
      changePatch({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: actor,
        updatedAt: new Date(),
      }),
    )
    .where(eq(detectedChanges.id, id))
    .returning();
  await recordAudit({
    actor,
    action: "change.approve",
    entityType: "detected_change",
    entityId: String(id),
    oldValue: { status: row.status },
    newValue: { status: "approved" },
  });
  return updated;
}

export async function rejectChange(id: number, actor = "user", reason?: string) {
  const row = await getChangeOrThrow(id);
  assertTransition(row.status, "rejected");
  const [updated] = await db
    .update(detectedChanges)
    .set(
      changePatch({
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: actor,
        reason: reason ?? row.reason,
        updatedAt: new Date(),
      }),
    )
    .where(eq(detectedChanges.id, id))
    .returning();
  await recordAudit({
    actor,
    action: "change.reject",
    entityType: "detected_change",
    entityId: String(id),
    oldValue: { status: row.status },
    newValue: { status: "rejected", reason },
  });
  return updated;
}

export async function ignoreChange(id: number, actor = "user") {
  const row = await getChangeOrThrow(id);
  assertTransition(row.status, "ignored");
  const [updated] = await db
    .update(detectedChanges)
    .set(
      changePatch({
        status: "ignored",
        seenAt: new Date(),
        updatedAt: new Date(),
      }),
    )
    .where(eq(detectedChanges.id, id))
    .returning();
  await recordAudit({
    actor,
    action: "change.ignore",
    entityType: "detected_change",
    entityId: String(id),
    oldValue: { status: row.status },
    newValue: { status: "ignored" },
  });
  return updated;
}

export type ApplyDryRunItem = {
  changeId: number;
  productId: number;
  trackingUid: string | null;
  targetProductId: string | null;
  variantId: number | null;
  field: string;
  oldValue: unknown;
  sourceNewValue: unknown;
  action: string;
  safeToApply: boolean;
  warnings: string[];
  target: "marktgo";
};

export async function buildChangeApplyDryRun(changeId: number): Promise<ApplyDryRunItem> {
  const change = await getChangeOrThrow(changeId);
  const [product] = await db
    .select()
    .from(trackedProducts)
    .where(eq(trackedProducts.id, change.trackedProductId))
    .limit(1);

  const warnings: string[] = [];
  const marktgoTarget = await hasMarktGoTarget(change.trackedProductId);
  let resolvedVariantId = change.trackedVariantId;

  if (!marktgoTarget) {
    warnings.push("Bu ürün MARKT-GO ile eşleştirilmemiş");
  }

  const needsVariant =
    change.changeType === "variant_price_changed" ||
    change.changeType === "variant_stock_changed";

  if (!resolvedVariantId && needsVariant) {
    const rows = await db
      .select()
      .from(trackedVariants)
      .where(eq(trackedVariants.trackedProductId, change.trackedProductId));
    const fromReason = String(change.reason ?? "").match(/([^\s“”"]+::[^\s“”"]+)/)?.[1];
    const meta =
      change.newValue && typeof change.newValue === "object"
        ? (change.newValue as Record<string, unknown>)
        : {};
    const key =
      fromReason ||
      (meta.key ? String(meta.key) : null) ||
      (meta.color || meta.size
        ? stableVariantKey({
            color: meta.color ? String(meta.color) : undefined,
            size: meta.size ? String(meta.size) : undefined,
          })
        : null);
    const matched = key ? matchTrackedVariantByKey(rows, key) : null;
    if (matched) {
      resolvedVariantId = matched.id;
    } else {
      warnings.push("MARKT-GO varyant bağlantısı çözülemedi");
    }
  }

  if (change.changeType === "price_changed" || change.changeType === "variant_price_changed") {
    const cost = extractSourceCostFromChangeValue(change.newValue);
    if (cost == null || cost <= 0) {
      warnings.push("Geçersiz yeni alış fiyatı");
    }
  }

  if (!product?.trackingUid) {
    warnings.push("Benzersiz takip UID eksik");
  }

  if (!isDirectlyApplicableTrackingChange(change.changeType, change.fieldName, change.newValue)) {
    warnings.push("Bu değişiklik MARKT-GO'da doğrudan düzeltilemez");
  }

  const safeToApply =
    warnings.length === 0 &&
    (change.status === "approved" || change.status === "failed");

  return {
    changeId,
    productId: change.trackedProductId,
    trackingUid: product?.trackingUid ?? null,
    targetProductId: product?.shopifyProductId?.startsWith("marktgo:")
      ? product.shopifyProductId.slice("marktgo:".length)
      : null,
    variantId: resolvedVariantId,
    field: change.fieldName,
    oldValue: change.oldValue,
    sourceNewValue: change.newValue,
    action: change.changeType,
    safeToApply,
    warnings,
    target: "marktgo",
  };
}

/** Marks change as applied after validation; target sync is delegated to the correct worker. */
export async function applyChange(changeId: number, actor = "user", dryRun = false) {
  const change = await getChangeOrThrow(changeId);
  if (change.status === "applied") {
    throw new Error("Bu değişiklik zaten MARKT-GO'ya uygulanmış");
  }
  if (change.status !== "approved" && change.status !== "failed") {
    throw new Error("Yalnızca onaylanmış veya başarısız değişiklikler uygulanabilir");
  }

  const dryRunResult = await buildChangeApplyDryRun(changeId);
  if (dryRun) return { dryRun: dryRunResult, applied: false };

  if (!dryRunResult.safeToApply) {
    throw new Error(dryRunResult.warnings.join("; ") || "MARKT-GO uygulaması güvenli değil");
  }

  const idempotencyKey = change.idempotencyKey ?? `marktgo-apply-${changeId}-${uuidv4()}`;

  const [claimed] = await db
    .update(detectedChanges)
    .set(
      changePatch({
        status: "applying",
        applyStatus: "applying",
        idempotencyKey,
        updatedAt: new Date(),
      }),
    )
    .where(
      and(
        eq(detectedChanges.id, changeId),
        inArray(detectedChanges.status, ["approved", "failed"]),
      ),
    )
    .returning({ id: detectedChanges.id });

  if (!claimed) {
    throw new Error("Değişiklik başka bir işlem tarafından uygulanıyor veya tamamlandı");
  }

  try {
    const { applyDetectedChangeToMarktGo } = await import("./marktgo/apply-change.service");
    const marktgoResult = await applyDetectedChangeToMarktGo(changeId);

    const [updated] = await db
      .update(detectedChanges)
      .set(
        changePatch({
          status: "applied",
          applyStatus: "applied",
          appliedAt: new Date(),
          idempotencyKey,
          applyError: null,
          updatedAt: new Date(),
        }),
      )
      .where(eq(detectedChanges.id, changeId))
      .returning();

    await recordAudit({
      actor,
      action: "change.marktgo_apply",
      entityType: "detected_change",
      entityId: String(changeId),
      newValue: { status: "applied", dryRun: dryRunResult, marktgoResult },
    });

    return { change: updated, dryRun: dryRunResult, marktgo: marktgoResult };
  } catch (err) {
    const message = (err as Error).message;
    await db
      .update(detectedChanges)
      .set(
        changePatch({
          status: "failed",
          applyStatus: "failed",
          applyError: message,
          retryCount: sql`${detectedChanges.retryCount} + 1` as unknown as number,
          updatedAt: new Date(),
        }),
      )
      .where(eq(detectedChanges.id, changeId));

    await recordAudit({
      actor,
      action: "change.marktgo_apply",
      entityType: "detected_change",
      entityId: String(changeId),
      success: false,
      errorCode: "marktgo_apply_failed",
      newValue: { error: message },
    });
    throw err;
  }
}

export async function retryChangeApply(changeId: number, actor = "user") {
  const change = await getChangeOrThrow(changeId);
  if (change.status !== "failed") {
    throw new Error("Yalnızca başarısız değişiklikler yeniden denenebilir");
  }
  await db
    .update(detectedChanges)
    .set(changePatch({ status: "approved", applyStatus: null, updatedAt: new Date() }))
    .where(eq(detectedChanges.id, changeId));
  return applyChange(changeId, actor, false);
}

export async function listChangeGroups(filters?: { status?: string; productId?: number }) {
  const conditions = [];
  if (filters?.status) conditions.push(eq(changeGroups.status, filters.status));
  if (filters?.productId) conditions.push(eq(changeGroups.trackedProductId, filters.productId));
  const query = db.select().from(changeGroups).orderBy(desc(changeGroups.createdAt));
  if (conditions.length === 0) return query;
  return query.where(and(...conditions));
}

export async function getChangeGroup(groupId: string) {
  const [row] = await db.select().from(changeGroups).where(eq(changeGroups.groupId, groupId)).limit(1);
  return row ?? null;
}

export async function bulkChangeAction(
  ids: number[],
  action: "approve" | "reject" | "ignore" | "apply" | "marktgo-sync",
  actor = "user",
) {
  if (ids.length === 0) throw new Error("En az bir kayıt seçin");
  if (ids.length > BULK_ACTION_MAX) {
    throw new Error(`En fazla ${BULK_ACTION_MAX} kayıt seçilebilir`);
  }

  const results: { id: number; success: boolean; error?: string; message?: string }[] = [];
  for (const id of ids) {
    try {
      if (action === "approve") await approveChange(id, actor);
      else if (action === "reject") await rejectChange(id, actor);
      else if (action === "ignore") await ignoreChange(id, actor);
      else if (action === "marktgo-sync") {
        const syncResult = await marktgoSyncChange(id, actor);
        const targetResult = syncResult as { marktgo?: { message?: string } | null };
        results.push({
          id,
          success: true,
          message: targetResult.marktgo?.message || "MARKT-GO ürünü güncellendi",
        });
        continue;
      } else await applyChange(id, actor, false);
      results.push({ id, success: true });
    } catch (err) {
      results.push({ id, success: false, error: (err as Error).message });
    }
  }
  return results;
}

/**
 * Ürün takip değişikliğini yalnızca MARKT-GO üzerinde uygular.
 * Shopify fallback'i bilinçli olarak kaldırılmıştır.
 */
export async function marktgoSyncChange(id: number, actor = "user") {
  const row = await getChangeOrThrow(id);
  const marktgoTarget = await hasMarktGoTarget(row.trackedProductId);

  if (!marktgoTarget) {
    throw new Error("Bu ürün MARKT-GO ile eşleştirilmemiş — önce Marktgo ürün eşlemesini tamamlayın");
  }
  if (row.status === "applied") {
    throw new Error("Bu değişiklik zaten MARKT-GO'ya uygulanmış");
  }
  if (row.status === "superseded") {
    throw new Error("Bu kayıt daha yeni bir değişiklikle geçersiz kılındı — güncel değişikliği kullanın");
  }
  if (row.status === "ignored" || row.status === "rejected") {
    throw new Error(`Bu değişiklik '${row.status}' durumunda; MARKT-GO'da düzeltilemez`);
  }
  if (row.status === "applying") {
    throw new Error("Bu değişiklik zaten MARKT-GO'ya uygulanıyor");
  }
  if (!isDirectlyApplicableTrackingChange(row.changeType, row.fieldName, row.newValue)) {
    throw new Error("Bu değişiklik MARKT-GO'da doğrudan düzeltilemez");
  }

  if (row.status === "pending" || row.status === "manual_review") {
    await approveChange(id, actor);
  }
  return applyChange(id, actor, false);
}

export async function listAuditLogs(page = 1, pageSize = 50) {
  const limit = Math.min(100, Math.max(1, pageSize));
  const offset = (Math.max(1, page) - 1) * limit;
  const items = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
  return {
    items,
    page,
    pageSize: limit,
    total: count,
    totalPages: Math.ceil(count / limit),
  };
}
