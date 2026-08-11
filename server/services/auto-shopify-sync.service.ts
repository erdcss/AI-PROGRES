/**
 * persistDetectedChanges sonrası isteğe bağlı Shopify düzeltmesi.
 * Karşılaştırma algoritmasını değiştirmez; hata fırlatmaz.
 */
import type { DetectedChange } from "@shared/schema";
import {
  isAutoShopifyFixChangeType,
  isDirectlyApplicableTrackingChange,
} from "@shared/tracking-change-policy";

export function maybeAutoShopifySyncAfterPersist(rows: DetectedChange[]): void {
  if (!rows.length) return;
  void runAutoShopifySync(rows).catch((err) => {
    console.warn(
      "[auto-shopify] hook skipped:",
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
    if (!isAutoShopifyFixChangeType(row.changeType)) continue;
    if (!isDirectlyApplicableTrackingChange(row.changeType, row.fieldName, row.newValue)) {
      continue;
    }
    try {
      await shopifySyncChange(row.id, "auto");
    } catch (err) {
      console.warn(
        `[auto-shopify] change #${row.id} skipped:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
