import { apiFetch } from "./client";

export type DashboardResponse = {
  success: boolean;
  updatedAt: string;
  system: {
    trackingEnabled: boolean;
    schedulerEnabled: boolean;
    safeSchedulerRunning: boolean;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    healthOk: boolean;
  };
  cards: {
    scrapedTotal: number;
    scrapedToday: number;
    trackedTotal: number;
    trackedActive: number;
    pendingChanges: number;
    priceChanges: number;
    stockChanges: number;
    variantChanges: number;
  };
  recentChanges: ChangeRow[];
};

export type ChangeRow = {
  id: number;
  trackedProductId: number;
  changeType: string;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt?: string;
  productTitle?: string;
  productImageUrl?: string | null;
  sourceSite?: string;
  productUrl?: string;
  seenAt?: string | null;
  status?: string;
};

export type ScrapedProduct = {
  id: number;
  title: string;
  brand?: string | null;
  marketplace?: string;
  sourcePlatform?: string | null;
  currentPrice?: string | number | null;
  image?: string | null;
  images?: string[] | null;
  shopifyStatus?: string;
  shopifyProductId?: string | null;
  scrapedAt?: string;
  createdAt?: string;
  trendyolUrl?: string | null;
  stockStatus?: string | null;
};

export type TrackedProduct = {
  id: number;
  sourceTitle: string;
  sourceSite: string;
  sourceUrl: string;
  currentSourcePrice?: string | number | null;
  currentSourceStock?: number | null;
  trackingEnabled: boolean;
  lastCheckedAt?: string | null;
  lastSuccessAt?: string | null;
  productImageUrl?: string | null;
  shopifyProductId?: string | null;
  shopifySyncStatus?: string | null;
  currentStatus?: string;
};

export async function fetchDashboard() {
  return apiFetch<DashboardResponse>("/api/mobile/dashboard");
}

export async function fetchScrapedProducts(params: {
  q?: string;
  marketplace?: string;
  limit?: number;
  offset?: number;
}) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.marketplace) sp.set("marketplace", params.marketplace);
  sp.set("limit", String(params.limit ?? 40));
  sp.set("offset", String(params.offset ?? 0));
  return apiFetch<{
    success: boolean;
    products: ScrapedProduct[];
    pagination: { total: number; hasMore: boolean; limit: number; offset: number };
  }>(`/api/mobile/products?${sp.toString()}`);
}

export async function fetchScrapedProduct(id: number) {
  return apiFetch<{ success: boolean; product: ScrapedProduct & { tracking?: TrackedProduct | null } }>(
    `/api/mobile/products/${id}`,
  );
}

export async function fetchTrackedProducts() {
  return apiFetch<{ success: boolean; products: TrackedProduct[] }>(
    "/api/tracking/products",
  );
}

export async function fetchTrackedSnapshots(id: number) {
  return apiFetch<{ success: boolean; snapshots: unknown[] }>(
    `/api/tracking/products/${id}/snapshots`,
  );
}

export async function fetchTrackedVariants(id: number) {
  return apiFetch<{ success: boolean; variants: unknown[] }>(
    `/api/tracking/products/${id}/variants`,
  );
}

export async function fetchChanges(params?: { status?: string; productId?: number }) {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.productId) sp.set("productId", String(params.productId));
  const q = sp.toString();
  return apiFetch<{ success: boolean; changes: ChangeRow[] }>(
    `/api/tracking/changes${q ? `?${q}` : ""}`,
  );
}

export async function fetchNotifications() {
  return apiFetch<{
    success: boolean;
    pendingChangesCount: number;
    priceChangeCount: number;
    stockChangeCount: number;
    variantChangeCount: number;
    lastChanges: ChangeRow[];
  }>("/api/tracking/notifications");
}

export async function markChangeSeen(id: number) {
  return apiFetch<{ success: boolean; change: ChangeRow }>(
    `/api/tracking/changes/${id}/mark-seen`,
    { method: "POST", body: "{}" },
  );
}

export async function registerPushDevice(body: {
  deviceId: string;
  platform: string;
  pushToken: string;
  appVersion?: string;
}) {
  return apiFetch("/api/mobile/push/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
