import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 1) Reviews: product cards must start together, not wait behind a tiny queue.
const reviewsClient = path.join(root, "client/src/lib/trendyol-reviews-client.ts");
let reviewSrc = fs.readFileSync(reviewsClient, "utf8");
reviewSrc = reviewSrc.replaceAll("const REVIEW_FETCH_CONCURRENCY = 3;", "const REVIEW_FETCH_CONCURRENCY = 8;");
reviewSrc = reviewSrc.replaceAll("await sleep(250);", "await sleep(75);");
fs.writeFileSync(reviewsClient, reviewSrc);

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

// 3) Color family: a failed extra sibling must not make an otherwise complete family
// appear broken. Only clear the sibling error when the actual merged payload proves that
// colors, galleries, variants and aliases fully cover the family.
const familyFile = path.join(root, "server/trendyol-color-family.ts");
let familySrc = fs.readFileSync(familyFile, "utf8");
familySrc = familySrc.replace(
  "  const failedMemberCount = failedMembers.length;",
  "  let failedMemberCount = failedMembers.length;",
);
const imageOkAnchor = `  const variantsImagesOk =\n    variants.length === 0 ? false : variantsWithImage >= Math.min(variants.length, 2);`;
if (familySrc.includes(imageOkAnchor) && !familySrc.includes("familyCoverageCompleteDespiteSiblingFailure")) {
  familySrc = familySrc.replace(imageOkAnchor, `${imageOkAnchor}\n\n  // Trendyol bazen aynı renk ailesine artık erişilemeyen/eski bir kardeş URL bırakıyor.\n  // Bir kardeş başarısız olsa bile kalan canlı veriler bütün renkleri gerçekten kapsıyorsa\n  // bunu kullanıcıya sahte \"1 hata\" olarak göstermeyelim.\n  const familyCoverageCompleteDespiteSiblingFailure =\n    failedMemberCount > 0 &&\n    fetchedMemberCount >= 2 &&\n    colors.length >= 2 &&\n    Boolean(familySourceKey) &&\n    sourceAliases.length >= colors.length &&\n    allGalleriesOk &&\n    allSizesOk &&\n    allVariantsOk &&\n    variantsCoverColors &&\n    variantsImagesOk;\n  const effectiveFailedMembers = familyCoverageCompleteDespiteSiblingFailure ? [] : failedMembers;\n  if (familyCoverageCompleteDespiteSiblingFailure) failedMemberCount = 0;`);
}
familySrc = familySrc.replace(
  "    failedMembers,\n    memberStatuses,",
  "    failedMembers: effectiveFailedMembers,\n    memberStatuses,",
);
fs.writeFileSync(familyFile, familySrc);

console.log("[reviews+color-family] review concurrency=8, embedded review preview enabled, redundant sibling failures healed");
