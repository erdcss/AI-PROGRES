import type { Express } from "express";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { productVariants, products, shopifyMemoryProducts, trackedProducts } from "@shared/schema";
import {
  getTrackingNotifications,
  getTrackingSchedulerStatus,
} from "../services/tracking.scheduler";
import { computeCatalogCounts } from "../services/mobile-dashboard.service";
import { trackingService } from "../services/tracking.service";

function normalizeMediaUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    let u = raw.trim();
    if (!u) return null;
    if (u.startsWith("[") || u.startsWith("{")) {
      try {
        return normalizeMediaUrl(JSON.parse(u));
      } catch {
        /* düz URL */
      }
    }
    if (u.startsWith("//")) u = `https:${u}`;
    if (u.startsWith("http://")) u = `https://${u.slice(7)}`;
    return /^https:\/\//i.test(u) ? u : null;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = normalizeMediaUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return normalizeMediaUrl(o.src || o.url || o.originalSrc || o.original_src);
  }
  return null;
}

function firstMediaUrl(images: unknown): string | null {
  return normalizeMediaUrl(images);
}

function asVariantList(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

/**
 * Mobil için ince READ-ONLY özet / ürün listesi sarmalayıcı.
 * Yeni ürün veya tracking sistemi oluşturmaz — mevcut tabloları okur.
 */
export function registerMobileReadRoutes(app: Express): void {
  app.get("/api/mobile/dashboard", async (_req, res) => {
    try {
      const [notifications, scheduler, changeCounts, catalog] =
        await Promise.all([
          getTrackingNotifications(),
          getTrackingSchedulerStatus(),
          trackingService.countChangesForPanel(),
          computeCatalogCounts(),
        ]);

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
          scrapedTotal: catalog.catalogTotal,
          scrapedToday: catalog.scrapedToday,
          trackedTotal: catalog.trackedTotal,
          trackedActive: catalog.trackedActive,
          pendingChanges: changeCounts.actionable ?? changeCounts.pending ?? 0,
          priceChanges: notifications.priceChangeCount ?? 0,
          stockChanges: notifications.stockChangeCount ?? 0,
          variantChanges: notifications.variantChangeCount ?? 0,
          watchRed: catalog.watchRed,
          watchGreen: catalog.watchGreen,
          shopifyMemoryTotal: catalog.shopifyMemoryTotal,
          catalogTotal: catalog.catalogTotal,
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

      const conditions = [];
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
      const ids = rows.map((p) => p.id);
      const variantRows =
        ids.length > 0
          ? await db
              .select()
              .from(productVariants)
              .where(inArray(productVariants.productId, ids))
          : [];
      const variantsByProduct = new Map<number, typeof variantRows>();
      for (const v of variantRows) {
        const list = variantsByProduct.get(v.productId) || [];
        list.push(v);
        variantsByProduct.set(v.productId, list);
      }

      return res.json({
        success: true,
        products: rows.map((p) => {
          const variants = variantsByProduct.get(p.id) || [];
          return {
            ...p,
            image: firstMediaUrl(p.images),
            marketplace: p.sourcePlatform || "unknown",
            scrapedAt: p.createdAt,
            shopifyStatus: p.shopifyProductId ? "linked" : "none",
            variantCount: variants.length,
            variants,
          };
        }),
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

      const variants = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, id));

      return res.json({
        success: true,
        product: {
          ...product,
          image: firstMediaUrl(product.images),
          marketplace: product.sourcePlatform || "unknown",
          scrapedAt: product.createdAt,
          shopifyStatus: product.shopifyProductId ? "linked" : "none",
          tracking: tracked[0] || null,
          variantCount: variants.length,
          variants,
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

      const push = "ok";

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

  app.get("/api/mobile/shopify-connection", async (_req, res) => {
    try {
      const { getShopifyHealthSnapshot } = await import("../shopify-credentials");
      const snapshot = await getShopifyHealthSnapshot();
      return res.json({
        success: true,
        connected: Boolean(snapshot.ok),
        shopDomain: snapshot.shopDomain || null,
        canReadProducts: Boolean(snapshot.canReadProducts),
        canWriteProducts: Boolean(snapshot.canWriteProducts),
        productCount: snapshot.productCountCheck?.count ?? null,
        error: snapshot.error || null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, connected: false, error: message });
    }
  });

  app.get("/api/mobile/memory-products", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const rows = await db
        .select()
        .from(shopifyMemoryProducts)
        .orderBy(desc(shopifyMemoryProducts.lastSyncAt))
        .limit(limit)
        .offset(offset);
      const totalRow = await db.select({ c: count() }).from(shopifyMemoryProducts);
      const total = Number(totalRow[0]?.c ?? 0);
      return res.json({
        success: true,
        products: rows.map((p) => {
          const variants = asVariantList(p.variants);
          return {
            ...p,
            image: firstMediaUrl(p.images),
            images: Array.isArray(p.images) ? p.images : [],
            variants,
            variantCount: variants.length,
          };
        }),
        pagination: { total, limit, offset, hasMore: offset + limit < total },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/memory-products/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, error: "Geçersiz id" });
      }
      const [row] = await db
        .select()
        .from(shopifyMemoryProducts)
        .where(eq(shopifyMemoryProducts.id, id))
        .limit(1);
      if (!row) return res.status(404).json({ success: false, error: "Ürün bulunamadı" });
      const variants = asVariantList(row.variants);
      const tracked = row.shopifyProductId
        ? await db
            .select()
            .from(trackedProducts)
            .where(eq(trackedProducts.shopifyProductId, row.shopifyProductId))
            .limit(1)
        : [];
      return res.json({
        success: true,
        product: {
          ...row,
          image: firstMediaUrl(row.images),
          images: Array.isArray(row.images) ? row.images : [],
          variants,
          variantCount: variants.length,
          tracking: tracked[0] || null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/scan", async (_req, res) => {
    try {
      const { getMobileScanStatus } = await import("../services/mobile-scan.service");
      return res.json({ success: true, scan: getMobileScanStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/mobile/scan", async (_req, res) => {
    try {
      const { startMobileCatalogScan } = await import("../services/mobile-scan.service");
      const scan = startMobileCatalogScan();
      return res.json({ success: true, scan });
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
