/**
 * persistDetectedChanges sonrası isteğe bağlı otomatik düzeltme.
 * Karşılaştırma algoritmasını değiştirmez; hata fırlatmaz.
 * Yalnızca MARKT-GO hedefini günceller; Shopify fallback yoktur.
 */
import type { DetectedChange } from "@shared/schema";
import {
  isAutoMarktGoFixChangeType,
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
  if (!isAutoMarktGoFixChangeType(row.changeType)) return false;
  if (!isDirectlyApplicableTrackingChange(row.changeType, row.fieldName, row.newValue)) {
    return false;
  }
  return confidenceOf(row) >= AUTO_MIN_CONFIDENCE;
}

export function maybeAutoMarktGoSyncAfterPersist(rows: DetectedChange[]): void {
  if (!rows.length) return;
  void runAutoMarktGoSync(rows).catch((err) => {
    console.warn(
      "[marktgo-auto-correct] hook skipped:",
      err instanceof Error ? err.message : String(err),
    );
  });
}

async function runAutoMarktGoSync(rows: DetectedChange[]): Promise<void> {
  const { getTrackingSettings } = await import("./tracking-settings.service");
  const settings = await getTrackingSettings().catch(() => null);
  if (!settings?.autoMarktGoSyncEnabled) return;

  const { marktGoSyncChange } = await import("./change-approval.service");
  for (const row of rows) {
    if (!isAutoCorrectCandidate(row)) continue;
    try {
      await marktGoSyncChange(row.id, "auto-marktgo");
    } catch (err) {
      console.warn(
        `[marktgo-auto-correct] change #${row.id} skipped:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

/** Program açılışında bekleyen yüksek güvenli değişiklikleri MARKT-GO'ya uygular */
export async function applyPendingTrackingChangesOnStartup(options?: {
  limit?: number;
}): Promise<{ applied: number; skipped: number; errors: number }> {
  const { getTrackingSettings } = await import("./tracking-settings.service");
  const settings = await getTrackingSettings().catch(() => null);
  if (!settings?.autoMarktGoSyncEnabled) {
    return { applied: 0, skipped: 0, errors: 0 };
  }

  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 120);
  const { db } = await import("../db");
  const { detectedChanges } = await import("@shared/schema");
  const { desc, eq } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(detectedChanges)
    .where(eq(detectedChanges.status, "pending"))
    .orderBy(desc(detectedChanges.createdAt))
    .limit(limit);

  const { marktGoSyncChange } = await import("./change-approval.service");
  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (!isAutoCorrectCandidate(row)) {
      skipped++;
      continue;
    }
    try {
      await marktGoSyncChange(row.id, "startup-auto-marktgo");
      applied++;
    } catch (err) {
      errors++;
      console.warn(
        `[startup-marktgo-auto-correct] change #${row.id} skipped:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (applied > 0 || errors > 0) {
    console.info(
      `[startup-marktgo-auto-correct] uygulandı=${applied} atlandı=${skipped} hata=${errors}`,
    );
  }

  return { applied, skipped, errors };
}
