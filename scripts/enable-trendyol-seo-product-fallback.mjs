import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "server/trendyol-direct-html.ts");
let src = fs.readFileSync(target, "utf8");

const headersAnchor = `const DIRECT_HEADERS: Record<string, string>[] = [`;
if (!src.includes("const SEO_DIRECT_HEADERS")) {
  const idx = src.indexOf(headersAnchor);
  if (idx < 0) throw new Error("[seo-product-fallback] DIRECT_HEADERS bulunamadı");
  const arrayEnd = src.indexOf("\n];", idx);
  if (arrayEnd < 0) throw new Error("[seo-product-fallback] DIRECT_HEADERS sonu bulunamadı");
  const insertAt = arrayEnd + 3;
  const seo = `\n\n// Railway/datacenter IP'lerinde normal browser UA 403/556 alabiliyor.\n// Trendyol'un herkese açık SEO/preview SSR sürümü kategori keşfinde çalıştığı için\n// ürün detayında da son güvenli HTML fallback olarak kullanılır.\nconst SEO_DIRECT_HEADERS: Record<string, string>[] = [\n  {\n    \"User-Agent\": \"Google-InspectionTool/1.0\",\n    Accept: \"text/html,application/xhtml+xml\",\n    \"Accept-Language\": \"tr-TR,tr;q=0.9\",\n    \"Cache-Control\": \"no-cache\",\n    Pragma: \"no-cache\",\n  },\n  {\n    \"User-Agent\": \"Twitterbot/1.0\",\n    Accept: \"text/html,application/xhtml+xml\",\n    \"Accept-Language\": \"tr-TR,tr;q=0.9\",\n    \"Cache-Control\": \"no-cache\",\n    Pragma: \"no-cache\",\n  },\n];`;
  src = src.slice(0, insertAt) + seo + src.slice(insertAt);
}

const cloudAnchor = `    if (isCloudRuntime()) {\n      continue;\n    }`;
if (src.includes(cloudAnchor) && !src.includes("Direct HTML (seo-ssr")) {
  src = src.replace(cloudAnchor, `    if (isCloudRuntime()) {\n      // Normal browser/direct istekleri 403/556 alırsa herkese açık SEO SSR görünümünü dene.\n      for (const headers of SEO_DIRECT_HEADERS) {\n        const seo = await tryOneFetch(url, headers);\n        if (seo.ok) {\n          lastDirectHtmlBlock = null;\n          console.log(\`✅ Direct HTML (seo-ssr, \${seo.html.length} bytes)\`);\n          return { html: seo.html, source: \"seo-ssr\" };\n        }\n        if (seo.rateLimited) {\n          rateLimitedHits++;\n          break;\n        }\n      }\n      continue;\n    }`);
}

if (!src.includes("SEO_DIRECT_HEADERS") || !src.includes("Direct HTML (seo-ssr")) {
  throw new Error("[seo-product-fallback] patch uygulanamadı");
}

fs.writeFileSync(target, src);
console.log("[seo-product-fallback] Trendyol product SEO SSR fallback enabled");
