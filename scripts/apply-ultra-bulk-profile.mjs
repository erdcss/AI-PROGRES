import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const target = path.join(root, "client/src/pages/scraper.tsx");
let src = fs.readFileSync(target, "utf8");

// Exact-count için hızdan önce kararlılık: Trendyol'a aynı anda 5 istek göndermek ve
// MARKT-GO'ya 8 paralel ürün basmak, 20->19 ve 19->15 gibi sessiz kayıplar üretiyordu.
const replacements = [
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 2500;", "const BULK_SCRAPE_RETRY_DELAY_MS = 1200;"],
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 1200;", "const BULK_SCRAPE_RETRY_DELAY_MS = 1200;"],
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 600;", "const BULK_SCRAPE_RETRY_DELAY_MS = 1200;"],
  ["const BULK_SCRAPE_RETRY_DELAY_MS = 250;", "const BULK_SCRAPE_RETRY_DELAY_MS = 1200;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 1;", "const BULK_SCRAPE_CONCURRENCY_START = 2;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 2;", "const BULK_SCRAPE_CONCURRENCY_START = 2;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 3;", "const BULK_SCRAPE_CONCURRENCY_START = 2;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 5;", "const BULK_SCRAPE_CONCURRENCY_START = 2;"],
  ["const BULK_SCRAPE_CONCURRENCY_START = 6;", "const BULK_SCRAPE_CONCURRENCY_START = 2;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 2;", "const SHOPIFY_UPLOAD_CONCURRENCY = 2;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 3;", "const SHOPIFY_UPLOAD_CONCURRENCY = 2;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 6;", "const SHOPIFY_UPLOAD_CONCURRENCY = 2;"],
  ["const SHOPIFY_UPLOAD_CONCURRENCY = 8;", "const SHOPIFY_UPLOAD_CONCURRENCY = 2;"],
];
for (const [from, to] of replacements) {
  if (src.includes(from)) src = src.split(from).join(to);
}

// Toplu çekimde ağır direct-html/color-family hattını kritik yoldan çıkar. Tekli çekimin
// varsayılan direct-html davranışı korunur; yalnız bulk worker çağrıları auto-fast kullanır.
const scrapeClientPath = path.join(root, "client/src/lib/scrape-url-client.ts");
let scrapeClientSrc = fs.readFileSync(scrapeClientPath, "utf8");
const signatureOld = `export async function fetchScenarioScrapeResult(\n  url: string,\n  onlyExtractData = true,\n  autoTagEnabled = true,\n): Promise<ScrapedUrlPayload> {`;
const signatureNew = `export async function fetchScenarioScrapeResult(\n  url: string,\n  onlyExtractData = true,\n  autoTagEnabled = true,\n  scrapeMode: "auto-fast" | "direct-html" = "direct-html",\n): Promise<ScrapedUrlPayload> {`;
if (scrapeClientSrc.includes(signatureOld)) {
  scrapeClientSrc = scrapeClientSrc.replace(signatureOld, signatureNew);
}
if (!scrapeClientSrc.includes('scrapeMode: "auto-fast" | "direct-html" = "direct-html"')) {
  throw new Error("[exact-bulk-profile] scrape client mode parametresi uygulanamadı");
}
scrapeClientSrc = scrapeClientSrc.replace(
  '      scrapeMode: "direct-html",',
  '      scrapeMode,',
);
if (!scrapeClientSrc.includes("      scrapeMode,")) {
  throw new Error("[exact-bulk-profile] scrape request mode aktarımı uygulanamadı");
}
fs.writeFileSync(scrapeClientPath, scrapeClientSrc);

// Her URL için sınırsız/uzun tekrar yerine en fazla iki kontrollü deneme yap. Browser Worker
// timeout/556 durumunda dört tam pipeline tekrarının dakikalar sürmesini engeller.
const oldRetryBlock = `            let scraped: Awaited<ReturnType<typeof fetchScenarioScrapeResult>>;\n            try {\n              scraped = await fetchScenarioScrapeResult(url, true, autoTagEnabled);\n            } catch (firstError) {\n              if (bulkStopRequestedRef.current) throw firstError;\n              const rateLimited = looksLikeRateLimit(firstError);\n              if (rateLimited) {\n                rateLimitHits++;\n                activeConcurrency = 1;\n                const backoff = Math.max(60_000, Number((firstError as ScrapeFetchError)?.retryAfterMs) || 0);\n                const jitter = Math.floor(Math.random() * 1500);\n                globalCooldownUntil = Date.now() + backoff + jitter;\n                await waitIfCooling();\n              } else {\n                await new Promise((resolve) => setTimeout(resolve, BULK_SCRAPE_RETRY_DELAY_MS));\n              }\n              if (bulkStopRequestedRef.current) throw firstError;\n              scraped = await fetchScenarioScrapeResult(url, true, autoTagEnabled);\n            }`;

