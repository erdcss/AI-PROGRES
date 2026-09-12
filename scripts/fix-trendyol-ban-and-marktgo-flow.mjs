import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scraperPath = path.join(root, "client/src/pages/scraper.tsx");
const guardPath = path.join(root, "server/trendyol-block-guard.ts");

function replaceRequired(src, from, to, label) {
  if (!src.includes(from)) {
    throw new Error(`[ban-flow-fix] replacement missing: ${label}`);
  }
  return src.split(from).join(to);
}

let guard = fs.readFileSync(guardPath, "utf8");

guard = replaceRequired(
  guard,
  'return envInt("TRENDYOL_BLOCK_THRESHOLD", 5);',
  'return envInt("TRENDYOL_BLOCK_THRESHOLD", 8);',
  "raise default circuit threshold",
);

guard = replaceRequired(
  guard,
  'return envInt("TRENDYOL_BLOCK_COOLDOWN_MS", 600_000);',
  'return envInt("TRENDYOL_BLOCK_COOLDOWN_MS", 90_000);',
  "shorten confirmed block cooldown",
);

guard = replaceRequired(
  guard,
  '  if (["empty-document", "empty-body", "about-blank", "unknown-thin", "unknown-blocked-response"].includes(contentClass)) {\n    return { kind: "bot-challenge", source: input.source, contentClass, detail: input.errorMessage || undefined };\n  }',
  '  // Empty/thin documents can be transient Browser Worker/network responses.\n  // They are NOT enough evidence for a Trendyol ban by themselves.\n  if (["empty-document", "empty-body", "about-blank", "unknown-thin", "unknown-blocked-response"].includes(contentClass)) {\n    return null;\n  }',
  "do not classify thin documents as bans",
);

guard = replaceRequired(
  guard,
  'export function shouldSkipTrendyolBrowserScrape(now = Date.now()): boolean {\n  if (isTrendyolCircuitOpen(now)) return true;\n  const nearTrip = getBlockThreshold() - 1;\n  return state.consecutiveFails >= nearTrip;\n}',
  'export function shouldSkipTrendyolBrowserScrape(now = Date.now()): boolean {\n  // Keep Browser Worker available until a CONFIRMED circuit is actually open.\n  // Near-threshold failures can be transient and should not disable our strongest fallback.\n  return isTrendyolCircuitOpen(now);\n}',
  "keep browser worker available until confirmed circuit open",
);

fs.writeFileSync(guardPath, guard);

let scraper = fs.readFileSync(scraperPath, "utf8");

scraper = replaceRequired(
  scraper,
  '        msg.includes("çok fazla") ||\n        msg.includes("ulaşılamıyor") ||\n        msg.includes("too many")',
  '        msg.includes("çok fazla") ||\n        msg.includes("too many")',
  "network unreachable is not a rate limit",
);

scraper = replaceRequired(
  scraper,
  'const backoff = Math.max(60_000, Number((firstError as ScrapeFetchError)?.retryAfterMs) || 0);',
  'const backoff = Math.max(8_000, Number((firstError as ScrapeFetchError)?.retryAfterMs) || 0);',
  "first retry backoff",
);

scraper = replaceRequired(
  scraper,
  'const backoff = Math.max(60_000, Number((error as ScrapeFetchError)?.retryAfterMs) || 0);',
  'const backoff = Math.max(8_000, Number((error as ScrapeFetchError)?.retryAfterMs) || 0);',
  "bulk error backoff",
);

scraper = replaceRequired(
  scraper,
  '            const looksLikeBan =\n              /trendyol-circuit-open|erişimi engelledi|upstream 556|Cloudflare|ban koruması/i.test(\n                errMsg,\n              );',
  '            // Only a server-confirmed open circuit stops the whole batch.\n            // A single 556/Cloudflare/worker failure belongs to that product and the queue continues.\n            const looksLikeBan = /trendyol-circuit-open/i.test(errMsg);',
  "only confirmed circuit stops bulk queue",
);

scraper = replaceRequired(
  scraper,
  '              title: looksLikeBan\n                ? "⛔ Ban koruması — çekim durduruluyor"\n                : `❌ ${i + 1}/${queue.length} başarısız`,',
  '              title: looksLikeBan\n                ? "⛔ Doğrulanmış Trendyol engeli — çekim durduruluyor"\n                : `❌ ${i + 1}/${queue.length} başarısız — sıradaki ürüne geçiliyor`,',
  "clarify per-product failure handling",
);

scraper = replaceRequired(
  scraper,
  "            // Timeout — sunucu büyük ihtimalle başarıyla tamamladı, ağ zaman aşımına uğradı\n            console.warn('⏱️ Upload timeout — sunucu yüklemeyi tamamlamış olabilir:', preview.productTitle);\n            results.push({ success: true, title: preview.productTitle, shopifyId: 'timeout-check-shopify', warning: 'Zaman aşımı — MARKT-GO panelini kontrol edin' });",
  "            // Timeout başarı değildir. Ürünü başarısız işaretle ki kullanıcı güvenli biçimde tekrar gönderebilsin.\n            console.warn('⏱️ MARKT-GO upload timeout:', preview.productTitle);\n            results.push({ success: false, title: preview.productTitle, error: 'MARKT-GO zaman aşımı — ürün doğrulanamadı, tekrar gönderebilirsiniz' });",
  "do not report upload timeout as success",
);

scraper = replaceRequired(
  scraper,
  '      const results = [];\n      for (const preview of csvPreviews) {',
  '      const results = [];\n      const uploadQueue = csvPreviews.filter((preview) => {\n        try {\n          return resolvePreviewCsvContent(preview).trim().length > 20;\n        } catch {\n          return false;\n        }\n      });\n      if (uploadQueue.length === 0) {\n        throw new Error("MARKT-GO aktarımı için hazır ürün bulunamadı");\n      }\n      for (const preview of uploadQueue) {',
  "send only previews with usable CSV",
);

fs.writeFileSync(scraperPath, scraper);
console.log("[ban-flow-fix] false-ban detection reduced, batch continuation enabled, MARKT-GO timeout handling hardened");
