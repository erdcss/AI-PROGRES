import type { Express, Request, Response } from "express";

import { z } from "zod";

import { importJobService } from "../services/import-job.service";

import {

  runImportJobPipeline,

  executeShopifyAndTracking,

  retryTrackingRegistration,

  isRunnerActive,

} from "../services/import-job-runner.service";

import { normalizeScrapeToCanonicalProduct } from "../services/canonical-product-normalizer.service";

import { qualityBlocksShopifyUpload } from "../services/quality-gate.service";

import { runShopifyDryRun, hashCanonicalProduct, hashShopifySnapshot, buildShopifySnapshotForHash } from "../services/shopify-dry-run.service";

import { InvalidJobTransitionError } from "@shared/import-job-state-machine";

import { isTrackingOnlyRetry } from "@shared/import-job-state-machine";



const createJobSchema = z.object({

  sourceUrl: z.string().url(),

  sourcePlatform: z.string().default("trendyol"),

  scrapeMode: z.string().default("auto"),

  profitRuleId: z.number().nullable().optional(),

  uploadMode: z.enum(["manual_approval", "auto_approve", "scrape_only"]).default("manual_approval"),

  requestedBy: z.string().optional(),

});



function jobToResponse(job: Awaited<ReturnType<typeof importJobService.getByJobId>>) {

  if (!job) return null;

  const canonical = job.canonicalProduct as Record<string, unknown> | null;

  const quality = job.qualityResult as { score?: number; status?: string } | null;

  const shopify = job.shopifyResult as { productId?: string; type?: string } | null;

  const tracking = job.trackingResult as { success?: boolean } | null;

  const variants = (canonical?.variants as unknown[]) || [];



  return {

    jobId: job.jobId,

    sourceUrl: job.sourceUrl,

    sourcePlatform: job.sourcePlatform,

    sourceProductId: job.sourceProductId,

    status: job.status,

    currentStage: job.currentStage,

    progressPercentage: job.progressPercentage,

    scrapeMode: job.scrapeMode,

    uploadMode: job.uploadMode,

    version: job.version,

    canonicalProduct: job.canonicalProduct,

    qualityResult: job.qualityResult,

    shopifyResult: job.shopifyResult,

    trackingResult: job.trackingResult,

    qualityScore: quality?.score ?? null,

    qualityStatus: quality?.status ?? null,

    variantCount: variants.length,

    imageCount: Array.isArray(canonical?.images) ? canonical.images.length : 0,

    shopifyProductId: shopify?.productId ?? null,

    trackingRegistered: tracking?.success === true,

    errorCode: job.errorCode,

    errorMessage: job.errorMessage,

    retryCount: job.retryCount,

    startedAt: job.startedAt?.toISOString() ?? null,

    completedAt: job.completedAt?.toISOString() ?? null,

    createdAt: job.createdAt.toISOString(),

    updatedAt: job.updatedAt.toISOString(),

  };

}



function transitionError(res: Response, err: unknown) {

  if (err instanceof InvalidJobTransitionError) {

    return res.status(409).json({ success: false, code: err.code, message: err.message });

  }

  return res.status(500).json({ success: false, message: (err as Error).message });

}



