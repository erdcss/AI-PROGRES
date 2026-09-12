import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "client/src/pages/scraper.tsx");
let src = fs.readFileSync(target, "utf8");

const before = src;
const pattern = /\n\s*\{runtimeCapabilities\?\.isCloudRuntime && \(\s*\n\s*<div className="mb-4">[\s\S]*?\n\s*<\/div>\s*\n\s*\)\}\s*/m;
src = src.replace(pattern, "\n");

if (src === before) {
  throw new Error("[hide-runtime-panel] provider/runtime panel bulunamadi");
}
if (src.includes('Provider: {(runtimeCapabilities.selectedProviders || []).join(" → ") || "—"}')) {
  throw new Error("[hide-runtime-panel] provider metni hala mevcut");
}

fs.writeFileSync(target, src);
console.log("[hide-runtime-panel] scraper provider/runtime bilgi kutusu kaldirildi");
