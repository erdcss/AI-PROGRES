import { resolvePreviewImageUrls } from "@/lib/product-image-url";
import { normalizeTrendyolDisplayPrice } from "@/utils/price-utils";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";

type PriceLike =
  | number
  | {
      original?: number;
      withProfit?: number;
      formatted?: string;
      profitFormatted?: string;
    }
  | null
  | undefined;

export type CsvPreviewLike = {
  productTitle?: string;
  csvContent?: string;
  csvPreview?: { headers?: string[]; rows?: string[][] };
  images?: Array<string | { url?: string }>;
  price?: { original?: number; withProfit?: number };
  brand?: string;
  variants?: {
    colors?: string[];
    sizes?: string[];
    allVariants?: Array<{ color?: string; size?: string; inStock?: boolean }>;
  };
  sourceUrl?: string;
};

export type ProductLike = {
  title?: string;
  brand?: string;
  price?: PriceLike;
  images?: Array<string | { url?: string; src?: string }>;
  variants?: CsvPreviewLike["variants"];
  stockAnalysis?: {
    totalVariants?: number;
    inStockVariants?: number;
    outOfStockVariants?: number;
    availableSizes?: string[];
    unavailableSizes?: string[];
  };
  features?: Array<{ key: string; value: string }>;
  csvPreview?: CsvPreviewLike["csvPreview"];
  csvContent?: string;
  sourceUrl?: string;
  originalUrl?: string;
};

export type ResolvedProductPreview = {
  title: string;
  brand: string;
  priceOriginal: number | null;
  priceWithProfit: number | null;
  priceOriginalLabel: string;
  priceWithProfitLabel: string;
  images: string[];
  stockSummary: string;
  variantSummary: string;
  colors: string[];
  sizes: string[];
  variantOptions: Array<{ color: string; size: string; inStock: boolean }>;
  features: Array<{ key: string; value: string }>;
  hasTitle: boolean;
  hasBrand: boolean;
  hasPrice: boolean;
  hasImages: boolean;
};

const MISSING = "Bilgi yok";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function readCsvField(
  csvContent: string | undefined,
  fieldNames: string[],
): string | null {
  if (!csvContent || csvContent.length < 10) return null;
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.replace(/^"|"$/g, "").trim().toLowerCase(),
  );
  const idx = headers.findIndex((h) =>
    fieldNames.some((name) => h === name.toLowerCase()),
  );
  if (idx === -1) return null;

  const cells = parseCsvLine(lines[1]).map((c) => c.replace(/^"|"$/g, "").trim());
  const value = cells[idx];
  return value || null;
}

function readCsvPreviewField(
  csvPreview: CsvPreviewLike["csvPreview"],
  fieldNames: string[],
): string | null {
  if (!csvPreview?.headers?.length || !csvPreview.rows?.[0]?.length) return null;
  const headers = csvPreview.headers.map((h) => h.trim().toLowerCase());
  const idx = headers.findIndex((h) =>
    fieldNames.some((name) => h === name.toLowerCase()),
  );
  if (idx === -1) return null;
  const value = csvPreview.rows[0][idx];
  return value?.trim() || null;
}

function titleFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (!slug || slug.length < 3) return null;
    return decodeURIComponent(slug).replace(/-/g, " ");
  } catch {
    return null;
  }
}

function resolveTitle(
  product?: ProductLike | null,
  scraped?: ProductLike | null,
  csvPreview?: CsvPreviewLike | null,
): { title: string; hasTitle: boolean } {
  const fromProduct = product?.title?.trim();
  if (fromProduct) return { title: fromProduct, hasTitle: true };

  const fromScraped = scraped?.title?.trim();
  if (fromScraped) return { title: fromScraped, hasTitle: true };

  const fromCsvPreviewTitle = csvPreview?.productTitle?.trim();
  if (fromCsvPreviewTitle) return { title: fromCsvPreviewTitle, hasTitle: true };

  const csvContent = product?.csvContent || csvPreview?.csvContent;
  const csvPreviewStruct = product?.csvPreview || csvPreview?.csvPreview;
  const fromCsv =
    readCsvField(csvContent, ["Title", "title"]) ||
    readCsvPreviewField(csvPreviewStruct, ["Title", "title"]);
  if (fromCsv) return { title: fromCsv, hasTitle: true };

  const fallbackUrl =
    product?.sourceUrl ||
    product?.originalUrl ||
    csvPreview?.sourceUrl ||
    scraped?.sourceUrl ||
    scraped?.originalUrl;
  const fromUrl = titleFromUrl(fallbackUrl);
  if (fromUrl) return { title: fromUrl, hasTitle: false };

  return { title: MISSING, hasTitle: false };
}

