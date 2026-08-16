import type { Express } from "express";
import {
  addConnectionApiKey,
  listConnectionAccess,
  renameConnection,
  setConnectionEnabled,
} from "../services/connection-access.service";

export function registerConnectionAccessRoutes(app: Express): void {
  app.get("/api/connection-access", (_req, res) => {
    try {
      const { connections, brand } = listConnectionAccess();
      return res.json({ success: true, connections, brand });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/connection-access/:id/stop", (req, res) => {
    const result = setConnectionEnabled(String(req.params.id || ""), false);
    if (!result.ok) return res.status(404).json({ success: false, error: result.error });
    return res.json({ success: true, enabled: false, brand: listConnectionAccess().brand });
  });

  app.post("/api/connection-access/:id/start", (req, res) => {
    const result = setConnectionEnabled(String(req.params.id || ""), true);
    if (!result.ok) return res.status(404).json({ success: false, error: result.error });
    return res.json({ success: true, enabled: true, brand: listConnectionAccess().brand });
  });

  app.post("/api/connection-access/:id/rename", (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const result = renameConnection(String(req.params.id || ""), String(body.name || ""));
    if (!result.ok) return res.status(400).json({ success: false, error: result.error });
    return res.json({ success: true, brand: listConnectionAccess().brand });
  });

  app.post("/api/connection-access/keys", (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const result = addConnectionApiKey({
      connectionId: String(body.connectionId || ""),
      connectionName: String(body.connectionName || body.envName || ""),
      value: String(body.value || ""),
      label: body.label ? String(body.label) : undefined,
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.json({ success: true, id: result.id, brand: listConnectionAccess().brand });
  });
}
