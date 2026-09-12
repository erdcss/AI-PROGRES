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
  partial?: boolean;
  error?: string;
};

export function isTrendyolProductUrl(url: string | undefined | null): boolean {
  try {
    const parsed = new URL(url || "");
    return ["http:", "https:"].includes(parsed.protocol) &&
      ["trendyol.com", "www.trendyol.com"].includes(parsed.hostname) && /-p-\d+/.test(parsed.pathname);
  } catch { return false; }
}

type ReviewOptions = { shopifyProductId?: string; shopifyHandle?: string; signal?: AbortSignal };
type SavedReviews = { result: TrendyolReviewsResult; nextPage: number | null; expires: number };

/** Serialize card requests and resume successful pages without downloading them again. */
export function createTrendyolReviewsClient(
  fetcher: typeof fetch = fetch,
  sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
  now = Date.now,
) {
  let tail: Promise<unknown> = Promise.resolve();
  let cooldownUntil = 0;
  const saved = new Map<string, SavedReviews>();
  const pending = new Map<string, Promise<TrendyolReviewsResult>>();
  return (url: string, options?: ReviewOptions): Promise<TrendyolReviewsResult> => {
    const key = JSON.stringify([url.trim(), options?.shopifyProductId || "", options?.shopifyHandle || ""]);
    const current = pending.get(key);
    if (current) return current;
    const task = tail.catch(() => undefined).then(async () => {
      options?.signal?.throwIfAborted();
      const old = saved.get(key);
      const cache = old && old.expires > now() ? old : undefined;
      if (cache && cache.nextPage === null) return cache.result;
      let nextPage = cache?.nextPage ?? 0;
      const reviews = new Map((cache?.result.reviews || []).map(r => [r.id, r]));
      let productTitle = cache?.result.productTitle || "";
      let warning = "";
      let complete = false;
      let verified = Boolean(cache);
      for (let batch = 0; batch < 50; batch++) {
        if (options?.signal?.aborted) { warning = "Yorum çekimi duraklatıldı; alınan yorumlar korundu."; break; }
        if (cooldownUntil > now()) {
          warning = `Trendyol istek sınırı: ${Math.ceil((cooldownUntil - now()) / 1000)} saniye sonra tekrar deneyin.`;
          break;
        }
        try {
          const response = await fetcher("/api/reviews/scrape-trendyol", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url.trim(), shopifyProductId: options?.shopifyProductId?.trim() || "",
              shopifyHandle: options?.shopifyHandle?.trim() || "", startPage: nextPage }),
            signal: AbortSignal.timeout(60_000),
          });
          const data = await response.json().catch(() => null);
          const retryAfterMs = Number(data?.retryAfterMs || data?.meta?.retryAfterMs) || 0;
          if (response.status === 429 || retryAfterMs > 0) cooldownUntil = now() + Math.max(60_000, retryAfterMs);
          if (!response.ok || !data?.success || !Array.isArray(data.reviews)) {
            warning = data?.error || `Yorumlar çekilemedi (${response.status}).`;
            break;
          }
          verified = true;
          productTitle = data.productTitle || productTitle;
          for (const review of data.reviews as TrendyolReviewItem[]) if (review.id) reviews.set(review.id, review);
          if (!data.meta?.partial) { complete = true; break; }
          const following = Number(data.meta?.nextPage);
          warning = data.meta?.warning || "Yorumların bir bölümü alındı; tekrar deneyerek devam edebilirsiniz.";
          if (!Number.isInteger(following) || following <= nextPage) break;
          nextPage = following;
          if (retryAfterMs > 0) break;
          await sleep(2_500);
        } catch (error) {
          warning = error instanceof Error ? error.message : "Yorumlar çekilemedi.";
          break;
        }
      }
      const list = [...reviews.values()];
      const avg = list.length ? list.reduce((sum, r) => sum + r.rating, 0) / list.length : 0;
      const result: TrendyolReviewsResult = { success: verified, productTitle, reviews: list,
        stats: verified ? { total: list.length, avg: Math.round(avg * 10) / 10,
          dist: [1, 2, 3, 4, 5].map(star => list.filter(r => r.rating === star).length) } : null,
        partial: verified && !complete,
        error: complete ? undefined : warning || "Yorum çekimi tamamlanmadı; tekrar deneyerek devam edebilirsiniz." };
      if (verified) {
        if (saved.size >= 100) saved.delete(saved.keys().next().value!);
        saved.set(key, { result, nextPage: complete ? null : nextPage, expires: now() + 10 * 60_000 });
      }
      await sleep(2_500);
      return result;
    });
    pending.set(key, task);
    tail = task;
    void task.finally(() => pending.delete(key)).catch(() => undefined);
    return task;
  };
}

export const scrapeTrendyolReviewsForProduct = createTrendyolReviewsClient();
