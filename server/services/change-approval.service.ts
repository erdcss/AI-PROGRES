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
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getRequestId } from "../request-context";
import { applyDetectedChangeToShopify } from "./change-shopify-apply.service";
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
  shopifyProductId: string | null;
  variantId: number | null;
  field: string;
  shopifyOldValue: unknown;
  sourceNewValue: unknown;
  action: string;
  safeToApply: boolean;
  warnings: string[];
};

export async function buildChangeApplyDryRun(changeId: number): Promise<ApplyDryRunItem> {
  const change = await getChangeOrThrow(changeId);
  const product = await db
    .select()
    .from(trackedProducts)
    .where(eq(trackedProducts.id, change.trackedProductId))
    .limit(1);
  const warnings: string[] = [];
  let variantShopifyId: string | null = null;
  let resolvedVariantId = change.trackedVariantId;

  const needsVariant =
    change.changeType === "variant_price_changed" ||
    change.changeType === "variant_stock_changed";

  if (change.trackedVariantId) {
    const [variant] = await db
      .select()
      .from(trackedVariants)
      .where(eq(trackedVariants.id, change.trackedVariantId))
      .limit(1);
    variantShopifyId = variant?.shopifyVariantId ?? null;
    if (!variantShopifyId) warnings.push("Shopify varyant eşleşmesi yok");
  } else if (needsVariant) {
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
    if (matched?.shopifyVariantId) {
      resolvedVariantId = matched.id;
      variantShopifyId = matched.shopifyVariantId;
    } else {
      warnings.push("Shopify varyant eşleşmesi yok — beden/renk bağlantısı kurulamadı");
    }
  }

  if (change.changeType === "price_changed") {
    const mapped = await db
      .select({ id: trackedVariants.id })
      .from(trackedVariants)
      .where(
        and(
          eq(trackedVariants.trackedProductId, change.trackedProductId),
          isNotNull(trackedVariants.shopifyVariantId),
        ),
      )
      .limit(1);
    if (mapped.length === 0) {
      warnings.push("Shopify varyant eşleşmesi yok");
    }
    const cost = extractSourceCostFromChangeValue(change.newValue);
    if (cost == null || cost <= 0) {
      warnings.push("Geçersiz yeni alış fiyatı");
    }
  }

  if (!product[0]?.shopifyProductId) {
    warnings.push("Shopify ürün ID kayıtlı değil");
  }
  if (!product[0]?.trackingUid) {
    warnings.push("Benzersiz takip UID eksik");
  }
  if (
    !isDirectlyApplicableTrackingChange(
      change.changeType,
      change.fieldName,
      change.newValue,
    )
  ) {
    warnings.push("Bu değişiklik Shopify'da doğrudan düzeltilemez");
  }

  const safeToApply =
    warnings.length === 0 &&
    (change.status === "approved" || change.status === "failed");

  return {
    changeId,
    productId: change.trackedProductId,
    trackingUid: product[0]?.trackingUid ?? null,
    shopifyProductId: product[0]?.shopifyProductId ?? null,
    variantId: resolvedVariantId,
    field: change.fieldName,
    shopifyOldValue: change.oldValue,
    sourceNewValue: change.newValue,
    action: change.changeType,
    safeToApply,
    warnings,
  };
}

/** Marks change as applied after validation; Shopify sync delegated to apply worker when configured. */
export async function applyChange(changeId: number, actor = "user", dryRun = false) {
  const change = await getChangeOrThrow(changeId);
  if (change.status === "applied") {
    throw new Error("Bu değişiklik zaten uygulanmış");
  }
  if (change.status !== "approved" && change.status !== "failed") {
    throw new Error("Yalnızca onaylanmış veya başarısız değişiklikler uygulanabilir");
  }

  const dryRunResult = await buildChangeApplyDryRun(changeId);
  if (dryRun) return { dryRun: dryRunResult, applied: false };

  if (!dryRunResult.safeToApply) {
    throw new Error(dryRunResult.warnings.join("; ") || "Uygulama güvenli değil");
  }

  const idempotencyKey = change.idempotencyKey ?? `apply-${changeId}-${uuidv4()}`;

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
    let shopifyResult: unknown = null;
    let marktgoResult: unknown = null;
    const { trackedProductHasMarktGoMapping, applyDetectedChangeToMarktGo } = await import(
      "./marktgo/apply-change.service"
    );
    const hasMarktGo = await trackedProductHasMarktGoMapping(change.trackedProductId);
    if (hasMarktGo) {
      marktgoResult = await applyDetectedChangeToMarktGo(changeId);
    }
    const [trackedRow] = await db
      .select({ shopifyProductId: trackedProducts.shopifyProductId })
      .from(trackedProducts)
      .where(eq(trackedProducts.id, change.trackedProductId))
      .limit(1);
    if (trackedRow?.shopifyProductId || !hasMarktGo) {
      shopifyResult = await applyDetectedChangeToShopify(changeId);
    }

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
      action: "change.apply",
      entityType: "detected_change",
      entityId: String(changeId),
      newValue: { status: "applied", dryRun: dryRunResult, shopifyResult, marktgoResult },
    });

    return { change: updated, dryRun: dryRunResult, shopify: shopifyResult, marktgo: marktgoResult };
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
      action: "change.apply",
      entityType: "detected_change",
      entityId: String(changeId),
      success: false,
      errorCode: "apply_failed",
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
  action: "approve" | "reject" | "ignore" | "apply" | "shopify-sync",
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
      else if (action === "shopify-sync") {
        const syncResult = await shopifySyncChange(id, actor);
        results.push({
          id,
          success: true,
          message:
            (syncResult as { shopify?: { message?: string } })?.shopify?.message ||
            "Shopify güncellendi",
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

/** Onayla + Shopify'da uygula (tek adım) */
export async function shopifySyncChange(id: number, actor = "user") {
  const row = await getChangeOrThrow(id);
  if (row.status === "applied") {
    throw new Error("Bu değişiklik zaten Shopify'a uygulanmış");
  }
  if (row.status === "superseded") {
    throw new Error(
      "Bu kayıt daha yeni bir değişiklikle geçersiz kılındı — güncel değişikliği kullanın",
    );
  }
  if (row.status === "ignored" || row.status === "rejected") {
    throw new Error(`Bu değişiklik '${row.status}' durumunda; Shopify'da düzeltilemez`);
  }
  if (row.status === "applying") {
    throw new Error("Bu değişiklik zaten uygulanıyor — birkaç saniye bekleyin");
  }
  if (!isDirectlyApplicableTrackingChange(row.changeType, row.fieldName, row.newValue)) {
    throw new Error("Bu değişiklik Shopify'da doğrudan düzeltilemez");
  }

  // Eşleşmeyen varyant kayıtları toplu senkronu 1/2 hatasına düşürmesin
  if (
    (row.changeType === "variant_stock_changed" ||
      row.changeType === "variant_price_changed") &&
    !row.trackedVariantId
  ) {
    const dryRun = await buildChangeApplyDryRun(id);
    const unlinkable = dryRun.warnings.some((w) =>
      /eşleşmesi yok|bağlantısı kurulamadı/i.test(w),
    );
    if (unlinkable || dryRun.variantId == null) {
      const ignored = await ignoreChange(id, actor);
      return {
        change: ignored,
        dryRun,
        skipped: true,
        shopify: {
          success: true,
          changeId: id,
          action: row.changeType,
          message: "Varyant eşleşmesi yok — kayıt yok sayıldı",
          skipped: true,
        },
      };
    }
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
