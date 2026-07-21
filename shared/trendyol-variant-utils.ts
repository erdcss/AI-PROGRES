/** Trendyol scrape sonuçlarından sahte/placeholder varyantları temizler */

import {
  isClothingProduct,
  isConfirmedClothingProduct,
  isStandardClothingSize,
} from "./clothing-keywords";
import { normalizeTrendyolColorName } from "./trendyol-color-normalizer";

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
  sourceUrl?: string;
}

/** Varyant birleştirme anahtarı — SKU veya productId TEK BAŞINA kullanılmaz. */
export function trendyolVariantDedupeKey(color: string, size: string): string {
  const c = (color || "").trim().toLowerCase();
  const s = (size || "").trim().toLowerCase();
  return `${c}::${s}`;
}

function variantMetadataRichness(v: SanitizedVariant): number {
  return (
    (v.image ? 2 : 0) +
    (v.images?.length ?? 0) +
    (v.sourceProductId ? 2 : 0) +
    (v.sourceUrl ? 1 : 0) +
    (v.listingId ? 1 : 0) +
    (v.price != null && String(v.price).trim() !== "" ? 1 : 0) +
    (typeof v.stockCount === "number" ? 1 : 0) +
    (v.colorCode ? 1 : 0)
  );
}

function dedupeVariantList(list: SanitizedVariant[]): SanitizedVariant[] {
  const map = new Map<string, SanitizedVariant>();
  for (const v of list) {
    const key = trendyolVariantDedupeKey(v.color, v.size);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, v);
      continue;
    }
    // Aynı renk+beden: stok + daha zengin metadata öncelikli
    const preferIncomingStock = existing.inStock === false && v.inStock !== false;
    const keepExistingStock = v.inStock === false && existing.inStock !== false;
    if (keepExistingStock) {
      map.set(key, existing);
      continue;
    }
    if (preferIncomingStock || variantMetadataRichness(v) >= variantMetadataRichness(existing)) {
      map.set(key, {
        ...existing,
        ...v,
        inStock: preferIncomingStock ? true : v.inStock !== false && existing.inStock !== false,
        image: v.image || existing.image,
        images: (v.images?.length ?? 0) >= (existing.images?.length ?? 0) ? v.images : existing.images,
        sourceProductId: v.sourceProductId || existing.sourceProductId,
        sourceUrl: v.sourceUrl || existing.sourceUrl,
        listingId: v.listingId || existing.listingId,
        price: v.price ?? existing.price,
        stockCount: v.stockCount ?? existing.stockCount,
        colorCode: v.colorCode || existing.colorCode,
      });
    }
  }
  return [...map.values()];
}

export function isPlaceholderSize(size: unknown): boolean {
  if (size == null) return true;
  const normalized = String(size).trim().toLowerCase();
  return normalized === "" || PLACEHOLDER_SIZES.has(normalized);
}

export function isPlaceholderColor(color: unknown): boolean {
  if (color == null) return true;
  const normalized = String(color).trim().toLowerCase();
  if (normalized === "" || PLACEHOLDER_COLORS.has(normalized)) return true;
  return normalizeTrendyolColorName(color) === null;
}

export type TrackingVariantInput = {
  color?: string | null;
  size?: string | null;
  option1Name?: string | null;
  option1Value?: string | null;
  option2Name?: string | null;
  option2Value?: string | null;
};

function isRenkOptionName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("renk") || n === "color";
}

function isBedenOptionName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("beden") || n === "size";
}

/** Canonical / Shopify varyantından takip için renk ve beden çıkarır */
export function resolveTrackingVariantColorSize(input: TrackingVariantInput): {
  color: string | null;
  size: string | null;
} {
  const explicitColor = input.color?.trim();
  if (explicitColor && !isPlaceholderColor(explicitColor)) {
    const explicitSize = input.size?.trim();
    return {
      color: explicitColor,
      size: explicitSize && !isPlaceholderSize(explicitSize) ? explicitSize : null,
    };
  }

  const o1n = input.option1Name || "";
  const o2n = input.option2Name || "";
  const o1v = input.option1Value?.trim() || "";
  const o2v = input.option2Value?.trim() || "";

  let color: string | null = null;
  let size: string | null = null;

  if (isRenkOptionName(o1n)) {
    if (o1v && !isPlaceholderColor(o1v)) color = o1v;
    if (o2v && isBedenOptionName(o2n) && !isPlaceholderSize(o2v)) size = o2v;
  } else if (isBedenOptionName(o1n)) {
    if (o1v && !isPlaceholderSize(o1v)) size = o1v;
    if (o2v && isRenkOptionName(o2n) && !isPlaceholderColor(o2v)) color = o2v;
  }

  const fallbackSize = input.size?.trim();
  if (!size && fallbackSize && !isPlaceholderSize(fallbackSize)) size = fallbackSize;

  return { color, size };
}

