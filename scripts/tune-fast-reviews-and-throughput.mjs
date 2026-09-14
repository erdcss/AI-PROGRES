import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);

// 1) Ürün çekme ve MARKT-GO gönderimi: exact-count korumasını bozmadan kontrollü hız.
// Build sırasında önceki injector'lar sayıları değiştirebildiği için sabit string yerine
// mevcut generated source'u regex ile ayarla.
const scraperPath = "client/src/pages/scraper.tsx";
let scraper = read(scraperPath);

scraper = scraper.replace(
  /const BULK_SCRAPE_CONCURRENCY_START = \d+;/,
  "const BULK_SCRAPE_CONCURRENCY_START = 3;",
);
scraper = scraper.replace(
  /const BULK_SCRAPE_RETRY_DELAY_MS = \d+;/,
  "const BULK_SCRAPE_RETRY_DELAY_MS = 800;",
);

// Exact upload guard generated source'da ternary olabilir. Exact akış 2, normal akış 3.
if (/const SHOPIFY_UPLOAD_CONCURRENCY = exactUploadTarget \? \d+ : \d+;/.test(scraper)) {
  scraper = scraper.replace(
    /const SHOPIFY_UPLOAD_CONCURRENCY = exactUploadTarget \? \d+ : \d+;/,
    "const SHOPIFY_UPLOAD_CONCURRENCY = exactUploadTarget ? 2 : 3;",
  );
} else {
  scraper = scraper.replace(
    /const SHOPIFY_UPLOAD_CONCURRENCY = \d+;/,
    "const SHOPIFY_UPLOAD_CONCURRENCY = 3;",
  );
}

scraper = scraper.replace(
  /let activeConcurrency = exactMode \? (?:1|Math\.min\(\d+, BULK_SCRAPE_CONCURRENCY_START\)) : BULK_SCRAPE_CONCURRENCY_START;/,
  "let activeConcurrency = exactMode ? Math.min(2, BULK_SCRAPE_CONCURRENCY_START) : BULK_SCRAPE_CONCURRENCY_START;",
);

if (!scraper.includes("const BULK_SCRAPE_CONCURRENCY_START = 3;")) {
  throw new Error("[throughput-tune] scrape concurrency=3 uygulanamadı");
}
if (
  !scraper.includes("const SHOPIFY_UPLOAD_CONCURRENCY = exactUploadTarget ? 2 : 3;") &&
  !scraper.includes("const SHOPIFY_UPLOAD_CONCURRENCY = 3;")
) {
  throw new Error("[throughput-tune] MARKT-GO concurrency hedefi uygulanamadı");
}
if (!scraper.includes("exactMode ? Math.min(2, BULK_SCRAPE_CONCURRENCY_START)")) {
  throw new Error("[throughput-tune] exact-count concurrency=2 uygulanamadı");
}
write(scraperPath, scraper);

// Review pacing is owned by the source client; do not replace its serialized queue.
const reviewsClient = read("client/src/lib/trendyol-reviews-client.ts");
if (!reviewsClient.includes("const task = tail.catch(() => undefined).then(async () => {")) {
  throw new Error("[throughput-tune] serialized review queue missing");
}

