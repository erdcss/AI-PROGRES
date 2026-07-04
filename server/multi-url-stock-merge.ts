import {
  buildCanonicalProductForShopify,
  type CanonicalProductForShopify,
  type CanonicalVariantItem,
} from "./variant-shape-normalizer";
import { runTrendyolScrapePipeline } from "./trendyol-scrape-pipeline";
import {
  deriveProductStockLabel,
  summarizeStockFromVariants,
  type StockSummary,
} from "@shared/stock-status";

export interface MergedMultiUrlVariant extends CanonicalVariantItem {
  sourceUrl: string;
}

export interface MultiUrlMergeResult {
  title: string;
  brand: string;
  price: string;
  description: string;
  category: string;
  sourceUrl: string;
  sourceProductId: string;
  images: Array<{ url: string; alt?: string; colorName?: string }>;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
      stockStatus?: string;
      inventoryQty?: number;
      sku?: string;
      sourceUrl?: string;
    }>;
  };
  canonicalProduct: CanonicalProductForShopify;
  stockSummary: StockSummary;
  stockLabel: ReturnType<typeof deriveProductStockLabel>;
  manualReviewRequired: boolean;
  shopifyUploadBlocked: boolean;
  blockReason?: string;
  features: Array<{ key: string; value: string }>;
  tags: string[];
}

function variantMergeKey(color: string, size: string): string {
  return `${color.trim().toLowerCase()}|${size.trim().toLowerCase()}`;
}

function canonicalToLegacyVariant(v: CanonicalVariantItem, sourceUrl: string) {
  const stockStatus =
    v.stockConfidence === "low" && !v.inStock && v.inventoryQty === 0
      ? "unknown"
      : v.inStock
        ? "in_stock"
        : "out_of_stock";
  return {
    color: v.color,
    colorCode: v.color.toLowerCase(),
    size: v.size,
    inStock: v.inStock,
    stockStatus,
    inventoryQty: v.inventoryQty,
    sku: v.sku,
    sourceUrl,
  };
}

/** Her URL ana pipeline üzerinden çekilir; yalnız doğrulanmış renk×beden birleştirilir */
export async function scrapeAndMergeMultiUrl(urls: string[]): Promise<MultiUrlMergeResult> {
  if (!urls.length) {
    throw new Error("En az bir URL gerekli");
  }

  const normalizedUrls = urls.map((u) => u.trim()).filter(Boolean);
  const perUrlCanonical: Array<{
    url: string;
    canonical: CanonicalProductForShopify;
    scrapeResult: Record<string, unknown>;
  }> = [];

  for (const url of normalizedUrls) {
    const pipeline = await runTrendyolScrapePipeline(url);
    const scrapeResult = (pipeline.result ?? pipeline) as Record<string, unknown>;
    const canonical = buildCanonicalProductForShopify({ scrapeResult, sourceUrl: url });
    if (!canonical) {
      console.warn(`[MultiUrl] canonical oluşturulamadı: ${url}`);
      continue;
    }
    perUrlCanonical.push({ url, canonical, scrapeResult });
  }

  if (perUrlCanonical.length === 0) {
    throw new Error("Hiçbir URL'den ürün verisi alınamadı");
  }

  const primary = perUrlCanonical[0];
  const variantMap = new Map<string, MergedMultiUrlVariant>();

  for (const entry of perUrlCanonical) {
    const allRows = [...entry.canonical.variants, ...entry.canonical.outOfStockVariants];
    for (const row of allRows) {
      const key = variantMergeKey(row.color, row.size);
      const existing = variantMap.get(key);
      if (!existing || row.stockConfidence === "high") {
        variantMap.set(key, { ...row, sourceUrl: entry.url });
      }
    }
  }

  const mergedVariants = [...variantMap.values()];
  const stockSummary = summarizeStockFromVariants(
    mergedVariants.map((v) => ({
      inStock: v.inStock,
      stockStatus:
        v.stockConfidence === "low" && !v.inStock && v.inventoryQty === 0
          ? "unknown"
          : v.inStock
            ? "in_stock"
            : "out_of_stock",
    })),
  );

  const unknownOnly =
    stockSummary.unknownStockVariants > 0 && stockSummary.inStockVariants === 0;
  const manualReviewRequired =
    perUrlCanonical.some((e) => e.canonical.manualReviewRequired) || unknownOnly;
  const shopifyUploadBlocked =
    perUrlCanonical.some((e) => e.canonical.shopifyUploadBlocked) || unknownOnly;

  const combinedImages: MultiUrlMergeResult["images"] = [];
  const seenImages = new Set<string>();
  for (const entry of perUrlCanonical) {
    for (const img of entry.canonical.images) {
      if (!seenImages.has(img)) {
        seenImages.add(img);
        combinedImages.push({
          url: img,
          alt: `${primary.canonical.title} - ${entry.canonical.variants[0]?.color ?? ""}`,
          colorName: entry.canonical.variants[0]?.color,
        });
      }
    }
  }

  const legacyVariants = mergedVariants.map((v) => canonicalToLegacyVariant(v, v.sourceUrl));
  const colors = [...new Set(legacyVariants.map((v) => v.color))];
  const sizes = [...new Set(legacyVariants.map((v) => v.size))];

  const mergedCanonical: CanonicalProductForShopify = {
    ...primary.canonical,
    images: combinedImages.map((i) => i.url),
    variants: mergedVariants.filter((v) => v.inStock || v.stockConfidence !== "low"),
    outOfStockVariants: mergedVariants.filter((v) => !v.inStock),
    stockSummary: {
      totalVariants: mergedVariants.length,
      inStockVariants: stockSummary.inStockVariants,
      outOfStockVariants: stockSummary.outOfStockVariants,
      defaultInventoryQty: primary.canonical.stockSummary.defaultInventoryQty,
    },
    manualReviewRequired,
    shopifyUploadBlocked,
    blockReason: shopifyUploadBlocked
      ? unknownOnly
        ? "Stok bilinmeyen varyantlar var — manuel onay gerekli"
        : primary.canonical.blockReason
      : undefined,
  };

  const features =
    (primary.scrapeResult.features as Array<{ key: string; value: string }> | undefined) ?? [];

  return {
    title: primary.canonical.title,
    brand: primary.canonical.brand,
    price: primary.canonical.price,
    description: String(primary.scrapeResult.description ?? ""),
    category: String(primary.scrapeResult.category ?? "Genel"),
    sourceUrl: primary.url,
    sourceProductId: primary.canonical.sourceProductId,
    images: combinedImages,
    variants: {
      colors,
      sizes,
      allVariants: legacyVariants,
    },
    canonicalProduct: mergedCanonical,
    stockSummary,
    stockLabel: deriveProductStockLabel(stockSummary),
    manualReviewRequired,
    shopifyUploadBlocked,
    blockReason: mergedCanonical.blockReason,
    features,
    tags: [],
  };
}
