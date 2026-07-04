/** Trendyol scrape sonuçlarından sahte/placeholder varyantları temizler */

import {
  isClothingProduct,
  isStandardClothingSize,
} from "./clothing-keywords";

const PLACEHOLDER_SIZES = new Set([
  "tek beden",
  "one size",
  "os",
  "standart",
  "standard",
  "varsayılan",
  "default",
  "universal",
  "boyutsuz",
  "genel",
  "tek",
  "1",
  "0",
]);

const PLACEHOLDER_COLORS = new Set([
  "standart",
  "standard",
  "tek renk",
  "renksiz",
  "renk bilgisi yok",
  "varsayılan",
  "default",
  "none",
  "n/a",
]);

export interface SanitizeVariantOptions {
  productTitle?: string;
}

export function isPlaceholderSize(size: unknown): boolean {
  if (size == null) return true;
  const normalized = String(size).trim().toLowerCase();
  return normalized === "" || PLACEHOLDER_SIZES.has(normalized);
}

export function isPlaceholderColor(color: unknown): boolean {
  if (color == null) return true;
  const normalized = String(color).trim().toLowerCase();
  return normalized === "" || PLACEHOLDER_COLORS.has(normalized);
}

export interface SanitizedVariant {
  color: string;
  size: string;
  inStock: boolean;
  colorCode?: string;
}

export interface SanitizedVariants {
  colors: string[];
  sizes: string[];
  allVariants: SanitizedVariant[];
}

function normalizeStringList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const v = o.name ?? o.size ?? o.value ?? o.attributeValue;
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  }
  return [...new Set(out)];
}

function isFakeSizeForProduct(size: unknown, productTitle?: string): boolean {
  if (isPlaceholderSize(size)) return true;
  if (productTitle && !isClothingProduct(productTitle) && isStandardClothingSize(size)) {
    return true;
  }
  return false;
}

function toVariantRecord(
  raw: unknown,
  productTitle?: string,
): SanitizedVariant | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const color = String(v.color ?? v.colorName ?? v.name ?? "").trim();
  const size = String(v.size ?? v.sizeName ?? v.value ?? "").trim();
  const inStock = v.inStock !== false && v.inStock !== "false";
  const colorCode = v.colorCode ? String(v.colorCode) : undefined;

  const fakeColor = isPlaceholderColor(color);
  const fakeSize = isFakeSizeForProduct(size, productTitle);
  if (fakeColor && fakeSize) return null;

  return {
    color: fakeColor ? "" : color,
    size: fakeSize ? "" : size,
    inStock,
    colorCode,
  };
}

function finalizeVariants(
  rawList: SanitizedVariant[],
  productTitle?: string,
): SanitizedVariants {
  const hasRealSizes = rawList.some(
    (v) => v.size && !isFakeSizeForProduct(v.size, productTitle),
  );

  let list = rawList;
  if (!hasRealSizes) {
    list = list.map((v) => ({ ...v, size: "" }));
  }

  const allVariants = list.filter((v) => v.color || v.size);
  const colors = [
    ...new Set(
      allVariants.map((v) => v.color).filter((c) => c && !isPlaceholderColor(c)),
    ),
  ];
  const sizes = [
    ...new Set(
      allVariants
        .map((v) => v.size)
        .filter((s) => s && !isFakeSizeForProduct(s, productTitle)),
    ),
  ];

  if (colors.length === 0 && sizes.length === 0 && allVariants.length === 0) {
    return EMPTY_TRENDYOL_VARIANTS;
  }

  return { colors, sizes, allVariants };
}

/** Varyant yoksa boş döner — sahte "Tek Beden" / S-M-L (giyim dışı) eklenmez */
export function sanitizeTrendyolVariants(
  variants: unknown,
  options?: SanitizeVariantOptions,
): SanitizedVariants {
  const empty: SanitizedVariants = { colors: [], sizes: [], allVariants: [] };
  if (!variants) return empty;

  const productTitle = options?.productTitle;
  let rawList: SanitizedVariant[] = [];

  if (Array.isArray(variants)) {
    rawList = variants
      .map((v) => toVariantRecord(v, productTitle))
      .filter((v): v is SanitizedVariant => v !== null);
  } else if (typeof variants === "object") {
    const record = variants as {
      colors?: unknown[];
      sizes?: unknown[];
      availableSizes?: unknown[];
      allVariants?: unknown[];
      items?: unknown[];
      stockMap?: Record<string, boolean>;
    };

    if (Array.isArray(record.items) && record.items.length > 0) {
      rawList = record.items
        .map((v) => toVariantRecord(v, productTitle))
        .filter((v): v is SanitizedVariant => v !== null);
    } else if (record.stockMap && typeof record.stockMap === "object") {
      const colors = normalizeStringList(record.colors);
      const sizes = normalizeStringList(record.sizes ?? record.availableSizes);
      for (const [key, inStock] of Object.entries(record.stockMap)) {
        const parts = key.split("-");
        let color = "";
        let size = "";
        if (parts.length >= 2) {
          color = parts.slice(0, -1).join("-");
          size = parts[parts.length - 1];
        } else if (sizes.includes(key)) {
          size = key;
        } else {
          color = key;
        }
        const rec = toVariantRecord(
          { color: color || undefined, size: size || undefined, inStock },
          productTitle,
        );
        if (rec) rawList.push(rec);
      }
    } else if (Array.isArray(record.allVariants) && record.allVariants.length > 0) {
      rawList = record.allVariants
        .map((v) => toVariantRecord(v, productTitle))
        .filter((v): v is SanitizedVariant => v !== null);
    } else {
      const colors = (record.colors || []).filter((c) => !isPlaceholderColor(c));
      const sizes = (record.sizes || []).filter(
        (s) => !isFakeSizeForProduct(s, productTitle),
      );

      if (colors.length > 0 && sizes.length > 0) {
        for (const color of colors) {
          for (const size of sizes) {
            rawList.push({ color, size, inStock: true });
          }
        }
      } else if (colors.length > 0) {
        rawList = colors.map((color) => ({ color, size: "", inStock: true }));
      } else if (sizes.length > 0) {
        rawList = sizes.map((size) => ({ color: "", size, inStock: true }));
      }
    }
  }

  return finalizeVariants(rawList, productTitle);
}

