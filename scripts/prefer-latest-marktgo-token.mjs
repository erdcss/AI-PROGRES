import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "server/services/marktgo/connection.service.ts",
  "server/services/marktgo/trendyol-dedupe.service.ts",
];

for (const rel of targets) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, "utf8");
  const from = 'String(process.env.MARKTGO_ACCESS_TOKEN || "").trim()';
  const to = 'String(process.env.MARKTGO_SON_TOKEN || process.env.MARKTGO_ACCESS_TOKEN || "").trim()';
  if (src.includes(from)) src = src.split(from).join(to);
  if (!src.includes("process.env.MARKTGO_SON_TOKEN")) {
    throw new Error(`[marktgo-token-priority] ${rel} patch uygulanamadı`);
  }
  fs.writeFileSync(file, src);
}

console.log("[marktgo-token-priority] MARKTGO_SON_TOKEN varsa öncelikli, aksi halde MARKTGO_ACCESS_TOKEN");
