import { db } from "../db";
import { detectedChanges } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  assessPriceChange,
  isPlausibleProductPrice,
  isSuspiciousDefaultPrice,
  looksLikeStockMisread,
} from "@shared/tracking-price-sanity";

/** Güvenilmez fiyat değişikliklerini manuel incelemeye al veya yok say */
export async function reconcileUnreliablePriceChanges(): Promise<number> {
  const rows = await db
    .select()
    .from(detectedChanges)
    .where(
      and(
        eq(detectedChanges.changeType, "price_changed"),
        inArray(detectedChanges.status, ["pending", "manual_review"]),
      ),
    )
    .limit(500);

  let updated = 0;

  for (const row of rows) {
    const oldP = Number(row.oldValue);
    const newP = Number(row.newValue);
    if (!Number.isFinite(oldP) || !Number.isFinite(newP)) continue;

    const assessment = assessPriceChange(oldP, newP);
    const stockMisread = looksLikeStockMisread(oldP, newP) || looksLikeStockMisread(newP, oldP);
    const oldBad = !isPlausibleProductPrice(oldP) || isSuspiciousDefaultPrice(oldP);

    if (stockMisread || oldBad) {
      await db
        .update(detectedChanges)
        .set({
          status: "ignored",
          reason:
            row.reason ??
            "Otomatik temizlik: güvenilmez fiyat karşılaştırması (stok/fiyat karışması)",
          updatedAt: new Date(),
        })
        .where(eq(detectedChanges.id, row.id));
      updated++;
      continue;
    }

    if (assessment.status === "manual_review" && row.status === "pending") {
      await db
        .update(detectedChanges)
        .set({
          status: "manual_review",
          confidence: String(assessment.confidence),
          reason: assessment.reason ?? row.reason,
          updatedAt: new Date(),
        })
        .where(eq(detectedChanges.id, row.id));
      updated++;
    }
  }

  if (updated > 0) {
    console.info(`✅ Takip: ${updated} güvenilmez fiyat değişikliği düzenlendi`);
  }

  return updated;
}
