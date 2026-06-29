import type { Express, Request, Response, NextFunction } from "express";
import { getBrowserWorkerHealthStatus } from "../services/browser-worker-client.service";
import { getLocalAgentHealthStatus } from "../services/local-agent-client.service";
import {
  getSourceAccessStatus,
  runSourceAccessSelfTest,
} from "../services/source-access-manager.service";

function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_SECRET || "repli_t_admin_2024";
  const provided =
    (req.headers["x-admin-secret"] as string | undefined) ||
    (req.body?.adminSecret as string | undefined);
  if (provided !== expected) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  return next();
}

export function registerSourceAccessRoutes(app: Express): void {
  app.get("/api/browser-worker/health", async (_req, res) => {
    try {
      const health = await getBrowserWorkerHealthStatus();
      return res.json(health);
    } catch (err) {
      return res.status(500).json({
        enabled: false,
        endpointConfigured: false,
        endpointHost: null,
        tokenConfigured: false,
        reachable: false,
        browserReady: false,
        latencyMs: null,
        error: (err as Error).message,
        errorCategory: "unknown",
      });
    }
  });

  app.get("/api/local-agent/health", async (_req, res) => {
    try {
      const health = await getLocalAgentHealthStatus();
      return res.json(health);
    } catch (err) {
      return res.status(500).json({
        enabled: false,
        endpointConfigured: false,
        endpointHost: null,
        tokenConfigured: false,
        reachable: false,
        latencyMs: null,
        error: (err as Error).message,
        errorCategory: "unknown",
      });
    }
  });

  app.get("/api/source-access/status", async (_req, res) => {
    try {
      const status = await getSourceAccessStatus();
      return res.json({ success: true, ...status });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.post("/api/source-access/self-test", requireAdminSecret, async (req, res) => {
    try {
      const url = String(req.body?.url ?? "").trim();
      if (!url) return res.status(400).json({ success: false, error: "URL gerekli" });
      const result = await runSourceAccessSelfTest(url);
      return res.json({ success: result.success, ...result });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });
}
