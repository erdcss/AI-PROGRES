import axios from "axios";
import * as cheerio from "cheerio";
import { scrapeTrendyolReviewsWithBrowserWorker } from "./services/browser-worker-client.service";

export type TrendyolReview = {
  author: string;
  date: string;
  body: string;
  rating: number | null;
  seller: string | null;
};

export type TrendyolReviewSummary = {
  rating: number;
  reviewCount: number;
  commentCount: number;
};

function headers() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function nestedNumber(root: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const direct = firstFinite(root[key]);
    if (direct != null) return direct;
  }
  for (const value of Object.values(root)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = firstFinite(nested[key]);
      if (candidate != null) return candidate;
    }
  }
  return null;
}

function normalizeWorkerReview(raw: Record<string, unknown>): TrendyolReview | null {
  const body = firstText(
    raw.comment,
    raw.commentText,
    raw.reviewText,
    raw.reviewBody,
    raw.body,
    raw.text,
    raw.description,
  ).replace(/\s+/g, " ").trim();
  if (!body) return null;

  const authorObject = asRecord(raw.author);
  const userObject = asRecord(raw.user);
  const sellerObject = asRecord(raw.seller);
  const ratingValue = firstFinite(
    raw.rate,
    raw.rating,
    raw.starCount,
    raw.score,
    asRecord(raw.reviewRating).ratingValue,
  );

  return {
    author:
      firstText(
        raw.userFullName,
        raw.userName,
        raw.reviewerName,
        raw.memberName,
        raw.customerName,
        authorObject.name,
        userObject.fullName,
        userObject.name,
      ) || "Anonim",
    date: firstText(
      raw.lastModifiedDate,
      raw.lastModifiedAt,
      raw.createdAt,
      raw.createdDate,
      raw.commentDate,
      raw.reviewDate,
      raw.date,
    ),
    body,
    rating:
      ratingValue != null && ratingValue >= 1 && ratingValue <= 5
        ? Math.round(ratingValue)
        : null,
    seller:
      firstText(
        raw.sellerName,
        raw.merchantName,
        raw.sellerTitle,
        sellerObject.name,
        sellerObject.title,
      ) || null,
  };
}

function normalizeWorkerSummary(
  raw: Record<string, unknown> | null | undefined,
  extractedCount: number,
): TrendyolReviewSummary {
  const summary = asRecord(raw);
  const productReviews = asRecord(summary.productReviews);
  const rating =
    nestedNumber(summary, ["averageRating", "averageRate", "rating", "avg", "score"]) ??
    nestedNumber(productReviews, ["averageRating", "averageRate", "rating", "avg", "score"]) ??
    0;
  const reviewCount =
    nestedNumber(summary, [
      "totalRatingCount",
      "ratingCount",
      "totalReviewCount",
      "reviewCount",
      "totalElements",
      "total",
    ]) ??
    nestedNumber(productReviews, [
      "totalRatingCount",
      "ratingCount",
      "totalReviewCount",
      "reviewCount",
      "totalElements",
      "total",
    ]) ??
    extractedCount;
  const commentCount =
    nestedNumber(summary, [
      "totalCommentCount",
      "commentCount",
      "totalReviewCount",
      "reviewCount",
      "totalElements",
      "total",
    ]) ??
    nestedNumber(productReviews, [
      "totalCommentCount",
      "commentCount",
      "totalReviewCount",
      "reviewCount",
      "totalElements",
      "total",
    ]) ??
    extractedCount;

  return {
    rating: Number.isFinite(rating) ? rating : 0,
    reviewCount: Math.max(extractedCount, Math.floor(reviewCount || 0)),
    commentCount: Math.max(extractedCount, Math.floor(commentCount || 0)),
  };
}

function extractProductId(productUrl: string): string {
  return (productUrl.match(/[/-]p-(\d+)/i) || [])[1] || "";
}

export function buildTrendyolReviewsUrl(productUrl: string): string {
  const parsed = new URL(productUrl);
  parsed.pathname =
    parsed.pathname.replace(/\/yorumlar\/?$/i, "").replace(/\/$/, "") + "/yorumlar";
  return parsed.toString();
}

