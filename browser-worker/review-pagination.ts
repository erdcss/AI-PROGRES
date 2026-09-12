export type ReviewBatch = {
  ok: boolean;
  status: number;
  reviews: Record<string, unknown>[];
  summary: Record<string, unknown> | null;
  errorText?: string;
  retryAfterMs?: number;
};

/** Never count a failed page as fetched, skip a page, or turn an error into zero reviews. */
export async function collectReviewPages(input: {
  fetchPage: (index: number) => Promise<ReviewBatch>;
  startPage?: number;
  maxPages: number;
  deadline: number;
  now?: () => number;
}) {
  const now = input.now || Date.now;
  let nextPage = Math.max(0, Math.trunc(input.startPage || 0));
  let totalPages = nextPage + 1;
  let pagesFetched = 0;
  let summary: Record<string, unknown> | null = null;
  let warning: string | undefined;
  let retryAfterMs: number | undefined;
  const byId = new Map<string, Record<string, unknown>>();
  while (nextPage < totalPages && pagesFetched < input.maxPages) {
    if (now() >= input.deadline - 5_000) { warning = "Yorum çekiminin süre sınırına ulaşıldı."; break; }
    let batch: ReviewBatch;
    try { batch = await input.fetchPage(nextPage); }
    catch (error) {
      if (!pagesFetched) throw error;
      warning = error instanceof Error ? error.message : "Yorum sayfası alınamadı.";
      retryAfterMs = Number((error as any)?.retryAfterMs) || undefined;
      break;
    }
    if (!batch.ok) {
      const error = Object.assign(new Error(batch.errorText || `Yorum sayfası alınamadı (HTTP ${batch.status}).`),
        { status: batch.status, retryAfterMs: batch.retryAfterMs });
      if (!pagesFetched) throw error;
      warning = error.message;
      retryAfterMs = batch.retryAfterMs;
      break;
    }
    summary = batch.summary || summary;
    const reported = Number(summary?.totalPages);
    // A full page without a page count may have a successor. Confirm with the next page.
    totalPages = Number.isFinite(reported) && reported >= 0 ? reported :
      batch.reviews.length ? nextPage + 2 : nextPage + 1;
    for (const review of batch.reviews) {
      const id = String(review.id ?? review.reviewId ?? "");
      if (id) byId.set(id, review);
    }
    pagesFetched++;
    nextPage++;
  }
  if (!pagesFetched) throw new Error(warning || "Yorum sayfası doğrulanamadı.");
  const partial = nextPage < totalPages;
  return { reviews: [...byId.values()], summary, totalPages, pagesFetched,
    partial, nextPage: partial ? nextPage : null,
    warning: partial ? warning || "Yorumların bir bölümü alındı; devamı sonraki istekte alınacak." : undefined,
    retryAfterMs };
}
