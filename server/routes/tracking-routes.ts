import type { Express, Request, Response } from "express";
import {
  getTrackingSettings,
  updateTrackingSettings,
} from "../services/tracking-settings.service";
import { trackingService } from "../services/tracking.service";
import {
  runManualProductCheck,
  getTrackingSchedulerStatus,
  getTrackingNotifications,
} from "../services/tracking.scheduler";
import { db } from "../db";
import { detectedChanges } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isMissingRelationError, isMissingColumnError } from "../migrations/run-product-tracking-migration";

function parsePositiveInt(value: string): number | null {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function migrationErrorResponse(res: Response, err: unknown) {
  const msg = (err as Error).message ?? String(err);
  if (isMissingColumnError(err, "tracking_uid") || isMissingColumnError(err, "variant_uid")) {
    return res.status(503).json({
      success: false,
      error: "Veritabanı şeması güncelleniyor — sunucuyu yeniden başlatın",
      code: "schema-patch-required",
    });
  }
  if (isMissingRelationError(err, "tracking_settings")) {
    return res.status(503).json({
      success: false,
      error: "tracking_settings tablosu hazır değil — migration çalışmalı",
      code: "migration-config-error",
    });
  }
  return res.status(500).json({ success: false, error: msg });
}

export function registerTrackingRoutes(app: Express): void {
  app.get("/api/tracking/settings", async (_req, res) => {
    try {
      const settings = await getTrackingSettings();
      return res.json({ success: true, settings });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.put("/api/tracking/settings", async (req, res) => {
    try {
      const settings = await updateTrackingSettings(req.body ?? {});
      return res.json({ success: true, settings });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/products", async (_req, res) => {
    try {
      const products = await trackingService.listProductsForPanel();
      return res.json({ success: true, products });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/changes", async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const productIdRaw = req.query.productId ? Number(req.query.productId) : undefined;
      const productId =
        productIdRaw !== undefined && Number.isInteger(productIdRaw) && productIdRaw > 0
          ? productIdRaw
          : undefined;
      const changeType = typeof req.query.changeType === "string" ? req.query.changeType : undefined;
      const changes = await trackingService.listChangesWithProductForPanel({
        status,
        productId,
        changeType,
      });
      return res.json({ success: true, changes });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/notifications", async (_req, res) => {
    try {
      const data = await getTrackingNotifications();
      return res.json({ success: true, ...data });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/scheduler-status", async (_req, res) => {
    try {
      const status = await getTrackingSchedulerStatus();
      return res.json({ success: true, ...status });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.get("/api/tracking/health", async (_req, res) => {
    try {
      const status = await getTrackingSchedulerStatus();
      return res.json({ success: status.migration.allTablesReady, ...status });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/products/:id/check", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return res.status(400).json({ success: false, error: "Geçersiz ürün ID" });
      }
      const result = await runManualProductCheck(id);
      const statusCode = result.success ? 200 : result.skipped ? 409 : 422;
      return res.status(statusCode).json({ success: result.success !== false, ...result });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/products/:id/enable", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return res.status(400).json({ success: false, error: "Geçersiz ürün ID" });
      }
      const row = await trackingService.setTrackingEnabled(id, true);
      if (!row) return res.status(404).json({ success: false, error: "Ürün bulunamadı" });
      return res.json({ success: true, product: row });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/products/:id/disable", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return res.status(400).json({ success: false, error: "Geçersiz ürün ID" });
      }
      const row = await trackingService.setTrackingEnabled(id, false);
      if (!row) return res.status(404).json({ success: false, error: "Ürün bulunamadı" });
      return res.json({ success: true, product: row });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/changes/:id/mark-seen", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return res.status(400).json({ success: false, error: "Geçersiz değişiklik ID" });
      }
      const [row] = await db
        .update(detectedChanges)
        .set({ seenAt: new Date(), updatedAt: new Date() })
        .where(eq(detectedChanges.id, id))
        .returning();
      if (!row) return res.status(404).json({ success: false, error: "Değişiklik bulunamadı" });
      return res.json({ success: true, change: row });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/changes/:id/ignore", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return res.status(400).json({ success: false, error: "Geçersiz değişiklik ID" });
      }
      const [row] = await db
        .update(detectedChanges)
        .set({ status: "ignored", seenAt: new Date(), updatedAt: new Date() })
        .where(eq(detectedChanges.id, id))
        .returning();
      if (!row) return res.status(404).json({ success: false, error: "Değişiklik bulunamadı" });
      return res.json({ success: true, change: row });
    } catch (err) {
      return migrationErrorResponse(res, err);
    }
  });

  app.post("/api/tracking/cleanup-invalid", async (req, res) => {
    try {
      const result = await trackingService.cleanupInvalidRecords(req.body?.adminSecret);
      return res.json({ success: true, ...result });
    } catch (err) {
      const msg = (err as Error).message;
      const code = msg.includes("Unauthorized") ? 401 : 500;
      return res.status(code).json({ success: false, error: msg });
    }
  });
}
