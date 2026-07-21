import { importJobService } from "./import-job.service";
import { normalizeScrapeToCanonicalProduct } from "./canonical-product-normalizer.service";
import {
  evaluateProductQuality,
  qualityBlocksShopifyUpload,
  extractExpectedProductId,
} from "./quality-gate.service";
import { writeAuditLog } from "./import-job.service";
import type { ImportJobStatus } from "@shared/import-job-types";
import { isTrackingOnlyRetry } from "@shared/import-job-state-machine";

const activeRunners = new Set<string>();

async function isJobCancelled(jobDbId: number): Promise<boolean> {
  const { db } = await import("../db");
  const { importJobs } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(importJobs).where(eq(importJobs.id, jobDbId)).limit(1);
  return rows[0]?.status === "cancelled";
}

export async function runImportJobPipeline(jobId: string): Promise<void> {
  if (activeRunners.has(jobId)) return;
  activeRunners.add(jobId);

  let job = await importJobService.getByJobId(jobId);
  if (!job) {
    activeRunners.delete(jobId);
    return;
  }

  if (isTrackingOnlyRetry(job.status, job.errorCode)) {
    await retryTrackingRegistration(job.id, jobId);
    activeRunners.delete(jobId);
    return;
  }

  if (["scraping", "normalizing", "validating"].includes(job.status)) {
    await importJobService.updateStatus(job.id, {
      status: "queued",
      currentStage: "queued",
      progressPercentage: 0,
    });
    job = (await importJobService.getByJobId(jobId))!;
  }

  const startMs = Date.now();
  try {
    if (await isJobCancelled(job.id)) return;

    job = (await importJobService.getByJobId(jobId))!;
    if (!job || job.status === "cancelled") return;

    await importJobService.transitionJob(job.id, {
      toStatus: "scraping",
      expectedStatus: "queued",
      expectedVersion: job.version || 1,
      patch: { progressPercentage: 10, startedAt: job.startedAt ?? new Date() },
      event: { stage: "scraping", message: "Trendyol ürün verisi çekiliyor" },
    });

    const { runTrendyolScrapePipeline } = await import("./../trendyol-scrape-pipeline");
    const pipeline = await runTrendyolScrapePipeline(job.sourceUrl, job.scrapeMode || "auto-fast");
    const scrapeResult = {
      ...(pipeline.result || {}),
      stageErrors: pipeline.diagnostics?.stageErrors,
      pipelineDurationMs: pipeline.diagnostics?.pipelineDurationMs,
      partialSuccess: pipeline.partialSuccess,
    };

    if (await isJobCancelled(job.id)) return;

    await importJobService.transitionJob(job.id, {
      toStatus: "normalizing",
      expectedStatus: "scraping",
      patch: { progressPercentage: 45 },
      event: {
        stage: "normalizing",
        message: "Canonical ürün modeline dönüştürülüyor",
        safeMeta: { durationMs: Date.now() - startMs },
      },
    });

    const canonical = normalizeScrapeToCanonicalProduct(
      scrapeResult,
      job.sourceUrl,
      job.sourcePlatform,
    );

    await importJobService.updateStatus(job.id, {
      canonicalProduct: canonical,
      sourceProductId: canonical.sourceProductId,
      progressPercentage: 55,
    });

    if (await isJobCancelled(job.id)) return;

    await importJobService.transitionJob(job.id, {
      toStatus: "validating",
      expectedStatus: "normalizing",
      patch: { progressPercentage: 60 },
      event: { stage: "validating", message: "Kalite kontrolü başlıyor" },
    });

    const quality = evaluateProductQuality(
      canonical,
      extractExpectedProductId(job.sourceUrl),
    );
    canonical.quality = quality;

    await importJobService.updateStatus(job.id, {
      qualityResult: quality,
      progressPercentage: 70,
    });
    await importJobService.appendEvent(job.id, {
      stage: "validating",
      message: `Kalite kontrolü: ${quality.status} (skor ${quality.score})`,
      safeMeta: {
        score: quality.score,
        status: quality.status,
        reasons: quality.reasons,
        warnings: quality.warnings,
      },
    });

    if (qualityBlocksShopifyUpload(quality)) {
      await importJobService.transitionJob(job.id, {
        toStatus: "failed",
        expectedStatus: "validating",
        patch: {
          progressPercentage: 100,
          errorCode: "quality_blocked",
          errorMessage: quality.reasons.join(", ") || "Kalite kontrolü başarısız",
          completedAt: new Date(),
        },
        event: {
          stage: "failed",
          code: "quality_blocked",
          message: "Ürün kalite eşiğinin altında — Shopify aktarımı engellendi",
        },
      });
      return;
    }

    const uploadMode = job.uploadMode || "manual_approval";
    if (uploadMode === "manual_approval" || uploadMode === "scrape_only") {
      await importJobService.transitionJob(job.id, {
        toStatus: "awaiting_approval",
        expectedStatus: "validating",
        patch: { progressPercentage: 80 },
        event: { stage: "awaiting_approval", message: "Manuel onay bekleniyor" },
      });
      return;
    }

    await executeShopifyAndTracking(job.id, jobId, canonical, scrapeResult);
  } catch (err) {
    const message = (err as Error).message || "Bilinmeyen hata";
    const current = await importJobService.getByJobId(jobId);
    if (current && current.status !== "cancelled") {
      try {
        await importJobService.transitionJob(job.id, {
          toStatus: "failed",
          expectedStatus: current.status,
          patch: {
            progressPercentage: 100,
            errorCode: "pipeline_error",
            errorMessage: message.slice(0, 500),
            completedAt: new Date(),
          },
          event: {
            stage: "failed",
            code: "pipeline_error",
            message: message.slice(0, 200),
          },
        });
      } catch {
        await importJobService.updateStatus(job.id, {
          status: "failed",
          errorMessage: message.slice(0, 500),
          completedAt: new Date(),
        });
      }
    }
  } finally {
    activeRunners.delete(jobId);
  }
}