export function registerImportJobRoutes(app: Express): void {

  app.post("/api/import-jobs", async (req: Request, res: Response) => {

    try {

      const body = createJobSchema.parse(req.body);

      const job = await importJobService.createJob({

        ...body,

        requestId: String(req.headers["x-request-id"] || ""),

      });

      void runImportJobPipeline(job.jobId);

      res.json({ success: true, jobId: job.jobId, status: "queued" });

    } catch (err) {

      if (err instanceof z.ZodError) {

        return res.status(400).json({ success: false, message: err.errors[0]?.message });

      }

      res.status(500).json({ success: false, message: (err as Error).message });

    }

  });



  app.get("/api/import-jobs", async (req: Request, res: Response) => {

    try {

      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);

      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10) || 20));

      const status = req.query.status ? String(req.query.status) : undefined;

      const result = await importJobService.listJobs(page, pageSize, status);

      res.json({

        ...result,

        items: result.items.map((j) => jobToResponse(j)),

      });

    } catch (err) {

      res.status(500).json({ success: false, message: (err as Error).message });

    }

  });



  app.get("/api/import-jobs/:jobId", async (req: Request, res: Response) => {

    const job = await importJobService.getByJobId(req.params.jobId);

    if (!job) {

      return res.status(404).json({ success: false, message: "job not found; server may have restarted" });

    }

    const events = await importJobService.getEvents(job.id);

    res.json({

      success: true,

      job: jobToResponse(job),

      runnerActive: isRunnerActive(job.jobId),

      events: events.map((e) => ({

        stage: e.stage,

        level: e.level,

        code: e.code,

        message: e.message,

        safeMeta: e.safeMeta,

        durationMs: e.durationMs,

        createdAt: e.createdAt.toISOString(),

      })),

    });

  });



  app.post("/api/import-jobs/:jobId/cancel", async (req: Request, res: Response) => {

    const job = await importJobService.cancelJob(req.params.jobId);

    if (!job) return res.status(404).json({ success: false, message: "İş bulunamadı" });

    res.json({ success: true, job: jobToResponse(job) });

  });



  app.post("/api/import-jobs/:jobId/retry", async (req: Request, res: Response) => {

    const job = await importJobService.getByJobId(req.params.jobId);

    if (!job) return res.status(404).json({ success: false, message: "İş bulunamadı" });



    if (isTrackingOnlyRetry(job.status, job.errorCode)) {

      void retryTrackingRegistration(job.id, job.jobId);

      return res.json({ success: true, jobId: job.jobId, status: "registering_tracking", mode: "tracking_only" });

    }



    try {

      await importJobService.transitionJob(job.id, {

        toStatus: "queued",

        expectedStatus: job.status,

        expectedVersion: job.version || 1,

        patch: {

          progressPercentage: 0,

          errorCode: null,

          errorMessage: null,

          retryCount: (job.retryCount || 0) + 1,

        },

        event: { stage: "queued", message: "İş yeniden kuyruğa alındı" },

      });

      void runImportJobPipeline(job.jobId);

      res.json({ success: true, jobId: job.jobId, status: "queued", mode: "full" });

    } catch (err) {

      return transitionError(res, err);

    }

  });



  app.post("/api/import-jobs/:jobId/approve", async (req: Request, res: Response) => {

    const job = await importJobService.getByJobId(req.params.jobId);

    if (!job) return res.status(404).json({ success: false, message: "İş bulunamadı" });

    const canonical = job.canonicalProduct as ReturnType<typeof normalizeScrapeToCanonicalProduct>;

    if (!canonical?.quality || qualityBlocksShopifyUpload(canonical.quality)) {

      return res.status(400).json({ success: false, message: "Kalite engeli — onay verilemez" });

    }

    try {

      await importJobService.transitionJob(job.id, {

        toStatus: "approved",

        expectedStatus: "awaiting_approval",

        expectedVersion: job.version || 1,

        actor: String(req.body?.actor || "user"),

        event: { stage: "approved", message: "İçe aktarma onaylandı" },

      });

      res.json({ success: true, status: "approved", message: "Onaylandı — dry-run veya upload için hazır" });

    } catch (err) {

      return transitionError(res, err);

    }

  });



  app.post("/api/import-jobs/:jobId/dry-run", async (req: Request, res: Response) => {

    const job = await importJobService.getByJobId(req.params.jobId);

    if (!job) return res.status(404).json({ success: false, message: "İş bulunamadı" });

    const canonical = job.canonicalProduct as ReturnType<typeof normalizeScrapeToCanonicalProduct>;

    if (!canonical) {

      return res.status(400).json({ success: false, message: "Canonical ürün verisi yok" });

    }

    try {

      const { buildCanonicalProductForShopify } = await import("../variant-shape-normalizer");

      const shopifyCanonical = buildCanonicalProductForShopify({

        scrapeResult: canonical as unknown as Record<string, unknown>,

        sourceUrl: job.sourceUrl,

      });

      if (!shopifyCanonical) {

        return res.status(400).json({ success: false, message: "Shopify canonical oluşturulamadı" });

      }



      const result = await runShopifyDryRun(canonical, shopifyCanonical);

      const { findExistingShopifyProduct } = await import("../shopify-upsert-service");

      const existing = await findExistingShopifyProduct({

        sourceProductId: canonical.sourceProductId || "",

        handle: shopifyCanonical?.handle || "",

        skuPrefix: `TY-${canonical.sourceProductId || "unknown"}`,

      });

      const canonicalHash = hashCanonicalProduct(canonical);

      const shopifySnapshotHash = hashShopifySnapshot(buildShopifySnapshotForHash(existing));

      const stored = {

        type: "dry_run",

        generatedAt: new Date().toISOString(),

        canonicalHash,

        shopifySnapshotHash,

        result,

      };



      if (job.status === "approved" || job.status === "awaiting_approval") {

        try {

          await importJobService.transitionJob(job.id, {

            toStatus: "dry_run_ready",

            expectedStatus: job.status,

            expectedVersion: job.version || 1,

            patch: { shopifyResult: stored },

            event: { stage: "dry_run_ready", message: "Dry-run tamamlandı", safeMeta: { mode: result.mode } },

          });

        } catch {

          await importJobService.updateStatus(job.id, { shopifyResult: stored });

        }

      } else {

        await importJobService.updateStatus(job.id, { shopifyResult: stored });

      }



      res.json({ success: true, ...stored });

    } catch (err) {

      res.status(500).json({ success: false, message: (err as Error).message });

    }

  });



  app.post("/api/import-jobs/:jobId/upload", async (req: Request, res: Response) => {

    const job = await importJobService.getByJobId(req.params.jobId);

    if (!job) return res.status(404).json({ success: false, message: "İş bulunamadı" });



    const idempotencyKey = String(req.body?.idempotencyKey || req.headers["idempotency-key"] || "");

    if (!idempotencyKey) {

      return res.status(400).json({ success: false, message: "idempotencyKey zorunlu" });

    }



    if (job.idempotencyKey && job.idempotencyKey === idempotencyKey) {

      return res.json({ success: true, message: "İş zaten uygulandı", job: jobToResponse(job) });

    }



    if (!["approved", "dry_run_ready"].includes(job.status)) {

      return res.status(409).json({ success: false, message: "İş onaylı veya dry-run hazır durumda değil" });

    }



    const canonical = job.canonicalProduct as ReturnType<typeof normalizeScrapeToCanonicalProduct>;

    if (!canonical?.quality || qualityBlocksShopifyUpload(canonical.quality)) {

      return res.status(400).json({ success: false, message: "Kalite engeli — aktarım yapılamaz" });

    }



    const dryRun = job.shopifyResult as {

      type?: string;

      canonicalHash?: string;

      result?: { safeToApply?: boolean };

    } | null;

    if (!dryRun || dryRun.type !== "dry_run" || !dryRun.result?.safeToApply) {

      return res.status(400).json({ success: false, message: "Geçerli dry-run yok veya safeToApply=false" });

    }



    const currentHash = hashCanonicalProduct(canonical);

    if (dryRun.canonicalHash && dryRun.canonicalHash !== currentHash) {

      return res.status(409).json({ success: false, message: "Canonical değişti — dry-run yenilenmeli" });

    }



    await importJobService.updateStatus(job.id, { idempotencyKey });

    const scrapeResult = (canonical as unknown as Record<string, unknown>) || {};
    void executeShopifyAndTracking(job.id, job.jobId, canonical, scrapeResult).catch((err) => {
      console.error("Upload hatası:", err);
    });

    res.json({ success: true, message: "Shopify aktarımı başlatıldı", jobId: job.jobId });

  });

}

