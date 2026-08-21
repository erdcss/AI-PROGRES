/**
 * persistDetectedChanges sonrası isteğe bağlı otomatik düzeltme.
 * Karşılaştırma algoritmasını değiştirmez; hata fırlatmaz.
 * MARKT-GO eşlemesi varsa applyChange onu da günceller.
 */
import type { DetectedChange } from "@shared/schema";
import {
  isAutoShopifyFixChangeType,
  isDirectlyApplicableTrackingChange,
} from "@shared/tracking-change-policy";

const AUTO_MIN_CONFIDENCE = 70;

function confidenceOf(row: DetectedChange): number {
  const n = Number(row.confidence);
  return Number.isFinite(n) ? n : 0;
}

/** Yüksek güvenli / gerçek aday — otomatik düzeltmeye uygun */
export function isAutoCorrectCandidate(row: DetectedChange): boolean {
  if (row.status !== "pending") return false;
  if (!isAutoShopifyFixChangeType(row.changeType)) return false;
  if (!isDirectlyApplicableTrackingChange(row.changeType, row.fieldName, row.newValue)) {
    return false;
  }
  return confidenceOf(row) >= AUTO_MIN_CONFIDENCE;
}

export function maybeAutoShopifySyncAfterPersist(rows: DetectedChange[]): void {
  if (!rows.length) return;
  void runAutoShopifySync(rows).catch((err) => {
    console.warn(
      "[auto-correct] hook skipped:",
      err instanceof Error ? err.message : String(err),
    );
  });
}

async function runAutoShopifySync(rows: DetectedChange[]): Promise<void> {
  const { getTrackingSettings } = await import("./tracking-settings.service");
  const settings = await getTrackingSettings().catch(() => null);
  if (!settings?.autoShopifySyncEnabled) return;

  const { shopifySyncChange } = await import("./change-approval.service");
  for (const row of rows) {
    if (!isAutoCorrectCandidate(row)) continue;
    try {
      await shopifySyncChange(row.id, "auto");
    } catch (err) {
      console.warn(
        `[auto-correct] change #${row.id} skipped:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
