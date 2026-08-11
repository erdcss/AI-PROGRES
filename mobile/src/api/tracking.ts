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
    shopifyMemoryTotal?: number;
    catalogTotal?: number;
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
  description?: string | null;
  category?: string | null;
  marketplace?: string;
  sourcePlatform?: string | null;
  currentPrice?: string | number | null;
  originalPrice?: string | number | null;
  image?: string | null;
  images?: unknown;
  colorOptions?: string[] | null;
  sizeOptions?: string[] | null;
  features?: Record<string, unknown> | null;
  shopifyStatus?: string;
  shopifyProductId?: string | null;
  shopifyUrl?: string | null;
  shopifyStoreUrl?: string | null;
  trendyolProductId?: string | null;
  uniqueTrackingId?: string | null;
  scrapedAt?: string;
  createdAt?: string;
  lastChecked?: string | null;
  lastSyncAt?: string | null;
  syncStatus?: string | null;
  trendyolUrl?: string | null;
  sourceUrl?: string | null;
  stockStatus?: string | null;
  isActive?: boolean | null;
  profitMargin?: string | number | null;
  watchTag?: string | null;
  variantCount?: number;
  variants?: ProductVariantRow[];
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
  createdAt?: string | null;
};

export type ProductVariantRow = {
  id?: number;
  title?: string;
  sourceVariantTitle?: string;
  option1?: string | null;
  option2?: string | null;
  color?: string | null;
  size?: string | null;
  sku?: string | null;
  barcode?: string | null;
  sourceSku?: string | null;
  price?: string | number | null;
  trendyolPrice?: string | number | null;
  shopifyPrice?: string | number | null;
  currentSourcePrice?: string | number | null;
  stockCount?: number | null;
  inventory_quantity?: number | null;
  inventoryQuantity?: number | null;
  currentSourceStock?: number | null;
  inStock?: boolean | null;
  shopifyVariantId?: string | null;
};

export type MemoryProduct = {
  id: number;
  title: string;
  handle?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  tags?: string[] | null;
  price?: string | number | null;
  compareAtPrice?: string | number | null;
  inventoryQuantity?: number | null;
  inventoryPolicy?: string | null;
  sku?: string | null;
  barcode?: string | null;
  weight?: string | number | null;
  weightUnit?: string | null;
  image?: string | null;
  images?: unknown;
  options?: unknown;
  metafields?: unknown;
  variants?: ProductVariantRow[] | unknown;
  variantCount?: number;
  sourceUrl?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  uniqueTrackingId?: string | null;
  createdAt?: string | null;
  lastSyncAt?: string | null;
  shopifyCreatedAt?: string | null;
  shopifyUpdatedAt?: string | null;
  isTracking?: boolean | null;
  tracking?: TrackedProduct | null;
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

export async function fetchTrackedProducts(params?: {
  includeArchived?: boolean;
  includeUnlinked?: boolean;
}) {
  const sp = new URLSearchParams();
  if (params?.includeArchived) sp.set("includeArchived", "true");
  if (params?.includeUnlinked) sp.set("includeUnlinked", "true");
  const q = sp.toString();
  return apiFetch<{ success: boolean; products: TrackedProduct[] }>(
    `/api/tracking/products${q ? `?${q}` : ""}`,
  );
}

export async function fetchMemoryProducts(params?: { limit?: number; offset?: number }) {
  const limit = params?.limit ?? 40;
  const offset = params?.offset ?? 0;
  const sp = new URLSearchParams();
  sp.set("limit", String(limit));
  sp.set("offset", String(offset));
  try {
    const page = await apiFetch<{
      success: boolean;
      products?: MemoryProduct[];
      pagination?: { total: number; hasMore: boolean; limit: number; offset: number };
    }>(`/api/mobile/memory-products?${sp.toString()}`);
    if (Array.isArray(page.products) && page.pagination) return { ...page, products: page.products, pagination: page.pagination };
  } catch {
    /* production henüz /api/mobile/memory-products yok */
  }
  const legacy = await apiFetch<{
    success: boolean;
    products?: MemoryProduct[];
    total?: number;
  }>(`/api/shopify/memory-products?${sp.toString()}`);
  const products = legacy.products || [];
  const total = Number(legacy.total ?? products.length);
  return {
    success: true,
    products,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + products.length < total && products.length > 0,
    },
  };
}

