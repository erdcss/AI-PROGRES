export type TrendyolReviewItem = {
  id: string;
  title: string;
  body: string;
  rating: number;
  review_date: string;
  reviewer_name: string;
  reviewer_email: string;
  product_id: string;
  product_handle: string;
  reply: string;
  picture_urls: string;
};

export type TrendyolReviewsStats = {
  total: number;
  avg: number;
  dist: number[];
};

export type TrendyolReviewsResult = {
  success: boolean;
  productTitle: string;
  reviews: TrendyolReviewItem[];
  stats: TrendyolReviewsStats | null;
  error?: string;
};

export function isTrendyolProductUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  return /trendyol\.com/i.test(url) && /[/-]p-\d+/i.test(url);
}

export async function scrapeTrendyolReviewsForProduct(
  url: string,
  options?: { shopifyProductId?: string; shopifyHandle?: string; signal?: AbortSignal },
): Promise<TrendyolReviewsResult> {
  const response = await fetch("/api/reviews/scrape-trendyol", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url.trim(),
      shopifyProductId: options?.shopifyProductId?.trim() || "",
      shopifyHandle: options?.shopifyHandle?.trim() || "",
    }),
    signal: options?.signal,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data?.success) {
    return {
      success: false,
      productTitle: "",
      reviews: [],
      stats: null,
      error: data?.error || `Yorumlar çekilemedi (${response.status})`,
    };
  }

  const reviews = Array.isArray(data.reviews) ? (data.reviews as TrendyolReviewItem[]) : [];
  const stats =
    data.stats && typeof data.stats === "object"
      ? ({
          total: Number(data.stats.total) || reviews.length,
          avg: Number(data.stats.avg) || 0,
          dist: Array.isArray(data.stats.dist) ? data.stats.dist.map(Number) : [0, 0, 0, 0, 0],
        } satisfies TrendyolReviewsStats)
      : ({
          total: reviews.length,
          avg: 0,
          dist: [0, 0, 0, 0, 0],
        } satisfies TrendyolReviewsStats);

  return {
    success: true,
    productTitle: typeof data.productTitle === "string" ? data.productTitle : "",
    reviews,
    stats,
  };
}
