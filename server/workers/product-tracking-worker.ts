/**
 * Ürün takip + Telegram bildirim köprüsü.
 * Mevcut tracking.scheduler v2 altyapısını bozmadan env tabanlı ek katman.
 */
import { isBrowserWorkerConfigured } from "../services/browser-worker-client.service";
import {
  getProductTrackingIntervalMinutes,
  isProductTrackingEnvEnabled,
} from "../services/telegram-notifier.service";

export function startProductTrackingWorker(): void {
  if (!isProductTrackingEnvEnabled()) {
    console.info("ℹ️ PRODUCT_TRACKING_ENABLED=false — ek tracking worker kapalı");
    return;
  }

  const minutes = getProductTrackingIntervalMinutes();
  console.info(
    `ℹ️ Product tracking worker env aktif (PRODUCT_TRACKING_INTERVAL_MINUTES=${minutes}). Ana scheduler tracking.scheduler.ts tarafından yönetilir.`,
  );

  if (!isBrowserWorkerConfigured()) {
    console.warn(
      "⚠️ BROWSER_WORKER_ENDPOINT tanımlı değil — cloud ortamda takip sonuçları kısmi olabilir; Telegram bildirimlerinde uyarı gösterilir.",
    );
  }
}

export async function notifyTrackingPartialIfNeeded(input: {
  title: string;
  url: string;
  partial?: boolean;
  warning?: string;
}): Promise<void> {
  if (!isProductTrackingEnvEnabled()) return;
  if (!input.partial && !input.warning) return;
  const { notifyProductChange } = await import("../services/telegram-notifier.service");
  await notifyProductChange({
    title: input.title,
    url: input.url,
    partial: input.partial,
    warning: input.warning,
    shopifyStatus: "güncellenmedi",
  }).catch(() => undefined);
}
