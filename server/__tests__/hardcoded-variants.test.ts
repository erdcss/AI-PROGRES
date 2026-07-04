/**
 * Hardcoded varyant yasağı testleri
 * Çalıştır: npm run test:hardcoded-variants
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");
const SCAN_DIRS = ["server", "client", "shared"]
  .map((d) => path.join(ROOT, d))
  .filter((d) => fs.existsSync(d));

const BANNED_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "realVariants hardcoded array", pattern: /const\s+realVariants\s*=\s*\[\s*\{/ },
  {
    name: "Gri+Turuncu sabit varyant",
    pattern: /color:\s*["']Gri["'][\s\S]{0,80}color:\s*["']Turuncu["']/,
  },
  { name: "Under Armour Tişört", pattern: /Under Armour Tişört/ },
  { name: "Kigili Tişört", pattern: /Kigili Tişört/ },
  { name: "Kapsamlı varyant sistemi", pattern: /Kapsamlı varyant sistemi devreye giriyor/ },
  {
    name: "availableSizes S/M/L/XL sabit",
    pattern: /availableSizes:\s*\[\s*['"]S['"]\s*,\s*['"]M['"]\s*,\s*['"]L['"]\s*,\s*['"]XL['"]\s*\]/,
  },
];

const ALLOWED_PATH_FRAGMENTS = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}fixtures${path.sep}`,
  `${path.sep}shared${path.sep}server${path.sep}`,
  "hardcoded-variants.test.ts",
  "variant-flow.test.ts",
  "shopify-canonical-upsert.test.ts",
  "BANNED_HARDCODED_VARIANT_SIGNATURES",
  "containsBannedHardcodedVariants",
];

function isAllowed(filePath: string): boolean {
  return ALLOWED_PATH_FRAGMENTS.some((frag) => filePath.includes(frag));
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

let failed = 0;
const violations: string[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (isAllowed(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const { name, pattern } of BANNED_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${name} → ${path.relative(ROOT, file)}`);
        failed++;
      }
    }
  }
}

console.log("\n=== Hardcoded Variants Scan ===\n");
if (violations.length === 0) {
  console.log("  ✓ Canlı dosyalarda yasaklı hardcoded varyant bulunamadı");
} else {
  for (const v of violations) console.error(`  ✗ ${v}`);
}

console.log(`\n=== Sonuç: ${failed} ihlal ===\n`);
if (failed > 0) process.exit(1);
