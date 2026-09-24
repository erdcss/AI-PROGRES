import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "server/services/tracking.scheduler.ts");
let src = fs.readFileSync(target, "utf8");

// MARKT-GO / kendi katalog altyapısındaki ürünlerin takip edilebilmesi için scheduler'ı
// legacy Shopify id eşleşmesine bağımlı bırakma. Panelde görünen, arşivlenmemiş ve
// kaynak URL'si olan kayıtlar takip havuzuna girebilir.
const oldVisibleCondition = `function visibleTrackedProductCondition() {\n  return and(\n    ne(trackedProducts.currentStatus, "shopify_deleted"),\n    isNull(trackedProducts.archivedAt),\n    or(\n      isNotNull(trackedProducts.shopifyProductId),\n      isNotNull(trackedProducts.shopifyProductGid),\n    ),\n  );\n}`;
const newVisibleCondition = `function visibleTrackedProductCondition() {\n  return and(\n    ne(trackedProducts.currentStatus, "shopify_deleted"),\n    isNull(trackedProducts.archivedAt),\n    isNotNull(trackedProducts.sourceUrl),\n  );\n}`;
if (src.includes(oldVisibleCondition)) {
  src = src.replace(oldVisibleCondition, newVisibleCondition);
}
const hasSourceUrlEligibility =
  src.includes("isNotNull(trackedProducts.sourceUrl)") ||
  src.includes("sourceUrl} ~* '^https?://'") ||
  src.includes("sourceUrl} ~* \"^https?://\"");
if (!hasSourceUrlEligibility) {
  throw new Error("[tracking-hardening] scheduler sourceUrl eligibility uygulanamadı");
}

// Hata durumuna düşmüş ürünleri scheduler dışına atmak onları sonsuza kadar hatalı bırakır.
// Kaynak URL'si bulunan ve takip açık olan kayıtları tekrar dene; yalnız silinmiş/arşivlenmiş
// ürünler visibleTrackedProductCondition tarafından dışarıda tutulur.
src = src.replace(
  `        and(\n          eq(trackedProducts.trackingEnabled, true),\n          eq(trackedProducts.currentStatus, "active"),\n          visibleTrackedProductCondition(),\n        ),`,
  `        and(\n          eq(trackedProducts.trackingEnabled, true),\n          visibleTrackedProductCondition(),\n        ),`,
);
src = src.replace(
  `        and(\n          eq(trackedProducts.trackingEnabled, true),\n          eq(trackedProducts.currentStatus, "active"),\n          visibleTrackedProductCondition(),\n          sql\\`\${trackedProducts.sourceUrl} ~* '^https?://'\\`,\n        ),`,
  `        and(\n          eq(trackedProducts.trackingEnabled, true),\n          visibleTrackedProductCondition(),\n          sql\\`\${trackedProducts.sourceUrl} ~* '^https?://'\\`,\n        ),`,
);
if (
  src.includes('eq(trackedProducts.currentStatus, "active"),\n          visibleTrackedProductCondition()')
) {
  throw new Error("[tracking-hardening] error-state retry eligibility uygulanamadı");
}

// Kapasite uyarısını her dakika spamlamamak için yalnız durum değiştiğinde yaz.
if (!src.includes("let lastCapacityWarningSignature")) {
  src = src.replace(
    "let lastShopifyReconcileAttemptAt: Date | null = null;",
    "let lastShopifyReconcileAttemptAt: Date | null = null;\nlet lastCapacityWarningSignature: string | null = null;",
  );
}

const oldBatchLoop = `    const batch = due.slice(0, settings.batchSize);\n    for (const p of batch) {\n      try {\n        await runManualProductCheck(p.id);\n      } catch (err) {\n        console.warn(\`Scheduler check failed for product \${p.id}:\`, err);\n      }\n      if (settings.requestDelayMs > 0) await sleep(settings.requestDelayMs);\n    }`;

