import type { ChangeRow } from "../api/tracking";

const DIRECT = new Set([
  "price_changed",
  "variant_price_changed",
  "variant_stock_changed",
  "title_changed",
  "variant_added",
  "variant_removed",
  "product_removed",
  "product_out_of_stock",
  "source_unavailable",
]);

const ACTIONABLE = new Set(["pending", "manual_review", "approved", "failed"]);

function stockUnavailable(newValue: unknown): boolean {
  if (typeof newValue === "boolean") return newValue === false;
  if (newValue === 0 || newValue === "false") return true;
  if (newValue && typeof newValue === "object" && "inStock" in (newValue as object)) {
    return stockUnavailable((newValue as { inStock: unknown }).inStock);
  }
  return false;
}

export function isDirectlyApplicableTrackingChange(
  changeType: string,
  fieldName?: string | null,
  newValue?: unknown,
): boolean {
  if (changeType === "stock_changed") {
    return fieldName === "available" || stockUnavailable(newValue);
  }
  if (changeType === "variant_stock_changed") {
    return stockUnavailable(newValue);
  }
  return DIRECT.has(String(changeType ?? ""));
}

export function canOneTapShopifyFix(item: Pick<ChangeRow, "status" | "changeType" | "fieldName" | "newValue">): boolean {
  const status = String(item.status || "pending");
  if (!ACTIONABLE.has(status)) return false;
  return isDirectlyApplicableTrackingChange(item.changeType, item.fieldName, item.newValue);
}
