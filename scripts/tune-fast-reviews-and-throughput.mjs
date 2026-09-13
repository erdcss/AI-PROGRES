import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);

function replaceAllKnown(src, pairs) {
  let out = src;
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out;
}

// 1) Ürün çekme: exact-count korumasını bozmadan kontrollü paralelliği artır.
// Exact kategori modu 1 yerine 2 işçi, normal toplu akış 3 işçi kullanır.
const scraperPath = "client/src/pages/scraper.tsx";
let scraper = read(scraperPath);
scraper = replaceAllKnown(scraper, [
  ["const BULK_SCRAPE_CONCURRENCY_START = 1;", "const BULK_SCRAPE_CONCURRENCY_START = 3;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 2;", "const BULK_SCRAPE_CONCURRENCY_START = 3;"],
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 1200;", "const BULK_SCRAPE_RETRY_DELAY_MS = 800;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 2;", "const SHOPIFY_UPLOAD_CONCURRENCY = 3;"],
]);
scraper = scraper.replace(
  "    let activeConcurrency = exactMode ? 1 : BULK_SCRAPE_CONCURRENCY_START;",
  "    let activeConcurrency = exactMode ? Math.min(2, BULK_SCRAPE_CONCURRENCY_START) : BULK_SCRAPE_CONCURRENCY_START;",
);
if (!scraper.includes("const BULK_SCRAPE_CONCURRENCY_START = 3;")) {
  throw new Error("[throughput-tune] scrape concurrency=3 uygulanamadı");
}
if (!scraper.includes("const SHOPIFY_UPLOAD_CONCURRENCY = 3;")) {
  throw new Error("[throughput-tune] MARKT-GO concurrency=3 uygulanamadı");
}
if (!scraper.includes("exactMode ? Math.min(2, BULK_SCRAPE_CONCURRENCY_START)")) {
  throw new Error("[throughput-tune] exact-count concurrency=2 uygulanamadı");
}
write(scraperPath, scraper);

// 2) Kart yorumları: 8 paralel istek Trendyol/worker rate-limit riskini yükseltiyordu.
// 4 paralel + kısa pacing, seri akıştan çok daha hızlı ama daha kararlı.
const reviewsClientPath = "client/src/lib/trendyol-reviews-client.ts";
let reviewsClient = read(reviewsClientPath);
reviewsClient = replaceAllKnown(reviewsClient, [
  ["const REVIEW_FETCH_CONCURRENCY = 8;", "const REVIEW_FETCH_CONCURRENCY = 4;"],
  ["const REVIEW_FETCH_CONCURRENCY = 3;", "const REVIEW_FETCH_CONCURRENCY = 4;"],
  ["await sleep(250);", "await sleep(150);"],
  ["await sleep(75);", "await sleep(150);"],
]);
if (!reviewsClient.includes("const REVIEW_FETCH_CONCURRENCY = 4;")) {
  throw new Error("[throughput-tune] yorum concurrency=4 uygulanamadı");
}
write(reviewsClientPath, reviewsClient);

// 3) Browser Worker yorumları: worker tek istekte en fazla 10 sayfa döndürebilir.
// MARKT-GO arka plan senkronu partial sonucu tam sonuç sanmasın; nextPage üzerinden
// otomatik devam ederek tüm sayfaları birleştir.
const browserClientPath = "server/services/browser-worker-client.service.ts";
let browserClient = read(browserClientPath);
if (!browserClient.includes("export async function scrapeAllTrendyolReviewsWithBrowserWorker")) {
  browserClient += `\n\n/**\n * Yorum sayfalarını Browser Worker'ın 10 sayfalık parçaları üzerinden eksiksiz toplar.\n * Başarılı sayfalar korunur; partial=true ise nextPage'den devam edilir.\n */\nexport async function scrapeAllTrendyolReviewsWithBrowserWorker(input: {\n  url: string;\n  productId?: string;\n  pageSize?: number;\n  maxPages?: number;\n  timeoutMs?: number;\n}): Promise<BrowserWorkerTrendyolReviewsResult> {\n  const totalPageBudget = Math.max(1, Math.min(500, Math.trunc(input.maxPages ?? 500)));\n  const totalTimeoutMs = Math.max(30_000, Math.min(240_000, Math.trunc(input.timeoutMs ?? 180_000)));\n  const deadline = Date.now() + totalTimeoutMs;\n  const runChunk = (startPage: number, pageBudget: number) =>\n    scrapeTrendyolReviewsWithBrowserWorker({\n      ...input,\n      startPage,\n      maxPages: Math.min(10, pageBudget),\n      timeoutMs: Math.max(10_000, Math.min(65_000, deadline - Date.now())),\n    });\n\n  let aggregate = await runChunk(0, totalPageBudget);\n  if (!aggregate.success || !aggregate.partial || aggregate.nextPage == null) return aggregate;\n\n  const byId = new Map<string, Record<string, unknown>>();\n  const addRows = (rows: Record<string, unknown>[]) => {\n    rows.forEach((row, index) => {\n      const id = String(row.id ?? row.reviewId ?? row.commentId ?? \`row-\${index}-\${JSON.stringify(row).slice(0, 80)}\`);\n      byId.set(id, row);\n    });\n  };\n  addRows(aggregate.reviews || []);\n\n  let pagesUsed = Math.max(1, Number(aggregate.pagesFetched || 0));\n  let nextPage = Number(aggregate.nextPage);\n  let summary = aggregate.summary || null;\n  let productTitle = aggregate.productTitle || \"\";\n  let durationMs = Number(aggregate.durationMs || 0);\n\n  while (\n    aggregate.success &&\n    aggregate.partial &&\n    Number.isInteger(nextPage) &&\n    nextPage >= 0 &&\n    pagesUsed < totalPageBudget &&\n    Date.now() < deadline - 5_000\n  ) {\n    if (Number(aggregate.retryAfterMs || 0) > 0) break;\n    await new Promise((resolve) => setTimeout(resolve, 180));\n    const before = nextPage;\n    const chunk = await runChunk(nextPage, totalPageBudget - pagesUsed);\n    if (!chunk.success) {\n      return {\n        ...aggregate,\n        success: true,\n        reviews: [...byId.values()],\n        summary,\n        productTitle,\n        partial: true,\n        nextPage: before,\n        warning: chunk.error || aggregate.warning || \"Yorumların kalan bölümü sonraki denemede tamamlanacak.\",\n        durationMs,\n      };\n    }\n\n    addRows(chunk.reviews || []);\n    summary = chunk.summary || summary;\n    productTitle = chunk.productTitle || productTitle;\n    durationMs += Number(chunk.durationMs || 0);\n    pagesUsed += Math.max(1, Number(chunk.pagesFetched || 0));\n    aggregate = {\n      ...chunk,\n      reviews: [...byId.values()],\n      summary,\n      productTitle,\n      durationMs,\n    };\n\n    if (!chunk.partial || chunk.nextPage == null) {\n      return { ...aggregate, partial: false, nextPage: null };\n    }\n    const following = Number(chunk.nextPage);\n    if (!Number.isInteger(following) || following <= before) break;\n    nextPage = following;\n  }\n\n  return {\n    ...aggregate,\n    reviews: [...byId.values()],\n    summary,\n    productTitle,\n    partial: true,\n    nextPage: Number.isInteger(nextPage) ? nextPage : aggregate.nextPage,\n    warning: aggregate.warning || \"Yorumların kalan bölümü sonraki denemede tamamlanacak.\",\n    durationMs,\n  };\n}\n`;
}
write(browserClientPath, browserClient);

