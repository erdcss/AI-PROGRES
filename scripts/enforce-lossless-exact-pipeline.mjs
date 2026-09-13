import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, value) {
  fs.writeFileSync(path.join(root, rel), value);
}

function replaceRequired(src, from, to, label) {
  if (src.includes(to)) return src;
  if (!src.includes(from)) {
    throw new Error(`[lossless-exact] anchor missing: ${label}`);
  }
  return src.replace(from, to);
}

// -----------------------------------------------------------------------------
// 1) Category drawer: persist reserve URLs for the core scraper.
// -----------------------------------------------------------------------------
const drawerPath = "client/src/components/TrendyolCategoryBulkDrawer.tsx";
let drawer = read(drawerPath);

if (!drawer.includes('const EXACT_RESERVE_STORAGE_KEY = "trendyol_category_exact_reserve_urls";')) {
  drawer = replaceRequired(
    drawer,
    'const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";',
    'const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";\nconst EXACT_RESERVE_STORAGE_KEY = "trendyol_category_exact_reserve_urls";',
    "drawer reserve storage key",
  );
}

if (!drawer.includes("sessionStorage.setItem(EXACT_RESERVE_STORAGE_KEY, JSON.stringify(reserveUrls));")) {
  drawer = replaceRequired(
    drawer,
    '      sessionStorage.setItem(EXACT_TARGET_STORAGE_KEY, String(targetCount));',
    '      sessionStorage.setItem(EXACT_TARGET_STORAGE_KEY, String(targetCount));\n      sessionStorage.setItem(EXACT_RESERVE_STORAGE_KEY, JSON.stringify(reserveUrls));',
    "persist reserve URLs after exact queue validation",
  );
}

if (!drawer.includes("sessionStorage.removeItem(EXACT_RESERVE_STORAGE_KEY);")) {
  drawer = drawer.replaceAll(
    '      sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);',
    '      sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);\n      sessionStorage.removeItem(EXACT_RESERVE_STORAGE_KEY);',
  );
}

write(drawerPath, drawer);

// -----------------------------------------------------------------------------
// 2) Core scraper: exact target is owned by processAllUrls, not by DOM timing.
//    Reserve candidates are internal work items. Failed candidates never reduce the
//    final requested count; the function keeps consuming reserves until N valid
//    previews are ready or the reserve pool is truly exhausted.
// -----------------------------------------------------------------------------
const scraperPath = "client/src/pages/scraper.tsx";
let scraper = read(scraperPath);

const helperAnchor = 'const AUTO_TAG_STORAGE_KEY = "turmarkt_auto_tag_enabled";';
const helperBlock = `const AUTO_TAG_STORAGE_KEY = "turmarkt_auto_tag_enabled";\nconst EXACT_BULK_TARGET_STORAGE_KEY = "trendyol_category_exact_target";\nconst EXACT_BULK_READY_STORAGE_KEY = "trendyol_category_exact_ready";\nconst EXACT_BULK_RESERVE_STORAGE_KEY = "trendyol_category_exact_reserve_urls";\n\nfunction readExactBulkTarget(): number | null {\n  try {\n    const value = Number(sessionStorage.getItem(EXACT_BULK_TARGET_STORAGE_KEY));\n    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;\n  } catch {\n    return null;\n  }\n}\n\nfunction readExactBulkReady(): number | null {\n  try {\n    const value = Number(sessionStorage.getItem(EXACT_BULK_READY_STORAGE_KEY));\n    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;\n  } catch {\n    return null;\n  }\n}\n\nfunction readExactBulkReserveUrls(): string[] {\n  try {\n    const parsed = JSON.parse(sessionStorage.getItem(EXACT_BULK_RESERVE_STORAGE_KEY) || "[]");\n    if (!Array.isArray(parsed)) return [];\n    return parsed.map(String).map((url) => normalizeProductUrl(url)).filter((url): url is string => Boolean(url));\n  } catch {\n    return [];\n  }\n}\n\nfunction setExactBulkReady(value: number | null): void {\n  try {\n    if (value && value > 0) sessionStorage.setItem(EXACT_BULK_READY_STORAGE_KEY, String(Math.floor(value)));\n    else sessionStorage.removeItem(EXACT_BULK_READY_STORAGE_KEY);\n  } catch {\n    /* sessionStorage kullanılamıyor */\n  }\n}\n\nfunction isExactBulkPreviewUsable(preview: CSVPreviewData): boolean {\n  const row = preview as unknown as Record<string, any>;\n  const title = String(row.productTitle || row.title || "").trim();\n  const price = Number(row.price?.original ?? row.price?.withProfit ?? row.price ?? 0);\n  const images = Array.isArray(row.images)\n    ? row.images.filter((item: unknown) => typeof item === "string" && /^https?:\\/\\//i.test(item))\n    : [];\n  return (\n    title.length >= 3 &&\n    Number.isFinite(price) &&\n    price > 0 &&\n    images.length > 0 &&\n    row.restoredFromDisk !== true &&\n    row.approvedForShopify !== false &&\n    row.shopifyUploadBlocked !== true &&\n    row.canonicalProduct?.shopifyUploadBlocked !== true &&\n    Boolean(String(row.sourceUrl || "").trim())\n  );\n}`;

