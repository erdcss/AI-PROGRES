import { db } from "../db";
import { detectedChanges } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
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

/** Aynı alan için birikmiş eski aksiyonları kapatır; panelde yalnız en güncel kayıt kalır. */
export async function supersedeStaleTrackingChanges(): Promise<number> {
  const aggregateStockNoise = await db.execute(sql`
    UPDATE detected_changes AS changes
       SET status = 'ignored',
           reason = 'Varyant stokları mevcut; toplam stok bildirimi yinelenen bilgidir',
           seen_at = NOW(),
           updated_at = NOW()
     WHERE changes.status IN ('pending', 'manual_review', 'approved', 'failed')
       AND changes.change_type = 'stock_changed'
       AND changes.field_name = 'stock'
       AND EXISTS (
         SELECT 1
           FROM tracked_variants AS variants
          WHERE variants.tracked_product_id = changes.tracked_product_id
            AND variants.shopify_variant_id IS NOT NULL
       )
    RETURNING changes.id
  `);

  const staleVariantAdds = await db.execute(sql`
    UPDATE detected_changes
       SET status = 'ignored',
           reason = 'Eski varyant bildirimi: güncel takip kaydı zaten mevcut',
           seen_at = NOW(),
           updated_at = NOW()
     WHERE status IN ('pending', 'manual_review', 'approved', 'failed')
       AND change_type = 'variant_added'
    RETURNING id
  `);

  const unreliableVariantRemovals = await db.execute(sql`
    UPDATE detected_changes
       SET status = 'ignored',
           reason = 'Tek ölçümde eksik görünen varyant kaldırılmış sayılmaz',
           seen_at = NOW(),
           updated_at = NOW()
     WHERE status IN ('pending', 'manual_review', 'approved', 'failed')
       AND change_type = 'variant_removed'
    RETURNING id
  `);

  const unchanged = await db.execute(sql`
    UPDATE detected_changes
       SET status = 'ignored',
           reason = 'Eski gereksiz kayıt: değer değişmemiş',
           seen_at = NOW(),
           updated_at = NOW()
     WHERE status IN ('pending', 'manual_review', 'approved', 'failed')
       AND old_value IS NOT DISTINCT FROM new_value
    RETURNING id
  `);

  const stale = await db.execute(sql`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY tracked_product_id,
                            COALESCE(tracked_variant_id, 0),
                            change_type,
                            field_name
               ORDER BY created_at DESC, id DESC
             ) AS row_no
        FROM detected_changes
       WHERE status IN ('pending', 'manual_review', 'approved', 'failed')
    )
    UPDATE detected_changes AS changes
       SET status = 'superseded',
           reason = 'Daha güncel takip kaydı mevcut',
           updated_at = NOW()
      FROM ranked
     WHERE changes.id = ranked.id
       AND ranked.row_no > 1
    RETURNING changes.id
  `);

  const updated =
    (aggregateStockNoise.rowCount ?? 0) +
    (staleVariantAdds.rowCount ?? 0) +
    (unreliableVariantRemovals.rowCount ?? 0) +
    (unchanged.rowCount ?? 0) +
    (stale.rowCount ?? 0);
  if (updated > 0) {
    console.info(`✅ Takip: ${updated} eski/gereksiz değişiklik arşivlendi`);
  }
  return updated;
}
