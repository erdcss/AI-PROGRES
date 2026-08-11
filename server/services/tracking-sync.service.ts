import { isCloudRuntime } from "@shared/deploy-runtime";
import { products, shopifyMemoryProducts, shopifyTransferredProducts, trackedProducts } from "@shared/schema";
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

function positivePrice(...values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Shopify hafızası + scrape kataloğundan takip kaydı açar.
 * Canlıda memory dolu / tracked boş kaldığında mobil ve web aynı takibi görür.
 */
export async function syncShopifyMemoryToTracking(): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  const transferredResult = await syncTransferredProductsToTracking();
  let synced = transferredResult.synced;
  let skipped = transferredResult.skipped;
  let errors = transferredResult.errors;

  const [memoryRows, transferredRows, scrapedRows, trackedRows] = await Promise.all([
    db.select().from(shopifyMemoryProducts),
    db.select().from(shopifyTransferredProducts),
    db
      .select({
        trendyolUrl: products.trendyolUrl,
        shopifyProductId: products.shopifyProductId,
        title: products.title,
        currentPrice: products.currentPrice,
        originalPrice: products.originalPrice,
      })
      .from(products),
    db
      .select({
        sourceUrl: trackedProducts.sourceUrl,
        shopifyProductId: trackedProducts.shopifyProductId,
      })
      .from(trackedProducts),
  ]);

  const transferredByShopify = new Map(
    transferredRows
      .filter((row) => row.shopifyProductId)
      .map((row) => [String(row.shopifyProductId), row] as const),
  );
  const scrapedByShopify = new Map(
    scrapedRows
      .filter((row) => row.shopifyProductId)
      .map((row) => [String(row.shopifyProductId), row] as const),
  );
  const trackedUrls = new Set(
    trackedRows.map((row) => String(row.sourceUrl || "").trim().toLowerCase()).filter(Boolean),
  );
  const trackedShopify = new Set(
    trackedRows.map((row) => String(row.shopifyProductId || "").trim()).filter(Boolean),
  );

  const candidates: Array<{
    sourceUrl: string;
    title: string;
    price: number;
    shopifyProductId: string;
    shopifyHandle?: string;
  }> = [];

  for (const memory of memoryRows) {
    const shopifyProductId = String(memory.shopifyProductId || "").trim();
    if (!shopifyProductId) {
      skipped++;
      continue;
    }
    const transferred = transferredByShopify.get(shopifyProductId);
    const scraped = scrapedByShopify.get(shopifyProductId);
    const sourceUrl = String(
      memory.sourceUrl || transferred?.sourceUrl || scraped?.trendyolUrl || "",
    ).trim();
    if (!sourceUrl) {
      skipped++;
      continue;
    }
    const price = positivePrice(
      transferred?.originalPrice,
      transferred?.shopifyPrice,
      scraped?.originalPrice,
      scraped?.currentPrice,
      memory.price,
    );
    if (price == null) {
      skipped++;
      continue;
    }
    candidates.push({
      sourceUrl,
      title: memory.title || scraped?.title || transferred?.title || "Ürün",
      price,
      shopifyProductId,
      shopifyHandle: memory.handle || transferred?.shopifyHandle || undefined,
    });
  }

  for (const scraped of scrapedRows) {
    const sourceUrl = String(scraped.trendyolUrl || "").trim();
    const shopifyProductId = String(scraped.shopifyProductId || "").trim();
    if (!sourceUrl || !shopifyProductId) continue;
    if (candidates.some((c) => c.shopifyProductId === shopifyProductId || c.sourceUrl === sourceUrl)) {
      continue;
    }
    const price = positivePrice(scraped.originalPrice, scraped.currentPrice);
    if (price == null) continue;
    candidates.push({
      sourceUrl,
      title: scraped.title,
      price,
      shopifyProductId,
    });
  }

  for (const item of candidates) {
    const urlKey = item.sourceUrl.toLowerCase();
    if (trackedUrls.has(urlKey) || trackedShopify.has(item.shopifyProductId)) {
      skipped++;
      continue;
    }
    try {
      await trackingService.registerFromShopifyUpload({
        sourceUrl: item.sourceUrl,
        title: item.title,
        price: item.price,
        shopifyProductId: item.shopifyProductId,
        shopifyHandle: item.shopifyHandle,
      });
      trackedUrls.add(urlKey);
      trackedShopify.add(item.shopifyProductId);
      if (item.sourceUrl) {
        await db
          .update(shopifyMemoryProducts)
          .set({ sourceUrl: item.sourceUrl, isTracking: true, updatedAt: new Date() })
          .where(eq(shopifyMemoryProducts.shopifyProductId, item.shopifyProductId));
      }
      synced++;
    } catch (err) {
      console.warn(`⚠️ Hafıza → takip atlandı (${item.sourceUrl}):`, (err as Error).message);
      errors++;
    }
  }

  if (synced > 0) {
    console.info(`✅ Shopify katalogdan ${synced} ürün takibe alındı`);
  }
  return { synced, skipped, errors };
}

let catalogSyncRunning = false;
let catalogSyncAt = 0;

export function scheduleShopifyMemoryTrackingSync(): void {
  if (catalogSyncRunning) return;
  if (Date.now() - catalogSyncAt < 5 * 60 * 1000) return;
  catalogSyncRunning = true;
  void syncShopifyMemoryToTracking()
    .catch((err) => {
      console.warn("⚠️ Shopify hafıza → takip senkronu:", err);
    })
    .finally(() => {
      catalogSyncRunning = false;
      catalogSyncAt = Date.now();
    });
}