if (!scraper.includes("function readExactBulkTarget()")) {
  scraper = replaceRequired(scraper, helperAnchor, helperBlock, "scraper exact helpers");
}

const processStartOld = `  const processAllUrls = async (items: UrlQueueItem[]) => {\n    const queue = items\n      .map((item) => ({ ...item, url: normalizeProductUrl(item.url) }))\n      .filter((item): item is UrlQueueItem & { url: string } => Boolean(item.url));\n\n    if (queue.length === 0) {`;
const processStartNew = `  const processAllUrls = async (items: UrlQueueItem[]) => {\n    const initialQueue = items\n      .map((item) => ({ ...item, url: normalizeProductUrl(item.url) }))\n      .filter((item): item is UrlQueueItem & { url: string } => Boolean(item.url));\n\n    const exactTarget = readExactBulkTarget();\n    const exactMode = Boolean(exactTarget && exactTarget > 1);\n    const displayTotal = exactMode ? exactTarget! : initialQueue.length;\n    const queue: Array<UrlQueueItem & { url: string }> = [...initialQueue];\n    if (exactMode) {\n      const seen = new Set(queue.map((item) => item.url));\n      for (const reserveUrl of readExactBulkReserveUrls()) {\n        if (seen.has(reserveUrl)) continue;\n        seen.add(reserveUrl);\n        queue.push({ url: reserveUrl, status: "pending" });\n      }\n      setExactBulkReady(null);\n    }\n\n    if (queue.length === 0) {`;
if (!scraper.includes("const initialQueue = items")) {
  scraper = replaceRequired(scraper, processStartOld, processStartNew, "core exact queue construction");
}

scraper = scraper.replace(
  '    setBulkProgress({ current: 0, total: queue.length });',
  '    setBulkProgress({ current: 0, total: displayTotal });',
);

const previewResetOld = `    // Önceki oturumdan yalnızca görüntüleme amacıyla geri yüklenen CSV'ler,\n    // yeni toplu işlemin ürün sayısına ve Shopify yükleme özetine karışmamalı.\n    setCsvPreviews((previous) =>\n      previous.filter((preview) => preview.restoredFromDisk !== true),\n    );`;
const previewResetNew = `    // Exact kategori çalışmasında önceki kartlar hedef adede karışamaz.\n    // Normal toplu akışta ise yalnız diskten restore edilen kartlar ayıklanır.\n    if (exactMode) {\n      setCsvPreviews([]);\n    } else {\n      setCsvPreviews((previous) =>\n        previous.filter((preview) => preview.restoredFromDisk !== true),\n      );\n    }`;
if (!scraper.includes("Exact kategori çalışmasında önceki kartlar")) {
  scraper = replaceRequired(scraper, previewResetOld, previewResetNew, "exact preview reset");
}

