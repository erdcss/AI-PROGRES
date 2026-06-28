import type { Express } from "express";
import {
  getScrapeGatewaySettings,
  updateScrapeGatewaySettings,
  isScrapeGatewaySettingsTableReady,
} from "../services/scrape-gateway-settings.service";
import { testScrapeGateway } from "../services/scrape-gateway.service";
import { isMissingRelationError } from "../migrations/run-product-tracking-migration";

function gatewayMigrationError(err: unknown) {
  if (isMissingRelationError(err, "scrape_gateway_settings")) {
    return {
      status: 503,
      body: {
        success: false,
        error: "Kaynak erişim ayar tablosu hazır değil, migration çalışmalı",
        code: "migration-config-error",
        reason: "gateway-settings-table-missing",
        userMessage:
          "Kaynak erişim ayar tablosu hazır değil. Deploy sonrası migration tamamlanana kadar bekleyin veya yeniden başlatın.",
      },
    };
  }
  return {
    status: 500,
    body: { success: false, error: (err as Error).message },
  };
}

export function registerScrapeGatewayRoutes(app: Express): void {
  app.get("/api/scrape-gateway/settings", async (_req, res) => {
    try {
      const tableReady = await isScrapeGatewaySettingsTableReady();
      if (!tableReady) {
        return res.status(503).json({
          success: false,
          code: "migration-config-error",
          reason: "gateway-settings-table-missing",
          error: "Kaynak erişim ayar tablosu hazır değil, migration çalışmalı",
          providerConfigured: false,
          isReadyForCloudScrape: false,
        });
      }
      const settings = await getScrapeGatewaySettings();
      return res.json({
        success: true,
        settings,
        legacySystemsRemoved: true,
        ...settings,
      });
    } catch (err) {
      const e = gatewayMigrationError(err);
      return res.status(e.status).json(e.body);
    }
  });

  app.put("/api/scrape-gateway/settings", async (req, res) => {
    try {
      const settings = await updateScrapeGatewaySettings(req.body ?? {});
      return res.json({ success: true, settings, ...settings });
    } catch (err) {
      const e = gatewayMigrationError(err);
      return res.status(e.status).json(e.body);
    }
  });

  app.post("/api/scrape-gateway/test", async (req, res) => {
    try {
      const url = String(req.body?.url ?? "").trim();
      if (!url) return res.status(400).json({ success: false, error: "URL gerekli" });
      const tableReady = await isScrapeGatewaySettingsTableReady();
      if (!tableReady) {
        return res.status(503).json({
          success: false,
          reason: "gateway-settings-table-missing",
          userMessage: "Kaynak erişim ayar tablosu hazır değil, migration çalışmalı",
        });
      }
      const result = await testScrapeGateway(url);
      const statusCode = result.success
        ? 200
        : result.reason === "gateway-not-configured"
          ? 422
          : 502;
      return res.status(statusCode).json(result);
    } catch (err) {
      const e = gatewayMigrationError(err);
      return res.status(e.status).json(e.body);
    }
  });
}
