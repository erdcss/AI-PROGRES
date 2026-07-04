import type { Express, Request, Response } from "express";
import { importJobService } from "../services/import-job.service";
import { getShopifyHealthSnapshot } from "../shopify-credentials";
import { trackingService } from "../services/tracking.service";
import { getTrackingSchedulerStatus } from "../services/tracking.scheduler";
import { getScrapeEnvironmentPolicy } from "../services/scrape-environment.service";
import { resolveChromiumPath } from "../puppeteer-config";
import { verifyControlCenterTables } from "../migrations/run-control-center-migration";
import { pool } from "../db";

export function registerControlCenterRoutes(app: Express): void {
  app.get("/api/control-center/summary", async (_req: Request, res: Response) => {
    try {
      const jobs = await importJobService.listJobs(1, 500);
      const byStatus = (status: string) => jobs.items.filter((j) => j.status === status).length;

      let trackedCount = 0;
      let pendingChanges = 0;
      try {
        const products = await trackingService.listProducts();
        trackedCount = products.length;
        const changes = await trackingService.listChanges({ status: "pending" });
        pendingChanges = changes.length;
      } catch {
        /* tracking disabled */
      }

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
          trackedProducts: trackedCount,
          pendingChanges,
          schedulerRunning: scheduler?.running ?? false,
          lastRunAt: scheduler?.lastRunAt ?? null,
        },
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
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
}