scraper = scraper.replace(
  '    setWorkflowStep(`0/${queue.length} ürün çekiliyor...`);',
  '    setWorkflowStep(`0/${displayTotal} ürün çekiliyor...`);',
);
scraper = scraper.replace(
  '      description: `${queue.length} ürün teker teker işlenecek...`,',
  '      description: exactMode ? `${displayTotal} başarılı ürün tamamlanana kadar yedekli çekim yapılacak...` : `${queue.length} ürün teker teker işlenecek...`,',
);

if (!scraper.includes("const successfulExactUrls: string[] = []")) {
  scraper = replaceRequired(
    scraper,
    '    let successCount = 0;\n    let failCount = 0;',
    '    let successCount = 0;\n    let failCount = 0;\n    const successfulExactUrls: string[] = [];',
    "exact success URL tracking",
  );
}

scraper = scraper.replace(
  '    let activeConcurrency = BULK_SCRAPE_CONCURRENCY_START;',
  '    let activeConcurrency = exactMode ? 1 : BULK_SCRAPE_CONCURRENCY_START;',
);
scraper = scraper.replace(
  '      while (scrapeCursor < queue.length) {',
  '      while (scrapeCursor < queue.length && (!exactMode || successCount < displayTotal)) {',
);

const previewBuildAnchor = '            const newPreview = buildCsvPreviewEntry(scraped, url, "bulk");';
const previewBuildReplacement = `            const newPreview = buildCsvPreviewEntry(scraped, url, "bulk");\n            if (exactMode && !isExactBulkPreviewUsable(newPreview as unknown as CSVPreviewData)) {\n              throw new Error("Ürün verisi MARKT-GO için eksik/geçersiz; yedek ürün kullanılacak");\n            }`;
if (!scraper.includes("Ürün verisi MARKT-GO için eksik/geçersiz")) {
  scraper = replaceRequired(scraper, previewBuildAnchor, previewBuildReplacement, "exact preview quality gate");
}

if (!scraper.includes("successfulExactUrls.push(url)")) {
  scraper = replaceRequired(
    scraper,
    '            successCount++;\n            if (rateLimitHits > 0)',
    '            successCount++;\n            if (exactMode) successfulExactUrls.push(url);\n            if (rateLimitHits > 0)',
    "track successful exact URL",
  );
}

scraper = scraper.replaceAll('`✅ ${i + 1}/${queue.length} tamamlandı`', '`✅ ${Math.min(successCount, displayTotal)}/${displayTotal} tamamlandı`');

const progressOld = `          completedScrapes++;\n          setBulkProgress({ current: completedScrapes, total: queue.length });\n          setWorkflowStep(\n            bulkStopRequestedRef.current\n              ? \`${"${successCount}"}/${"${queue.length}"} ürün alındı — durduruluyor...\`\n              : rateLimitHits > 0\n                ? \`${"${completedScrapes}"}/${"${queue.length}"} çekiliyor (429 koruması aktif)\`\n                : \`${"${completedScrapes}"}/${"${queue.length}"} ürün çekiliyor...\`,\n          );`;
const progressNew = `          completedScrapes++;\n          const progressCurrent = exactMode\n            ? Math.min(successCount, displayTotal)\n            : completedScrapes;\n          setBulkProgress({ current: progressCurrent, total: displayTotal });\n          setWorkflowStep(\n            bulkStopRequestedRef.current\n              ? \`${"${successCount}"}/${"${displayTotal}"} ürün alındı — durduruluyor...\`\n              : exactMode\n                ? \`${"${successCount}"}/${"${displayTotal}"} geçerli ürün hazır (denenen: ${"${completedScrapes}"})\`\n                : rateLimitHits > 0\n                  ? \`${"${completedScrapes}"}/${"${displayTotal}"} çekiliyor (429 koruması aktif)\`\n                  : \`${"${completedScrapes}"}/${"${displayTotal}"} ürün çekiliyor...\`,\n          );`;
if (!scraper.includes("const progressCurrent = exactMode")) {
  scraper = replaceRequired(scraper, progressOld, progressNew, "exact progress accounting");
}

