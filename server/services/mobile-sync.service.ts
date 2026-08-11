/**
 * Supabase mobile mirror sync — failure-isolated.
 * Ana tracking/scrape/Shopify işlemlerini ASLA bozmaz.
 */
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  markDashboardSyncTime,
  markMobileSyncTime,
} from "../lib/supabase-admin";
import type { DetectedChange } from "@shared/schema";
import {
  buildPushPayload,
  mapChangeToPushEvent,
  scheduleChangePush,
} from "./mobile-push.service";

export type MobileProductUpsertInput = {
  sourceProductId: string;
  source: string;
  title: string;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  price?: number | null;
  currency?: string;
  variantCount?: number;
  stockStatus?: string | null;
  shopifyStatus?: string | null;
  trackingProductId?: number | null;
  trackingEnabled?: boolean;
  scrapedAt?: string | Date | null;
  lastCheckedAt?: string | Date | null;
  lastChangedAt?: string | Date | null;
};

export function buildEventId(sourceChangeId: number | string): string {
  return `tracking:${sourceChangeId}`;
}

function toIso(v?: string | Date | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function safeCall<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    if (!isSupabaseConfigured()) return null;
    return await fn();
  } catch (err) {
    console.warn(`[mobile-sync] ${label}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function upsertMobileProduct(
  input: MobileProductUpsertInput,
): Promise<{ id?: string } | null> {
  return safeCall("upsertMobileProduct", async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    // tracking_* alanları yalnızca açıkça verildiğinde yazılır —
    // scrape upsert'ı tracking_enabled'i false'a çekmesin.
    const row: Record<string, unknown> = {
      source_product_id: String(input.sourceProductId),
      source: String(input.source || "unknown").toLowerCase(),
      title: String(input.title || "Ürün"),
      image_url: input.imageUrl || null,
      source_url: input.sourceUrl || null,
      price: input.price ?? null,
      currency: input.currency || "TRY",
      variant_count: input.variantCount ?? 0,
      stock_status: input.stockStatus ?? null,
      updated_at: new Date().toISOString(),
    };
    if (input.shopifyStatus !== undefined) {
      row.shopify_status = input.shopifyStatus ?? null;
    }
    if (input.trackingProductId !== undefined) {
      row.tracking_product_id = input.trackingProductId;
    }
    if (input.trackingEnabled !== undefined) {
      row.tracking_enabled = Boolean(input.trackingEnabled);
    }
    if (input.scrapedAt !== undefined) {
      row.scraped_at = toIso(input.scrapedAt);
    }
    if (input.lastCheckedAt !== undefined) {
      row.last_checked_at = toIso(input.lastCheckedAt);
    }
    if (input.lastChangedAt !== undefined) {
      row.last_changed_at = toIso(input.lastChangedAt);
    }
    const { data, error } = await sb
      .from("mobile_products")
      .upsert(row, { onConflict: "source_product_id,source" })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    markMobileSyncTime();
    return { id: data?.id };
  });
}

export async function findMobileProductId(
  trackingProductId: number,
): Promise<string | null> {
  return (
    (await safeCall("findMobileProductId", async () => {
      const sb = getSupabaseAdmin();
      if (!sb) return null;
      const { data, error } = await sb
        .from("mobile_products")
        .select("id")
        .eq("tracking_product_id", trackingProductId)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.id as string) || null;
    })) || null
  );
}

export async function syncTrackingChange(
  change: DetectedChange,
  opts?: { productTitle?: string | null; skipNotification?: boolean; skipPush?: boolean },
): Promise<void> {
  await safeCall("syncTrackingChange", async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const eventId = buildEventId(change.id);
    const mobileProductId = await findMobileProductId(change.trackedProductId);

    const changeRow = {
      source_change_id: change.id,
      event_id: eventId,
      tracking_product_id: change.trackedProductId,
      mobile_product_id: mobileProductId,
      change_type: change.changeType,
      old_value: change.oldValue as object | null,
      new_value: change.newValue as object | null,
      severity: change.severity || "normal",
      status: change.status || "pending",
      seen: Boolean(change.seenAt),
      detected_at: toIso(change.createdAt) || new Date().toISOString(),
    };

    const { data: inserted, error } = await sb
      .from("mobile_tracking_changes")
      .upsert(changeRow, { onConflict: "source_change_id" })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Touch product last_changed_at
    if (mobileProductId) {
      await sb
        .from("mobile_products")
        .update({
          last_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", mobileProductId);
    }

    if (!opts?.skipNotification) {
      await createMobileNotification({
        eventId,
        type: mapChangeToPushEvent(change),
        title: buildPushPayload(change, opts?.productTitle).title,
        message: buildPushPayload(change, opts?.productTitle).body,
        productId: mobileProductId,
        trackingProductId: change.trackedProductId,
        changeId: inserted?.id || null,
        severity: change.severity || "info",
      });
    }

    markMobileSyncTime();
    return inserted;
  });
}

export async function createMobileNotification(input: {
  eventId: string;
  type: string;
  title: string;
  message: string;
  productId?: string | null;
  trackingProductId?: number | null;
  changeId?: string | null;
  severity?: string;
}): Promise<void> {
  await safeCall("createMobileNotification", async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const { error } = await sb.from("mobile_notifications").upsert(
      {
        event_id: input.eventId,
        type: input.type,
        title: input.title,
        message: input.message,
        product_id: input.productId || null,
        tracking_product_id: input.trackingProductId ?? null,
        change_id: input.changeId || null,
        severity: input.severity || "info",
        read: false,
      },
      { onConflict: "event_id" },
    );
    if (error) throw new Error(error.message);
    return true;
  });
}

export async function syncDashboardStats(stats: {
  totalProducts: number;
  todayProducts: number;
  trackedProducts: number;
  activeTracking: number;
  pendingChanges: number;
  priceChanges: number;
  stockChanges: number;
  variantChanges: number;
  systemHealth: string;
}): Promise<void> {
  await safeCall("syncDashboardStats", async () => {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const { error } = await sb.from("mobile_dashboard_stats").upsert(
      {
        snapshot_key: "active",
        total_products: stats.totalProducts,
        today_products: stats.todayProducts,
        tracked_products: stats.trackedProducts,
        active_tracking: stats.activeTracking,
        pending_changes: stats.pendingChanges,
        price_changes: stats.priceChanges,
        stock_changes: stats.stockChanges,
        variant_changes: stats.variantChanges,
        system_health: stats.systemHealth,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "snapshot_key" },
    );
    if (error) throw new Error(error.message);
    markDashboardSyncTime();
    return true;
  });
}

/**
 * Persist edilen DetectedChange satırları için tek side-effect orchestrator.
 * Throw etmez; tracking persist'i bloklamaz.
 */
export function notifyMobileAfterPersistedChanges(rows: DetectedChange[]): void {
  try {
    for (const row of rows) {
      if (!row?.id) continue;
      scheduleMobileEventAfterChange(row);
    }
  } catch (err) {
    console.warn(
      "[mobile-sync] notifyMobileAfterPersistedChanges:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Fire-and-forget after main DB success: Supabase mirror → FCM → dashboard stats */
export function scheduleMobileEventAfterChange(
  change: DetectedChange,
  opts?: { productTitle?: string | null; skipPush?: boolean },
): void {
  void (async () => {
    try {
      // Enrich / upsert product mirror from tracked product
      try {
        const { db } = await import("../db");
        const { trackedProducts, productSnapshots } = await import("@shared/schema");
        const { eq, desc } = await import("drizzle-orm");
        const [p] = await db
          .select()
          .from(trackedProducts)
          .where(eq(trackedProducts.id, change.trackedProductId))
          .limit(1);
        if (p) {
          const [snap] = await db
            .select()
            .from(productSnapshots)
            .where(eq(productSnapshots.trackedProductId, p.id))
            .orderBy(desc(productSnapshots.createdAt))
            .limit(1);
          const images = Array.isArray(snap?.images) ? (snap!.images as string[]) : [];
          await upsertMobileProduct({
            sourceProductId: String(p.sourceProductId || p.id),
            source: p.sourceSite || "unknown",
            title: p.sourceTitle,
            imageUrl: images[0] || null,
            sourceUrl: p.sourceUrl,
            price: p.currentSourcePrice != null ? Number(p.currentSourcePrice) : null,
            variantCount: Array.isArray(snap?.variants) ? (snap!.variants as unknown[]).length : 0,
            stockStatus:
              p.currentSourceStock != null
                ? p.currentSourceStock > 0
                  ? "in_stock"
                  : "out_of_stock"
                : null,
            shopifyStatus: p.shopifyProductId ? "linked" : "none",
            trackingProductId: p.id,
            trackingEnabled: p.trackingEnabled,
            scrapedAt: p.createdAt,
            lastCheckedAt: p.lastCheckedAt,
            lastChangedAt: new Date(),
          });
          opts = { ...opts, productTitle: opts?.productTitle || p.sourceTitle };
        }
      } catch (enrichErr) {
        console.warn("[mobile-sync] product enrich skipped:", errMessage(enrichErr));
      }

      await syncTrackingChange(change, opts);

      if (!opts?.skipPush) {
        try {
          scheduleChangePush(change);
        } catch (pushErr) {
          console.warn("[mobile-sync] FCM schedule skipped:", errMessage(pushErr));
        }
      }

      const { scheduleDashboardRefresh } = await import("./mobile-dashboard.service");
      scheduleDashboardRefresh();
    } catch (err) {
      console.warn("[mobile-sync] scheduleMobileEventAfterChange:", errMessage(err));
    }
  })();
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
