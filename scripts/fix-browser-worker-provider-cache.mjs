import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function patchFile(relativePath, patches) {
  const target = path.join(root, relativePath);
  let src = fs.readFileSync(target, "utf8");
  for (const { from, to, label } of patches) {
    if (!src.includes(from)) {
      if (src.includes(to)) continue;
      throw new Error(`[browser-worker-cache-fix] ${label} uygulanamadı: ${relativePath}`);
    }
    src = src.replace(from, to);
  }
  fs.writeFileSync(target, src);
}

patchFile("server/services/scrape-provider.service.ts", [
  {
    label: "stale healthy snapshot retention",
    from: `export function getScrapeProviderSnapshot(): ScrapeProviderSnapshot {\n  if (cachedSnapshot && Date.now() - lastRefreshAt < CACHE_TTL_MS) {\n    return cachedSnapshot;\n  }\n  return defaultSnapshot();\n}`,
    to: `export function getScrapeProviderSnapshot(): ScrapeProviderSnapshot {\n  // Senkron çağrıda cache TTL doldu diye sağlıklı Browser Worker bilgisini sıfırlama.\n  // Health refresh asenkron endpoint/init akışlarında yapılır; son bilinen sağlıklı snapshot\n  // yeni refresh gelene kadar kullanılmaya devam eder. Aksi halde 60sn sonra provider zinciri\n  // browser_worker'ı sessizce kaybedip yalnız API/direct_html'a düşüyordu.\n  if (cachedSnapshot) {\n    return cachedSnapshot;\n  }\n  return defaultSnapshot();\n}`,
  },
]);

patchFile("shared/scrape-runtime.ts", [
  {
    label: "556 transient message",
    from: `  if (errors.includes("upstream-556") || errors.includes("trendyol-blocked")) {\n    return "Trendyol erişimi engelledi (Cloudflare/556/bot koruması). Kısa süre bekleyin; tekrar denemek engeli uzatabilir.";\n  }`,
    to: `  if (errors.includes("trendyol-blocked")) {\n    return "Trendyol erişimi doğrulanmış bir koruma yanıtı verdi. Sistem alternatif tarayıcı sağlayıcısıyla devam etmeyi deneyecek.";\n  }\n\n  if (errors.includes("upstream-556")) {\n    return "Trendyol API geçici olarak yanıt vermedi (HTTP 556). Bu tek başına ban değildir; Browser Worker ve diğer kaynaklar deneniyor.";\n  }`,
  },
]);

console.log("[browser-worker-cache-fix] healthy provider snapshot retained beyond TTL; HTTP 556 no longer mislabeled as ban");
