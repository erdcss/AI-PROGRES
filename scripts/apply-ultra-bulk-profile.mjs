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
for (const [from, to] of replacements) if (src.includes(from)) src = src.split(from).join(to);
if (!src.includes("const BULK_SCRAPE_CONCURRENCY_START = 1;")) throw new Error("[ultra-bulk-profile] bulk scrape concurrency uygulanamadı");
if (!src.includes("const SHOPIFY_UPLOAD_CONCURRENCY = 3;")) throw new Error("[ultra-bulk-profile] upload concurrency uygulanamadı");
if (!src.includes("const BULK_SCRAPE_RETRY_DELAY_MS = 1200;")) throw new Error("[ultra-bulk-profile] retry delay uygulanamadı");
fs.writeFileSync(target, src);
console.log("[ultra-bulk-profile] paced bulk scrape concurrency=1, upload concurrency=3, retry delay=1200ms");

for (const [file, label] of [
  ["scripts/restore-legacy-home.mjs", "Legacy home dashboard restore"],
  ["scripts/hide-scraper-runtime-panel.mjs", "Scraper runtime/provider panel remover"],
  ["scripts/fix-trendyol-ban-and-marktgo-flow.mjs", "Trendyol ban/MARKT-GO flow fix"],
  ["scripts/enable-trendyol-seo-product-fallback.mjs", "Trendyol SEO product fallback"],
  ["scripts/fix-browser-worker-provider-cache.mjs", "Browser Worker provider cache fix"],
  ["scripts/fix-marktgo-env-token-sync.mjs", "MARKT-GO env token sync fix"],
  ["scripts/fix-marktgo-health-fallback.mjs", "MARKT-GO health fallback fix"],
  ["scripts/prefer-latest-marktgo-token.mjs", "MARKT-GO latest token priority"],
  ["scripts/enable-trendyol-category-500.mjs", "Trendyol category 500 injector"],
  ["scripts/inject-trendyol-reviews.mjs", "Trendyol review injector"],
  ["scripts/enable-inline-trendyol-reviews.mjs", "Inline Trendyol reviews + MARKT-GO payload"],
  ["scripts/instant-review-preview-and-full-sync.mjs", "Instant review preview + complete MARKT-GO review sync"],
  ["scripts/enable-ultra-fast-marktgo-upload.mjs", "Ultra fast MARKT-GO product-first upload"],
]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`[ultra-bulk-profile] ${label} bulunamadı`);
  execFileSync(process.execPath, [full], { cwd: root, stdio: "inherit" });
}