function resolveBrand(
  product?: ProductLike | null,
  csvPreview?: CsvPreviewLike | null,
): { brand: string; hasBrand: boolean } {
  const fromProduct = product?.brand?.trim();
  if (fromProduct) return { brand: fromProduct, hasBrand: true };

  const fromCsvPreview = csvPreview?.brand?.trim();
  if (fromCsvPreview) return { brand: fromCsvPreview, hasBrand: true };

  const csvContent = product?.csvContent || csvPreview?.csvContent;
  const csvPreviewStruct = product?.csvPreview || csvPreview?.csvPreview;
  const fromCsv =
    readCsvField(csvContent, ["Vendor", "vendor"]) ||
    readCsvPreviewField(csvPreviewStruct, ["Vendor", "vendor"]);
  if (fromCsv) return { brand: fromCsv, hasBrand: true };

  const sourceUrl =
    product?.sourceUrl ||
    product?.originalUrl ||
    csvPreview?.sourceUrl;
  if (sourceUrl?.includes("trendyol.com")) {
    return { brand: "Trendyol", hasBrand: false };
  }
  if (sourceUrl?.includes("arcelik.com")) {
    return { brand: "Arçelik", hasBrand: false };
  }
  if (sourceUrl?.includes("pttavm.com")) {
    return { brand: "PttAVM", hasBrand: false };
  }

  return { brand: MISSING, hasBrand: false };
}

function resolvePrices(
  product?: ProductLike | null,
  csvPreview?: CsvPreviewLike | null,
): { original: number | null; withProfit: number | null; hasPrice: boolean } {
  const priceSource = product?.price ?? csvPreview?.price;
  const display = priceSource ? normalizeTrendyolDisplayPrice(priceSource, 0.1) : null;
  if (display && display.original > 0) {
    return {
      original: display.original,
      withProfit: display.withProfit,
      hasPrice: true,
    };
  }

  const csvContent = product?.csvContent || csvPreview?.csvContent;
  const csvPreviewStruct = product?.csvPreview || csvPreview?.csvPreview;
  const csvPriceRaw =
    readCsvField(csvContent, ["Variant Price", "variant price", "Price"]) ||
    readCsvPreviewField(csvPreviewStruct, ["Variant Price", "variant price", "Price"]);
  const csvPrice = csvPriceRaw ? Number.parseFloat(csvPriceRaw.replace(",", ".")) : NaN;
  if (Number.isFinite(csvPrice) && csvPrice > 0) {
    const withProfit = Math.round(csvPrice * 1.1 * 100) / 100;
    return { original: csvPrice, withProfit, hasPrice: true };
  }

  return { original: null, withProfit: null, hasPrice: false };
}

function resolveImages(
  product?: ProductLike | null,
  csvPreview?: CsvPreviewLike | null,
): { images: string[]; hasImages: boolean } {
  const productImages = resolvePreviewImageUrls(product?.images ?? []);
  if (productImages.length > 0) {
    return { images: productImages, hasImages: true };
  }

  const previewImages = resolvePreviewImageUrls(csvPreview?.images ?? []);
  if (previewImages.length > 0) {
    return { images: previewImages, hasImages: true };
  }

  const csvContent = product?.csvContent || csvPreview?.csvContent;
  const csvPreviewStruct = product?.csvPreview || csvPreview?.csvPreview;
  const fromCsv =
    readCsvField(csvContent, ["Image Src", "image src"]) ||
    readCsvPreviewField(csvPreviewStruct, ["Image Src", "image src"]);
  if (fromCsv && /^https?:\/\//i.test(fromCsv)) {
    return { images: [fromCsv], hasImages: true };
  }

  return { images: [], hasImages: false };
}