const newBatchLoop = `    // Scheduler dakikada bir çalışıyor. Ayardaki checkIntervalMinutes gerçekten her\n    // ürün için hedef aralık olsun: katalog büyüdükçe gereken minimum batch otomatik artar.\n    // 788 ürün / 60 dakika => en az 14 ürün/döngü. Kullanıcının daha yüksek batch ayarı\n    // varsa ona dokunma. Güvenlik için tek döngüde en fazla 25 ürün işle.\n    const requiredBatchForInterval = Math.max(\n      1,\n      Math.ceil(products.length / Math.max(1, settings.checkIntervalMinutes)),\n    );\n    const effectiveBatchSize = Math.min(\n      25,\n      Math.max(settings.batchSize, requiredBatchForInterval),\n    );\n    const batch = due.slice(0, effectiveBatchSize);\n\n    const configuredCapacity =\n      Math.max(1, effectiveBatchSize) * Math.max(1, settings.checkIntervalMinutes);\n    const capacitySignature = \`\${products.length}:\${effectiveBatchSize}:\${settings.checkIntervalMinutes}\`;\n    if (products.length > configuredCapacity) {\n      if (lastCapacityWarningSignature !== capacitySignature) {\n        console.warn(\n          \`[tracking-capacity] \${products.length} takip ürünü var; effectiveBatch=\${effectiveBatchSize}, interval=\${settings.checkIntervalMinutes}dk. Tam rotasyon hedef aralığa sığmayabilir.\`,\n        );\n        lastCapacityWarningSignature = capacitySignature;\n      }\n    } else if (lastCapacityWarningSignature !== capacitySignature) {\n      console.info(\n        \`[tracking-capacity] Kapasite yeterli: \${products.length} ürün, configuredBatch=\${settings.batchSize}, effectiveBatch=\${effectiveBatchSize}, interval=\${settings.checkIntervalMinutes}dk\`,\n      );\n      lastCapacityWarningSignature = capacitySignature;\n    }\n\n    let cycleSucceeded = 0;\n    let cycleFailed = 0;\n    let cycleSkipped = 0;\n    let cycleChanges = 0;\n\n    // Tracking, kullanıcı tarafından başlatılan ürün importundan daha düşük önceliklidir.\n    // Varsayılan concurrency=1 Browser Worker kapasitesini toplu Trendyol çekimine bırakır;\n    // gerektiğinde TRACKING_SCRAPE_CONCURRENCY env ile kontrollü yükseltilebilir.\n    let batchCursor = 0;\n    const configuredTrackingConcurrency = Math.max(\n      1,\n      Math.min(3, Number(process.env.TRACKING_SCRAPE_CONCURRENCY) || 1),\n    );\n    const trackingConcurrency = Math.min(configuredTrackingConcurrency, Math.max(1, batch.length));\n    const trackingWorker = async () => {\n      while (batchCursor < batch.length) {\n        const index = batchCursor++;\n        const p = batch[index];\n        if (!p) return;\n        try {\n          const result: any = await runManualProductCheck(p.id);\n          if (result?.skipped) cycleSkipped += 1;\n          else if (result?.success === false) cycleFailed += 1;\n          else cycleSucceeded += 1;\n          cycleChanges += Math.max(0, Number(result?.changesCreated || 0));\n        } catch (err) {\n          cycleFailed += 1;\n          console.warn(\`Scheduler check failed for product \${p.id}:\`, err);\n        }\n        if (settings.requestDelayMs > 0) await sleep(settings.requestDelayMs);\n      }\n    };\n    await Promise.all(Array.from({ length: trackingConcurrency }, () => trackingWorker()));`;

if (src.includes(oldBatchLoop)) {
  src = src.replace(oldBatchLoop, newBatchLoop);
}
if (!src.includes("const requiredBatchForInterval")) {
  throw new Error("[tracking-hardening] dynamic interval batch uygulanamadı");
}
if (!src.includes("const trackingConcurrency")) {
  throw new Error("[tracking-hardening] scheduler concurrency uygulanamadı");
}
if (!src.includes("TRACKING_SCRAPE_CONCURRENCY")) {
  throw new Error("[tracking-hardening] düşük öncelikli tracking concurrency uygulanamadı");
}

const oldSyncLog = `    await trackingService.writeSyncLog({\n      action: "tracking_check",\n      status: "success",\n      message: \`Scheduler cycle: \${batch.length} ürün kontrol edildi\`,\n      meta: { schedulerRunId: runId, changeCount: batch.length },\n    });`;

const newSyncLog = `    await trackingService.writeSyncLog({\n      action: "tracking_check",\n      status: cycleFailed > 0 ? "warning" : "success",\n      message: \`Scheduler cycle: \${batch.length} ürün kontrol edildi · \${cycleChanges} değişiklik\`,\n      meta: {\n        schedulerRunId: runId,\n        totalEligible: products.length,\n        dueCount: due.length,\n        configuredBatchSize: settings.batchSize,\n        effectiveBatchSize,\n        trackingConcurrency,\n        selectedCount: batch.length,\n        succeeded: cycleSucceeded,\n        failed: cycleFailed,\n        skipped: cycleSkipped,\n        changesCreated: cycleChanges,\n      },\n    });\n\n    console.info(\n      \`[tracking-cycle] run=\${runId} eligible=\${products.length} due=\${due.length} batch=\${settings.batchSize}->\${effectiveBatchSize} concurrency=\${trackingConcurrency} checked=\${batch.length} success=\${cycleSucceeded} failed=\${cycleFailed} skipped=\${cycleSkipped} changes=\${cycleChanges} next=\${schedulerState.nextRunAt?.toISOString() || "-"}\`,\n    );`;

if (src.includes(oldSyncLog)) {
  src = src.replace(oldSyncLog, newSyncLog);
}
if (!src.includes("[tracking-cycle] run=")) {
  throw new Error("[tracking-hardening] scheduler runtime log uygulanamadı");
}

fs.writeFileSync(target, src);
console.log(
  "[tracking-hardening] all source-linked tracked products enabled; errors retry; dynamic interval batch + low-priority concurrency=1(default) + cycle/change observability enabled",
);