export function buildTrackingVariantLabel(
  color: string | null | undefined,
  size: string | null | undefined,
  fallback?: string | null,
): string | null {
  const parts: string[] = [];
  if (color && !isPlaceholderColor(color)) parts.push(color);
  if (size && !isPlaceholderSize(size)) parts.push(`Beden ${size}`);
  if (parts.length > 0) return parts.join(" · ");
  return fallback?.trim() || null;
}

export interface SanitizedVariant {
  color: string;
  size: string;
  inStock: boolean;
  colorCode?: string;
  image?: string;
  images?: string[];
  sourceProductId?: string;
  sourceUrl?: string;
  listingId?: string;
  price?: string | number;
  stockCount?: number | null;
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

function isFakeSizeForProduct(
  size: unknown,
  productTitle?: string,
  sourceUrl?: string,
): boolean {
  if (isPlaceholderSize(size)) return true;
  if (
    !isConfirmedClothingProduct(productTitle || "", sourceUrl) &&
    isStandardClothingSize(size)
  ) {
    return true;
  }
  return false;
}

const COMBO_SIZE_PATTERN =
  /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL)\s*[\/\\-]\s*(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i;

/** Trendyol combo beden etiketi (ör. S/M, M/L, L/XL) */
export function isComboSizeLabel(size: string): boolean {
  return COMBO_SIZE_PATTERN.test(decodeTrendyolSizeValue(size).trim());
}

/** JSON/HTML kaçışlı beden değerini düz metne çevirir (S\u002FM → S/M). */
export function decodeTrendyolSizeValue(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return t;
  return t.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/");
}

function normalizeAtomicSizeLabel(size: string): string | null {
  const t = decodeTrendyolSizeValue(size).trim().toUpperCase();
  if (t === "STD") return "Standart";
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL)$/.test(t)) return t;
  return null;
}

/**
 * Combo bedeni atomik bedenlere açar.
 * S/M → [S, M], M/L → [M, L], L/XL → [L, XL]
 */
export function expandComboSizeToLabels(size: string): string[] | null {
  const decoded = decodeTrendyolSizeValue(size).trim();
  const m = decoded.match(COMBO_SIZE_PATTERN);
  if (!m) return null;
  const a = normalizeAtomicSizeLabel(m[1]!);
  const b = normalizeAtomicSizeLabel(m[2]!);
  if (!a || !b) return null;
  return [...new Set([a, b])];
}

function expandComboVariants(list: SanitizedVariant[]): SanitizedVariant[] {
  const byKey = new Map<string, SanitizedVariant>();
  for (const v of list) {
    const expanded = expandComboSizeToLabels(v.size);
    const targets = expanded ?? [decodeTrendyolSizeValue(v.size)];
    for (const size of targets) {
      const key = trendyolVariantDedupeKey(v.color, size);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...v, size });
        continue;
      }
      // Aynı atomik beden birden fazla combo'dan geliyorsa: herhangi biri tükendiyse OOS.
      existing.inStock = existing.inStock !== false && v.inStock !== false;
      byKey.set(key, existing);
    }
  }
  return [...byKey.values()];
}

function toVariantRecord(
  raw: unknown,
  productTitle?: string,
  sourceUrl?: string,
): SanitizedVariant | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const colorRaw = String(v.color ?? v.colorName ?? v.name ?? "").trim();
  const size = String(v.size ?? v.sizeName ?? v.value ?? "").trim();
  const normalizedColor = normalizeTrendyolColorName(colorRaw);
  // "Tek Renk" gibi placeholder'lar gerçek renk sayılmaz
  const color =
    normalizedColor && !isPlaceholderColor(normalizedColor) ? normalizedColor : "";
  const inStock = v.inStock !== false && v.inStock !== "false";
  const colorCode = v.colorCode ? String(v.colorCode) : undefined;

  const fakeColor = !color;
  const decodedSize = decodeTrendyolSizeValue(size);
  if (
    isComboSizeLabel(decodedSize) &&
    !isConfirmedClothingProduct(productTitle || "", sourceUrl)
  ) {
    return null;
  }
  const fakeSize = isFakeSizeForProduct(decodedSize, productTitle, sourceUrl);
  if (fakeColor && fakeSize) return null;

  const images = Array.isArray(v.images)
    ? v.images.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    : undefined;
  const image =
    typeof v.image === "string" && /^https?:\/\//i.test(v.image)
      ? v.image
      : images?.[0];
  const sourceProductId = v.sourceProductId != null ? String(v.sourceProductId) : undefined;
  const variantSourceUrl = typeof v.sourceUrl === "string" ? v.sourceUrl : undefined;
  const listingId =
    v.listingId != null
      ? String(v.listingId)
      : v.sourceListingId != null
        ? String(v.sourceListingId)
        : undefined;
  const price =
    typeof v.price === "number" || typeof v.price === "string" ? v.price : undefined;
  const stockCount =
    typeof v.stockCount === "number"
      ? v.stockCount
      : typeof v.sourceStockQty === "number"
        ? v.sourceStockQty
        : null;

  return {
    color: fakeColor ? "" : color,
    size: fakeSize ? "" : decodedSize,
    inStock,
    colorCode,
    image,
    images,
    sourceProductId,
    sourceUrl: variantSourceUrl,
    listingId,
    price,
    stockCount,
  };
}

