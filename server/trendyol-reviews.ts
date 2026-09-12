import axios from "axios";
import * as cheerio from "cheerio";

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
      "[trendyol-reviews] yorum sayfası alınamadı, mevcut HTML kullanılacak:",
      error instanceof Error ? error.message : error,
    );
  }

  const extracted = extractTrendyolReviews(reviewHtml || productHtml || "");
  result.reviewSummary = extracted.summary;
  result.reviews = extracted.reviews;
}
