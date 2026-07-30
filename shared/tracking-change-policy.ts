const DIRECTLY_APPLICABLE_CHANGE_TYPES = new Set([
  "price_changed",
  "variant_price_changed",
  "variant_stock_changed",
  "title_changed",
]);

const ACTIONABLE_STATUSES = new Set([
  "pending",
  "manual_review",
  "approved",
  "failed",
]);

const VARIANT_LINKED_CHANGE_TYPES = new Set([
  "variant_stock_changed",
  "variant_price_changed",
]);

export function isActionableTrackingChangeStatus(status: string): boolean {
  return ACTIONABLE_STATUSES.has(String(status ?? ""));
}

/** Boolean / { inStock } / string formlarından stok müsaitliğini çıkarır */
export function extractVariantStockAvailability(newValue: unknown): boolean | null {
  if (typeof newValue === "boolean") return newValue;
  if (newValue === 0) return false;
  if (newValue === 1) return true;
  if (newValue === "true") return true;
  if (newValue === "false") return false;
  if (newValue && typeof newValue === "object" && "inStock" in (newValue as object)) {
    return extractVariantStockAvailability((newValue as { inStock: unknown }).inStock);
  }
  return null;
}

export function requiresShopifyVariantLink(changeType: string): boolean {
  return VARIANT_LINKED_CHANGE_TYPES.has(String(changeType ?? ""));
}

export function isDirectlyApplicableTrackingChange(
  changeType: string,
  _fieldName?: string | null,
  newValue?: unknown,
): boolean {
  if (changeType === "stock_changed") return false;
  if (changeType === "variant_stock_changed") {
    return extractVariantStockAvailability(newValue) === false;
  }
  return DIRECTLY_APPLICABLE_CHANGE_TYPES.has(String(changeType ?? ""));
}

/** UI / toplu Shopify senkronu: uygulanabilir + ürün/varyant bağlantısı hazır */
export function isShopifySyncableTrackingChange(input: {
  status: string;
  changeType: string;
  fieldName?: string | null;
  newValue?: unknown;
  trackingUid?: string | null;
  shopifyProductId?: string | null;
  trackedVariantId?: number | null;
  shopifyVariantId?: string | null;
}): boolean {
  if (!isActionableTrackingChangeStatus(input.status)) return false;
  if (
    !isDirectlyApplicableTrackingChange(input.changeType, input.fieldName, input.newValue)
  ) {
    return false;
  }
  if (!input.trackingUid || !input.shopifyProductId) return false;
  if (requiresShopifyVariantLink(input.changeType)) {
    return Boolean(input.trackedVariantId || input.shopifyVariantId);
  }
  return true;
}
