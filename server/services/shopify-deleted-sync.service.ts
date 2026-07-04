import { db } from "../db";
import {
  detectedChanges,
  shopifyMemoryProducts,
  shopifyTransferredProducts,
  trackedProducts,
} from "@shared/schema";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import { ShopifyProductsManager } from "../shopify-products-manager";
import { ShopifyApiService } from "../shopify-api-service";
import { trackingService } from "./tracking.service";

export type ShopifyDeletedSyncResult = {
  success: boolean;
  shopifyProductCount: number;
  trackedDisabled: number;
  transferredUpdated: number;
  memoryRemoved: number;
  changesSuperseded: number;
  items: Array<{ title: string; shopifyProductId: string; source: "tracked" | "transferred" }>;
  message: string;
  error?: string;
};

/** Shopify mağazasındaki ürünlerle DB kayıtlarını karşılaştırır; silinenleri temizler */
export async function syncShopifyDeletedProducts(): Promise<ShopifyDeletedSyncResult> {
  const empty: ShopifyDeletedSyncResult = {
    success: false,
    shopifyProductCount: 0,
    trackedDisabled: 0,
    transferredUpdated: 0,
    memoryRemoved: 0,
    changesSuperseded: 0,
    items: [],
    message: "",
  };

  try {
    const manager = new ShopifyProductsManager();
    const shopifyProducts = await manager.fetchAllShopifyProducts();
    const liveIds = new Set(shopifyProducts.map((p) => p.id.toString()));

    const api = new ShopifyApiService();
    await api.syncAllProducts();

    const items: ShopifyDeletedSyncResult["items"] = [];
    const affectedTrackedIds: number[] = [];

    const trackedRows = await db
      .select()
      .from(trackedProducts)
      .where(isNotNull(trackedProducts.shopifyProductId));

    for (const row of trackedRows) {
      const sid = row.shopifyProductId?.trim();
      if (!sid || liveIds.has(sid)) continue;

      await db
        .update(trackedProducts)
        .set({
          trackingEnabled: false,
          currentStatus: "shopify_deleted",
          lastErrorMessage: "Shopify mağazasında ürün bulunamadı",
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trackedProducts.id, row.id));

      affectedTrackedIds.push(row.id);
      items.push({
        title: row.sourceTitle,
        shopifyProductId: sid,
        source: "tracked",
      });
    }

    const transferredRows = await db.select().from(shopifyTransferredProducts);
    let transferredUpdated = 0;

    for (const row of transferredRows) {
      const sid = row.shopifyProductId?.trim();
      if (!sid || liveIds.has(sid)) continue;

      await db
        .update(shopifyTransferredProducts)
        .set({
          trackingEnabled: false,
          currentStatus: "deleted",
          updatedAt: new Date(),
        })
        .where(eq(shopifyTransferredProducts.id, row.id));

      transferredUpdated++;
      if (!items.some((i) => i.shopifyProductId === sid)) {
        items.push({
          title: row.title,
          shopifyProductId: sid,
          source: "transferred",
        });
      }
    }

    const memoryRows = await db
      .select({
        id: shopifyMemoryProducts.id,
        shopifyProductId: shopifyMemoryProducts.shopifyProductId,
      })
      .from(shopifyMemoryProducts);

    let memoryRemoved = 0;
    for (const row of memoryRows) {
      if (liveIds.has(row.shopifyProductId)) continue;
      await db
        .delete(shopifyMemoryProducts)
        .where(eq(shopifyMemoryProducts.id, row.id));
      memoryRemoved++;
    }

    let changesSuperseded = 0;
    if (affectedTrackedIds.length > 0) {
      const superseded = await db
        .update(detectedChanges)
        .set({
          status: "superseded",
          reason: "Shopify ürünü mağazadan silindi",
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(detectedChanges.trackedProductId, affectedTrackedIds),
            inArray(detectedChanges.status, ["pending", "manual_review", "approved"]),
          ),
        )
        .returning({ id: detectedChanges.id });
      changesSuperseded = superseded.length;
    }

    await trackingService.writeSyncLog({
      action: "shopify_deleted_sync",
      status: "success",
      message: `${items.length} silinen Shopify ürünü işlendi`,
      meta: {
        shopifyProductCount: liveIds.size,
        trackedDisabled: items.filter((i) => i.source === "tracked").length,
        transferredUpdated,
        memoryRemoved,
        changesSuperseded,
      },
    });

    const trackedDisabled = items.filter((i) => i.source === "tracked").length;
    const message =
      items.length === 0
        ? `Shopify senkron tamam — ${liveIds.size} aktif ürün, silinen kayıt yok`
        : `${trackedDisabled} takip devre dışı, ${transferredUpdated} transfer kaydı güncellendi, ${memoryRemoved} bellek kaydı silindi`;

    return {
      success: true,
      shopifyProductCount: liveIds.size,
      trackedDisabled,
      transferredUpdated,
      memoryRemoved,
      changesSuperseded,
      items,
      message,
    };
  } catch (err) {
    const error = (err as Error).message;
    await trackingService
      .writeSyncLog({
        action: "shopify_deleted_sync",
        status: "error",
        message: error,
      })
      .catch(() => undefined);

    return { ...empty, error, message: error };
  }
}
