/**
 * Mobil dashboard istatistikleri — mevcut DB'den hesapla, Supabase'e mirror et.
 * Debounced; ana tracking'i bekletmez.
 */
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { detectedChanges, products, trackedProducts } from "@shared/schema";
import { syncDashboardStats } from "./mobile-sync.service";
import { getTrackingSchedulerStatus } from "./tracking.scheduler";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;
let lastComputed: Awaited<ReturnType<typeof computeDashboardStats>> | null = null;

export async function computeDashboardStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    scrapedTotal,
    scrapedToday,
    trackedTotal,
    trackedActive,
    pendingChanges,
    priceChanges,
    stockChanges,
    variantChanges,
    scheduler,
  ] = await Promise.all([
    db.select({ c: count() }).from(products).where(eq(products.isActive, true)),
    db
      .select({ c: count() })
      .from(products)
      .where(and(eq(products.isActive, true), sql`${products.createdAt} >= ${todayStart}`)),
    db
      .select({ c: count() })
      .from(trackedProducts)
      .where(and(ne(trackedProducts.currentStatus, "shopify_deleted"), isNull(trackedProducts.archivedAt))),
    db
      .select({ c: count() })
      .from(trackedProducts)
      .where(
        and(
          eq(trackedProducts.trackingEnabled, true),
          ne(trackedProducts.currentStatus, "shopify_deleted"),
          isNull(trackedProducts.archivedAt),
        ),
      ),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(and(eq(detectedChanges.status, "pending"), isNull(detectedChanges.seenAt))),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(and(eq(detectedChanges.changeType, "price_changed"), eq(detectedChanges.status, "pending"))),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(and(eq(detectedChanges.changeType, "stock_changed"), eq(detectedChanges.status, "pending"))),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(
        sql`${detectedChanges.changeType} IN ('variant_added','variant_removed','variant_changed','variant_price_changed','variant_stock_changed') AND ${detectedChanges.status} = 'pending'`,
      ),
    getTrackingSchedulerStatus().catch(() => null),
  ]);

  const health =
    scheduler && (scheduler as { migration?: { allTablesReady?: boolean } }).migration?.allTablesReady
      ? "ok"
      : scheduler
        ? "degraded"
        : "unknown";

  const stats = {
    totalProducts: Number(scrapedTotal[0]?.c ?? 0),
    todayProducts: Number(scrapedToday[0]?.c ?? 0),
    trackedProducts: Number(trackedTotal[0]?.c ?? 0),
    activeTracking: Number(trackedActive[0]?.c ?? 0),
    pendingChanges: Number(pendingChanges[0]?.c ?? 0),
    priceChanges: Number(priceChanges[0]?.c ?? 0),
    stockChanges: Number(stockChanges[0]?.c ?? 0),
    variantChanges: Number(variantChanges[0]?.c ?? 0),
    systemHealth: health,
  };
  lastComputed = stats;
  return stats;
}

export async function refreshAndSyncDashboardStats(): Promise<typeof lastComputed> {
  try {
    const stats = await computeDashboardStats();
    await syncDashboardStats(stats);
    return stats;
  } catch (err) {
    console.warn(
      "[mobile-dashboard] refresh failed:",
      err instanceof Error ? err.message : String(err),
    );
    return lastComputed;
  }
}

export function scheduleDashboardRefresh(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void refreshAndSyncDashboardStats();
  }, DEBOUNCE_MS);
}

export function getLastComputedDashboardStats() {
  return lastComputed;
}
