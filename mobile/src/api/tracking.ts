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
    autoShopifySyncEnabled?: boolean;
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
    watchRed?: number;
    watchGreen?: number;
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
  watchTag?: string | null;
  applyStatus?: string | null;
  trackingUid?: string | null;
  shopifyProductId?: string | null;
  trackedVariantId?: number | null;
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
  watchTag?: string | null;
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
  watchTag?: string | null;
  checkIntervalMinutes?: number | null;
};

export async function fetchDashboard() {
  return apiFetch<DashboardResponse>("/api/mobile/dashboard");
}

export type ProductSnapshot = {
  id: number;
  title?: string;
  price?: string | number | null;
  stock?: number | null;
  available?: boolean | null;
  images?: string[] | null;
  createdAt?: string;
};

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

export async function fetchAllScrapedProducts(): Promise<{
  success: boolean;
  products: ScrapedProduct[];
  pagination: { total: number; hasMore: boolean; limit: number; offset: number };
}> {
  const pageSize = 100;
  const products: ScrapedProduct[] = [];
  let offset = 0;
  let total = 0;
  for (let i = 0; i < 50; i++) {
    const page = await fetchScrapedProducts({ limit: pageSize, offset });
    const batch = page.products || [];
    products.push(...batch);
    total = page.pagination?.total ?? products.length;
    if (!page.pagination?.hasMore || batch.length === 0) break;
    offset += pageSize;
  }
  return {
    success: true,
    products,
    pagination: { total, hasMore: false, limit: products.length, offset: 0 },
  };
}

export async function fetchScrapedProduct(id: number) {
  return apiFetch<{ success: boolean; product: ScrapedProduct & { tracking?: TrackedProduct | null } }>(
    `/api/mobile/products/${id}`,
  );
}

export async function fetchTrackedProducts(params?: { includeArchived?: boolean }) {
  const sp = new URLSearchParams();
  if (params?.includeArchived) sp.set("includeArchived", "true");
  const q = sp.toString();
  return apiFetch<{ success: boolean; products: TrackedProduct[] }>(
    `/api/tracking/products${q ? `?${q}` : ""}`,
  );
}

export async function fetchTrackedSnapshots(id: number) {
  return apiFetch<{ success: boolean; snapshots: ProductSnapshot[] }>(
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

function mergeChanges(...lists: Array<ChangeRow[] | undefined>): ChangeRow[] {
  const map = new Map<number, ChangeRow>();
  for (const list of lists) {
    for (const row of list || []) {
      if (row?.id != null) map.set(row.id, row);
    }
  }
  return [...map.values()].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}

/** Tüm takip durumları — üretimde `status=all` yoksa bilinen filtrelere düşer. */
export async function fetchAllChanges(params?: { productId?: number }) {
  try {
    const all = await fetchChanges({ status: "all", productId: params?.productId });
    if (all.changes?.length) {
      return all;
    }
  } catch {
    // eski API
  }
  const [actionable, seen, ignored, failed] = await Promise.all([
    fetchChanges({ productId: params?.productId }),
    fetchChanges({ status: "seen", productId: params?.productId }),
    fetchChanges({ status: "ignored", productId: params?.productId }),
    fetchChanges({ status: "failed", productId: params?.productId }),
  ]);
  return {
    success: true as const,
    changes: mergeChanges(
      actionable.changes,
      seen.changes,
      ignored.changes,
      failed.changes,
    ),
  };
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

export async function shopifySyncChange(id: number) {
  return apiFetch<{
    success: boolean;
    change?: ChangeRow;
    skipped?: boolean;
    shopify?: { message?: string; success?: boolean };
    error?: string;
  }>(`/api/tracking/changes/${id}/shopify-sync`, {
    method: "POST",
    body: JSON.stringify({ actor: "orvian-monitor" }),
    timeoutMs: 60_000,
  });
}

export async function fetchTrackingSettings() {
  return apiFetch<{
    success: boolean;
    settings: {
      trackingEnabled: boolean;
      schedulerEnabled: boolean;
      autoShopifySyncEnabled: boolean;
    };
  }>("/api/tracking/settings");
}

export async function updateTrackingSettings(patch: { autoShopifySyncEnabled?: boolean }) {
  return apiFetch<{
    success: boolean;
    settings: {
      trackingEnabled: boolean;
      schedulerEnabled: boolean;
      autoShopifySyncEnabled: boolean;
    };
  }>("/api/tracking/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function setWatchTag(body: {
  tag: "red" | "green" | null;
  trackedProductId?: number;
  scrapedProductId?: number;
}) {
  return apiFetch<{
    success: boolean;
    tag: "red" | "green" | null;
    checkIntervalMinutes: number | null;
    trackedProductId: number | null;
    scrapedProductId: number | null;
  }>("/api/tracking/watch-tag", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
