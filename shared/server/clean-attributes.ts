/**
 * Legacy attribute cleaner — no invented product values.
 */
import {
  attributesToLegacyRecord,
  normalizeProductAttributes,
} from "../product-attributes";

export function cleanTrendyolAttributes(
  attributes: Record<string, string>,
  _description?: string,
): Record<string, string> {
  return attributesToLegacyRecord(normalizeProductAttributes(attributes || {}));
}