export const EMPTY_TRENDYOL_VARIANTS: SanitizedVariants = {
  colors: [],
  sizes: [],
  allVariants: [],
};

export function hasRealTrendyolVariants(variants: SanitizedVariants | null | undefined): boolean {
  if (!variants || !Array.isArray(variants.colors) || !Array.isArray(variants.sizes)) {
    return false;
  }
  return variants.colors.length > 0 || variants.sizes.length > 0;
}

/** Daha zengin varyant setini seç (renk × beden matrisi öncelikli) */
export function variantRichnessScore(variants: SanitizedVariants | null | undefined): number {
  if (!variants) return 0;
  const colorCount = variants.colors?.length ?? 0;
  const sizeCount = variants.sizes?.length ?? 0;
  const matrixCount = variants.allVariants?.length ?? 0;
  return matrixCount * 100 + colorCount * 10 + sizeCount;
}

export function pickRicherTrendyolVariants(
  ...candidates: Array<SanitizedVariants | null | undefined>
): SanitizedVariants {
  let best = EMPTY_TRENDYOL_VARIANTS;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const sanitized = sanitizeTrendyolVariants(candidate);
    if (!hasRealTrendyolVariants(sanitized)) continue;
    const score = variantRichnessScore(sanitized);
    if (score > bestScore) {
      bestScore = score;
      best = sanitized;
    }
  }

  return best;
}

/** CSV/Shopify export — yalnızca stokta olan varyantlar */
export function filterInStockVariantsForCsv(
  variants: SanitizedVariants,
): SanitizedVariants {
  const allVariants = variants.allVariants.filter((v) => v.inStock !== false);
  return finalizeVariants(allVariants, undefined);
}

export type VariantStockEntry = { name: string; inStock: boolean };

export type VariantStockSummary = {
  colors: VariantStockEntry[];
  sizes: VariantStockEntry[];
  inStockCount: number;
  outOfStockCount: number;
  totalCount: number;
};

/** UI önizlemesi — renk/beden bazında stok özeti */
export function summarizeVariantStock(variants: SanitizedVariants): VariantStockSummary {
  const colorStock = new Map<string, { name: string; inStock: boolean }>();
  const sizeStock = new Map<string, { name: string; inStock: boolean }>();

  const upsert = (
    map: Map<string, { name: string; inStock: boolean }>,
    name: string,
    inStock: boolean,
  ) => {
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { name, inStock });
      return;
    }
    existing.inStock = existing.inStock || inStock;
  };

  for (const v of variants.allVariants) {
    if (v.color?.trim()) {
      upsert(colorStock, v.color.trim(), v.inStock !== false);
    }
    if (v.size?.trim()) {
      upsert(sizeStock, v.size.trim(), v.inStock !== false);
    }
  }

  for (const c of variants.colors) {
    if (!c?.trim()) continue;
    const key = c.trim().toLowerCase();
    if (!colorStock.has(key)) {
      colorStock.set(key, { name: c.trim(), inStock: true });
    }
  }
  for (const s of variants.sizes) {
    if (!s?.trim()) continue;
    const key = s.trim().toLowerCase();
    if (!sizeStock.has(key)) {
      sizeStock.set(key, { name: s.trim(), inStock: true });
    }
  }

  const inStockCount = variants.allVariants.filter((v) => v.inStock !== false).length;
  const totalCount = variants.allVariants.length;

  return {
    colors: [...colorStock.values()],
    sizes: [...sizeStock.values()],
    inStockCount,
    outOfStockCount: Math.max(0, totalCount - inStockCount),
    totalCount,
  };
}

/**
 * CSV yalnızca stoktaki varyantları içerir; önizleme scrape payload'ını kullanır.
 */
export function pickVariantsForPreview(
  payloadVariants: SanitizedVariants,
  csvDerivedVariants: SanitizedVariants,
): SanitizedVariants {
  const payloadHasMatrix = payloadVariants.allVariants.some((v) => v.color || v.size);
  if (!payloadHasMatrix) return csvDerivedVariants;

  const payloadHasStockFlags = payloadVariants.allVariants.some((v) => v.inStock === false);
  if (payloadHasStockFlags || payloadVariants.allVariants.length >= csvDerivedVariants.allVariants.length) {
    return payloadVariants;
  }

  return payloadVariants.allVariants.length > 0 ? payloadVariants : csvDerivedVariants;
}
