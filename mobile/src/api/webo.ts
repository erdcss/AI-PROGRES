import { apiFetch } from "./client";

export type WeboProduct = {
  id: number;
  sourceUrl: string;
  title: string;
  siteName: string;
  siteLogoUrl: string;
  price?: number | null;
  salePrice?: number | null;
  currency?: string;
  imageUrl?: string | null;
  images?: string[];
  brand?: string | null;
  sku?: string | null;
  source?: string;
  createdAt?: string;
};

export async function fetchWeboProducts(limit = 60) {
  return apiFetch<{ success: boolean; products: WeboProduct[]; total: number }>(
    `/api/mobile/webo/products?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function transferWeboProductToShopify(id: number) {
  return apiFetch<{
    success: boolean;
    productId?: string;
    handle?: string;
    shopifyPrice?: number;
    error?: string;
  }>(`/api/mobile/webo/products/${id}/shopify-transfer`, {
    method: "POST",
    body: "{}",
    timeoutMs: 60_000,
  });
}
