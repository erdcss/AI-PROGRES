import { apiFetch } from "./client";

export type WeboProduct = {
  id: number;
  sourceUrl: string;
  title: string;
  siteId?: string | null;
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
  tags?: string[];
  createdAt?: string;
};

export type WeboSiteCatalog = {
  id: string;
  name: string;
  domain: string;
  logoUrl: string;
  source: string;
  pendingCount: number;
};

export type WeboDiscoverySummary = {
  sitesScanned: number;
  found: number;
  ingested: number;
  skippedShopify: number;
  errors: number;
};

export async function fetchWeboSites() {
  return apiFetch<{ success: boolean; sites: WeboSiteCatalog[] }>("/api/mobile/webo/sites");
}

export async function fetchWeboProducts(limit = 80, siteId?: string | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (siteId) params.set("siteId", siteId);
  return apiFetch<{
    success: boolean;
    products: WeboProduct[];
    total: number;
    note?: string;
  }>(`/api/mobile/webo/products?${params.toString()}`);
}

export async function fetchWeboProduct(id: number) {
  return apiFetch<{ success: boolean; product: WeboProduct }>(
    `/api/mobile/webo/products/${id}`,
  );
}

export async function runWeboDiscoveryScan() {
  return apiFetch<{
    success: boolean;
    summary?: WeboDiscoverySummary;
    error?: string;
  }>("/api/mobile/webo/discovery/run", {
    method: "POST",
    body: "{}",
    timeoutMs: 300_000,
  });
}

export async function addWeboTags(productIds: number[], tags: string[]) {
  return apiFetch<{ success: boolean; updated: number; error?: string }>(
    "/api/mobile/webo/tags",
    {
      method: "POST",
      body: JSON.stringify({ productIds, tags }),
    },
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
