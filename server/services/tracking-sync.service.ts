import { isCloudRuntime } from "@shared/deploy-runtime";
import { getTrackingSettings, updateTrackingSettings } from "./tracking-settings.service";

/** Yerel geliştirmede takip + scheduler + MARKT-GO otomatik düzeltme açık kalsın. */
export async function ensureLocalTrackingAutoStart(): Promise<void> {
  if (isCloudRuntime()) return;

  const settings = await getTrackingSettings();
  if (
    settings.trackingEnabled &&
    settings.schedulerEnabled &&
    settings.autoMarktGoSyncEnabled
  ) {
    return;
  }

  await updateTrackingSettings({
    trackingEnabled: true,
    schedulerEnabled: true,
    autoMarktGoSyncEnabled: true,
  });
  console.info(
    "✅ Yerel ortam: ürün takibi, scheduler ve MARKT-GO otomatik düzeltmesi etkinleştirildi",
  );
}

/** MARKT-GO canlı kataloğunu takip ürünleri ve integration mapping kayıtlarıyla uzlaştırır. */
export async function syncMarktGoCatalogToTracking(): Promise<{
  synced: number;
  checked: number;
  removed: number;
  skipped: number;
  success: boolean;
  message: string;
}> {
  const { triggerMarktGoCatalogReconcile } = await import("./marktgo/reconcile.service");
  const result = await triggerMarktGoCatalogReconcile(true);

  return {
    synced: Number(result?.imported || 0),
    checked: Number(result?.checked || 0),
    removed: Number(result?.removed || 0),
    skipped: Number(result?.skipped || 0),
    success: result?.success !== false,
    message: result?.message || "MARKT-GO katalog senkronu tamamlandı",
  };
}

let catalogSyncRunning = false;
let catalogSyncAt = 0;

/** Dashboard okumalarında katalog eşlemesini hafif biçimde taze tutar. */
export function scheduleMarktGoTrackingSync(): void {
  if (catalogSyncRunning) return;
  if (Date.now() - catalogSyncAt < 5 * 60 * 1000) return;
  catalogSyncRunning = true;
  void import("./marktgo/reconcile.service")
    .then(({ triggerMarktGoCatalogReconcile }) => triggerMarktGoCatalogReconcile(false))
    .catch((err) => {
      console.warn("⚠️ MARKT-GO → takip senkronu:", err);
    })
    .finally(() => {
      catalogSyncRunning = false;
      catalogSyncAt = Date.now();
    });
}