// 3) Browser Worker yorumları: worker bir istekte sınırlı sayfa döndürdüğünde partial
// sonucu tam sonuç sayma. nextPage üzerinden devam et, tüm başarılı parçaları birleştir.
const browserClientPath = "server/services/browser-worker-client.service.ts";
let browserClient = read(browserClientPath);
if (!browserClient.includes("export async function scrapeAllTrendyolReviewsWithBrowserWorker")) {
  browserClient += `\n\n/**\n * Browser Worker yorumlarını partial/nextPage zinciri üzerinden eksiksiz toplamaya çalışır.\n * Ürün oluşturma fastUpload sayesinde bunu beklemez; bu fonksiyon arka planda çalışır.\n */\nexport async function scrapeAllTrendyolReviewsWithBrowserWorker(input: {\n  url: string;\n  productId?: string;\n  pageSize?: number;\n  maxPages?: number;\n  timeoutMs?: number;\n}): Promise<BrowserWorkerTrendyolReviewsResult> {\n  const totalPageBudget = Math.max(1, Math.min(500, Math.trunc(input.maxPages ?? 500)));\n  const totalTimeoutMs = Math.max(30_000, Math.min(240_000, Math.trunc(input.timeoutMs ?? 180_000)));\n  const deadline = Date.now() + totalTimeoutMs;\n  const runChunk = (startPage: number, pageBudget: number) =>\n    scrapeTrendyolReviewsWithBrowserWorker({\n      ...input,\n      startPage,\n      maxPages: Math.min(10, Math.max(1, pageBudget)),\n      timeoutMs: Math.max(10_000, Math.min(65_000, deadline - Date.now())),\n    });\n\n  let aggregate = await runChunk(0, totalPageBudget);\n  if (!aggregate.success || !aggregate.partial || aggregate.nextPage == null) return aggregate;\n\n  const byId = new Map<string, Record<string, unknown>>();\n  const addRows = (rows: Record<string, unknown>[]) => {\n    rows.forEach((row, index) => {\n      const id = String(\n        row.id ?? row.reviewId ?? row.commentId ??\n        \`row-\${index}-\${JSON.stringify(row).slice(0, 100)}\`,\n      );\n      byId.set(id, row);\n    });\n  };\n  addRows(aggregate.reviews || []);\n\n  let pagesUsed = Math.max(1, Number(aggregate.pagesFetched || 0));\n  let nextPage = Number(aggregate.nextPage);\n  let summary = aggregate.summary || null;\n  let productTitle = aggregate.productTitle || \"\";\n  let durationMs = Number(aggregate.durationMs || 0);\n\n  while (\n    aggregate.success &&\n    aggregate.partial &&\n    Number.isInteger(nextPage) &&\n    nextPage >= 0 &&\n    pagesUsed < totalPageBudget &&\n    Date.now() < deadline - 5_000\n  ) {\n    const retryAfterMs = Math.max(0, Number(aggregate.retryAfterMs || 0));\n    if (retryAfterMs > 0) {\n      const remaining = deadline - Date.now() - 5_000;\n      if (remaining <= 0) break;\n      await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs, remaining)));\n    } else {\n      await new Promise((resolve) => setTimeout(resolve, 180));\n    }\n\n    const before = nextPage;\n    const chunk = await runChunk(nextPage, totalPageBudget - pagesUsed);\n    if (!chunk.success) {\n      return {\n        ...aggregate,\n        success: true,\n        reviews: [...byId.values()],\n        summary,\n        productTitle,\n        partial: true,\n        nextPage: before,\n        warning: chunk.error || aggregate.warning || \"Yorumların kalan bölümü sonraki denemede tamamlanacak.\",\n        durationMs,\n      };\n    }\n\n    addRows(chunk.reviews || []);\n    summary = chunk.summary || summary;\n    productTitle = chunk.productTitle || productTitle;\n    durationMs += Number(chunk.durationMs || 0);\n    pagesUsed += Math.max(1, Number(chunk.pagesFetched || 0));\n    aggregate = {\n      ...chunk,\n      reviews: [...byId.values()],\n      summary,\n      productTitle,\n      durationMs,\n    };\n\n    if (!chunk.partial || chunk.nextPage == null) {\n      return { ...aggregate, partial: false, nextPage: null };\n    }\n    const following = Number(chunk.nextPage);\n    if (!Number.isInteger(following) || following <= before) break;\n    nextPage = following;\n  }\n\n  return {\n    ...aggregate,\n    reviews: [...byId.values()],\n    summary,\n    productTitle,\n    partial: true,\n    nextPage: Number.isInteger(nextPage) ? nextPage : aggregate.nextPage,\n    warning: aggregate.warning || \"Yorumların kalan bölümü sonraki denemede tamamlanacak.\",\n    durationMs,\n  };\n}\n`;
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

// Exact injector yorum backfill'lerini tek sıra yaptıysa, iki kontrollü arka plan işçisine çıkar.
const serializedScheduler = `let fastReviewBackfillChain: Promise<void> = Promise.resolve();\n\nfunction scheduleFastReviewBackfill(task: () => Promise<void>): void {\n  fastReviewBackfillChain = fastReviewBackfillChain\n    .then(task, task)\n    .catch((err) => {\n      console.warn(\"[marktgo-fast] serialized review backfill failed\",\n        err instanceof Error ? err.message : String(err));\n    });\n}\n\n`;
const pooledScheduler = `const FAST_REVIEW_BACKFILL_CONCURRENCY = 2;\nlet fastReviewBackfillActive = 0;\nconst fastReviewBackfillQueue: Array<() => Promise<void>> = [];\n\nfunction drainFastReviewBackfills(): void {\n  while (fastReviewBackfillActive < FAST_REVIEW_BACKFILL_CONCURRENCY && fastReviewBackfillQueue.length > 0) {\n    const task = fastReviewBackfillQueue.shift();\n    if (!task) return;\n    fastReviewBackfillActive += 1;\n    void Promise.resolve()\n      .then(task)\n      .catch((err) => {\n        console.warn(\"[marktgo-fast] review backfill failed\",\n          err instanceof Error ? err.message : String(err));\n      })\n      .finally(() => {\n        fastReviewBackfillActive = Math.max(0, fastReviewBackfillActive - 1);\n        drainFastReviewBackfills();\n      });\n  }\n}\n\nfunction scheduleFastReviewBackfill(task: () => Promise<void>): void {\n  fastReviewBackfillQueue.push(task);\n  drainFastReviewBackfills();\n}\n\n`;
if (sync.includes(serializedScheduler)) {
  sync = sync.replace(serializedScheduler, pooledScheduler);
}
if (!sync.includes("scrapeAllTrendyolReviewsWithBrowserWorker")) {
  throw new Error("[throughput-tune] MARKT-GO tam yorum pagination aktif değil");
}
// Scheduler farklı bir injector sürümünde değişmişse build'i kırma; yorum doğruluğu tam
// pagination ile korunur, yalnız arka plan süresi daha uzun olabilir.
if (sync.includes("fastReviewBackfillChain")) {
  console.warn("[throughput-tune] review backfill scheduler serialized kaldı; güvenlik için değiştirilmedi");
}

// 5) Varyant güvenlik bariyeri: hız/yorum ayarı varyant üretim zincirini değiştirmez.
// Gerekli varyant + görsel bağlama noktaları yoksa build bilinçli olarak durur.
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
  "[throughput-tune] exact scrape=2, normal scrape=3, MARKT-GO exact=2/normal=3, card reviews=serialized, full review pagination=on, variant guard=on",
);
