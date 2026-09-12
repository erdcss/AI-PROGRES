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
    to: `export function getScrapeProviderSnapshot(): ScrapeProviderSnapshot {\n  // Senkron çağrıda cache TTL doldu diye sağlıklı Browser Worker bilgisini sıfırlama.\n  // Health refresh asenkron endpoint/init akışlarında yapılır; son bilinen snapshot\n  // yeni refresh gelene kadar kullanılmaya devam eder.\n  if (cachedSnapshot) {\n    return cachedSnapshot;\n  }\n  return defaultSnapshot();\n}`,
  },
  {
    label: "configured browser worker remains in provider chain",
    from: `    if (provider === "browser_worker") {\n      if (browserWorkerHealthy) selected.push(provider);\n      continue;\n    }`,
    to: `    if (provider === "browser_worker") {\n      // Production'da health-check anlık kaçırsa bile yapılandırılmış Worker'ı zincirden çıkarma.\n      // Gerçek scrape isteği kendi timeout/error mekanizmasıyla soft-fail olabilir.\n      if (browserWorkerConfigured && (isCloud || browserWorkerHealthy)) selected.push(provider);\n      continue;\n    }`,
  },
  {
    label: "configured browser worker fallback insertion",
    from: `  if (browserWorkerConfigured && browserWorkerHealthy && !selected.includes("browser_worker")) {\n    selected.unshift("browser_worker");\n  }`,
    to: `  if (browserWorkerConfigured && !selected.includes("browser_worker")) {\n    selected.unshift("browser_worker");\n  }`,
  },
]);

patchFile("server/services/scrape-environment.service.ts", [
  {
    label: "prefer configured browser worker in cloud",
    from: `  const preferBrowserWorker = snap.isCloudRuntime && snap.browserWorkerHealthy;`,
    to: `  // Cloud'da yapılandırılmış Worker, health-check anlık false dönse de gerçek scrape ile denenir.\n  const preferBrowserWorker = snap.isCloudRuntime && snap.browserWorkerConfigured;`,
  },
]);

patchFile("shared/scrape-runtime.ts", [
  {
    label: "556 transient message",
    from: `  if (errors.includes("upstream-556") || errors.includes("trendyol-blocked")) {\n    return "Trendyol erişimi engelledi (Cloudflare/556/bot koruması). Kısa süre bekleyin; tekrar denemek engeli uzatabilir.";\n  }`,
    to: `  if (errors.includes("trendyol-blocked")) {\n    return "Trendyol erişimi doğrulanmış bir koruma yanıtı verdi. Sistem alternatif tarayıcı sağlayıcısıyla devam etmeyi deneyecek.";\n  }\n\n  if (errors.includes("upstream-556")) {\n    return "Trendyol API geçici olarak yanıt vermedi (HTTP 556). Bu tek başına ban değildir; Browser Worker ve diğer kaynaklar deneniyor.";\n  }`,
  },
]);

console.log("[browser-worker-cache-fix] Browser Worker retained and attempted in cloud; HTTP 556 no longer mislabeled as ban");
