/**
 * Legacy attribute cleaner — no invented product values.
 * Prefer shared/product-attributes normalizeProductAttributes for new code.
 */
import {
  attributesToLegacyRecord,
  normalizeProductAttributes,
} from "@shared/product-attributes";

/**
 * Clean attributes without inventing values from description heuristics.
 * Description is ignored for value synthesis (hardcoded maps removed).
 */
export function cleanTrendyolAttributes(
  attributes: Record<string, string>,
  _description?: string,
): Record<string, string> {
  return attributesToLegacyRecord(normalizeProductAttributes(attributes || {}));
}
