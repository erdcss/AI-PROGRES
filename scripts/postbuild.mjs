import fs from "fs";
import path from "path";

const dist = path.resolve("dist");
const publicDir = path.join(dist, "public");

console.log("📦 Post-build: dist/public düzeni hazırlanıyor...");

fs.mkdirSync(publicDir, { recursive: true });

const assetsSrc = path.join(dist, "assets");
const assetsDst = path.join(publicDir, "assets");
if (fs.existsSync(assetsSrc)) {
  if (fs.existsSync(assetsDst)) fs.rmSync(assetsDst, { recursive: true, force: true });
  fs.renameSync(assetsSrc, assetsDst);
}

const indexSrc = path.join(dist, "index.html");
const indexDst = path.join(publicDir, "index.html");
if (fs.existsSync(indexSrc)) {
  fs.copyFileSync(indexSrc, indexDst);
}

console.log("✅ Post-build tamamlandı");
