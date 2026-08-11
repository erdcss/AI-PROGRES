/**
 * Mobil dashboard istatistikleri — mevcut DB'den hesapla, Supabase'e mirror et.
 * Debounced; ana tracking'i bekletmez.
 */
import { and, count, eq, isNull, ne, notExists, sql } from "drizzle-orm";
import { db } from "../db";
import { detectedChanges, products, shopifyMemoryProducts, trackedProducts } from "@shared/schema";
import { syncDashboardStats } from "./mobile-sync.service";
import { getTrackingSchedulerStatus } from "./tracking.scheduler";
import { trackingService } from "./tracking.service";

function visibleTracked() {
  return and(
    ne(trackedProducts.currentStatus, "shopify_deleted"),
    isNull(trackedProducts.archivedAt),
  );
}

export async function computeCatalogCounts() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const visible = visibleTracked();

  const [scrapedAll, scrapedToday, trackedAll, trackedActive, watchRedTracked, watchGreenTracked, watchRedScraped, watchGreenScraped] =
    await Promise.all([
      db.select({ c: count() }).from(products),
      db
        .select({ c: count() })
        .from(products)
        .where(sql`${products.createdAt} >= ${todayStart}`),
      db.select({ c: count() }).from(trackedProducts).where(visible),
      db
        .select({ c: count() })
        .from(trackedProducts)
        .where(and(eq(trackedProducts.trackingEnabled, true), visible)),
      db
        .select({ c: count() })
        .from(trackedProducts)
        .where(and(visible, eq(trackedProducts.watchTag, "red"))),
      db
        .select({ c: count() })
        .from(trackedProducts)
        .where(and(visible, eq(trackedProducts.watchTag, "green"))),
      db.select({ c: count() }).from(products).where(eq(products.watchTag, "red")),
      db.select({ c: count() }).from(products).where(eq(products.watchTag, "green")),
    ]);

  let shopifyMemoryTotal = 0;
  let memoryOnly = 0;
  try {
    const [mem] = await db.select({ c: count() }).from(shopifyMemoryProducts);
    shopifyMemoryTotal = Number(mem?.c ?? 0);
    const [only] = await db
      .select({ c: count() })
      .from(shopifyMemoryProducts)
      .where(
        notExists(
          db
            .select({ id: trackedProducts.id })
            .from(trackedProducts)
            .where(
              and(
                eq(trackedProducts.shopifyProductId, shopifyMemoryProducts.shopifyProductId),
                visible,
              ),
            ),
        ),
      );
    memoryOnly = Number(only?.c ?? 0);
  } catch {
    shopifyMemoryTotal = 0;
    memoryOnly = 0;
  }

  const scrapedTotal = Number(scrapedAll[0]?.c ?? 0);
  const trackedTotal = Number(trackedAll[0]?.c ?? 0);
  const catalogTotal = shopifyMemoryTotal || trackedTotal + memoryOnly || scrapedTotal;

  return {
    scrapedTotal,
    scrapedToday: Number(scrapedToday[0]?.c ?? 0),
    trackedTotal,
    trackedActive: Number(trackedActive[0]?.c ?? 0),
    watchRed: Number(watchRedTracked[0]?.c ?? 0) + Number(watchRedScraped[0]?.c ?? 0),
    watchGreen: Number(watchGreenTracked[0]?.c ?? 0) + Number(watchGreenScraped[0]?.c ?? 0),
    shopifyMemoryTotal,
    catalogTotal,
  };
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;
let lastComputed: Awaited<ReturnType<typeof computeDashboardStats>> | null = null;

export async function computeDashboardStats() {
  const [
    catalog,
    panelChangeCounts,
    pendingChanges,
    priceChanges,
    stockChanges,
    variantChanges,
    scheduler,
  ] = await Promise.all([
    computeCatalogCounts(),
    trackingService.countChangesForPanel().catch(() => null),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(and(eq(detectedChanges.status, "pending"), isNull(detectedChanges.seenAt))),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(eq(detectedChanges.changeType, "price_changed")),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(eq(detectedChanges.changeType, "stock_changed")),
    db
      .select({ c: count() })
      .from(detectedChanges)
      .where(
        sql`${detectedChanges.changeType} IN ('variant_added','variant_removed','variant_changed','variant_price_changed','variant_stock_changed')`,
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
    totalProducts: catalog.catalogTotal,
    todayProducts: catalog.scrapedToday,
    trackedProducts: catalog.trackedTotal,
    activeTracking: catalog.trackedActive,
    pendingChanges: Number(panelChangeCounts?.all ?? pendingChanges[0]?.c ?? 0),
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
