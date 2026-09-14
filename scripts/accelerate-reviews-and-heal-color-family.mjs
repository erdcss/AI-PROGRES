import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 2) Preview: show review count/data already returned with the product immediately.
// Full review hydration may continue in the background, but the card must not sit on
// `Yorumlar çekiliyor...` when the main Trendyol response already contains summary/reviews.
const previewFile = path.join(root, "client/src/components/CSVDrawerProductPreview.tsx");
let previewSrc = fs.readFileSync(previewFile, "utf8");
const reviewStateAnchor = `    const [reviewsOpen, setReviewsOpen] = useState(false);\n    const [reviewsLoading, setReviewsLoading] = useState(false);\n    const [reviewsError, setReviewsError] = useState<string | null>(null);\n    const [reviews, setReviews] = useState<TrendyolReviewItem[]>([]);\n    const [reviewsStats, setReviewsStats] = useState<TrendyolReviewsStats | null>(null);\n    const [reviewsFetched, setReviewsFetched] = useState(false);`;
if (previewSrc.includes(reviewStateAnchor)) {
  previewSrc = previewSrc.replace(reviewStateAnchor, `    const embeddedReviews = Array.isArray((preview as any).reviews)\n      ? ((preview as any).reviews as TrendyolReviewItem[])\n      : [];\n    const embeddedSummary = ((preview as any).reviewStats || (preview as any).reviewSummary || null) as any;\n    const embeddedStats: TrendyolReviewsStats | null = embeddedSummary\n      ? {\n          total: Number(embeddedSummary.total ?? embeddedSummary.commentCount ?? embeddedSummary.reviewCount ?? embeddedReviews.length) || embeddedReviews.length,\n          avg: Number(embeddedSummary.avg ?? embeddedSummary.rating ?? 0) || 0,\n          dist: Array.isArray(embeddedSummary.dist) ? embeddedSummary.dist : [0, 0, 0, 0, 0],\n        }\n      : embeddedReviews.length\n        ? {\n            total: embeddedReviews.length,\n            avg: Math.round((embeddedReviews.reduce((sum, row) => sum + (Number(row.rating) || 0), 0) / embeddedReviews.length) * 10) / 10,\n            dist: [1, 2, 3, 4, 5].map((star) => embeddedReviews.filter((row) => Number(row.rating) === star).length),\n          }\n        : null;\n    const [reviewsOpen, setReviewsOpen] = useState(false);\n    const [reviewsLoading, setReviewsLoading] = useState(false);\n    const [reviewsError, setReviewsError] = useState<string | null>(null);\n    const [reviews, setReviews] = useState<TrendyolReviewItem[]>(embeddedReviews);\n    const [reviewsStats, setReviewsStats] = useState<TrendyolReviewsStats | null>(embeddedStats);\n    const [reviewsFetched, setReviewsFetched] = useState(Boolean(embeddedStats || embeddedReviews.length));`);
}
fs.writeFileSync(previewFile, previewSrc);

// Failed siblings must remain visible until their product data is recovered.
console.log("[reviews+color-family] embedded review preview enabled; sibling failures preserved");
