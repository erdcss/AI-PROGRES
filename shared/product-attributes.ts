/**
 * Canonical product attribute model + legacy adapters.
 * Attribute values are never invented here — only normalized.
 */

export type ProductAttributeSource =
  | "trendyol-json"
  | "trendyol-jsonld"
  | "trendyol-dom"
  | "trendyol-script"
  | "legacy"
  | "unknown";

export type ProductAttribute = {
  name: string;
  value: string;
  source?: ProductAttributeSource | string;
  position?: number;
};

export type LegacyProductAttributes = Record<string, string>;

export type ProductAttributesInput =
  | LegacyProductAttributes
  | ProductAttribute[]
  | Array<{ key?: string; name?: string; value?: string; source?: string; position?: number }>
  | null
  | undefined;

export function cleanAttributeName(name: string): string {
  return String(name || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[:"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanAttributeValue(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Generic rejection rules — no product-specific values. */
export function isPlausibleAttributePair(name: string, value: string): boolean {
  const n = cleanAttributeName(name);
  const v = cleanAttributeValue(value);
  if (!n || !v) return false;
  if (n.length < 2 || n.length > 80) return false;
  if (v.length < 1 || v.length > 500) return false;
  if (n.toLowerCase() === v.toLowerCase()) return false;
  if (/^https?:\/\//i.test(v) || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(v)) return false;
  if (/fiyat|price|http|www\.|\.com/i.test(n)) return false;
  // Seller / logistics noise keys (structural, not product-value hardcoding)
  if (
    /vergi|ünvan|unvan|adres|semt|sokak|mahalle|cadde|iletişim|iletisim|müşteri destek|musteri destek|kargo ücreti|iade politik/i.test(
      n,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Normalize any legacy/runtime attribute shape into canonical ProductAttribute[].
 * Preserves input order (does not alphabetize or prioritize known keys).
 */
export function normalizeProductAttributes(input: ProductAttributesInput): ProductAttribute[] {
  if (!input) return [];

  const out: ProductAttribute[] = [];
  const seen = new Set<string>();

  const push = (
    rawName: unknown,
    rawValue: unknown,
    source?: string,
    position?: number,
  ) => {
    const name = cleanAttributeName(String(rawName ?? ""));
    const value = cleanAttributeValue(String(rawValue ?? ""));
    if (!isPlausibleAttributePair(name, value)) return;
    const dedupe = `${name.toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push({
      name,
      value,
      source: source || "legacy",
      position: position ?? out.length,
    });
  };

  if (Array.isArray(input)) {
    input.forEach((row, i) => {
      if (!row || typeof row !== "object") return;
      const r = row as Record<string, unknown>;
      push(r.name ?? r.key, r.value, r.source ? String(r.source) : "legacy", typeof r.position === "number" ? r.position : i);
    });
    return out;
  }

  if (typeof input === "object") {
    let i = 0;
    for (const [k, v] of Object.entries(input)) {
      push(k, v, "legacy", i++);
    }
  }

  return out;
}

/** Runtime scrape / CSV / Shopify shape used across this codebase. */
export function attributesToFeaturePairs(
  attrs: ProductAttribute[],
): Array<{ key: string; value: string }> {
  return attrs.map((a) => ({ key: a.name, value: a.value }));
}

/**
 * Union feature lists without inventing values.
 * Accepts `{key,value}`, `{name,value}`, or a legacy record.
 * Later lists fill missing names; existing name+value pairs are kept.
 */
export function mergeProductFeaturePairs(
  ...lists: Array<ProductAttributesInput>
): Array<{ key: string; value: string }> {
  const combined: Array<{ key?: string; name?: string; value?: string }> = [];
  for (const list of lists) {
    if (!list) continue;
    if (Array.isArray(list)) {
      for (const row of list) {
        if (row && typeof row === "object") combined.push(row);
      }
      continue;
    }
    if (typeof list === "object") {
      for (const [key, value] of Object.entries(list)) {
        combined.push({ key, value: String(value ?? "") });
      }
    }
  }
  return attributesToFeaturePairs(normalizeProductAttributes(combined));
}

export function attributesToLegacyRecord(attrs: ProductAttribute[]): LegacyProductAttributes {
  const record: LegacyProductAttributes = {};
  for (const a of attrs) {
    if (!(a.name in record)) record[a.name] = a.value;
  }
  return record;
}
