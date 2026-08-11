import type { Express } from "express";
import {
  listMobilePushDevices,
  listMobilePushInbox,
  registerMobilePushDevice,
  unregisterMobilePushDevice,
} from "../services/mobile-push.service";
import { runMobilePushMigration } from "../migrations/run-mobile-push-migration";

/** ORVIAN Monitor FCM — izole; mevcut tracking route'larını değiştirmez */
export function registerMobilePushRoutes(app: Express): void {
  void runMobilePushMigration(false);

  app.get("/api/notifications/devices", async (_req, res) => {
    try {
      const devices = await listMobilePushDevices();
      return res.json({ success: true, devices });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message, devices: [] });
    }
  });

  app.post("/api/mobile/push/register", async (req, res) => {
    try {
      const result = await registerMobilePushDevice({
        deviceId: String(req.body?.deviceId || ""),
        platform: String(req.body?.platform || "android"),
        pushToken: String(req.body?.pushToken || ""),
        appVersion: req.body?.appVersion ? String(req.body.appVersion) : undefined,
      });
      return res.json({ success: true, device: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/push/inbox", async (req, res) => {
    try {
      const afterId = Number(req.query.afterId || 0);
      const items = await listMobilePushInbox(afterId);
      return res.json({ success: true, items });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message, items: [] });
    }
  });

  app.post("/api/mobile/push/unregister", async (req, res) => {
    try {
      const result = await unregisterMobilePushDevice({
        deviceId: req.body?.deviceId ? String(req.body.deviceId) : undefined,
        pushToken: req.body?.pushToken ? String(req.body.pushToken) : undefined,
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ success: false, error: message });
    }
  });
}
