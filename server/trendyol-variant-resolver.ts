/**
 * Trendyol renk/beden — HTML, API state ve URL slug birleşik çözümleyici.
 */
import * as cheerio from "cheerio";
import {
  buildVariantsFromSlicing,
  parseSlicingAttributesFromProduct,
  parseSkuComboVariantsFromProduct,
  type SlicingVariant,
} from "./trendyol-slicing-parser";
import { getTrendyolProductFromState } from "./trendyol-product-state";
import {
  sanitizeTrendyolVariants,
  type SanitizedVariants,
} from "@shared/trendyol-variant-utils";
import {
  buildStockAnalysisFromVariants,
  type TrendyolStockAnalysis,
} from "./trendyol-html-enrichment";

const URL_COLOR_SLUGS: Array<[string, string]> = [
  ["acik-haki", "Açık Haki"],
  ["koyu-haki", "Koyu Haki"],
  ["acik-mavi", "Açık Mavi"],
  ["koyu-mavi", "Koyu Mavi"],
  ["acik-gri", "Açık Gri"],
  ["koyu-gri", "Koyu Gri"],
  ["acik-yesil", "Açık Yeşil"],
  ["koyu-yesil", "Koyu Yeşil"],
  ["acik-kahve", "Açık Kahve"],
  ["koyu-kahve", "Koyu Kahve"],
  ["lacivert", "Lacivert"],
  ["kahverengi", "Kahverengi"],
  ["kahve", "Kahve"],
  ["bordo", "Bordo"],
  ["bej", "Bej"],
  ["ekru", "Ekru"],
  ["haki", "Haki"],
  ["siyah", "Siyah"],
  ["beyaz", "Beyaz"],
  ["kirmizi", "Kırmızı"],
  ["mavi", "Mavi"],
  ["yesil", "Yeşil"],
  ["sari", "Sarı"],
  ["turuncu", "Turuncu"],
  ["mor", "Mor"],
  ["pembe", "Pembe"],
  ["gri", "Gri"],
];

export function colorFromTrendyolProductUrl(url: string): string | null {
  const path = (url.split("?")[0] || "").toLowerCase();
  for (const [slug, label] of URL_COLOR_SLUGS) {
    if (path.includes(`-${slug}-`) || path.endsWith(`-${slug}`) || path.includes(`/${slug}-`)) {
      return label;
    }
  }
  return null;
}

export function unwrapTrendyolApiProductRoot(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidates = [
    (d.result as Record<string, unknown> | undefined)?.product,
    d.result,
    d.product,
    Array.isArray(d.products) ? d.products[0] : null,
    d,
  ];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const rec = c as Record<string, unknown>;
    if (rec.name || rec.title || rec.id || rec.slicedAttributes || rec.variants) {
      return rec;
    }
  }
  return null;
}

function buildMatrixFromSlicing(
  slicing: ReturnType<typeof parseSlicingAttributesFromProduct>,
): SlicingVariant[] {
  const variants: SlicingVariant[] = [];
  if (slicing.colors.length > 0 && slicing.sizes.length > 0) {
    for (const color of slicing.colors) {
      for (const size of slicing.sizes) {
        variants.push({
          color: color.name,
          colorCode: "",
          size: size.name,
          inStock: color.inStock && size.inStock,
        });
      }
    }
  } else if (slicing.sizes.length > 0) {
    for (const size of slicing.sizes) {
      variants.push({
        color: "",
        colorCode: "",
        size: size.name,
        inStock: size.inStock,
      });
    }
  } else if (slicing.colors.length > 0) {
    for (const color of slicing.colors) {
      variants.push({
        color: color.name,
        colorCode: "",
        size: "",
        inStock: color.inStock,
      });
    }
  }
  return variants;
}

function applyUrlColorToVariants(
  variants: SlicingVariant[],
  url?: string,
): SlicingVariant[] {
  const urlColor = url ? colorFromTrendyolProductUrl(url) : null;
  if (!urlColor) return variants;
  if (variants.length === 0) {
    return [{ color: urlColor, colorCode: "", size: "", inStock: true }];
  }
  if (variants.every((v) => !v.color)) {
    return variants.map((v) => ({ ...v, color: urlColor }));
  }
  return variants;
}

export function resolveTrendyolVariants(input: {
  product?: Record<string, unknown> | null;
  html?: string;
  url?: string;
  productTitle?: string;
}): SanitizedVariants {
  const title =
    input.productTitle ||
    String(input.product?.name || input.product?.title || "").trim();

  let product = input.product;
  if (!product && input.html) {
    product = getTrendyolProductFromState(input.html);
  }

  let rawVariants: SlicingVariant[] = [];

  if (input.html) {
    const $ = cheerio.load(input.html);
    rawVariants = buildVariantsFromSlicing($, input.html);
  }

  if (rawVariants.length === 0 && product) {
    rawVariants = parseSkuComboVariantsFromProduct(product);
  }

  if (rawVariants.length === 0 && product) {
    rawVariants = buildMatrixFromSlicing(parseSlicingAttributesFromProduct(product));
  }

  rawVariants = applyUrlColorToVariants(rawVariants, input.url);

  return sanitizeTrendyolVariants(
    {
      allVariants: rawVariants.map((v) => ({
        color: v.color,
        size: v.size,
        inStock: v.inStock,
        colorCode: v.colorCode,
      })),
    },
    { productTitle: title },
  );
}

export function resolveTrendyolVariantBundle(input: {
  product?: Record<string, unknown> | null;
  html?: string;
  url?: string;
  productTitle?: string;
}): { variants: SanitizedVariants; stockAnalysis: TrendyolStockAnalysis | null } {
  const variants = resolveTrendyolVariants(input);
  return {
    variants,
    stockAnalysis: buildStockAnalysisFromVariants(variants),
  };
}
