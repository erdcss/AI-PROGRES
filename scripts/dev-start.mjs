import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distIndex = path.join(root, "dist", "index.js");
const distHtml = path.join(root, "dist", "public", "index.html");

const REBUILD_MARKERS = [
  path.join(root, "server", "index.ts"),
  path.join(root, "server", "routes.ts"),
  path.join(root, "client", "src", "pages", "scraper.tsx"),
  path.join(root, "client", "src", "components", "UrlHistory.tsx"),
  path.join(root, "client", "src", "lib", "url-history-client.ts"),
  path.join(root, "vite.config.ts"),
];

function needsRebuild() {
  if (process.env.FORCE_REBUILD === "1") return true;

  const artifacts = [distIndex, distHtml];
  if (artifacts.some((file) => !fs.existsSync(file))) {
    return true;
  }

  const builtAt = Math.max(...artifacts.map((file) => fs.statSync(file).mtimeMs));
  return REBUILD_MARKERS.some(
    (marker) => fs.existsSync(marker) && fs.statSync(marker).mtimeMs > builtAt,
  );
}

function runBuild() {
  console.log("");
  console.log("📦 Proje derleniyor (kaynak kod güncellendi veya build eksik)...");
  console.log("");

  const result = spawnSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (!fs.existsSync(distHtml)) {
    console.error("❌ Build tamamlandı ama dist/public/index.html yok.");
    process.exit(1);
  }
}

if (needsRebuild()) {
  runBuild();
}

process.env.NODE_ENV = "production";

console.log("");
console.log("========================================");
console.log("  Turmarkt — Kararlı mod");
console.log("========================================");
console.log("  Sayfa kendiliğinden yenilenmez.");
console.log("  Kod geliştirme (Vite/HMR): npm run dev:vite");
console.log("  Zorunlu yeniden derleme: FORCE_REBUILD=1 npm run dev");
console.log("========================================");
console.log("");

await import("../dist/index.js");
