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
  "timeoutMs = 8_000,",
  "timeoutMs = 15_000,",
);
src = src.replace(
  "timeoutMs = 1_100,",
  "timeoutMs = 2_500,",
);

src = src.replaceAll(
  "Math.max(8_000, Math.min(20_000, urls.length * 35))",
  "Math.max(12_000, Math.min(45_000, urls.length * 80))",
);
src = src.replace(
  "const missingIds = await waitForQueuedProductIds(manualRow, expectedIds, 1_500);",
  "const missingIds = await waitForQueuedProductIds(manualRow, expectedIds, Math.max(12_000, Math.min(45_000, urls.length * 80)));",
);
src = src.replace(
  "const stillMissingIds = await waitForQueuedProductIds(manualRow, expectedIds, 1_500);",
  "const stillMissingIds = await waitForQueuedProductIds(manualRow, expectedIds, Math.max(12_000, Math.min(45_000, urls.length * 80)));",
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

// Manuel adet alanı sessizce 0->1 veya 999->500'e kırpılmasın. Kullanıcı 13, 43, 55
// gibi herhangi bir TAM sayı girdiğinde tam olarak o sayı hedeflenir; geçersiz değer
// çekimi başlatmaz.
if (!src.includes("function parseExactCategoryCount")) {
  const countAnchor = 'const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";';
  if (!src.includes(countAnchor)) {
    throw new Error("[trendyol-category-500] exact-count sabit anchor bulunamadı");
  }
  src = src.replace(
    countAnchor,
    `${countAnchor}\n\nfunction parseExactCategoryCount(value: string): number | null {\n  const normalized = value.trim();\n  if (!normalized) return null;\n  if (!/^\\d{1,3}$/.test(normalized)) return null;\n  const parsed = Number(normalized);\n  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 500 ? parsed : null;\n}`,
  );
}

const oldSelectedCount = `  const selectedCount = useMemo(() => {\n    const custom = Number(customCount);\n    if (customCount.trim() && Number.isFinite(custom)) {\n      return Math.max(1, Math.min(500, Math.floor(custom)));\n    }\n    return count;\n  }, [count, customCount]);`;
const exactSelectedCount = `  const selectedCount = useMemo(() => {\n    if (!customCount.trim()) return count;\n    return parseExactCategoryCount(customCount) ?? count;\n  }, [count, customCount]);`;
if (src.includes(oldSelectedCount)) {
  src = src.replace(oldSelectedCount, exactSelectedCount);
}

if (!src.includes("Manuel ürün adedi 1 ile 500 arasında tam sayı olmalı")) {
  const startAnchor = `    const targetCount = selectedCount;\n    setLoading(true);`;
  if (!src.includes(startAnchor)) {
    throw new Error("[trendyol-category-500] start exact-count anchor bulunamadı");
  }
  src = src.replace(
    startAnchor,
    `    if (customCount.trim() && parseExactCategoryCount(customCount) == null) {\n      toast({\n        title: "Geçersiz ürün adedi",\n        description: "Manuel ürün adedi 1 ile 500 arasında tam sayı olmalı. Örnek: 13, 43, 55.",\n        variant: "destructive",\n      });\n      return;\n    }\n\n    const targetCount = selectedCount;\n    setLoading(true);`,
  );

  src = src.replace(
    `    manualRow,\n    selectedCount,\n    url,`,
    `    manualRow,\n    customCount,\n    selectedCount,\n    url,`,
  );
}

src = src.replace(
  `                    onChange={(event) => setCustomCount(event.target.value)}\n                    placeholder="Özel adet yazın (örn. 75)"`,
  `                    onChange={(event) => {\n                      const next = event.target.value.replace(/\\D/g, "").slice(0, 3);\n                      setCustomCount(next);\n                    }}\n                    inputMode="numeric"\n                    step={1}\n                    placeholder="Özel adet yazın (örn. 13, 43, 55)"\n                    data-testid="input-trendyol-category-custom-count"`,
);

src = src.replace(
  '<span className="text-xs text-zinc-600">En fazla 500</span>',
  '<span className="text-xs text-zinc-600">1–500 tam sayı</span>',
);

// Sunucu tarafında da istemciye güvenme: yalnız 1..500 arası tam sayı kabul edilir.
const importRoutePath = path.join(root, "server/import-route.ts");
let importRoute = fs.readFileSync(importRoutePath, "utf8");
if (!importRoute.includes("Kategori ürün adedi 1 ile 500 arasında tam sayı olmalı")) {
  const importAnchor = `    const { discoverTrendyolCategoryProducts } = await import('./trendyol-category-discovery-v4');\n    const result = await discoverTrendyolCategoryProducts({\n      url,\n      maxProducts: Number(maxProducts) || 50,\n    });`;
  if (!importRoute.includes(importAnchor)) {
    throw new Error("[trendyol-category-500] import-route exact-count anchor bulunamadı");
  }
  importRoute = importRoute.replace(
    importAnchor,
    `    const requestedCount = maxProducts == null || maxProducts === '' ? 50 : Number(maxProducts);\n    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 500) {\n      return res.status(400).json({\n        success: false,\n        message: 'Kategori ürün adedi 1 ile 500 arasında tam sayı olmalı',\n      });\n    }\n\n    const { discoverTrendyolCategoryProducts } = await import('./trendyol-category-discovery-v4');\n    const result = await discoverTrendyolCategoryProducts({\n      url,\n      maxProducts: requestedCount,\n    });`,
  );
  fs.writeFileSync(importRoutePath, importRoute);
}

const discoveryPath = path.join(root, "server/trendyol-category-discovery-v4.ts");
let discovery = fs.readFileSync(discoveryPath, "utf8");
discovery = discovery.replace(
  "const requestedCount = Math.max(1, Math.min(500, Number(input.maxProducts) || 50));",
  "const requestedCount = Math.max(1, Math.min(500, Math.trunc(Number(input.maxProducts) || 50)));",
);
fs.writeFileSync(discoveryPath, discovery);

const required = [
  "const QUICK_COUNTS = [20, 50, 100, 250, 500];",
  "Math.max(12_000, Math.min(45_000, urls.length * 80))",
  'className="grid grid-cols-5 gap-2"',
  "elektrikli-ev-aletleri-x-c1104",
  "function parseExactCategoryCount",
  "Manuel ürün adedi 1 ile 500 arasında tam sayı olmalı",
  'placeholder="Özel adet yazın (örn. 13, 43, 55)"',
];

for (const marker of required) {
  if (!src.includes(marker)) {
    throw new Error(`[trendyol-category-500] beklenen değişiklik uygulanamadı: ${marker}`);
  }
}

fs.writeFileSync(target, src);
console.log("[trendyol-category-500] exact 1-500 aktif: 20/50/100/250/500 + manuel tam adet + kuyruk hardening");