export async function registerTrackingFromUpsert(
  canonical: ReturnType<typeof normalizeScrapeToCanonicalProduct>,
  upsert: {
    productId?: string;
    handle?: string;
    productGid?: string;
    variantMappings?: Array<{
      sku: string;
      option1?: string;
      option2?: string;
      shopifyVariantId: string;
      inventoryItemId?: string;
    }>;
  },
) {
  const { trackingService } = await import("./tracking.service");
  const mappingBySku = new Map((upsert.variantMappings || []).map((m) => [m.sku, m]));

  await trackingService.registerFromShopifyUpload({
    sourceUrl: canonical.sourceUrl,
    title: canonical.title,
    price: canonical.originalPrice || 0,
    shopifyProductId: upsert.productId || "",
    shopifyHandle: upsert.handle,
    shopifyProductGid: upsert.productGid,
    variants: canonical.variants.map((v) => {
      const mapped = mappingBySku.get(v.sku || "");
      return {
        option1Name: v.option1Name,
        option1Value: v.option1Value,
        option2Name: v.option2Name,
        option2Value: v.option2Value,
        sku: v.sku ?? undefined,
        shopifyVariantId: mapped?.shopifyVariantId,
        price: v.sourcePrice ?? v.price ?? undefined,
        inStock: v.available !== false,
      };
    }),
  });
}

export async function retryTrackingRegistration(jobDbId: number, jobId: string): Promise<void> {
  const job = await importJobService.getByJobId(jobId);
  if (!job) return;
  const shopify = job.shopifyResult as {
    productId?: string;
    handle?: string;
    variantMappings?: unknown[];
  } | null;
  const canonical = job.canonicalProduct as ReturnType<typeof normalizeScrapeToCanonicalProduct>;
  if (!shopify?.productId || !canonical) {
    throw new Error("Tracking retry için Shopify sonucu veya canonical eksik");
  }

  await importJobService.transitionJob(jobDbId, {
    toStatus: "registering_tracking",
    expectedStatus: job.status,
    patch: { progressPercentage: 96 },
    event: { stage: "registering_tracking", message: "Takip kaydı yeniden deneniyor" },
  });

  try {
    await registerTrackingFromUpsert(canonical, shopify);
    await importJobService.transitionJob(jobDbId, {
      toStatus: "completed",
      expectedStatus: "registering_tracking",
      patch: {
        progressPercentage: 100,
        completedAt: new Date(),
        trackingResult: { success: true },
        errorCode: null,
        errorMessage: null,
      },
      event: { stage: "completed", message: "Takip kaydı tamamlandı" },
    });
  } catch (err) {
    await importJobService.transitionJob(jobDbId, {
      toStatus: "completed_with_warning",
      expectedStatus: "registering_tracking",
      patch: {
        progressPercentage: 100,
        trackingResult: { success: false, error: (err as Error).message },
        errorCode: "tracking_registration_failed",
        errorMessage: `Takip kaydı başarısız: ${(err as Error).message}`,
      },
      event: { stage: "completed_with_warning", message: "Takip kaydı başarısız" },
    });
  }
}

