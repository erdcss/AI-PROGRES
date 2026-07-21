/**
 * Trendyol renk üyesi — hydration snapshot tipleri ve üye-izole yardımcıları.
 * Browser Worker DOM evaluate ile doldurur; server merge bu modeli tüketir.
 */

import { isComboSizeLabel } from "@shared/trendyol-variant-utils";
import { normalizeTrendyolColorName } from "@shared/trendyol-color-normalizer";

export const COLOR_FAMILY_MEMBER_NAV_TIMEOUT_MS = 20_000;
export const COLOR_FAMILY_MEMBER_HYDRATION_TIMEOUT_MS = 12_000;
export const COLOR_FAMILY_TOTAL_DEADLINE_MS = 45_000;
export const COLOR_FAMILY_CONCURRENCY = 2;
export const COLOR_FAMILY_MAX_MEMBERS = 20;

export const VALID_SIZE_LABEL_RE =
  /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|32|34|36|38|40|42|44|46|48|50|Standart|STD|Tek Ebat)$/i;

export type HydratedColorSource =
  | "state"
  | "dom_label"
  | "product_attribute"
  | "candidate"
  | "url"
  | "unknown";

export type HydratedSizeSource =
  | "api_variant"
  | "state_variant"
  | "sliced_attribute"
  | "dom_button";

export type TrendyolHydratedMemberSize = {
  name: string;
  inStock: boolean;
  stockCount?: number | null;
  disabledReason?: string;
  source: HydratedSizeSource;
};

export type TrendyolHydratedMemberVariant = {
  color: string;
  size: string;
  inStock: boolean;
  stockCount?: number | null;
  price?: number;
  image?: string;
  sourceProductId?: string;
  sourceUrl?: string;
  evidenceSource?: string;
};

export type TrendyolHydratedMemberSnapshot = {
  requestedUrl: string;
  finalUrl: string;
  requestedProductId?: string;
  resolvedProductId?: string;

  color: string;
  displayColor?: string;
  colorSource: HydratedColorSource;

  images: string[];
  imageSources: {
    state: number;
    api: number;
    dom: number;
    srcset: number;
  };

  sizes: TrendyolHydratedMemberSize[];
  variants: TrendyolHydratedMemberVariant[];

  rawProductJson?: Record<string, unknown>;

  diagnostics: {
    hydrationCompleted: boolean;
    productIdMatched: boolean;
    rawImageCount: number;
    validImageCount: number;
    rawSizeCount: number;
    validSizeCount: number;
    apiResponseCaptured: boolean;
    stateProductFound: boolean;
    domSizeSectionFound: boolean;
    galleryFound: boolean;
    warnings: string[];
    rawImageCandidates?: number;
    acceptedImageCount?: number;
    rejectedImageCount?: number;
    rejectedImageSamples?: string[];
    imageSourceWinner?: string;
  };
};

export function isValidHydratedSizeLabel(size: string): boolean {
  const t = String(size || "").trim();
  if (!t) return false;
  if (isComboSizeLabel(t)) return true;
  return VALID_SIZE_LABEL_RE.test(t);
}

