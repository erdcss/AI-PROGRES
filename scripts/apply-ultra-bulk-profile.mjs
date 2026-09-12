import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const target = path.join(root, "client/src/pages/scraper.tsx");
let src = fs.readFileSync(target, "utf8");

const replacements = [
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 2500;", "const BULK_SCRAPE_RETRY_DELAY_MS = 1200;"],
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 600;", "const BULK_SCRAPE_RETRY_DELAY_MS = 1200;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 2;", "const BULK_SCRAPE_CONCURRENCY_START = 1;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 6;", "const BULK_SCRAPE_CONCURRENCY_START = 1;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 3;", "const BULK_SCRAPE_CONCURRENCY_START = 1;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 2;", "const SHOPIFY_UPLOAD_CONCURRENCY = 3;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 6;", "const SHOPIFY_UPLOAD_CONCURRENCY = 3;"],
];

for (const [from, to] of replacements) {
  if (src.includes(from)) {
    src = src.split(from).join(to);
  }
}

if (!src.includes("const BULK_SCRAPE_CONCURRENCY_START = 1;")) {
  throw new Error("[ultra-bulk-profile] bulk scrape concurrency uygulanamadı");
}
if (!src.includes("const SHOPIFY_UPLOAD_CONCURRENCY = 3;")) {
  throw new Error("[ultra-bulk-profile] upload concurrency uygulanamadı");
}
if (!src.includes("const BULK_SCRAPE_RETRY_DELAY_MS = 1200;")) {
  throw new Error("[ultra-bulk-profile] retry delay uygulanamadı");
}

fs.writeFileSync(target, src);
console.log("[ultra-bulk-profile] paced bulk scrape concurrency=1, upload concurrency=3, retry delay=1200ms");

const banFlowFix = path.join(root, "scripts/fix-trendyol-ban-and-marktgo-flow.mjs");
if (!fs.existsSync(banFlowFix)) {
  throw new Error("[ultra-bulk-profile] Trendyol ban/MARKT-GO flow fix bulunamadı");
}
execFileSync(process.execPath, [banFlowFix], { cwd: root, stdio: "inherit" });

const category500Injector = path.join(root, "scripts/enable-trendyol-category-500.mjs");
if (!fs.existsSync(category500Injector)) {
  throw new Error("[ultra-bulk-profile] Trendyol category 500 injector bulunamadı");
}
execFileSync(process.execPath, [category500Injector], { cwd: root, stdio: "inherit" });

const reviewInjector = path.join(root, "scripts/inject-trendyol-reviews.mjs");
if (!fs.existsSync(reviewInjector)) {
  throw new Error("[ultra-bulk-profile] Trendyol review injector bulunamadı");
}
execFileSync(process.execPath, [reviewInjector], { cwd: root, stdio: "inherit" });