const afterWorkersAnchor = `    await Promise.all(\n      Array.from(\n        { length: Math.min(activeConcurrency, queue.length) },\n        () => scrapeWorker(),\n      ),\n    );\n\n    // Durdurulduysa henüz başlamayan URL'leri pending bırak`;
const afterWorkersReplacement = `    await Promise.all(\n      Array.from(\n        { length: Math.min(activeConcurrency, queue.length) },\n        () => scrapeWorker(),\n      ),\n    );\n\n    const exactComplete = exactMode && successCount === displayTotal;\n    if (exactMode) {\n      if (exactComplete) {\n        const exactQueue = successfulExactUrls.slice(0, displayTotal).map((url) => ({\n          url,\n          status: "success" as const,\n        }));\n        setUrlQueue(exactQueue);\n        urlQueueRef.current = exactQueue;\n        setExactBulkReady(displayTotal);\n      } else {\n        setExactBulkReady(null);\n      }\n    }\n\n    // Durdurulduysa henüz başlamayan URL'leri pending bırak`;
if (!scraper.includes("const exactComplete = exactMode")) {
  scraper = replaceRequired(scraper, afterWorkersAnchor, afterWorkersReplacement, "exact completion state");
}

const finalStatusOld = `    if (successCount > 0 && failCount === 0 && !wasStopped) {\n      setScrapeError(null);\n      setScrapeErrorMeta(null);\n      setWorkflowStep(\`${"${successCount}"} ürün hazır — MARKT-GO'ya gönderebilirsiniz\`);\n    } else if (successCount > 0 && wasStopped) {`;
const finalStatusNew = `    if (exactMode && exactComplete && !wasStopped) {\n      setScrapeError(null);\n      setScrapeErrorMeta(null);\n      setWorkflowStep(\`${"${displayTotal}"}/${"${displayTotal}"} ürün hazır — MARKT-GO'ya eksiksiz gönderilebilir\`);\n    } else if (exactMode && !wasStopped) {\n      const missing = Math.max(0, displayTotal - successCount);\n      setScrapeError(\`Exact-count tamamlanamadı: ${"${successCount}"}/${"${displayTotal}"} ürün hazır. ${"${missing}"} ürün eksik; MARKT-GO aktarımı kilitli.\`);\n      setWorkflowStep(\`${"${successCount}"}/${"${displayTotal}"} ürün hazır — yedek havuzu tükendi\`);\n    } else if (successCount > 0 && failCount === 0 && !wasStopped) {\n      setScrapeError(null);\n      setScrapeErrorMeta(null);\n      setWorkflowStep(\`${"${successCount}"} ürün hazır — MARKT-GO'ya gönderebilirsiniz\`);\n    } else if (successCount > 0 && wasStopped) {`;
if (!scraper.includes("MARKT-GO'ya eksiksiz gönderilebilir")) {
  scraper = replaceRequired(scraper, finalStatusOld, finalStatusNew, "exact final workflow state");
}

scraper = scraper.replace(
  '      failedScrapes: failCount,',
  '      failedScrapes: exactMode ? Math.max(0, displayTotal - successCount) : failCount,',
);

