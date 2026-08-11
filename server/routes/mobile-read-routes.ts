import type { Express } from "express";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { products, trackedProducts } from "@shared/schema";
import {
  getTrackingNotifications,
  getTrackingSchedulerStatus,
} from "../services/tracking.scheduler";
import { trackingService } from "../services/tracking.service";

/**
 * Mobil için ince READ-ONLY özet / ürün listesi sarmalayıcı.
 * Yeni ürün veya tracking sistemi oluşturmaz — mevcut tabloları okur.
 */
export function registerMobileReadRoutes(app: Express): void {
  app.get("/api/mobile/dashboard", async (_req, res) => {
    try {
      const [notifications, scheduler, changeCounts, scrapedCountRow, trackedRows] =
        await Promise.all([
          getTrackingNotifications(),
          getTrackingSchedulerStatus(),
          trackingService.countChangesForPanel(),
          db
            .select({ c: count() })
            .from(products)
            .where(eq(products.isActive, true)),
          trackingService.listProductsForPanel(),
        ]);

      const scrapedTotal = Number(scrapedCountRow[0]?.c ?? 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const scrapedTodayRow = await db
        .select({ c: count() })
        .from(products)
        .where(
          and(eq(products.isActive, true), sql`${products.createdAt} >= ${todayStart}`),
        );

      const tracked = trackedRows || [];
      const activeTracked = tracked.filter((p) => p.trackingEnabled && !p.archivedAt);
      const watchRed = tracked.filter((p) => p.watchTag === "red").length;
      const watchGreen = tracked.filter((p) => p.watchTag === "green").length;

      return res.json({
        success: true,
        updatedAt: new Date().toISOString(),
        system: {
          trackingEnabled: scheduler.trackingEnabled,
          schedulerEnabled: scheduler.schedulerEnabled,
          safeSchedulerRunning: scheduler.safeSchedulerRunning,
          lastRunAt: scheduler.lastRunAt,
          lastRunStatus: scheduler.lastRunStatus,
          autoShopifySyncEnabled: Boolean(scheduler.autoShopifySyncEnabled),
          healthOk: Boolean(scheduler.migration?.allTablesReady),
        },
        cards: {
          scrapedTotal,
          scrapedToday: Number(scrapedTodayRow[0]?.c ?? 0),
          trackedTotal: tracked.length,
          trackedActive: activeTracked.length,
          pendingChanges: changeCounts.actionable ?? changeCounts.pending ?? 0,
          priceChanges: notifications.priceChangeCount ?? 0,
          stockChanges: notifications.stockChangeCount ?? 0,
          variantChanges: notifications.variantChangeCount ?? 0,
          watchRed,
          watchGreen,
        },
        recentChanges: notifications.lastChanges || [],
        changeCounts,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/products", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const q = String(req.query.q || "").trim();
      const marketplace = String(req.query.marketplace || "").trim().toLowerCase();

      const conditions = [eq(products.isActive, true)];
      if (q) {
        conditions.push(
          or(
            ilike(products.title, `%${q}%`),
            ilike(products.brand, `%${q}%`),
          )!,
        );
      }
      if (marketplace && marketplace !== "all" && marketplace !== "tümü") {
        conditions.push(ilike(products.sourcePlatform, `%${marketplace}%`));
      }

      const where = and(...conditions);
      const rows = await db
        .select({
          id: products.id,
          title: products.title,
          brand: products.brand,
          trendyolUrl: products.trendyolUrl,
          sourcePlatform: products.sourcePlatform,
          shopifyProductId: products.shopifyProductId,
          shopifyUrl: products.shopifyUrl,
          currentPrice: products.currentPrice,
          originalPrice: products.originalPrice,
          stockStatus: products.stockStatus,
          isActive: products.isActive,
          createdAt: products.createdAt,
          lastChecked: products.lastChecked,
          images: products.images,
          watchTag: products.watchTag,
        })
        .from(products)
        .where(where)
        .orderBy(desc(products.createdAt))
        .limit(limit)
        .offset(offset);

      const totalRow = await db.select({ c: count() }).from(products).where(where);
      const total = Number(totalRow[0]?.c ?? 0);

      return res.json({
        success: true,
        products: rows.map((p) => ({
          ...p,
          image:
            Array.isArray(p.images) && p.images.length
              ? String(p.images[0])
              : null,
          marketplace: p.sourcePlatform || "unknown",
          scrapedAt: p.createdAt,
          shopifyStatus: p.shopifyProductId ? "linked" : "none",
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/products/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: "Geçersiz id" });
      }
      const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!product) {
        return res.status(404).json({ success: false, error: "Ürün bulunamadı" });
      }

      const tracked = await db
        .select()
        .from(trackedProducts)
        .where(
          or(
            eq(trackedProducts.sourceUrl, product.trendyolUrl || ""),
            product.shopifyProductId
              ? eq(trackedProducts.shopifyProductId, product.shopifyProductId)
              : sql`false`,
          )!,
        )
        .limit(1);

      return res.json({
        success: true,
        product: {
          ...product,
          image:
            Array.isArray(product.images) && product.images.length
              ? String(product.images[0])
              : null,
          marketplace: product.sourcePlatform || "unknown",
          scrapedAt: product.createdAt,
          shopifyStatus: product.shopifyProductId ? "linked" : "none",
          tracking: tracked[0] || null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/health", async (_req, res) => {
    try {
      const { isSupabaseConfigured, getSupabaseAdmin, getMobileSyncTimestamps, assertServerOnlySupabaseEnv } =
        await import("../lib/supabase-admin");
      const { pool } = await import("../db");

      let database: "ok" | "down" | "unconfigured" = "unconfigured";
      if (pool) {
        try {
          await pool.query("SELECT 1");
          database = "ok";
        } catch {
          database = "down";
        }
      }

      let supabase: "ok" | "down" | "unconfigured" = "unconfigured";
      let realtimeConfig: "ok" | "unknown" | "unconfigured" = "unconfigured";
      if (isSupabaseConfigured()) {
        try {
          const sb = getSupabaseAdmin();
          // Minimal probe on a known mirror table (service role bypasses RLS)
          const { error } = await sb!.from("mobile_products").select("id").limit(1);
          supabase = error ? "down" : "ok";
          // Reachable Data API implies project is live; Realtime publication
          // is configured in migration — full channel prove requires a subscriber.
          realtimeConfig = error ? "unknown" : "ok";
        } catch {
          supabase = "down";
          realtimeConfig = "unknown";
        }
      }

      const push =
        process.env.FCM_PROJECT_ID || process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? "ok"
          : "unconfigured";

      const guard = assertServerOnlySupabaseEnv();
      const timestamps = getMobileSyncTimestamps();

      return res.json({
        success: true,
        backend: "ok",
        database,
        supabase,
        realtimeConfig,
        push,
        lastMobileSync: timestamps.lastMobileSyncAt,
        lastDashboardSync: timestamps.lastDashboardSyncAt,
        security: { serviceRoleNotInPublicEnv: guard.ok },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/mobile/notifications/:id/read", async (req, res) => {
    try {
      const { getSupabaseAdmin, isSupabaseConfigured } = await import("../lib/supabase-admin");
      if (!isSupabaseConfigured()) {
        return res.status(503).json({ success: false, error: "Supabase yapılandırılmamış" });
      }
      const id = String(req.params.id || "");
      const sb = getSupabaseAdmin()!;
      const { error } = await sb
        .from("mobile_notifications")
        .update({ read: true })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ success: false, error: message });
    }
  });
}
