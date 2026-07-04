import { db } from "../db";
import { changeGroups, detectedChanges, trackingRuns } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { writeAuditLog } from "./import-job.service";

export type ChangeSeverity = "critical" | "high" | "normal" | "info";

const SEVERITY_MAP: Record<string, ChangeSeverity> = {
  product_out_of_stock: "critical",
  shopify_sync_error: "critical",
  variant_removed: "high",
  variant_mapping_error: "high",
  price_increased: "normal",
  price_decreased: "normal",
  variant_out_of_stock: "normal",
  variant_back_in_stock: "normal",
  variant_price_increased: "normal",
  variant_price_decreased: "normal",
  product_back_in_stock: "normal",
  variant_added: "info",
  title_changed: "info",
  description_changed: "info",
  image_added: "info",
  image_removed: "info",
  source_unavailable: "critical",
};

export function resolveChangeSeverity(changeType: string, meta?: Record<string, unknown>): ChangeSeverity {
  if (changeType === "price_increased" || changeType === "price_decreased") {
    const pct = Number(meta?.percentChange || 0);
    if (pct > 15) return "high";
  }
  return SEVERITY_MAP[changeType] || "normal";
}

export async function createTrackingRun(trackedProductId: number) {
  const runId = randomUUID();
  const [run] = await db
    .insert(trackingRuns)
    .values({ trackedProductId, runId, status: "running" })
    .returning();
  return run;
}

export async function createChangeGroup(input: {
  trackedProductId: number;
  trackingRunId?: number;
  changes: Array<{
    changeType: string;
    fieldName?: string;
    oldValue?: unknown;
    newValue?: unknown;
    meta?: Record<string, unknown>;
  }>;
  sourceSnapshotId?: number;
  targetSnapshotId?: number;
}) {
  const groupId = randomUUID();
  const severities = input.changes.map((c) => resolveChangeSeverity(c.changeType, c.meta));
  const maxSeverity = severities.includes("critical")
    ? "critical"
    : severities.includes("high")
      ? "high"
      : severities.includes("info")
        ? "info"
        : "normal";

  const [group] = await db
    .insert(changeGroups)
    .values({
      groupId,
      trackedProductId: input.trackedProductId,
      status: "pending",
      severity: maxSeverity,
      changeCount: input.changes.length,
      requiresApproval: maxSeverity !== "info",
    })
    .returning();

  for (const change of input.changes) {
    await db.insert(detectedChanges).values({
      trackedProductId: input.trackedProductId,
      changeGroupId: groupId,
      changeType: change.changeType,
      fieldName: change.fieldName || change.changeType,
      severity: resolveChangeSeverity(change.changeType, change.meta),
      requiresApproval: resolveChangeSeverity(change.changeType, change.meta) !== "info",
      oldValue: change.oldValue ?? null,
      newValue: change.newValue ?? null,
      status: "pending",
      sourceSnapshotId: input.sourceSnapshotId ?? null,
      targetSnapshotId: input.targetSnapshotId ?? null,
      metadata: change.meta ?? {},
    });
  }

  return group;
}

const APPROVAL_TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected", "ignored"],
  manual_review: ["approved", "rejected", "ignored"],
  approved: ["applying"],
  applying: ["applied", "failed"],
  failed: ["applying"],
  applied: ["rolled_back"],
};

export class InvalidApprovalTransitionError extends Error {
  code = "invalid_approval_transition";
  statusCode = 409;
}

export async function transitionChangeGroup(
  groupDbId: number,
  toStatus: string,
  actor?: string,
  reason?: string,
) {
  const rows = await db.select().from(changeGroups).where(eq(changeGroups.id, groupDbId)).limit(1);
  const group = rows[0];
  if (!group) throw new Error("Change group bulunamadı");
  const allowed = APPROVAL_TRANSITIONS[group.status] || [];
  if (!allowed.includes(toStatus)) {
    throw new InvalidApprovalTransitionError(`Geçersiz geçiş: ${group.status} → ${toStatus}`);
  }

  const patch: Record<string, unknown> = { status: toStatus, updatedAt: new Date() };
  if (toStatus === "approved") {
    patch.approvedAt = new Date();
    patch.approvedBy = actor;
  }
  if (toStatus === "rejected") {
    patch.rejectedAt = new Date();
    patch.rejectedBy = actor;
  }
  if (toStatus === "applied") patch.appliedAt = new Date();

  await db.update(changeGroups).set(patch).where(eq(changeGroups.id, groupDbId));

  await writeAuditLog({
    actor,
    action: `change_group_${toStatus}`,
    entityType: "change_group",
    entityId: group.groupId,
    oldValue: { status: group.status },
    newValue: { status: toStatus, reason },
  });

  return db.select().from(changeGroups).where(eq(changeGroups.id, groupDbId)).limit(1).then((r) => r[0]);
}

export async function listChangeGroups(status?: string) {
  const q = db.select().from(changeGroups).orderBy(desc(changeGroups.createdAt)).limit(100);
  if (status) return q.where(eq(changeGroups.status, status));
  return q;
}
