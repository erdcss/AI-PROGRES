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

export function isActionableTrackingChangeStatus(status: string): boolean {
  return ACTIONABLE_STATUSES.has(String(status ?? ""));
}

export function isDirectlyApplicableTrackingChange(
  changeType: string,
  _fieldName?: string | null,
  newValue?: unknown,
): boolean {
  if (changeType === "stock_changed") return false;
  if (changeType === "variant_stock_changed") {
    return newValue === false || newValue === "false" || newValue === 0;
  }
  return DIRECTLY_APPLICABLE_CHANGE_TYPES.has(String(changeType ?? ""));
}
