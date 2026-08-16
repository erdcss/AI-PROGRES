import type { Express } from "express";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import {
  listMarktGoConnections,
  migrateMisplacedMarktGoTokenFromShopify,
  saveMarktGoConnection,
  testMarktGoConnection,
} from "../services/marktgo/connection.service";
import { syncProductToMarktGo } from "../services/marktgo/sync.service";
import { mapPoolProductToMarktGoInput } from "../services/marktgo/pool-map";
import { userMessageForMarktGoError } from "../services/marktgo/errors";
import { runMarktGoMigration } from "../migrations/run-marktgo-migration";

export function registerMarktGoRoutes(app: Express): void {
  void runMarktGoMigration(false);
  void migrateMisplacedMarktGoTokenFromShopify().catch(() => undefined);

  app.get("/api/marktgo/connections", async (_req, res) => {
    try {
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
    try {
      const product = req.body?.product || req.body;
      if (!product?.title) {
        return res.status(400).json({ success: false, error: "product.title zorunlu" });
      }
      const input = req.body?.localProductId
        ? product
        : mapPoolProductToMarktGoInput(product);
      const result = await syncProductToMarktGo(input, req.body?.connectionId);
      return res.json({ success: true, ...result });
    } catch (err) {
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
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(500).json({ success: false, error: userMessageForMarktGoError(err) });
    }
  });
}