const finalToastOld = `    toast({\n      title: wasStopped ? "Çekim Durduruldu" : "Toplu İşlem Tamamlandı",\n      description: wasStopped\n        ? \`✅ ${"${successCount}"} ürün korundu | ⛔ ${"${cancelledCount}"} iptal | ❌ Hata: ${"${failCount}"}\`\n        : \`✅ ${"${successCount}"} ürün | Stokta: ${"${inStockProducts}"} | Stok yok: ${"${outOfStockProducts}"} | Bilinmiyor: ${"${unknownStockProducts}"} | ❌ Hata: ${"${failCount}"}\`,\n      duration: 10000,\n    });`;
const finalToastNew = `    toast({\n      title: exactMode\n        ? exactComplete\n          ? "Exact-count Tamamlandı"\n          : "Exact-count Tamamlanamadı"\n        : wasStopped\n          ? "Çekim Durduruldu"\n          : "Toplu İşlem Tamamlandı",\n      description: exactMode\n        ? exactComplete\n          ? \`✅ ${"${displayTotal}"}/${"${displayTotal}"} geçerli ürün hazır. Başarısız adaylar yedek ürünlerle değiştirildi.\`\n          : \`⚠️ ${"${successCount}"}/${"${displayTotal}"} ürün hazır. Eksik adetle MARKT-GO aktarımı yapılmayacak.\`\n        : wasStopped\n          ? \`✅ ${"${successCount}"} ürün korundu | ⛔ ${"${cancelledCount}"} iptal | ❌ Hata: ${"${failCount}"}\`\n          : \`✅ ${"${successCount}"} ürün | Stokta: ${"${inStockProducts}"} | Stok yok: ${"${outOfStockProducts}"} | Bilinmiyor: ${"${unknownStockProducts}"} | ❌ Hata: ${"${failCount}"}\`,\n      duration: 10000,\n    });`;
if (!scraper.includes("Başarısız adaylar yedek ürünlerle değiştirildi")) {
  scraper = replaceRequired(scraper, finalToastOld, finalToastNew, "exact final toast");
}

// Bulk preview cards must not start dozens of Browser Worker review jobs while product
// scraping/upload is in progress. Server-side review backfill handles reviews later.
scraper = scraper.replace(
  '              reviewsPaused={isBulkProcessing}',
  '              reviewsPaused={isBulkProcessing || Boolean(uploadProgress) || csvPreviews.length > 1}',
);

// -----------------------------------------------------------------------------
// 3) Bulk MARKT-GO upload: internal exact guard + serial exact upload.
//    The old document click guard remains a UX backup; correctness now lives here.
// -----------------------------------------------------------------------------
const skippedAnchor = `    const skippedCount = idFilter\n      ? Math.max(0, (onlyPreviewIds?.length || 0) - eligiblePreviews.length)\n      : csvPreviews.length - eligiblePreviews.length;\n    if (eligiblePreviews.length === 0) {`;
const skippedReplacement = `    const skippedCount = idFilter\n      ? Math.max(0, (onlyPreviewIds?.length || 0) - eligiblePreviews.length)\n      : csvPreviews.length - eligiblePreviews.length;\n\n    const exactUploadTarget = idFilter ? null : readExactBulkTarget();\n    if (exactUploadTarget) {\n      const exactReady = readExactBulkReady();\n      if (\n        exactReady !== exactUploadTarget ||\n        csvPreviews.length !== exactUploadTarget ||\n        eligiblePreviews.length !== exactUploadTarget\n      ) {\n        toast({\n          title: "Exact-count aktarımı kilitli",\n          description: \`${"${exactUploadTarget}"} ürün hedeflendi. Hazır/uygun ürün sayısı ${"${eligiblePreviews.length}"}; ${"${exactUploadTarget}"}/${"${exactUploadTarget}"} olmadan MARKT-GO aktarımı başlamaz.\`,\n          variant: "destructive",\n          duration: 9000,\n        });\n        return;\n      }\n    }\n\n    if (eligiblePreviews.length === 0) {`;
if (!scraper.includes("Exact-count aktarımı kilitli")) {
  scraper = replaceRequired(scraper, skippedAnchor, skippedReplacement, "internal exact MARKT-GO guard");
}

scraper = scraper.replace(
  '      const SHOPIFY_UPLOAD_CONCURRENCY = 2;',
  '      const SHOPIFY_UPLOAD_CONCURRENCY = exactUploadTarget ? 1 : 2;',
);

