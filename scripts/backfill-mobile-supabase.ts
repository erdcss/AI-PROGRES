/**
 * Mevcut tracking / products verisini Supabase mobile_* tablolarına backfill eder.
 * SAFE: upsert only. Komut: npm run mobile:supabase:backfill
 */
import "dotenv/config";
import { desc, eq, isNull, ne, and } from "drizzle-orm";
import { db } from "../server/db";
import {
  detectedChanges,
  productSnapshots,
  products,
  trackedProducts,
} from "../shared/schema";
import { isSupabaseConfigured } from "../server/lib/supabase-admin";
import {
  syncTrackingChange,
  upsertMobileProduct,
} from "../server/services/mobile-sync.service";
import { refreshAndSyncDashboardStats } from "../server/services/mobile-dashboard.service";

async function main() {
  if (!isSupabaseConfigured()) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli");
    process.exit(1);
  }

  console.log("→ Backfill tracked products…");
  const tracked = await db
    .select()
    .from(trackedProducts)
    .where(and(ne(trackedProducts.currentStatus, "shopify_deleted"), isNull(trackedProducts.archivedAt)))
    .limit(2000);

  let n = 0;
  for (const p of tracked) {
    const [snap] = await db
      .select()
      .from(productSnapshots)
      .where(eq(productSnapshots.trackedProductId, p.id))
      .orderBy(desc(productSnapshots.createdAt))
      .limit(1);
    const images = Array.isArray(snap?.images) ? (snap!.images as string[]) : [];
    await upsertMobileProduct({
      sourceProductId: String(p.sourceProductId || p.id),
      source: p.sourceSite || "unknown",
      title: p.sourceTitle,
      imageUrl: images[0] || null,
      sourceUrl: p.sourceUrl,
      price: p.currentSourcePrice != null ? Number(p.currentSourcePrice) : null,
      variantCount: Array.isArray(snap?.variants) ? (snap!.variants as unknown[]).length : 0,
      stockStatus:
        p.currentSourceStock != null
          ? p.currentSourceStock > 0
            ? "in_stock"
            : "out_of_stock"
          : null,
      shopifyStatus: p.shopifyProductId ? "linked" : "none",
      trackingProductId: p.id,
      trackingEnabled: p.trackingEnabled,
      scrapedAt: p.createdAt,
      lastCheckedAt: p.lastCheckedAt,
    });
    n++;
  }
  console.log(`  ✓ ${n} tracked products`);

  console.log("→ Backfill memory products…");
  const mem = await db.select().from(products).where(eq(products.isActive, true)).limit(2000);
  let m = 0;
  for (const p of mem) {
    const imgs = Array.isArray(p.images) ? (p.images as string[]) : [];
    await upsertMobileProduct({
      sourceProductId: String(p.id),
      source: String(p.sourcePlatform || "memory").toLowerCase(),
      title: p.title,
      imageUrl: imgs[0] || null,
      sourceUrl: p.trendyolUrl,
      price: p.currentPrice != null ? Number(p.currentPrice) : null,
      stockStatus: p.stockStatus || null,
      shopifyStatus: p.shopifyProductId ? "linked" : "none",
      scrapedAt: p.createdAt,
      lastCheckedAt: p.lastChecked,
    });
    m++;
  }
  console.log(`  ✓ ${m} memory products`);

  console.log("→ Backfill recent changes…");
  const changes = await db
    .select()
    .from(detectedChanges)
    .orderBy(desc(detectedChanges.createdAt))
    .limit(500);
  let c = 0;
  for (const ch of changes) {
    await syncTrackingChange(ch, { skipPush: true });
    c++;
  }
  console.log(`  ✓ ${c} changes`);

  console.log("→ Dashboard stats…");
  await refreshAndSyncDashboardStats();
  console.log("✓ Backfill tamam");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
