/**
 * Mobil "Taramayı başlat" — mevcut runManualProductCheck zincirini kullanır.
 * Karşılaştırma algoritmasını değiştirmez; bildirim persist kancasından gelir.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { shopifyMemoryProducts, trackedProducts } from "@shared/schema";
import { getTrackingSettings } from "./tracking-settings.service";
import { runManualProductCheck } from "./tracking.scheduler";

export type MobileScanStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  total: number;
  checked: number;
  skipped: number;
  errors: number;
  changesCreated: number;
  lastMessage: string;
};

const idle = (): MobileScanStatus => ({
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  checked: 0,
  skipped: 0,
  errors: 0,
  changesCreated: 0,
  lastMessage: "Hazır",
});

let state: MobileScanStatus = idle();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getMobileScanStatus(): MobileScanStatus {
  return { ...state };
}

export function startMobileCatalogScan(): MobileScanStatus {
  if (state.running) return { ...state };
  state = {
    ...idle(),
    running: true,
    startedAt: new Date().toISOString(),
    lastMessage: "Tarama başlatıldı",
  };
  void runScan().catch((err) => {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    state.lastMessage = err instanceof Error ? err.message : String(err);
    state.errors += 1;
  });
  return { ...state };
}

async function collectScanIds(): Promise<number[]> {
  const tracked = await db
    .select({
      id: trackedProducts.id,
      shopifyProductId: trackedProducts.shopifyProductId,
      sourceUrl: trackedProducts.sourceUrl,
      trackingEnabled: trackedProducts.trackingEnabled,
    })
    .from(trackedProducts)
    .where(
      and(
        eq(trackedProducts.trackingEnabled, true),
        ne(trackedProducts.currentStatus, "shopify_deleted"),
        isNull(trackedProducts.archivedAt),
      ),
    );

  const ids = new Set(tracked.map((p) => p.id));
  const byShopify = new Map(
    tracked
      .filter((p) => p.shopifyProductId)
      .map((p) => [String(p.shopifyProductId), p.id]),
  );
  const byUrl = new Map(
    tracked
      .filter((p) => p.sourceUrl)
      .map((p) => [String(p.sourceUrl).toLowerCase(), p.id]),
  );

  try {
    const memory = await db
      .select({
        shopifyProductId: shopifyMemoryProducts.shopifyProductId,
        sourceUrl: shopifyMemoryProducts.sourceUrl,
      })
      .from(shopifyMemoryProducts);
    for (const m of memory) {
      const sid = m.shopifyProductId ? byShopify.get(String(m.shopifyProductId)) : undefined;
      const uid = m.sourceUrl ? byUrl.get(String(m.sourceUrl).toLowerCase()) : undefined;
      if (sid) ids.add(sid);
      if (uid) ids.add(uid);
    }
  } catch {
    /* hafıza tablosu yoksa yalnızca tracked */
  }

  return [...ids];
}

async function runScan(): Promise<void> {
  const settings = await getTrackingSettings();
  if (!settings.trackingEnabled) {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    state.lastMessage = "Takip sistemi kapalı";
    return;
  }

  const ids = await collectScanIds();
  state.total = ids.length;
  state.lastMessage = `${ids.length} ürün taranacak`;
  const delay = Math.max(0, settings.requestDelayMs || 0);

  for (const id of ids) {
    if (!state.running && state.finishedAt) break;
    try {
      const result = await runManualProductCheck(id);
      state.checked += 1;
      if (result?.skipped) state.skipped += 1;
      state.changesCreated += Number(result?.changesCreated ?? 0);
      state.lastMessage = result?.userMessage || result?.message || `#${id} kontrol edildi`;
    } catch (err) {
      state.checked += 1;
      state.errors += 1;
      state.lastMessage = err instanceof Error ? err.message : String(err);
    }
    if (delay > 0) await sleep(delay);
  }

  state.running = false;
  state.finishedAt = new Date().toISOString();
  state.lastMessage = `Tarama bitti — ${state.checked}/${state.total}, ${state.changesCreated} değişiklik`;
}