// 4) MARKT-GO yorum senkronu tam pagination wrapper'ını kullansın.
const syncPath = "server/services/marktgo/sync.service.ts";
let sync = read(syncPath);
sync = sync.replace(
  'import { scrapeTrendyolReviewsWithBrowserWorker } from "../browser-worker-client.service";',
  'import { scrapeAllTrendyolReviewsWithBrowserWorker } from "../browser-worker-client.service";',
);
sync = sync.replaceAll(
  "await scrapeTrendyolReviewsWithBrowserWorker({",
  "await scrapeAllTrendyolReviewsWithBrowserWorker({",
);

// Lossless exact script server yorum backfill'lerini tek sıra yapıyordu. İki işçi kullan:
// ürün gönderimi etkilenmez, sadece yorum tamamlama süresi kısalır.
const serializedScheduler = `let fastReviewBackfillChain: Promise<void> = Promise.resolve();\n\nfunction scheduleFastReviewBackfill(task: () => Promise<void>): void {\n  fastReviewBackfillChain = fastReviewBackfillChain\n    .then(task, task)\n    .catch((err) => {\n      console.warn(\"[marktgo-fast] serialized review backfill failed\",\n        err instanceof Error ? err.message : String(err));\n    });\n}\n\n`;
const pooledScheduler = `const FAST_REVIEW_BACKFILL_CONCURRENCY = 2;\nlet fastReviewBackfillActive = 0;\nconst fastReviewBackfillQueue: Array<() => Promise<void>> = [];\n\nfunction drainFastReviewBackfills(): void {\n  while (fastReviewBackfillActive < FAST_REVIEW_BACKFILL_CONCURRENCY && fastReviewBackfillQueue.length > 0) {\n    const task = fastReviewBackfillQueue.shift();\n    if (!task) return;\n    fastReviewBackfillActive += 1;\n    void Promise.resolve()\n      .then(task)\n      .catch((err) => {\n        console.warn(\"[marktgo-fast] review backfill failed\",\n          err instanceof Error ? err.message : String(err));\n      })\n      .finally(() => {\n        fastReviewBackfillActive = Math.max(0, fastReviewBackfillActive - 1);\n        drainFastReviewBackfills();\n      });\n  }\n}\n\nfunction scheduleFastReviewBackfill(task: () => Promise<void>): void {\n  fastReviewBackfillQueue.push(task);\n  drainFastReviewBackfills();\n}\n\n`;
if (sync.includes(serializedScheduler)) {
  sync = sync.replace(serializedScheduler, pooledScheduler);
}
if (!sync.includes("scrapeAllTrendyolReviewsWithBrowserWorker")) {
  throw new Error("[throughput-tune] MARKT-GO tam yorum pagination aktif değil");
}
if (sync.includes("fastReviewBackfillChain") || !sync.includes("FAST_REVIEW_BACKFILL_CONCURRENCY = 2")) {
  throw new Error("[throughput-tune] yorum backfill pool=2 uygulanamadı");
}

// 5) Varyant güvenlik bariyeri: hız ayarı varyant üretim zincirini sessizce bozarsa build durur.
for (const anchor of [
  "function buildInlineVariants(input: LocalProductInput)",
  "const rows = input.variants || [];",
  "variant_images",
  "imageUrl",
]) {
  if (!sync.includes(anchor)) {
    throw new Error(`[throughput-tune] varyant güvenlik kontrolü başarısız: ${anchor}`);
  }
}
write(syncPath, sync);

console.log(
  "[throughput-tune] exact scrape=2, normal scrape=3, MARKT-GO=3, card reviews=4, review backfill=2, full review pagination=on, variant guard=on",
);