export async function fetchAllMemoryProducts(): Promise<{
  success: boolean;
  products: MemoryProduct[];
  pagination: { total: number; hasMore: boolean; limit: number; offset: number };
}> {
  const pageSize = 100;
  const products: MemoryProduct[] = [];
  let offset = 0;
  let total = 0;
  for (let i = 0; i < 50; i++) {
    const page = await fetchMemoryProducts({ limit: pageSize, offset });
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

export async function fetchMemoryProduct(id: number) {
  return apiFetch<{ success: boolean; product: MemoryProduct }>(
    `/api/mobile/memory-products/${id}`,
  );
}

export type ShopifyConnection = {
  success: boolean;
  connected: boolean;
  shopDomain?: string | null;
  canReadProducts?: boolean;
  canWriteProducts?: boolean;
  productCount?: number | null;
  error?: string | null;
};

export async function fetchShopifyConnection() {
  return apiFetch<ShopifyConnection>("/api/mobile/shopify-connection");
}

export type MobileScanStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  total: number;
  checked: number;
  skipped: number;
  errors: number;
  changesCreated: number;
  lastMessage: string;
};

export async function fetchMobileScan() {
  return apiFetch<{ success: boolean; scan: MobileScanStatus }>("/api/mobile/scan");
}

export async function startMobileScan() {
  return apiFetch<{ success: boolean; scan: MobileScanStatus }>("/api/mobile/scan", {
    method: "POST",
    body: "{}",
    timeoutMs: 30_000,
  });
}

export async function fetchTrackedSnapshots(id: number) {
  return apiFetch<{ success: boolean; snapshots: ProductSnapshot[] }>(
    `/api/tracking/products/${id}/snapshots`,
  );
}

export async function fetchTrackedVariants(id: number) {
  return apiFetch<{ success: boolean; variants: ProductVariantRow[] }>(
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

/** Tüm takip durumları — web panel `history` ile aynı kaynak. */
export async function fetchAllChanges(params?: { productId?: number }) {
  try {
    const all = await fetchChanges({ status: "history", productId: params?.productId });
    if (Array.isArray(all.changes)) {
      return all;
    }
  } catch {
    // eski API
  }
  const [actionable, seen, ignored, failed, applied] = await Promise.all([
    fetchChanges({ productId: params?.productId }),
    fetchChanges({ status: "seen", productId: params?.productId }),
    fetchChanges({ status: "ignored", productId: params?.productId }),
    fetchChanges({ status: "failed", productId: params?.productId }),
    fetchChanges({ status: "applied", productId: params?.productId }),
  ]);
  return {
    success: true as const,
    changes: mergeChanges(
      actionable.changes,
      seen.changes,
      ignored.changes,
      failed.changes,
      applied.changes,
    ),
  };
}

export async function fetchChangeCounts() {
  return apiFetch<{
    success: boolean;
    counts: {
      actionable: number;
      pending: number;
      manual_review: number;
      failed: number;
      ignored: number;
      seen: number;
      applied: number;
      all: number;
    };
  }>("/api/tracking/change-counts");
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

export type PushInboxItem = {
  id: number;
  title: string;
  body: string;
  data?: {
    type?: string;
    productId?: string;
    changeId?: string;
  };
  createdAt?: string;
};

export async function fetchPushInbox(afterId = 0) {
  return apiFetch<{ success: boolean; items: PushInboxItem[] }>(
    `/api/mobile/push/inbox?afterId=${encodeURIComponent(String(afterId))}`,
  );
}

export async function fetchPushInboxRecent(limit = 40) {
  return apiFetch<{ success: boolean; items: PushInboxItem[] }>(
    `/api/mobile/push/inbox?mode=recent&limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function clearPushInbox() {
  return apiFetch<{ success: boolean; deleted?: number }>("/api/mobile/push/inbox", {
    method: "DELETE",
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

export type NotificationSetting = {
  id: number;
  notificationType: string;
  enabled: boolean;
  description?: string | null;
};

export async function fetchNotificationSettings() {
  return apiFetch<{ success: boolean; settings: NotificationSetting[] }>(
    "/api/telegram/settings",
  );
}

export async function updateNotificationSetting(type: string, enabled: boolean) {
  return apiFetch(`/api/telegram/settings/${encodeURIComponent(type)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export async function toggleAllNotificationSettings(enabled: boolean) {
  return apiFetch("/api/telegram/settings/toggle-all", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function sendMobileNotificationTest() {
  return apiFetch<{ success: boolean; message?: string }>("/api/notifications/test", {
    method: "POST",
  });
}
