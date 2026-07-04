import { db } from "../db";
import { importJobs, importJobEvents, auditLogs } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import type { ImportJobStatus } from "@shared/import-job-types";
import {
  assertJobTransition,
  InvalidJobTransitionError,
} from "@shared/import-job-state-machine";

export async function writeAuditLog(input: {
  actor?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  requestId?: string;
  ipHint?: string;
  userAgentHint?: string;
  success?: boolean;
  errorCode?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      actor: input.actor ?? "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      requestId: input.requestId ?? null,
      ipHint: input.ipHint ?? null,
      userAgentHint: input.userAgentHint ?? null,
      success: input.success !== false,
      errorCode: input.errorCode ?? null,
    });
  } catch (err) {
    console.warn("⚠️ audit_logs yazılamadı:", (err as Error).message);
  }
}

export function generateImportJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export class ImportJobService {
  async createJob(input: {
    sourceUrl: string;
    sourcePlatform?: string;
    scrapeMode?: string;
    uploadMode?: string;
    profitRuleId?: number | null;
    requestedBy?: string;
    requestId?: string;
  }) {
    const jobId = generateImportJobId();
    const rows = await db
      .insert(importJobs)
      .values({
        jobId,
        sourceUrl: input.sourceUrl,
        sourcePlatform: input.sourcePlatform || "trendyol",
        scrapeMode: input.scrapeMode || "auto",
        uploadMode: input.uploadMode || "manual_approval",
        profitRuleId: input.profitRuleId ?? null,
        requestedBy: input.requestedBy ?? null,
        requestId: input.requestId ?? null,
        status: "queued",
        currentStage: "queued",
        progressPercentage: 0,
      })
      .returning();
    const job = rows[0];
    await this.appendEvent(job.id, {
      stage: "queued",
      message: "İçe aktarma işi kuyruğa alındı",
      safeMeta: { sourceUrl: input.sourceUrl },
    });
    await writeAuditLog({
      action: "import_job_created",
      entityType: "import_job",
      entityId: jobId,
      newValue: { sourceUrl: input.sourceUrl, status: "queued" },
      requestId: input.requestId,
    });
    return job;
  }

  async getByJobId(jobId: string) {
    const rows = await db.select().from(importJobs).where(eq(importJobs.jobId, jobId)).limit(1);
    return rows[0] ?? null;
  }

  async listJobs(page = 1, pageSize = 20, status?: string) {
    const offset = (page - 1) * pageSize;
    const conditions = status ? eq(importJobs.status, status) : undefined;
    const base = db.select().from(importJobs).orderBy(desc(importJobs.createdAt));
    const items = conditions
      ? await base.where(conditions).limit(pageSize).offset(offset)
      : await base.limit(pageSize).offset(offset);

    const countQuery = conditions
      ? db.select({ count: sql<number>`count(*)::int` }).from(importJobs).where(conditions)
      : db.select({ count: sql<number>`count(*)::int` }).from(importJobs);
    const [{ count }] = await countQuery;

    return {
      items,
      page,
      pageSize,
      total: count,
      totalPages: Math.ceil(count / pageSize) || 1,
    };
  }

  async transitionJob(
    jobDbId: number,
    input: {
      toStatus: ImportJobStatus;
      actor?: string;
      requestId?: string;
      expectedVersion?: number;
      expectedStatus?: string;
      patch?: Record<string, unknown>;
      event?: { stage: string; message: string; code?: string; safeMeta?: Record<string, unknown> };
    },
  ) {
    const rows = await db.select().from(importJobs).where(eq(importJobs.id, jobDbId)).limit(1);
    const job = rows[0];
    if (!job) throw new Error("İş bulunamadı");

    if (input.expectedVersion != null && job.version !== input.expectedVersion) {
      const err = new InvalidJobTransitionError(job.status, input.toStatus);
      err.message = `Sürüm uyuşmazlığı: beklenen ${input.expectedVersion}, mevcut ${job.version}`;
      throw err;
    }
    if (input.expectedStatus && job.status !== input.expectedStatus) {
      const err = new InvalidJobTransitionError(job.status, input.toStatus);
      err.message = `Durum uyuşmazlığı: beklenen ${input.expectedStatus}, mevcut ${job.status}`;
      throw err;
    }

    assertJobTransition(job.status, input.toStatus);

    const nextVersion = (job.version || 1) + 1;
    await db
      .update(importJobs)
      .set({
        status: input.toStatus,
        currentStage: input.toStatus,
        version: nextVersion,
        updatedAt: new Date(),
        ...(input.patch || {}),
      })
      .where(and(eq(importJobs.id, jobDbId), eq(importJobs.version, job.version || 1)));

    const updated = await db.select().from(importJobs).where(eq(importJobs.id, jobDbId)).limit(1);
    if (!updated[0] || updated[0].version !== nextVersion) {
      const err = new InvalidJobTransitionError(job.status, input.toStatus);
      err.message = "Eşzamanlı güncelleme — işlem tekrar denenmeli";
      throw err;
    }

    if (input.event) {
      await this.appendEvent(jobDbId, {
        stage: input.event.stage,
        message: input.event.message,
        code: input.event.code,
        safeMeta: {
          ...(input.event.safeMeta || {}),
          previousStatus: job.status,
          newStatus: input.toStatus,
          actor: input.actor || "system",
          requestId: input.requestId,
        },
      });
    }

    await writeAuditLog({
      actor: input.actor,
      action: "import_job_transition",
      entityType: "import_job",
      entityId: job.jobId,
      oldValue: { status: job.status, version: job.version },
      newValue: { status: input.toStatus, version: nextVersion },
      requestId: input.requestId,
    });

    return updated[0];
  }

  async acquireJobLock(jobDbId: number, lockedBy: string, timeoutMs = 120_000): Promise<boolean> {
    const rows = await db.select().from(importJobs).where(eq(importJobs.id, jobDbId)).limit(1);
    const job = rows[0];
    if (!job) return false;
    if (job.lockedAt && Date.now() - job.lockedAt.getTime() < timeoutMs) return false;
    await db
      .update(importJobs)
      .set({ lockedAt: new Date(), lockedBy, updatedAt: new Date() })
      .where(eq(importJobs.id, jobDbId));
    return true;
  }

  async releaseJobLock(jobDbId: number): Promise<void> {
    await db
      .update(importJobs)
      .set({ lockedAt: null, lockedBy: null, updatedAt: new Date() })
      .where(eq(importJobs.id, jobDbId));
  }

  async updateStatus(
    jobDbId: number,
    patch: {
      status?: ImportJobStatus;
      currentStage?: string;
      progressPercentage?: number;
      errorCode?: string | null;
      errorMessage?: string | null;
      canonicalProduct?: unknown;
      qualityResult?: unknown;
      shopifyResult?: unknown;
      trackingResult?: unknown;
      sourceProductId?: string | null;
      startedAt?: Date;
      completedAt?: Date;
      retryCount?: number;
    },
  ) {
    await db
      .update(importJobs)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobDbId));
  }

  async appendEvent(
    jobDbId: number,
    input: {
      stage: string;
      level?: string;
      code?: string;
      message: string;
      safeMeta?: Record<string, unknown>;
      durationMs?: number;
    },
  ) {
    await db.insert(importJobEvents).values({
      importJobId: jobDbId,
      stage: input.stage,
      level: input.level || "info",
      code: input.code ?? null,
      message: input.message,
      safeMeta: input.safeMeta ?? {},
      durationMs: input.durationMs ?? null,
    });
  }

  async getEvents(jobDbId: number) {
    return db
      .select()
      .from(importJobEvents)
      .where(eq(importJobEvents.importJobId, jobDbId))
      .orderBy(desc(importJobEvents.createdAt));
  }

  async cancelJob(jobId: string) {
    const job = await this.getByJobId(jobId);
    if (!job) return null;
    if (["completed", "failed", "cancelled", "completed_with_warning"].includes(job.status)) return job;
    try {
      return await this.transitionJob(job.id, {
        toStatus: "cancelled",
        expectedStatus: job.status,
        expectedVersion: job.version || 1,
        patch: { completedAt: new Date(), progressPercentage: 100 },
        event: { stage: "cancelled", message: "İş kullanıcı tarafından iptal edildi" },
      });
    } catch {
      return job;
    }
  }
}

export const importJobService = new ImportJobService();
