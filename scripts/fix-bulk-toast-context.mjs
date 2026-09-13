import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scraperPath = path.join(root, "client/src/pages/scraper.tsx");
let src = fs.readFileSync(scraperPath, "utf8");

const transformedToast = `            toast({\n              title: looksLikeBan\n                ? "⛔ Doğrulanmış Trendyol engeli — çekim durduruluyor"\n                : \`❌ \${i + 1}/\${queue.length} başarısız — sıradaki ürüne geçiliyor\`,\n              description: errMsg,\n              variant: "destructive",\n              duration: 4000,\n            });`;

const baseToast = `            toast({\n              title: looksLikeBan\n                ? "⛔ Ban koruması — çekim durduruluyor"\n                : \`❌ \${i + 1}/\${queue.length} başarısız\`,\n              description: errMsg,\n              variant: "destructive",\n              duration: 4000,\n            });`;

const exactAwareToast = `            // Exact-count modunda reserve adayların elenmesi normaldir; kullanıcıya\n            // dahili aday sıra numarası (örn. 22/45) veya ham JS hatası gösterme.\n            if (looksLikeBan) {\n              toast({\n                title: "⛔ Doğrulanmış Trendyol engeli — çekim durduruluyor",\n                description: errMsg,\n                variant: "destructive",\n                duration: 6000,\n              });\n            } else if (!exactMode) {\n              const friendlyErrMsg = /(?:ReferenceError|is not defined|before initialization)/i.test(errMsg)\n                ? "Ürün işlenirken geçici bir uygulama hatası oluştu."\n                : errMsg;\n              toast({\n                title: "❌ Ürün çekilemedi — sıradaki ürüne geçiliyor",\n                description: \`\${labelFromProductUrl(url)} · \${friendlyErrMsg}\`,\n                variant: "destructive",\n                duration: 4000,\n              });\n            }`;

const genericToast = `            if (looksLikeBan) {\n              toast({\n                title: "⛔ Doğrulanmış Trendyol engeli — çekim durduruluyor",\n                description: errMsg,\n                variant: "destructive",\n                duration: 6000,\n              });\n            } else {\n              const friendlyErrMsg = /(?:ReferenceError|is not defined|before initialization)/i.test(errMsg)\n                ? "Ürün işlenirken geçici bir uygulama hatası oluştu."\n                : errMsg;\n              toast({\n                title: "❌ Ürün çekilemedi — sıradaki ürüne geçiliyor",\n                description: \`\${labelFromProductUrl(url)} · \${friendlyErrMsg}\`,\n                variant: "destructive",\n                duration: 4000,\n              });\n            }`;

if (src.includes(exactAwareToast) || src.includes(genericToast)) {
  console.log("[bulk-toast-context] already applied");
  process.exit(0);
}

const anchor = src.includes(transformedToast)
  ? transformedToast
  : src.includes(baseToast)
    ? baseToast
    : null;

if (!anchor) {
  throw new Error("[bulk-toast-context] bulk failure toast anchor bulunamadı");
}

src = src.replace(
  anchor,
  src.includes("const exactMode = Boolean(") ? exactAwareToast : genericToast,
);

fs.writeFileSync(scraperPath, src);
console.log("[bulk-toast-context] exact reserve failures hidden; user-facing errors contextualized");