function scrubColorLabelNoise(raw: string): string {
  return String(raw || "")
    .replace(/popüler/gi, "")
    .replace(/popular/gi, "")
    .replace(/indirim/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDisplayColorPair(raw: string): {
  displayColor: string;
  normalizedColor: string;
} {
  const t = scrubColorLabelNoise(String(raw || "").trim());
  if (!t) return { displayColor: "", normalizedColor: "" };

  const compact = t.replace(/\s+/g, "").toLocaleUpperCase("tr-TR");
  const aliases: Record<string, string> = {
    "A.KAHVE": "Açık Kahve",
    AKAHVE: "Açık Kahve",
    "AÇIKKAHVE": "Açık Kahve",
    ACIKKAHVE: "Açık Kahve",
    "A.KAHVERENGI": "Açık Kahve",
    SARI: "Sarı",
    "BEBEMAVISI": "Bebe Mavisi",
    "BEBE-MAVISI": "Bebe Mavisi",
    "BEBE.MAVISI": "Bebe Mavisi",
  };

  const alias = aliases[compact] || aliases[t.toLocaleUpperCase("tr-TR").replace(/\s+/g, "")];
  if (alias) {
    return { displayColor: t, normalizedColor: alias };
  }

  return {
    displayColor: t,
    normalizedColor: normalizeTrendyolColorName(t) || t,
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function pickProductId(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const digits = String(v).replace(/\D/g, "");
    if (digits.length >= 5) return digits;
  }
  return null;
}

function isOutOfStockFlag(raw: unknown): boolean {
  if (raw === false || raw === 0 || raw === "0") return true;
  const s = String(raw ?? "").toLowerCase();
  return (
    s === "outofstock" ||
    s === "soldout" ||
    s === "sold_out" ||
    s === "false" ||
    s.includes("tükendi") ||
    s.includes("tukendi") ||
    s.includes("disabled")
  );
}

/** State/API ürününden yalnızca geçerli bedenleri çıkar (çapraz renk üretmez). */
export function extractSizesFromProductState(product: unknown): TrendyolHydratedMemberSize[] {
  const rec = asRecord(product);
  if (!rec) return [];
  const nested = asRecord(rec.product) ?? rec;
  const out = new Map<string, TrendyolHydratedMemberSize>();

  const upsert = (name: string, inStock: boolean, source: HydratedSizeSource, stockCount?: number | null) => {
    if (!isValidHydratedSizeLabel(name)) return;
    const key = name.trim().toUpperCase();
    const existing = out.get(key);
    if (!existing) {
      out.set(key, { name: name.trim(), inStock, source, stockCount: stockCount ?? null });
      return;
    }
    existing.inStock = existing.inStock || inStock;
    if (existing.stockCount == null && stockCount != null) existing.stockCount = stockCount;
  };

  const sliced = nested.slicedAttributes ?? nested.slicingAttributes;
  if (Array.isArray(sliced)) {
    for (const attr of sliced) {
      const a = asRecord(attr);
      if (!a) continue;
      const attrName = pickString(a.attributeName, a.name).toLowerCase();
      const attrType = pickString(a.attributeType, a.type).toLowerCase();
      const isSize =
        attrName === "beden" ||
        attrName === "size" ||
        attrName.includes("yaş") ||
        attrName.includes("yas") ||
        attrType === "size" ||
        attrType === "2";
      if (!isSize) continue;
      const items = a.attributes ?? a.items ?? a.values ?? a.options;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const it = asRecord(item);
        if (!it) continue;
        const name = pickString(
          it.attributeValue,
          it.attributeBeautifiedValue,
          it.value,
          it.name,
          it.beautifiedValue,
        );
        const inStock = !(
          it.inStock === false ||
          it.available === false ||
          it.selectable === false ||
          it.disabled === true ||
          isOutOfStockFlag(it.stockState ?? it.stock ?? it.availability)
        );
        upsert(name, inStock, "sliced_attribute");
      }
    }
  }

  const allVariants = nested.allVariants ?? nested.variants;
  if (Array.isArray(allVariants)) {
    for (const item of allVariants) {
      const it = asRecord(item);
      if (!it) continue;
      const size = pickString(it.size, it.sizeName, it.value, it.attributeValue);
      const inStock = !(
        it.inStock === false ||
        it.available === false ||
        isOutOfStockFlag(it.stockState ?? it.availability)
      );
      const stockCount = typeof it.stockCount === "number" ? it.stockCount : null;
      upsert(size, inStock, "state_variant", stockCount);
    }
  }

  return [...out.values()];
}

/**
 * Üye varyantlarını izole et — global renk × beden çaprazı YOK.
 * raw içinde çok renk varsa yalnızca memberColor ile eşleşenler veya size-only kayıtlar alınır.
 */
export function isolateMemberVariants(input: {
  memberColor: string;
  memberProductId: string;
  memberUrl: string;
  memberImage?: string;
  sizes: TrendyolHydratedMemberSize[];
  rawVariants?: Array<{
    color?: string;
    size?: string;
    inStock?: boolean;
    stockCount?: number | null;
    price?: number | string;
    image?: string;
    productId?: string;
    sourceProductId?: string;
  }>;
}): TrendyolHydratedMemberVariant[] {
  const color = input.memberColor.trim();
  const colorLower = color.toLocaleLowerCase("tr-TR");
  const out: TrendyolHydratedMemberVariant[] = [];
  const seen = new Set<string>();

  const push = (v: TrendyolHydratedMemberVariant) => {
    if (!v.size || !isValidHydratedSizeLabel(v.size)) {
      if (v.size) return;
    }
    const key = `${v.color.toLowerCase()}::${(v.size || "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };

  const raw = input.rawVariants ?? [];
  const matchingColor = raw.filter((v) => {
    const c = String(v.color || "").trim();
    if (!c) return false;
    return c.toLocaleLowerCase("tr-TR") === colorLower;
  });
  const sizeOnly = raw.filter((v) => !String(v.color || "").trim() && String(v.size || "").trim());
  const sameProduct = raw.filter((v) => {
    const pid = String(v.sourceProductId || v.productId || "").replace(/\D/g, "");
    return pid && pid === input.memberProductId;
  });

  const preferred =
    matchingColor.length > 0
      ? matchingColor
      : sameProduct.length > 0
        ? sameProduct
        : sizeOnly;

  if (preferred.length > 0) {
    for (const v of preferred) {
      const size = String(v.size || "").trim();
      if (!isValidHydratedSizeLabel(size)) continue;
      push({
        color,
        size,
        inStock: v.inStock !== false,
        stockCount: typeof v.stockCount === "number" ? v.stockCount : null,
        price: typeof v.price === "number" ? v.price : undefined,
        image: typeof v.image === "string" ? v.image : input.memberImage,
        sourceProductId: input.memberProductId,
        sourceUrl: input.memberUrl,
        evidenceSource: matchingColor.length ? "member-color-match" : "member-size-only",
      });
    }
  }

  // Size listesinden eksik bedenleri tamamla (yalnızca bu üyenin bedenleri)
  for (const s of input.sizes) {
    if (!isValidHydratedSizeLabel(s.name)) continue;
    const key = `${colorLower}::${s.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    push({
      color,
      size: s.name,
      inStock: s.inStock,
      stockCount: s.stockCount ?? null,
      image: input.memberImage,
      sourceProductId: input.memberProductId,
      sourceUrl: input.memberUrl,
      evidenceSource: s.source,
    });
  }

  return out;
}

export function extractProductIdFromUnknown(product: unknown): string | null {
  const rec = asRecord(product);
  if (!rec) return null;
  const nested = asRecord(rec.product) ?? rec;
  return pickProductId(
    nested.productId,
    nested.contentId,
    nested.id,
    nested.itemNumber,
    nested.contentNumber,
  );
}

export function resolveColorFromProductState(
  product: unknown,
  fallback?: string,
): { color: string; displayColor: string; source: HydratedColorSource } {
  const rec = asRecord(product);
  const nested = asRecord(rec?.product) ?? rec;
  const raw = pickString(
    nested?.color,
    nested?.renk,
    nested?.colorName,
    asRecord(nested?.attributes)?.Renk,
    asRecord(nested?.attributes)?.renk,
    fallback,
  );
  if (raw) {
    const pair = normalizeDisplayColorPair(raw);
    return {
      color: pair.normalizedColor || pair.displayColor,
      displayColor: pair.displayColor || pair.normalizedColor,
      source: nested?.color || nested?.renk ? "state" : "candidate",
    };
  }
  return { color: "", displayColor: "", source: "unknown" };
}