export async function executeShopifyAndTracking(
  jobDbId: number,
  jobId: string,
  canonical: ReturnType<typeof normalizeScrapeToCanonicalProduct>,
  scrapeResult: Record<string, unknown>,
) {
  const locked = await importJobService.acquireJobLock(jobDbId, `upload:${jobId}`);
  if (!locked) {
    throw new Error("İş başka bir işlem tarafından kilitli");
  }

  try {
    const job = await importJobService.getByJobId(jobId);
    if (!job) throw new Error("İş bulunamadı");

    await importJobService.transitionJob(jobDbId, {
      toStatus: "uploading_to_shopify",
      expectedStatus: job.status,
      patch: { progressPercentage: 85 },
      event: { stage: "uploading_to_shopify", message: "Shopify aktarımı başlıyor" },
    });

    const { buildScrapeCsvContent } = await import("../scrape-csv-builder");
    const csvOutcome = await buildScrapeCsvContent(scrapeResult, canonical.sourceUrl);
    const csvContent = csvOutcome.csvContent;
    const { buildCanonicalProductForShopify, validateCanonicalForShopifyUpload } = await import(
      "../variant-shape-normalizer"
    );
    const shopifyCanonical = buildCanonicalProductForShopify({
      scrapeResult,
      sourceUrl: canonical.sourceUrl,
    });

    if (!shopifyCanonical) {
      throw new Error("Shopify canonical ürün oluşturulamadı");
    }

    const gate = validateCanonicalForShopifyUpload(shopifyCanonical);
    if (!gate.ok) {
      throw new Error(gate.error || "Shopify doğrulama başarısız");
    }

    const { upsertProductFromSource } = await import("../shopify-upsert-service");
    const upsert = await upsertProductFromSource(csvContent || "", shopifyCanonical);

    await importJobService.updateStatus(jobDbId, {
      shopifyResult: upsert,
      progressPercentage: 92,
    });

    if (!upsert.success) {
      throw new Error(upsert.message || "Shopify upsert başarısız");
    }

    const partialVariantFailure =
      (upsert.createdVariants ?? 0) + (upsert.updatedVariants ?? 0) < shopifyCanonical.variants.length;

    await importJobService.transitionJob(jobDbId, {
      toStatus: "registering_tracking",
      expectedStatus: "uploading_to_shopify",
      patch: { progressPercentage: 96 },
      event: { stage: "registering_tracking", message: "Takip kaydı oluşturuluyor" },
    });

    let trackingOk = true;
    let trackingError: string | null = null;
    try {
      await registerTrackingFromUpsert(canonical, upsert);
      await importJobService.updateStatus(jobDbId, {
        trackingResult: { success: true },
      });
    } catch (err) {
      trackingOk = false;
      trackingError = (err as Error).message;
      await importJobService.updateStatus(jobDbId, {
        trackingResult: { success: false, error: trackingError },
      });
    }

    let finalStatus: ImportJobStatus = "completed";
    if (!trackingOk) finalStatus = "completed_with_warning";
    else if (partialVariantFailure) finalStatus = "completed_with_warning";

    await importJobService.transitionJob(jobDbId, {
      toStatus: finalStatus,
      expectedStatus: "registering_tracking",
      patch: {
        progressPercentage: 100,
        completedAt: new Date(),
        errorMessage: trackingOk
          ? partialVariantFailure
            ? "Bazı varyantlar senkronize edilemedi"
            : null
          : `Takip kaydı başarısız: ${trackingError}`,
        errorCode: trackingOk
          ? partialVariantFailure
            ? "partial_variant_sync"
            : null
          : "tracking_registration_failed",
      },
      event: { stage: finalStatus, message: `İş tamamlandı: ${finalStatus}` },
    });

    await writeAuditLog({
      action: "import_job_completed",
      entityType: "import_job",
      entityId: jobId,
      newValue: {
        status: finalStatus,
        shopifyProductId: upsert.productId,
        trackingOk,
      },
    });
  } finally {
    await importJobService.releaseJobLock(jobDbId);
  }
}

export async function resumePendingImportJobs(): Promise<void> {
  try {
    const { db } = await import("../db");
    const { importJobs } = await import("@shared/schema");
    const { inArray } = await import("drizzle-orm");
    const pending = await db
      .select()
      .from(importJobs)
      .where(
        inArray(importJobs.status, [
          "queued",
          "scraping",
          "normalizing",
          "validating",
          "approved",
          "dry_run_ready",
          "uploading_to_shopify",
          "registering_tracking",
        ]),
      );

    for (const job of pending) {
      console.log(`🔄 Import job devam ettiriliyor: ${job.jobId} (${job.status})`);
      void runImportJobPipeline(job.jobId);
    }
  } catch (err) {
    console.warn("⚠️ Import job resume atlandı:", (err as Error).message);
  }
}

export function isRunnerActive(jobId: string): boolean {
  return activeRunners.has(jobId);
}
