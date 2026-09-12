import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// Client: carry the UI switch state all the way into the MARKT-GO upload payload.
const scraperPath = path.join(root, "client/src/pages/scraper.tsx");
let sp = fs.readFileSync(scraperPath, "utf8");
sp = sp.replaceAll(
  "            tags: item.individualTags || [],\n",
  "            tags: item.individualTags || [],\n            autoTagEnabled,\n",
);
sp = sp.replaceAll(
  "        sourceUrl: preview.sourceUrl,\n",
  "        autoTagEnabled,\n        sourceUrl: preview.sourceUrl,\n",
);
fs.writeFileSync(scraperPath, sp);

// Client mapper: preserve the switch state in the pool product object.
const clientMapPath = path.join(root, "client/src/lib/marktgo-pool-map.ts");
let cm = fs.readFileSync(clientMapPath, "utf8");
if (!cm.includes("autoTagEnabled: input.autoTagEnabled !== false,")) {
  cm = cm.replace(
    "    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],\n",
    "    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],\n    autoTagEnabled: input.autoTagEnabled !== false,\n",
  );
}
fs.writeFileSync(clientMapPath, cm);

// Server: if automatic tagging is OFF, generate zero automatic/system tags.
// Manual tags still remain manual; no category/collection tags are inferred.
const poolMapPath = path.join(root, "server/services/marktgo/pool-map.ts");
let pm = fs.readFileSync(poolMapPath, "utf8");
const manualAnchor = "  const manualTags = Array.isArray(product.tags) ? product.tags.map(String) : [];\n";
if (pm.includes(manualAnchor) && !pm.includes("[auto-tag-toggle]")) {
  pm = pm.replace(
    manualAnchor,
    `${manualAnchor}  if (product.autoTagEnabled === false) {\n    // [auto-tag-toggle] Kesin kapatma: otomatik etiket, urun-havuzu/src sistem etiketi\n    // ve bunlardan türeyen kategori/koleksiyon eşlemesi üretilmez.\n    return { manualTags, autoTags: [], appliedTags: manualTags };\n  }\n`,
  );
}
fs.writeFileSync(poolMapPath, pm);

console.log("[auto-tag-toggle] OFF => zero automatic tags and zero inferred category tags");