// Ensure every pool payload opts into product-first upload. This prevents full review
// crawling from holding or failing the product create request.
const poolFastAnchor = `            tags: item.individualTags || [],\n            categoryPath:`;
const poolFastReplacement = `            tags: item.individualTags || [],\n            fastUpload: true,\n            categoryPath:`;
if (!scraper.includes("tags: item.individualTags || [],\n            fastUpload: true,")) {
  scraper = replaceRequired(scraper, poolFastAnchor, poolFastReplacement, "bulk pool fastUpload flag");
}

write(scraperPath, scraper);

// -----------------------------------------------------------------------------
// 4) Client pool mapper used by scraper: DO NOT drop fastUpload.
// -----------------------------------------------------------------------------
const clientMapPath = "client/src/lib/marktgo-pool-map.ts";
let clientMap = read(clientMapPath);
if (!clientMap.includes("fastUpload: input.fastUpload === true,")) {
  clientMap = replaceRequired(
    clientMap,
    '    reviewCount,\n    variants,',
    '    reviewCount,\n    fastUpload: input.fastUpload === true,\n    variants,',
    "client mapper fastUpload propagation",
  );
}
write(clientMapPath, clientMap);

// -----------------------------------------------------------------------------
// 5) Server review backfill: serialize background jobs instead of launching up to
//    50/100 Browser Worker crawls at once. Product sync stays fast and independent.
// -----------------------------------------------------------------------------
const syncPath = "server/services/marktgo/sync.service.ts";
let sync = read(syncPath);
if (sync.includes("[marktgo-fast] review backfill") && !sync.includes("fastReviewBackfillChain")) {
  const schedulerAnchor = 'type ReviewSyncResponse = {';
  const scheduler = `let fastReviewBackfillChain: Promise<void> = Promise.resolve();\n\nfunction scheduleFastReviewBackfill(task: () => Promise<void>): void {\n  fastReviewBackfillChain = fastReviewBackfillChain\n    .then(task, task)\n    .catch((err) => {\n      console.warn("[marktgo-fast] serialized review backfill failed",\n        err instanceof Error ? err.message : String(err));\n    });\n}\n\n${schedulerAnchor}`;
  sync = replaceRequired(sync, schedulerAnchor, scheduler, "serialized review scheduler");

  const begin = `    void (async () => {\n      try {\n        const full = await resolveProductReviews(input);`;
  const beginReplacement = `    scheduleFastReviewBackfill(async () => {\n      try {\n        const full = await resolveProductReviews(input);`;
  sync = replaceRequired(sync, begin, beginReplacement, "serialize fast review backfill start");
  sync = replaceRequired(
    sync,
    `      }\n    })();\n  }\n\n  let remoteReviewCount = 0;`,
    `      }\n    });\n  }\n\n  let remoteReviewCount = 0;`,
    "serialize fast review backfill end",
  );
}
write(syncPath, sync);

// -----------------------------------------------------------------------------
// 6) Category discovery reserve capacity. A user may request up to 500 products;
//    internal candidate capacity can be larger because reserve products are not sent
//    unless a primary candidate fails.
// -----------------------------------------------------------------------------
const discoveryPath = "server/trendyol-category-discovery-v4.ts";
let discovery = read(discoveryPath);
discovery = discovery.replace("const MAX_RAW_PAGES = 20;", "const MAX_RAW_PAGES = 40;");
const oldReserve = `  const reserveCount = Math.min(\n    500 - requestedCount,\n    Math.max(20, Math.ceil(requestedCount * 0.75)),\n  );\n  const candidateTarget = Math.min(500, requestedCount + reserveCount);`;
const newReserve = `  const reserveCount = Math.max(25, Math.ceil(requestedCount * 0.75));\n  const candidateTarget = Math.min(1000, requestedCount + reserveCount);`;
if (discovery.includes(oldReserve)) discovery = discovery.replace(oldReserve, newReserve);
write(discoveryPath, discovery);

console.log(
  "[lossless-exact] core exact replacement active; MARKT-GO exact guard active; fastUpload preserved; review backfill serialized",
);
