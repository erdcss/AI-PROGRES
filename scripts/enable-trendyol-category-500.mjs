import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "client/src/components/TrendyolCategoryBulkDrawer.tsx");

if (!fs.existsSync(target)) {
  throw new Error("[trendyol-category-500] category bulk component bulunamadı");
}

let src = fs.readFileSync(target, "utf8");

src = src.replace(
  "const QUICK_COUNTS = [20, 50, 100, 250];",
  "const QUICK_COUNTS = [20, 50, 100, 250, 500];",
);

src = src.replace(
  "timeoutMs = 1_500,",
  "timeoutMs = 8_000,",
);

src = src.replace(
  "const missingIds = await waitForQueuedProductIds(manualRow, expectedIds, 1_500);",
  "const missingIds = await waitForQueuedProductIds(manualRow, expectedIds, Math.max(8_000, Math.min(20_000, urls.length * 35)));",
);

src = src.replace(
  "const stillMissingIds = await waitForQueuedProductIds(manualRow, expectedIds, 1_500);",
  "const stillMissingIds = await waitForQueuedProductIds(manualRow, expectedIds, Math.max(8_000, Math.min(20_000, urls.length * 35)));",
);

src = src.replace(
  'className="grid grid-cols-4 gap-2"',
  'className="grid grid-cols-5 gap-2"',
);

src = src.replace(
  "Kategori URL'sinden istediğiniz sayıda ürün bulunur ve mevcut ürün çekme kuyruğuna eklenir.",
  "Kategori URL'sinden tek seferde 500 ürüne kadar bulunur, kuyruğa eklenir ve çekim otomatik başlatılır.",
);

src = src.replace(
  'placeholder="https://www.trendyol.com/kadin-canta-x-g1-c117"',
  'placeholder="https://www.trendyol.com/elektrikli-ev-aletleri-x-c1104"',
);

const required = [
  "const QUICK_COUNTS = [20, 50, 100, 250, 500];",
  "Math.max(8_000, Math.min(20_000, urls.length * 35))",
  'className="grid grid-cols-5 gap-2"',
  "elektrikli-ev-aletleri-x-c1104",
];

for (const marker of required) {
  if (!src.includes(marker)) {
    throw new Error(`[trendyol-category-500] beklenen değişiklik uygulanamadı: ${marker}`);
  }
}

fs.writeFileSync(target, src);
console.log("[trendyol-category-500] 500 ürün modu aktif: hızlı 500 seçimi + büyük kuyruk doğrulama süresi");
