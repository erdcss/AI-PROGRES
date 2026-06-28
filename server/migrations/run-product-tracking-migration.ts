import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let migrationRan = false;

export async function runProductTrackingMigration(): Promise<boolean> {
  if (!pool || migrationRan) return Boolean(pool);

  const sqlPath = path.join(__dirname, "..", "..", "migrations", "0001_product_tracking_system.sql");
  if (!fs.existsSync(sqlPath)) {
    console.warn("⚠️ Product tracking migration SQL bulunamadı:", sqlPath);
    return false;
  }

  try {
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    migrationRan = true;
    console.log("✅ Product tracking migration uygulandı (idempotent)");
    return true;
  } catch (err) {
    console.error("❌ Product tracking migration hatası:", err);
    return false;
  }
}
