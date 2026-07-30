/**
 * Takip değişikliklerinde varyant anahtarı → tracked_variants eşlemesi.
 * Fiyat/stok değişikliklerinde old/new sayısal olduğu için variantKey şart.
 */

import { stableVariantKey } from "./tracking-price-sanity";

export type TrackedVariantMatchInput = {
  id: number;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  sourceSku?: string | null;
  shopifyVariantId?: string | null;
  sourceVariantTitle?: string | null;
};

/** "renk::beden" veya açık anahtar parçalar */
export function parseStableVariantKey(key: string | null | undefined): {
  color?: string;
  size?: string;
  raw: string;
} {
  const raw = String(key ?? "").trim();
  if (!raw) return { raw: "" };
  const parts = raw.split("::");
  if (parts.length >= 2) {
    return {
      color: parts[0]?.trim() || undefined,
      size: parts.slice(1).join("::").trim() || undefined,
      raw,
    };
  }
  return { raw };
}

export function matchTrackedVariantByKey(
  rows: TrackedVariantMatchInput[],
  variantKey: string | null | undefined,
): TrackedVariantMatchInput | null {
  const parsed = parseStableVariantKey(variantKey);
  if (!parsed.raw) return null;

  const normalizedTarget = parsed.raw.toLocaleLowerCase("tr-TR");
  const withKey = rows.map((row) => ({
    row,
    key: stableVariantKey({
      color: row.option1,
      size: row.option2,
      option1: row.option1,
      option2: row.option2,
      sku: row.sourceSku,
    }),
  }));

  const exact = withKey.filter((x) => x.key === normalizedTarget);
  if (exact.length === 1) return exact[0].row;
  if (exact.length > 1) {
    const withShopify = exact.filter((x) => Boolean(String(x.row.shopifyVariantId ?? "").trim()));
    if (withShopify.length === 1) return withShopify[0].row;
  }

  if (parsed.color || parsed.size) {
    const colorNorm = (parsed.color ?? "").toLocaleLowerCase("tr-TR");
    const sizeNorm = (parsed.size ?? "").toLocaleLowerCase("tr-TR");
    const colorPlaceholders = new Set([
      "",
      "varsayılan",
      "tek renk",
      "default",
      "default title",
      "title",
    ]);
    const sizePlaceholders = /^(tek beden|standart|varsayılan|default|default title)?$/i;
    const soft = rows.filter((row) => {
      const c = String(row.option1 ?? "").trim().toLocaleLowerCase("tr-TR");
      const s = String(row.option2 ?? "").trim().toLocaleLowerCase("tr-TR");
      const colorOk =
        !colorNorm ||
        c === colorNorm ||
        (colorPlaceholders.has(colorNorm) && (colorPlaceholders.has(c) || !c)) ||
        (colorPlaceholders.has(c) && colorPlaceholders.has(colorNorm));
      const sizeOk =
        !sizeNorm ||
        s === sizeNorm ||
        sizePlaceholders.test(sizeNorm) ||
        sizePlaceholders.test(s) ||
        /^ty-\d+/i.test(sizeNorm);
      return colorOk && sizeOk;
    });
    if (soft.length === 1) return soft[0];
    const withShopify = soft.filter((r) => Boolean(String(r.shopifyVariantId ?? "").trim()));
    if (withShopify.length === 1) return withShopify[0];
  }

  // Tek bağlı varyant: anahtar belirsiz olsa bile eşle
  const mappedOnly = rows.filter((r) => Boolean(String(r.shopifyVariantId ?? "").trim()));
  if (mappedOnly.length === 1) return mappedOnly[0];

  return null;
}

export function extractSourceCostFromChangeValue(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["price", "active", "original", "selling", "value", "cost"]) {
      const n = Number(o[key]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}
