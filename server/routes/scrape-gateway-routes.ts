import type { Express } from "express";
import {
  getScrapeGatewaySettings,
  updateScrapeGatewaySettings,
} from "../services/scrape-gateway-settings.service";
import { testScrapeGateway } from "../services/scrape-gateway.service";

export function registerScrapeGatewayRoutes(app: Express): void {
  app.get("/api/scrape-gateway/settings", async (_req, res) => {
    try {
      const settings = await getScrapeGatewaySettings();
      return res.json({ success: true, settings });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.put("/api/scrape-gateway/settings", async (req, res) => {
    try {
      const settings = await updateScrapeGatewaySettings(req.body ?? {});
      return res.json({ success: true, settings });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.post("/api/scrape-gateway/test", async (req, res) => {
    try {
      const url = String(req.body?.url ?? "").trim();
      if (!url) return res.status(400).json({ success: false, error: "URL gerekli" });
      const result = await testScrapeGateway(url);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });
}