export function extractTrendyolReviews(html: string): {
  summary: TrendyolReviewSummary;
  reviews: TrendyolReview[];
} {
  if (!html) {
    return {
      summary: { rating: 0, reviewCount: 0, commentCount: 0 },
      reviews: [],
    };
  }

  const $ = cheerio.load(html);
  const reviews: TrendyolReview[] = [];
  const seen = new Set<string>();

  const pushReview = (review: TrendyolReview) => {
    const body = String(review.body || "").replace(/\s+/g, " ").trim();
    if (body.length < 2) return;
    const key = `${review.author}|${review.date}|${body}`.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return;
    seen.add(key);
    reviews.push({ ...review, body });
  };

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const list = Array.isArray(node?.review)
          ? node.review
          : node?.review
            ? [node.review]
            : [];
        for (const item of list) {
          pushReview({
            author: item?.author?.name || item?.author || "Anonim",
            date: item?.datePublished || "",
            body: item?.reviewBody || item?.description || "",
            rating: Number(item?.reviewRating?.ratingValue) || null,
            seller: null,
          });
        }
      }
    } catch {
      // malformed JSON-LD is ignored
    }
  });

  const selectors = [
    ".comment",
    ".review-card",
    ".comment-card",
    "[class*='review-card']",
    "[class*='comment-card']",
    "[data-testid*='review']",
  ];

  $(selectors.join(",")).each((_, el) => {
    const card = $(el);
    const body = card
      .find(
        ".comment-text, .review-text, [class*='comment-text'], [class*='review-text'], p",
      )
      .first()
      .text()
      .trim();
    if (!body) return;

    const fullText = card.text().replace(/\s+/g, " ").trim();
    const date =
      (fullText.match(
        /\b\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4}\b/i,
      ) || [])[0] || "";
    const author =
      card
        .find("[class*='user'], [class*='author'], .comment-info")
        .first()
        .text()
        .trim()
        .replace(date, "")
        .trim() || "Anonim";
    const sellerMatch = fullText.match(/([^.!?]{2,80})\s+satıcısından alındı/i);
    const stars = card
      .find("[class*='full'], [class*='filled'], [aria-label*='yıldız']")
      .length;

    pushReview({
      author,
      date,
      body,
      rating: stars >= 1 && stars <= 5 ? stars : null,
      seller: sellerMatch?.[1]?.trim() || null,
    });
  });

  const text = $.root().text().replace(/\s+/g, " ");
  const rating =
    Number(
      (text.match(/(?:^|\s)([0-5][.,]\d)\s+\d+\s+Değerlendirme/i) || [])[1]?.replace(
        ",",
        ".",
      ),
    ) || 0;
  const reviewCount =
    Number(
      (text.match(/([\d.]+)\s+Değerlendirme/i) || [])[1]?.replace(/\./g, ""),
    ) || 0;
  const commentCount =
    Number((text.match(/([\d.]+)\s+Yorum/i) || [])[1]?.replace(/\./g, "")) ||
    reviews.length;

  return {
    summary: { rating, reviewCount, commentCount },
    reviews,
  };
}

export async function attachTrendyolReviews(
  result: any,
  productUrl: string,
  productHtml?: string | null,
): Promise<void> {
  const productId = extractProductId(productUrl);

  // Railway'dan Trendyol yorum sayfasına doğrudan HTTP isteği 403 döndürüyor.
  // Bu nedenle birincil yol Browser Worker + gerçek tarayıcı oturumu olmalı.
  if (productId) {
    try {
      const worker = await scrapeTrendyolReviewsWithBrowserWorker({
        url: productUrl,
        productId,
        pageSize: 50,
        maxPages: 1,
        timeoutMs: 35_000,
      });

      if (worker.success) {
        const normalized = worker.reviews
          .map((item) => normalizeWorkerReview(asRecord(item)))
          .filter((item): item is TrendyolReview => Boolean(item));
        const summary = normalizeWorkerSummary(worker.summary, normalized.length);

        result.reviewSummary = summary;
        result.reviews = normalized;
        result.reviewSource = "browser_worker";
        result.reviewFetchPartial = worker.partial === true;
        result.reviewNextPage = worker.nextPage ?? null;

        console.log("[trendyol-reviews] Browser Worker yorumları alındı", {
          productId,
          comments: normalized.length,
          reportedComments: summary.commentCount,
          partial: worker.partial === true,
        });
        return;
      }

      console.warn("[trendyol-reviews] Browser Worker yorum çekimi başarısız, HTML fallback deneniyor:", worker.error);
    } catch (error) {
      console.warn(
        "[trendyol-reviews] Browser Worker yorum hatası, HTML fallback deneniyor:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Son çare: direct HTML. Bu yol cloud ortamında 403 alabilir fakat local kullanım ve
  // geçmiş uyumluluk için tutuluyor; başarısız olması artık ana yorum yolunu bozmaz.
  let reviewHtml = "";
  try {
    const response = await axios.get(buildTrendyolReviewsUrl(productUrl), {
      headers: headers(),
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    reviewHtml = String(response.data || "");
  } catch (error) {
    console.warn(
      "[trendyol-reviews] direct yorum HTML alınamadı, mevcut ürün HTML'i kullanılacak:",
      error instanceof Error ? error.message : error,
    );
  }

  const extracted = extractTrendyolReviews(reviewHtml || productHtml || "");
  result.reviewSummary = extracted.summary;
  result.reviews = extracted.reviews;
  result.reviewSource = extracted.reviews.length ? "html" : "none";
}