function resolveStockSummary(product?: ProductLike | null): string {
  const stock = product?.stockAnalysis;
  if (stock) {
    const parts: string[] = [];
    if (typeof stock.inStockVariants === "number") {
      parts.push(`${stock.inStockVariants} stokta`);
    }
    if (typeof stock.outOfStockVariants === "number") {
      parts.push(`${stock.outOfStockVariants} tükendi`);
    }
    if (parts.length > 0) {
      return parts.join(", ");
    }
    if (typeof stock.totalVariants === "number" && stock.totalVariants > 0) {
      return `${stock.totalVariants} varyant`;
    }
  }

  const variants = sanitizeTrendyolVariants(product?.variants, {
    productTitle: product?.title,
  });
  if (variants.allVariants.length > 0) {
    const inStock = variants.allVariants.filter((v) => v.inStock).length;
    const out = variants.allVariants.length - inStock;
    return `${inStock} stokta, ${out} tükendi`;
  }

  return MISSING;
}

function resolveVariantSummary(product?: ProductLike | null): string {
  const variants = sanitizeTrendyolVariants(product?.variants, {
    productTitle: product?.title,
  });
  const colors = variants.colors.filter(Boolean);
  const sizes = variants.sizes.filter(Boolean);
  if (colors.length > 0 || sizes.length > 0) {
    const parts: string[] = [];
    if (colors.length > 0) parts.push(`${colors.length} renk`);
    if (sizes.length > 0) parts.push(`${sizes.length} beden`);
    return parts.join(", ");
  }
  if (variants.allVariants.length > 0) {
    return `${variants.allVariants.length} varyant`;
  }
  return MISSING;
}

function resolveVariantDetails(product?: ProductLike | null) {
  const variants = sanitizeTrendyolVariants(product?.variants, {
    productTitle: product?.title,
  });
  return {
    colors: variants.colors.filter(Boolean),
    sizes: variants.sizes.filter(Boolean),
    variantOptions: variants.allVariants.map((v) => ({
      color: v.color || "",
      size: v.size || "",
      inStock: v.inStock !== false,
    })),
  };
}

function resolveFeatures(product?: ProductLike | null): Array<{ key: string; value: string }> {
  if (!Array.isArray(product?.features)) return [];
  return product.features.filter(
    (f) => f?.key && f?.value && String(f.key).trim() && String(f.value).trim(),
  );
}

export function resolveProductPreview(input: {
  product?: ProductLike | null;
  scraped?: ProductLike | null;
  csvPreview?: CsvPreviewLike | null;
}): ResolvedProductPreview {
  const { product, scraped, csvPreview } = input;
  const { title, hasTitle } = resolveTitle(product, scraped, csvPreview);
  const { brand, hasBrand } = resolveBrand(product, csvPreview);
  const prices = resolvePrices(product, csvPreview);
  const imageResult = resolveImages(product, csvPreview);
  const variantDetails = resolveVariantDetails(product);
  const features = resolveFeatures(product);

  const displayPrice =
    prices.hasPrice && prices.original != null
      ? normalizeTrendyolDisplayPrice(
          { original: prices.original, withProfit: prices.withProfit ?? prices.original },
          0.1,
        )
      : null;

  return {
    title,
    brand,
    priceOriginal: prices.original,
    priceWithProfit: prices.withProfit,
    priceOriginalLabel: displayPrice ? `${displayPrice.formatted}` : MISSING,
    priceWithProfitLabel: displayPrice ? `${displayPrice.profitFormatted}` : MISSING,
    images: imageResult.images,
    stockSummary: resolveStockSummary(product),
    variantSummary: resolveVariantSummary(product),
    colors: variantDetails.colors,
    sizes: variantDetails.sizes,
    variantOptions: variantDetails.variantOptions,
    features,
    hasTitle,
    hasBrand,
    hasPrice: prices.hasPrice,
    hasImages: imageResult.hasImages,
  };
}
