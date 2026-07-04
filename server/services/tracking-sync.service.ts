import { isCloudRuntime } from "@shared/deploy-runtime";
import { shopifyTransferredProducts, trackedProducts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { getTrackingSettings, updateTrackingSettings } from "./tracking-settings.service";
import { trackingService } from "./tracking.service";

/** Yerel geliştirmede takip + scheduler varsayılan olarak açık kalsın */
export async function ensureLocalTrackingAutoStart(): Promise<void> {
  if (isCloudRuntime()) return;

  const settings = await getTrackingSettings();
  if (settings.trackingEnabled && settings.schedulerEnabled) return;

  await updateTrackingSettings({
    trackingEnabled: true,
    schedulerEnabled: true,
  });
  console.info("✅ Yerel ortam: ürün takibi ve scheduler otomatik etkinleştirildi");
}

/** Shopify aktarım kayıtlarını v2 tracked_products tablosuyla senkronize et */
export async function syncTransferredProductsToTracking(): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  const transferred = await db
    .select()
    .from(shopifyTransferredProducts)
    .where(eq(shopifyTransferredProducts.trackingEnabled, true))
    .limit(500);

  for (const row of transferred) {
    if (!row.sourceUrl?.trim() || !row.shopifyProductId?.trim()) {
      skipped++;
      continue;
    }

    const existing = await db
      .select({ id: trackedProducts.id })
      .from(trackedProducts)
      .where(eq(trackedProducts.sourceUrl, row.sourceUrl))
      .limit(1);
    if (existing[0]) {
      skipped++;
      continue;
    }

    const price = Number(row.originalPrice ?? row.shopifyPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      skipped++;
      continue;
    }

    try {
      await trackingService.registerFromShopifyUpload({
        sourceUrl: row.sourceUrl,
        title: row.title,
        price,
        shopifyProductId: row.shopifyProductId,
        shopifyHandle: row.shopifyHandle ?? undefined,
      });
      synced++;
    } catch (err) {
      console.warn(`⚠️ Takip senkronu atlandı (${row.sourceUrl}):`, (err as Error).message);
      errors++;
    }
  }

  if (synced > 0) {
    console.info(`✅ ${synced} Shopify aktarım kaydı v2 takibe senkronize edildi`);
  }

  return { synced, skipped, errors };
}
