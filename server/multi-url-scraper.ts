import { scrapeAndMergeMultiUrl } from "./multi-url-stock-merge";

interface MultiUrlScrapeRequest {
  urls: Array<{ url: string }>;
  mode: "multi-url";
}

interface CombinedProduct {
  id: string;
  title: string;
  brand: string;
  price: unknown;
  description: string;
  category: string;
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
  features: Array<{ key: string; value: string }>;
  tags: string[];
  canonicalProduct?: unknown;
  stockSummary?: unknown;
  stockLabel?: string;
  manualReviewRequired?: boolean;
  shopifyUploadBlocked?: boolean;
  blockReason?: string;
  sourceUrl?: string;
  sourceProductId?: string;
}

/** Multi-URL scrape — her URL ana pipeline'dan geçer; sentetik stok matrisi oluşturulmaz */
export async function scrapeMultipleUrls(request: MultiUrlScrapeRequest): Promise<CombinedProduct> {
  const urls = request.urls.map((u) => u.url.trim()).filter(Boolean);
  console.log(`🎨 Multi-URL scraping (pipeline) started for ${urls.length} URLs`);

  const merged = await scrapeAndMergeMultiUrl(urls);

  return {
    id: merged.sourceProductId,
    title: merged.title,
    brand: merged.brand,
    price: { original: Number(merged.price) || 0, withProfit: Number(merged.price) || 0 },
    description: merged.description,
    category: merged.category,
    images: merged.images,
    variants: merged.variants,
    features: merged.features,
    tags: merged.tags,
    canonicalProduct: merged.canonicalProduct,
    stockSummary: merged.stockSummary,
    stockLabel: merged.stockLabel,
    manualReviewRequired: merged.manualReviewRequired,
    shopifyUploadBlocked: merged.shopifyUploadBlocked,
    blockReason: merged.blockReason,
    sourceUrl: merged.sourceUrl,
    sourceProductId: merged.sourceProductId,
  };
}
