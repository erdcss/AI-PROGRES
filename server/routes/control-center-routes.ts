import type { Express, Request, Response } from "express";
import { importJobService } from "../services/import-job.service";
import { getShopifyHealthSnapshot } from "../shopify-credentials";
import { trackingService } from "../services/tracking.service";
import { getTrackingSchedulerStatus } from "../services/tracking.scheduler";
import { getScrapeEnvironmentPolicy } from "../services/scrape-environment.service";
import { resolveChromiumPath } from "../puppeteer-config";
import { verifyControlCenterTables } from "../migrations/run-control-center-migration";
import { syncShopifyDeletedProducts } from "../services/shopify-deleted-sync.service";
import { pool } from "../db";

export function registerControlCenterRoutes(app: Express): void {
  app.get("/api/control-center/summary", async (_req: Request, res: Response) => {
    try {
      const jobs = await importJobService.listJobs(1, 500);
      const byStatus = (status: string) => jobs.items.filter((j) => j.status === status).length;

      const scheduler = await getTrackingSchedulerStatus().catch(() => null);

      res.json({
        importJobs: {
          queued: byStatus("queued"),
          running: jobs.items.filter((j) =>
            ["scraping", "normalizing", "validating", "uploading_to_shopify", "registering_tracking"].includes(
              j.status,
            ),
          ).length,
          awaitingApproval: byStatus("awaiting_approval"),
          failed: byStatus("failed"),
          completed: byStatus("completed") + byStatus("completed_with_warning"),
        },
        tracking: {
          trackedProducts: scheduler?.trackedProductsCount ?? 0,
          activeTrackedProducts: scheduler?.activeTrackedProductsCount ?? 0,
          pendingChanges: scheduler?.pendingChangesCount ?? 0,
          manualReview: scheduler?.manualReviewCount ?? 0,
          schedulerRunning: scheduler?.safeSchedulerRunning ?? false,
          schedulerEnabled: scheduler?.schedulerEnabled ?? false,
          trackingEnabled: scheduler?.trackingEnabled ?? false,
          lastRunAt: scheduler?.lastRunAt ?? null,
          nextRunAt: scheduler?.nextRunAt ?? null,
        },
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/control-center/tracking/products", async (_req: Request, res: Response) => {
    try {
      const products = await trackingService.listProductsForPanel();
      const pendingByProduct = new Map<number, number>();

      const pendingChanges = await trackingService.listChangesForPanel({ status: "pending" });
      for (const change of pendingChanges) {
        pendingByProduct.set(
          change.trackedProductId,
          (pendingByProduct.get(change.trackedProductId) ?? 0) + 1,
        );
      }

      const items = products
        .map((p) => ({
          ...p,
          pendingChangeCount: pendingByProduct.get(p.id) ?? 0,
        }))
        .sort((a, b) => {
          if (b.pendingChangeCount !== a.pendingChangeCount) {
            return b.pendingChangeCount - a.pendingChangeCount;
          }
          const aChecked = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
          const bChecked = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
          return bChecked - aChecked;
        });

      res.json({ success: true, products: items, total: items.length });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.get("/api/control-center/tracking/changes", async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "pending";
      const changes = await trackingService.listChangesWithProductForPanel({ status });
      res.json({ success: true, changes, total: changes.length });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.get("/api/control-center/health", async (_req: Request, res: Response) => {
    const policy = getScrapeEnvironmentPolicy();
    const chromium = resolveChromiumPath();
    const tables = await verifyControlCenterTables();

    let shopify = { ok: false as boolean };
    try {
      shopify = await getShopifyHealthSnapshot();
    } catch {
      shopify = { ok: false };
    }

    const scheduler = await getTrackingSchedulerStatus().catch(() => null);

    res.json({
      database: {
        status: pool ? "healthy" : "offline",
        importJobsTable: tables.import_jobs ?? false,
      },
      trendyol: {
        api: policy.isCloud ? "enabled" : "local",
        directHtml: "enabled",
        puppeteer: {
          status: chromium.exists ? "healthy" : "offline",
          source: chromium.source,
        },
      },
      shopify: {
        status: shopify.ok ? "healthy" : "degraded",
        ...shopify,
      },
      tracking: {
        status: policy.isCloud ? "cloud" : "local",
        schedulerRunning: scheduler?.safeSchedulerRunning ?? false,
        pendingChanges: scheduler?.pendingChangesCount ?? 0,
      },
    });
  });

  app.get("/api/control-center/jobs", async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10) || 20));
    const status = req.query.status ? String(req.query.status) : undefined;
    const result = await importJobService.listJobs(page, pageSize, status);
    res.json(result);
  });

  app.get("/api/control-center/activity", async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "50"), 10) || 50));
    const result = await importJobService.listJobs(page, pageSize);
    res.json({
      items: result.items.map((j) => ({
        type: "import_job",
        id: j.jobId,
        status: j.status,
        message: j.currentStage,
        createdAt: j.createdAt,
      })),
      page,
      pageSize,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  app.get("/api/control-center/logs", async (req: Request, res: Response) => {
    const jobId = String(req.query.jobId || "");
    if (!jobId) return res.status(400).json({ message: "jobId gerekli" });
    const job = await importJobService.getByJobId(jobId);
    if (!job) return res.status(404).json({ message: "İş bulunamadı" });
    const events = await importJobService.getEvents(job.id);
    res.json({ items: events, total: events.length });
  });

  app.post("/api/control-center/shopify/sync-deleted", async (_req: Request, res: Response) => {
    try {
      const result = await syncShopifyDeletedProducts();
      if (!result.success) {
        return res.status(422).json({ success: false, ...result });
      }
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });
}
