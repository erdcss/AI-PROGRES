import { runManualProductCheck } from "./tracking.scheduler";
import { trackingService } from "./tracking.service";
import { triggerMarktGoCatalogReconcile } from "./marktgo/reconcile.service";

export type FullTrackingScanStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  total: number;
  checked: number;
  succeeded: number;
  failed: number;
  skipped: number;
  marktGoLive: number;
  marktGoImported: number;
  marktGoRemoved: number;
  lastProductId: number | null;
  lastProductTitle: string | null;
  message: string;
};

let state: FullTrackingScanStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  checked: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  marktGoLive: 0,
  marktGoImported: 0,
  marktGoRemoved: 0,
  lastProductId: null,
  lastProductTitle: null,
  message: "Hazır",
};

let inFlight: Promise<FullTrackingScanStatus> | null = null;

export function getFullTrackingScanStatus(): FullTrackingScanStatus {
  return { ...state };
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => next()));
}

async function executeFullTrackingScan(): Promise<FullTrackingScanStatus> {
  state = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    total: 0,
    checked: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    marktGoLive: 0,
    marktGoImported: 0,
    marktGoRemoved: 0,
    lastProductId: null,
    lastProductTitle: null,
    message: "MARKT-GO kataloğu eşitleniyor…",
  };

  try {
    const before = await triggerMarktGoCatalogReconcile(true).catch(() => null);
    if (before) {
      state.marktGoLive = before.live || 0;
      state.marktGoImported = before.imported || 0;
      state.marktGoRemoved = before.removed || 0;
    }

    const products = await trackingService.listProductsForPanel({
      includeArchived: false,
      includeUnlinked: true,
    });
    const active = products.filter((p: any) => p.trackingEnabled !== false && p.sourceUrl);
    state.total = active.length;
    state.message = `${active.length} ürün kaynak sayfası ve MARKT-GO ile karşılaştırılıyor…`;

    await runPool(active, 3, async (product: any) => {
      state.lastProductId = Number(product.id) || null;
      state.lastProductTitle = String(product.sourceTitle || product.title || "Ürün");
      try {
        const result: any = await runManualProductCheck(Number(product.id));
        if (result?.skipped) state.skipped += 1;
        else if (result?.success === false) state.failed += 1;
        else state.succeeded += 1;
      } catch {
        state.failed += 1;
      } finally {
        state.checked += 1;
        state.message = `${state.checked}/${state.total} ürün kontrol edildi`;
      }
    });

    // Son tur: tarama sırasında MARKT-GO'dan silinen/eklenen ürünleri de kesinleştir.
    const after = await triggerMarktGoCatalogReconcile(true).catch(() => null);
    if (after) {
      state.marktGoLive = after.live || state.marktGoLive;
      state.marktGoImported += after.imported || 0;
      state.marktGoRemoved += after.removed || 0;
    }

    state.running = false;
    state.finishedAt = new Date().toISOString();
    state.message = `Kontrol tamamlandı: ${state.succeeded} başarılı, ${state.failed} hatalı, ${state.skipped} atlandı; MARKT-GO canlı ${state.marktGoLive}`;
    return { ...state };
  } catch (err) {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    state.message = err instanceof Error ? err.message : "Toplu takip kontrolü başarısız";
    return { ...state };
  }
}

export function startFullTrackingScan(): { started: boolean; status: FullTrackingScanStatus } {
  if (inFlight || state.running) return { started: false, status: getFullTrackingScanStatus() };
  inFlight = executeFullTrackingScan().finally(() => {
    inFlight = null;
  });
  return { started: true, status: getFullTrackingScanStatus() };
}
