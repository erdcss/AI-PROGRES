import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { loadProjectEnv, logEnvBootstrapSummary } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distIndex = path.join(root, "dist", "index.js");
const distHtml = path.join(root, "dist", "public", "index.html");
const packageJson = path.join(root, "package.json");
const buildStamp = path.join(root, "dist", ".build-stamp.json");

const SOURCE_DIRS = ["server", "shared", "client/src"];
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "__tests__"]);

function newestSourceMtime() {
  let newest = 0;
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
        try {
          newest = Math.max(newest, fs.statSync(full).mtimeMs);
        } catch {
          /* ignore */
        }
      }
    }
  }
  for (const rel of SOURCE_DIRS) {
    const dir = path.join(root, rel);
    if (fs.existsSync(dir)) walk(dir);
  }
  if (fs.existsSync(packageJson)) {
    newest = Math.max(newest, fs.statSync(packageJson).mtimeMs);
  }
  return newest;
}

function distBuiltAt() {
  const artifacts = [distIndex, distHtml];
  if (artifacts.some((f) => !fs.existsSync(f))) return 0;
  return Math.max(...artifacts.map((f) => fs.statSync(f).mtimeMs));
}

function needsRebuild() {
  if (process.env.FORCE_REBUILD === "1") return true;
  if (!fs.existsSync(distIndex) || !fs.existsSync(distHtml)) return true;
  const builtAt = distBuiltAt();
  if (builtAt === 0) return true;
  if (newestSourceMtime() > builtAt) return true;
  if (fs.existsSync(buildStamp)) {
    try {
      const stamp = JSON.parse(fs.readFileSync(buildStamp, "utf8"));
      if (stamp.packageJsonMtime && stamp.packageJsonMtime < fs.statSync(packageJson).mtimeMs) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
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
    console.error("❌ Build başarısız — dev sunucusu başlatılamıyor.");
    process.exit(result.status ?? 1);
  }

  if (!fs.existsSync(distHtml)) {
    console.error("❌ Build tamamlandı ama dist/public/index.html yok.");
    process.exit(1);
  }

  try {
    fs.writeFileSync(
      buildStamp,
      JSON.stringify({
        builtAt: new Date().toISOString(),
        packageJsonMtime: fs.statSync(packageJson).mtimeMs,
      }),
    );
  } catch {
    /* non-critical */
  }
}

if (needsRebuild()) {
  runBuild();
}

loadProjectEnv();
logEnvBootstrapSummary("dev-start");

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
