import { shopifyAdminFetch, parseShopifyAdminResponse } from "../shopify-token-manager";

export type ShopifyVariantMapping = {
  sourceVariantKey: string;
  sku: string;
  option1?: string;
  option2?: string;
  shopifyVariantId: string;
  shopifyVariantGid?: string;
  inventoryItemId?: string;
};

/** Read-only: fetch Shopify product variants after create/update */
export async function fetchShopifyVariantMappings(
  productId: string,
): Promise<ShopifyVariantMapping[]> {
  const { response } = await shopifyAdminFetch(`/products/${productId}.json`, { method: "GET" });
  if (!response.ok) return [];

  const data = (await parseShopifyAdminResponse(response)) as {
    product?: {
      variants?: Array<{
        id: number;
        sku?: string;
        option1?: string;
        option2?: string;
        inventory_item_id?: number;
      }>;
    };
  };

  return (data.product?.variants || []).map((v) => ({
    sourceVariantKey: `${v.option1 || ""}|${v.option2 || ""}|${v.sku || ""}`,
    sku: v.sku || "",
    option1: v.option1,
    option2: v.option2,
    shopifyVariantId: String(v.id),
    shopifyVariantGid: `gid://shopify/ProductVariant/${v.id}`,
    inventoryItemId: v.inventory_item_id ? String(v.inventory_item_id) : undefined,
  }));
}
