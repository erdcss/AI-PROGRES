import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "server/services/tracking.scheduler.ts");
let src = fs.readFileSync(target, "utf8");

// MARKT-GO / kendi katalog altyapısındaki ürünlerin takip edilebilmesi için scheduler'ı
// legacy Shopify id eşleşmesine bağımlı bırakma. Panelde görünen, aktif, arşivlenmemiş ve
// kaynak URL'si olan kayıtlar takip havuzuna girebilir.
const oldVisibleCondition = `function visibleTrackedProductCondition() {\n  return and(\n    ne(trackedProducts.currentStatus, "shopify_deleted"),\n    isNull(trackedProducts.archivedAt),\n    or(\n      isNotNull(trackedProducts.shopifyProductId),\n      isNotNull(trackedProducts.shopifyProductGid),\n    ),\n  );\n}`;
const newVisibleCondition = `function visibleTrackedProductCondition() {\n  return and(\n    ne(trackedProducts.currentStatus, "shopify_deleted"),\n    isNull(trackedProducts.archivedAt),\n    isNotNull(trackedProducts.sourceUrl),\n  );\n}`;
if (src.includes(oldVisibleCondition)) {
  src = src.replace(oldVisibleCondition, newVisibleCondition);
}
if (!src.includes("isNotNull(trackedProducts.sourceUrl)")) {
  throw new Error("[tracking-hardening] scheduler sourceUrl eligibility uygulanamadı");
}

// Kapasite uyarısını her dakika spamlamamak için yalnız durum değiştiğinde yaz.
if (!src.includes("let lastCapacityWarningSignature")) {
  src = src.replace(
    "let lastShopifyReconcileAttemptAt: Date | null = null;",
    "let lastShopifyReconcileAttemptAt: Date | null = null;\nlet lastCapacityWarningSignature: string | null = null;",
  );
}

const oldBatchLoop = `    const batch = due.slice(0, settings.batchSize);\n    for (const p of batch) {\n      try {\n        await runManualProductCheck(p.id);\n      } catch (err) {\n        console.warn(\`Scheduler check failed for product \${p.id}:\`, err);\n      }\n      if (settings.requestDelayMs > 0) await sleep(settings.requestDelayMs);\n    }`;

const newBatchLoop = `    const batch = due.slice(0, settings.batchSize);\n\n    // Ayardaki kontrol aralığının katalog büyüklüğünü gerçekten karşılayıp karşılamadığını\n    // görünür kıl. Örn. 788 ürün, batch=5, interval=60 => teorik kapasite 300 ürün/saat.\n    const configuredCapacity =\n      Math.max(1, settings.batchSize) * Math.max(1, settings.checkIntervalMinutes);\n    const capacitySignature = \`\${products.length}:\${settings.batchSize}:\${settings.checkIntervalMinutes}\`;\n    if (products.length > configuredCapacity) {\n      if (lastCapacityWarningSignature !== capacitySignature) {\n        console.warn(\n          \`[tracking-capacity] \${products.length} aktif ürün var; batch=\${settings.batchSize} ve interval=\${settings.checkIntervalMinutes}dk ile yaklaşık \${configuredCapacity} ürün/interval kapasitesi var. Tam rotasyon yaklaşık \${Math.ceil(products.length / Math.max(1, settings.batchSize))} dakika sürebilir.\`,\n        );\n        lastCapacityWarningSignature = capacitySignature;\n      }\n    } else if (lastCapacityWarningSignature !== null) {\n      console.info(\n        \`[tracking-capacity] Kapasite yeterli: \${products.length} ürün, batch=\${settings.batchSize}, interval=\${settings.checkIntervalMinutes}dk\`,\n      );\n      lastCapacityWarningSignature = null;\n    }\n\n    let cycleSucceeded = 0;\n    let cycleFailed = 0;\n    let cycleSkipped = 0;\n    let cycleChanges = 0;\n\n    for (const p of batch) {\n      try {\n        const result: any = await runManualProductCheck(p.id);\n        if (result?.skipped) cycleSkipped += 1;\n        else if (result?.success === false) cycleFailed += 1;\n        else cycleSucceeded += 1;\n        cycleChanges += Math.max(0, Number(result?.changesCreated || 0));\n      } catch (err) {\n        cycleFailed += 1;\n        console.warn(\`Scheduler check failed for product \${p.id}:\`, err);\n      }\n      if (settings.requestDelayMs > 0) await sleep(settings.requestDelayMs);\n    }`;

if (src.includes(oldBatchLoop)) {
  src = src.replace(oldBatchLoop, newBatchLoop);
}
if (!src.includes("let cycleChanges = 0;")) {
  throw new Error("[tracking-hardening] cycle metrics uygulanamadı");
}

const oldSyncLog = `    await trackingService.writeSyncLog({\n      action: "tracking_check",\n      status: "success",\n      message: \`Scheduler cycle: \${batch.length} ürün kontrol edildi\`,\n      meta: { schedulerRunId: runId, changeCount: batch.length },\n    });`;

const newSyncLog = `    await trackingService.writeSyncLog({\n      action: "tracking_check",\n      status: cycleFailed > 0 ? "warning" : "success",\n      message: \`Scheduler cycle: \${batch.length} ürün kontrol edildi · \${cycleChanges} değişiklik\`,\n      meta: {\n        schedulerRunId: runId,\n        totalEligible: products.length,\n        dueCount: due.length,\n        selectedCount: batch.length,\n        succeeded: cycleSucceeded,\n        failed: cycleFailed,\n        skipped: cycleSkipped,\n        changesCreated: cycleChanges,\n      },\n    });\n\n    console.info(\n      \`[tracking-cycle] run=\${runId} eligible=\${products.length} due=\${due.length} checked=\${batch.length} success=\${cycleSucceeded} failed=\${cycleFailed} skipped=\${cycleSkipped} changes=\${cycleChanges} next=\${schedulerState.nextRunAt?.toISOString() || "-"}\`,\n    );`;

if (src.includes(oldSyncLog)) {
  src = src.replace(oldSyncLog, newSyncLog);
}
if (!src.includes("[tracking-cycle] run=")) {
  throw new Error("[tracking-hardening] scheduler runtime log uygulanamadı");
}

fs.writeFileSync(target, src);
console.log(
  "[tracking-hardening] own-catalog coverage enabled; scheduler capacity + cycle/change observability enabled",
);
