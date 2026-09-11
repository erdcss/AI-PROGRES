import type { Express } from "express";
import {
  clearMobilePushInbox,
  listMobilePushDevices,
  listMobilePushInbox,
  listMobilePushInboxRecent,
  registerMobilePushDevice,
  unregisterMobilePushDevice,
} from "../services/mobile-push.service";
import { runMobilePushMigration } from "../migrations/run-mobile-push-migration";
import { resolveAppAuth } from "../multi-user-auth";

function notificationId(item: any): number {
  const value = Number(item?.id || 0);
  return Number.isFinite(value) ? value : 0;
}

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
      const mode = String(req.query.mode || "");
      if (mode === "recent") {
        const items = await listMobilePushInboxRecent(Number(req.query.limit || 40));
        return res.json({ success: true, items });
      }
      const afterId = Number(req.query.afterId || 0);
      const items = await listMobilePushInbox(afterId);
      return res.json({ success: true, items });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message, items: [] });
    }
  });

  // Web programı için aynı oturumu kullanan, kimlik doğrulamalı bildirim geçmişi.
  app.get("/api/live-notifications/recent", async (req, res) => {
    try {
      const auth = await resolveAppAuth(req);
      if (!auth) return res.status(401).json({ success: false, message: "Oturum gerekli" });
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
      const items = await listMobilePushInboxRecent(limit);
      return res.json({ success: true, items });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message, items: [] });
    }
  });

  // Server-Sent Events: program açıkken bildirimleri polling beklemeden ekrana iter.
  // Kalıcı inbox + mevcut FCM akışı bozulmaz; mobil bildirimler aynı şekilde devam eder.
  app.get("/api/live-notifications/stream", async (req, res) => {
    try {
      const auth = await resolveAppAuth(req);
      if (!auth) return res.status(401).json({ success: false, message: "Oturum gerekli" });

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);

      let closed = false;
      let checking = false;
      let lastId = 0;

      const recent = await listMobilePushInboxRecent(1).catch(() => [] as any[]);
      if (recent.length) lastId = notificationId(recent[0]);

      const check = async () => {
        if (closed || checking) return;
        checking = true;
        try {
          const items = await listMobilePushInbox(lastId);
          const ordered = [...items].sort((a: any, b: any) => notificationId(a) - notificationId(b));
          for (const item of ordered) {
            if (closed) break;
            const id = notificationId(item);
            if (id <= lastId) continue;
            lastId = id;
            res.write(`event: notification\nid: ${id}\ndata: ${JSON.stringify(item)}\n\n`);
          }
        } catch (err) {
          console.warn("[live-notifications] stream check:", err instanceof Error ? err.message : String(err));
        } finally {
          checking = false;
        }
      };

      const poll = setInterval(() => void check(), 750);
      const heartbeat = setInterval(() => {
        if (!closed) res.write(": keepalive\n\n");
      }, 20_000);
      poll.unref?.();
      heartbeat.unref?.();

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
      };
      req.on("close", cleanup);
      res.on("close", cleanup);
      return undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: message });
      try { res.end(); } catch { /* ignore */ }
      return undefined;
    }
  });

  app.delete("/api/mobile/push/inbox", async (_req, res) => {
    try {
      const result = await clearMobilePushInbox();
      return res.json({ success: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
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
