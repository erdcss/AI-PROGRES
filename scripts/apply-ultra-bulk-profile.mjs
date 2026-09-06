import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "client/src/pages/scraper.tsx");
let src = fs.readFileSync(target, "utf8");

const replacements = [
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 2500;", "const BULK_SCRAPE_RETRY_DELAY_MS = 600;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 2;", "const BULK_SCRAPE_CONCURRENCY_START = 6;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 2;", "const SHOPIFY_UPLOAD_CONCURRENCY = 6;"],
];

for (const [from, to] of replacements) {
  if (!src.includes(from) && !src.includes(to)) {
    throw new Error(`[ultra-bulk-profile] Beklenen kod bulunamadı: ${from}`);
  }
  src = src.split(from).join(to);
}

fs.writeFileSync(target, src);
console.log("[ultra-bulk-profile] bulk scrape concurrency=6, upload concurrency=6, retry delay=600ms");
