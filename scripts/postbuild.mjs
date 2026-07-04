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
} else {
  console.error("❌ Post-build: dist/index.html bulunamadı");
  process.exit(1);
}

if (!fs.existsSync(indexDst)) {
  console.error("❌ Post-build: dist/public/index.html oluşturulamadı");
  process.exit(1);
}

// Migration SQL — Railway /app/migrations ve dist/migrations için kopyala
for (const migrationFile of [
  "0001_product_tracking_system.sql",
  "0002_control_center_import_system.sql",
]) {
  const migrationSrc = path.resolve("migrations", migrationFile);
  const migrationTargets = [
    path.join(dist, "migrations", migrationFile),
    path.join(dist, "server", "migrations", migrationFile),
  ];

  if (fs.existsSync(migrationSrc)) {
    const sql = fs.readFileSync(migrationSrc, "utf8");
    if (
      migrationFile.startsWith("0001") &&
      (!sql.includes("tracking_settings") || !sql.includes("scrape_gateway_settings"))
    ) {
      console.error(
        "❌ Post-build: migration SQL eski — tracking_settings / scrape_gateway_settings eksik!",
      );
      process.exit(1);
    }
    for (const target of migrationTargets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(migrationSrc, target);
      console.log(`✅ Migration kopyalandı: ${target}`);
    }
  } else if (migrationFile.startsWith("0001")) {
    console.warn(`⚠️ Post-build: ${migrationSrc} bulunamadı (bundled SQL fallback kullanılacak)`);
  }
}

console.log("✅ Post-build tamamlandı");
