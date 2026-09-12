import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function patchFile(rel, fn) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, "utf8");
  const next = fn(src);
  if (next === src) return;
  fs.writeFileSync(file, next);
}

patchFile("server/services/marktgo/reconcile.service.ts", (src) => {
  if (!src.includes('from "./strict-tracking-sync.service"')) {
    src = src.replace(
      'import type { IntegrationProductMapping } from "@shared/schema";',
      'import type { IntegrationProductMapping } from "@shared/schema";\nimport { ensureTrackedProductForMarktGo, markMissingMarktGoTrackedProductDeleted } from "./strict-tracking-sync.service";',
    );
  }

  src = src.replace(
    `async function removeLocal(mapping: IntegrationProductMapping): Promise<void> {\n  if (mapping.trackedProductId) {\n    await db.delete(trackedProducts).where(eq(trackedProducts.id, mapping.trackedProductId));\n  }\n  await deleteProductMapping(mapping.id);\n}`,
    `async function removeLocal(mapping: IntegrationProductMapping): Promise<void> {\n  if (mapping.trackedProductId) {\n    const removed = await markMissingMarktGoTrackedProductDeleted(mapping.trackedProductId);\n    if (!removed) {\n      await db.delete(trackedProducts).where(eq(trackedProducts.id, mapping.trackedProductId));\n    }\n  }\n  await deleteProductMapping(mapping.id);\n}`,
  );

  // Do not mass-abort: each missing remote product is individually confirmed with GET /products/:id.
  src = src.replace(
    /\n  if \(shouldAbortCatalogWipe\(mappings\.length, liveFromList, missing\.length\)\) \{[\s\S]*?\n  \}\n\n  const removedLocalProductIds/,
    `\n  // Strict sync: an empty list is not enough to delete. Every missing mapping is verified\n  // individually below; only confirmed 404 records are removed.\n\n  const removedLocalProductIds`,
  );

  const oldLoop = `  let imported = 0;\n  const mappedExt = new Set(\n    (await listProductMappings(connection.id)).map((m) => String(m.externalProductId)),\n  );\n  for (const product of products) {\n    if (mappedExt.has(product.externalProductId)) continue;\n    try {\n      await upsertProductMapping({\n        connectionId: connection.id,\n        localProductId: product.poolId,\n        externalProductId: product.externalProductId,\n        externalId: stableExternalId(product.poolId),\n        status: "synced",\n      });\n      mappedExt.add(product.externalProductId);\n      imported += 1;\n    } catch {\n      skipped += 1;\n    }\n  }`;

  const newLoop = `  let imported = 0;\n  const currentMappings = await listProductMappings(connection.id);\n  const mappedExt = new Set(currentMappings.map((m) => String(m.externalProductId)));\n  for (const product of products) {\n    try {\n      const tracked = await ensureTrackedProductForMarktGo(product);\n      const wasMapped = mappedExt.has(product.externalProductId);\n      await upsertProductMapping({\n        connectionId: connection.id,\n        localProductId: product.poolId,\n        externalProductId: product.externalProductId,\n        externalId: stableExternalId(product.poolId),\n        trackedProductId: tracked?.id ?? null,\n        status: "synced",\n      });\n      mappedExt.add(product.externalProductId);\n      if (!wasMapped) imported += 1;\n    } catch (err) {\n      console.warn("[marktgo-reconcile] takip eşleme atlandı:", err instanceof Error ? err.message : err);\n      skipped += 1;\n    }\n  }`;
  if (src.includes(oldLoop)) src = src.replace(oldLoop, newLoop);
  return src;
});

