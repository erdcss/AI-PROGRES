import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  approveChange,
  applyChange,
  bulkChangeAction,
  BULK_ACTION_MAX,
  buildChangeApplyDryRun,
  getChangeGroup,
  ignoreChange,
  listAuditLogs,
  listChangeGroups,
  rejectChange,
  retryChangeApply,
  shopifySyncChange,
} from "../services/change-approval.service";
import { trackingService } from "../services/tracking.service";
import { db } from "../db";
import { detectedChanges } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isMissingRelationError } from "../migrations/run-product-tracking-migration";

function parsePositiveInt(value: string): number | null {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function migrationErrorResponse(res: Response, err: unknown) {
  if (isMissingRelationError(err, "detected_changes")) {
    return res.status(503).json({
      success: false,
      error: "Takip tabloları hazır değil — migration çalışmalı",
      code: "migration-config-error",
    });
  }
  return res.status(500).json({ success: false, error: (err as Error).message });
}

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(BULK_ACTION_MAX),
  actor: z.string().optional(),
});

export function registerTrackingApprovalRoutes(app: Express): void {
  app.get("/api/tracking/products/:id/snapshots", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });
      const snapshot = await trackingService.getLatestSnapshot(id);
      return res.json({ success: true, snapshots: snapshot ? [snapshot] : [] });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/products/:id/variants", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });
      const product = await trackingService.getProduct(id);
      if (!product) return res.status(404).json({ success: false, error: "Ürün bulunamadı" });
      const { trackedVariants } = await import("@shared/schema");
      const rows = await db
        .select()
        .from(trackedVariants)
        .where(eq(trackedVariants.trackedProductId, id));
      return res.json({ success: true, variants: rows });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/change-groups", async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const productIdRaw = req.query.productId ? Number(req.query.productId) : undefined;
      const productId =
        productIdRaw !== undefined && Number.isInteger(productIdRaw) && productIdRaw > 0
          ? productIdRaw
          : undefined;
      const groups = await listChangeGroups({ status, productId });
      return res.json({ success: true, groups });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/change-groups/:id", async (req, res) => {
    try {
      const group = await getChangeGroup(req.params.id);
      if (!group) return res.status(404).json({ success: false, error: "Grup bulunamadı" });
      const changes = await db
        .select()
        .from(detectedChanges)
        .where(eq(detectedChanges.changeGroupId, req.params.id));
      return res.json({ success: true, group, changes });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/changes/:id/approve", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });
      const change = await approveChange(id, req.body?.actor);
      return res.json({ success: true, change });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/changes/:id/reject", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });
      const change = await rejectChange(id, req.body?.actor, req.body?.reason);
      return res.json({ success: true, change });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/changes/:id/apply", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });
      const result = await applyChange(id, req.body?.actor, false);
      return res.json({ success: true, ...result });
    } catch (err) {
      const msg = (err as Error).message;
      const code = msg.includes("zaten uygulanmış") ? 409 : 422;
      return res.status(code).json({ success: false, error: msg });
    }
  });

  app.post("/api/tracking/changes/:id/shopify-sync", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });

      const result = await shopifySyncChange(id, req.body?.actor ?? "user");
      return res.json({ success: true, ...result });
    } catch (err) {
      const msg = (err as Error).message;
      const code = msg.includes("zaten uygulanmış") ? 409 : 422;
      return res.status(code).json({ success: false, error: msg });
    }
  });

  app.post("/api/tracking/changes/:id/retry", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });
      const result = await retryChangeApply(id, req.body?.actor);
      return res.json({ success: true, ...result });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/changes/:id/dry-run", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) return res.status(400).json({ success: false, error: "Geçersiz ID" });
      const dryRun = await buildChangeApplyDryRun(id);
      return res.json({ success: true, dryRun });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/bulk/approve", bulkHandler("approve"));
  app.post("/api/tracking/bulk/reject", bulkHandler("reject"));
  app.post("/api/tracking/bulk/ignore", bulkHandler("ignore"));
  app.post("/api/tracking/bulk/apply", bulkHandler("apply"));
  app.post("/api/tracking/bulk/shopify-sync", bulkHandler("shopify-sync"));

  app.get("/api/control-center/audit-logs", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const pageSize = Math.min(100, parseInt(String(req.query.pageSize || "50"), 10) || 50);
      const result = await listAuditLogs(page, pageSize);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: (err as Error).message });
    }
  });
}

function bulkHandler(action: "approve" | "reject" | "ignore" | "apply" | "shopify-sync") {
  return async (req: Request, res: Response) => {
    try {
      const parsed = bulkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.message });
      }
      const results = await bulkChangeAction(parsed.data.ids, action, parsed.data.actor);
      const failed = results.filter((r) => !r.success).length;
      return res.json({
        success: failed === 0,
        results,
        summary: { total: results.length, succeeded: results.length - failed, failed },
      });
    } catch (err) {
      return res.status(422).json({ success: false, error: (err as Error).message });
    }
  };
}