const exactRetryBlock = `            // EXACT_BULK_SCRAPE_RETRY: toplu modda en fazla iki kontrollü deneme;\n            // ilk ürün verisi auto-fast ile alınır, yorum/uzun renk-family işi bulk sonrasına bırakılır.\n            let scraped: Awaited<ReturnType<typeof fetchScenarioScrapeResult>> | null = null;\n            let lastScrapeError: unknown = null;\n            for (let attempt = 0; attempt < 2 && !scraped; attempt += 1) {\n              try {\n                scraped = await fetchScenarioScrapeResult(url, true, autoTagEnabled, "auto-fast");\n                lastScrapeError = null;\n              } catch (attemptError) {\n                lastScrapeError = attemptError;\n                if (bulkStopRequestedRef.current) throw attemptError;\n                const rateLimited = looksLikeRateLimit(attemptError);\n                if (rateLimited) {\n                  rateLimitHits++;\n                  activeConcurrency = 1;\n                  const backoff = Math.max(60_000, Number((attemptError as ScrapeFetchError)?.retryAfterMs) || 0);\n                  const jitter = Math.floor(Math.random() * 1500);\n                  globalCooldownUntil = Date.now() + backoff + jitter;\n                  await waitIfCooling();\n                } else if (attempt < 1) {\n                  await new Promise((resolve) =>\n                    setTimeout(resolve, BULK_SCRAPE_RETRY_DELAY_MS),\n                  );\n                }\n              }\n            }\n            if (!scraped) {\n              throw lastScrapeError instanceof Error\n                ? lastScrapeError\n                : new Error("Ürün 2 kontrollü denemede çekilemedi");\n            }`;

if (src.includes(oldRetryBlock)) {
  src = src.replace(oldRetryBlock, exactRetryBlock);
}

// Script daha önce uygulanmış bir kaynak üzerinde çalışırsa bulk çağrılarını yine auto-fast'a normalize et.
src = src.replaceAll(
  "fetchScenarioScrapeResult(url, true, autoTagEnabled);",
  'fetchScenarioScrapeResult(url, true, autoTagEnabled, "auto-fast");',
);

if (!src.includes("const BULK_SCRAPE_CONCURRENCY_START = 2;")) {
  throw new Error("[exact-bulk-profile] bulk scrape concurrency uygulanamadı");
}
if (!src.includes("const SHOPIFY_UPLOAD_CONCURRENCY = 2;")) {
  throw new Error("[exact-bulk-profile] upload concurrency uygulanamadı");
}
if (!src.includes("const BULK_SCRAPE_RETRY_DELAY_MS = 1200;")) {
  throw new Error("[exact-bulk-profile] retry delay uygulanamadı");
}
if (!src.includes("EXACT_BULK_SCRAPE_RETRY") && src.includes(oldRetryBlock)) {
  throw new Error("[exact-bulk-profile] iki denemeli scrape retry uygulanamadı");
}
if (!src.includes('fetchScenarioScrapeResult(url, true, autoTagEnabled, "auto-fast")')) {
  throw new Error("[exact-bulk-profile] bulk auto-fast modu uygulanamadı");
}

fs.writeFileSync(target, src);
console.log(
  "[exact-bulk-profile] scrape concurrency=2, upload concurrency=2, retry delay=1200ms, scrape attempts=2, bulk mode=auto-fast",
);

for (const [file, label] of [
  ["scripts/restore-legacy-home.mjs", "Legacy home dashboard restore"],
  ["scripts/hide-scraper-runtime-panel.mjs", "Scraper runtime/provider panel remover"],
  ["scripts/fix-trendyol-ban-and-marktgo-flow.mjs", "Trendyol ban/MARKT-GO flow fix"],
  ["scripts/enable-trendyol-seo-product-fallback.mjs", "Trendyol SEO product fallback"],
  ["scripts/fix-browser-worker-provider-cache.mjs", "Browser Worker provider cache fix"],
  ["scripts/fix-marktgo-env-token-sync.mjs", "MARKT-GO env token sync fix"],
  ["scripts/fix-marktgo-health-fallback.mjs", "MARKT-GO health fallback fix"],
  ["scripts/prefer-latest-marktgo-token.mjs", "MARKT-GO latest token priority"],
  ["scripts/enable-strict-marktgo-tracking-sync.mjs", "Strict MARKT-GO tracking/catalog sync"],
  ["scripts/add-full-tracking-scan-button.mjs", "Full tracking scan button + MARKT-GO/source audit"],
  ["scripts/enable-trendyol-category-500.mjs", "Trendyol category 500 injector"],
  ["scripts/add-trendyol-category-paste-button.mjs", "Trendyol category paste button"],
  ["scripts/inject-trendyol-reviews.mjs", "Trendyol review injector"],
  ["scripts/enable-inline-trendyol-reviews.mjs", "Inline Trendyol reviews + MARKT-GO payload"],
  ["scripts/instant-review-preview-and-full-sync.mjs", "Instant review preview + complete MARKT-GO review sync"],
  ["scripts/accelerate-reviews-and-heal-color-family.mjs", "Fast Trendyol reviews + color family healing"],
  ["scripts/enable-ultra-fast-marktgo-upload.mjs", "Product-first MARKT-GO upload"],
  ["scripts/enforce-auto-tag-toggle.mjs", "Strict automatic-tag toggle"],
  ["scripts/enable-mobile-live-scrape-jobs.mjs", "Mobile live Trendyol scrape jobs"],
  ["scripts/fix-bulk-toast-context.mjs", "Exact bulk notification context fix"],
]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`[exact-bulk-profile] ${label} bulunamadı`);
  execFileSync(process.execPath, [full], { cwd: root, stdio: "inherit" });
}