patchFile("server/routes/tracking-routes.ts", (src) => {
  if (!src.includes('strict-tracking-sync.service')) {
    src = src.replace(
      'import { isMissingRelationError, isMissingColumnError } from "../migrations/run-product-tracking-migration";',
      'import { isMissingRelationError, isMissingColumnError } from "../migrations/run-product-tracking-migration";\nimport { splitNewTrackingSourceUrls } from "../services/marktgo/strict-tracking-sync.service";\nimport { triggerMarktGoCatalogReconcile, getLastMarktGoCatalogReconcile } from "../services/marktgo/reconcile.service";',
    );
  }
  const anchor = '  app.get("/api/tracking/products", async (req, res) => {';
  if (!src.includes('/api/tracking/duplicates/check')) {
    src = src.replace(anchor, `  app.post("/api/tracking/duplicates/check", async (req, res) => {\n    try {\n      const urls = Array.isArray(req.body?.urls) ? req.body.urls.map(String).slice(0, 1000) : [];\n      const result = await splitNewTrackingSourceUrls(urls);\n      return res.json({ success: true, ...result, duplicateCount: result.duplicateUrls.length });\n    } catch (err) {\n      return migrationErrorResponse(res, err);\n    }\n  });\n\n  app.post("/api/tracking/marktgo-reconcile", async (_req, res) => {\n    try {\n      const result = await triggerMarktGoCatalogReconcile(true);\n      return res.status(result?.success === false ? 422 : 200).json({ success: result?.success !== false, result });\n    } catch (err) {\n      return migrationErrorResponse(res, err);\n    }\n  });\n\n  app.get("/api/tracking/marktgo-reconcile", async (_req, res) => {\n    return res.json({ success: true, last: getLastMarktGoCatalogReconcile() });\n  });\n\n${anchor}`);
  }
  return src;
});

patchFile("server/routes.ts", (src) => {
  const anchor = '  async function postTrendyolScrapeHandler(req: any, res: any) {\n';
  if (!src.includes('duplicate-product')) {
    src = src.replace(anchor, `${anchor}    if (req.body?.allowDuplicate !== true) {\n      try {\n        const { findTrackedDuplicateBySourceUrl } = await import("./services/marktgo/strict-tracking-sync.service");\n        const duplicate = await findTrackedDuplicateBySourceUrl(String(req.body?.url || ""));\n        if (duplicate) {\n          return res.status(409).json({\n            success: false,\n            code: "duplicate-product",\n            message: "Bu ürün zaten MARKT-GO / takip listesinde. Aynı ürün yeniden çekilmedi.",\n            existingProduct: { id: duplicate.id, title: duplicate.sourceTitle, sourceUrl: duplicate.sourceUrl },\n          });\n        }\n      } catch (duplicateCheckError) {\n        console.warn("[duplicate-guard] kontrol soft-fail:", duplicateCheckError instanceof Error ? duplicateCheckError.message : duplicateCheckError);\n      }\n    }\n`);
  }
  return src;
});

patchFile("client/src/components/TrendyolCategoryBulkDrawer.tsx", (src) => {
  const anchor = '      const urls = [...uniqueById.values()].slice(0, selectedCount);\n      if (urls.length === 0) throw new Error("Kategori içinde ürün bağlantısı bulunamadı");';
  if (!src.includes('duplicateCount')) {
    src = src.replace(anchor, `      let urls = [...uniqueById.values()].slice(0, selectedCount);\n      if (urls.length === 0) throw new Error("Kategori içinde ürün bağlantısı bulunamadı");\n\n      try {\n        const duplicateResponse = await fetch("/api/tracking/duplicates/check", {\n          method: "POST",\n          headers: { "Content-Type": "application/json" },\n          body: JSON.stringify({ urls }),\n        });\n        if (duplicateResponse.ok) {\n          const duplicateData = await duplicateResponse.json();\n          const skippedDuplicates = Number(duplicateData?.duplicateCount || 0);\n          if (Array.isArray(duplicateData?.newUrls)) urls = duplicateData.newUrls;\n          if (skippedDuplicates > 0) {\n            toast({ title: \`\${skippedDuplicates} tekrar ürün atlandı\`, description: "Takip/MARKT-GO listesinde bulunan ürünler yeniden çekilmedi." });\n          }\n        }\n      } catch { /* server hard guard yine devrede */ }\n      if (urls.length === 0) throw new Error("Seçilen ürünlerin tamamı zaten takip/MARKT-GO listesinde.");`);
  }
  return src;
});

console.log("[strict-marktgo-sync] duplicate guard + bidirectional catalog tracking enabled");
