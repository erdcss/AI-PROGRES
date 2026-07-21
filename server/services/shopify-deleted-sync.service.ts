import { reconcileShopifyTracking } from "./shopify-tracking-reconciliation.service";

export type ShopifyDeletedSyncResult = {
  success: boolean;
  shopifyProductCount: number;
  trackedDisabled: number;
  transferredUpdated: number;
  memoryRemoved: number;
  changesSuperseded: number;
  restored?: number;
  items: Array<{ title: string; shopifyProductId: string; source: "tracked" | "transferred" }>;
  message: string;
  error?: string;
};

/**
 * Legacy endpoint uyumluluğu.
 * Tüm katalog listesini karşılaştırmak yerine kayıtlı Shopify kimliklerini
 * fail-closed GraphQL reconciliation servisiyle doğrular.
 */
export async function syncShopifyDeletedProducts(): Promise<ShopifyDeletedSyncResult> {
  const result = await reconcileShopifyTracking();
  return {
    success: result.success,
    shopifyProductCount: result.live,
    trackedDisabled: result.archived,
    transferredUpdated: result.archived,
    memoryRemoved: result.archived,
    changesSuperseded: result.superseded,
    restored: result.restored,
    items: result.items
      .filter((item) => item.state === "missing")
      .map((item) => ({
        title: `Takip ürünü #${item.trackedProductId}`,
        shopifyProductId: item.productId ?? "",
        source: "tracked" as const,
      })),
    message: result.message,
    error: result.error,
  };
}
