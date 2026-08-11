/**
 * Eksik fiyat/varyant verisini doldurur; doldurulamayan ürünleri listeden düşürür.
 * Tracking/scrape algoritmasını değiştirmez.
 */
import { pool } from "../db";

type HydrateResult = {
  productsHydrated: number;
  trackedHydrated: number;
  memoryHydrated: number;
  productsDeactivated: number;
};

let lastRunAt = 0;
let lastResult: HydrateResult = {
  productsHydrated: 0,
  trackedHydrated: 0,
  memoryHydrated: 0,
  productsDeactivated: 0,
};

function asCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function hydrateIncompleteCatalog(force = false): Promise<HydrateResult> {
  if (!pool) return lastResult;
  if (!force && Date.now() - lastRunAt < 10 * 60 * 1000) return lastResult;

  try {
    const productsFromVariants = await pool.query(`
      UPDATE products p
      SET current_price = v.min_price,
          original_price = COALESCE(NULLIF(p.original_price::numeric, 0), v.min_price),
          updated_at = NOW()
      FROM (
        SELECT product_id,
               MIN(price)::numeric AS min_price
        FROM (
          SELECT product_id, trendyol_price::numeric AS price
          FROM product_variants
          WHERE trendyol_price IS NOT NULL AND trendyol_price::numeric > 0
          UNION ALL
          SELECT product_id, shopify_price::numeric AS price
          FROM product_variants
          WHERE shopify_price IS NOT NULL AND shopify_price::numeric > 0
        ) prices
        GROUP BY product_id
      ) v
      WHERE p.id = v.product_id
        AND (p.current_price IS NULL OR p.current_price::numeric <= 0)
    `);

    const trackedFromVariants = await pool.query(`
      UPDATE tracked_products t
      SET current_source_price = v.min_price,
          updated_at = NOW()
      FROM (
        SELECT tracked_product_id, MIN(current_source_price::numeric) AS min_price
        FROM tracked_variants
        WHERE current_source_price IS NOT NULL AND current_source_price::numeric > 0
        GROUP BY tracked_product_id
      ) v
      WHERE t.id = v.tracked_product_id
        AND (t.current_source_price IS NULL OR t.current_source_price::numeric <= 0)
    `);

    const trackedFromSnapshots = await pool.query(`
      UPDATE tracked_products t
      SET current_source_price = s.price,
          updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (tracked_product_id) tracked_product_id, price::numeric AS price
        FROM product_snapshots
        WHERE price IS NOT NULL AND price::numeric > 0
        ORDER BY tracked_product_id, created_at DESC
      ) s
      WHERE t.id = s.tracked_product_id
        AND (t.current_source_price IS NULL OR t.current_source_price::numeric <= 0)
    `);

    const memoryRows = await pool.query(`
      SELECT id, price, compare_at_price, variants
      FROM shopify_memory_products
      WHERE price IS NULL OR price::numeric <= 0
    `);

    let memoryHydrated = 0;
    for (const row of memoryRows.rows || []) {
      const variants = Array.isArray(row.variants) ? row.variants : [];
      let found: number | null = null;
      for (const v of variants) {
        const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
        for (const key of ["price", "trendyolPrice", "shopifyPrice", "currentSourcePrice"]) {
          const n = Number(o[key]);
          if (Number.isFinite(n) && n > 0) {
            found = n;
            break;
          }
        }
        if (found != null) break;
      }
      if (found == null) continue;
      await pool.query(
        `UPDATE shopify_memory_products SET price = $1, updated_at = NOW() WHERE id = $2`,
        [found, row.id],
      );
      memoryHydrated += 1;
    }

    const deactivated = await pool.query(`
      UPDATE products p
      SET is_active = FALSE, updated_at = NOW()
      WHERE p.is_active = TRUE
        AND (p.current_price IS NULL OR p.current_price::numeric <= 0)
        AND (p.original_price IS NULL OR p.original_price::numeric <= 0)
        AND NOT EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = p.id
            AND (
              (pv.trendyol_price IS NOT NULL AND pv.trendyol_price::numeric > 0)
              OR (pv.shopify_price IS NOT NULL AND pv.shopify_price::numeric > 0)
            )
        )
    `);

    lastRunAt = Date.now();
    lastResult = {
      productsHydrated: asCount(productsFromVariants.rowCount),
      trackedHydrated:
        asCount(trackedFromVariants.rowCount) + asCount(trackedFromSnapshots.rowCount),
      memoryHydrated,
      productsDeactivated: asCount(deactivated.rowCount),
    };
    if (
      lastResult.productsHydrated ||
      lastResult.trackedHydrated ||
      lastResult.memoryHydrated ||
      lastResult.productsDeactivated
    ) {
      console.log("[catalog-hydrate]", lastResult);
    }
  } catch (err) {
    console.warn("[catalog-hydrate] failed:", (err as Error).message);
  }
  return lastResult;
}

export function hasDisplayablePrice(...vals: unknown[]): boolean {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return true;
  }
  return false;
}
