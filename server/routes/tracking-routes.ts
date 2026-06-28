import type { Express, Request, Response } from "express";
import { isTrackingEnabled } from "@shared/deploy-runtime";
import { trackingService } from "../services/tracking.service";
import { runManualProductCheck, getTrackingSchedulerStatus } from "../services/tracking.scheduler";
import {
  getProductTrackingMigrationStatus,
  refreshProductTrackingTableStatus,
} from "../migrations/run-product-tracking-migration";

function trackingDisabled(res: Response) {
  return res.status(503).json({
    success: false,
    error: "Ürün takip modülü kapalı (TRACKING_ENABLED=false)",
  });
}

export function registerTrackingRoutes(app: Express): void {
  app.get("/api/tracking/products", async (_req, res) => {
    try {
      if (!isTrackingEnabled()) return trackingDisabled(res);
      const products = await trackingService.listProducts();
      return res.json({ success: true, products });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.get("/api/tracking/changes", async (req, res) => {
    try {
      if (!isTrackingEnabled()) return trackingDisabled(res);
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      const changeType = typeof req.query.changeType === "string" ? req.query.changeType : undefined;
      const changes = await trackingService.listChanges({ status, productId, changeType });
      return res.json({ success: true, changes });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.get("/api/tracking/scheduler-status", async (_req, res) => {
    const migration = await refreshProductTrackingTableStatus().catch(() =>
      getProductTrackingMigrationStatus(),
    );
    return res.json({
      success: true,
      ...getTrackingSchedulerStatus(),
      trackingEnabled: isTrackingEnabled(),
      migration: {
        applied: migration.applied,
        sqlSource: migration.sqlSource,
        sqlPath: migration.sqlPath,
        allTablesReady: migration.allTablesReady,
        tables: migration.tables,
        error: migration.error,
      },
    });
  });

  app.get("/api/tracking/health", async (_req, res) => {
    const migration = await refreshProductTrackingTableStatus().catch(() =>
      getProductTrackingMigrationStatus(),
    );
    return res.json({
      success: migration.allTablesReady,
      trackingEnabled: isTrackingEnabled(),
      migration,
      scheduler: getTrackingSchedulerStatus(),
    });
  });

  app.post("/api/tracking/products/:id/check", async (req, res) => {
    try {
      if (!isTrackingEnabled()) return trackingDisabled(res);
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: "Geçersiz ürün ID" });
      }
      const result = await runManualProductCheck(id);
      const statusCode = result.success ? 200 : result.skipped ? 409 : 422;
      return res.status(statusCode).json({ success: result.success !== false, ...result });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.post("/api/tracking/products/:id/enable", async (req, res) => {
    try {
      if (!isTrackingEnabled()) return trackingDisabled(res);
      const id = Number(req.params.id);
      const row = await trackingService.setTrackingEnabled(id, true);
      if (!row) return res.status(404).json({ success: false, error: "Ürün bulunamadı" });
      return res.json({ success: true, product: row });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.post("/api/tracking/products/:id/disable", async (req, res) => {
    try {
      if (!isTrackingEnabled()) return trackingDisabled(res);
      const id = Number(req.params.id);
      const row = await trackingService.setTrackingEnabled(id, false);
      if (!row) return res.status(404).json({ success: false, error: "Ürün bulunamadı" });
      return res.json({ success: true, product: row });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.post("/api/tracking/cleanup-invalid", async (req, res) => {
    try {
      if (!isTrackingEnabled()) return trackingDisabled(res);
      const result = await trackingService.cleanupInvalidRecords(req.body?.adminSecret);
      return res.json({ success: true, ...result });
    } catch (err) {
      const msg = (err as Error).message;
      const code = msg.includes("Unauthorized") ? 401 : 500;
      return res.status(code).json({ success: false, error: msg });
    }
  });
}
