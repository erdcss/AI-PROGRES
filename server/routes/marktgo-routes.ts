import type { Express } from "express";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import {
  ensureMarktGoConnectionFromEnv,
  listMarktGoConnections,
  migrateMisplacedMarktGoTokenFromShopify,
  saveMarktGoConnection,
  testMarktGoConnection,
} from "../services/marktgo/connection.service";
import { syncProductToMarktGo } from "../services/marktgo/sync.service";
import { mapPoolProductToMarktGoInput } from "../services/marktgo/pool-map";
import { userMessageForMarktGoError } from "../services/marktgo/errors";
import { runMarktGoMigration } from "../migrations/run-marktgo-migration";

const MARKTGO_CONNECTION_READY_TTL_MS = 30_000;
let marktGoConnectionReadyAt = 0;
let marktGoConnectionPromise: Promise<void> | null = null;

async function ensureRuntimeMarktGoConnection(): Promise<void> {
  if (Date.now() - marktGoConnectionReadyAt < MARKTGO_CONNECTION_READY_TTL_MS) return;
  if (marktGoConnectionPromise) return marktGoConnectionPromise;

  marktGoConnectionPromise = (async () => {
    try {
      await ensureMarktGoConnectionFromEnv();
      marktGoConnectionReadyAt = Date.now();
    } catch (err) {
      console.warn(
        "[marktgo] env bağlantısı hazırlanamadı:",
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    } finally {
      marktGoConnectionPromise = null;
    }
  })();

  return marktGoConnectionPromise;
}

function normalizeTrendyolPoolIdentity(product: Record<string, unknown>): Record<string, unknown> {
  const sourceUrl = String(product.sourceUrl || product.originalUrl || "").trim();
  const productId = (sourceUrl.match(/-p-(\d{5,})(?:[/?#&]|$)/i) || [])[1] || "";
  if (!productId) return product;
  return {
    ...product,
    poolId: `trendyol_${productId}`,
    id: `trendyol_${productId}`,
    sourceUrl,
  };
}

function isRetryableMarktGoError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const row = err as Record<string, unknown>;
  if (row.retryable === true) return true;
  const status = Number(row.status || 0);
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return true;
  const message = String(row.message || "").toLowerCase();
  return /timeout|timed out|network|fetch failed|socket|econnreset|econnrefused|rate limit|too many requests|temporar/.test(message);
}

async function syncProductToMarktGoWithRetry(input: any, connectionId?: number) {
  const delays = [0, 350, 900];
  let lastError: unknown;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
    try {
      return await syncProductToMarktGo(input, connectionId);
    } catch (err) {
      lastError = err;
      if (!isRetryableMarktGoError(err) || attempt === delays.length - 1) throw err;
      console.warn(
        `[marktgo] geçici hata, kontrollü retry ${attempt + 1}/${delays.length - 1}:`,
        userMessageForMarktGoError(err),
      );
    }
  }
  throw lastError;
}

export function registerMarktGoRoutes(app: Express): void {
  void runMarktGoMigration(false);
  void migrateMisplacedMarktGoTokenFromShopify()
    .then(() => ensureRuntimeMarktGoConnection())
    .catch(() => undefined);

  app.get("/api/marktgo/connections", async (_req, res) => {
    try {
      await ensureRuntimeMarktGoConnection();
      const connections = await listMarktGoConnections();
      return res.json({ success: true, provider: DESTINATION_PROVIDER.MARKTGO, connections });
    } catch (err) {
      return res.status(500).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });

  app.post("/api/marktgo/connections", async (req, res) => {
    try {
      const saved = await saveMarktGoConnection({
        id: req.body?.id ? Number(req.body.id) : undefined,
        name: req.body?.name,
        apiBaseUrl: String(req.body?.apiBaseUrl || ""),
        accessToken: req.body?.accessToken,
        environment: req.body?.environment,
        webhookUrl: req.body?.webhookUrl,
      });
      marktGoConnectionReadyAt = 0;
      return res.json({ success: true, connection: saved });
    } catch (err) {
      return res.status(400).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });

  app.post("/api/marktgo/connections/:id/test", async (req, res) => {
    try {
      const connection = await testMarktGoConnection(Number(req.params.id));
      return res.json({ success: true, connection });
    } catch (err) {
      return res.status(400).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });

  app.get("/api/marktgo/health", async (_req, res) => {
    try {
      await ensureRuntimeMarktGoConnection();
      const connection = await testMarktGoConnection();
      return res.json({
        success: connection.status === "connected" || connection.status === "connected_limited",
        provider: DESTINATION_PROVIDER.MARKTGO,
        connection,
      });
    } catch (err) {
      return res.status(200).json({
        success: false,
        provider: DESTINATION_PROVIDER.MARKTGO,
        error: userMessageForMarktGoError(err),
      });
    }
  });

  app.post("/api/marktgo/products/sync", async (req, res) => {
    const startedAt = Date.now();
    try {
      await ensureRuntimeMarktGoConnection();
      const rawProduct = (req.body?.product || req.body || {}) as Record<string, unknown>;
      const product = normalizeTrendyolPoolIdentity(rawProduct);
      if (!product?.title) {
        return res.status(400).json({ success: false, error: "product.title zorunlu" });
      }
      const salePrice = product?.salePrice ?? product?.price;
      if (salePrice == null || !Number.isFinite(Number(salePrice))) {
        return res.status(400).json({ success: false, error: "product.salePrice zorunlu" });
      }
      const input = req.body?.localProductId
        ? product
        : mapPoolProductToMarktGoInput(product);
      const result = await syncProductToMarktGoWithRetry(input, req.body?.connectionId);
      const { buildMarktGoUploadItemReport } = await import(
        "../services/marktgo/upload-report.service"
      );
      const assignment = await buildMarktGoUploadItemReport(product, {
        success: true,
        productId: result.externalProductId,
      });
      console.info("[marktgo] product sync success", {
        externalProductId: result.externalProductId,
        sourceUrl: String(product.sourceUrl || "").slice(0, 180),
        elapsedMs: Date.now() - startedAt,
      });
      return res.json({ success: true, assignment, elapsedMs: Date.now() - startedAt, ...result });
    } catch (err) {
      console.error("[marktgo] product sync failed", {
        elapsedMs: Date.now() - startedAt,
        error: userMessageForMarktGoError(err),
      });
      return res.status(500).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });

  app.get("/api/marktgo/catalog-reconcile", async (_req, res) => {
    try {
      const { getLastMarktGoCatalogReconcile } = await import("../services/marktgo/reconcile.service");
      const last = getLastMarktGoCatalogReconcile();
      return res.json({
        success: true,
        removedLocalProductIds: last?.removedLocalProductIds || [],
        products: last?.products || [],
        ...last,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });

  app.post("/api/marktgo/catalog-reconcile", async (_req, res) => {
    try {
      const { triggerMarktGoCatalogReconcile } = await import("../services/marktgo/reconcile.service");
      const result = await triggerMarktGoCatalogReconcile(true);
      return res.json({ success: true, products: result?.products || [], ...result });
    } catch (err) {
      return res.status(500).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });

  app.get("/api/marktgo/catalog", async (_req, res) => {
    try {
      await ensureRuntimeMarktGoConnection();
      const { triggerMarktGoCatalogReconcile } = await import("../services/marktgo/reconcile.service");
      const result = await triggerMarktGoCatalogReconcile(true);
      return res.json({
        success: true,
        products: result?.products || [],
        imported: result?.imported || 0,
        removed: result?.removed || 0,
        removedLocalProductIds: result?.removedLocalProductIds || [],
        live: result?.live || 0,
        message: result?.message || "",
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });

  app.get("/api/marktgo/categories", async (_req, res) => {
    try {
      await ensureRuntimeMarktGoConnection();
      const { syncMarktGoCategorySummary } = await import(
        "../services/marktgo/collections-sync.service"
      );
      const summary = await syncMarktGoCategorySummary(true);
      return res.json({ success: true, ...summary });
    } catch (err) {
      return res.status(502).json({
        success: false,
        provider: DESTINATION_PROVIDER.MARKTGO,
        error: userMessageForMarktGoError(err),
      });
    }
  });

  app.post("/api/marktgo/categories/sync", async (_req, res) => {
    try {
      await ensureRuntimeMarktGoConnection();
      const { syncMarktGoCategorySummary } = await import(
        "../services/marktgo/collections-sync.service"
      );
      const summary = await syncMarktGoCategorySummary(true);
      return res.json({ success: true, ...summary });
    } catch (err) {
      return res.status(502).json({
        success: false,
        provider: DESTINATION_PROVIDER.MARKTGO,
        error: userMessageForMarktGoError(err),
      });
    }
  });
}