function finalizeVariants(
  rawList: SanitizedVariant[],
  productTitle?: string,
  sourceUrl?: string,
): SanitizedVariants {
  const hasRealSizes = rawList.some(
    (v) => v.size && !isFakeSizeForProduct(v.size, productTitle, sourceUrl),
  );

  let list = dedupeVariantList(expandComboVariants(rawList));
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
        .filter((s) => s && !isFakeSizeForProduct(s, productTitle, sourceUrl)),
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
  const sourceUrl = options?.sourceUrl;
  let rawList: SanitizedVariant[] = [];

  if (Array.isArray(variants)) {
    rawList = variants
      .map((v) => toVariantRecord(v, productTitle, sourceUrl))
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
        .map((v) => toVariantRecord(v, productTitle, sourceUrl))
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
          sourceUrl,
        );
        if (rec) rawList.push(rec);
      }
    } else if (Array.isArray(record.allVariants) && record.allVariants.length > 0) {
      rawList = record.allVariants
        .map((v) => toVariantRecord(v, productTitle, sourceUrl))
        .filter((v): v is SanitizedVariant => v !== null);
    } else {
      const colors = normalizeStringList(record.colors)
        .map((c) => normalizeTrendyolColorName(c))
        .filter((c): c is string => Boolean(c));
      const sizes = normalizeStringList(record.sizes || record.availableSizes).filter(
        (s) => !isFakeSizeForProduct(s, productTitle, sourceUrl),
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

  return finalizeVariants(rawList, productTitle, sourceUrl);
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

/** Daha zengin varyant setini seç — benzersiz beden sayısı öncelikli */
export function variantRichnessScore(variants: SanitizedVariants | null | undefined): number {
  if (!variants) return 0;
  const colorCount = variants.colors?.length ?? 0;
  const uniqueSizes = new Set<string>();
  for (const v of variants.allVariants || []) {
    const expanded = expandComboSizeToLabels(v.size || "");
    if (expanded) {
      for (const s of expanded) uniqueSizes.add(s.toLowerCase());
    } else if (v.size?.trim()) {
      uniqueSizes.add(v.size.trim().toLowerCase());
    }
  }
  const sizeCount = uniqueSizes.size || variants.sizes?.length || 0;
  const matrixCount = variants.allVariants?.length ?? 0;
  const allInStock =
    matrixCount > 0 && (variants.allVariants || []).every((v) => v.inStock !== false);
  // Kör renk×beden çaprazı (hepsi stoklu) — zengin sayma; gerçek stoklu setleri ezmesin
  const looksLikeBlindCross =
    colorCount >= 2 &&
    sizeCount >= 2 &&
    matrixCount >= colorCount * sizeCount &&
    allInStock;
  if (looksLikeBlindCross) {
    return sizeCount * 50 + colorCount * 5;
  }
  // Beden çeşitliliği en yüksek öncelik (4 beden > 1 beden her zaman).
  return sizeCount * 1000 + matrixCount * 100 + colorCount * 10;
}

export function pickRicherTrendyolVariants(
  ...candidates: Array<SanitizedVariants | null | undefined>
): SanitizedVariants {
  let best = EMPTY_TRENDYOL_VARIANTS;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (!candidate) continue;
    // Adaylar zaten sanitize edildiyse context kaybetmemek için tekrar sanitize etme.
    const ready = hasRealTrendyolVariants(candidate)
      ? candidate
      : sanitizeTrendyolVariants(candidate);
    if (!hasRealTrendyolVariants(ready)) continue;
    const score = variantRichnessScore(ready);
    if (score > bestScore) {
      bestScore = score;
      best = ready;
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
    if (v.color?.trim() && !isPlaceholderColor(v.color)) {
      upsert(colorStock, v.color.trim(), v.inStock !== false);
    }
    if (v.size?.trim() && !isPlaceholderSize(v.size)) {
      upsert(sizeStock, v.size.trim(), v.inStock !== false);
    }
  }

  // Matris yoksa eski davranış; matris varsa listede olup matriste olmayanlar stokta sayılmaz
  const hasMatrix = variants.allVariants.length > 0;
  for (const c of variants.colors) {
    if (!c?.trim() || isPlaceholderColor(c)) continue;
    const key = c.trim().toLowerCase();
    if (!colorStock.has(key)) {
      colorStock.set(key, { name: c.trim(), inStock: !hasMatrix });
    }
  }
  for (const s of variants.sizes) {
    if (!s?.trim()) continue;
    const key = s.trim().toLowerCase();
    if (!sizeStock.has(key)) {
      sizeStock.set(key, { name: s.trim(), inStock: !hasMatrix });
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
