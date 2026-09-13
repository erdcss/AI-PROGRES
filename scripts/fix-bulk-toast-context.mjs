import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scraperPath = path.join(root, "client/src/pages/scraper.tsx");
let src = fs.readFileSync(scraperPath, "utf8");

const transformedToast = `            toast({\n              title: looksLikeBan\n                ? "⛔ Doğrulanmış Trendyol engeli — çekim durduruluyor"\n                : \`❌ \${i + 1}/\${queue.length} başarısız — sıradaki ürüne geçiliyor\`,\n              description: errMsg,\n              variant: "destructive",\n              duration: 4000,\n            });`;

const baseToast = `            toast({\n              title: looksLikeBan\n                ? "⛔ Ban koruması — çekim durduruluyor"\n                : \`❌ \${i + 1}/\${queue.length} başarısız\`,\n              description: errMsg,\n              variant: "destructive",\n              duration: 4000,\n            });`;

const exactAwareToast = `            // Exact-count modunda reserve adayların elenmesi normaldir; kullanıcıya\n            // dahili aday sıra numarası (örn. 22/45) veya ham JS hatası gösterme.\n            if (looksLikeBan) {\n              toast({\n                title: "⛔ Doğrulanmış Trendyol engeli — çekim durduruluyor",\n                description: errMsg,\n                variant: "destructive",\n                duration: 6000,\n              });\n            } else if (!exactMode) {\n              const friendlyErrMsg = /(?:ReferenceError|is not defined|before initialization)/i.test(errMsg)\n                ? "Ürün işlenirken geçici bir uygulama hatası oluştu."\n                : errMsg;\n              toast({\n                title: "❌ Ürün çekilemedi — sıradaki ürüne geçiliyor",\n                description: \`\${labelFromProductUrl(url)} · \${friendlyErrMsg}\`,\n                variant: "destructive",\n                duration: 4000,\n              });\n            }`;

const genericToast = `            if (looksLikeBan) {\n              toast({\n                title: "⛔ Doğrulanmış Trendyol engeli — çekim durduruluyor",\n                description: errMsg,\n                variant: "destructive",\n                duration: 6000,\n              });\n            } else {\n              const friendlyErrMsg = /(?:ReferenceError|is not defined|before initialization)/i.test(errMsg)\n                ? "Ürün işlenirken geçici bir uygulama hatası oluştu."\n                : errMsg;\n              toast({\n                title: "❌ Ürün çekilemedi — sıradaki ürüne geçiliyor",\n                description: \`\${labelFromProductUrl(url)} · \${friendlyErrMsg}\`,\n                variant: "destructive",\n                duration: 4000,\n              });\n            }`;

if (!src.includes(exactAwareToast) && !src.includes(genericToast)) {
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
}

// Exact-count aynı anda iki worker ile çalışırken son iki aday birlikte başarılı olabilir.
// Örn. hedef 20, successCount=19 iken iki worker da sonucu döndürürse eski akış 21/20
// üretebiliyordu. Hedef dolduktan sonra gelen reserve sonucu preview/başarı listesine
// hiç kabul edilmez. Kontrol + successCount++ arasında await olmadığı için bu bölüm JS
// event-loop açısından atomiktir ve exact-count hiçbir zaman hedefin üstüne çıkmaz.
const exactQualityGate = `            if (exactMode && !isExactBulkPreviewUsable(newPreview as unknown as CSVPreviewData)) {\n              throw new Error("Ürün verisi MARKT-GO için eksik/geçersiz; yedek ürün kullanılacak");\n            }`;
const exactOvershootGuard = `            if (exactMode && !isExactBulkPreviewUsable(newPreview as unknown as CSVPreviewData)) {\n              throw new Error("Ürün verisi MARKT-GO için eksik/geçersiz; yedek ürün kullanılacak");\n            }\n            // EXACT_COUNT_OVERSHOOT_GUARD: paralel worker hedef dolduktan sonra sonuç döndürürse\n            // bu aday kullanıcı listesine eklenmez ve 20/20 -> 21/20 taşması oluşmaz.\n            if (exactMode && successCount >= displayTotal) {\n              updateUrlQueueItem(url, {\n                status: "pending",\n                error: "Exact-count hedefi doldu — yedek aday kullanılmadı",\n              });\n              return;\n            }`;

if (
  src.includes("const exactMode = Boolean(") &&
  !src.includes("EXACT_COUNT_OVERSHOOT_GUARD")
) {
  if (!src.includes(exactQualityGate)) {
    throw new Error("[bulk-toast-context] exact-count quality gate bulunamadı; overshoot guard uygulanamadı");
  }
  src = src.replace(exactQualityGate, exactOvershootGuard);
}

if (
  src.includes("const exactMode = Boolean(") &&
  !src.includes("EXACT_COUNT_OVERSHOOT_GUARD")
) {
  throw new Error("[bulk-toast-context] exact-count overshoot guard doğrulanamadı");
}

fs.writeFileSync(scraperPath, src);
console.log("[bulk-toast-context] exact reserve failures hidden; user-facing errors contextualized; exact overshoot capped");
