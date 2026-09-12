import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 1) Preserve reviews already attached by the main Trendyol scrape pipeline.
const scrapeClientPath = path.join(root, "client/src/lib/scrape-url-client.ts");
let sc = fs.readFileSync(scrapeClientPath, "utf8");
if (!sc.includes("reviewSummary?: { rating: number; reviewCount: number; commentCount: number };")) {
  sc = sc.replace(
    "  stockSummary?: {\n",
    "  reviews?: Array<{ author?: string; date?: string; body?: string; rating?: number | null; seller?: string | null }>;\n  reviewSummary?: { rating: number; reviewCount: number; commentCount: number };\n  stockSummary?: {\n",
  );
}
if (!sc.includes("reviews: Array.isArray(raw.reviews)")) {
  sc = sc.replace(
    "    stageErrors: Array.isArray(raw.stageErrors) ? (raw.stageErrors as string[]) : undefined,\n",
    "    stageErrors: Array.isArray(raw.stageErrors) ? (raw.stageErrors as string[]) : undefined,\n    reviews: Array.isArray(raw.reviews) ? (raw.reviews as ScrapedUrlPayload[\"reviews\"]) : [],\n    reviewSummary: raw.reviewSummary && typeof raw.reviewSummary === \"object\"\n      ? (raw.reviewSummary as ScrapedUrlPayload[\"reviewSummary\"])\n      : undefined,\n",
  );
}
if (!sc.includes("reviewSummary: data.reviewSummary")) {
  sc = sc.replace(
    "    sourceUrl: url,\n",
    "    sourceUrl: url,\n    reviews: data.reviews || [],\n    reviewSummary: data.reviewSummary,\n",
  );
}
fs.writeFileSync(scrapeClientPath, sc);

// 2) Render the inline review sample immediately; keep the full Browser Worker fetch in background.
const previewPath = path.join(root, "client/src/components/CSVDrawerProductPreview.tsx");
let pv = fs.readFileSync(previewPath, "utf8");
if (!pv.includes("reviewSummary?: { rating: number; reviewCount: number; commentCount: number };")) {
  pv = pv.replace(
    "  titleSource?: string;\n",
    "  titleSource?: string;\n  reviews?: Array<{ author?: string; date?: string; body?: string; rating?: number | null; seller?: string | null }>;\n  reviewSummary?: { rating: number; reviewCount: number; commentCount: number };\n",
  );
}
const oldStates = `    const [reviewsOpen, setReviewsOpen] = useState(false);\n    const [reviewsLoading, setReviewsLoading] = useState(false);\n    const [reviewsError, setReviewsError] = useState<string | null>(null);\n    const [reviews, setReviews] = useState<TrendyolReviewItem[]>([]);\n    const [reviewsStats, setReviewsStats] = useState<TrendyolReviewsStats | null>(null);\n    const [reviewsFetched, setReviewsFetched] = useState(false);`;
if (pv.includes(oldStates)) {
  const newStates = `    const inlineReviews = useMemo<TrendyolReviewItem[]>(() =>\n      (preview.reviews || []).map((item, index) => ({\n        id: \`inline-\${preview.id}-\${index + 1}\`,\n        title: \"\",\n        body: String(item.body || \"\"),\n        rating: Number(item.rating || 0),\n        review_date: String(item.date || \"\"),\n        reviewer_name: String(item.author || \"Anonim\"),\n        reviewer_email: \"\",\n        product_id: \"\",\n        product_handle: \"\",\n        reply: \"\",\n        picture_urls: \"\",\n      })).filter((item) => item.body.trim().length > 0),\n      [preview.id, preview.reviews],\n    );\n    const inlineStats = useMemo<TrendyolReviewsStats | null>(() => {\n      const summary = preview.reviewSummary;\n      if (!summary && inlineReviews.length === 0) return null;\n      const avg = summary?.rating || (inlineReviews.length ? inlineReviews.reduce((sum, r) => sum + r.rating, 0) / inlineReviews.length : 0);\n      return {\n        total: Number(summary?.commentCount || summary?.reviewCount || inlineReviews.length),\n        avg: Math.round(avg * 10) / 10,\n        dist: [1, 2, 3, 4, 5].map((star) => inlineReviews.filter((r) => r.rating === star).length),\n      };\n    }, [preview.reviewSummary, inlineReviews]);\n    const [reviewsOpen, setReviewsOpen] = useState(false);\n    const [reviewsLoading, setReviewsLoading] = useState(false);\n    const [reviewsError, setReviewsError] = useState<string | null>(null);\n    const [reviews, setReviews] = useState<TrendyolReviewItem[]>(inlineReviews);\n    const [reviewsStats, setReviewsStats] = useState<TrendyolReviewsStats | null>(inlineStats);\n    const [reviewsFetched, setReviewsFetched] = useState(inlineReviews.length > 0);`;
  pv = pv.replace(oldStates, newStates);
}
pv = pv.replace("        setReviewsLoading(true);\n", "        setReviewsLoading(reviews.length === 0);\n");
if (!pv.includes("setReviews((current) =>")) {
  pv = pv.replace(
    "          setReviews(result.reviews);\n",
    `          setReviews((current) => {\n            const merged = new Map<string, TrendyolReviewItem>();\n            [...current, ...result.reviews].forEach((review) => {\n              const key = review.id || \`\${review.reviewer_name}|\${review.review_date}|\${review.body}\`;\n              merged.set(key, review);\n            });\n            return [...merged.values()];\n          });\n`,
  );
}
fs.writeFileSync(previewPath, pv);

// 3) Send the real total review hint to MARKT-GO so partial card results are not mistaken for complete data.
const scraperPath = path.join(root, "client/src/pages/scraper.tsx");
let sp = fs.readFileSync(scraperPath, "utf8");
if (!sp.includes("expectedReviewCount: Number(preview.reviewSummary")) {
  sp = sp.replaceAll(
    "            reviewStats: getCachedTrendyolReviewsForProduct(preview.sourceUrl || \"\")?.stats || null,\n",
    "            reviewStats: getCachedTrendyolReviewsForProduct(preview.sourceUrl || \"\")?.stats || null,\n            expectedReviewCount: Number(preview.reviewSummary?.commentCount || preview.reviewSummary?.reviewCount || 0),\n",
  );
}
fs.writeFileSync(scraperPath, sp);

// 4) If provided reviews are only a partial sample, fetch the complete Trendyol set server-side before MARKT-GO review import.
const syncPath = path.join(root, "server/services/marktgo/sync.service.ts");
let sy = fs.readFileSync(syncPath, "utf8");
const oldProvided = `  const provided = sanitizeProvidedReviews(input.reviews);\n  if (provided.length > 0) {\n    return {\n      reviews: provided,\n      attempted: true,\n      expectedCount: Math.max(reviewCountHint(input), provided.length),\n      source: \"provided\",\n    };\n  }`;
if (sy.includes(oldProvided)) {
  sy = sy.replace(oldProvided, `  const provided = sanitizeProvidedReviews(input.reviews);\n  const hintedCount = reviewCountHint(input);\n  if (provided.length > 0 && (hintedCount <= 0 || provided.length >= hintedCount)) {\n    return {\n      reviews: provided,\n      attempted: true,\n      expectedCount: Math.max(hintedCount, provided.length),\n      source: \"provided\",\n    };\n  }`);
}
fs.writeFileSync(syncPath, sy);

console.log("[instant-reviews] inline sample shown immediately; full MARKT-GO review sync preserved");
