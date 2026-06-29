/**
 * Trendyol renk/beden — HTML, API state ve URL slug birleşik çözümleyici.
 */
import * as cheerio from "cheerio";
import {
  buildVariantsFromSlicing,
  extractVariantsFromJsonLd,
  extractVariantsFromSlicingRegex,
  parseSlicingAttributesFromProduct,
  parseSkuComboVariantsFromProduct,
  type SlicingVariant,
} from "./trendyol-slicing-parser";
import { getTrendyolProductFromState } from "./trendyol-product-state";
import {
  EMPTY_TRENDYOL_VARIANTS,
  hasRealTrendyolVariants,
  pickRicherTrendyolVariants,
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

function toSanitizedVariants(
  rawVariants: SlicingVariant[],
  productTitle?: string,
): SanitizedVariants {
  return sanitizeTrendyolVariants(
    {
      allVariants: rawVariants.map((v) => ({
        color: v.color,
        size: v.size,
        inStock: v.inStock,
        colorCode: v.colorCode,
      })),
    },
    { productTitle },
  );
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

  const candidates: SanitizedVariants[] = [];

  if (input.html) {
    const $ = cheerio.load(input.html);
    const fromSlicing = buildVariantsFromSlicing($, input.html);
    if (fromSlicing.length > 0) {
      candidates.push(toSanitizedVariants(fromSlicing, title));
    }

    const fromJsonLd = extractVariantsFromJsonLd(input.html);
    if (fromJsonLd.length > 0) {
      candidates.push(toSanitizedVariants(fromJsonLd, title));
    }

    const fromRegex = extractVariantsFromSlicingRegex(input.html);
    if (fromRegex.length > 0) {
      candidates.push(toSanitizedVariants(fromRegex, title));
    }
  }

  if (product) {
    const skuVariants = parseSkuComboVariantsFromProduct(product);
    if (skuVariants.length > 0) {
      candidates.push(toSanitizedVariants(skuVariants, title));
    }

    const matrixVariants = buildMatrixFromSlicing(
      parseSlicingAttributesFromProduct(product),
    );
    if (matrixVariants.length > 0) {
      candidates.push(toSanitizedVariants(matrixVariants, title));
    }
  }

  const urlColorVariants = applyUrlColorToVariants([], input.url);
  if (urlColorVariants.length > 0) {
    candidates.push(toSanitizedVariants(urlColorVariants, title));
  }

  let result = pickRicherTrendyolVariants(...candidates);
  const urlColor = input.url ? colorFromTrendyolProductUrl(input.url) : null;
  if (urlColor && result.sizes.length > 0 && result.colors.length === 0) {
    result = toSanitizedVariants(
      result.allVariants.map((v) => ({
        color: v.color || urlColor,
        colorCode: v.colorCode || "",
        size: v.size,
        inStock: v.inStock,
      })),
      title,
    );
  }

  return result;
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

/** API productDetail — yalnızca varyant için hafif çağrı */
export async function fetchTrendyolVariantsFromApi(
  url: string,
  productTitle?: string,
): Promise<SanitizedVariants> {
  const { fetchTrendyolProductByUrl } = await import("./trendyol-product-api");
  const api = await fetchTrendyolProductByUrl(url);
  if (!api) return EMPTY_TRENDYOL_VARIANTS;

  const title = productTitle || api.title;
  const candidates: SanitizedVariants[] = [];

  if (api.rawProduct) {
    candidates.push(
      resolveTrendyolVariants({
        product: api.rawProduct,
        url,
        productTitle: title,
      }),
    );
  }

  if (api.variants && hasRealTrendyolVariants(api.variants)) {
    candidates.push(api.variants);
  }

  candidates.push(resolveTrendyolVariants({ url, productTitle: title }));

  return pickRicherTrendyolVariants(...candidates);
}
