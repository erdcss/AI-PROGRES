import { normalizeTrendyolPriceValue, TRENDYOL_PROFIT_MARGIN } from "./trendyol-price-utils";

export type ScrapeFieldSource =
  | "productInfo"
  | "product"
  | "canonicalProduct"
  | "root";

export interface ScrapeSourceLayer {
  key: ScrapeFieldSource;
  data: Record<string, unknown>;
}

export interface MergedScrapeFields {
  title: string;
  titleSource: ScrapeFieldSource | null;
  brand: string;
  brandSource: ScrapeFieldSource | null;
  priceOriginal: number;
  priceWithProfit: number;
  priceSource: ScrapeFieldSource | null;
  rawPriceShape: string;
  images: unknown[];
  variants: unknown;
  variantsSource: ScrapeFieldSource | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function variantRichness(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const v = value as Record<string, unknown>;
  const allVariants = Array.isArray(v.allVariants) ? v.allVariants.length : 0;
  const items = Array.isArray(v.items) ? v.items.length : 0;
  const colors = Array.isArray(v.colors) ? v.colors.length : 0;
  const sizes = Array.isArray(v.sizes) ? v.sizes.length : 0;
  const stockMap =
    v.stockMap && typeof v.stockMap === "object"
      ? Object.keys(v.stockMap as Record<string, unknown>).length
      : 0;
  return Math.max(allVariants, items, colors + sizes, stockMap);
}

export function describePriceShape(raw: unknown): string {
  if (raw == null) return "null";
  if (typeof raw === "number") return "number";
  if (typeof raw === "string") return "string";
  if (Array.isArray(raw)) return `array[${raw.length}]`;
  if (typeof raw === "object") {
    const keys = Object.keys(raw as Record<string, unknown>);
    return keys.length ? `object{${keys.slice(0, 10).join(",")}}` : "object{}";
  }
  return typeof raw;
}

export function resolvePriceFromLayer(raw: unknown): number {
  return normalizeTrendyolPriceValue(raw);
}

export function collectScrapeSourceLayers(
  result: Record<string, unknown>,
): ScrapeSourceLayer[] {
  const layers: ScrapeSourceLayer[] = [];
  const productInfo = result.productInfo;
  const product = result.product;
  const canonicalProduct = result.canonicalProduct;

  if (productInfo && typeof productInfo === "object") {
    layers.push({ key: "productInfo", data: productInfo as Record<string, unknown> });
  }
  if (product && typeof product === "object") {
    layers.push({ key: "product", data: product as Record<string, unknown> });
  }
  if (canonicalProduct && typeof canonicalProduct === "object") {
    layers.push({ key: "canonicalProduct", data: canonicalProduct as Record<string, unknown> });
  }
  layers.push({ key: "root", data: result });
  return layers;
}

export function pickFirstNonEmptyTitle(layers: ScrapeSourceLayer[]): {
  title: string;
  source: ScrapeFieldSource | null;
} {
  for (const layer of layers) {
    const title = layer.data.title;
    if (isNonEmptyString(title)) {
      return { title: title.trim(), source: layer.key };
    }
  }
  return { title: "", source: null };
}

export function pickFirstNonEmptyBrand(layers: ScrapeSourceLayer[]): {
  brand: string;
  source: ScrapeFieldSource | null;
} {
  for (const layer of layers) {
    const brand = layer.data.brand;
    if (isNonEmptyString(brand)) {
      return { brand: brand.trim(), source: layer.key };
    }
  }
  return { brand: "", source: null };
}

export function pickFirstPositivePrice(layers: ScrapeSourceLayer[]): {
  priceOriginal: number;
  priceWithProfit: number;
  source: ScrapeFieldSource | null;
  rawPriceShape: string;
} {
  for (const layer of layers) {
    const rawPrice = layer.data.price;
    const original = resolvePriceFromLayer(rawPrice);
    if (original > 0) {
      const withProfitRaw =
        rawPrice && typeof rawPrice === "object"
          ? (rawPrice as Record<string, unknown>).withProfit
          : undefined;
      const withProfit = resolvePriceFromLayer(withProfitRaw);
      return {
        priceOriginal: original,
        priceWithProfit:
          withProfit > 0
            ? withProfit
            : Math.round(original * (1 + TRENDYOL_PROFIT_MARGIN) * 100) / 100,
        source: layer.key,
        rawPriceShape: describePriceShape(rawPrice),
      };
    }
  }

  const lastRaw = layers[layers.length - 1]?.data.price;
  return {
    priceOriginal: 0,
    priceWithProfit: 0,
    source: null,
    rawPriceShape: describePriceShape(lastRaw),
  };
}

export function mergeImagesFromLayers(layers: ScrapeSourceLayer[]): unknown[] {
  const seen = new Set<string>();
  const merged: unknown[] = [];

  const addImage = (img: unknown) => {
    let key = "";
    if (typeof img === "string") key = img.trim();
    else if (img && typeof img === "object") {
      const record = img as Record<string, unknown>;
      const raw = record.url ?? record.src ?? record.imageUrl ?? record.image;
      if (typeof raw === "string") key = raw.trim();
    }
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(img);
  };

  for (const layer of layers) {
    const images = layer.data.images;
    if (Array.isArray(images)) {
      for (const img of images) addImage(img);
    }
  }

  return merged;
}

export function pickRichestVariants(layers: ScrapeSourceLayer[]): {
  variants: unknown;
  source: ScrapeFieldSource | null;
} {
  let best: { variants: unknown; source: ScrapeFieldSource | null; score: number } = {
    variants: undefined,
    source: null,
    score: -1,
  };

  for (const layer of layers) {
    const variants = layer.data.variants;
    const score = variantRichness(variants);
    if (score > best.score) {
      best = { variants, source: layer.key, score };
    }
  }

  return { variants: best.variants, source: best.source };
}

export function mergeScrapeFields(result: Record<string, unknown>): MergedScrapeFields {
  const layers = collectScrapeSourceLayers(result);
  const { title, source: titleSource } = pickFirstNonEmptyTitle(layers);
  const { brand, source: brandSource } = pickFirstNonEmptyBrand(layers);
  const price = pickFirstPositivePrice(layers);
  const images = mergeImagesFromLayers(layers);
  const { variants, source: variantsSource } = pickRichestVariants(layers);

  return {
    title,
    titleSource,
    brand,
    brandSource,
    priceOriginal: price.priceOriginal,
    priceWithProfit: price.priceWithProfit,
    priceSource: price.source,
    rawPriceShape: price.rawPriceShape,
    images,
    variants,
    variantsSource,
  };
}

export function hasCsvEligibleScrapeData(result: Record<string, unknown>): boolean {
  const merged = mergeScrapeFields(result);
  const hasImages =
    Array.isArray(merged.images) &&
    merged.images.some((img) => {
      if (typeof img === "string") return img.trim().length > 0;
      if (img && typeof img === "object") {
        const record = img as Record<string, unknown>;
        return Boolean(record.url ?? record.src ?? record.imageUrl ?? record.image);
      }
      return false;
    });

  return Boolean(merged.title && merged.priceOriginal > 0 && hasImages);
}
