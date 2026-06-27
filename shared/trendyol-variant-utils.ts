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
  const color = String(v.color ?? v.name ?? "").trim();
  const size = String(v.size ?? v.value ?? "").trim();
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
      colors?: string[];
      sizes?: string[];
      allVariants?: unknown[];
    };

    if (Array.isArray(record.allVariants) && record.allVariants.length > 0) {
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

/** CSV/Shopify export — yalnızca stokta olan varyantlar */
export function filterInStockVariantsForCsv(
  variants: SanitizedVariants,
): SanitizedVariants {
  const allVariants = variants.allVariants.filter((v) => v.inStock !== false);
  return finalizeVariants(allVariants, undefined);
}
